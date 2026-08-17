# PDF Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate two asynchronous, GCS-stored PDFs from an estimate — a client-facing Estimate PDF and a supplier-facing Parts Order PDF — behind a content-keyed job spine that never re-renders an unchanged estimate.

**Architecture:** A generic `jobs` collection (keyed `(jobType, dedupKey)`) replaces today's webhook-shaped `webhookjobs`. The API writes a pending job row, short-circuits to a signed URL if that row already succeeded, and otherwise enqueues a Cloud Task. The worker assembles a plain view-model in `platform` (org-scoped loads + `computeEstimate`), renders it with `@react-pdf/renderer` in `worker`, puts the bytes to GCS behind an `ObjectStorage` port, and records `{storageKey, byteSize}` as the job's `result`. Templates hold no arithmetic.

**Tech Stack:** Bun, tRPC, tsyringe DI, MongoDB/Mongoose, `@react-pdf/renderer` (worker only), `@google-cloud/storage`, `@google-cloud/tasks`, React 18 + TanStack Router/Query.

**Design doc:** [`docs/superpowers/specs/2026-08-04-pdf-generation-design.md`](../specs/2026-08-04-pdf-generation-design.md)

**Dependency status:** the design's prerequisite — per-assembly overhead and profit — has **landed**. `EstimateView.assemblyTotals` is live in `packages/domain/src/engine/calc.ts:176-202` and already consumed by `EstimateEditorScreen`. Task 10 reads finished numbers straight off it: no rollup of its own, no proportional allocation, no rounding reconciliation.

## Global Constraints

- **Always brace control-flow bodies** (`if`/`else`/`for`/`while`), even single statements. Biome's `style/useBlockStatements` enforces this; `bun run lint` must pass.
- **Prettier formats, Biome only lints.** Never enable Biome's formatter.
- **Conventional Commits.** Subjects start with `feat:`/`fix:`/`perf:`/`refactor:`/`docs:`/`chore:`/`test:`/`build:`/`ci:`/`style:`. Never hand-edit the root `version` or `CHANGELOG.md`.
- **Tests source fixtures from `@landscape/platform/test-support`**, never from `platform/src/seed/*`.
- **"Models" means entity DTOs.** Repositories return plain data; Mongoose types never escape a repository.
- **Group estimate lines by `sourceAssemblyId`, NEVER by `LineItem.phase`.** `phase` holds the assembly *name* (`generate.ts:65`) and merges duplicate assemblies.
- **There is no "Tax" line on any client-facing document.** Sales tax is folded into direct cost per material line, pre-markup (`calc.ts:95-97`). Documents show assembly rows → **Total**, with the footnote *"Prices include applicable sales tax."*
- **Templates hold no arithmetic.** Every number reaching a template is pre-computed and pre-rounded by `DocumentAssemblyService`.
- Run tests with `bun test <path>` from the repo root, or `bun run --cwd packages/<pkg> test` for a package.
- Typecheck everything with `bun run typecheck` from the repo root.

## Decisions this plan makes beyond the design doc

Four gaps surfaced when the design was checked against the code. Each is resolved here; none changes the design's intent.

1. **`Estimate` has no `updatedAt` on the entity.** The Mongoose schema has `timestamps: true`, but `toEstimate` (`EstimateRepositoryImpl.ts:114-127`) drops `updatedAt`. The dedup key needs it. Task 2 adds it.
2. **The API image is a `bun build` bundle and cannot carry the Cloud Tasks SDK.** `packages/worker/Dockerfile:1-6` documents the crash: gapic clients load `*_client_config.json` via runtime require, which `bun build` does not emit. The API must now enqueue tasks and sign URLs, so **Task 6 switches `packages/api/Dockerfile` to run from source**, exactly mirroring the worker's. This is the smallest change that unblocks both SDKs.
3. **`deploy.sh` runs both services as the same runtime service account** (`${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`, `deploy.sh:123`). The design's "worker SA → objectAdmin, API SA → objectViewer" split collapses to one SA. Task 17 grants that single SA `roles/storage.objectAdmin` on the bucket plus `roles/iam.serviceAccountTokenCreator` on itself.
4. **The `JobStore` port in the design is dropped as duplication.** `JobRepository` already *is* that port — the runner injects it directly. Likewise the task body carries `{ dedupKey }` only (jobType stays in the URL, as today), so `findForTask(taskBody: unknown)` becomes `findByKey(jobType, dedupKey)`.

