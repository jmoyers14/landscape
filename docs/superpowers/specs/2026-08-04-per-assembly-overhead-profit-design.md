# Per-Assembly Overhead and Profit — Design

**Status:** designed, ready to plan. 2026-08-04.

Merges two shuffleboard tasks that turned out to be the same work:
"Per-phase overhead and profit" and "Per-phase cost breakdown."

## Terminology

The source spreadsheet and the app use different words for the same things. The
tickets are written in **sheet** vocabulary.

| Sheet | App |
|---|---|
| Package (the whole bid) | Estimate |
| **Phase** — Drainage, Irrigation, Soil Prep, Planting, Concrete, Seat wall | **Assembly** (one seed file each) |
| Task ("Install control valves") | `LineItem.taskKey` / `taskName` |
| Line item | `LineItem` |

So "per-phase overhead and profit" means **per-assembly**.

Note the trap: `LineItem` has a field named `phase`, but `generate.ts:65` sets it
to `assembly.name` — it holds the assembly name, not a separate concept.

## What the spreadsheet actually does

Verified against the Package tab of
`docs/Bid system4 - Del whole Rev 2-22.xlsm` by reading cell formulas directly.
The pattern is **identical in all six phases** (rows 27-30, 56-59, 68-71, 92-95,
127-130, 152-155):

```
Materials (col M)                     Labor (col P)
  subtotal                              subtotal
  Overhead = (sub / 0.6) − sub          Overhead = ——— none ———
  Profit   = (sub + OH) × 0.15          Profit   = sub × 0.15
  Total    = sub + OH + Profit          Total    = sub + Profit
```

Each phase also computes a unit price, `(M_total + P_total) / driver` — "per
valve", "per l. ft.", "per sq. ft."

Three things this establishes:

1. **Overhead never applies to labor.** The labor overhead cell is *empty* in
   every phase — not zero, absent.
2. **Profit's formula is already correct.** Per phase it's
   `(M + OH) × 0.15 + P × 0.15`, which factors to `(M + OH + P) × 0.15` — exactly
   the app's `(directCost + overhead) × profitRate`. Verified numerically:
   both give $600.20 for Irrigation.
3. **Rates do not vary by phase.** All six blocks hard-code `0.6` and `0.15`. The
   sheet applies *shared* rates at *phase granularity*; it is not per-phase rate
   configuration.

## Decisions

| Question | Decision |
|---|---|
| Per-assembly rates, or shared rates applied per assembly? | **Shared** — matches the sheet; no per-assembly settings model. |
| Does overhead still apply to labor? | **No** — materials only, matching all six phases. |
| Display | **Grouped line list with per-assembly footers**, mirroring the Package tab. |
| Grouping key | **`sourceAssemblyId`**, not the `phase` name string. |

`sourceAssemblyId` is on every generated line (`generate.ts:69`) and survives a
rename or the same assembly being added twice; the name comes along for display.

## Engine

One formula change in `priceLines` (`packages/domain/src/engine/calc.ts:88`) —
overhead's base becomes materials rather than direct cost:

```ts
const overhead = materialCost * (1 / (1 - rates.overheadRate / 100) - 1);
const profit   = (directCost + overhead) * (rates.profitRate / 100);  // unchanged
```

Then a per-assembly rollup that runs the *same* buildup over each assembly's
lines:

```ts
export interface AssemblyTotals extends EstimateTotals {
  assemblyId: string | null;   // null = lines with no source assembly
  name: string;                // from estimate.assemblies (denormalized)
}

// EstimateView gains:
assemblyTotals: AssemblyTotals[];
```

Ordering follows `estimate.assemblies`, so the breakdown matches the order the
blocks already render in.

**Totals tie out exactly.** Both overhead (a margin gross-up on materials) and
profit are linear in their bases, so the sum of per-assembly totals equals the
whole-job total with no rounding reconciliation. This is worth an explicit test
rather than a comment.

**Retires `summarizePhases` / `PhaseSummary`.** `EstimateView.phases` is computed
today and rendered nowhere; `assemblyTotals` supersedes it. That leaves
`LineItem.phase` unused — **keep the field** (it's snapshotted in Mongo, so
renaming or dropping it is a migration) and flag it for a later cleanup pass.

### Lines with no assembly

`sourceAssemblyId` is `null` only for hand-made or legacy lines — every generated
line gets one. Group them under a single `null` bucket with its own footer so
every line lands in exactly one block and the per-assembly totals always sum to
the job total. No reconciling line, no silent gap.

## The overhead base change is retroactive

