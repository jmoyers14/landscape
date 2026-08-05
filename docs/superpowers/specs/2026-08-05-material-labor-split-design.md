# Material / labor split in the estimate editor

**Date:** 2026-08-05
**Status:** Designed, not implemented

## Why

The estimate editor has to be legible to the landscaper who wrote the source
bid workbook. He is a business partner, not a user we are guessing at — if he
cannot follow what the app produces, he cannot check it, and we lose the one
reviewer who knows what the numbers should be.

His workbook runs **two money columns in parallel** down every phase: column
`M` for materials, column `P` for labor. They stay separate through the whole
buildup and combine only at the very bottom. The app currently collapses both
into a single `Total` column, so a reader comparing the two documents has to
reconstruct the split in their head on every row.

This design splits the app's money columns to match.

## What the workbook actually does

From the Irrigation phase (`sheet1.xml`, rows 34–59):

```
A34  Install control valves     E=5 unit(s)  N=3.74hr  O=$35  P=$130.81   ← labor on the task row
A35     Valves                  D=$25  E=5   K=125.00  L=9.69  M=$134.69  ← materials beneath it
A36     Teflon tape             D=$0.60 E=1  K=0.60    L=0.05  M=$0.65
A37     PVC nipple 1 x 18       D=$0.97 E=10 K=9.72    L=0.75  M=$10.47
                                                       Q34 = P34 + M35..M39 = $285.03

M56  =SUM(M35:M51)   944.05     P56  =SUM(P34:P40)  2,427.93
M57  Overhead  =(M56/0.6)-M56     629.37            (none)
M58  Profit    =(M56+M57)*0.15    236.01     P58  =P56*0.15    364.19
M59  Total     =M56+M57+M58     1,809.44     P59  =P56+P58   2,792.12
```

Three money columns, then: `M` materials, `P` labor, and `Q` — a combined
total that appears on task rows only.

> The sheet's `M56` reads $944.05 because `SUM(M35:M51)` drops its last three
> material rows. Our seed includes them, giving $1,142.31. That divergence is
> deliberate and pre-existing; see `packages/platform/src/seed/irrigation.ts`.

## Decisions

| Question | Decision |
|---|---|
| How faithful to the sheet's layout? | Split the money column. Keep the app's uniform row shape and task grouping — do not move labor onto the task header row. |
| Does the footer buildup split too? | Yes, every row. Overhead shows an em dash under Labor. |
| Does the job-level panel split? | Yes, same shape one level up. |
| A third combined `Total` column, as the sheet's `Q`? | Yes. |
| Per-driver-unit price (`E59` → `$920.31 per valve`)? | Out of scope. Its own feature, with its own questions. |
| Who computes task rollups? | The engine. |

## Design

### 1. Engine

Four new derived fields on `EstimateTotals` in
`packages/domain/src/engine/calc.ts`:

```ts
materialProfit: number; // (materialCost + overhead) × profitRate
laborProfit:    number; //  laborCost               × profitRate
materialTotal:  number; //  materialCost + overhead + materialProfit
laborTotal:     number; //  laborCost               + laborProfit
```

No new overhead field. `overhead` already *is* the material overhead — labor
carries none — so the split is expressed by rendering an em dash under Labor,
not by storing a zero.

`AssemblyTotals extends EstimateTotals`, so the per-assembly footers and the
job panel both pick these up with no further plumbing.

**Task rollups move into the engine.** A new `summarizeTasks` beside
`summarizeAssemblies`, returning per task:

```ts
interface TaskTotals {
  taskKey: string;
  taskName: string;
  materialCost: number;
  laborCost: number;
  total: number; // materialCost + laborCost — the workbook's Q
}
```

Today `toBlocks` in `EstimateEditorScreen.tsx` sums `line.cost` in the web
layer to get one number. The task row now needs three. They belong in the
engine for the same reason `blockSubtotal` was deleted on the previous branch:
one place computes money — and, decisively, `packages/web` has no test
infrastructure, so a web-layer version of three numbers that must tie out
cannot be tested at all.

It is a pure function over a line array —
`summarizeTasks(lines: LineItemView[]): LineBlock[]` — returning the ordered
mix of task groups and loose lines that `toBlocks` returns today. The web
calls it per assembly with that assembly's lines, exactly where it calls
`toBlocks` now. `EstimateView` gains nothing; only the arithmetic moves, into
a package that has tests.