Two smaller additions: `ObjectStorage` gains `head()` and `remove()` (the design's `confirmLogo` step needs both, and its interface listing omitted them), and `documents.status` returns no error text at all rather than an `error?` field — the UI shows a generic message, so raw `lastError` never crosses the wire.

## File Structure

**Domain (`packages/domain`)**
- `src/types/estimate.ts` — modified: `Estimate` gains `updatedAt`.
- `src/engine/calc.ts` — modified: exports `PRICING_FORMULA_VERSION` beside `priceLines`.

**Platform (`packages/platform`)**
- `src/data-access/models/Job.ts` — new; replaces `WebhookJob.ts` (deleted).
- `src/data-access/repositories/JobRepository/{types,JobRepository,JobRepositoryImpl}.ts` — new; replaces `WebhookJobRepository/` (deleted).
- `src/data-access/models/CompanyProfile.ts`, `repositories/CompanyProfileRepository/*` — new.
- `src/integrations/storage/{ObjectStorage,storageConfig,LocalObjectStorage,GcsObjectStorage}.ts` — new slice.
- `src/documents/{types,keys,errors,DocumentAssemblyService,DocumentAssemblyServiceImpl}.ts` — new slice. `DocumentAssemblyServiceImpl` holds the real logic; everything else is plain data.
- `src/test-support/{factories,repoMocks}.ts` — modified: `makeJob`, `makeCompanyProfile`, `makeJobRepoMock`, `makeCompanyProfileRepoMock`, `makeObjectStorageFake`.

**Worker (`packages/worker`)**
- `src/jobs/{JobHandler,PoisonJobError,taskKey}.ts` — new/moved; `runJob.ts`, `registry.ts`, `jobTypes.ts` modified.
- `src/jobs/handlers/{syncUser,seedOrg}.ts` — modified: load their own `WebhookEvent`.
- `src/jobs/handlers/renderDocument.ts` — new; one handler class, two registered instances.
- `src/documents/render.tsx`, `src/documents/templates/{shared,EstimatePdf,PartsOrderPdf}.tsx` — new; layout only.

**API (`packages/api`)**
- `src/services/DocumentJobService/*`, `src/services/CompanyProfileService/*` — new.
- `src/routers/{documents,company}.ts` — new.
- `src/localStorageRoute.ts` — new; serves `.local-storage/` in local dev only.
- `Dockerfile` — modified: run from source.

**Web (`packages/web`)**
- `src/components/DocumentDownloadButton.tsx` — new; owns request → poll → download for both document kinds.
- `src/screens/CompanySettingsScreen.tsx` — new.
- `src/screens/EstimateEditorScreen.tsx`, `src/screens/RootLayout.tsx`, `src/router.tsx` — modified.

**Infra**
- `deploy.sh` — bucket, queue, IAM, `DOCUMENTS_BUCKET` env on both services.

---

### Task 1: Spike — verify `@react-pdf/renderer` runs under Bun

The design names this the first task for a reason: yoga (wasm) + fontkit are known-good under Node and unverified under Bun. Everything downstream assumes the renderer works. Nothing here ships — the spike file is deleted in Task 12, which replaces it.

**Files:**
- Create: `packages/worker/src/documents/spike.tsx` (throwaway)
- Modify: `packages/worker/package.json`
- Modify: `packages/worker/tsconfig.json`
- Modify: `docs/superpowers/specs/2026-08-04-pdf-generation-design.md` (record the outcome)

**Interfaces:**
- Consumes: nothing.
- Produces: a verified answer to "react-pdf or pdfmake?", recorded in the design doc. Every later task's template code depends on it.

- [ ] **Step 1: Install the renderer into the worker only**

The API image must never pull this dependency.

```bash
bun add --cwd packages/worker @react-pdf/renderer react
bun add --cwd packages/worker --dev @types/react
```

- [ ] **Step 2: Enable JSX in the worker's tsconfig**

`packages/worker/tsconfig.json` currently has no `jsx` setting, so `.tsx` files will not typecheck.

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write the spike**

Exercises exactly the three things the real templates need and nothing else: enough rows to force pagination, a header that repeats on every page, and a "Page N of M" footer.

```tsx
// packages/worker/src/documents/spike.tsx
// THROWAWAY. Deleted in Task 12. Run: bun run packages/worker/src/documents/spike.tsx
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10 },
  row: { flexDirection: "row", borderBottom: "1pt solid #ccc", paddingVertical: 4 },
  cell: { flex: 1 },
  header: { flexDirection: "row", borderBottom: "2pt solid #000", paddingVertical: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 9 },
});

const rows = Array.from({ length: 90 }, (_, i) => ({
  description: `Line item ${i + 1}`,
  amount: (i + 1) * 12.34,
}));

const SpikeDoc = () => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header} fixed>
        <Text style={styles.cell}>Description</Text>
        <Text style={styles.cell}>Amount</Text>
      </View>
      {rows.map((row) => (
        <View key={row.description} style={styles.row} wrap={false}>
          <Text style={styles.cell}>{row.description}</Text>
          <Text style={styles.cell}>${row.amount.toFixed(2)}</Text>
        </View>
      ))}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        fixed
      />
    </Page>
  </Document>
);

const buffer = await renderToBuffer(<SpikeDoc />);
await Bun.write("/tmp/spike.pdf", buffer);
console.log(`wrote ${buffer.byteLength} bytes; magic=${buffer.subarray(0, 5).toString()}`);
```

- [ ] **Step 4: Run it**

```bash
bun run packages/worker/src/documents/spike.tsx
```

Expected: prints a byte count over 10000 and `magic=%PDF-`. If it throws on wasm instantiation or font loading, the spike has failed — go to Step 5b.

- [ ] **Step 5a: If it succeeded, confirm pagination and the repeating header**

```bash
bun -e 'const b = await Bun.file("/tmp/spike.pdf").bytes(); const s = new TextDecoder("latin1").decode(b); console.log("pages:", (s.match(/\/Type\s*\/Page[^s]/g) ?? []).length);'
```

Expected: `pages:` reports 3 or more. Open `/tmp/spike.pdf` and confirm by eye that "Description / Amount" appears at the top of every page and the footer reads "Page 1 of 3", "Page 2 of 3", …

- [ ] **Step 5b: If it failed, switch to `pdfmake` before continuing**

```bash
bun remove --cwd packages/worker @react-pdf/renderer react
bun add --cwd packages/worker pdfmake
bun add --cwd packages/worker --dev @types/pdfmake
```

`pdfmake` is pure JS with real table support and no wasm. It consumes the same view models, so only Tasks 12 and 13 change — the document shapes, the job spine, and everything else in this plan are unaffected. Rewrite the spike as a `pdfmake` document definition with `table.headerRows: 1` and a `footer: (page, pages) => ...`, re-run Steps 4 and 5a, and note the substitution in Step 6. Do not proceed until one of the two engines is proven.

- [ ] **Step 6: Record the outcome in the design doc**

Replace the "Risk: `@react-pdf/renderer` under Bun" section's closing paragraph with what actually happened. For a success:

```markdown
**Spike outcome (2026-08-10):** verified under Bun <version>. A 90-row document
paginates to 3 pages with a `fixed` header and a `render`-prop page footer.
`pdfmake` is no longer needed; the fallback stands only if a later Bun upgrade
regresses it.
```

- [ ] **Step 7: Commit**

The spike file is committed deliberately: it is the executable evidence for the decision, and Task 12 deletes it in the same commit that replaces it with real templates.

```bash
git add packages/worker/package.json packages/worker/tsconfig.json \
        packages/worker/src/documents/spike.tsx bun.lock \
        docs/superpowers/specs/2026-08-04-pdf-generation-design.md
git commit -m "chore: verify the PDF renderer works under Bun"
```

---

### Task 2: `Estimate` entity carries `updatedAt`

The dedup key is `estimate:{id}:{updatedAtMillis}:{formulaVersion}`. The Mongoose schema already stamps `updatedAt` (`Estimate.ts:65`); the mapper drops it. Nothing else can be built until the entity exposes it.

**Files:**
- Modify: `packages/domain/src/types/estimate.ts:47-58`
- Modify: `packages/platform/src/data-access/repositories/EstimateRepository/EstimateRepositoryImpl.ts:114-127`
- Modify: `packages/platform/src/test-support/factories.ts:37-49`
- Test: `packages/domain/src/engine/calc.test.ts` (fixtures only), `packages/platform/src/test-support/factories.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Estimate.updatedAt: string` (ISO 8601), populated by `EstimateRepositoryImpl.toEstimate` and defaulted by `makeEstimate`. Tasks 10 and 15 read it.

- [ ] **Step 1: Write the failing test**

Add to `packages/platform/src/test-support/factories.test.ts` (new file — the factories have no test today, and this one exists to pin the field's presence and shape):

```ts
import { describe, expect, it } from "bun:test";
import { makeEstimate } from "./factories.ts";

describe("makeEstimate", () => {
  it("carries an ISO updatedAt, since the PDF dedup key is keyed on it", () => {
    const estimate = makeEstimate();
    expect(estimate.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(estimate.updatedAt))).toBe(false);
  });

  it("lets a test pin a distinct updatedAt", () => {
    const estimate = makeEstimate({ updatedAt: "2026-02-02T00:00:00.000Z" });
    expect(Date.parse(estimate.updatedAt)).toBeGreaterThan(
      Date.parse(estimate.createdAt),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/test-support/factories.test.ts
```

Expected: FAIL — `expect(received).toBe(expected)` with `received: undefined`, plus a typecheck error that `updatedAt` does not exist on `Estimate`.

- [ ] **Step 3: Add the field to the domain type**

In `packages/domain/src/types/estimate.ts`, inside `interface Estimate`, directly after `createdAt`:

```ts
  createdAt: string;
  /**
   * Last write to the estimate. Part of the generated-document dedup key, so a
   * saved edit invalidates a cached PDF; see the PDF generation design.
   */
  updatedAt: string;
```

- [ ] **Step 4: Populate it in the mapper**

In `packages/platform/src/data-access/repositories/EstimateRepository/EstimateRepositoryImpl.ts`, in `toEstimate`:

```ts
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
```

`EstimateDoc` already declares `updatedAt: Date` (`Estimate.ts:84`), so no schema change is needed.

- [ ] **Step 5: Default it in the factory**

In `packages/platform/src/test-support/factories.ts`, in `makeEstimate`, after `createdAt: CREATED_AT,`:

```ts
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...over,
```

- [ ] **Step 6: Run the tests and the typechecker**

```bash
bun test packages/platform/src/test-support/factories.test.ts
bun run typecheck
```

Expected: PASS, and typecheck clean. If `packages/domain/src/test-support/fixture.ts` or any `calc.test.ts` fixture builds an `Estimate` literal, add `updatedAt` there too — the typechecker will name every site.

- [ ] **Step 7: Run the full suite**

```bash
bun test
```

Expected: all packages pass.

- [ ] **Step 8: Commit**

```bash
git add packages/domain packages/platform
git commit -m "feat: expose an estimate's updatedAt on the entity"
```

---

### Task 3: `PRICING_FORMULA_VERSION`

A hand-bumped constant beside `priceLines`. Totals are never stored — `computeEstimate` recomputes them on every read — so a deploy that changes the buildup reprices every existing estimate without touching `updatedAt`. Keyed on `updatedAt` alone, a cached PDF would silently disagree with the screen. Bumping this constant invalidates every cached PDF at once.

**Files:**
- Modify: `packages/domain/src/engine/calc.ts`
- Modify: `packages/domain/src/engine/index.ts`
- Test: `packages/domain/src/engine/calc.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PRICING_FORMULA_VERSION: number`, exported from `@landscape/domain`. Tasks 10 and 15 build keys from it.

- [ ] **Step 1: Write the failing test**

Append to `packages/domain/src/engine/calc.test.ts`:

```ts
describe("PRICING_FORMULA_VERSION", () => {
  it("is a positive integer that generated documents can key a cache on", () => {
    expect(Number.isInteger(PRICING_FORMULA_VERSION)).toBe(true);
    expect(PRICING_FORMULA_VERSION).toBeGreaterThan(0);
  });
});
```

Add `PRICING_FORMULA_VERSION` to that file's existing import from `./calc.ts`.

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/domain/src/engine/calc.test.ts
```

Expected: FAIL — `PRICING_FORMULA_VERSION` is not exported from `./calc.ts`.

- [ ] **Step 3: Add the constant**

In `packages/domain/src/engine/calc.ts`, immediately above `export function priceLines`:

```ts
/**
 * Version of the cost buildup below. **Bump this whenever `priceLines` or
 * `directCostOfLine` changes the money.**
 *
 * Totals are never persisted — every read recomputes them — so a deploy that
 * changes the buildup reprices every existing estimate without touching its
 * `updatedAt`. Generated documents are cached on
 * `(estimateId, updatedAt, PRICING_FORMULA_VERSION)`; without this component a
 * cached PDF would keep serving figures the app no longer shows. Bumping it
 * invalidates every cached document at once.
 */
export const PRICING_FORMULA_VERSION = 1;
```

- [ ] **Step 4: Export it from the package barrel**

Confirm `packages/domain/src/engine/index.ts` re-exports `./calc.ts` with `export *`. If it names exports individually, add `PRICING_FORMULA_VERSION` to the list.

- [ ] **Step 5: Run the test**

```bash
bun test packages/domain/src/engine/calc.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify it is reachable from the package root**

```bash
bun -e 'import { PRICING_FORMULA_VERSION } from "./packages/domain/src/index.ts"; console.log(PRICING_FORMULA_VERSION);'
```

Expected: prints `1`.

- [ ] **Step 7: Commit**

```bash
git add packages/domain
git commit -m "feat: version the pricing formula for document cache keys"
```

---

### Task 4: The generic `jobs` collection

`webhookjobs` folds into one generic `jobs` collection keyed `(jobType, dedupKey)`. There is no production data, so this is a code change, not a migration. This task lands the model, the repository, and the test doubles; Task 5 moves the runner onto them.

**Files:**
- Create: `packages/platform/src/data-access/models/Job.ts`
- Create: `packages/platform/src/data-access/repositories/JobRepository/{types.ts,JobRepository.ts,JobRepositoryImpl.ts}`
- Delete: `packages/platform/src/data-access/models/WebhookJob.ts`, `packages/platform/src/data-access/repositories/WebhookJobRepository/`
- Modify: `packages/platform/src/data-access/tokens.ts`, `src/index.ts`, `src/registerServerCore.ts`
- Modify: `packages/platform/src/test-support/{factories.ts,repoMocks.ts}`
- Test: `packages/platform/src/data-access/repositories/JobRepository/JobRepositoryImpl.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `JobStatus = "pending" | "running" | "succeeded" | "failed"`
  - `Job { id, jobType, dedupKey, orgId: string | null, payload: unknown, result: unknown, status, attempts, lastError: string | null, createdAt, updatedAt }`
  - `JobInput = Pick<Job, "jobType" | "dedupKey" | "orgId" | "payload">`
  - `JobRepository { enqueuePending(input): Promise<Job>; markRunning(id): Promise<Job | null>; markSucceeded(id, result?): Promise<Job | null>; markFailed(id, error): Promise<Job | null>; findByKey(jobType, dedupKey): Promise<Job | null>; findForOrg(orgId, id): Promise<Job | null>; findByStatus(status, limit): Promise<Job[]> }`
  - `JOB_REPOSITORY_TOKEN = "JobRepository"`
  - `makeJob(over?): Job`, `makeJobRepoMock(over?): JobRepository`

- [ ] **Step 1: Write the failing test**

`JobRepositoryImpl` needs a live Mongo, which no repository test in this repo uses. Test the two properties that are pure and load-bearing instead — the mapper and the `$setOnInsert` contract — against a stubbed model. Create `packages/platform/src/data-access/repositories/JobRepository/JobRepositoryImpl.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { toJob } from "./JobRepositoryImpl.ts";

const doc = {
  _id: "job_1",
  jobType: "renderEstimatePdf",
  dedupKey: "estimate:e1:1700000000000:1",
  orgId: "org_1",
  payload: { estimateId: "e1" },
  result: null,
  status: "pending",
  attempts: 0,
  lastError: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("toJob", () => {
  it("maps a document to a plain entity with ISO timestamps", () => {
    expect(toJob(doc as never)).toEqual({
      id: "job_1",
      jobType: "renderEstimatePdf",
      dedupKey: "estimate:e1:1700000000000:1",
      orgId: "org_1",
      payload: { estimateId: "e1" },
      result: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("normalises a missing orgId, payload, result and lastError to null", () => {
    const sparse = { ...doc, orgId: undefined, payload: undefined, result: undefined, lastError: undefined };
    const job = toJob(sparse as never);
    expect(job.orgId).toBeNull();
    expect(job.payload).toBeNull();
    expect(job.result).toBeNull();
    expect(job.lastError).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/data-access/repositories/JobRepository/JobRepositoryImpl.test.ts
```

Expected: FAIL — cannot resolve `./JobRepositoryImpl.ts`.

- [ ] **Step 3: Write the model**

```ts
// packages/platform/src/data-access/models/Job.ts
import { Schema, model } from "mongoose";

/**
 * One unit of background work and the record of how it went. Generic: a webhook
 * fan-out, an org seed, and a PDF render are all rows here, distinguished by
 * `jobType`.
 *
 * Not org-scoped at the schema level — `syncUser` genuinely has no org, so
 * `orgId` is nullable. Tenant safety therefore lives in the repository's method
 * signatures (`findForOrg` takes an orgId; there is no unscoped find-by-id),
 * the same discipline Estimate, Client, Project and Material already run on.
 */
const jobSchema = new Schema(
  {
    jobType: { type: String, required: true },
    // The caller-computed content key. Its shape is per job type: a webhook job
    // uses "{source}:{sourceEventId}", a render job
    // "estimate:{id}:{updatedAtMillis}:{formulaVersion}".
    dedupKey: { type: String, required: true },
    orgId: { type: String, default: null },
    // Mixed on purpose: each handler zod-validates the shape it needs at its own
    // boundary rather than the schema constraining every job type at once.
    payload: { type: Schema.Types.Mixed, default: null },
    // What the handler returned. `{ storageKey, byteSize }` for a render job —
    // this is what a download link reads.
    result: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      required: true,
      enum: ["pending", "running", "succeeded", "failed"],
      default: "pending",
    },
    // Incremented by the worker on each run, not by the queue. Cloud Tasks sends
    // its own retry count in a header; the two disagreeing is itself a signal.
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

// The dedup key. jobType is part of it because one trigger legitimately produces
// several jobs — an estimate PDF and a parts order share a dedupKey and differ
// only by type.
jobSchema.index({ jobType: 1, dedupKey: 1 }, { unique: true });
// Operational queries: what's stuck, what failed, what needs a manual retry.
jobSchema.index({ status: 1, updatedAt: -1 });

export const JobModel = model("Job", jobSchema);
```

- [ ] **Step 4: Write the entity types**

```ts
// packages/platform/src/data-access/repositories/JobRepository/types.ts

/**
 * Lifecycle of a job. `failed` means the last attempt failed — the queue may
 * still retry it, at which point it goes back to `running`. Only `succeeded` is
 * terminal.
 */
export type JobStatus = "pending" | "running" | "succeeded" | "failed";

/** One unit of background work, plus its execution record. Plain data. */
export interface Job {
  id: string;
  /** What to run. Maps to a registered handler and to `/tasks/{jobType}`. */
  jobType: string;
  /** Content key — (jobType, dedupKey) is unique. Shape is per job type. */
  dedupKey: string;
  /** Null for jobs with no tenant (syncUser). Never trusted for authorization. */
  orgId: string | null;
  /** Handler input. Validated at the handler boundary, not by the schema. */
  payload: unknown;
  /** Handler output, recorded on success. `{ storageKey, byteSize }` for renders. */
  result: unknown;
  status: JobStatus;
  /** How many times the worker has started this job. */
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields supplied when a job is first enqueued. Status/attempts/lastError/result
 * are owned by the execution path, not the caller, so they aren't accepted here.
 */
export type JobInput = Pick<Job, "jobType" | "dedupKey" | "orgId" | "payload">;
```

- [ ] **Step 5: Write the port**

```ts
// packages/platform/src/data-access/repositories/JobRepository/JobRepository.ts
import type { Job, JobInput, JobStatus } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for background jobs.
 *
 * Write methods are split by lifecycle transition rather than exposing a general
 * `update`, so the set of legal state changes is visible here and the execution
 * path can't invent a new one.
 *
 * Reads are split by caller instead: `findByKey` is the worker's (it addresses a
 * job by the key the task carries, and the worker has no request tenant), while
 * `findForOrg` is the API's — org-scoped by signature. There is deliberately no
 * unscoped find-by-id, because that is what a cross-tenant status poll would use.
 */
export interface JobRepository {
  /**
   * Registers a job as pending, or returns the existing one untouched. Uses
   * $setOnInsert on (jobType, dedupKey), so a redelivery — or a second click on
   * an unchanged estimate — can NOT reset an already-succeeded job back to
   * pending. That is the single most important property of this table: it is
   * what makes a cached PDF a one-read short-circuit rather than a re-render.
   */
  enqueuePending(input: JobInput): Promise<Job>;
  /** Marks a job as started and increments its attempt count. */
  markRunning(id: string): Promise<Job | null>;
  markSucceeded(id: string, result?: unknown): Promise<Job | null>;
  markFailed(id: string, error: string): Promise<Job | null>;
  findByKey(jobType: string, dedupKey: string): Promise<Job | null>;
  /** Tenant-scoped read for the API's status poll. */
  findForOrg(orgId: string, id: string): Promise<Job | null>;
  /** Operational read: what's stuck or broken. Backs alerting and manual retry. */
  findByStatus(status: JobStatus, limit: number): Promise<Job[]>;
}
```

- [ ] **Step 6: Write the implementation**

```ts
// packages/platform/src/data-access/repositories/JobRepository/JobRepositoryImpl.ts
import { injectable } from "tsyringe";
import { JobModel } from "../../models/Job.ts";
import type { Job, JobInput, JobRepository, JobStatus } from "./JobRepository.ts";

type JobDoc = {
  _id: unknown;
  jobType: string;
  dedupKey: string;
  orgId: string | null;
  payload: unknown;
  result: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed JobRepository. Documents are mapped to the plain Job entity so
 * Mongoose types never escape.
 */
@injectable()
export class JobRepositoryImpl implements JobRepository {
  async enqueuePending(input: JobInput): Promise<Job> {
    // $setOnInsert only. A repeat request must find its existing job exactly as
    // it left it — resetting a succeeded job to pending would re-run the work,
    // which is the failure mode this whole table prevents.
    const doc = await JobModel.findOneAndUpdate(
      { jobType: input.jobType, dedupKey: input.dedupKey },
      {
        $setOnInsert: {
          orgId: input.orgId,
          payload: input.payload,
          result: null,
          status: "pending",
          attempts: 0,
          lastError: null,
        },
      },
      { upsert: true, returnDocument: "after" },
    ).lean<JobDoc>();

    return toJob(doc);
  }

  async markRunning(id: string): Promise<Job | null> {
    const doc = await JobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: "running" }, $inc: { attempts: 1 } },
      { returnDocument: "after" },
    ).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async markSucceeded(id: string, result?: unknown): Promise<Job | null> {
    const doc = await JobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: "succeeded", lastError: null, result: result ?? null } },
      { returnDocument: "after" },
    ).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async markFailed(id: string, error: string): Promise<Job | null> {
    const doc = await JobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: "failed", lastError: error } },
      { returnDocument: "after" },
    ).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async findByKey(jobType: string, dedupKey: string): Promise<Job | null> {
    const doc = await JobModel.findOne({ jobType, dedupKey }).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async findForOrg(orgId: string, id: string): Promise<Job | null> {
    const doc = await JobModel.findOne({ _id: id, orgId }).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async findByStatus(status: JobStatus, limit: number): Promise<Job[]> {
    const docs = await JobModel.find({ status })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<JobDoc[]>();
    return docs.map(toJob);
  }
}

/** Exported for the mapper test; not part of the port. */
export function toJob(doc: JobDoc): Job {
  return {
    id: String(doc._id),
    jobType: doc.jobType,
    dedupKey: doc.dedupKey,
    orgId: doc.orgId ?? null,
    payload: doc.payload ?? null,
    result: doc.result ?? null,
    status: doc.status as JobStatus,
    attempts: doc.attempts,
    lastError: doc.lastError ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 7: Run the test**

```bash
bun test packages/platform/src/data-access/repositories/JobRepository/JobRepositoryImpl.test.ts
```

Expected: PASS.

- [ ] **Step 8: Swap the token, the barrel and the DI registration**

In `packages/platform/src/data-access/tokens.ts`, replace the `WEBHOOK_JOB_REPOSITORY_TOKEN` line with:

```ts
export const JOB_REPOSITORY_TOKEN = "JobRepository";
```

In `packages/platform/src/index.ts`, replace the `WebhookJobRepository` export line with:

```ts
export * from "./data-access/repositories/JobRepository/JobRepository.ts";
```

In `packages/platform/src/registerServerCore.ts`, replace the `WEBHOOK_JOB_REPOSITORY_TOKEN` import and its `registerSingleton` with `JOB_REPOSITORY_TOKEN` / `JobRepositoryImpl`, importing from `./data-access/repositories/JobRepository/JobRepositoryImpl.ts`.

- [ ] **Step 9: Add the test doubles**

In `packages/platform/src/test-support/factories.ts`, import `Job` from the new repository and add:

```ts
export const makeJob = (over: Partial<Job> = {}): Job => ({
  id: "job_1",
  jobType: "renderEstimatePdf",
  dedupKey: "estimate:estimate_1:1767225600000:1",
  orgId: "org_1",
  payload: null,
  result: null,
  status: "pending",
  attempts: 0,
  lastError: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...over,
});
```

In `packages/platform/src/test-support/repoMocks.ts`, import `JobRepository` and add:

```ts
export const makeJobRepoMock = (
  over: Partial<JobRepository> = {},
): JobRepository => ({
  enqueuePending: mock(async () => {
    throw new Error("not stubbed: JobRepository.enqueuePending");
  }),
  markRunning: mock(async () => null),
  markSucceeded: mock(async () => null),
  markFailed: mock(async () => null),
  findByKey: mock(async () => null),
  findForOrg: mock(async () => null),
  findByStatus: mock(async () => []),
  ...over,
});
```

- [ ] **Step 10: Delete the old model and repository**

```bash
git rm packages/platform/src/data-access/models/WebhookJob.ts
git rm -r packages/platform/src/data-access/repositories/WebhookJobRepository
```

- [ ] **Step 11: Verify nothing still references the old names**

```bash
grep -rn "WebhookJob\|WEBHOOK_JOB_REPOSITORY_TOKEN" packages --include=*.ts --include=*.tsx
```

Expected: only hits in `packages/worker/` — `runJob.ts`, `runJob.test.ts` and `ingest/handler.ts`, which Task 5 rewrites. Platform must be clean.

- [ ] **Step 12: Typecheck platform**

```bash
bun run --cwd packages/platform typecheck && bun run --cwd packages/platform test
```

Expected: clean and green. (`bun run typecheck` at the root still fails on the worker — that is Task 5's job.)

- [ ] **Step 13: Commit**

```bash
git add packages/platform
git commit -m "refactor: replace webhook jobs with a generic jobs collection"
```

---

### Task 5: Generalize the job runner

`JobRunner` today finds a `WebhookJob` by `(source, sourceEventId, jobType)` and hands the handler a `WebhookEvent` (`runJob.ts:83-96`). A render job has no webhook event. This task moves the runner onto `JobRepository`, hands handlers their own job record, and keeps today's retry contract **verbatim** — those semantics are the thing most worth protecting.

The worker is broken between Tasks 4 and 5; this task closes it.

**Files:**
- Create: `packages/worker/src/jobs/JobHandler.ts`, `packages/worker/src/jobs/PoisonJobError.ts`, `packages/worker/src/jobs/taskKey.ts`
- Delete: `packages/worker/src/jobs/WebhookHandler.ts`, `packages/worker/src/ingest/taskKey.ts`
- Modify: `packages/worker/src/jobs/runJob.ts`, `registry.ts`, `handlers/syncUser.ts`, `handlers/seedOrg.ts`, `src/ingest/handler.ts`
- Test: `packages/worker/src/jobs/runJob.test.ts` (rewritten), `handlers/syncUser.test.ts`, `handlers/seedOrg.test.ts`

**Interfaces:**
- Consumes: `Job`, `JobRepository`, `JOB_REPOSITORY_TOKEN` (Task 4).
- Produces:
  - `JobHandler { handle(job: Job): Promise<unknown> }`
  - `PoisonJobError` — thrown by a handler for a permanently unrunnable job; the runner marks it failed and returns **200**.
  - `taskBodySchema` (zod, `{ dedupKey: string }`) and `taskName(jobType, dedupKey, attempts): string`
  - `JobHandlerRegistry.get(jobType): JobHandler | null`

- [ ] **Step 1: Write the failing test**

Rewrite `packages/worker/src/jobs/runJob.test.ts` wholesale. Every semantic from the current file is carried over, plus two new ones (`result` persisted on success, and `PoisonJobError` → 200):

```ts
import { describe, expect, it } from "bun:test";
import type { Job, JobRepository, JobStatus, Logger } from "@landscape/platform";
import { makeJob } from "@landscape/platform/test-support";
import { JobRunner } from "./runJob.ts";
import type { JobHandlerRegistry } from "./registry.ts";
import type { JobHandler } from "./JobHandler.ts";
import { PoisonJobError } from "./PoisonJobError.ts";

// The runner logs; these tests assert behaviour, not log output, so swallow it.
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
};

const JOB_TYPE = "syncUser";
const DEDUP_KEY = "clerk:msg_1";

/** Records the lifecycle transitions the runner drives, for assertion. */
class FakeJobRepository implements JobRepository {
  public calls: string[] = [];
  public lastResult: unknown = undefined;
  constructor(private job: Job | null) {}

  async enqueuePending(): Promise<Job> {
    throw new Error("not used by the runner");
  }
  async findByKey() {
    return this.job;
  }
  async findForOrg() {
    return this.job;
  }
  async markRunning(id: string) {
    this.calls.push(`markRunning:${id}`);
    if (this.job) {
      this.job = { ...this.job, status: "running", attempts: this.job.attempts + 1 };
    }
    return this.job;
  }
  async markSucceeded(id: string, result?: unknown) {
    this.calls.push(`markSucceeded:${id}`);
    this.lastResult = result;
    return this.job;
  }
  async markFailed(id: string, error: string) {
    this.calls.push(`markFailed:${id}:${error}`);
    return this.job;
  }
  async findByStatus(_status: JobStatus) {
    return [];
  }
}

const registryWith = (handler: JobHandler | null): JobHandlerRegistry =>
  ({ get: () => handler }) as unknown as JobHandlerRegistry;

const okHandler: JobHandler = { handle: async () => undefined };
const resultHandler: JobHandler = {
  handle: async () => ({ storageKey: "orgs/org_1/x.pdf", byteSize: 1024 }),
};
const throwingHandler: JobHandler = {
  handle: async () => {
    throw new Error("boom");
  },
};
const poisonHandler: JobHandler = {
  handle: async () => {
    throw new PoisonJobError("estimate not found");
  },
};

const taskRequest = (body: unknown): Request =>
  new Request(`http://worker.local/tasks/${JOB_TYPE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validBody = { dedupKey: DEDUP_KEY };
const pendingJob = (over: Partial<Job> = {}): Job =>
  makeJob({ jobType: JOB_TYPE, dedupKey: DEDUP_KEY, ...over });

describe("JobRunner", () => {
  it("runs the handler and marks the job succeeded (200)", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual(["markRunning:job_1", "markSucceeded:job_1"]);
  });

  it("persists the handler's return value as the job result", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(resultHandler), noopLogger);

    await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(jobs.lastResult).toEqual({
      storageKey: "orgs/org_1/x.pdf",
      byteSize: 1024,
    });
  });

  it("marks failed and returns 500 (retry) when the handler throws", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(throwingHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(500);
    expect(jobs.calls).toEqual(["markRunning:job_1", "markFailed:job_1:boom"]);
  });

  it("acks (200) without retrying when the handler throws PoisonJobError", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(poisonHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([
      "markRunning:job_1",
      "markFailed:job_1:estimate not found",
    ]);
  });

  it("acks an already-succeeded job without re-running it (200)", async () => {
    const jobs = new FakeJobRepository(pendingJob({ status: "succeeded", attempts: 1 }));
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "already-succeeded" });
    expect(jobs.calls).toEqual([]); // never touched
  });

  it("acks a malformed task payload as poison (200), touching no job", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest({ nonsense: true }));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([]);
  });

  it("acks poison (200) and records failure when no handler is registered", async () => {
    const jobs = new FakeJobRepository(pendingJob());
    const runner = new JobRunner(jobs, registryWith(null), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([
      `markFailed:job_1:no handler registered for ${JOB_TYPE}`,
    ]);
  });

  it("acks (200) when the job row can't be found", async () => {
    const jobs = new FakeJobRepository(null);
    const runner = new JobRunner(jobs, registryWith(okHandler), noopLogger);

    const result = await runner.run(JOB_TYPE, taskRequest(validBody));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/worker/src/jobs/runJob.test.ts
```

Expected: FAIL — cannot resolve `./JobHandler.ts` and `./PoisonJobError.ts`.

- [ ] **Step 3: Write the handler contract and the poison marker**

```ts
// packages/worker/src/jobs/JobHandler.ts
import type { Job } from "@landscape/platform";

/**
 * A unit of background work. One handler per job type.
 *
 * The contract is deliberately thin — take the job record, do the work, and
 * signal the outcome by returning or throwing:
 *  - **return** ⇒ succeeded. Whatever is returned is persisted as the job's
 *    `result` (a render returns `{ storageKey, byteSize }`; a webhook handler
 *    returns nothing).
 *  - **throw** ⇒ failed, and the queue retries per its policy.
 *  - **throw PoisonJobError** ⇒ failed permanently. Recorded, then acked.
 *
 * Handlers MUST be idempotent: the queue guarantees at-least-once delivery, so
 * running twice must converge on the same result. `job.payload` is `unknown` on
 * purpose — a handler validates the shape it needs before trusting it.
 */
export interface JobHandler {
  handle(job: Job): Promise<unknown>;
}
```

```ts
// packages/worker/src/jobs/PoisonJobError.ts

/**
 * A job that can never succeed however many times it runs — a deleted estimate,
 * a payload that doesn't parse, a tenant mismatch.
 *
 * The distinction matters because the runner can't otherwise tell a transient
 * failure from a permanent one inside a catch, and defaults to "transient" (500,
 * retry). Throwing this says: record the reason and ack (200). Burning the
 * queue's attempts on work that cannot succeed just delays the failure showing up.
 */
export class PoisonJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoisonJobError";
  }
}
```

- [ ] **Step 4: Move and rewrite the task key**

Delete `packages/worker/src/ingest/taskKey.ts` and create `packages/worker/src/jobs/taskKey.ts` — it is no longer webhook-specific:

```ts
// packages/worker/src/jobs/taskKey.ts
import { z } from "zod";

/**
 * What a queued task carries: just enough to find its job row again. The task is
 * self-describing by content key rather than by Mongo id, so nothing about the
 * database leaks into the queue.
 *
 * jobType is NOT in the body — it's in the callback URL (`/tasks/{jobType}`),
 * which is what selects the handler. Keeping it out means the two can't disagree.
 */
export const taskBodySchema = z.object({ dedupKey: z.string().min(1) });

export type TaskBody = z.infer<typeof taskBodySchema>;

/**
 * The Cloud Tasks task name — the queue-level dedup key.
 *
 * `attempts` is in the name deliberately. Named for `(jobType, dedupKey)` alone,
 * a manual retry of a *failed* job would be silently refused as a duplicate,
 * because Cloud Tasks keeps a name reserved after completion. Including the
 * attempt count makes a retry genuinely a new task while an accidental
 * double-click (same attempts) is still refused. Cloud Tasks names allow only
 * `[A-Za-z0-9_-]`, so anything else is replaced.
 */
export function taskName(
  jobType: string,
  dedupKey: string,
  attempts: number,
): string {
  return `${jobType}:${dedupKey}:${attempts}`.replace(/[^A-Za-z0-9_-]/g, "_");
}
```

- [ ] **Step 5: Rewrite the runner**

Replace the body of `packages/worker/src/jobs/runJob.ts` below its doc comment. Keep the existing class doc comment verbatim — the retry contract it describes is unchanged — and add the PoisonJobError clause to it.

```ts
import { inject, injectable } from "tsyringe";
import {
  JOB_REPOSITORY_TOKEN,
  LOGGER_TOKEN,
  type JobRepository,
  type Logger,
} from "@landscape/platform";
import { JobHandlerRegistry } from "./registry.ts";
import { PoisonJobError } from "./PoisonJobError.ts";
import { taskBodySchema } from "./taskKey.ts";

/** An HTTP outcome for the route to return to Cloud Tasks. */
export interface JobResult {
  status: number;
  body: unknown;
}

/**
 * Runs one queued job when Cloud Tasks calls `/tasks/{jobType}` back.
 *
 * The return status IS the retry contract, because Cloud Tasks retries on any
 * non-2xx until the queue's max-attempts:
 *  - **200** — done with, do not retry. Covers success AND every permanent
 *    ("poison") outcome: malformed payload, unknown job type, missing rows,
 *    already-succeeded, and a handler that threw PoisonJobError. Retrying those
 *    can never help, so we ack and record the reason in the job row instead of
 *    burning attempts.
 *  - **500** — a handler threw anything else. Treated as transient: mark failed,
 *    let the queue retry per policy. A genuinely permanent handler error simply
 *    exhausts the queue's attempts and stays `failed` for manual inspection.
 *
 * Idempotency backstop: a job already `succeeded` is acked without re-running,
 * which covers the case where the queue's task-name dedup window has lapsed and
 * a late redelivery gets through.
 */
@injectable()
export class JobRunner {
  constructor(
    @inject(JOB_REPOSITORY_TOKEN)
    private readonly jobs: JobRepository,
    private readonly registry: JobHandlerRegistry,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {}

  async run(jobType: string, request: Request): Promise<JobResult> {
    const parsed = taskBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      // Nothing addressable — can't even find the job. Poison: ack and drop.
      this.logger.warn({ jobType }, "task with malformed payload; acking");
      return { status: 200, body: { error: "malformed task payload" } };
    }
    const { dedupKey } = parsed.data;

    // Job-scoped logger: every line for this job carries its identity so a job's
    // whole lifecycle correlates in Cloud Logging.
    const log = this.logger.child({ jobType, dedupKey });

    const job = await this.jobs.findByKey(jobType, dedupKey);
    if (!job) {
      // The pending row is written before the task is enqueued, so this
      // shouldn't happen. Ack rather than retry forever against a row that isn't
      // coming; the absence is logged for investigation.
      log.error("no job row for task; acking");
      return { status: 200, body: { error: "job not found" } };
    }

    if (job.status === "succeeded") {
      log.info("job already succeeded; acking redelivery");
      return { status: 200, body: { status: "already-succeeded" } };
    }

    const handler = this.registry.get(jobType);
    if (!handler) {
      log.error("no handler registered for job type; marking failed");
      await this.jobs.markFailed(job.id, `no handler registered for ${jobType}`);
      return { status: 200, body: { error: `unknown job type ${jobType}` } };
    }

    // Count the run before doing the work, so `attempts` reflects reality even
    // if the handler hangs or the instance dies mid-run.
    const running = await this.jobs.markRunning(job.id);
    const attempt = running?.attempts ?? job.attempts + 1;

    try {
      const result = await handler.handle(running ?? job);
      await this.jobs.markSucceeded(job.id, result);
      log.info({ attempt }, "job succeeded");
      return { status: 200, body: { status: "succeeded", jobType } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobs.markFailed(job.id, message);
      if (error instanceof PoisonJobError) {
        // Permanent by construction. Recorded, then acked — a retry cannot help.
        log.error({ err: error, attempt }, "job is poison; acking");
        return { status: 200, body: { error: message } };
      }
      // 500 → Cloud Tasks retries per the queue's policy.
      log.error({ err: error, attempt }, "job failed; will retry");
      return { status: 500, body: { error: message } };
    }
  }
}

/** Reads the request body as JSON, yielding null on an empty or invalid body. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run the runner test**

```bash
bun test packages/worker/src/jobs/runJob.test.ts
```

Expected: PASS, all nine cases. (The registry still exports `WebhookHandlerRegistry`; the test imports `JobHandlerRegistry`, which Step 7 renames.)

- [ ] **Step 7: Rename the registry**

In `packages/worker/src/jobs/registry.ts`, rename the class `WebhookHandlerRegistry` → `JobHandlerRegistry`, change the imported type from `WebhookHandler` to `JobHandler`, and update the doc comment's first line to "Looks up the handler for a job type." The registered map stays exactly as it is; Task 14 adds the two render entries.

- [ ] **Step 8: Make the webhook handlers load their own event**

`packages/worker/src/jobs/handlers/syncUser.ts` — change the class to implement `JobHandler`, inject `WEBHOOK_EVENT_REPOSITORY_TOKEN`, and replace `handle`:

```ts
// Every webhook-derived job stores its event pointer as the payload; the handler
// resolves the raw event itself now that the runner is job-type agnostic.
const webhookPayloadSchema = z.object({
  source: z.enum(["clerk"]),
  sourceEventId: z.string().min(1),
});

  async handle(job: Job): Promise<void> {
    const { source, sourceEventId } = webhookPayloadSchema.parse(job.payload);
    const event = await this.events.findBySourceEventId(source, sourceEventId);
    if (!event) {
      // The event is recorded before the job is enqueued, so its absence is
      // permanent, not a race worth retrying.
      throw new PoisonJobError("raw event missing");
    }

    // The verifier stored `event.data` (the user object) as the payload. A bad
    // shape throws here, which the runner turns into a failed job.
    const data = clerkUserSchema.parse(event.payload);

    await this.users.upsertByAuthId({
      authUserId: data.id,
      email: primaryEmail(data),
      firstName: data.first_name,
      lastName: data.last_name,
      imageUrl: data.image_url,
    });
  }
```

Apply the identical `webhookPayloadSchema` + event-load prologue to `handlers/seedOrg.ts`, keeping its `clerkOrgSchema.parse(event.payload)` body. Since `webhookPayloadSchema` is now used twice, put it in `packages/worker/src/jobs/handlers/webhookPayload.ts` and import it in both.

- [ ] **Step 9: Update the two handler tests**

`syncUser.test.ts` and `seedOrg.test.ts` currently call `handler.handle(event)`. Change each to build a job with `makeJob({ jobType, dedupKey: "clerk:msg_1", payload: { source: "clerk", sourceEventId: "msg_1" } })`, pass a `WebhookEventRepository` stub whose `findBySourceEventId` returns the existing test event, and call `handler.handle(job)`. Add one case per handler:

```ts
  it("throws PoisonJobError when the raw event is missing", async () => {
    const handler = new SyncUserHandler(eventsReturning(null), usersMock);
    expect(handler.handle(makeJob({ payload: { source: "clerk", sourceEventId: "msg_1" } })))
      .rejects.toThrow(PoisonJobError);
  });
```

- [ ] **Step 10: Update the ingest path**

In `packages/worker/src/ingest/handler.ts`: swap `WEBHOOK_JOB_REPOSITORY_TOKEN`/`WebhookJobRepository` for `JOB_REPOSITORY_TOKEN`/`JobRepository`, import `taskName` from `../jobs/taskKey.ts`, and replace the enqueue block:

```ts
    // The content key for a webhook-derived job. One event can fan out to
    // several job types, and (jobType, dedupKey) is unique, so they don't
    // collide.
    const dedupKey = `${SOURCE}:${sourceEventId}`;

    await this.jobs.enqueuePending({
      jobType: route.jobType,
      dedupKey,
      orgId: orgIdFrom(type, payload),
      // The handler resolves the raw event from this pointer.
      payload: { source: SOURCE, sourceEventId },
    });

    await this.queue.enqueue({
      queue: route.queue,
      jobType: route.jobType,
      name: taskName(route.jobType, dedupKey, 0),
      payload: { dedupKey },
    });
```

- [ ] **Step 11: Delete the dead file and verify no stragglers**

```bash
git rm packages/worker/src/jobs/WebhookHandler.ts
grep -rn "WebhookJob\|WebhookHandler\|WEBHOOK_JOB_REPOSITORY_TOKEN" packages --include=*.ts --include=*.tsx
```

Expected: no output.

- [ ] **Step 12: Run everything**

```bash
bun run typecheck && bun test && bun run lint
```

Expected: all clean. This is the first point since Task 4 that the whole repo builds.

- [ ] **Step 13: Commit**

```bash
git add -A packages/worker packages/platform
git commit -m "refactor: run any job type through the generic job runner"
```

---

### Task 6: The `ObjectStorage` port, local adapter, and the API image

A new integration slice following the `TaskQueue` pattern: a vendor-neutral port, a local adapter that refuses to run outside `local`, and a per-slice config module. This task also switches the API image to run from source — see "Decisions this plan makes" #2. Do that here, before the API gains any heavy SDK, so a broken image is caught by one focused change rather than blamed on a later feature.

**Files:**
- Create: `packages/platform/src/integrations/storage/{ObjectStorage.ts,storageConfig.ts,LocalObjectStorage.ts}`
- Create: `packages/api/src/localStorageRoute.ts`
- Modify: `packages/platform/src/integrations/tokens.ts`, `src/index.ts`, `src/registerServerCore.ts`
- Modify: `packages/platform/src/test-support/repoMocks.ts`
- Modify: `packages/api/src/index.ts`, `packages/api/Dockerfile`
- Test: `packages/platform/src/integrations/storage/LocalObjectStorage.test.ts`

**Interfaces:**
- Consumes: `APP_CONFIG_TOKEN` / `AppConfig` (existing).
- Produces:
  - `StoredObject { contentType: string; byteSize: number }`
  - `ObjectStorage { put(key, bytes, contentType): Promise<void>; get(key): Promise<Uint8Array>; head(key): Promise<StoredObject | null>; remove(key): Promise<void>; signedDownloadUrl(key, filename): Promise<string>; signedUploadUrl(key, contentType): Promise<string> }`
  - `OBJECT_STORAGE_TOKEN = "ObjectStorage"`
  - `StorageConfig { bucket, downloadUrlTtlSeconds, uploadUrlTtlSeconds, localRoot, localBaseUrl }`, `STORAGE_CONFIG_TOKEN`, `loadStorageConfig()`
  - `makeObjectStorageFake(over?): ObjectStorage` in test-support

- [ ] **Step 1: Write the failing test**

```ts
// packages/platform/src/integrations/storage/LocalObjectStorage.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import type { AppConfig } from "../../config/appConfig.ts";
import { LocalObjectStorage } from "./LocalObjectStorage.ts";
import type { StorageConfig } from "./storageConfig.ts";

const ROOT = "/tmp/landscape-storage-test";

const config: StorageConfig = {
  bucket: "landscape-documents-local",
  downloadUrlTtlSeconds: 900,
  uploadUrlTtlSeconds: 300,
  localRoot: ROOT,
  localBaseUrl: "http://localhost:3000",
};

const appConfig = (environment: string): AppConfig =>
  ({ environment }) as unknown as AppConfig;

const storage = (environment = "local") =>
  new LocalObjectStorage(appConfig(environment), config);

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe("LocalObjectStorage", () => {
  it("round-trips bytes through a nested key", async () => {
    const store = storage();
    const bytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"
    await store.put("orgs/org_1/estimates/e1/estimate.pdf", bytes, "application/pdf");

    expect(await store.get("orgs/org_1/estimates/e1/estimate.pdf")).toEqual(bytes);
  });

  it("reports content type and size through head", async () => {
    const store = storage();
    await store.put("orgs/org_1/logo.png", new Uint8Array(11), "image/png");

    expect(await store.head("orgs/org_1/logo.png")).toEqual({
      contentType: "image/png",
      byteSize: 11,
    });
  });

  it("returns null from head for a key that was never written", async () => {
    expect(await storage().head("orgs/org_1/missing.pdf")).toBeNull();
  });

  it("removes an object and its metadata", async () => {
    const store = storage();
    await store.put("orgs/org_1/logo.png", new Uint8Array(4), "image/png");
    await store.remove("orgs/org_1/logo.png");

    expect(await store.head("orgs/org_1/logo.png")).toBeNull();
  });

  it("mints a download url the local route can serve, carrying the filename", async () => {
    const url = await storage().signedDownloadUrl("orgs/org_1/e.pdf", "Estimate 12.pdf");

    expect(url).toBe(
      "http://localhost:3000/local-storage/orgs/org_1/e.pdf?filename=Estimate%2012.pdf",
    );
  });

  it("refuses to run outside local, where losing durability would be silent", async () => {
    expect(
      storage("production").put("k", new Uint8Array(1), "application/pdf"),
    ).rejects.toThrow(/never run outside local/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/integrations/storage/LocalObjectStorage.test.ts
```

Expected: FAIL — cannot resolve `./LocalObjectStorage.ts`.

- [ ] **Step 3: Write the port**

```ts
// packages/platform/src/integrations/storage/ObjectStorage.ts

/** What a stored object reports about itself. */
export interface StoredObject {
  contentType: string;
  byteSize: number;
}

/**
 * Port for durable blob storage. Named by capability, not vendor — GCS sits
 * behind it today.
 *
 * The signed-URL methods exist so bytes never pass through the API: a browser
 * downloads a rendered PDF straight from storage and PUTs a logo straight to it.
 * `head` is what makes an upload safe — a signed PUT URL can pin content-type
 * but CANNOT enforce size, so the size check has to happen after the fact, and
 * `remove` is how a rejected upload is cleaned up.
 */
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  /** Metadata without the body, or null if the object doesn't exist. */
  head(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
  /** Time-limited read URL. `filename` sets the browser's download name. */
  signedDownloadUrl(key: string, filename: string): Promise<string>;
  /** Time-limited write URL, pinned to `contentType`. */
  signedUploadUrl(key: string, contentType: string): Promise<string>;
}
```

- [ ] **Step 4: Write the config slice**

```ts
// packages/platform/src/integrations/storage/storageConfig.ts
import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

/**
 * Everything the storage adapters need. Per-slice, so a process that never
 * resolves storage never validates these.
 *
 * The two TTLs differ by intent: a download URL is handed to a user who may take
 * a moment to click, an upload URL is consumed immediately by the browser.
 * `localRoot`/`localBaseUrl` are read only by LocalObjectStorage.
 */
export interface StorageConfig {
  bucket: string;
  downloadUrlTtlSeconds: number;
  uploadUrlTtlSeconds: number;
  localRoot: string;
  localBaseUrl: string;
}

export const STORAGE_CONFIG_TOKEN = "StorageConfig";

const schema = z.object({
  bucket: z.string().min(1, "DOCUMENTS_BUCKET is required to store documents"),
  downloadUrlTtlSeconds: z.coerce.number().int().positive().default(900),
  uploadUrlTtlSeconds: z.coerce.number().int().positive().default(300),
  localRoot: z.string().default(".local-storage"),
  localBaseUrl: z.string().url().default("http://localhost:3000"),
});

export function loadStorageConfig(): StorageConfig {
  return parseConfig("object storage", schema, {
    bucket: process.env.DOCUMENTS_BUCKET,
    downloadUrlTtlSeconds: process.env.DOCUMENTS_DOWNLOAD_URL_TTL_SECONDS,
    uploadUrlTtlSeconds: process.env.DOCUMENTS_UPLOAD_URL_TTL_SECONDS,
    localRoot: process.env.LOCAL_STORAGE_ROOT,
    localBaseUrl: process.env.LOCAL_STORAGE_BASE_URL,
  });
}
```

Add `DOCUMENTS_BUCKET=landscape-documents-local` to `packages/api/.env` and `packages/worker/.env` (and to `.env.example` if the repo keeps one) so local dev resolves the slice.

- [ ] **Step 5: Write the local adapter**

```ts
// packages/platform/src/integrations/storage/LocalObjectStorage.ts
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inject, injectable } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "../../config/appConfig.ts";
import type { ObjectStorage, StoredObject } from "./ObjectStorage.ts";
import { STORAGE_CONFIG_TOKEN, type StorageConfig } from "./storageConfig.ts";

/**
 * Local-development ObjectStorage, writing under `.local-storage/`. GCS has no
 * offline emulator worth running, so without this the whole document pipeline
 * would be untestable off GCP.
 *
 * Same shape as InlineTaskQueue, including refusing to run anywhere but local:
 * silently writing durable artifacts to an instance's ephemeral disk in
 * production would lose every PDF on the next revision.
 *
 * Content type has nowhere to live on a filesystem, so it's kept in a sidecar
 * `<key>.meta.json`. The "signed" URLs aren't signed — they point at the API's
 * `/local-storage/*` route, which exists only when the environment is local.
 */
@injectable()
export class LocalObjectStorage implements ObjectStorage {
  constructor(
    @inject(APP_CONFIG_TOKEN)
    private readonly appConfig: AppConfig,
    @inject(STORAGE_CONFIG_TOKEN)
    private readonly config: StorageConfig,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.assertLocal();
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    await Bun.write(
      `${path}.meta.json`,
      JSON.stringify({ contentType, byteSize: bytes.byteLength }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    this.assertLocal();
    return await Bun.file(this.pathFor(key)).bytes();
  }

  async head(key: string): Promise<StoredObject | null> {
    this.assertLocal();
    const path = this.pathFor(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    const meta = await Bun.file(`${path}.meta.json`).json();
    return { contentType: meta.contentType, byteSize: meta.byteSize };
  }

  async remove(key: string): Promise<void> {
    this.assertLocal();
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }

  async signedDownloadUrl(key: string, filename: string): Promise<string> {
    this.assertLocal();
    const query = new URLSearchParams({ filename });
    return `${this.config.localBaseUrl}/local-storage/${key}?${query}`;
  }

  async signedUploadUrl(key: string): Promise<string> {
    this.assertLocal();
    return `${this.config.localBaseUrl}/local-storage/${key}`;
  }

  private pathFor(key: string): string {
    return join(this.config.localRoot, key);
  }

  private assertLocal(): void {
    if (this.appConfig.environment !== "local") {
      throw new Error(
        `LocalObjectStorage must never run outside local (environment=${this.appConfig.environment}). ` +
          "It writes to an instance's ephemeral disk, so every stored document would vanish on the next revision.",
      );
    }
  }
}
```

- [ ] **Step 6: Run the test**

```bash
bun test packages/platform/src/integrations/storage/LocalObjectStorage.test.ts
```

Expected: PASS, all six cases.

- [ ] **Step 7: Add the token, barrel export and DI registration**

In `packages/platform/src/integrations/tokens.ts`:

```ts
export const OBJECT_STORAGE_TOKEN = "ObjectStorage";
```

In `packages/platform/src/index.ts`, beside the other integration ports:

```ts
export * from "./integrations/storage/ObjectStorage.ts";
```

In `packages/platform/src/registerServerCore.ts` — both the API and the worker need storage, so it belongs in the shared core. Registered lazily by environment, exactly like `TASK_QUEUE_TOKEN`:

```ts
  container.register(STORAGE_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadStorageConfig()),
  });

  // Environment picks the adapter, resolved lazily inside the factory so local
  // dev is never made to supply GCP credentials. GcsObjectStorage is imported
  // statically, which is safe only because both server images now run from
  // source — see packages/api/Dockerfile.
  container.register(OBJECT_STORAGE_TOKEN, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const { environment } = dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
      return environment === "local"
        ? dependencyContainer.resolve(LocalObjectStorage)
        : dependencyContainer.resolve(GcsObjectStorage);
    }),
  });
```

`GcsObjectStorage` lands in Task 7. Until then, register `LocalObjectStorage` for both branches with a `// TODO(Task 7)` and no import of the GCS module — the file must typecheck at the end of this task.

- [ ] **Step 8: Add the storage fake to test-support**

In `packages/platform/src/test-support/repoMocks.ts`:

```ts
/**
 * In-memory ObjectStorage for handler and service tests. Records what was put so
 * a test can assert the key and bytes without touching a filesystem or GCS.
 */
export const makeObjectStorageFake = (
  over: Partial<ObjectStorage> = {},
): ObjectStorage & { objects: Map<string, { bytes: Uint8Array; contentType: string }> } => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    put: mock(async (key: string, bytes: Uint8Array, contentType: string) => {
      objects.set(key, { bytes, contentType });
    }),
    get: mock(async (key: string) => {
      const found = objects.get(key);
      if (!found) {
        throw new Error(`no object at ${key}`);
      }
      return found.bytes;
    }),
    head: mock(async (key: string) => {
      const found = objects.get(key);
      return found
        ? { contentType: found.contentType, byteSize: found.bytes.byteLength }
        : null;
    }),
    remove: mock(async (key: string) => {
      objects.delete(key);
    }),
    signedDownloadUrl: mock(async (key: string) => `https://signed.test/${key}`),
    signedUploadUrl: mock(async (key: string) => `https://upload.test/${key}`),
    ...over,
  };
};
```

- [ ] **Step 9: Serve `.local-storage/` from the API**

```ts
// packages/api/src/localStorageRoute.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

const PREFIX = "/local-storage/";

/**
 * Serves and accepts the objects LocalObjectStorage writes, standing in for the
 * signed GCS URLs a deployed environment mints. Mounted ONLY when the
 * environment is local — see index.ts.
 *
 * Returns true when it handled the request, so the caller knows to stop.
 */
export async function handleLocalStorage(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(PREFIX)) {
    return false;
  }

  const key = decodeURIComponent(url.pathname.slice(PREFIX.length));
  // Refuse traversal outside the root even locally — the same key string reaches
  // GCS in production, and a key that escapes here would escape there too.
  const path = normalize(join(root, key));
  if (!path.startsWith(normalize(root))) {
    res.writeHead(400).end("bad key");
    return true;
  }

  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bytes = Buffer.concat(chunks);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    await Bun.write(
      `${path}.meta.json`,
      JSON.stringify({
        contentType: req.headers["content-type"] ?? "application/octet-stream",
        byteSize: bytes.byteLength,
      }),
    );
    res.writeHead(200).end();
    return true;
  }

  try {
    await stat(path);
  } catch {
    res.writeHead(404).end("not found");
    return true;
  }

  const meta = await Bun.file(`${path}.meta.json`).json();
  const filename = url.searchParams.get("filename");
  res.writeHead(200, {
    "content-type": meta.contentType,
    "content-length": String(meta.byteSize),
    ...(filename ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
  });
  res.end(Buffer.from(await Bun.file(path).bytes()));
  return true;
}
```

In `packages/api/src/index.ts`, wrap the existing `cors(...)` middleware so local storage is handled first:

```ts
import { handleLocalStorage } from "./localStorageRoute.ts";
import { STORAGE_CONFIG_TOKEN, type StorageConfig } from "@landscape/platform/server";
// ...
  const corsMiddleware = cors({ origin: webUrl, credentials: true });
  const { environment } = container.resolve<AppConfig>(APP_CONFIG_TOKEN);
  const localRoot =
    environment === "local"
      ? container.resolve<StorageConfig>(STORAGE_CONFIG_TOKEN).localRoot
      : null;

  const server = createHTTPServer({
    router: appRouter,
    createContext,
    onError: /* unchanged */,
    // Local only: stands in for the signed GCS URLs a deployed environment
    // mints, so the browser's download and logo-upload paths are identical
    // across environments.
    middleware: (req, res, next) => {
      if (localRoot === null) {
        corsMiddleware(req, res, next);
        return;
      }
      void handleLocalStorage(req, res, localRoot).then((handled) => {
        if (!handled) {
          corsMiddleware(req, res, next);
        }
      });
    },
  });
```

Export `STORAGE_CONFIG_TOKEN` and the `StorageConfig` type from `packages/platform/src/server.ts` (server-only, since its loader reads env), matching how `DATABASE_CONFIG_TOKEN` is exposed.

- [ ] **Step 10: Switch the API image to run from source**

The API is about to depend on `@google-cloud/storage` and, in Task 15, `@google-cloud/tasks`. `packages/worker/Dockerfile:1-6` records why a bundle can't carry them. Replace `packages/api/Dockerfile` with the worker's structure:

```dockerfile
# The API runs from TypeScript SOURCE, not a bundle — like the worker, and for
# the same reason. @google-cloud/tasks is a gapic client that loads JSON config
# (*_client_config.json) via runtime require; `bun build` doesn't emit those
# assets, so a bundled image crashes at boot with "Cannot find module
# cloud_tasks_client_config.json". The API gained that dependency when it started
# enqueueing document renders and minting signed GCS URLs.
FROM oven/bun:1
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/worker/package.json packages/worker/
COPY packages/domain/package.json packages/domain/
COPY packages/platform/package.json packages/platform/

RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/domain/ packages/domain/
COPY packages/platform/ packages/platform/
COPY packages/api/ packages/api/

# Build stamp (from deploy.sh) baked in as runtime env so the API can report
# exactly which build is running via the system.version query.
ARG APP_VERSION=0.0.0
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

# Cloud Run injects PORT; default to 8080 for local docker runs
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "packages/api/src/index.ts"]
```

- [ ] **Step 11: Prove the image boots**

```bash
docker build --platform linux/amd64 -t landscape-api-check -f packages/api/Dockerfile .
```

Expected: builds clean. A full boot needs Mongo and Clerk secrets, so build success plus the local `bun run dev:api` in the next step is the gate here.

- [ ] **Step 12: Verify the local storage route end to end**

With the API running (`bun run dev:api`):

```bash
curl -sS -X PUT --data-binary '%PDF-fake' -H 'content-type: application/pdf' \
  http://localhost:3000/local-storage/orgs/org_test/probe.pdf -o /dev/null -w '%{http_code}\n'
curl -sS -D - 'http://localhost:3000/local-storage/orgs/org_test/probe.pdf?filename=Probe.pdf' -o /dev/null
```

Expected: `200`, then response headers including `content-type: application/pdf` and `content-disposition: attachment; filename="Probe.pdf"`. Then `rm -rf .local-storage/orgs/org_test`.

- [ ] **Step 13: Ignore the local storage directory**

Add `.local-storage/` to `.gitignore`.

- [ ] **Step 14: Run everything**

```bash
bun run typecheck && bun test && bun run lint
```

- [ ] **Step 15: Commit**

```bash
git add -A packages/platform packages/api .gitignore
git commit -m "feat: add an object storage port with a local adapter"
```

---

### Task 7: The GCS adapter

The one file that knows which storage provider is in use.

**Files:**
- Create: `packages/platform/src/integrations/storage/GcsObjectStorage.ts`
- Modify: `packages/platform/src/registerServerCore.ts`, `packages/platform/package.json`

**Interfaces:**
- Consumes: `ObjectStorage`, `StorageConfig` (Task 6).
- Produces: `GcsObjectStorage implements ObjectStorage`, bound to `OBJECT_STORAGE_TOKEN` in every non-local environment.

- [ ] **Step 1: Install the SDK**

```bash
bun add --cwd packages/platform @google-cloud/storage
```

- [ ] **Step 2: Write the adapter**

There is no test here: every method is a thin delegation to the SDK, and a test would only assert that mocks were called. The behaviour worth testing (`head` returning null, key layout) is covered by `LocalObjectStorage.test.ts` and Task 10's key tests, which exercise the same contract.

```ts
// packages/platform/src/integrations/storage/GcsObjectStorage.ts
import { Storage } from "@google-cloud/storage";
import { inject, injectable } from "tsyringe";
import type { ObjectStorage, StoredObject } from "./ObjectStorage.ts";
import { STORAGE_CONFIG_TOKEN, type StorageConfig } from "./storageConfig.ts";

/**
 * Google Cloud Storage adapter for the ObjectStorage port.
 *
 * Signing is the subtle part. A Cloud Run service account has no private key, so
 * `getSignedUrl` cannot sign locally — it delegates to the IAM SignBlob API,
 * which requires `iamcredentials.googleapis.com` enabled and
 * `roles/iam.serviceAccountTokenCreator` granted to the service account ON
 * ITSELF (see deploy.sh). Without that grant every signed URL fails at runtime
 * with a permission error, not at boot.
 *
 * If that ever proves painful, the escape hatch is an authenticated API route
 * that pipes the object — no signing at all. This port is what makes that a
 * one-file change.
 */
@injectable()
export class GcsObjectStorage implements ObjectStorage {
  private readonly storage = new Storage();

  constructor(
    @inject(STORAGE_CONFIG_TOKEN)
    private readonly config: StorageConfig,
  ) {}

  private file(key: string) {
    return this.storage.bucket(this.config.bucket).file(key);
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.file(key).save(Buffer.from(bytes), {
      contentType,
      // Uniform bucket-level access: per-object ACLs are rejected outright.
      resumable: false,
    });
  }

  async get(key: string): Promise<Uint8Array> {
    const [buffer] = await this.file(key).download();
    return new Uint8Array(buffer);
  }

  async head(key: string): Promise<StoredObject | null> {
    const [exists] = await this.file(key).exists();
    if (!exists) {
      return null;
    }
    const [metadata] = await this.file(key).getMetadata();
    return {
      contentType: metadata.contentType ?? "application/octet-stream",
      byteSize: Number(metadata.size ?? 0),
    };
  }

  async remove(key: string): Promise<void> {
    // ignoreNotFound: deleting an object that isn't there is the desired end
    // state, not an error — confirmLogo cleans up speculatively.
    await this.file(key).delete({ ignoreNotFound: true });
  }

  async signedDownloadUrl(key: string, filename: string): Promise<string> {
    const [url] = await this.file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + this.config.downloadUrlTtlSeconds * 1000,
      responseDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
    return url;
  }

  async signedUploadUrl(key: string, contentType: string): Promise<string> {
    const [url] = await this.file(key).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + this.config.uploadUrlTtlSeconds * 1000,
      // Pins the header the browser must send. Note this pins TYPE only — size
      // cannot be constrained by a signed URL, which is why confirmLogo checks
      // it after the fact.
      contentType,
    });
    return url;
  }
}
```

- [ ] **Step 3: Bind it for non-local environments**

In `packages/platform/src/registerServerCore.ts`, import `GcsObjectStorage` and replace the Task 6 `// TODO(Task 7)` placeholder so the factory resolves `LocalObjectStorage` for `local` and `GcsObjectStorage` otherwise.

