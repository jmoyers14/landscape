# Deploying landscape

Three Cloud Run services on a **personal** Google account, kept isolated from the
work account via a dedicated gcloud *configuration*.

- `landscape-api` — Bun tRPC server (port 8080)
- `landscape-web` — React build served by nginx (port 8080)
- `landscape-worker` — Bun server for background jobs: receives Clerk webhooks on
  `/ingest/clerk` and runs queued jobs on `/tasks/*` (port 8080)

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

### 3. Enable the two base APIs (once, on the personal project)

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  --project landscape-499116
```

Everything else is enabled by `deploy.sh` on first run: it turns on the Secret
Manager, Cloud Tasks, and IAM Credentials APIs, and creates the Artifact Registry
repo (`landscape`) + docker auth automatically.

## What `deploy.sh` does — no console needed

The script drives **all** of the Google Cloud configuration through the `gcloud`
CLI. On the GCP side there's nothing to click; every step is idempotent, so
re-running is safe. In order, it:

1. Activates the `landscape` profile and refuses to proceed unless the active
   account + project match your personal target exactly.
2. Ensures docker → Artifact Registry auth and the image repo.
3. Stamps one version identity (semver + git SHA + build time) into every image.
4. Creates/updates the Secret Manager secrets from your `.env` files and grants
   the runtime service account read access.
5. Builds, pushes, and deploys **api**, **worker**, and **web** to Cloud Run,
   wiring each service's env vars and the (stable) cross-service URLs.
6. For the worker, sets up the Cloud Tasks infrastructure — see below.

It prints all three public URLs at the end, plus the Clerk webhook endpoint.

### Cloud Tasks setup (worker only)

The worker enqueues jobs to Cloud Tasks, which delivers them back to `/tasks/*`.
`deploy.sh` provisions this for you on first run (all idempotent):

- Enables the Cloud Tasks + IAM Credentials APIs.
- Creates two queues — `org-seed-queue`, `user-sync-queue` (one per job kind;
  names must match `packages/worker/src/jobs/jobTypes.ts`).
- Creates the invoker service account `cloud-tasks-invoker@…` — the identity
  Cloud Tasks stamps its OIDC callback tokens with.
- Grants three IAM roles that make authenticated callbacks work: the worker's
  runtime SA gets `cloudtasks.enqueuer` (create tasks) and `serviceAccountUser`
  on the invoker SA (stamp its identity onto a task); the Cloud Tasks service
  agent gets `serviceAccountTokenCreator` on the invoker SA (mint the token at
  delivery). That last grant is retried a few times because the service agent can
  take a moment to appear after the API is first enabled.

**Why the worker is `--allow-unauthenticated`:** Clerk's webhook sender posts to
`/ingest/clerk` with no Google credentials, so Cloud Run IAM can't gate the
service. Both endpoints are guarded **in-app** instead: the svix signature on
`/ingest/clerk`, and the Cloud Tasks OIDC token (verified against the worker URL
and the invoker SA) on `/tasks/*`.

## Deploy

```bash
cd /Users/jeremymoyers/Code/landscape
./deploy.sh
```

Cross-service URLs are stable, so the script hands each service the other URLs it
needs from the first revision. On a **first-ever** deploy a URL isn't known yet,
so it starts with a placeholder and self-corrects once the service exists (the
API's trusted web origin; the worker's own `WORKER_URL`, which is both the OIDC
audience and the callback base). Every later deploy reuses the stable URLs
directly — no placeholder window.

## Connecting Clerk webhooks (first deploy only)

There's a chicken-and-egg: the worker needs a signing secret to boot, but Clerk
only issues the real one after you register the endpoint — which needs the
deployed worker URL. So the first time:

1. **Put a placeholder** in `packages/worker/.env` (note: `.env`, not
   `.env.local` — the deploy reads `.env`):

   ```bash
   CLERK_WEBHOOK_SIGNING_SECRET=whsec_placeholder
   ```

   The worker boots and `/tasks/*` + OIDC work; `/ingest/clerk` will reject real
   webhooks until the secret is real — expected.
2. **Run `./deploy.sh`.** It prints the endpoint at the end:
   `https://<worker-url>/ingest/clerk`.
3. In the **Clerk dashboard → Webhooks**, add that URL as an endpoint and
   subscribe to the events you handle (`organization.created`, `user.created`,
   `user.updated`). Copy the **Signing Secret** (`whsec_…`) Clerk shows.
4. Paste it into `packages/worker/.env`, then **rotate the secret and redeploy**:

   ```bash
   printf '%s' 'whsec_REAL_VALUE' | \
     gcloud secrets versions add clerk-webhook-signing-secret --data-file=- \
     --project landscape-499116
   ./deploy.sh
   ```

After that, `/ingest/clerk` verifies real signatures and the full pipeline runs.

## Secrets & configuration

`deploy.sh` reads everything from your local `.env` files (the same source of
truth as local dev), so there's nothing extra to pass:

- **Clerk publishable key** (`pk_…`, public — baked into the web bundle): read
  from `packages/web/.env` `VITE_CLERK_PUBLISHABLE_KEY`, passed as a build-arg.
- **Clerk secret key** (`sk_…`, sensitive): Secret Manager secret
  `clerk-secret-key`, from `packages/api/.env` `CLERK_SECRET_KEY`.
- **Mongo Atlas URI** (sensitive): Secret Manager secret `mongodb-uri`, from
  `packages/api/.env` `MONGODB_URI`. Shared by the API and the worker.
- **Clerk webhook signing secret** (`whsec_…`, sensitive, worker only): Secret
  Manager secret `clerk-webhook-signing-secret`, from `packages/worker/.env`
  `CLERK_WEBHOOK_SIGNING_SECRET` (see the Clerk section above).

On first deploy the script enables the Secret Manager API, creates each secret
from its `.env`, and grants the Cloud Run service account read access — all
idempotent. Secrets are injected at runtime via `--set-secrets`.

**Rotating a secret** (e.g. a new Clerk key or rotated Atlas password):

```bash
printf '%s' 'NEW_VALUE' | \
  gcloud secrets versions add clerk-secret-key --data-file=- --project landscape-499116
#                              ^ or mongodb-uri, or clerk-webhook-signing-secret
# then redeploy, or update the running service directly with --set-secrets.
```

**Atlas network access:** Cloud Run egresses from dynamic IPs, so the Atlas
cluster's Network Access list must allow `0.0.0.0/0` (or use a VPC connector with
a static egress IP to lock it down later). The worker connects to the same
cluster as the API, so this covers both.

> Docker prints a `SecretsUsedInArgOrEnv` warning for `VITE_CLERK_PUBLISHABLE_KEY`
> — a false positive. Publishable keys are client-side by design; only the secret
> key, Mongo URI, and webhook signing secret are kept out of the image (in Secret
> Manager).

## Redeploying after changes

Just run `./deploy.sh` again. To deploy only one service, comment out the other
services' blocks, or run the relevant `docker build`/`gcloud run deploy` lines.

## Notes

- **Database:** MongoDB Atlas, connection string in the `mongodb-uri` secret (see
  above). The API and worker connect at startup; data is scoped per organization.
- **Background jobs:** Cloud Tasks queues (`org-seed-queue`, `user-sync-queue`)
  deliver work to the worker with automatic retries. A job's status is recorded
  in the `webhook_jobs` collection; failures stay there for inspection.
- **amd64 builds on Apple Silicon** run under emulation (`--platform
  linux/amd64`) — slower but required, since Cloud Run runs amd64.
- **Cost:** Cloud Run scales to zero; idle services cost ~nothing and fit the
  free tier for light feedback traffic.
