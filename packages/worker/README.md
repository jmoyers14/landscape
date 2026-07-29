# @landscape/worker

The app's **background job-execution entrypoint** — the second backend service
alongside `@landscape/api`. It shares the whole backend (repositories,
integration adapters, config) through `@landscape/platform` and adds only
transport: it runs work off a queue, and hosts the inbound endpoints that
enqueue that work.

## Mental model

`worker` is **not** "the webhook service." It is the generic home for
asynchronous, out-of-band work. Webhook ingestion happens to be the first such
workload, but the package's identity is job execution, not webhooks —
deliberately, so a future non-webhook job needs no new package and no rename.

A new workload slots in without restructuring:

- **needs an inbound HTTP trigger** (like a webhook) → a new route + a small
  reception service under `ingest/`.
- **is a queue consumer or scheduled job** → a new handler family under
  `jobs/handlers/`, registered in `jobs/registry.ts`, with its job type added to
  `jobs/jobTypes.ts`.

The only thing that would justify a *second* worker package is a workload that
shares nothing with what's here but the platform layer. Until that exists, this
is one package. (The internal `ingest/` vs `jobs/` split already draws the seam
a future extraction would follow.)

## Layout

| Path | Role |
| --- | --- |
| `ingest/` | Inbound reception. Verify the caller, record the raw event, enqueue a job. Public-facing. |
| `jobs/` | Execution. The handler registry, the runner (`runJob.ts`), and handlers grouped by concern under `handlers/`. Queue-facing. |
| `tasks/` | The guard on the queue-callback endpoint (`/tasks/*`). |
| `routes.ts` | The HTTP surface, as a dependency-injected factory. |
| `container.ts` | Composition root — resolves `registerServerCore` + `registerWebhookCore`. |

## Routes

- `GET  /health` — Cloud Run probe.
- `POST /ingest/clerk` — Clerk's webhook sender. Signature-verified before
  anything is trusted; the source is in the path, not sniffed from headers.
- `POST /tasks/:jobType` — the queue delivering a job back. Guarded (see
  `tasks/`), then dispatched to the registered handler.

## Local development

Copy `.env.example` to `.env.local`. Locally there's no Cloud Tasks — an
in-process queue POSTs jobs straight back to `/tasks/*`, so the full path runs
on one machine. See the webhook flow in `docs/webhook.html`.