- [ ] **Step 4: Typecheck and test**

```bash
bun run typecheck && bun test && bun run lint
```

Expected: clean.

- [ ] **Step 5: Confirm the API image still builds with the SDK present**

```bash
docker build --platform linux/amd64 -t landscape-api-check -f packages/api/Dockerfile .
```

Expected: builds clean. This is the check that Task 6's Dockerfile change actually bought what it was meant to.

- [ ] **Step 6: Commit**

```bash
git add packages/platform bun.lock
git commit -m "feat: store documents in Google Cloud Storage"
```

---

### Task 8: `CompanyProfile`

The business identity every client-facing document is headed with. One row per org, created by the existing `seedOrg` job so no org is ever without one.

**Files:**
- Create: `packages/platform/src/data-access/models/CompanyProfile.ts`
- Create: `packages/platform/src/data-access/repositories/CompanyProfileRepository/{types.ts,CompanyProfileRepository.ts,CompanyProfileRepositoryImpl.ts}`
- Modify: `packages/platform/src/data-access/tokens.ts`, `src/index.ts`, `src/registerServerCore.ts`
- Modify: `packages/platform/src/seed/{SeedService.ts,SeedServiceImpl.ts}`
- Modify: `packages/worker/src/jobs/handlers/seedOrg.ts`, `packages/api/src/seed/seed.ts`
- Modify: `packages/platform/src/test-support/{factories.ts,repoMocks.ts}`
- Test: `packages/platform/src/seed/SeedServiceImpl.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CompanyProfile { businessName: string; address: string | null; phone: string | null; email: string | null; licenseNumber: string | null; logoStorageKey: string | null; logoContentType: string | null }`
  - `CompanyProfileChanges = Partial<Omit<CompanyProfile, never>>`
  - `CompanyProfileRepository { get(orgId): Promise<CompanyProfile | null>; ensure(orgId, businessName): Promise<CompanyProfile>; update(orgId, changes): Promise<CompanyProfile> }`
  - `COMPANY_PROFILE_REPOSITORY_TOKEN = "CompanyProfileRepository"`
  - `SeedService.seedNewOrg(orgId: string, businessName: string): Promise<void>` — **signature change**
  - `makeCompanyProfile(over?)`, `makeCompanyProfileRepoMock(over?)`

- [ ] **Step 1: Write the failing test**

