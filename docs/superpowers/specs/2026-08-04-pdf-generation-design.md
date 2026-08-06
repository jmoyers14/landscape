# PDF Generation — Design

**Status:** designed, ready to plan. 2026-08-04.

Two client- and supplier-facing documents, generated asynchronously:

1. **Estimate PDF** — a clean, professional bid the contractor sends a customer.
   Covers the "Estimate Export" item in [`docs/go-live-todo.md`](../../go-live-todo.md).
2. **Parts order PDF** — a materials list the contractor sends a supplier.

The bulk of this document is about the *pipeline*, not the layout: the job spine
that runs the work, where the rendering code lives, and how the bytes get from
the worker to the browser.

## Decisions

| Question | Decision |
|---|---|
| Sync or async? | **Async**, with in-app status. Durable artifact, free retries, and the path emailing will need. |
| Render engine | **`@react-pdf/renderer`** — no browser, small image, automatic pagination. |
| Storage | **GCS + signed download URL.** Bytes never pass through the API. |
| Job spine | **One generic `jobs` collection**, `(jobType, dedupKey)`. `webhookjobs` folds into it. |
| Regeneration | **Content-keyed** on estimate version *and* pricing-formula version — an unchanged estimate never re-renders. |
| Parts order | **Derived view** of the estimate's material lines. No new entity. |
| Estimate PDF detail | **Grouped summary, no unit prices.** One row per assembly. |
| Business identity | **New `CompanyProfile` entity** with logo upload. |

## Dependency: per-assembly totals

This design consumes `EstimateView.assemblyTotals` from
[`2026-08-04-per-assembly-overhead-profit-design.md`](./2026-08-04-per-assembly-overhead-profit-design.md),
which is designed but not yet built. **That work should land first.**

It is not merely convenient. Because overhead (a margin gross-up on materials)
and profit are both linear in their bases, per-assembly totals sum to the job
total *exactly*. The grouped summary therefore reads finished numbers straight
off the engine — no proportional allocation, no largest-remainder rounding
reconciliation, and no possibility of the PDF's column disagreeing with the
screen.

If the PDF work somehow has to start first, it needs its own rollup, and that
rollup must be the one later deleted — not left behind to drift against the
engine's.

## The money rules

Three properties of the buildup shape the document, and getting any of them
wrong produces a PDF that contradicts the app.

**1. There is no "Tax" line.** Sales tax is computed per material line,
pre-markup, and folded into direct cost (`calc.ts:76-80`). A
subtotal → tax → total presentation would double-count. The document shows
assembly rows → **Total**, with a footnote: *"Prices include applicable sales
tax."*

**2. Group rows are assembly totals, read directly.** One row per assembly,
labelled from `estimate.assemblies`, ordered as the estimate orders them —
mirroring the spreadsheet's Package tab and the editor's existing block
structure. Lines with a null `sourceAssemblyId` get their own row so every line
lands in exactly one group.

**3. Group by `sourceAssemblyId`, never by `LineItem.phase`.** The `phase` field
holds the assembly *name* (`generate.ts:65`), so grouping on it silently merges
two instances of the same assembly and breaks on rename. The per-assembly design
calls this out as a trap; it is repeated here because the PDF is exactly the kind
of read-only consumer that would fall into it.

## Pipeline

```
web                 api                        Cloud Tasks         worker
 │                   │                              │                 │
 ├─ requestPdf ─────►│                              │                 │
 │                   ├─ load estimate (org-scoped)  │                 │
 │                   ├─ dedupKey                    │                 │
 │                   ├─ jobs.enqueuePending() ◄── $setOnInsert        │
 │                   │                              │                 │
 │                   ├─ already succeeded? ──► return signed URL now  │
 │                   │                              │                 │
 │                   ├─ else enqueue ──────────────►├─ POST /tasks/renderEstimatePdf
 │◄─ {jobId,pending} │                              │                 │
 │                   │                              │                 ├─ assemble document
 ├─ poll status ────►│                              │                 ├─ render PDF
 │                   ├─ read job row                │                 ├─ put to GCS
 │◄─ {ready, url} ───┤◄── result.storageKey ────────┼─────────────────┤─ markSucceeded(result)
```

The valuable property: a second click on an unedited estimate is one Mongo read
and a signed URL. No render, no queue hop.

### The dedup key