Totals are **not stored** — `computeEstimate` recomputes them from the line items
and snapshotted rates on every read. The snapshot freezes the *inputs*; it does
not freeze the *formula*, and the formula is code.

So this change reprices every estimate that already exists, including ones marked
`sent`. The sheet's Irrigation phase goes from $6,462.96 to $4,601.56 — a 29%
drop on an untouched document.

Pre-launch that is fine and is in fact the point: the app has been computing
overhead on the wrong base. But it is a real property of the system and it is
tracked as **[open question #1](../../open-questions.md)** — freezing totals on
send is a separate feature with its own data model, not a rider on this change.

## UI

The editor **already groups by assembly**: `DraftAssemblyBlock` and
`SavedAssemblyBlock` each render one assembly's lines via
`lineItemsFor(view, assemblyId)`, which filters on `sourceAssemblyId`
(`EstimateEditorScreen.tsx:355`). So the footers slot into existing structure.

- Replace the client-side `blockSubtotal` helper with the engine-provided
  `AssemblyTotals`, so client and server never disagree about money.
- Each block's footer gains **Overhead / Profit / Total** rows, matching the
  Package tab's layout.
- `TotalsPanel` keeps its shape; its Overhead figure now means materials-only.

### Label

`Overhead (40%)` already reads as a bug next to a number that is 66.7% of direct
cost (noted in `docs/overhead.md`). A materials-only base makes it worse. Use
**`Overhead (40% of materials)`**.

## Testing

- `priceLines`: overhead ignores labor entirely — a labor-only estimate has zero
  overhead.
- Per-assembly totals sum to the job totals exactly (the linearity property).
- Profit is unchanged by the refactor at the job level.
- Golden test on Irrigation. **Do not use the sheet's own phase total** — the
  seed deliberately diverges from it. `seed/catalog.test.ts` already anchors
  Irrigation's `materialCost` at **1142.31378** (the sheet's buggy
  `SUM(M35:M51)` drops three rows; the seed includes them) and `laborHours` at
  **69.3695**. At the starter rates (7.75% tax, 40% overhead, 15% profit,
  $35/hr general) the expected per-assembly figures under the new formula are:

  | | Amount |
  |---|---|
  | materialCost | 1,142.31378 |
  | laborCost | 2,427.9325 |
  | directCost | 3,570.24628 |
  | overhead | 761.54252 |
  | profit | 649.76832 |
  | **total** | **4,981.55712** |

  The existing `catalog.test.ts` is the model to follow: it imports the
  production seed *as the system under test*, with the spreadsheet's values as
  fixed anchors. That's the documented exception to the "fixtures come from
  `test-support/`" rule, not a violation of it.
- Null-`sourceAssemblyId` lines get their own block and still tie out.

## Blast radius

Small — the calculation is one function and the UI grouping already exists.

- `packages/domain/src/engine/calc.ts` — overhead base; `AssemblyTotals`;
  `summarizeAssemblies`; remove `summarizePhases`/`PhaseSummary`
- `packages/domain/src/engine/calc.test.ts` — existing phase assertions
  (`:131-134`) move to `assemblyTotals`
- `packages/domain/src/test-support/fixture.ts` — fixtures for the new shape
- `packages/web/src/screens/EstimateEditorScreen.tsx` — block footers, drop
  `blockSubtotal`, totals label
- `docs/overhead.md`, `docs/data-model.md` — both state overhead applies to
  direct cost; both need updating

No schema, repository, or API-contract changes — `EstimateView` is derived.

## Knock-on

[`2026-08-03-overhead-basis-design.md`](./2026-08-03-overhead-basis-design.md)
assumes overhead applies to direct cost. If that feature is built, the basis
toggle applies per assembly on a materials base. Amended there.

## Not doing

- **Per-assembly rate overrides** — the sheet doesn't do this; additive later.
- **General Conditions** — its own task.
- **The Contract Price Breakdown tab's labor model** — that tab prices labor at
  $19.20/hr *with* overhead, contradicting the Package tab. Tracked as
  [open question #2](../../open-questions.md); the Package tab wins here.
- **Anything about the sheet's two suspect SUM ranges** — both investigated and
  closed on 2026-08-04 (see [Resolved](../../open-questions.md)). Irrigation's
  is a genuine sheet bug the seed already corrects; Concrete's is not a bug at
  all (row 99 is a rollup, not a dropped line). Neither affects this work.
- **Per-phase hours** — the merged "cost breakdown" ticket mentions hours;
  that belongs with "Labor time estimate," which owns the hours model.
- **Freezing totals on sent estimates** — open question #1.
