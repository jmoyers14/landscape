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

# ── API ──────────────────────────────────────────────────────────────────────
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
  --set-env-vars WEB_URL="${WEB_URL:-https://placeholder.example.com}"

API_URL=$(gcloud run services describe "$API_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "API deployed at: $API_URL"

# ── Web ──────────────────────────────────────────────────────────────────────
echo "Building web image (VITE_API_URL=$API_URL)..."
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL="$API_URL" \
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

# ── Wire CORS: tell the API its real web origin ──────────────────────────────
echo "Updating API CORS (WEB_URL=$WEB_URL)..."
gcloud run services update "$API_SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars WEB_URL="$WEB_URL"

echo ""
echo "Deploy complete!"
echo "  API: $API_URL"
echo "  Web: $WEB_URL"
