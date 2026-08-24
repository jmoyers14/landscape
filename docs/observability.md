# Observability: Logging & Errors

This doc captures the plan for operational logging and error reporting. The app
runs on **GCP Cloud Run**, which automatically captures anything written to
stdout/stderr into **Cloud Logging** and groups stack traces in **Error
Reporting** — at effectively no cost. The goal here is to actually *use* that
pipeline well, rather than adopt a paid vendor.

> Status: **implemented (2026-07-29).** The pino logger, tRPC error logging,
> global handlers, request/job-scoped children, and the `console.*` swap are all
> done — see the checklist at the bottom. Rescoped since this was written: the
> logger lives in **`packages/platform`** (shared `Logger` port + pino impl), not
> `packages/api`, and covers **both** the api and the worker. Frontend Sentry
> remains the one open "maybe later".

## Terminology

Observability is usually split into three "pillars": **logs** (timestamped
event stream — "what happened, in order"), **metrics** (numeric time-series —
"how is the system doing"), and **traces** (one request across services).
**Error tracking** is a fourth, narrower thing layered on top: grouped,
de-duped exceptions with stack traces.

We care about **logs** first, plus enough **error logging** that Cloud Run's
Error Reporting has something to group.

## Why this is a priority — errors are currently swallowed

The tRPC base procedure in `packages/api/src/trpc.ts` catches errors, maps
`ServiceError` → `TRPCError`, and re-throws everything else **without logging
it**:

```ts
const baseProcedure = t.procedure.use(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ServiceError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    throw error; // ← re-thrown to the client, but NEVER logged
  }
});
```

There's also no `onError` handler on the tRPC server and no
`uncaughtException` / `unhandledRejection` handlers. So when something breaks,
GCP genuinely has nothing to show — which is the main reason logs feel "missing"
when debugging. The logs mostly don't exist yet.

## Current state (as of this writing)

Very minimal — effectively a clean slate:

- **No logger abstraction.** ~9 raw `console.log` / `console.error` calls, all
  in the backend (`packages/api/src/index.ts`, `seed/seed.ts`,
  `services/ConfigService/ConfigServiceImpl.ts`) — almost all
  startup/shutdown/seed.
- **No request logging**, no structured JSON, no severity fields, no trace
  correlation.
- **Frontend logs nothing.**
- PostHog is wired up but it's **product analytics, not operational logging** —
  different concern, keep separate.

## Decision: pino, GCP-formatted

Use **[pino](https://getpino.io)** in `packages/api` rather than a hand-rolled
logger. It's the de-facto Bun/Node standard: fast, gives log levels and
per-request **child loggers** for free (ideal for attaching
`requestId` / `orgId` / `userId`), and needs only a small amount of config to
emit GCP-friendly fields.

The key formatting bit — map pino's `level` to GCP's `severity` and use
`message` as the message key so Cloud Logging parses it natively:

```ts
import pino from "pino";

export const logger = pino({
  messageKey: "message",
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
});

// per-request child logger:
const log = logger.child({ requestId, orgId, userId });
log.error({ path, code }, "trpc error");
```

Structured JSON to stdout fixes the three things that make Cloud Logging
painful today: correct **severity** (no stdout/stderr guessing), no **multi-line
fragmentation** of stack traces, and **field-based search**
(`jsonPayload.orgId = "…"`). Add the `logging.googleapis.com/trace` field from
the `X-Cloud-Trace-Context` header so all logs for one request correlate.

## The plan (priority order)

1. **Structured pino logger** in `packages/api` that emits GCP-shaped JSON
   (`severity`, `message`, trace field) to stdout. One shared module.
2. **tRPC error logging** — log every error in the base procedure (and add an
   `onError` on the server) with `path`, `code`, and request context **before**
   mapping to `TRPCError`. Highest-value change.
3. **Global handlers** for `uncaughtException` / `unhandledRejection` so crashes
   leave a trace.
4. **Request-scoped child logger** carried on the tRPC `Context` (set in
   `createContext.ts`) with `requestId` / `orgId` / `userId`, so a request's
   logs correlate in the Logs Explorer.
5. **Swap existing `console.*` calls** to the logger and add a few well-placed
   logs (request start/finish, notable service events).

## Using Cloud Logging (operator notes)

A reliable starting query in the Logs Explorer for the API service:

```
resource.type = "cloud_run_revision"
resource.labels.service_name = "YOUR_SERVICE_NAME"
```

- Widen the **time range** (defaults narrow).
- Clear the **severity** dropdown if logs seem missing.
- Click a field in a log line → "Show matching entries" to build filters.
- Save the good query as a **Saved Query**.

Cloud Run caveats worth knowing: logs are scraped asynchronously, so
fire-and-forget work after the response (or right before scale-to-zero) can be
cut off; and per-instance log throughput is rate-limited, so very bursty logging
gets silently dropped. Keep logs structured and reasonably sparse.

## Maybe later

- **Sentry free tier for the React frontend** — the one gap GCP doesn't cover
  well is client-side crashes with source-mapped stack traces. Cheap/free at our
  scale; revisit when frontend error visibility matters.
- A dedicated log vendor (Better Stack / Axiom) only if Cloud Logging's search
  or cost becomes a real pain. Not now.

## Status

- [x] 1 — Structured pino logger (GCP-shaped JSON) in **`packages/platform`**, as
  a `Logger` port (contract barrel) + server-only pino impl, so pino never
  reaches the web bundle. `severity`/`message` mapping, `err` serializer, level
  from `LOG_LEVEL`. Registered under `LOGGER_TOKEN`.
- [x] 2 — Error logging via the tRPC server **`onError`** (single place):
  `INTERNAL_SERVER_ERROR` → `error` with the cause's stack; handled domain codes
  → `warn` so Error Reporting isn't flooded by 4xxs.
- [x] 3 — Global `uncaughtException` / `unhandledRejection` handlers in both
  entrypoints (api + worker).
- [x] 4 — Request-scoped child on the api `Context` (`requestId`/`orgId`/`userId`
  + trace id), **and** a job-scoped child in the worker's `runJob`
  (`jobType`/`source`/`sourceEventId`) logging the job lifecycle.
- [x] 5 — Swapped every backend `console.*` (api + worker + platform) to the
  logger; the only one left is the seed CLI's usage/help line.
- [ ] (later) Sentry free tier for the React frontend.
- [ ] (later) Full Cloud Trace correlation — emit
  `logging.googleapis.com/trace: projects/<id>/traces/<traceId>` (needs the
  project id on the api); today the raw trace id is attached as a plain field.
