#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Personal-account deploy config. These two values pin the deploy to YOUR
# personal Google account + project so it can never hit a work project.
# ─────────────────────────────────────────────────────────────────────────────
CONFIG="landscape"          # gcloud configuration holding the personal account
PROJECT="landscape-499116"  # personal GCP project ID
ACCOUNT="jmoyers14@gmail.com" # personal Google account email
REGION="us-central1"

REPO="landscape"            # Artifact Registry repository name
REGISTRY="$REGION-docker.pkg.dev/$PROJECT/$REPO"
API_SERVICE="landscape-api"
WEB_SERVICE="landscape-web"
API_IMAGE="$REGISTRY/api:latest"
WEB_IMAGE="$REGISTRY/web:latest"
CLERK_SECRET_NAME="clerk-secret-key"  # Secret Manager secret holding the Clerk sk_ key
MONGO_SECRET_NAME="mongodb-uri"       # Secret Manager secret holding the Atlas connection string

# ── Safety guard ─────────────────────────────────────────────────────────────
# Activate the personal configuration and refuse to proceed unless the active
# account + project match exactly. This is what makes mis-deploys impossible.
if [ "$PROJECT" = "REPLACE_ME" ] || [ "$ACCOUNT" = "REPLACE_ME" ]; then
  echo "ERROR: Set PROJECT and ACCOUNT at the top of deploy.sh first." >&2
  exit 1
fi

echo "Activating gcloud configuration: $CONFIG"
gcloud config configurations activate "$CONFIG" >/dev/null

ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$ACTIVE_ACCOUNT" != "$ACCOUNT" ] || [ "$ACTIVE_PROJECT" != "$PROJECT" ]; then
  echo "ERROR: Active account/project does not match the personal target." >&2
  echo "  expected: $ACCOUNT / $PROJECT" >&2
  echo "  active:   $ACTIVE_ACCOUNT / $ACTIVE_PROJECT" >&2
  echo "Run the one-time setup in DEPLOY.md, then retry." >&2
  exit 1
fi
echo "Deploying as $ACTIVE_ACCOUNT to $ACTIVE_PROJECT ($REGION)"

# Ensure docker can push to Artifact Registry, and the repo exists (idempotent)
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet >/dev/null
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" \
    --repository-format docker --location "$REGION" \
    --description "landscape images"

# ── Clerk config (validated up front, before the slow builds) ────────────────
# Publishable key (pk_) is PUBLIC — baked into the web bundle at build time.
# Source of truth is packages/web/.env, same as local dev.
CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-$(grep -E '^VITE_CLERK_PUBLISHABLE_KEY=' packages/web/.env 2>/dev/null | head -1 | cut -d= -f2-)}"
if [ -z "$CLERK_PUBLISHABLE_KEY" ]; then
  echo "ERROR: VITE_CLERK_PUBLISHABLE_KEY not set (env or packages/web/.env)." >&2
  exit 1
fi

# Sensitive values (Clerk secret key, Mongo URI) live in Secret Manager and are
# injected at runtime. Create each from packages/api/.env on first run, then
# grant the Cloud Run runtime service account read access. All idempotent.
gcloud services enable secretmanager.googleapis.com --project "$PROJECT" --quiet >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format "value(projectNumber)")
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

ensure_secret() {
  local secret_name="$1" env_var="$2"
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT" >/dev/null 2>&1; then
    echo "Creating Secret Manager secret: $secret_name"
    local value="${!env_var:-$(grep -E "^$env_var=" packages/api/.env 2>/dev/null | head -1 | cut -d= -f2-)}"
    if [ -z "$value" ]; then
      echo "ERROR: secret '$secret_name' missing and $env_var not in packages/api/.env." >&2
      exit 1
    fi
    printf '%s' "$value" | gcloud secrets create "$secret_name" \
      --project "$PROJECT" --replication-policy automatic --data-file=- >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$secret_name" \
    --project "$PROJECT" \
    --member "serviceAccount:$RUNTIME_SA" \
    --role roles/secretmanager.secretAccessor --quiet >/dev/null
}

ensure_secret "$CLERK_SECRET_NAME" CLERK_SECRET_KEY
ensure_secret "$MONGO_SECRET_NAME" MONGODB_URI

# ── API ──────────────────────────────────────────────────────────────────────
# The web URL is stable across deploys, so look it up now and hand it to the API
# from its first revision — no placeholder, no transient wrong-origin window.
# Falls back to a placeholder only on a true first deploy (no web service yet).
EXISTING_WEB_URL=$(gcloud run services describe "$WEB_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)" 2>/dev/null || true)
API_WEB_URL="${EXISTING_WEB_URL:-https://placeholder.example.com}"
echo "API will trust web origin: $API_WEB_URL"

echo "Building API image..."
docker build --platform linux/amd64 -t "$API_IMAGE" -f packages/api/Dockerfile .

echo "Pushing API image..."
docker push "$API_IMAGE"

echo "Deploying API to Cloud Run..."
gcloud run deploy "$API_SERVICE" \
  --image "$API_IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars WEB_URL="$API_WEB_URL" \
  --set-secrets CLERK_SECRET_KEY="$CLERK_SECRET_NAME:latest",MONGODB_URI="$MONGO_SECRET_NAME:latest"

API_URL=$(gcloud run services describe "$API_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "API deployed at: $API_URL"

# ── Web ──────────────────────────────────────────────────────────────────────
echo "Building web image (VITE_API_URL=$API_URL)..."
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL="$API_URL" \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY" \
  -t "$WEB_IMAGE" \
  -f packages/web/Dockerfile .

echo "Pushing web image..."
docker push "$WEB_IMAGE"

echo "Deploying web to Cloud Run..."
gcloud run deploy "$WEB_SERVICE" \
  --image "$WEB_IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated

WEB_URL=$(gcloud run services describe "$WEB_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "Web deployed at: $WEB_URL"

# ── Wire CORS only if the web origin changed (i.e. the first-ever deploy) ────
if [ "$WEB_URL" != "$API_WEB_URL" ]; then
  echo "Web origin changed; updating API CORS (WEB_URL=$WEB_URL)..."
  gcloud run services update "$API_SERVICE" \
    --project "$PROJECT" --region "$REGION" \
    --set-env-vars ENVIRONMENT=production \
    --set-env-vars WEB_URL="$WEB_URL" \
    --set-secrets CLERK_SECRET_KEY="$CLERK_SECRET_NAME:latest",MONGODB_URI="$MONGO_SECRET_NAME:latest"
else
  echo "API already trusts $WEB_URL — skipping CORS update."
fi

echo ""
echo "Deploy complete!"
echo "  API: $API_URL"
echo "  Web: $WEB_URL"