```ts
// packages/platform/src/seed/SeedServiceImpl.test.ts
import { describe, expect, it, mock } from "bun:test";
import {
  makeAssemblyRepoMock,
  makeCompanyProfile,
  makeCompanyProfileRepoMock,
  makeMaterialRepoMock,
  makePricingSettingsRepoMock,
} from "../test-support/index.ts";
import { SeedServiceImpl } from "./SeedServiceImpl.ts";

const build = (over: Parameters<typeof makeCompanyProfileRepoMock>[0] = {}) => {
  const profiles = makeCompanyProfileRepoMock(over);
  const service = new SeedServiceImpl(
    makeMaterialRepoMock({ upsertBySeedKey: mock(async () => ({ id: "m1" }) as never) }),
    makeAssemblyRepoMock({ upsertBySeedKey: mock(async () => ({ id: "a1" }) as never) }),
    makePricingSettingsRepoMock({ upsert: mock(async (_o, s) => s) }),
    profiles,
  );
  return { service, profiles };
};

describe("SeedServiceImpl company profile", () => {
  it("creates a profile for a new org, pre-filled with the org name", async () => {
    const { service, profiles } = build();
    await service.seedNewOrg("org_1", "Verdant Landscapes");

    expect(profiles.ensure).toHaveBeenCalledWith("org_1", "Verdant Landscapes");
  });

  it("uses ensure, so re-running never overwrites an edited profile", async () => {
    const existing = makeCompanyProfile({ businessName: "Renamed By User" });
    const { service, profiles } = build({ ensure: mock(async () => existing) });

    await service.seedNewOrg("org_1", "Verdant Landscapes");

    // ensure is $setOnInsert; there is no update path here to clobber with.
    expect(profiles.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/seed/SeedServiceImpl.test.ts
```

Expected: FAIL — `makeCompanyProfileRepoMock` is not exported.

- [ ] **Step 3: Write the model**

```ts
// packages/platform/src/data-access/models/CompanyProfile.ts
import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * The business identity that heads every client- and supplier-facing document —
 * one document per organization (enforced by the unique `orgId` index).
 *
 * Every field except the name is optional, and the name may be empty: a
 * client-facing document must never fail to render over missing branding.
 */
const companyProfileSchema = new Schema(
  {
    orgId: { type: String, required: true, unique: true },
    businessName: { type: String, required: true, trim: true, default: "" },
    address: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true },
    licenseNumber: { type: String, default: null, trim: true },
    // The logo's key in object storage, not the bytes. Documents fetch it at
    // render time; the browser never sees the key.
    logoStorageKey: { type: String, default: null },
    logoContentType: { type: String, default: null },
  },
  { timestamps: true },
);

export type CompanyProfileDoc = InferSchemaType<typeof companyProfileSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CompanyProfileModel = model<CompanyProfileDoc>(
  "CompanyProfile",
  companyProfileSchema,
);
```

- [ ] **Step 4: Write the entity and port**

```ts
// packages/platform/src/data-access/repositories/CompanyProfileRepository/types.ts

/**
 * The business identity behind an org's documents. Plain data, free of Mongoose
 * types. Every field is optional in substance — an empty `businessName` and a
 * null logo still render.
 */
export interface CompanyProfile {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  logoStorageKey: string | null;
  logoContentType: string | null;
}

/** Fields a caller may change. All optional; omitted fields are left alone. */
export type CompanyProfileChanges = Partial<CompanyProfile>;
```

```ts
// packages/platform/src/data-access/repositories/CompanyProfileRepository/CompanyProfileRepository.ts
import type { CompanyProfile, CompanyProfileChanges } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the per-org company profile singleton.
 *
 * `ensure` and `update` are separate on purpose. `ensure` is $setOnInsert — the
 * seed path calls it on every `organization.created` redelivery and must never
 * overwrite a profile the customer has since edited. `update` is the deliberate
 * write from the settings screen.
 */
export interface CompanyProfileRepository {
  get(orgId: string): Promise<CompanyProfile | null>;
  /** Creates the profile if absent, pre-filled with `businessName`. Idempotent. */
  ensure(orgId: string, businessName: string): Promise<CompanyProfile>;
  /** Applies changes, creating the row if it somehow doesn't exist yet. */
  update(orgId: string, changes: CompanyProfileChanges): Promise<CompanyProfile>;
}
```

- [ ] **Step 5: Write the implementation**

```ts
// packages/platform/src/data-access/repositories/CompanyProfileRepository/CompanyProfileRepositoryImpl.ts
import { injectable } from "tsyringe";
import {
  CompanyProfileModel,
  type CompanyProfileDoc,
} from "../../models/CompanyProfile.ts";
import type {
  CompanyProfile,
  CompanyProfileChanges,
  CompanyProfileRepository,
} from "./CompanyProfileRepository.ts";

@injectable()
export class CompanyProfileRepositoryImpl implements CompanyProfileRepository {
  async get(orgId: string): Promise<CompanyProfile | null> {
    const doc = await CompanyProfileModel.findOne({ orgId }).lean();
    return doc ? toProfile(doc) : null;
  }

  async ensure(orgId: string, businessName: string): Promise<CompanyProfile> {
    // $setOnInsert only: a redelivered organization.created must find the
    // profile exactly as the customer left it.
    const doc = await CompanyProfileModel.findOneAndUpdate(
      { orgId },
      { $setOnInsert: { orgId, businessName } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
    return toProfile(doc);
  }

  async update(
    orgId: string,
    changes: CompanyProfileChanges,
  ): Promise<CompanyProfile> {
    const doc = await CompanyProfileModel.findOneAndUpdate(
      { orgId },
      { $set: { orgId, ...changes } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
    return toProfile(doc);
  }
}

function toProfile(doc: CompanyProfileDoc): CompanyProfile {
  return {
    businessName: doc.businessName ?? "",
    address: doc.address ?? null,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    licenseNumber: doc.licenseNumber ?? null,
    logoStorageKey: doc.logoStorageKey ?? null,
    logoContentType: doc.logoContentType ?? null,
  };
}
```

- [ ] **Step 6: Register it**

Add `COMPANY_PROFILE_REPOSITORY_TOKEN = "CompanyProfileRepository"` to `data-access/tokens.ts`, the port to `src/index.ts`, and `registerSingleton(COMPANY_PROFILE_REPOSITORY_TOKEN, CompanyProfileRepositoryImpl)` to `registerServerCore.ts`.

- [ ] **Step 7: Seed a profile with the org**

In `packages/platform/src/seed/SeedService.ts`, change the port and its doc:

```ts
  /**
   * Converge the org onto the starter catalog and ensure it has a company
   * profile. `businessName` comes from the Clerk organization, so a brand-new
   * org's documents are headed correctly before anyone visits settings.
   */
  seedNewOrg(orgId: string, businessName: string): Promise<void>;
```

In `SeedServiceImpl.ts`, inject `COMPANY_PROFILE_REPOSITORY_TOKEN` as a fourth constructor argument, and:

```ts
  async seedNewOrg(orgId: string, businessName: string): Promise<void> {
    // ensure, not update: a redelivered organization.created must not overwrite
    // a profile the customer has already edited.
    await this.profiles.ensure(orgId, businessName);
    await this.converge(orgId);
  }
```

`resetOrgCatalog` is the dev path and leaves the profile alone — it clears the catalog, not the business identity.

- [ ] **Step 8: Pass the org name from the webhook**

In `packages/worker/src/jobs/handlers/seedOrg.ts`, widen the schema and the call:

```ts
// Clerk's organization.* payload (event.data). The id IS the app's orgId (the
// Clerk org is the tenant); the name pre-fills the company profile.
const clerkOrgSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
});
```

```ts
    const { id: orgId, name } = clerkOrgSchema.parse(event.payload);
    await this.seedService.seedNewOrg(orgId, name);
```

Update `seedOrg.test.ts`'s event payload to include a `name`, and assert `seedNewOrg` was called with both arguments.

- [ ] **Step 9: Add the test doubles**

In `factories.ts`:

```ts
export const makeCompanyProfile = (
  over: Partial<CompanyProfile> = {},
): CompanyProfile => ({
  businessName: "Test Landscaping",
  address: "100 Garden Way, Springfield, OR 97477",
  phone: "555-0100",
  email: "bids@test-landscaping.example",
  licenseNumber: "CCB #123456",
  logoStorageKey: null,
  logoContentType: null,
  ...over,
});
```

In `repoMocks.ts`:

```ts
export const makeCompanyProfileRepoMock = (
  over: Partial<CompanyProfileRepository> = {},
): CompanyProfileRepository => ({
  get: mock(async () => null),
  ensure: mock(async () => makeCompanyProfile()),
  update: mock(async () => makeCompanyProfile()),
  ...over,
});
```

- [ ] **Step 10: Run the test**

```bash
bun test packages/platform/src/seed/SeedServiceImpl.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 11: Fix the dev seed CLI**

`packages/api/src/seed/seed.ts` calls `resetOrgCatalog`, whose signature is unchanged — no edit needed. Confirm with the typechecker rather than by inspection.

- [ ] **Step 12: Run everything**

```bash
bun run typecheck && bun test && bun run lint
```

- [ ] **Step 13: Commit**

```bash
git add -A packages/platform packages/worker packages/api
git commit -m "feat: give every organization a company profile"
```

---

### Task 9: Document view models and storage keys

Plain data with no dependencies, plus the two key functions that must stay in lockstep. The object path carries the same two components as the dedup key, and must: keyed on `versionMillis` alone, a formula-version bump would write new numbers over the object an *old* succeeded job row still points at, and that row would hand out a URL to a PDF whose figures it never produced.

**Files:**
- Create: `packages/platform/src/documents/types.ts`, `packages/platform/src/documents/keys.ts`, `packages/platform/src/documents/errors.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/src/documents/keys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DocumentLogo`, `DocumentCompany`, `DocumentParty`, `DocumentProject`
  - `EstimateGroupRow { label: string; amount: number }`
  - `EstimateDocument { company, client, project, title, createdAt, groups, total, taxNote }`
  - `PartsOrderLine { description, unit, quantity, unitPrice, lineTotal }`
  - `PartsOrderDocument { company, project, title, createdAt, lines, subtotal, deliveryTotal, total }`
  - `TAX_NOTE: string`
  - `estimateDedupKey(estimateId, updatedAt, formulaVersion): string`
  - `documentObjectKey(orgId, estimateId, updatedAt, formulaVersion, file): string`
  - `ESTIMATE_PDF_FILE`, `PARTS_ORDER_PDF_FILE`, `logoObjectKey(orgId, id, extension)`
  - `roundCents(value: number): number`
  - `MissingEstimateError`

- [ ] **Step 1: Write the failing test**

```ts
// packages/platform/src/documents/keys.test.ts
import { describe, expect, it } from "bun:test";
import {
  ESTIMATE_PDF_FILE,
  PARTS_ORDER_PDF_FILE,
  documentObjectKey,
  estimateDedupKey,
  logoObjectKey,
  roundCents,
} from "./keys.ts";

const UPDATED_AT = "2026-08-01T12:00:00.000Z"; // 1785585600000
const MILLIS = 1785585600000;

describe("estimateDedupKey", () => {
  it("carries the estimate, its version and the formula version", () => {
    expect(estimateDedupKey("est_1", UPDATED_AT, 1)).toBe(
      `estimate:est_1:${MILLIS}:1`,
    );
  });

  it("changes when the estimate is edited", () => {
    expect(estimateDedupKey("est_1", "2026-08-01T12:00:01.000Z", 1)).not.toBe(
      estimateDedupKey("est_1", UPDATED_AT, 1),
    );
  });

  it("changes when the pricing formula is bumped, on an untouched estimate", () => {
    // The trap this component exists for: totals are recomputed on every read,
    // so a buildup change reprices an estimate without touching updatedAt.
    expect(estimateDedupKey("est_1", UPDATED_AT, 2)).not.toBe(
      estimateDedupKey("est_1", UPDATED_AT, 1),
    );
  });
});

describe("documentObjectKey", () => {
  it("lays the object out under the org, estimate and version", () => {
    expect(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 1, ESTIMATE_PDF_FILE),
    ).toBe(`orgs/org_1/estimates/est_1/${MILLIS}-f1/estimate.pdf`);
  });

  it("separates the two documents of one version", () => {
    expect(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 1, PARTS_ORDER_PDF_FILE),
    ).toBe(`orgs/org_1/estimates/est_1/${MILLIS}-f1/parts-order.pdf`);
  });

  it("moves when the formula version moves, so a bump cannot overwrite the object an old job row points at", () => {
    expect(documentObjectKey("org_1", "est_1", UPDATED_AT, 2, ESTIMATE_PDF_FILE)).not.toBe(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 1, ESTIMATE_PDF_FILE),
    );
  });
});

describe("logoObjectKey", () => {
  it("puts branding outside the per-estimate tree", () => {
    expect(logoObjectKey("org_1", "abc-123", "png")).toBe(
      "orgs/org_1/branding/logo-abc-123.png",
    );
  });
});