```
estimate:{estimateId}:{updatedAtMillis}:{PRICING_FORMULA_VERSION}
```

The version millis alone is **not sufficient**, and this is a real trap. Totals
are not stored — `computeEstimate` recomputes them from snapshotted inputs on
every read, so a deploy that changes the buildup reprices every existing
estimate without touching `updatedAt`. Keyed on `updatedAt` alone, the cached PDF
would silently disagree with the screen after such a deploy. (The per-assembly
overhead change is precisely this kind of deploy: it moves Irrigation from
$6,462.96 to $4,601.56 on an untouched document.)

`PRICING_FORMULA_VERSION` is a hand-bumped constant beside `priceLines`, raised
whenever the buildup changes. Bumping it invalidates every cached PDF at once.

Freezing totals on send is a separate feature with its own data model — open
question #1 in [`docs/open-questions.md`](../../open-questions.md) — and this
design does not pre-empt it.

## Job spine

Today's spine is webhook-shaped: `JobRunner` finds a `WebhookJob` by
`(source, sourceEventId, jobType)` and hands the handler a `WebhookEvent`
(`worker/src/jobs/runJob.ts`). A render job has no webhook event.

**One generic `jobs` collection** replaces `webhookjobs`:

| Field | Notes |
|---|---|
| `jobType`, `dedupKey` | unique index on `(jobType, dedupKey)` |
| `orgId` | nullable — `syncUser` genuinely has no org |
| `payload` | Mixed; zod-validated at the handler boundary |
| `result` | Mixed; `{storageKey, byteSize}` on success — what the download link reads |
| `status`, `attempts`, `lastError` | unchanged lifecycle |

Plus the existing `{status, updatedAt}` operational index.

`Mixed` payloads are not a compromise here — `seedOrg.ts:11` already validates
its payload with zod before touching it. Typing job payloads at the handler
boundary is established practice in this repo.

Nullable `orgId` means tenant-scoped reads are protected by repository method
signatures rather than by the schema. That is the same discipline `Estimate`,
`Client`, `Project`, and `Material` already run on. The repository exposes
`findForOrg(orgId, jobType, dedupKey)` to the API layer and no unscoped
find-by-id.

### The generic runner

`JobRunner` is extracted to run over a port:

```ts
interface JobStore {
  findForTask(taskBody: unknown): Promise<JobRecord | null>;
  markRunning(id: string): Promise<JobRecord | null>;
  markSucceeded(id: string, result?: unknown): Promise<JobRecord | null>;
  markFailed(id: string, error: string): Promise<JobRecord | null>;
}
```

It keeps today's retry contract **verbatim**, because those semantics are the
thing most worth protecting from duplication:

- **200** — done with; do not retry. Success *and* every poison outcome
  (malformed payload, unknown job type, missing row, already succeeded).
- **500** — a handler threw. Transient; the queue retries per policy.
- `attempts` incremented *before* the work, so it reflects reality if the
  instance dies mid-run.
- Job-scoped child logger.

The registry becomes the single table binding `jobType → handler`, so
`/tasks/:jobType` is unchanged — no route changes, no `TaskRequest` change, no
queue-target churn.

**Cost to the shipped webhook path:** `SyncUserHandler` and `SeedOrgHandler`
change signature to receive the job record and load their own `WebhookEvent`
(they are handed it today). Roughly 30 lines across two handlers. `WebhookEvent`
and the ingest path are untouched. There is no production data, so folding
`webhookjobs` into `jobs` is a code change, not a migration.

### Cloud Tasks dedup and manual retry

Cloud Tasks dedups by task name. A task named for the dedup key alone would make
a manual retry of a *failed* job a silent no-op. Task name is therefore:

```
{jobType}:{dedupKey}:{attempts}
```

so a retry is genuinely a new task while an accidental double-click is not.

## Where the code lives

Following the `SeedService` precedent — logic both API and worker need lives in
`platform`; transport-specific pieces live in the consumer.

| Location | Contents | Depends on |
|---|---|---|
| `platform/src/documents/types.ts` | `EstimateDocument`, `PartsOrderDocument` — plain data | nothing |
| `platform/src/documents/DocumentAssemblyService` | Org-scoped load of estimate + project + client + company profile, `computeEstimate`, logo fetch. **The real logic.** | repositories, domain engine |
| `worker/src/documents/templates/*.tsx` | react-pdf components — layout only | `@react-pdf/renderer` |
| `worker/src/documents/render.ts` | `render(doc) → Uint8Array` | templates |
| `worker/src/jobs/handlers/renderEstimatePdf.ts` | assemble → render → put → return `{storageKey, byteSize}` | the above |