It groups by `taskKey`, keeps each group at the position of its first line,
and leaves lines with a null `taskKey` ungrouped — the same partition
`toBlocks` performs today.

### 2. Line table

Columns: `Description | Qty | Unit price | Material | Labor | Total`

- **A line row fills exactly one money column.** `line.cost` lands under
  Material or Labor by `line.type`. The other two cells are blank, not
  `$0.00` — blank reads as "not applicable", a zero reads as "this cost
  nothing".
- **The `Total` column holds task totals only** — the workbook's `Q`. Line
  rows leave it empty.
- **The task total row carries all three**: `154.22 | 130.81 | 285.03`.

Two existing behaviors interact with the new column:

- **Single-line tasks collapse** to a bare line row (`GroupRows` returns
  early). Keep it. That task contributes nothing to `Total`, which is correct
  — its one number is already on screen.
- **Single-task assemblies flatten entirely** (`AssemblyLines`'s `flat`
  branch, e.g. Soil Preparation). There the `Total` column would be empty for
  the whole table, so: **render `Total` only when the table has at least one
  task-total row.** Five columns for a flat assembly, six otherwise. A
  permanently empty column is worse than one that comes and goes with the
  thing it totals.

The table keeps `overflow-x-auto`; `min-w` goes from `32rem` to `44rem`.

### 3. Footers

Per-assembly footer — four rows, two columns. The assembly's grand total stays
in the block header, where it is today.

```
                              Material     Labor
Subtotal                      1,142.31  2,427.93
Overhead (40%)                  761.54         —
Profit (15%)                    285.58    364.19
Total                         2,189.43  2,792.12
```

The overhead label reverts to `Overhead (40%)`. It was changed to
`(40% of materials)` on the previous branch because a bare `(40%)` beside a
number that was 40% of nothing on screen read as a bug. In a two-column footer
the em dash under Labor *shows* the base rather than asserting it.

The job panel takes that same four-row, two-column block verbatim — the only
difference is the figures, which are the job's rather than one assembly's —
followed by two lines: the price (`total`), and the sales tax as a
parenthetical beneath it, `(includes $X sales tax on materials)`.

Two renames come with this. The footer's first row is labelled `Subtotal`
rather than today's `Cost`, matching the workbook's `M56`/`P56`. And the job
panel's `Direct cost (incl. $X tax at Y%)` row — introduced by the previous
branch's fix wave to keep the panel's rows additive — is superseded: the
subtotal now splits, and the tax note moves under the price.

**Em dash versus zero.** An em dash means *never applies*, and only the
Labor/Overhead cell gets one. A computed zero renders `$0.00`: a labor-only
assembly shows `$0.00` overhead under Material, because there the rate applied
and the base was empty. Different facts, different marks.

## Identities

Both hold exactly — every quantity is linear in its base, so there is no
rounding to reconcile:

- `materialProfit + laborProfit === profit`
- `materialTotal + laborTotal === total`

Per task, per assembly, and for the job.

## Testing

In `packages/domain` and `packages/platform`:

- The two identities above, at assembly and job level.
- `summarizeTasks`: grouping by `taskKey`, first-line ordering, null-`taskKey`
  lines left ungrouped, and `materialCost + laborCost === total` per task.
- Irrigation's footer cells pinned against the workbook: `P56` 2,427.93,
  `M57` 761.54, `P58` 364.19, `P59` 2,792.12, and the seed-corrected `M56`
  1,142.31 with its dependent `M58` and `M59`.

In `packages/web`: nothing automated — the package has no test
infrastructure, and standing one up is out of scope. Verified with
`bun run typecheck`, `bun run lint`, `bun run --cwd packages/web build`, and a
live look at the running editor.

## Out of scope

- The per-driver-unit price (`E59`).
- Moving labor onto the task header row as the sheet does.
- Any formula, rate, or data-model change. Totals remain derived on read, so
  there is no migration.
- Test infrastructure for `packages/web`.

## Open question this makes visible

The em dash under Labor/Overhead states a position the workbook is
inconsistent about — `docs/open-questions.md` #2. The Package tab charges no
overhead on labor ($35/hr → `35 × 1.15` = $40.25); the Contract Price
Breakdown implies it does ($19.20/hr → `19.20/0.6 × 1.15` = $36.80). We
followed the Package tab. Putting the choice on screen is the fastest route to
settling it with the workbook's author.