describe("roundCents", () => {
  it("rounds to two places", () => {
    expect(roundCents(1234.5678)).toBe(1234.57);
  });

  it("rounds a half cent up rather than to even", () => {
    expect(roundCents(0.005)).toBe(0.01);
  });

  it("does not emit negative zero", () => {
    expect(Object.is(roundCents(-0.001), 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/documents/keys.test.ts
```

Expected: FAIL — cannot resolve `./keys.ts`.

- [ ] **Step 3: Write the keys**

```ts
// packages/platform/src/documents/keys.ts

/** File names within one version's folder. */
export const ESTIMATE_PDF_FILE = "estimate.pdf";
export const PARTS_ORDER_PDF_FILE = "parts-order.pdf";

/**
 * The content key a generated document is cached on.
 *
 * Both components are load-bearing. `updatedAt` alone is NOT sufficient: totals
 * are never stored — `computeEstimate` recomputes them from snapshotted inputs on
 * every read — so a deploy that changes the buildup reprices every existing
 * estimate without touching `updatedAt`. Keyed on the version alone, a cached PDF
 * would silently disagree with the screen after such a deploy.
 */
export function estimateDedupKey(
  estimateId: string,
  updatedAt: string,
  formulaVersion: number,
): string {
  return `estimate:${estimateId}:${Date.parse(updatedAt)}:${formulaVersion}`;
}

/**
 * Where a generated document lives.
 *
 * **The object path carries the same two components as the dedup key, and must.**
 * Keyed on the version alone, a formula-version bump would write new numbers over
 * the object that the *old* succeeded job row still points at — so that row would
 * hand out a URL to a PDF whose figures it never produced. Sharing both
 * components makes a job row and its object inseparable.
 */
export function documentObjectKey(
  orgId: string,
  estimateId: string,
  updatedAt: string,
  formulaVersion: number,
  file: string,
): string {
  const version = `${Date.parse(updatedAt)}-f${formulaVersion}`;
  return `orgs/${orgId}/estimates/${estimateId}/${version}/${file}`;
}

/** Branding lives outside the per-estimate tree — it outlives any one estimate. */
export function logoObjectKey(
  orgId: string,
  id: string,
  extension: string,
): string {
  return `orgs/${orgId}/branding/logo-${id}.${extension}`;
}

/**
 * Rounds money to cents. Every number that reaches a template goes through this,
 * so a template never rounds and therefore can never disagree with the estimate.
 * `+ 0` normalises -0, which would otherwise print as "-$0.00".
 */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
```

- [ ] **Step 4: Write the view models**

```ts
// packages/platform/src/documents/types.ts

/**
 * The view models a renderer consumes. Plain data with no dependencies: they are
 * the seam between assembly (which holds all the logic) and rendering (which
 * holds none). Swapping the PDF engine touches neither these nor the pipeline.
 *
 * Every monetary field is already rounded to cents by DocumentAssemblyService.
 */

/** Logo bytes, already fetched. Renderers embed images, they don't fetch them. */
export interface DocumentLogo {
  data: Uint8Array;
  contentType: string;
}

export interface DocumentCompany {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  logo: DocumentLogo | null;
}

export interface DocumentParty {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface DocumentProject {
  name: string;
  location: string | null;
}

/** One assembly's line on the client-facing summary. */
export interface EstimateGroupRow {
  label: string;
  amount: number;
}

/**
 * The client-facing bid: a grouped summary, one row per assembly, no unit prices.
 *
 * There is deliberately no tax field. Sales tax is computed per material line,
 * pre-markup, and folded into direct cost, so a subtotal → tax → total
 * presentation would double-count it. `taxNote` is the footnote that says so.
 */
export interface EstimateDocument {
  company: DocumentCompany;
  client: DocumentParty | null;
  project: DocumentProject;
  title: string;
  createdAt: string;
  groups: EstimateGroupRow[];
  total: number;
  taxNote: string;
}

/** One merged material row on a supplier order. */
export interface PartsOrderLine {
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * The supplier-facing materials list.
 *
 * Shows COST, not marked-up price — correct for a supplier, and correct by
 * construction: a material line's `unitPrice` IS catalog cost, since markup only
 * ever happens in aggregate. `subtotal` is pre-tax (the supplier charges their
 * own) and delivery is noted separately rather than folded into unit prices.
 */
export interface PartsOrderDocument {
  company: DocumentCompany;
  project: DocumentProject;
  title: string;
  createdAt: string;
  lines: PartsOrderLine[];
  subtotal: number;
  deliveryTotal: number;
  total: number;
}

/**
 * The footnote that replaces a tax line. Sales tax is already inside every
 * figure on the document.
 */
export const TAX_NOTE = "Prices include applicable sales tax.";
```

- [ ] **Step 5: Write the error type**

```ts
// packages/platform/src/documents/errors.ts

/**
 * The estimate a document was requested for doesn't exist, or belongs to another
 * org (the repository's org-scoped read makes those indistinguishable, which is
 * the point — a cross-tenant id must not be identifiable as "exists elsewhere").
 *
 * Permanent by nature: the worker maps this to a poison outcome and acks rather
 * than retrying, and the API maps it to NOT_FOUND.
 */
export class MissingEstimateError extends Error {
  constructor(estimateId: string) {
    super(`estimate ${estimateId} not found`);
    this.name = "MissingEstimateError";
  }
}
```

- [ ] **Step 6: Export from the barrel**

In `packages/platform/src/index.ts`, after the integrations block:

```ts
// Documents: view models, key layout and errors. Pure data — the assembly
// service itself is server-only and registered via registerServerCore.
export * from "./documents/types.ts";
export * from "./documents/keys.ts";
export * from "./documents/errors.ts";
```

- [ ] **Step 7: Run the test**

```bash
bun test packages/platform/src/documents/keys.test.ts
```

Expected: PASS, all ten cases.

- [ ] **Step 8: Typecheck and commit**

```bash
bun run typecheck && bun run lint
git add packages/platform
git commit -m "feat: define document view models and storage key layout"
```

---

### Task 10: `DocumentAssemblyService` — the estimate document

The real logic, in `platform` because both the API and the worker need it. Org-scoped loads, `computeEstimate`, the logo fetch, and all the rounding. This is where the three money rules are enforced.

**Files:**
- Create: `packages/platform/src/documents/DocumentAssemblyService.ts`, `DocumentAssemblyServiceImpl.ts`
- Modify: `packages/platform/src/registerServerCore.ts`, `src/index.ts`
- Test: `packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts`

**Interfaces:**
- Consumes: `EstimateRepository`, `ProjectRepository`, `ClientRepository`, `CompanyProfileRepository`, `ObjectStorage`, `Logger`, `computeEstimate`, `MissingEstimateError`, `roundCents`, `TAX_NOTE`.
- Produces:
  - `DocumentAssemblyService { buildEstimateDocument(orgId, estimateId): Promise<EstimateDocument>; buildPartsOrderDocument(orgId, estimateId): Promise<PartsOrderDocument> }`
  - `DOCUMENT_ASSEMBLY_SERVICE_TOKEN = "DocumentAssemblyService"`

`buildPartsOrderDocument` is declared here and implemented in Task 11; until then it throws `new Error("not implemented")` so the port is stable for Task 12's renderer work.

- [ ] **Step 1: Write the failing test**

```ts
// packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts
import { describe, expect, it, mock } from "bun:test";
import { computeEstimate } from "@landscape/domain";
import {
  makeClient,
  makeClientRepoMock,
  makeCompanyProfile,
  makeCompanyProfileRepoMock,
  makeEstimate,
  makeEstimateRepoMock,
  makeObjectStorageFake,
  makeProject,
  makeProjectRepoMock,
} from "../test-support/index.ts";
import { MissingEstimateError } from "./errors.ts";
import { DocumentAssemblyServiceImpl } from "./DocumentAssemblyServiceImpl.ts";
import { TAX_NOTE } from "./types.ts";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as never;

const line = (over: Record<string, unknown> = {}) => ({
  id: "line_1",
  phase: "Irrigation",
  type: "material" as const,
  description: "1in PVC pipe",
  quantity: 10,
  unit: "ft",
  unitPrice: 2,
  taxable: true,
  deliveryCost: 5,
  quantityFormula: "qty",
  sourceAssemblyId: "asm_irrigation",
  sourceLineKey: "pipe",
  taskKey: null,
  taskName: null,
  ...over,
});

const estimateWithTwoAssemblies = () =>
  makeEstimate({
    taxRate: 8,
    assemblies: [
      { assemblyId: "asm_irrigation", name: "Irrigation", driverValues: {} },
      { assemblyId: "asm_planting", name: "Planting", driverValues: {} },
    ],
    lineItems: [
      line(),
      line({ id: "line_2", type: "labor", description: "Install", unitPrice: 40, quantity: 4, taxable: false, deliveryCost: 0 }),
      line({
        id: "line_3",
        phase: "Planting",
        description: "Shrub",
        sourceAssemblyId: "asm_planting",
        quantity: 6,
        unitPrice: 18,
      }),
    ],
  });

const build = (over: {
  estimate?: ReturnType<typeof makeEstimate> | null;
  profile?: ReturnType<typeof makeCompanyProfile> | null;
  storage?: ReturnType<typeof makeObjectStorageFake>;
} = {}) => {
  const estimate = over.estimate === undefined ? estimateWithTwoAssemblies() : over.estimate;
  const storage = over.storage ?? makeObjectStorageFake();
  const service = new DocumentAssemblyServiceImpl(
    makeEstimateRepoMock({ findById: mock(async () => estimate) }),
    makeProjectRepoMock({ findById: mock(async () => makeProject({ name: "Oak St Rebuild", location: "12 Oak St" })) }),
    makeClientRepoMock({ findById: mock(async () => makeClient({ name: "Ada Client" })) }),
    makeCompanyProfileRepoMock({
      get: mock(async () => (over.profile === undefined ? makeCompanyProfile() : over.profile)),
    }),
    storage,
    noopLogger,
  );
  return { service, estimate, storage };
};

describe("DocumentAssemblyServiceImpl.buildEstimateDocument", () => {
  it("emits one row per assembly, labelled and ordered as the estimate orders them", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.groups.map((g) => g.label)).toEqual(["Irrigation", "Planting"]);
  });

  it("groups by sourceAssemblyId, not by the phase label", async () => {
    // Two instances of one assembly with the same phase string must stay one
    // row; two DIFFERENT assemblies sharing a phase label must stay two.
    const estimate = makeEstimate({
      assemblies: [
        { assemblyId: "asm_a", name: "Drainage A", driverValues: {} },
        { assemblyId: "asm_b", name: "Drainage B", driverValues: {} },
      ],
      lineItems: [
        line({ id: "l1", phase: "Drainage", sourceAssemblyId: "asm_a" }),
        line({ id: "l2", phase: "Drainage", sourceAssemblyId: "asm_b" }),
      ],
    });
    const { service } = build({ estimate });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.groups.map((g) => g.label)).toEqual(["Drainage A", "Drainage B"]);
  });

  it("gives lines with a null sourceAssemblyId their own row, so every line lands in exactly one group", async () => {
    const estimate = makeEstimate({
      assemblies: [{ assemblyId: "asm_a", name: "Drainage", driverValues: {} }],
      lineItems: [
        line({ id: "l1", sourceAssemblyId: "asm_a" }),
        line({ id: "l2", sourceAssemblyId: null, phase: null }),
      ],
    });
    const { service } = build({ estimate });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.groups.map((g) => g.label)).toEqual(["Drainage", "Other"]);
  });

  it("has rows that sum to the total shown", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    const summed = doc.groups.reduce((acc, g) => acc + g.amount, 0);
    expect(Math.round(summed * 100)).toBe(Math.round(doc.total * 100));
  });

  it("agrees with the engine's total for the job", async () => {
    const { service, estimate } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    const engineTotal = computeEstimate(estimate!).totals.total;
    expect(doc.total).toBeCloseTo(engineTotal, 2);
  });

  it("emits no tax line and carries the footnote instead", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.taxNote).toBe(TAX_NOTE);
    expect(doc.groups.some((g) => /tax/i.test(g.label))).toBe(false);
    expect(doc).not.toHaveProperty("tax");
  });

  it("rounds every amount to cents so a template never has to", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    for (const group of [...doc.groups, { label: "total", amount: doc.total }]) {
      expect(Number.isInteger(Math.round(group.amount * 100))).toBe(true);
      expect(group.amount).toBe(Math.round(group.amount * 100) / 100);
    }
  });

  it("embeds the logo bytes when the profile has one", async () => {
    const storage = makeObjectStorageFake();
    await storage.put("orgs/org_1/branding/logo-1.png", new Uint8Array([1, 2, 3]), "image/png");
    const { service } = build({
      profile: makeCompanyProfile({
        logoStorageKey: "orgs/org_1/branding/logo-1.png",
        logoContentType: "image/png",
      }),
      storage,
    });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.company.logo).toEqual({
      data: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
  });

  it("renders without a logo rather than failing when the object is gone", async () => {
    const { service } = build({
      profile: makeCompanyProfile({
        logoStorageKey: "orgs/org_1/branding/missing.png",
        logoContentType: "image/png",
      }),
    });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.company.logo).toBeNull();
  });

  it("renders with an empty company when the org has no profile at all", async () => {
    const { service } = build({ profile: null });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.company.businessName).toBe("");
    expect(doc.company.logo).toBeNull();
  });

  it("throws MissingEstimateError for an unknown or cross-org estimate", async () => {
    const { service } = build({ estimate: null });

    expect(service.buildEstimateDocument("org_1", "nope")).rejects.toThrow(
      MissingEstimateError,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts
```

Expected: FAIL — cannot resolve `./DocumentAssemblyServiceImpl.ts`. (`makeClientRepoMock` may also be missing from `repoMocks.ts`; add it in the same shape as the others if so — `findByOrg`, `findById`, `create`, `update`, `deleteById`, matching `ClientRepository`.)

- [ ] **Step 3: Write the port**

```ts
// packages/platform/src/documents/DocumentAssemblyService.ts
import type { EstimateDocument, PartsOrderDocument } from "./types.ts";

export const DOCUMENT_ASSEMBLY_SERVICE_TOKEN = "DocumentAssemblyService";

/**
 * Turns an estimate into the plain view models a renderer consumes.
 *
 * Lives in platform because both entrypoints need it: the worker renders from it
 * and the API's tests assert against it. All the logic is here — org-scoped
 * loads, the cost buildup, grouping, the logo fetch, and every rounding decision
 * — so templates hold none and cannot disagree with the estimate.
 *
 * Throws MissingEstimateError when the estimate doesn't exist for that org.
 */
export interface DocumentAssemblyService {
  buildEstimateDocument(
    orgId: string,
    estimateId: string,
  ): Promise<EstimateDocument>;
  buildPartsOrderDocument(
    orgId: string,
    estimateId: string,
  ): Promise<PartsOrderDocument>;
}
```

- [ ] **Step 4: Write the implementation**

```ts
// packages/platform/src/documents/DocumentAssemblyServiceImpl.ts
import { inject, injectable } from "tsyringe";
import { computeEstimate, type Estimate } from "@landscape/domain";
import {
  CLIENT_REPOSITORY_TOKEN,
  COMPANY_PROFILE_REPOSITORY_TOKEN,
  ESTIMATE_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "../data-access/tokens.ts";
import type { ClientRepository } from "../data-access/repositories/ClientRepository/ClientRepository.ts";
import type { CompanyProfileRepository } from "../data-access/repositories/CompanyProfileRepository/CompanyProfileRepository.ts";
import type { EstimateRepository } from "../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import type { ProjectRepository } from "../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import { OBJECT_STORAGE_TOKEN } from "../integrations/tokens.ts";
import type { ObjectStorage } from "../integrations/storage/ObjectStorage.ts";
import { LOGGER_TOKEN, type Logger } from "../logging/Logger.ts";
import type { DocumentAssemblyService } from "./DocumentAssemblyService.ts";
import { MissingEstimateError } from "./errors.ts";
import { roundCents } from "./keys.ts";
import {
  TAX_NOTE,
  type DocumentCompany,
  type DocumentParty,
  type DocumentProject,
  type EstimateDocument,
  type PartsOrderDocument,
} from "./types.ts";

@injectable()
export class DocumentAssemblyServiceImpl implements DocumentAssemblyService {
  constructor(
    @inject(ESTIMATE_REPOSITORY_TOKEN)
    private readonly estimates: EstimateRepository,
    @inject(PROJECT_REPOSITORY_TOKEN)
    private readonly projects: ProjectRepository,
    @inject(CLIENT_REPOSITORY_TOKEN)
    private readonly clients: ClientRepository,
    @inject(COMPANY_PROFILE_REPOSITORY_TOKEN)
    private readonly profiles: CompanyProfileRepository,
    @inject(OBJECT_STORAGE_TOKEN)
    private readonly storage: ObjectStorage,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {}

  async buildEstimateDocument(
    orgId: string,
    estimateId: string,
  ): Promise<EstimateDocument> {
    const estimate = await this.loadEstimate(orgId, estimateId);
    const view = computeEstimate(estimate);
    const { company, project, client } = await this.loadHeader(orgId, estimate);

    // Rows come straight off the engine's per-assembly buildup. Overhead (a
    // margin gross-up on materials) and profit are both linear in their bases,
    // so per-assembly totals sum to the job total exactly — no proportional
    // allocation, no largest-remainder reconciliation, and no possibility of
    // this column disagreeing with the screen.
    //
    // `assemblyTotals` is already grouped by sourceAssemblyId (never by
    // LineItem.phase, which holds the assembly NAME and would merge two
    // instances of one assembly and break on rename), ordered as the estimate
    // orders its assemblies, with a trailing "Other" row for lines that have no
    // source assembly. Every line therefore lands in exactly one row.
    const groups = view.assemblyTotals.map((assembly) => ({
      label: assembly.name,
      amount: roundCents(assembly.total),
    }));

    // The total is the sum of the ROUNDED rows, not the rounded sum, so a
    // customer adding the column always arrives at the printed total. The two
    // differ by at most a cent, and internal consistency is what a bid needs.
    const total = roundCents(groups.reduce((acc, row) => acc + row.amount, 0));

    return {
      company,
      client,
      project,
      title: estimate.title,
      createdAt: estimate.createdAt,
      groups,
      total,
      // No tax line: sales tax is computed per material line, pre-markup, and is
      // already inside every figure above. A subtotal → tax → total layout would
      // double-count it.
      taxNote: TAX_NOTE,
    };
  }

  async buildPartsOrderDocument(
    _orgId: string,
    _estimateId: string,
  ): Promise<PartsOrderDocument> {
    throw new Error("not implemented");
  }

  private async loadEstimate(orgId: string, estimateId: string): Promise<Estimate> {
    const estimate = await this.estimates.findById(orgId, estimateId);
    if (!estimate) {
      // Org-scoped read: a cross-org id is indistinguishable from a missing one,
      // which is the point.
      throw new MissingEstimateError(estimateId);
    }
    return estimate;
  }

  /** The parts shared by both documents: who is sending it, and about what. */
  private async loadHeader(
    orgId: string,
    estimate: Estimate,
  ): Promise<{
    company: DocumentCompany;
    project: DocumentProject;
    client: DocumentParty | null;
  }> {
    const [profile, project] = await Promise.all([
      this.profiles.get(orgId),
      this.projects.findById(orgId, estimate.projectId),
    ]);

    const client = project
      ? await this.clients.findById(orgId, project.clientId)
      : null;

    return {
      company: {
        // A profile with no logo or an empty name still renders. A client-facing
        // document must not fail over missing branding.
        businessName: profile?.businessName ?? "",
        address: profile?.address ?? null,
        phone: profile?.phone ?? null,
        email: profile?.email ?? null,
        licenseNumber: profile?.licenseNumber ?? null,
        logo: await this.loadLogo(profile?.logoStorageKey ?? null, profile?.logoContentType ?? null),
      },
      project: {
        name: project?.name ?? estimate.title,
        location: project?.location ?? null,
      },
      client: client
        ? {
            name: client.name,
            address: client.address,
            email: client.email,
            phone: client.phone,
          }
        : null,
    };
  }

  private async loadLogo(
    key: string | null,
    contentType: string | null,
  ): Promise<DocumentCompany["logo"]> {
    if (!key || !contentType) {
      return null;
    }
    try {
      return { data: await this.storage.get(key), contentType };
    } catch (error) {
      // A missing or unreadable logo degrades the document; it does not fail it.
      this.logger.warn({ err: error, key }, "logo unreadable; rendering without it");
      return null;
    }
  }
}
```

- [ ] **Step 5: Run the test**

```bash
bun test packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts
```

Expected: PASS, all eleven cases.

- [ ] **Step 6: Register the service**

In `packages/platform/src/registerServerCore.ts`, beside `SEED_SERVICE_TOKEN` (same rationale — a shared platform capability both entrypoints resolve):

```ts
  container.registerSingleton(
    DOCUMENT_ASSEMBLY_SERVICE_TOKEN,
    DocumentAssemblyServiceImpl,
  );
```

In `packages/platform/src/index.ts`, export the port and token only (the impl stays server-only):

```ts
export {
  type DocumentAssemblyService,
  DOCUMENT_ASSEMBLY_SERVICE_TOKEN,
} from "./documents/DocumentAssemblyService.ts";
```

- [ ] **Step 7: Run everything and commit**

```bash
bun run typecheck && bun test && bun run lint
git add packages/platform
git commit -m "feat: assemble the client-facing estimate document"
```

---

### Task 11: The parts order document

A derived view of the estimate's material lines. No new entity — the renderer takes a plain `PartsOrderDocument`, so a real `PartsOrder` entity can feed it later without touching the rendering or job code.

**Files:**
- Modify: `packages/platform/src/documents/DocumentAssemblyServiceImpl.ts`
- Test: `packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts`

**Interfaces:**
- Consumes: everything from Task 10.
- Produces: a working `buildPartsOrderDocument`, replacing the `not implemented` stub.

- [ ] **Step 1: Write the failing test**

Append to `DocumentAssemblyServiceImpl.test.ts`:

```ts
describe("DocumentAssemblyServiceImpl.buildPartsOrderDocument", () => {
  const materialsEstimate = () =>
    makeEstimate({
      taxRate: 8,
      assemblies: [
        { assemblyId: "asm_a", name: "Irrigation", driverValues: {} },
        { assemblyId: "asm_b", name: "Planting", driverValues: {} },
      ],
      lineItems: [
        line({ id: "l1", description: "1in PVC pipe", unit: "ft", quantity: 10, unitPrice: 2, deliveryCost: 5 }),
        // Same description/unit/price from another assembly — must merge.
        line({ id: "l2", description: "1in PVC pipe", unit: "ft", quantity: 15, unitPrice: 2, deliveryCost: 7, sourceAssemblyId: "asm_b" }),
        // Same description, DIFFERENT price — must not merge.
        line({ id: "l3", description: "1in PVC pipe", unit: "ft", quantity: 4, unitPrice: 3, deliveryCost: 0 }),
        line({ id: "l4", type: "labor", description: "Install", quantity: 8, unitPrice: 45, taxable: false, deliveryCost: 0 }),
      ],
    });

  it("lists only material lines — a supplier is not quoting labor", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    expect(doc.lines.some((l) => l.description === "Install")).toBe(false);
  });

  it("merges identical materials and sums their quantities", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    const merged = doc.lines.find((l) => l.unitPrice === 2);
    expect(merged).toMatchObject({
      description: "1in PVC pipe",
      unit: "ft",
      quantity: 25,
      lineTotal: 50,
    });
  });

  it("keeps materials at different unit prices apart", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    expect(doc.lines.filter((l) => l.description === "1in PVC pipe")).toHaveLength(2);
  });

  it("quotes catalog cost, never a marked-up price", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    // 2.00 is the line's unitPrice as snapshotted — overhead and profit only
    // ever apply in aggregate, so a line's price IS cost.
    expect(doc.lines.find((l) => l.unitPrice === 2)?.unitPrice).toBe(2);
  });

  it("subtotals pre-tax and notes delivery separately", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    expect(doc.subtotal).toBe(62); // (25 × 2) + (4 × 3)
    expect(doc.deliveryTotal).toBe(12); // 5 + 7 + 0
    expect(doc.total).toBe(74);
  });

  it("throws MissingEstimateError for an unknown or cross-org estimate", async () => {
    const { service } = build({ estimate: null });

    expect(service.buildPartsOrderDocument("org_1", "nope")).rejects.toThrow(
      MissingEstimateError,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts
```

Expected: FAIL — six failures, all `not implemented` except the `MissingEstimateError` case, which fails because the stub throws before loading.

- [ ] **Step 3: Implement it**

Replace the stub in `DocumentAssemblyServiceImpl.ts`:

```ts
  async buildPartsOrderDocument(
    orgId: string,
    estimateId: string,
  ): Promise<PartsOrderDocument> {
    const estimate = await this.loadEstimate(orgId, estimateId);
    const { company, project } = await this.loadHeader(orgId, estimate);

    // Grouped by (description, unit, unitPrice) with quantities summed. Price is
    // part of the key on purpose: two lines with the same description at
    // different prices are genuinely different purchases and must stay apart.
    // Insertion order is preserved, which is generation order.
    const merged = new Map<string, PartsOrderLine>();
    let deliveryTotal = 0;

    for (const item of estimate.lineItems) {
      if (item.type !== "material") {
        continue;
      }
      // Delivery is a separately noted total rather than folded into unit
      // prices — a supplier quotes goods, and burying freight in a unit price
      // would misstate what is being ordered.
      deliveryTotal += item.deliveryCost;

      const key = `${item.description} ${item.unit ?? ""} ${item.unitPrice}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }
      merged.set(key, {
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        // A material line's unitPrice IS catalog cost: markup only ever happens
        // in aggregate, never per line. So this is correct by construction, not
        // by subtracting anything back out.
        unitPrice: item.unitPrice,
        lineTotal: 0,
      });
    }

    const lines = [...merged.values()].map((line) => ({
      ...line,
      quantity: roundQuantity(line.quantity),
      lineTotal: roundCents(line.quantity * line.unitPrice),
    }));

    // Pre-tax: the supplier charges their own sales tax, so quoting ours here
    // would double it on their invoice.
    const subtotal = roundCents(lines.reduce((acc, line) => acc + line.lineTotal, 0));
    const delivery = roundCents(deliveryTotal);

    return {
      company,
      project,
      title: estimate.title,
      createdAt: estimate.createdAt,
      lines,
      subtotal,
      deliveryTotal: delivery,
      total: roundCents(subtotal + delivery),
    };
  }
```

And beside `roundCents`'s import, a local helper (quantities are not money — resolved formula quantities come out as raw floats like `3.7375000000000003`):

```ts
/** Quantities are not money: three places, trailing noise from the formula engine trimmed. */
function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
```

- [ ] **Step 4: Run the test**

```bash
bun test packages/platform/src/documents/DocumentAssemblyServiceImpl.test.ts
```

Expected: PASS, all seventeen cases.

- [ ] **Step 5: Run everything and commit**

```bash
bun run typecheck && bun test && bun run lint
git add packages/platform
git commit -m "feat: derive a supplier parts order from an estimate"
```

---

### Task 12: Render the estimate PDF

Layout only. Every number arrives pre-computed and pre-rounded, so a template cannot disagree with the estimate. This task replaces the Task 1 spike.

**Files:**
- Create: `packages/worker/src/documents/templates/shared.tsx`, `templates/EstimatePdf.tsx`, `packages/worker/src/documents/render.tsx`
- Delete: `packages/worker/src/documents/spike.tsx`
- Test: `packages/worker/src/documents/render.test.tsx`

**Interfaces:**
- Consumes: `EstimateDocument`, `PartsOrderDocument`, `TAX_NOTE` (Task 9).
- Produces:
  - `renderEstimatePdf(doc: EstimateDocument): Promise<Uint8Array>`
  - `renderPartsOrderPdf(doc: PartsOrderDocument): Promise<Uint8Array>` (implemented in Task 13)
  - `formatCurrency(value: number): string`, `formatDate(iso: string): string`, `styles`, `DocumentHeader`, `PageFooter` in `shared.tsx`

If Task 1 selected `pdfmake`, keep the exported function signatures and the test exactly as written here and swap only the two template modules' internals for `pdfmake` document definitions.

- [ ] **Step 1: Write the failing test**

Not byte snapshots — embedded fonts and creation timestamps make those brittle. Assert the magic bytes, then extract the text layer and assert the figures, labels and page count.

```tsx
// packages/worker/src/documents/render.test.tsx
import { describe, expect, it } from "bun:test";
import type { EstimateDocument } from "@landscape/platform";
import { TAX_NOTE } from "@landscape/platform";
import { renderEstimatePdf } from "./render.tsx";
import { extractText, pageCount } from "./testSupport.ts";

const doc = (over: Partial<EstimateDocument> = {}): EstimateDocument => ({
  company: {
    businessName: "Verdant Landscapes",
    address: "100 Garden Way, Springfield, OR 97477",
    phone: "555-0100",
    email: "bids@verdant.example",
    licenseNumber: "CCB #123456",
    logo: null,
  },
  client: {
    name: "Ada Client",
    address: "12 Oak St",
    email: "ada@example.com",
    phone: "555-0111",
  },
  project: { name: "Oak St Rebuild", location: "12 Oak St" },
  title: "Estimate",
  createdAt: "2026-08-01T12:00:00.000Z",
  groups: [
    { label: "Irrigation", amount: 4601.56 },
    { label: "Planting", amount: 2310.4 },
  ],
  total: 6911.96,
  taxNote: TAX_NOTE,
  ...over,
});

describe("renderEstimatePdf", () => {
  it("produces a PDF", async () => {
    const bytes = await renderEstimatePdf(doc());

    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("prints the business name, the project and the client", async () => {
    const text = extractText(await renderEstimatePdf(doc()));

    expect(text).toContain("Verdant Landscapes");
    expect(text).toContain("Oak St Rebuild");
    expect(text).toContain("Ada Client");
  });

  it("prints one row per group and the grand total", async () => {
    const text = extractText(await renderEstimatePdf(doc()));

    expect(text).toContain("Irrigation");
    expect(text).toContain("$4,601.56");
    expect(text).toContain("Planting");
    expect(text).toContain("$2,310.40");
    expect(text).toContain("$6,911.96");
  });

  it("carries the tax footnote and shows no tax line", async () => {
    const text = extractText(await renderEstimatePdf(doc()));

    expect(text).toContain(TAX_NOTE);
    expect(text).not.toMatch(/^\s*Tax\b/m);
  });

  it("renders with no client and no logo rather than failing", async () => {
    const bytes = await renderEstimatePdf(doc({ client: null }));

    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("paginates a long estimate", async () => {
    const groups = Array.from({ length: 80 }, (_, i) => ({
      label: `Assembly ${i + 1}`,
      amount: 100 + i,
    }));
    const bytes = await renderEstimatePdf(
      doc({ groups, total: groups.reduce((a, g) => a + g.amount, 0) }),
    );

    expect(pageCount(bytes)).toBeGreaterThan(1);
  });
});
```

And the two helpers the test uses:

```ts
// packages/worker/src/documents/testSupport.ts
// Test-only readers for rendered PDFs. Byte snapshots would be brittle —
// embedded fonts and a creation timestamp change on every run — so tests assert
// the text layer and the page count instead.

/**
 * The document's visible text, recovered from its content streams. Good enough
 * to assert that a label and a formatted figure reached the page; not a general
 * PDF parser.
 */
export function extractText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks = raw.match(/\((?:\\.|[^()\\])*\)/g) ?? [];
  return chunks
    .map((chunk) => chunk.slice(1, -1).replace(/\\([()\\])/g, "$1"))
    .join("");
}

export function pageCount(bytes: Uint8Array): number {
  const raw = new TextDecoder("latin1").decode(bytes);
  return (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/worker/src/documents/render.test.tsx
```

Expected: FAIL — cannot resolve `./render.tsx`.

- [ ] **Step 3: Write the shared layout pieces**

```tsx
// packages/worker/src/documents/templates/shared.tsx
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocumentCompany, DocumentProject } from "@landscape/platform";

/**
 * Formatting and chrome shared by both documents.
 *
 * These functions format; they never compute. Every number arriving here has
 * already been rounded by DocumentAssemblyService, so `formatCurrency` is a pure
 * presentation step and a template can never disagree with the estimate.
 */
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatCurrency = (value: number): string => usd.format(value);

const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
export const formatQuantity = (value: number): string => qty.format(value);

const date = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
export const formatDate = (iso: string): string => date.format(new Date(iso));

export const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 10, color: "#1f2933" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  logo: { width: 96, maxHeight: 48, objectFit: "contain", marginBottom: 6 },
  businessName: { fontSize: 16, marginBottom: 2 },
  muted: { color: "#616e7c" },
  metaBlock: { alignItems: "flex-end", maxWidth: 200 },
  sectionTitle: { fontSize: 12, marginTop: 16, marginBottom: 6 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1f2933",
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd2d9",
    paddingVertical: 5,
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderTopColor: "#1f2933",
    paddingTop: 6,
    marginTop: 2,
  },
  grow: { flex: 1 },
  amount: { width: 90, textAlign: "right" },
  qtyCell: { width: 70, textAlign: "right" },
  unitCell: { width: 60 },
  priceCell: { width: 80, textAlign: "right" },
  note: { marginTop: 18, fontSize: 9, color: "#616e7c" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#616e7c",
    textAlign: "center",
  },
});

/**
 * Who is sending this, and about what. Renders whatever exists — an empty
 * business name or a missing logo degrades the header rather than failing the
 * document.
 */
export const DocumentHeader = ({
  company,
  project,
  title,
  createdAt,
}: {
  company: DocumentCompany;
  project: DocumentProject;
  title: string;
  createdAt: string;
}) => (
  <View style={styles.headerRow}>
    <View style={styles.grow}>
      {company.logo ? (
        <Image style={styles.logo} src={{ data: company.logo.data, format: imageFormat(company.logo.contentType) }} />
      ) : null}
      {company.businessName ? <Text style={styles.businessName}>{company.businessName}</Text> : null}
      {company.address ? <Text style={styles.muted}>{company.address}</Text> : null}
      {company.phone ? <Text style={styles.muted}>{company.phone}</Text> : null}
      {company.email ? <Text style={styles.muted}>{company.email}</Text> : null}
      {company.licenseNumber ? <Text style={styles.muted}>{company.licenseNumber}</Text> : null}
    </View>
    <View style={styles.metaBlock}>
      <Text style={styles.businessName}>{title}</Text>
      <Text style={styles.muted}>{formatDate(createdAt)}</Text>
      <Text>{project.name}</Text>
      {project.location ? <Text style={styles.muted}>{project.location}</Text> : null}
    </View>
  </View>
);

/** `fixed` so it repeats, with the page numbers resolved per page at layout time. */
export const PageFooter = ({ businessName }: { businessName: string }) => (
  <Text
    style={styles.footer}
    fixed
    render={({ pageNumber, totalPages }) =>
      `${businessName ? `${businessName} — ` : ""}Page ${pageNumber} of ${totalPages}`
    }
  />
);

// react-pdf needs the raw format name, not a MIME type, when given a byte buffer.
function imageFormat(contentType: string): "png" | "jpg" {
  return contentType === "image/png" ? "png" : "jpg";
}
```

- [ ] **Step 4: Write the estimate template**

```tsx
// packages/worker/src/documents/templates/EstimatePdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { EstimateDocument } from "@landscape/platform";
import { DocumentHeader, PageFooter, formatCurrency, styles } from "./shared.tsx";

/**
 * The client-facing bid: one row per assembly, no unit prices, no line detail.
 *
 * Holds no arithmetic. `groups` and `total` arrive pre-computed and pre-rounded
 * from DocumentAssemblyService, and there is no tax row by design — sales tax is
 * already inside every figure, so `taxNote` says so instead.
 */
export const EstimatePdf = ({ doc }: { doc: EstimateDocument }) => (
  <Document title={`${doc.title} — ${doc.project.name}`}>
    <Page size="LETTER" style={styles.page}>
      <DocumentHeader
        company={doc.company}
        project={doc.project}
        title={doc.title}
        createdAt={doc.createdAt}
      />

      {doc.client ? (
        <View>
          <Text style={styles.sectionTitle}>Prepared for</Text>
          <Text>{doc.client.name}</Text>
          {doc.client.address ? <Text style={styles.muted}>{doc.client.address}</Text> : null}
          {doc.client.email ? <Text style={styles.muted}>{doc.client.email}</Text> : null}
          {doc.client.phone ? <Text style={styles.muted}>{doc.client.phone}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Scope of work</Text>
      <View style={styles.tableHeader} fixed>
        <Text style={styles.grow}>Description</Text>
        <Text style={styles.amount}>Amount</Text>
      </View>

      {doc.groups.map((group) => (
        // wrap={false} keeps a row from splitting across a page break.
        <View key={group.label} style={styles.row} wrap={false}>
          <Text style={styles.grow}>{group.label}</Text>
          <Text style={styles.amount}>{formatCurrency(group.amount)}</Text>
        </View>
      ))}

      <View style={styles.totalRow} wrap={false}>
        <Text style={styles.grow}>Total</Text>
        <Text style={styles.amount}>{formatCurrency(doc.total)}</Text>
      </View>

      <Text style={styles.note}>{doc.taxNote}</Text>

      <PageFooter businessName={doc.company.businessName} />
    </Page>
  </Document>
);
```

- [ ] **Step 5: Write the render entry point**

```tsx
// packages/worker/src/documents/render.tsx
import { renderToBuffer } from "@react-pdf/renderer";
import type { EstimateDocument, PartsOrderDocument } from "@landscape/platform";
import { EstimatePdf } from "./templates/EstimatePdf.tsx";

/**
 * The only place the PDF engine is named. Takes a plain view model, returns
 * bytes — no repositories, no storage, no job knowledge. That narrowness is what
 * makes swapping the engine (react-pdf ↔ pdfmake) a two-file change.
 */
export async function renderEstimatePdf(
  doc: EstimateDocument,
): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<EstimatePdf doc={doc} />));
}

export async function renderPartsOrderPdf(
  _doc: PartsOrderDocument,
): Promise<Uint8Array> {
  throw new Error("not implemented");
}
```

- [ ] **Step 6: Run the test**

```bash
bun test packages/worker/src/documents/render.test.tsx
```

Expected: PASS, all six cases. If `extractText` returns nothing, the font is subsetting text into a CID stream — switch the assertion helper to check `pageCount` plus `bytes.byteLength`, and verify the figures once by eye against a written-out `/tmp/estimate.pdf`, noting that in the test file.

- [ ] **Step 7: Delete the spike**

```bash
git rm packages/worker/src/documents/spike.tsx
```

- [ ] **Step 8: Run everything and commit**

```bash
bun run typecheck && bun test && bun run lint
git add -A packages/worker
git commit -m "feat: render the client-facing estimate PDF"
```

---

### Task 13: Render the parts order PDF

**Files:**
- Create: `packages/worker/src/documents/templates/PartsOrderPdf.tsx`
- Modify: `packages/worker/src/documents/render.tsx`
- Test: `packages/worker/src/documents/render.test.tsx`

**Interfaces:**
- Consumes: `PartsOrderDocument`, `shared.tsx` (Task 12).
- Produces: a working `renderPartsOrderPdf`.

- [ ] **Step 1: Write the failing test**

Append to `render.test.tsx`:

```tsx
const partsDoc = (over: Partial<PartsOrderDocument> = {}): PartsOrderDocument => ({
  company: doc().company,
  project: { name: "Oak St Rebuild", location: "12 Oak St" },
  title: "Parts order",
  createdAt: "2026-08-01T12:00:00.000Z",
  lines: [
    { description: "1in PVC pipe", unit: "ft", quantity: 25, unitPrice: 2, lineTotal: 50 },
    { description: "Shrub, 5 gal", unit: "ea", quantity: 6, unitPrice: 18, lineTotal: 108 },
  ],
  subtotal: 158,
  deliveryTotal: 12,
  total: 170,
  ...over,
});

describe("renderPartsOrderPdf", () => {
  it("produces a PDF", async () => {
    const bytes = await renderPartsOrderPdf(partsDoc());

    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("prints each material with its quantity, unit price and line total", async () => {
    const text = extractText(await renderPartsOrderPdf(partsDoc()));

    expect(text).toContain("1in PVC pipe");
    expect(text).toContain("25");
    expect(text).toContain("$2.00");
    expect(text).toContain("$50.00");
  });

  it("shows delivery as its own line, not folded into unit prices", async () => {
    const text = extractText(await renderPartsOrderPdf(partsDoc()));

    expect(text).toContain("Delivery");
    expect(text).toContain("$12.00");
    expect(text).toContain("$170.00");
  });

  it("carries no tax note — the supplier charges their own", async () => {
    const text = extractText(await renderPartsOrderPdf(partsDoc()));

    expect(text).not.toContain(TAX_NOTE);
  });

  it("paginates a long order with a repeating header", async () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({
      description: `Material ${i + 1}`,
      unit: "ea",
      quantity: i + 1,
      unitPrice: 3,
      lineTotal: (i + 1) * 3,
    }));
    const bytes = await renderPartsOrderPdf(
      partsDoc({ lines, subtotal: 7455, deliveryTotal: 0, total: 7455 }),
    );

    expect(pageCount(bytes)).toBeGreaterThan(1);
  });
});
```

Add `renderPartsOrderPdf` and `PartsOrderDocument` to the file's imports.

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/worker/src/documents/render.test.tsx
```

Expected: FAIL — five failures, all `not implemented`.

- [ ] **Step 3: Write the template**

```tsx
// packages/worker/src/documents/templates/PartsOrderPdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PartsOrderDocument } from "@landscape/platform";
import {
  DocumentHeader,
  PageFooter,
  formatCurrency,
  formatQuantity,
  styles,
} from "./shared.tsx";

/**
 * The supplier-facing materials list: what to pull, at cost.
 *
 * Deliberately unlike the estimate. It carries unit prices (a supplier needs
 * them), no assembly grouping (a supplier doesn't care which phase a pipe is
 * for), no markup, and no tax note — the supplier charges their own tax, so
 * quoting ours would double it on their invoice. Delivery is its own line.
 */
export const PartsOrderPdf = ({ doc }: { doc: PartsOrderDocument }) => (
  <Document title={`${doc.title} — ${doc.project.name}`}>
    <Page size="LETTER" style={styles.page}>
      <DocumentHeader
        company={doc.company}
        project={doc.project}
        title={doc.title}
        createdAt={doc.createdAt}
      />

      <View style={styles.tableHeader} fixed>
        <Text style={styles.grow}>Material</Text>
        <Text style={styles.qtyCell}>Qty</Text>
        <Text style={styles.unitCell}>Unit</Text>
        <Text style={styles.priceCell}>Unit price</Text>
        <Text style={styles.amount}>Total</Text>
      </View>

      {doc.lines.map((line) => (
        <View key={`${line.description}-${line.unitPrice}`} style={styles.row} wrap={false}>
          <Text style={styles.grow}>{line.description}</Text>
          <Text style={styles.qtyCell}>{formatQuantity(line.quantity)}</Text>
          <Text style={styles.unitCell}>{line.unit ?? ""}</Text>
          <Text style={styles.priceCell}>{formatCurrency(line.unitPrice)}</Text>
          <Text style={styles.amount}>{formatCurrency(line.lineTotal)}</Text>
        </View>
      ))}

      <View style={styles.row} wrap={false}>
        <Text style={styles.grow}>Subtotal</Text>
        <Text style={styles.amount}>{formatCurrency(doc.subtotal)}</Text>
      </View>
      <View style={styles.row} wrap={false}>
        <Text style={styles.grow}>Delivery</Text>
        <Text style={styles.amount}>{formatCurrency(doc.deliveryTotal)}</Text>
      </View>
      <View style={styles.totalRow} wrap={false}>
        <Text style={styles.grow}>Total</Text>
        <Text style={styles.amount}>{formatCurrency(doc.total)}</Text>
      </View>

      <PageFooter businessName={doc.company.businessName} />
    </Page>
  </Document>
);
```

- [ ] **Step 4: Wire it into the render entry point**

In `packages/worker/src/documents/render.tsx`, replace the stub:

```tsx
export async function renderPartsOrderPdf(
  doc: PartsOrderDocument,
): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<PartsOrderPdf doc={doc} />));
}
```

- [ ] **Step 5: Run the test**

```bash
bun test packages/worker/src/documents/render.test.tsx
```

Expected: PASS, all eleven cases.

- [ ] **Step 6: Eyeball both documents once**

```bash
bun -e '
import { renderEstimatePdf } from "./packages/worker/src/documents/render.tsx";
import { TAX_NOTE } from "./packages/platform/src/index.ts";
const bytes = await renderEstimatePdf({
  company: { businessName: "Verdant Landscapes", address: "100 Garden Way", phone: "555-0100", email: "bids@verdant.example", licenseNumber: "CCB #123456", logo: null },
  client: { name: "Ada Client", address: "12 Oak St", email: null, phone: null },
  project: { name: "Oak St Rebuild", location: "12 Oak St" },
  title: "Estimate", createdAt: "2026-08-01T12:00:00.000Z",
  groups: [{ label: "Irrigation", amount: 4601.56 }, { label: "Planting", amount: 2310.4 }],
  total: 6911.96, taxNote: TAX_NOTE,
});
await Bun.write("/tmp/estimate.pdf", bytes);
'
open /tmp/estimate.pdf
```

Expected: a readable one-page bid — header block, "Prepared for", two rows, a ruled Total, the tax footnote, and a centred page footer. Automated tests cannot judge whether it looks like a document a contractor would send; this step is the check that it does.

- [ ] **Step 7: Commit**

```bash
git add packages/worker
git commit -m "feat: render the supplier parts order PDF"
```

---

### Task 14: The render job handler

Assemble → render → put → return `{ storageKey, byteSize }`. One handler class parameterised by document kind, registered twice.

**Files:**
- Create: `packages/worker/src/jobs/handlers/renderDocument.ts`
- Modify: `packages/worker/src/jobs/jobTypes.ts`, `registry.ts`
- Test: `packages/worker/src/jobs/handlers/renderDocument.test.ts`

**Interfaces:**
- Consumes: `DocumentAssemblyService` (Task 10/11), `renderEstimatePdf`/`renderPartsOrderPdf` (Tasks 12/13), `ObjectStorage` (Task 6), `documentObjectKey` (Task 9), `JobHandler`/`PoisonJobError` (Task 5).
- Produces:
  - `JOB_TYPES.RENDER_ESTIMATE_PDF = "renderEstimatePdf"`, `JOB_TYPES.RENDER_PARTS_ORDER_PDF = "renderPartsOrderPdf"`, `QUEUES.DOCUMENT_RENDER = "document-render-queue"`
  - `renderJobPayloadSchema` → `{ orgId, estimateId, updatedAt, formulaVersion }`
  - `RenderResult { storageKey: string; byteSize: number }`
  - `RenderEstimatePdfHandler`, `RenderPartsOrderPdfHandler`

- [ ] **Step 1: Write the failing test**

```ts
// packages/worker/src/jobs/handlers/renderDocument.test.ts
import { describe, expect, it, mock } from "bun:test";
import { MissingEstimateError } from "@landscape/platform";
import { makeJob, makeObjectStorageFake } from "@landscape/platform/test-support";
import { PoisonJobError } from "../PoisonJobError.ts";
import { RenderEstimatePdfHandler } from "./renderDocument.ts";

const noopLogger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {},
  child: () => noopLogger,
} as never;

const PAYLOAD = {
  orgId: "org_1",
  estimateId: "est_1",
  updatedAt: "2026-08-01T12:00:00.000Z",
  formulaVersion: 1,
};
const EXPECTED_KEY = "orgs/org_1/estimates/est_1/1785585600000-f1/estimate.pdf";

const assembly = (over = {}) =>
  ({
    buildEstimateDocument: mock(async () => ({ title: "Estimate" })),
    buildPartsOrderDocument: mock(async () => ({ title: "Parts order" })),
    ...over,
  }) as never;

const renderer = mock(async () => new Uint8Array([37, 80, 68, 70, 1, 2, 3]));

describe("RenderEstimatePdfHandler", () => {
  it("assembles, renders and stores the document at the versioned key", async () => {
    const storage = makeObjectStorageFake();
    const handler = new RenderEstimatePdfHandler(assembly(), storage, noopLogger, renderer);

    await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(storage.objects.get(EXPECTED_KEY)).toEqual({
      bytes: new Uint8Array([37, 80, 68, 70, 1, 2, 3]),
      contentType: "application/pdf",
    });
  });

  it("returns the storage key and size, which is what the download link reads", async () => {
    const handler = new RenderEstimatePdfHandler(
      assembly(), makeObjectStorageFake(), noopLogger, renderer,
    );

    const result = await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(result).toEqual({ storageKey: EXPECTED_KEY, byteSize: 7 });
  });

  it("loads the estimate org-scoped, from the payload's org", async () => {
    const build = mock(async () => ({ title: "Estimate" }));
    const handler = new RenderEstimatePdfHandler(
      assembly({ buildEstimateDocument: build }), makeObjectStorageFake(), noopLogger, renderer,
    );

    await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(build).toHaveBeenCalledWith("org_1", "est_1");
  });

  it("is poison when the estimate is gone — a retry cannot help", async () => {
    const handler = new RenderEstimatePdfHandler(
      assembly({
        buildEstimateDocument: mock(async () => {
          throw new MissingEstimateError("est_1");
        }),
      }),
      makeObjectStorageFake(), noopLogger, renderer,
    );

    expect(handler.handle(makeJob({ payload: PAYLOAD }))).rejects.toThrow(PoisonJobError);
  });

  it("is poison when the payload doesn't parse", async () => {
    const handler = new RenderEstimatePdfHandler(
      assembly(), makeObjectStorageFake(), noopLogger, renderer,
    );

    expect(handler.handle(makeJob({ payload: { nonsense: true } }))).rejects.toThrow(
      PoisonJobError,
    );
  });

  it("lets a storage failure through as transient, so the queue retries", async () => {
    const storage = makeObjectStorageFake({
      put: mock(async () => {
        throw new Error("503 backend error");
      }),
    });
    const handler = new RenderEstimatePdfHandler(assembly(), storage, noopLogger, renderer);

    expect(handler.handle(makeJob({ payload: PAYLOAD }))).rejects.toThrow("503 backend error");
    expect(handler.handle(makeJob({ payload: PAYLOAD }))).rejects.not.toThrow(PoisonJobError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/worker/src/jobs/handlers/renderDocument.test.ts
```

Expected: FAIL — cannot resolve `./renderDocument.ts`.

- [ ] **Step 3: Write the handler**

```ts
// packages/worker/src/jobs/handlers/renderDocument.ts
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  DOCUMENT_ASSEMBLY_SERVICE_TOKEN,
  LOGGER_TOKEN,
  MissingEstimateError,
  OBJECT_STORAGE_TOKEN,
  ESTIMATE_PDF_FILE,
  PARTS_ORDER_PDF_FILE,
  documentObjectKey,
  type DocumentAssemblyService,
  type Job,
  type Logger,
  type ObjectStorage,
} from "@landscape/platform";
import { renderEstimatePdf, renderPartsOrderPdf } from "../../documents/render.tsx";
import type { JobHandler } from "../JobHandler.ts";
import { PoisonJobError } from "../PoisonJobError.ts";

/**
 * What a render job carries. The version components are in the payload rather
 * than re-read from the estimate on purpose: the job, its object key and its
 * dedup key must all describe the SAME version, even if the estimate is edited
 * while the job sits in the queue.
 */
export const renderJobPayloadSchema = z.object({
  orgId: z.string().min(1),
  estimateId: z.string().min(1),
  updatedAt: z.string().min(1),
  formulaVersion: z.number().int().positive(),
});

/** Persisted as the job's `result`. The download link reads `storageKey`. */
export interface RenderResult {
  storageKey: string;
  byteSize: number;
}

type Assemble = (
  service: DocumentAssemblyService,
  orgId: string,
  estimateId: string,
) => Promise<unknown>;

/**
 * Assemble → render → put. The whole render pipeline, in that order and nothing
 * else: all the logic is upstream in DocumentAssemblyService, all the layout is
 * downstream in the templates.
 *
 * Idempotent by construction — the object key is derived from the estimate's
 * version, so a redelivery overwrites the same bytes at the same key.
 *
 * Failure classification is the one judgement here. A missing estimate or an
 * unparseable payload can never succeed however many times it runs, so it is
 * poison (recorded, then acked). Anything else — a storage blip, a render
 * crash — is left to propagate as transient so the queue retries per policy.
 */
abstract class RenderDocumentHandler implements JobHandler {
  constructor(
    protected readonly assembly: DocumentAssemblyService,
    protected readonly storage: ObjectStorage,
    protected readonly logger: Logger,
  ) {}

  protected abstract readonly file: string;
  protected abstract build(orgId: string, estimateId: string): Promise<Uint8Array>;

  async handle(job: Job): Promise<RenderResult> {
    const parsed = renderJobPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      throw new PoisonJobError(`malformed render payload: ${parsed.error.message}`);
    }
    const { orgId, estimateId, updatedAt, formulaVersion } = parsed.data;

    let bytes: Uint8Array;
    try {
      bytes = await this.build(orgId, estimateId);
    } catch (error) {
      if (error instanceof MissingEstimateError) {
        // Deleted, or not this org. Retrying cannot bring it back.
        throw new PoisonJobError(error.message);
      }
      throw error;
    }

    const storageKey = documentObjectKey(
      orgId,
      estimateId,
      updatedAt,
      formulaVersion,
      this.file,
    );
    // Same key, idempotent overwrite — so a retry after a partial failure is
    // safe and leaves no orphan.
    await this.storage.put(storageKey, bytes, "application/pdf");

    this.logger.info({ storageKey, byteSize: bytes.byteLength }, "document rendered");
    return { storageKey, byteSize: bytes.byteLength };
  }
}

@injectable()
export class RenderEstimatePdfHandler extends RenderDocumentHandler {
  protected readonly file = ESTIMATE_PDF_FILE;

  constructor(
    @inject(DOCUMENT_ASSEMBLY_SERVICE_TOKEN) assembly: DocumentAssemblyService,
    @inject(OBJECT_STORAGE_TOKEN) storage: ObjectStorage,
    @inject(LOGGER_TOKEN) logger: Logger,
    // Injected so a test can render without the PDF engine; defaulted so
    // production wiring stays a plain container resolution.
    private readonly render = renderEstimatePdf,
  ) {
    super(assembly, storage, logger);
  }

  protected async build(orgId: string, estimateId: string): Promise<Uint8Array> {
    return this.render(await this.assembly.buildEstimateDocument(orgId, estimateId));
  }
}

@injectable()
export class RenderPartsOrderPdfHandler extends RenderDocumentHandler {
  protected readonly file = PARTS_ORDER_PDF_FILE;

  constructor(
    @inject(DOCUMENT_ASSEMBLY_SERVICE_TOKEN) assembly: DocumentAssemblyService,
    @inject(OBJECT_STORAGE_TOKEN) storage: ObjectStorage,
    @inject(LOGGER_TOKEN) logger: Logger,
    private readonly render = renderPartsOrderPdf,
  ) {
    super(assembly, storage, logger);
  }

  protected async build(orgId: string, estimateId: string): Promise<Uint8Array> {
    return this.render(await this.assembly.buildPartsOrderDocument(orgId, estimateId));
  }
}
```

Note the test constructs the handler positionally with a fake renderer as the fourth argument; keep that parameter order.

- [ ] **Step 4: Run the test**

```bash
bun test packages/worker/src/jobs/handlers/renderDocument.test.ts
```

Expected: PASS, all six cases.

- [ ] **Step 5: Add the job types and queue**

In `packages/worker/src/jobs/jobTypes.ts`:

```ts
export const JOB_TYPES = {
  SEED_ORG: "seedOrg",
  SYNC_USER: "syncUser",
  RENDER_ESTIMATE_PDF: "renderEstimatePdf",
  RENDER_PARTS_ORDER_PDF: "renderPartsOrderPdf",
} as const;
```

```ts
export const QUEUES = {
  ORG_SEED: "org-seed-queue",
  USER_SYNC: "user-sync-queue",
  // Both document kinds share one queue: they fail for the same reasons (a
  // render crash, a storage blip) and deserve the same retry policy.
  DOCUMENT_RENDER: "document-render-queue",
} as const;
```

- [ ] **Step 6: Register the handlers**

In `packages/worker/src/jobs/registry.ts`, extend the constructor and the map:

```ts
  constructor(
    syncUser: SyncUserHandler,
    seedOrg: SeedOrgHandler,
    renderEstimate: RenderEstimatePdfHandler,
    renderPartsOrder: RenderPartsOrderPdfHandler,
  ) {
    this.handlers = new Map<string, JobHandler>([
      [JOB_TYPES.SYNC_USER, syncUser],
      [JOB_TYPES.SEED_ORG, seedOrg],
      [JOB_TYPES.RENDER_ESTIMATE_PDF, renderEstimate],
      [JOB_TYPES.RENDER_PARTS_ORDER_PDF, renderPartsOrder],
    ]);
  }
```

- [ ] **Step 7: Confirm the container can build a render handler**

The handlers have a defaulted constructor parameter, which tsyringe must not try to resolve.

```bash
bun -e '
import "reflect-metadata";
import { container } from "./packages/worker/src/container.ts";
import { JobHandlerRegistry } from "./packages/worker/src/jobs/registry.ts";
process.env.DOCUMENTS_BUCKET ??= "landscape-documents-local";
const registry = container.resolve(JobHandlerRegistry);
console.log("estimate handler:", registry.get("renderEstimatePdf")?.constructor.name);
console.log("parts handler:", registry.get("renderPartsOrderPdf")?.constructor.name);
'
```

Expected: prints `RenderEstimatePdfHandler` and `RenderPartsOrderPdfHandler`. If tsyringe fails on the defaulted parameter, drop the parameter and have each subclass call the module function directly, injecting the renderer via a protected method the test overrides with a subclass instead.

- [ ] **Step 8: Run everything and commit**

```bash
bun run typecheck && bun test && bun run lint
git add packages/worker
git commit -m "feat: run document renders as background jobs"
```

---

### Task 15: `DocumentJobService` and the `documents` router

The API side of the pipeline: org-scoped load, dedup key, `enqueuePending`, then the short-circuit — if the row already succeeded, mint the URL and return it without touching the queue. A second click on an unedited estimate is one Mongo read and a signed URL: no render, no queue hop.

This task also moves the job vocabulary into `platform`, because the API is now the second entrypoint that enqueues.

**Files:**
- Move: `packages/worker/src/jobs/jobTypes.ts` → `packages/platform/src/jobs/jobTypes.ts`; `packages/worker/src/jobs/taskKey.ts` → `packages/platform/src/jobs/taskKey.ts`
- Create: `packages/platform/src/registerTaskQueue.ts`
- Create: `packages/api/src/services/DocumentJobService/{DocumentJobService.ts,DocumentJobServiceImpl.ts,DocumentJobServiceImpl.test.ts}`
- Create: `packages/api/src/routers/documents.ts`
- Modify: `packages/platform/package.json`, `src/index.ts`, `src/registerWebhookCore.ts`
- Modify: `packages/api/src/services/{index.ts,tokens.ts}`, `src/context.ts`, `src/createContext.ts`, `src/router.ts`, `packages/api/package.json`
- Modify: `packages/worker/src/{ingest/handler.ts,jobs/runJob.ts,jobs/registry.ts,ingest/eventRouting.ts}` (import sites only)

**Interfaces:**
- Consumes: `JobRepository`, `TaskQueue`, `ObjectStorage`, `EstimateRepository`, `estimateDedupKey`, `PRICING_FORMULA_VERSION`, `renderJobPayloadSchema`'s shape.
- Produces:
  - `DocumentJobView { jobId: string; status: JobStatus; url: string | null }`
  - `DocumentJobService { requestEstimatePdf(orgId, estimateId): Promise<DocumentJobView>; requestPartsOrderPdf(orgId, estimateId): Promise<DocumentJobView>; status(orgId, jobId): Promise<DocumentJobView> }`
  - `DOCUMENT_JOB_SERVICE_TOKEN = "DocumentJobService"`
  - tRPC: `documents.requestEstimatePdf`, `documents.requestPartsOrderPdf`, `documents.status`
  - `registerTaskQueue(container)`, exported from `@landscape/platform/tasks`

- [ ] **Step 1: Move the job vocabulary into platform**

`JOB_TYPES`, `QUEUES` and `taskName` are no longer worker-private — the API enqueues too, and a job type or queue name that drifts between the two would silently route work nowhere.

```bash
mkdir -p packages/platform/src/jobs
git mv packages/worker/src/jobs/jobTypes.ts packages/platform/src/jobs/jobTypes.ts
git mv packages/worker/src/jobs/taskKey.ts packages/platform/src/jobs/taskKey.ts
```

Export both from `packages/platform/src/index.ts`:

```ts
// Jobs: the shared vocabulary both entrypoints enqueue against. Keeping it here
// is what stops the API's job type and the worker's registry key from drifting.
export * from "./jobs/jobTypes.ts";
export * from "./jobs/taskKey.ts";
```

Update the worker's imports (`registry.ts`, `ingest/eventRouting.ts`, `ingest/handler.ts`, `jobs/runJob.ts`) to pull `JOB_TYPES`, `QUEUES`, `taskName` and `taskBodySchema` from `@landscape/platform`. Update `jobTypes.ts`'s doc comment, whose second paragraph still says "the queue names deploy.sh must create" — that stays true; add that the API reads the same table.

- [ ] **Step 2: Extract the task-queue registration**

```ts
// packages/platform/src/registerTaskQueue.ts
import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "./config/appConfig.ts";
import { TASKS_CONFIG_TOKEN, loadTasksConfig } from "./integrations/tasks/tasksConfig.ts";
import { CloudTasksQueue } from "./integrations/tasks/CloudTasksQueue.ts";
import { InlineTaskQueue } from "./integrations/tasks/InlineTaskQueue.ts";
import { TASK_QUEUE_TOKEN } from "./integrations/tokens.ts";

/**
 * Registers the async job queue. Split out of registerWebhookCore because the
 * API now enqueues too (document renders) while still having no business with
 * webhook verification — the same all-or-nothing coupling the per-slice config
 * work removed.
 *
 * Imported from its own entry, NOT the /server barrel, because it statically
 * pulls the Cloud Tasks + google-auth SDKs.
 *
 * Call AFTER registerServerCore: the adapter choice reads AppConfig.
 */
export function registerTaskQueue(container: DependencyContainer): void {
  container.register(TASKS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadTasksConfig()),
  });

  // Environment picks the queue. Resolved lazily inside the factory so the Cloud
  // Tasks config is only validated when that adapter is actually chosen — local
  // dev must not be made to supply a GCP project id.
  container.register(TASK_QUEUE_TOKEN, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const { environment } = dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
      return environment === "local"
        ? dependencyContainer.resolve(InlineTaskQueue)
        : dependencyContainer.resolve(CloudTasksQueue);
    }),
  });
}
```

In `packages/platform/src/registerWebhookCore.ts`, delete the tasks-config and `TASK_QUEUE_TOKEN` blocks and call `registerTaskQueue(container)` instead, keeping the verifier and `TASK_AUTHENTICATOR_TOKEN` registrations. Add the subpath export to `packages/platform/package.json`:

```json
    "./tasks": "./src/registerTaskQueue.ts",
```

- [ ] **Step 3: Point the API's container at the queue**

`InlineTaskQueue` posts to `http://localhost:${PORT}/tasks/...`, which is the **worker's** port, not the API's. In `packages/api/src/services/index.ts` (the API's composition root), after `registerServerCore(container)`:

```ts
// Imported from its own entry — NOT the /server barrel — because it statically
// pulls the Cloud Tasks + google-auth SDKs. The API enqueues document renders.
import { registerTaskQueue } from "@landscape/platform/tasks";
// ...
registerTaskQueue(container);
```

Add `WORKER_URL` handling for local dev: `InlineTaskQueue` currently derives its target from `process.env.PORT`, which is correct only inside the worker. Change it to read the worker's base URL explicitly:

```ts
    const base = process.env.WORKER_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
    const url = `${base}/tasks/${request.jobType}`;
```

and set `WORKER_URL=http://localhost:3001` in `packages/api/.env`.

- [ ] **Step 4: Write the failing test**

```ts
// packages/api/src/services/DocumentJobService/DocumentJobServiceImpl.test.ts
import { describe, expect, it, mock } from "bun:test";
import { PRICING_FORMULA_VERSION } from "@landscape/domain";
import {
  makeEstimate,
  makeEstimateRepoMock,
  makeJob,
  makeJobRepoMock,
  makeObjectStorageFake,
} from "@landscape/platform/test-support";
import { ServiceError } from "../errors.ts";
import { DocumentJobServiceImpl } from "./DocumentJobServiceImpl.ts";

const UPDATED_AT = "2026-08-01T12:00:00.000Z";
const MILLIS = 1785585600000;
const DEDUP_KEY = `estimate:estimate_1:${MILLIS}:${PRICING_FORMULA_VERSION}`;
const STORAGE_KEY = `orgs/org_1/estimates/estimate_1/${MILLIS}-f${PRICING_FORMULA_VERSION}/estimate.pdf`;

const build = (over: {
  estimate?: ReturnType<typeof makeEstimate> | null;
  job?: ReturnType<typeof makeJob>;
  found?: ReturnType<typeof makeJob> | null;
} = {}) => {
  const estimate =
    over.estimate === undefined ? makeEstimate({ updatedAt: UPDATED_AT }) : over.estimate;
  const enqueued = over.job ?? makeJob({ status: "pending", dedupKey: DEDUP_KEY });
  const jobs = makeJobRepoMock({
    enqueuePending: mock(async () => enqueued),
    findForOrg: mock(async () => over.found ?? null),
  });
  const queue = { enqueue: mock(async () => {}) };
  const storage = makeObjectStorageFake();
  const service = new DocumentJobServiceImpl(
    makeEstimateRepoMock({ findById: mock(async () => estimate) }),
    jobs,
    queue,
    storage,
  );
  return { service, jobs, queue, storage };
};

describe("DocumentJobServiceImpl.requestEstimatePdf", () => {
  it("keys the job on the estimate, its version and the formula version", async () => {
    const { service, jobs } = build();

    await service.requestEstimatePdf("org_1", "estimate_1");

    expect(jobs.enqueuePending).toHaveBeenCalledWith({
      jobType: "renderEstimatePdf",
      dedupKey: DEDUP_KEY,
      orgId: "org_1",
      payload: {
        orgId: "org_1",
        estimateId: "estimate_1",
        updatedAt: UPDATED_AT,
        formulaVersion: PRICING_FORMULA_VERSION,
      },
    });
  });

  it("enqueues a task and reports pending when the job is new", async () => {
    const { service, queue } = build();

    const result = await service.requestEstimatePdf("org_1", "estimate_1");

    expect(result).toEqual({ jobId: "job_1", status: "pending", url: null });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("short-circuits an already-succeeded job to a URL, without touching the queue", async () => {
    const { service, queue } = build({
      job: makeJob({
        status: "succeeded",
        dedupKey: DEDUP_KEY,
        result: { storageKey: STORAGE_KEY, byteSize: 2048 },
      }),
    });

    const result = await service.requestEstimatePdf("org_1", "estimate_1");

    expect(result.status).toBe("succeeded");
    expect(result.url).toBe(`https://signed.test/${STORAGE_KEY}`);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("re-enqueues a failed job so a retry is possible", async () => {
    const { service, queue } = build({
      job: makeJob({ status: "failed", attempts: 2, dedupKey: DEDUP_KEY }),
    });

    await service.requestEstimatePdf("org_1", "estimate_1");

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("a formula-version bump invalidates the cache", async () => {
    // Same estimate, untouched updatedAt: the key must still move when the
    // buildup changes, or the PDF would keep showing superseded figures.
    const { service, jobs } = build();
    await service.requestEstimatePdf("org_1", "estimate_1");
    const [{ dedupKey }] = (jobs.enqueuePending as never as { mock: { calls: [{ dedupKey: string }][] } })
      .mock.calls[0];

    expect(dedupKey.endsWith(`:${PRICING_FORMULA_VERSION}`)).toBe(true);
    expect(dedupKey).not.toBe(`estimate:estimate_1:${MILLIS}:${PRICING_FORMULA_VERSION + 1}`);
  });

  it("rejects an estimate from another org as not found", async () => {
    const { service } = build({ estimate: null });

    expect(service.requestEstimatePdf("org_1", "someone_elses")).rejects.toThrow(ServiceError);
  });
});