`@react-pdf/renderer` lands in the **worker's** `package.json` only; the API
image never pulls it.

Templates hold no arithmetic. Every number arrives pre-computed and pre-rounded,
so a template cannot disagree with the estimate.

### PartsOrderDocument

Derived from the estimate's `type: "material"` lines, grouped by
`(description, unit, unitPrice)` with quantities summed.

It shows **cost, not marked-up price** — correct for a supplier, and correct by
construction: a material line's `unitPrice` *is* catalog cost, since markup only
ever happens in aggregate. Delivery is a separately noted total rather than
folded into unit prices. Subtotal is pre-tax; the supplier charges their own.

There is no supplier on `Material` and no `materialId` on a line item, so
per-supplier splitting is out of scope. The renderer takes a plain
`PartsOrderDocument`, so a real `PartsOrder` entity can feed it later without
touching the rendering or job code.

### Risk: `@react-pdf/renderer` under Bun

It pulls in yoga (wasm) and fontkit — known-good under Node, **unverified under
Bun**. This is the **first task in the implementation plan**: a throwaway spike
rendering a two-page table with a repeating header and a "Page 1 of 3" footer,
before any job-spine work is built on top of it.

If it fails, the fallback is `pdfmake` — pure JS, no wasm, real table support —
which consumes the same view models. The document shapes and the whole pipeline
are unaffected either way. That is why the templates hold no logic.

## Storage

New integration slice `platform/src/integrations/storage/`, following the
`TaskQueue` pattern:

```ts
interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;              // logo fetch during render
  signedDownloadUrl(key: string, filename: string): Promise<string>;
  signedUploadUrl(key: string, contentType: string): Promise<string>;
}
```

`GcsObjectStorage` for deployed environments. `LocalObjectStorage` writes under
`.local-storage/` and serves via a local route — same shape as `InlineTaskQueue`,
including refusing to run outside `local`.

```
orgs/{orgId}/estimates/{estimateId}/{versionMillis}-f{formulaVersion}/estimate.pdf
orgs/{orgId}/estimates/{estimateId}/{versionMillis}-f{formulaVersion}/parts-order.pdf
orgs/{orgId}/branding/logo-{uuid}.{png|jpg}
```

**The object path carries the same two components as the dedup key, and must.**
Keyed on `versionMillis` alone, a formula-version bump would write new numbers
over the object that the *old* succeeded job row still points at — so that row
would hand out a URL to a PDF whose figures it never produced. Sharing both
components makes a job row and its object inseparable.

No lifecycle deletion in v1: artifacts are ~100KB and "what we sent the client"
is worth keeping.

Signed download URLs are minted on read with a 15-minute TTL, never stored.

### The IAM footgun

Cloud Run service accounts have no private key, so `getSignedUrl` must sign
through the IAM SignBlob API. That requires `iamcredentials.googleapis.com`
enabled and `roles/iam.serviceAccountTokenCreator` granted to the API's service
account **on itself**.

If that proves painful, the escape hatch is an authenticated API route that
pipes the object, needing no signing at all. The `ObjectStorage` port makes that
a one-file change.

## CompanyProfile

New model: `orgId` (unique), `businessName`, `address`, `phone`, `email`,
`licenseNumber`, `logoStorageKey`, `logoContentType`.

Created by the **existing `seedOrg` job** on `organization.created`, pre-filled
with the Clerk org name — no new trigger, and every org has a row from day one.

### Logo upload

Avoids piping binaries through tRPC:

1. `company.requestLogoUpload({ contentType })` — whitelists png/jpeg, returns a
   5-minute signed PUT URL and the key.
2. Browser PUTs straight to GCS.
3. `company.confirmLogo({ key })` — reads object metadata; if missing, wrong
   type, or over 2MB, deletes it and rejects. Otherwise sets `logoStorageKey`
   and deletes the previous logo.

The confirm step exists because a signed PUT URL can pin content-type but
**cannot enforce size**, so that check has to happen after the fact.

A profile with no logo or an empty `businessName` still renders. A client-facing
document should not fail over missing branding.

