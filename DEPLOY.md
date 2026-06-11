# Deploying landscape

Two Cloud Run services on a **personal** Google account, kept isolated from the
work account via a dedicated gcloud *configuration*.

- `landscape-api` — Bun server (port 8080)
- `landscape-web` — React build served by nginx (port 8080)

Set these once at the top of `deploy.sh`:

```bash
CONFIG="landscape"
PROJECT="landscape-499116"
ACCOUNT="jmoyers14@gmail.com"
REGION="us-central1"
```

(Already filled in for you.)

## One-time setup

### 1. Create an isolated gcloud configuration for the personal account

Your work setup (`default` config → `jeremy@trovatrip.com` → `trova-mobile-api`)
stays completely untouched.

```bash
# Create + switch to a new profile for personal work
gcloud config configurations create landscape

# Log the personal account in (opens a browser). Adds credentials without
# disturbing the work account.
gcloud auth login jmoyers14@gmail.com

# Pin this profile to the personal account + project + region
gcloud config set account jmoyers14@gmail.com
gcloud config set project landscape-499116
gcloud config set run/region us-central1
```

### 2. Switching accounts day-to-day

You never "log out / log in" — you activate a profile:

```bash
gcloud config configurations activate landscape   # personal
gcloud config configurations activate default      # work
gcloud config configurations list                  # see all + which is active
```

`deploy.sh` activates `landscape` itself and **aborts if the active account or
project isn't your personal target**, so a wrong-account deploy is impossible.

### 3. Enable the required APIs (once, on the personal project)

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  --project landscape-499116
```

The Artifact Registry repo (`landscape`) and docker auth are created
automatically by `deploy.sh` on first run.

## Deploy

```bash
cd /Users/jeremymoyers/Code/landscape
./deploy.sh
```

The script: validates Clerk config → builds + pushes the API image → deploys the
API (with the Clerk secret injected) → builds the web image with `VITE_API_URL`
and the Clerk publishable key baked in → deploys web → updates the API's
`WEB_URL` so CORS allows the real web origin. It prints both public URLs at the
end — share the web URL for feedback.

## Clerk configuration

`deploy.sh` reads its Clerk values from your local `.env` files (the same source
of truth as local dev), so there's nothing extra to pass:

- **Publishable key** (`pk_…`, public — baked into the web bundle): read from
  `packages/web/.env` `VITE_CLERK_PUBLISHABLE_KEY`, passed as a Docker build-arg.
- **Secret key** (`sk_…`, sensitive — injected at runtime): stored in **GCP
  Secret Manager** as `clerk-secret-key`. On first deploy the script enables the
  Secret Manager API, creates the secret from `packages/api/.env`'s
  `CLERK_SECRET_KEY`, and grants the Cloud Run service account read access — all
  idempotent.

**Rotating the secret key** (after creating a new key in Clerk):

```bash
printf '%s' 'sk_live_new_value' | \
  gcloud secrets versions add clerk-secret-key --data-file=- --project landscape-499116
# then redeploy (or: gcloud run services update landscape-api --region us-central1 \
#   --set-secrets CLERK_SECRET_KEY=clerk-secret-key:latest)
```

> Docker prints a `SecretsUsedInArgOrEnv` warning for `VITE_CLERK_PUBLISHABLE_KEY`
> — a false positive. Publishable keys are client-side by design; only the secret
> key is kept out of the image (in Secret Manager).

## Redeploying after changes

Just run `./deploy.sh` again. To deploy only one service, comment out the other
service's block, or run the relevant `docker build`/`gcloud run deploy` lines.

## Notes

- **Database:** none yet. When you add one, store its URL in Secret Manager and
  add `--set-secrets DATABASE_URL=database-url:latest` to the API deploy + update
  commands — same pattern as `clerk-secret-key`.
- **amd64 builds on Apple Silicon** run under emulation (`--platform
  linux/amd64`) — slower but required, since Cloud Run runs amd64.
- **Cost:** Cloud Run scales to zero; idle services cost ~nothing and fit the
  free tier for light feedback traffic.
```