describe("DocumentJobServiceImpl.requestPartsOrderPdf", () => {
  it("shares the dedup key but uses its own job type, so the two never collide", async () => {
    const { service, jobs } = build();

    await service.requestPartsOrderPdf("org_1", "estimate_1");

    expect(jobs.enqueuePending).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: "renderPartsOrderPdf", dedupKey: DEDUP_KEY }),
    );
  });
});

describe("DocumentJobServiceImpl.status", () => {
  it("returns a URL once the job has succeeded", async () => {
    const { service } = build({
      found: makeJob({ status: "succeeded", result: { storageKey: STORAGE_KEY, byteSize: 10 } }),
    });

    expect(await service.status("org_1", "job_1")).toEqual({
      jobId: "job_1",
      status: "succeeded",
      url: `https://signed.test/${STORAGE_KEY}`,
    });
  });

  it("reports a failure without leaking the stored error text", async () => {
    const { service } = build({
      found: makeJob({ status: "failed", lastError: "MongoServerError: connection string ..." }),
    });

    const result = await service.status("org_1", "job_1");

    expect(result).toEqual({ jobId: "job_1", status: "failed", url: null });
    expect(JSON.stringify(result)).not.toContain("MongoServerError");
  });

  it("is not found for another org's job", async () => {
    const { service } = build({ found: null });

    expect(service.status("org_1", "job_1")).rejects.toThrow(ServiceError);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

```bash
bun test packages/api/src/services/DocumentJobService/DocumentJobServiceImpl.test.ts
```

Expected: FAIL — cannot resolve `./DocumentJobServiceImpl.ts`.

- [ ] **Step 6: Write the port**

```ts
// packages/api/src/services/DocumentJobService/DocumentJobService.ts
import type { JobStatus } from "@landscape/platform";

export type { JobStatus };

/**
 * What the client sees of a document job. `url` is present only once the job has
 * succeeded, and is minted fresh on every read — signed URLs are short-lived and
 * never stored.
 *
 * There is deliberately no error field. A failed job's `lastError` can carry
 * internals (connection strings, stack text), so the UI shows a generic message
 * keyed off `status` instead and the text never crosses the wire.
 */
export interface DocumentJobView {
  jobId: string;
  status: JobStatus;
  url: string | null;
}

export interface DocumentJobService {
  requestEstimatePdf(orgId: string, estimateId: string): Promise<DocumentJobView>;
  requestPartsOrderPdf(orgId: string, estimateId: string): Promise<DocumentJobView>;
  status(orgId: string, jobId: string): Promise<DocumentJobView>;
}
```

- [ ] **Step 7: Write the implementation**

```ts
// packages/api/src/services/DocumentJobService/DocumentJobServiceImpl.ts
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { PRICING_FORMULA_VERSION } from "@landscape/domain";
import {
  ESTIMATE_REPOSITORY_TOKEN,
  JOB_REPOSITORY_TOKEN,
  JOB_TYPES,
  OBJECT_STORAGE_TOKEN,
  QUEUES,
  TASK_QUEUE_TOKEN,
  estimateDedupKey,
  taskName,
  type Estimate,
  type EstimateRepository,
  type Job,
  type JobRepository,
  type ObjectStorage,
  type TaskQueue,
} from "@landscape/platform";
import { ServiceError } from "../errors.ts";
import type { DocumentJobService, DocumentJobView } from "./DocumentJobService.ts";

/** The `result` a render handler records. Validated, not trusted. */
const renderResultSchema = z.object({
  storageKey: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
});

/** What the download is called once it reaches the user's disk. */
const FILENAME: Record<string, (estimate: Estimate) => string> = {
  [JOB_TYPES.RENDER_ESTIMATE_PDF]: (estimate) => `${estimate.title}.pdf`,
  [JOB_TYPES.RENDER_PARTS_ORDER_PDF]: (estimate) => `${estimate.title} — parts order.pdf`,
};

@injectable()
export class DocumentJobServiceImpl implements DocumentJobService {
  constructor(
    @inject(ESTIMATE_REPOSITORY_TOKEN)
    private readonly estimates: EstimateRepository,
    @inject(JOB_REPOSITORY_TOKEN)
    private readonly jobs: JobRepository,
    @inject(TASK_QUEUE_TOKEN)
    private readonly queue: TaskQueue,
    @inject(OBJECT_STORAGE_TOKEN)
    private readonly storage: ObjectStorage,
  ) {}

  requestEstimatePdf(orgId: string, estimateId: string): Promise<DocumentJobView> {
    return this.request(orgId, estimateId, JOB_TYPES.RENDER_ESTIMATE_PDF);
  }

  requestPartsOrderPdf(orgId: string, estimateId: string): Promise<DocumentJobView> {
    return this.request(orgId, estimateId, JOB_TYPES.RENDER_PARTS_ORDER_PDF);
  }

  async status(orgId: string, jobId: string): Promise<DocumentJobView> {
    // Org-scoped by signature: there is no unscoped find-by-id to reach for, so
    // a cross-tenant poll can't be written by accident.
    const job = await this.jobs.findForOrg(orgId, jobId);
    if (!job) {
      throw new ServiceError("NOT_FOUND", "Document job not found");
    }
    return this.toView(job, jobId);
  }

  private async request(
    orgId: string,
    estimateId: string,
    jobType: string,
  ): Promise<DocumentJobView> {
    const estimate = await this.estimates.findById(orgId, estimateId);
    if (!estimate) {
      // Org-scoped read, so a cross-org id is NOT_FOUND rather than FORBIDDEN —
      // it must not be identifiable as "exists, elsewhere".
      throw new ServiceError("NOT_FOUND", "Estimate not found");
    }

    // Both document kinds share this key and differ only by jobType, which is
    // part of the collection's unique index — so they never collide.
    const dedupKey = estimateDedupKey(
      estimateId,
      estimate.updatedAt,
      PRICING_FORMULA_VERSION,
    );

    // $setOnInsert: an existing row comes back exactly as it was left, which is
    // what makes the short-circuit below safe.
    const job = await this.jobs.enqueuePending({
      jobType,
      dedupKey,
      orgId,
      payload: {
        orgId,
        estimateId,
        updatedAt: estimate.updatedAt,
        formulaVersion: PRICING_FORMULA_VERSION,
      },
    });

    if (job.status === "succeeded") {
      // The valuable property: a second click on an unedited estimate is one
      // Mongo read and a signed URL. No render, no queue hop.
      return this.toView(job, job.id, estimate);
    }

    await this.queue.enqueue({
      queue: QUEUES.DOCUMENT_RENDER,
      jobType,
      // attempts is in the name so a retry of a FAILED job is genuinely a new
      // task, while an accidental double-click is still refused by the queue.
      name: taskName(jobType, dedupKey, job.attempts),
      payload: { dedupKey },
    });

    return { jobId: job.id, status: job.status, url: null };
  }

  private async toView(
    job: Job,
    jobId: string,
    estimate?: Estimate,
  ): Promise<DocumentJobView> {
    if (job.status !== "succeeded") {
      return { jobId, status: job.status, url: null };
    }

    const parsed = renderResultSchema.safeParse(job.result);
    if (!parsed.success) {
      // Succeeded without a usable result — a bug, not a user-facing state.
      // Report it as failed rather than handing back a broken link.
      return { jobId, status: "failed", url: null };
    }

    const filename = estimate
      ? (FILENAME[job.jobType]?.(estimate) ?? "document.pdf")
      : "document.pdf";

    return {
      jobId,
      status: "succeeded",
      // Minted on read with a short TTL, never stored.
      url: await this.storage.signedDownloadUrl(parsed.data.storageKey, filename),
    };
  }
}
```

- [ ] **Step 8: Run the test**

```bash
bun test packages/api/src/services/DocumentJobService/DocumentJobServiceImpl.test.ts
```

Expected: PASS, all ten cases.

- [ ] **Step 9: Write the router**

```ts
// packages/api/src/routers/documents.ts
import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const estimateInput = z.object({ estimateId: z.string().min(1) });

/**
 * Asynchronous document generation. Each request returns immediately with a job
 * id — and, when the document already exists for this exact estimate version, a
 * download URL in the same response.
 */
export const documentsRouter = router({
  requestEstimatePdf: orgProtectedProcedure
    .input(estimateInput)
    .mutation(({ ctx, input }) =>
      ctx.services.documentJobService.requestEstimatePdf(
        ctx.auth.orgId,
        input.estimateId,
      ),
    ),

  requestPartsOrderPdf: orgProtectedProcedure
    .input(estimateInput)
    .mutation(({ ctx, input }) =>
      ctx.services.documentJobService.requestPartsOrderPdf(
        ctx.auth.orgId,
        input.estimateId,
      ),
    ),

  // Polled by the client while a job is pending or running.
  status: orgProtectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.documentJobService.status(ctx.auth.orgId, input.jobId),
    ),
});
```

- [ ] **Step 10: Wire it up**

- `packages/api/src/services/tokens.ts`: add `export const DOCUMENT_JOB_SERVICE_TOKEN = "DocumentJobService";`
- `packages/api/src/services/index.ts`: `container.registerSingleton(DOCUMENT_JOB_SERVICE_TOKEN, DocumentJobServiceImpl);`
- `packages/api/src/context.ts`: add `documentJobService: DocumentJobService;` to `Context["services"]`
- `packages/api/src/createContext.ts`: resolve it into `services`
- `packages/api/src/router.ts`: add `documents: documentsRouter`

- [ ] **Step 11: Exercise the whole pipeline locally**

Start Mongo, the API and the worker (`bun run dev`), sign in, open an estimate, and note its id. Then:

```bash
bun -e '
const res = await fetch("http://localhost:3000/documents.requestEstimatePdf?batch=1", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TOKEN}` },
  body: JSON.stringify({ 0: { json: { estimateId: process.env.ESTIMATE_ID } } }),
});
console.log(await res.text());
'
```

with `TOKEN` a Clerk session token from the browser's devtools and `ESTIMATE_ID` the estimate. Expected: a `pending` response, a worker log line reading `document rendered`, and a file under `.local-storage/orgs/<orgId>/estimates/<id>/`. Calling it a second time must return `succeeded` with a URL and produce **no** new worker log line — that is the short-circuit working.

- [ ] **Step 12: Run everything and commit**

```bash
bun run typecheck && bun test && bun run lint
git add -A packages
git commit -m "feat: request and poll generated documents over the API"
```

---

### Task 16: `CompanyProfileService`, the `company` router, and logo upload

Avoids piping binaries through tRPC: the browser gets a short-lived signed PUT URL, uploads straight to storage, then asks the API to confirm. The confirm step exists because a signed PUT URL can pin content-type but **cannot enforce size**, so that check has to happen after the fact.

**Files:**
- Create: `packages/api/src/services/CompanyProfileService/{CompanyProfileService.ts,CompanyProfileServiceImpl.ts,CompanyProfileServiceImpl.test.ts}`
- Create: `packages/api/src/routers/company.ts`
- Modify: `packages/api/src/services/{index.ts,tokens.ts}`, `src/context.ts`, `src/createContext.ts`, `src/router.ts`

**Interfaces:**
- Consumes: `CompanyProfileRepository` (Task 8), `ObjectStorage` (Task 6), `logoObjectKey` (Task 9).
- Produces:
  - `LOGO_CONTENT_TYPES = ["image/png", "image/jpeg"]`, `MAX_LOGO_BYTES = 2 * 1024 * 1024`
  - `LogoUploadTicket { key: string; uploadUrl: string }`
  - `CompanyProfileService { get(orgId); update(orgId, changes); requestLogoUpload(orgId, contentType); confirmLogo(orgId, key) }`
  - `COMPANY_PROFILE_SERVICE_TOKEN = "CompanyProfileService"`
  - tRPC: `company.get`, `company.update`, `company.requestLogoUpload`, `company.confirmLogo`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/services/CompanyProfileService/CompanyProfileServiceImpl.test.ts
import { describe, expect, it, mock } from "bun:test";
import {
  makeCompanyProfile,
  makeCompanyProfileRepoMock,
  makeObjectStorageFake,
} from "@landscape/platform/test-support";
import { ServiceError } from "../errors.ts";
import { CompanyProfileServiceImpl, MAX_LOGO_BYTES } from "./CompanyProfileServiceImpl.ts";

const build = (over: {
  profile?: ReturnType<typeof makeCompanyProfile> | null;
  storage?: ReturnType<typeof makeObjectStorageFake>;
} = {}) => {
  const profile = over.profile === undefined ? makeCompanyProfile() : over.profile;
  const profiles = makeCompanyProfileRepoMock({
    get: mock(async () => profile),
    update: mock(async (_orgId, changes) => ({ ...makeCompanyProfile(), ...changes })),
  });
  const storage = over.storage ?? makeObjectStorageFake();
  return { service: new CompanyProfileServiceImpl(profiles, storage), profiles, storage };
};

describe("CompanyProfileServiceImpl.get", () => {
  it("returns an empty profile rather than null, so the settings screen always renders", async () => {
    const { service } = build({ profile: null });

    expect(await service.get("org_1")).toMatchObject({
      businessName: "",
      logoStorageKey: null,
    });
  });
});

describe("CompanyProfileServiceImpl.requestLogoUpload", () => {
  it("mints a signed PUT url under the org's branding prefix", async () => {
    const { service } = build();

    const ticket = await service.requestLogoUpload("org_1", "image/png");

    expect(ticket.key).toMatch(/^orgs\/org_1\/branding\/logo-[0-9a-f-]+\.png$/);
    expect(ticket.uploadUrl).toBe(`https://upload.test/${ticket.key}`);
  });

  it("uses the jpg extension for a jpeg", async () => {
    const { service } = build();

    expect((await service.requestLogoUpload("org_1", "image/jpeg")).key).toMatch(/\.jpg$/);
  });

  it("rejects a content type outside the whitelist", async () => {
    const { service } = build();

    expect(service.requestLogoUpload("org_1", "image/svg+xml")).rejects.toThrow(ServiceError);
  });
});