## API surface

```
documents.requestEstimatePdf({ estimateId })    → { jobId, status, url? }
documents.requestPartsOrderPdf({ estimateId })  → { jobId, status, url? }
documents.status({ jobId })                     → { status, url?, error? }
company.get / company.update / company.requestLogoUpload / company.confirmLogo
```

`DocumentJobService` holds the logic: org-scoped estimate load (a cross-org id is
`NotFound`), dedup key, `jobs.enqueuePending()`, then the **short-circuit** — if
the row is already `succeeded`, mint the URL and return it without touching the
queue. Otherwise enqueue.

**Web:** mutation → poll `documents.status` at 1.5s via react-query
`refetchInterval` while pending/running, stop on terminal. Give up at ~60s with a
retry affordance. `lastError` is never rendered raw — the UI shows a generic
failure message, since stored error text can carry internals.

## Error handling

| Case | Treatment |
|---|---|
| Estimate deleted / not this org | Poison → `markFailed` + **200**. Retrying cannot help. |
| Render throws | `markFailed` + **500** → queue retries per policy. |
| GCS put fails | Transient → **500**. Safe: same key, idempotent overwrite. |
| Missing company profile / logo | Not an error. Render with what exists. |

## Testing

- **`DocumentAssemblyService`** — fixtures from `platform/src/test-support`, never
  seed data. Assembly rows sum exactly to `totals.total`; null-`sourceAssemblyId`
  lines get their own row; no tax line emitted; parts-order roll-up merges
  identical materials.
- **Renderer** — render a fixture, assert PDF magic bytes, extract the text layer
  and assert the total, group labels, and page count. *Not* byte snapshots:
  embedded fonts and timestamps make those brittle.
- **Generic `JobRunner`** — port every semantic in today's `runJob.test.ts`, plus
  `result` persisted on success.
- **`renderEstimatePdf` handler** — against a fake `ObjectStorage`.
- **`DocumentJobService`** — dedup short-circuit returns a URL without
  enqueueing; cross-org id rejected; formula-version bump invalidates the cache.

## Infra (`deploy.sh`)

- Bucket `landscape-documents-{env}` — uniform access, no public access.
- Queue `document-render-queue`.
- Worker SA → `roles/storage.objectAdmin` on the bucket.
- API SA → `roles/storage.objectViewer`, plus
  `roles/iam.serviceAccountTokenCreator` on itself; enable
  `iamcredentials.googleapis.com`.
- New `storageConfig.ts` slice, per the existing per-slice config convention.

## Blast radius

| File | Change |
|---|---|
| `platform/src/data-access/models/Job.ts` | new; replaces `WebhookJob.ts` |
| `platform/src/data-access/repositories/JobRepository/` | new; replaces `WebhookJobRepository/` |
| `platform/src/data-access/models/CompanyProfile.ts` + repository | new |
| `platform/src/integrations/storage/` | new slice |
| `platform/src/documents/` | new slice |
| `platform/src/seed/SeedServiceImpl.ts` | seed a `CompanyProfile` |
| `worker/src/jobs/runJob.ts` | generalized over `JobStore` |
| `worker/src/jobs/handlers/{syncUser,seedOrg}.ts` | load their own event (~30 lines) |
| `worker/src/jobs/handlers/render*.ts` | new |
| `worker/src/documents/` | new |
| `api/src/services/DocumentJobService/`, `CompanyProfileService/` | new |
| `api/src/routers/{documents,company}.ts` | new |
| `web` | download button + status polling; company profile settings screen |
| `deploy.sh` | bucket, queue, IAM |

## Not doing

- **A `PartsOrder` entity** — editable quantities, PO numbers, supplier splits,
  delivery dates. Derived view first; the renderer's input shape is already the
  seam an entity would plug into.
- **Per-supplier parts orders** — needs a supplier on `Material` and a
  `materialId` on generated line items. Neither exists.
- **Emailing the PDF to a client** — the artifact and the job spine are the
  prerequisites; delivery is its own feature with its own provider decision
  (Email delivery is still TBD in `docs/go-live-todo.md`).
- **Full line-item detail on the client PDF** — summary only. A detail toggle
  would become part of the dedup key.
- **A lifecycle/retention policy on the bucket** — revisit when volume justifies
  it.
- **Freezing totals on send** — open question #1, its own data model.