describe("CompanyProfileServiceImpl.confirmLogo", () => {
  const KEY = "orgs/org_1/branding/logo-abc.png";

  it("records the logo when the uploaded object checks out", async () => {
    const storage = makeObjectStorageFake();
    await storage.put(KEY, new Uint8Array(1024), "image/png");
    const { service, profiles } = build({ storage });

    await service.confirmLogo("org_1", KEY);

    expect(profiles.update).toHaveBeenCalledWith("org_1", {
      logoStorageKey: KEY,
      logoContentType: "image/png",
    });
  });

  it("deletes the previous logo so branding doesn't accumulate", async () => {
    const storage = makeObjectStorageFake();
    await storage.put("orgs/org_1/branding/logo-old.png", new Uint8Array(4), "image/png");
    await storage.put(KEY, new Uint8Array(1024), "image/png");
    const { service } = build({
      storage,
      profile: makeCompanyProfile({
        logoStorageKey: "orgs/org_1/branding/logo-old.png",
        logoContentType: "image/png",
      }),
    });

    await service.confirmLogo("org_1", KEY);

    expect(storage.objects.has("orgs/org_1/branding/logo-old.png")).toBe(false);
  });

  it("rejects and cleans up an object over the size limit", async () => {
    // The check that CANNOT be done by the signed URL: it pins content type but
    // not size, so an oversize upload is only detectable after the fact.
    const storage = makeObjectStorageFake();
    await storage.put(KEY, new Uint8Array(MAX_LOGO_BYTES + 1), "image/png");
    const { service, profiles } = build({ storage });

    expect(service.confirmLogo("org_1", KEY)).rejects.toThrow(ServiceError);
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it("rejects an object whose stored type isn't an allowed image", async () => {
    const storage = makeObjectStorageFake();
    await storage.put(KEY, new Uint8Array(16), "application/zip");
    const { service } = build({ storage });

    expect(service.confirmLogo("org_1", KEY)).rejects.toThrow(ServiceError);
  });

  it("rejects a key outside the caller's org", async () => {
    const storage = makeObjectStorageFake();
    await storage.put("orgs/org_2/branding/logo-abc.png", new Uint8Array(16), "image/png");
    const { service } = build({ storage });

    expect(
      service.confirmLogo("org_1", "orgs/org_2/branding/logo-abc.png"),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a key that was never uploaded", async () => {
    const { service } = build();

    expect(service.confirmLogo("org_1", KEY)).rejects.toThrow(ServiceError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/api/src/services/CompanyProfileService/CompanyProfileServiceImpl.test.ts
```

Expected: FAIL — cannot resolve `./CompanyProfileServiceImpl.ts`.

- [ ] **Step 3: Write the port**

```ts
// packages/api/src/services/CompanyProfileService/CompanyProfileService.ts
import type { CompanyProfile, CompanyProfileChanges } from "@landscape/platform";

export type { CompanyProfile, CompanyProfileChanges };

/** What the browser needs to upload a logo without the bytes touching the API. */
export interface LogoUploadTicket {
  key: string;
  uploadUrl: string;
}

/**
 * The org's business identity, and the two-step logo upload.
 *
 * The upload is split because a signed PUT URL can pin content-type but cannot
 * enforce SIZE. So the browser uploads straight to storage, then `confirmLogo`
 * inspects what actually landed and either records it or deletes it.
 */
export interface CompanyProfileService {
  get(orgId: string): Promise<CompanyProfile>;
  update(orgId: string, changes: CompanyProfileChanges): Promise<CompanyProfile>;
  requestLogoUpload(orgId: string, contentType: string): Promise<LogoUploadTicket>;
  confirmLogo(orgId: string, key: string): Promise<CompanyProfile>;
}
```

- [ ] **Step 4: Write the implementation**

```ts
// packages/api/src/services/CompanyProfileService/CompanyProfileServiceImpl.ts
import { inject, injectable } from "tsyringe";
import {
  COMPANY_PROFILE_REPOSITORY_TOKEN,
  OBJECT_STORAGE_TOKEN,
  logoObjectKey,
  type CompanyProfile,
  type CompanyProfileChanges,
  type CompanyProfileRepository,
  type ObjectStorage,
} from "@landscape/platform";
import { ServiceError } from "../errors.ts";
import type {
  CompanyProfileService,
  LogoUploadTicket,
} from "./CompanyProfileService.ts";

/** Raster formats only. SVG is excluded — it can carry script. */
const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const EMPTY_PROFILE: CompanyProfile = {
  businessName: "",
  address: null,
  phone: null,
  email: null,
  licenseNumber: null,
  logoStorageKey: null,
  logoContentType: null,
};

@injectable()
export class CompanyProfileServiceImpl implements CompanyProfileService {
  constructor(
    @inject(COMPANY_PROFILE_REPOSITORY_TOKEN)
    private readonly profiles: CompanyProfileRepository,
    @inject(OBJECT_STORAGE_TOKEN)
    private readonly storage: ObjectStorage,
  ) {}

  async get(orgId: string): Promise<CompanyProfile> {
    // Seeding creates a row for every new org, but an org that predates that (or
    // a local database) may have none. An empty profile beats a null the screen
    // has to special-case — and documents render from it fine.
    return (await this.profiles.get(orgId)) ?? EMPTY_PROFILE;
  }

  async update(
    orgId: string,
    changes: CompanyProfileChanges,
  ): Promise<CompanyProfile> {
    // The logo is owned by the upload flow, which validates what it records.
    const { logoStorageKey: _key, logoContentType: _type, ...safe } = changes;
    return await this.profiles.update(orgId, safe);
  }

  async requestLogoUpload(
    orgId: string,
    contentType: string,
  ): Promise<LogoUploadTicket> {
    const extension = LOGO_EXTENSIONS[contentType];
    if (!extension) {
      throw new ServiceError("BAD_REQUEST", "Logo must be a PNG or JPEG image");
    }

    // A fresh key per upload, so a replacement never races the old object's
    // cached URL and the previous logo stays readable until confirm swaps it.
    const key = logoObjectKey(orgId, crypto.randomUUID(), extension);
    return { key, uploadUrl: await this.storage.signedUploadUrl(key, contentType) };
  }

  async confirmLogo(orgId: string, key: string): Promise<CompanyProfile> {
    // The key comes back from the browser, so it is untrusted input: confine it
    // to the caller's own branding prefix before touching storage.
    if (!key.startsWith(`orgs/${orgId}/branding/`)) {
      throw new ServiceError("BAD_REQUEST", "That is not this organization's logo");
    }

    const stored = await this.storage.head(key);
    if (!stored) {
      throw new ServiceError("BAD_REQUEST", "No uploaded logo found at that key");
    }

    // Everything the signed URL couldn't guarantee, checked now. Anything wrong
    // and the object is removed rather than left orphaned in the bucket.
    if (!LOGO_EXTENSIONS[stored.contentType]) {
      await this.storage.remove(key);
      throw new ServiceError("BAD_REQUEST", "Logo must be a PNG or JPEG image");
    }
    if (stored.byteSize > MAX_LOGO_BYTES) {
      await this.storage.remove(key);
      throw new ServiceError("BAD_REQUEST", "Logo must be 2MB or smaller");
    }

    const previous = (await this.profiles.get(orgId))?.logoStorageKey ?? null;
    const profile = await this.profiles.update(orgId, {
      logoStorageKey: key,
      logoContentType: stored.contentType,
    });

    // After the record is updated, so a failure here leaves a harmless orphan
    // rather than a profile pointing at an object that no longer exists.
    if (previous && previous !== key) {
      await this.storage.remove(previous);
    }

    return profile;
  }
}
```

- [ ] **Step 5: Run the test**

```bash
bun test packages/api/src/services/CompanyProfileService/CompanyProfileServiceImpl.test.ts
```

Expected: PASS, all nine cases.

- [ ] **Step 6: Write the router**

```ts
// packages/api/src/routers/company.ts
import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const profileInput = z.object({
  businessName: z.string().max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  licenseNumber: z.string().max(100).nullable().optional(),
});

/** The org's business identity, as it appears at the head of every document. */
export const companyRouter = router({
  get: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.companyProfileService.get(ctx.auth.orgId),
  ),

  update: orgProtectedProcedure
    .input(profileInput)
    .mutation(({ ctx, input }) =>
      ctx.services.companyProfileService.update(ctx.auth.orgId, input),
    ),

  // Step 1 of the upload: the browser PUTs the file straight to storage with
  // this URL, so image bytes never pass through tRPC.
  requestLogoUpload: orgProtectedProcedure
    .input(z.object({ contentType: z.enum(["image/png", "image/jpeg"]) }))
    .mutation(({ ctx, input }) =>
      ctx.services.companyProfileService.requestLogoUpload(
        ctx.auth.orgId,
        input.contentType,
      ),
    ),

  // Step 2: the size check a signed URL can't make.
  confirmLogo: orgProtectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.companyProfileService.confirmLogo(ctx.auth.orgId, input.key),
    ),
});
```

- [ ] **Step 7: Wire it up**

Same five sites as Task 15 Step 10: `tokens.ts` (`COMPANY_PROFILE_SERVICE_TOKEN`), `services/index.ts`, `context.ts`, `createContext.ts`, `router.ts` (`company: companyRouter`).

- [ ] **Step 8: Run everything and commit**

```bash
bun run typecheck && bun test && bun run lint
git add packages/api
git commit -m "feat: manage the company profile and its logo"
```

---

### Task 17: Download buttons and status polling

One component owns request → poll → download for both document kinds, placed in the estimate editor.

**Files:**
- Create: `packages/web/src/components/DocumentDownloadButton.tsx`
- Modify: `packages/web/src/screens/EstimateEditorScreen.tsx`

**Interfaces:**
- Consumes: `documents.requestEstimatePdf`, `documents.requestPartsOrderPdf`, `documents.status` (Task 15).
- Produces: `<DocumentDownloadButton estimateId kind label />` where `kind` is `"estimate" | "partsOrder"`.

- [ ] **Step 1: Write the component**

The web package has no test setup (`packages/web` has no `test` script and is absent from the root `test` task), so this task is verified by running the app — Step 4. Do not add a test framework for it here.

```tsx
// packages/web/src/components/DocumentDownloadButton.tsx
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc } from "../trpc.ts";

type DocumentKind = "estimate" | "partsOrder";

const POLL_INTERVAL_MS = 1500;
// Renders take a second or two; a minute means something is wrong. Give up with
// a retry affordance rather than polling a stuck job forever.
const GIVE_UP_AFTER_MS = 60_000;

const GENERIC_FAILURE =
  "We couldn't generate that document. Please try again in a moment.";

/**
 * Requests a generated document, polls until it's ready, then downloads it.
 *
 * The API returns a URL immediately when the document already exists for this
 * exact estimate version, so the common case never polls at all.
 *
 * A failed job's stored error is never rendered — it can carry internals — so
 * every failure shows the same generic message.
 */
export function DocumentDownloadButton({
  estimateId,
  kind,
  label,
}: {
  estimateId: string;
  kind: DocumentKind;
  label: string;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  const finish = (url: string) => {
    setJobId(null);
    startedAt.current = null;
    // The signed URL carries content-disposition: attachment, so this downloads
    // rather than navigating away.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const procedure =
    kind === "estimate"
      ? trpc.documents.requestEstimatePdf
      : trpc.documents.requestPartsOrderPdf;

  const request = useMutation(
    procedure.mutationOptions({
      onSuccess: (result) => {
        if (result.url) {
          finish(result.url);
          return;
        }
        startedAt.current = Date.now();
        setJobId(result.jobId);
      },
      onError: () => setError(GENERIC_FAILURE),
    }),
  );

  const status = useQuery({
    ...trpc.documents.status.queryOptions({ jobId: jobId ?? "" }),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const current = query.state.data?.status;
      return current === "pending" || current === "running" ? POLL_INTERVAL_MS : false;
    },
  });

  useEffect(() => {
    const data = status.data;
    if (!jobId || !data) {
      return;
    }
    if (data.url) {
      finish(data.url);
      return;
    }
    if (data.status === "failed") {
      setJobId(null);
      startedAt.current = null;
      setError(GENERIC_FAILURE);
    }
  }, [jobId, status.data]);

  useEffect(() => {
    if (jobId === null) {
      return;
    }
    const timer = setTimeout(() => {
      setJobId(null);
      startedAt.current = null;
      setError("This is taking longer than expected. Please try again.");
    }, GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [jobId]);

  const working = request.isPending || jobId !== null;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={working}
        onClick={() => {
          setError(null);
          request.mutate({ estimateId });
        }}
        className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {working ? "Preparing…" : label}
      </button>
      {error ? (
        <span className="text-xs text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setError(null);
              request.mutate({ estimateId });
            }}
          >
            Retry
          </button>
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Place both buttons in the estimate editor**

In `packages/web/src/screens/EstimateEditorScreen.tsx`, import the component and render the pair in the screen's header actions area (beside the status control near line 287):

```tsx
        <DocumentDownloadButton
          estimateId={estimateId}
          kind="estimate"
          label="Download estimate PDF"
        />
        <DocumentDownloadButton
          estimateId={estimateId}
          kind="partsOrder"
          label="Download parts order"
        />
```

- [ ] **Step 3: Typecheck**

```bash
bun run --cwd packages/web typecheck
```

Expected: clean.

- [ ] **Step 4: Verify in the running app**

With `bun run dev` and a seeded org:

1. Open an estimate with at least two assemblies.
2. Click **Download estimate PDF** → the button reads "Preparing…", then a PDF downloads. Open it: the header, the assembly rows, the total and the tax footnote must match what the screen shows.
3. Click it again → the download is near-instant and the worker logs **no** new `document rendered` line. That is the short-circuit.
4. Change a driver value, save, and click again → a new render happens (a new `document rendered` line, a new folder under `.local-storage/`).
5. Click **Download parts order** → a materials list at cost, with delivery on its own line.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat: download estimate and parts order PDFs from the editor"
```

---

### Task 18: Company profile settings screen

**Files:**
- Create: `packages/web/src/screens/CompanySettingsScreen.tsx`
- Modify: `packages/web/src/router.tsx`, `packages/web/src/screens/RootLayout.tsx`

**Interfaces:**
- Consumes: `company.get`, `company.update`, `company.requestLogoUpload`, `company.confirmLogo` (Task 16).
- Produces: the `/settings/company` route and its nav link.

- [ ] **Step 1: Write the screen**

```tsx
// packages/web/src/screens/CompanySettingsScreen.tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, inputClass } from "../components/ui.tsx";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg"] as const;

type Draft = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  licenseNumber: string;
};

const EMPTY: Draft = {
  businessName: "",
  address: "",
  phone: "",
  email: "",
  licenseNumber: "",
};

/**
 * The business identity at the head of every generated document.
 *
 * The logo never passes through the API: `requestLogoUpload` returns a signed
 * PUT URL, the browser uploads straight to storage, and `confirmLogo` validates
 * what landed. That order is why the button stays disabled until confirm
 * resolves — the upload isn't real until the server has accepted it.
 */
export function CompanySettingsScreen() {
  const profile = useQuery(trpc.company.get.queryOptions());
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile.data) {
      return;
    }
    setDraft({
      businessName: profile.data.businessName ?? "",
      address: profile.data.address ?? "",
      phone: profile.data.phone ?? "",
      email: profile.data.email ?? "",
      licenseNumber: profile.data.licenseNumber ?? "",
    });
  }, [profile.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.company.get.queryKey() });

  const update = useMutation(
    trpc.company.update.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        invalidate();
      },
      onError: (e: { message: string }) => setError(e.message),
    }),
  );

  const requestUpload = useMutation(trpc.company.requestLogoUpload.mutationOptions());
  const confirmLogo = useMutation(
    trpc.company.confirmLogo.mutationOptions({ onSuccess: invalidate }),
  );

  const onPickLogo = async (file: File) => {
    setError(null);
    // Checked here for a fast, clear message; checked again server-side because
    // a signed PUT URL cannot enforce size and a client check is not a control.
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError("Logo must be a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const ticket = await requestUpload.mutateAsync({
        contentType: file.type as (typeof ALLOWED_TYPES)[number],
      });
      const put = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) {
        throw new Error("Upload failed");
      }
      await confirmLogo.mutateAsync({ key: ticket.key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const field = (key: keyof Draft, label: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        className={inputClass}
        value={draft[key]}
        onChange={(event) => {
          setSaved(false);
          setDraft({ ...draft, [key]: event.target.value });
        }}
      />
    </label>
  );

  if (profile.isLoading) {
    return <Page max="2xl">Loading…</Page>;
  }

  return (
    <Page max="2xl" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Company profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          This appears at the top of every estimate and parts order you send.
        </p>
      </div>

      <ErrorNote message={error} />

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          update.mutate({
            businessName: draft.businessName,
            address: draft.address || null,
            phone: draft.phone || null,
            email: draft.email || null,
            licenseNumber: draft.licenseNumber || null,
          });
        }}
      >
        {field("businessName", "Business name")}
        {field("address", "Address")}
        {field("phone", "Phone")}
        {field("email", "Email", "email")}
        {field("licenseNumber", "License number")}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          {saved ? <span className="text-sm text-green-700">Saved</span> : null}
        </div>
      </form>

      <div className="space-y-2 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-medium text-slate-700">Logo</h2>
        <p className="text-sm text-slate-500">
          PNG or JPEG, up to 2MB. Documents render fine without one.
        </p>
        {profile.data?.logoStorageKey ? (
          <p className="text-sm text-slate-600">A logo is on file.</p>
        ) : null}
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={uploading}
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onPickLogo(file);
            }
            event.target.value = "";
          }}
        />
        {uploading ? <p className="text-sm text-slate-500">Uploading…</p> : null}
      </div>
    </Page>
  );
}
```

- [ ] **Step 2: Add the route**

In `packages/web/src/router.tsx`, import the screen and add:

```tsx
const companySettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/company",
  component: CompanySettingsScreen,
});
```

and include `companySettingsRoute` in `rootRoute.addChildren([...])`.

- [ ] **Step 3: Add the nav link**

In `packages/web/src/screens/RootLayout.tsx`, inside the `<nav>`, after the Clients link:

```tsx
        <Link
          to="/settings/company"
          className="text-primary-200 transition-colors hover:text-grey-50"
          activeProps={{ className: "text-white font-medium" }}
        >
          Company
        </Link>
```

- [ ] **Step 4: Typecheck**

```bash
bun run --cwd packages/web typecheck
```

- [ ] **Step 5: Verify in the running app**

1. Open **Company**, fill in every field, Save → "Saved" appears; reload → values persist.
2. Upload a PNG under 2MB → "A logo is on file." appears, and `.local-storage/orgs/<orgId>/branding/` holds it.
3. Upload a second logo → the previous file is gone from `.local-storage`.
4. Try a `.svg` → rejected with a clear message, nothing written.
5. Download an estimate PDF → the logo and the company details head the document.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat: edit the company profile and upload a logo"
```

---

### Task 19: Infrastructure

Bucket, queue, IAM, and the env both services need. All idempotent, in `deploy.sh`'s existing style.

**Files:**
- Modify: `deploy.sh`
- Modify: `docs/observability.md` (if it lists queues or buckets)

**Interfaces:**
- Consumes: `QUEUES.DOCUMENT_RENDER` (`packages/platform/src/jobs/jobTypes.ts`) — the queue name must match exactly.
- Produces: `landscape-documents-{env}` bucket, `document-render-queue`, the IAM grants signing needs, and `DOCUMENTS_BUCKET` on both Cloud Run services.

- [ ] **Step 1: Declare the new names**

In `deploy.sh`, beside the existing queue constants (around line 26):

```bash
# Cloud Tasks: one queue per job kind (names MUST match packages/platform/src/jobs/jobTypes.ts)
ORG_SEED_QUEUE="org-seed-queue"
USER_SYNC_QUEUE="user-sync-queue"
DOCUMENT_RENDER_QUEUE="document-render-queue"
TASKS_INVOKER_SA="cloud-tasks-invoker@${PROJECT}.iam.gserviceaccount.com"

# Generated PDFs. Uniform bucket-level access, no public access: every read goes
# through a short-lived signed URL.
DOCUMENTS_BUCKET="landscape-documents-production"
```

- [ ] **Step 2: Create the bucket**

Add before the API deploy block:

```bash
# ── Document storage ─────────────────────────────────────────────────────────
# Uniform bucket-level access (no per-object ACLs) and public access prevented:
# the only way to read an object is a signed URL the API mints on demand.
#
# No lifecycle/retention rule in v1 — artifacts are ~100KB and "what we sent the
# client" is worth keeping. Revisit when volume justifies it.
echo "Ensuring documents bucket: $DOCUMENTS_BUCKET"
gcloud services enable storage.googleapis.com --project "$PROJECT" --quiet >/dev/null
if ! gcloud storage buckets describe "gs://$DOCUMENTS_BUCKET" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$DOCUMENTS_BUCKET" \
    --project "$PROJECT" \
    --location "$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention >/dev/null
fi

# Both Cloud Run services run as the same runtime SA, so one grant covers the
# API (reads + signs) and the worker (writes).
gcloud storage buckets add-iam-policy-binding "gs://$DOCUMENTS_BUCKET" \
  --project "$PROJECT" \
  --member "serviceAccount:$RUNTIME_SA" \
  --role roles/storage.objectAdmin --quiet >/dev/null

# ── The signing footgun ──────────────────────────────────────────────────────
# A Cloud Run service account has NO private key, so getSignedUrl can't sign
# locally — it delegates to the IAM SignBlob API. That needs
# iamcredentials.googleapis.com enabled (already done for Cloud Tasks below) AND
# the service account granted token-creator ON ITSELF. Without this, signed URLs
# fail at request time with a permission error, not at boot.
gcloud services enable iamcredentials.googleapis.com --project "$PROJECT" --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project "$PROJECT" \
  --member "serviceAccount:$RUNTIME_SA" \
  --role roles/iam.serviceAccountTokenCreator --quiet >/dev/null
```

- [ ] **Step 3: Create the queue**

Extend the existing queue loop (around line 74 of the Cloud Tasks block):

```bash
for QUEUE in "$ORG_SEED_QUEUE" "$USER_SYNC_QUEUE" "$DOCUMENT_RENDER_QUEUE"; do
```

- [ ] **Step 4: Give both services the bucket name and the queue's coordinates**

The API now enqueues tasks, so it needs the same Cloud Tasks env the worker has. Add to the API's `gcloud run deploy`:

```bash
  --set-env-vars DOCUMENTS_BUCKET="$DOCUMENTS_BUCKET" \
  --set-env-vars GCP_PROJECT_ID="$PROJECT" \
  --set-env-vars GCP_LOCATION="$REGION" \
  --set-env-vars TASKS_INVOKER_SERVICE_ACCOUNT="$TASKS_INVOKER_SA" \
```

and to the worker's:

```bash
  --set-env-vars DOCUMENTS_BUCKET="$DOCUMENTS_BUCKET" \
```

The API also needs `WORKER_URL` — it is the base Cloud Tasks posts callbacks to. The worker's URL isn't known until after the worker deploys, and the API deploys first, so add a corrective update after the worker's URL is resolved (mirroring the existing first-deploy correction at line 178):

```bash
# The API enqueues document renders, and Cloud Tasks posts them to the worker.
# The worker's URL is only known after it deploys, so set it on the API here.
# --update-env-vars touches only this var, leaving the others and the secrets intact.
echo "Pointing the API's queue callbacks at $WORKER_URL..."
gcloud run services update "$API_SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --update-env-vars WORKER_URL="$WORKER_URL" >/dev/null
```

- [ ] **Step 5: Deploy and verify**

```bash
./deploy.sh
```

Then check each piece landed:

```bash
gcloud storage buckets describe gs://landscape-documents-production \
  --project landscape-499116 --format 'value(uniform_bucket_level_access,public_access_prevention)'
gcloud tasks queues describe document-render-queue \
  --location us-central1 --project landscape-499116 --format 'value(name,state)'
gcloud iam service-accounts get-iam-policy "$RUNTIME_SA" \
  --project landscape-499116 --format json | grep -A3 serviceAccountTokenCreator
```

Expected: uniform access `True`, public access `enforced`; the queue `RUNNING`; the runtime SA listed as a token-creator member on itself.

- [ ] **Step 6: Verify the deployed pipeline**

In the deployed app: open an estimate, download the estimate PDF, and confirm the object appears under `gs://landscape-documents-production/orgs/<orgId>/estimates/`. Then click again and confirm no new worker revision log line — the short-circuit works in production too.

```bash
gcloud storage ls -r "gs://landscape-documents-production/orgs/**" --project landscape-499116 | head
```

If the download 403s, the signing grant hasn't propagated — re-run `deploy.sh` after a minute. If it still fails, fall back to the escape hatch in the design: an authenticated API route that pipes the object, which the `ObjectStorage` port makes a one-file change.

- [ ] **Step 7: Tick the go-live item**

The Estimate PDF is the "Estimate Export" line in [`docs/go-live-todo.md`](../../go-live-todo.md). Mark it done there, noting that the parts order shipped alongside it.

- [ ] **Step 8: Commit**

```bash
git add deploy.sh docs
git commit -m "build: provision the documents bucket and render queue"
```

---

## Done means

- An estimate produces a client-facing PDF: company header, one row per assembly, a ruled total, the tax footnote, no tax line, no unit prices.
- The same estimate produces a supplier parts order at cost, materials merged, delivery noted separately, pre-tax subtotal.
- A second request for an unchanged estimate returns a URL from one Mongo read — no render, no queue hop — and an edit or a `PRICING_FORMULA_VERSION` bump invalidates it.
- `webhookjobs` is gone; `syncUser` and `seedOrg` run on the generic spine with today's retry semantics intact.
- Bytes never pass through the API in either direction: downloads and logo uploads both go straight to storage over signed URLs.
- `bun run typecheck && bun test && bun run lint` are clean, and `deploy.sh` provisions the bucket, the queue and the signing grant idempotently.

## Deliberately not in scope

Carried from the design, so a reviewer doesn't read these as omissions:

- **A `PartsOrder` entity** — editable quantities, PO numbers, supplier splits, delivery dates. The derived view comes first; `PartsOrderDocument` is already the seam an entity would plug into.
- **Per-supplier parts orders** — needs a supplier on `Material` and a `materialId` on generated line items. Neither exists.
- **Emailing a document** — its own feature with its own provider decision. The artifact and the job spine are its prerequisites.
- **Full line-item detail on the client PDF** — summary only. A detail toggle would have to become part of the dedup key.
- **A bucket lifecycle/retention policy** — revisit when volume justifies it.
- **Freezing totals on send** — open question #1 in `docs/open-questions.md`, with its own data model. This design does not pre-empt it.
