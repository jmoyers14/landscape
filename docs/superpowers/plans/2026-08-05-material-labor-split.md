# Material / Labor Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the estimate editor's single money column into Material, Labor, and a combined task Total, mirroring the source bid workbook's `M` / `P` / `Q` columns.

**Architecture:** Four derived fields (`materialProfit`, `laborProfit`, `materialTotal`, `laborTotal`) join `EstimateTotals` in `packages/domain`, so the per-assembly footers and the job panel both get the split for free — `AssemblyTotals extends EstimateTotals`. A new `summarizeTasks` in `packages/domain` takes over the task grouping and money summing that `toBlocks` does in the web layer today. The web change is then pure rendering: route each line's `cost` into one of two columns, and render the two buildups as tables instead of label/value rows.

**Tech Stack:** Bun, TypeScript, React, Tailwind, `bun:test`. Packages: `domain` (pure, no I/O) → `platform` → {`api`, `worker`}; `web` separate.

**Design doc:** `docs/superpowers/specs/2026-08-05-material-labor-split-design.md`

## Global Constraints

- **Always brace control-flow bodies** (`if` / `else` / `for` / `while`), even single statements. Biome's linter enforces this (`style/useBlockStatements`).
- **Prettier owns formatting; Biome lints only.** Do not enable Biome's formatter.
- **Conventional Commits** — subjects start with `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `build:`, `ci:`, `style:`. Only `feat` / `fix` / `perf` appear in release notes.
- **Do not hand-edit** the root `package.json` `version` or `CHANGELOG.md` — release-please owns them.
- **`packages/domain` is pure.** No I/O, no dependency on `platform` / `api`.
- Rates are percentages (`40` means 40%), not fractions.
- **Overhead is charged on materials only.** `overhead = materialCost × (1 / (1 − overheadRate/100) − 1)`. Labor carries none, in any of the workbook's six phases.
- **There are no tests in `packages/web`.** The web task is verified with `bun run typecheck` + `bun run lint` + `bun run --cwd packages/web build` + a manual look. Do not stand up a web test framework — explicitly out of scope.
- Commands: `bun run test` (all packages), `bun run --cwd packages/<pkg> test` (one), `bun run typecheck` (includes web), `bun run lint`.

---

## File Structure

**Modified:**

- `packages/domain/src/engine/calc.ts` — `EstimateTotals` gains four fields; `priceLines` computes them. Stays the single source of truth for money.
- `packages/domain/src/engine/calc.test.ts` — split-field tests.
- `packages/domain/src/engine/index.ts` — one new re-export line.
- `packages/platform/src/seed/catalog.test.ts` — the split pinned to the workbook's `M57`–`M59` / `P58`–`P59`.
- `packages/web/src/screens/EstimateEditorScreen.tsx` — the rendering change, and the deletion of the task-grouping code that moves to `domain`.

**Created:**

- `packages/domain/src/engine/tasks.ts` — `summarizeTasks` plus its `TaskGroup` / `LooseLine` / `LineBlock` types. A separate file rather than more of `calc.ts`: it groups and sums lines for display, which is a different job from computing the buildup, and it gets its own focused test file.
- `packages/domain/src/engine/tasks.test.ts`

**Untouched by design:** `packages/domain/src/engine/preview.ts` delegates to `computeEstimate` (`preview.ts:105`), so the draft-editor path picks up the new fields with no change. `packages/api` re-exports types by name and gains nothing new.

---

## Task 1: The split fields on `EstimateTotals`

**Files:**
- Modify: `packages/domain/src/engine/calc.ts` — the `EstimateTotals` interface (currently `:14-22`) and the tail of `priceLines` (currently `:89-94`)
- Test: `packages/domain/src/engine/calc.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EstimateTotals` gains `materialProfit: number`, `laborProfit: number`, `materialTotal: number`, `laborTotal: number`. Because `AssemblyTotals extends EstimateTotals` (`calc.ts:25`), every `AssemblyTotals` carries them too. Tasks 3 and 4 rely on all four names.

**Note on re-association:** `profit` and `total` are currently computed directly; after this task they are computed as the sum of their two parts. That is the same algebra, but the floating-point result can differ in the last bit or two. This is deliberate — defining them as the sum makes the identities exact rather than approximate. Existing assertions use `toBeCloseTo` at 5–8 digits and are unaffected.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `packages/domain/src/engine/calc.test.ts`:

```ts
describe("priceLines — material / labor split", () => {
  const rates = { taxRate: 7.75, overheadRate: 40, profitRate: 15 };

  it("splits profit and total the way the sheet's M and P columns do", () => {
    const totals = priceLines(
      [
        {
          type: "material",
          quantity: 3,
          unitPrice: 6.853,
          taxable: true,
          deliveryCost: 0,
        },
        {
          type: "labor",
          quantity: 21.375,
          unitPrice: 35,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      rates,
    );

    // materials 3 × 6.853 = 20.559, +7.75% tax  = 22.1523225
    // overhead  22.1523225 × (1/0.6 − 1)        = 14.768215
    // labor     21.375 × 35                     = 748.125
    expect(totals.materialProfit).toBeCloseTo(5.538080625, 8);
    expect(totals.laborProfit).toBeCloseTo(112.21875, 8);
    expect(totals.materialTotal).toBeCloseTo(42.458618125, 8);
    expect(totals.laborTotal).toBeCloseTo(860.34375, 8);
  });

  it("the two columns sum to the combined figures exactly", () => {
    const totals = priceLines(
      [
        {
          type: "material",
          quantity: 7,
          unitPrice: 12.5,
          taxable: true,
          deliveryCost: 4.25,
        },
        {
          type: "labor",
          quantity: 4,
          unitPrice: 55,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      rates,
    );

    // Both quantities are linear in their bases, so the parts sum to the whole
    // with nothing left over. This is what lets the UI show two columns without
    // a reconciling line.
    expect(totals.materialProfit + totals.laborProfit).toBeCloseTo(
      totals.profit,
      10,
    );
    expect(totals.materialTotal + totals.laborTotal).toBeCloseTo(
      totals.total,
      10,
    );
  });

  it("gives a labor-only estimate an empty material column", () => {
    const totals = priceLines(
      [
        {
          type: "labor",
          quantity: 10,
          unitPrice: 35,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      rates,
    );

    expect(totals.overhead).toBe(0);
    expect(totals.materialProfit).toBe(0);
    expect(totals.materialTotal).toBe(0);
    expect(totals.laborTotal).toBeCloseTo(402.5, 8);
    expect(totals.total).toBeCloseTo(402.5, 8);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/domain test calc.test.ts`

Expected: FAIL. The three new tests error on `undefined` — `totals.materialProfit`, `totals.materialTotal`, and friends don't exist yet. Every pre-existing test in the file still passes.

- [ ] **Step 3: Add the four fields to the interface**

In `packages/domain/src/engine/calc.ts`, replace the whole `EstimateTotals` interface:

```ts
export interface EstimateTotals {
  materialCost: number; // material base + delivery + tax
  laborCost: number; // labor base, untaxed
  tax: number; // sum of per-line material tax (informational)
  directCost: number; // materialCost + laborCost
  overhead: number; // materials only — labor carries none
  profit: number;
  total: number;
  // The buildup split the way the workbook runs it: column M (materials) and
  // column P (labor) side by side, combining only at the bottom. Each pair sums
  // to its combined field exactly, because both are defined as that sum.
  materialProfit: number; // (materialCost + overhead) × profitRate
  laborProfit: number; // laborCost × profitRate
  materialTotal: number; // materialCost + overhead + materialProfit
  laborTotal: number; // laborCost + laborProfit
}
```

- [ ] **Step 4: Compute them in `priceLines`**

In the same file, replace everything in `priceLines` from `const directCost` through its closing `return` statement:

```ts
  const directCost = materialCost + laborCost;
  const overhead = materialCost * (1 / (1 - rates.overheadRate / 100) - 1);

  // The sheet's per-phase pattern, column by column:
  //   M58 = (M56 + M57) × 0.15      P58 = P56 × 0.15
  //   M59 =  M56 + M57 + M58        P59 = P56 + P58
  // profit and total are the sums of these, so the columns tie out by
  // definition rather than by luck.
  const profitRate = rates.profitRate / 100;
  const materialProfit = (materialCost + overhead) * profitRate;
  const laborProfit = laborCost * profitRate;
  const materialTotal = materialCost + overhead + materialProfit;
  const laborTotal = laborCost + laborProfit;
  const profit = materialProfit + laborProfit;
  const total = materialTotal + laborTotal;

  return {
    materialCost,
    laborCost,
    tax,
    directCost,
    overhead,
    profit,
    total,
    materialProfit,
    laborProfit,
    materialTotal,
    laborTotal,
  };
```

- [ ] **Step 5: Run the domain tests to verify they pass**

Run: `bun run --cwd packages/domain test`

Expected: PASS, including every pre-existing assertion. Watch two in particular — `calc.test.ts`'s existing pins of `profit` to `117.7568306` and `total` to `902.8023681` must still hold; if either now fails, the re-association was written wrong, not the pin.

- [ ] **Step 6: Run the full suite**

Run: `bun run test && bun run typecheck && bun run lint`

Expected: all green. `packages/web` will not typecheck-fail yet — `EMPTY_TOTALS` is the only object literal typed as `EstimateTotals`, and Task 4 fixes it. **If typecheck does fail on `EMPTY_TOTALS` in `packages/web/src/screens/EstimateEditorScreen.tsx`, add the four zero fields to that literal now** and mention it in your report; the plan expects it in Task 4 but a red typecheck must not be committed.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/engine/calc.ts packages/domain/src/engine/calc.test.ts
git commit -m "feat: split the cost buildup into material and labor columns"
```

---

## Task 2: `summarizeTasks` moves task rollups into the engine

**Files:**
- Create: `packages/domain/src/engine/tasks.ts`
- Create: `packages/domain/src/engine/tasks.test.ts`
- Modify: `packages/domain/src/engine/index.ts`

**Interfaces:**
- Consumes: `LineItemView` from `./calc.ts` (`calc.ts:9`), which extends `LineItem` with `lineTotal` and `cost`. The fields used here are `taskKey`, `taskName`, `type`, and `cost`.
- Produces: `summarizeTasks(lines: LineItemView[]): LineBlock[]`, and the exported types `TaskGroup`, `LooseLine`, `LineBlock`. Task 4 imports all four from `@landscape/domain` and deletes the web layer's local copies.

This is a move, not a rewrite: `toBlocks` in `packages/web/src/screens/EstimateEditorScreen.tsx` does the grouping today with a single `total` accumulator. It gains two more accumulators and relocates to a package that has tests.

- [ ] **Step 1: Write the failing tests**

Create `packages/domain/src/engine/tasks.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { summarizeTasks } from "./tasks.ts";
import type { LineItemView } from "./calc.ts";

// A minimal priced line. `cost` is what the engine already computed for this
// line; summarizeTasks only ever sums it, never re-derives it.
function line(over: Partial<LineItemView> = {}): LineItemView {
  return {
    id: "li",
    phase: null,
    type: "material",
    description: "Line",
    quantity: 1,
    unit: "unit(s)",
    unitPrice: 10,
    taxable: false,
    deliveryCost: 0,
    quantityFormula: "1",
    sourceAssemblyId: "a1",
    sourceLineKey: null,
    taskKey: null,
    taskName: null,
    lineTotal: 10,
    cost: 10,
    ...over,
  };
}

describe("summarizeTasks", () => {
  it("groups lines by taskKey, at the position of each group's first line", () => {
    const blocks = summarizeTasks([
      line({ id: "a", taskKey: "t1", taskName: "Install valves" }),
      line({ id: "b", taskKey: "t2", taskName: "Trench" }),
      line({ id: "c", taskKey: "t1", taskName: "Install valves" }),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => (b.kind === "group" ? b.key : "loose"))).toEqual([
      "t1",
      "t2",
    ]);
    const first = blocks[0];
    if (first.kind !== "group") {
      throw new Error("expected a group");
    }
    expect(first.lines.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("splits each task's money into material and labor, summing to its total", () => {
    const blocks = summarizeTasks([
      line({ id: "labor", taskKey: "t1", taskName: "Install valves", type: "labor", cost: 130.81 }),
      line({ id: "valves", taskKey: "t1", taskName: "Install valves", cost: 134.69 }),
      line({ id: "tape", taskKey: "t1", taskName: "Install valves", cost: 0.65 }),
    ]);

    expect(blocks).toHaveLength(1);
    const group = blocks[0];
    if (group.kind !== "group") {
      throw new Error("expected a group");
    }
    // The workbook's Q34 for this task: P34 + M35 + M36.
    expect(group.materialCost).toBeCloseTo(135.34, 8);
    expect(group.laborCost).toBeCloseTo(130.81, 8);
    expect(group.total).toBeCloseTo(266.15, 8);
    expect(group.materialCost + group.laborCost).toBeCloseTo(group.total, 10);
  });

  it("leaves lines with no taskKey loose, in place", () => {
    const blocks = summarizeTasks([
      line({ id: "loose1" }),
      line({ id: "grouped", taskKey: "t1", taskName: "Trench" }),
      line({ id: "loose2" }),
    ]);

    expect(blocks.map((b) => b.kind)).toEqual(["loose", "group", "loose"]);
    const first = blocks[0];
    if (first.kind !== "loose") {
      throw new Error("expected a loose line");
    }
    expect(first.line.id).toBe("loose1");
  });

  it("falls back to the taskKey when a snapshot has no taskName", () => {
    const blocks = summarizeTasks([
      line({ taskKey: "installValves", taskName: null }),
    ]);

    const only = blocks[0];
    if (only.kind !== "group") {
      throw new Error("expected a group");
    }
    expect(only.name).toBe("installValves");
  });

  it("returns nothing for no lines", () => {
    expect(summarizeTasks([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/domain test tasks.test.ts`

Expected: FAIL — the module `./tasks.ts` does not exist, so the import fails before any test runs.

- [ ] **Step 3: Write the implementation**

Create `packages/domain/src/engine/tasks.ts`:

```ts
import type { LineItemView } from "./calc.ts";

/**
 * A task group for display: a named grouping owning a mix of labor and material
 * lines, carrying the three money columns the workbook shows on a task row —
 * `M` (materials), `P` (labor), and `Q`, their combined total.
 */
export interface TaskGroup {
  kind: "group";
  key: string;
  name: string;
  lines: LineItemView[];
  materialCost: number;
  laborCost: number;
  total: number; // materialCost + laborCost — the workbook's Q
}

/** An ungrouped line, shown on its own. */
export interface LooseLine {
  kind: "loose";
  line: LineItemView;
}

export type LineBlock = TaskGroup | LooseLine;

/**
 * Buckets one assembly's lines into task groups by `taskKey`, keeping each group
 * at the position of its first line. Ungrouped lines stay loose.
 *
 * Lives here rather than in the web layer because it sums money, and money is
 * summed in exactly one package — the one that has tests. It only ever adds up
 * each line's already-computed `cost`; it never re-derives a figure.
 */
export function summarizeTasks(lines: LineItemView[]): LineBlock[] {
  const blocks: LineBlock[] = [];
  const byKey = new Map<string, TaskGroup>();

  for (const line of lines) {
    if (line.taskKey == null) {
      blocks.push({ kind: "loose", line });
      continue;
    }

    let group = byKey.get(line.taskKey);
    if (!group) {
      group = {
        kind: "group",
        key: line.taskKey,
        name: line.taskName ?? line.taskKey,
        lines: [],
        materialCost: 0,
        laborCost: 0,
        total: 0,
      };
      byKey.set(line.taskKey, group);
      blocks.push(group);
    }

    group.lines.push(line);
    if (line.type === "labor") {
      group.laborCost += line.cost;
    } else {
      group.materialCost += line.cost;
    }
    group.total += line.cost;
  }

  return blocks;
}
```

- [ ] **Step 4: Export it from the engine barrel**

In `packages/domain/src/engine/index.ts`, add one line after the `calc.ts` export:

```ts
export * from "./formula.ts";
export * from "./generate.ts";
export * from "./calc.ts";
export * from "./tasks.ts";
export * from "./preview.ts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd packages/domain test`

Expected: PASS, all files.

- [ ] **Step 6: Verify the whole repo**

Run: `bun run test && bun run typecheck && bun run lint`

Expected: all green. `tasks.ts` deliberately does not re-export `LineItemView` — `calc.ts` already exports it through the same barrel, and two `export *` lines exporting the same name is a conflict worth not having.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/engine/tasks.ts packages/domain/src/engine/tasks.test.ts packages/domain/src/engine/index.ts
git commit -m "feat: group and total an assembly's tasks in the engine"
```

---

## Task 3: Pin the split to the workbook

**Files:**
- Modify: `packages/platform/src/seed/catalog.test.ts` — the `starter catalog — fidelity to the Package sheet` describe block

**Interfaces:**
- Consumes: `materialProfit`, `laborProfit`, `materialTotal`, `laborTotal` from Task 1.
- Produces: nothing. This is a regression lock.

This is a **regression lock, not a red-green cycle** — the assertions pass on arrival by design, pinning Task 1's split against the seeded catalog and the workbook. Do not manufacture a failing state. Do confirm the lock binds (Step 3) and report how.

`catalog.test.ts` deliberately imports the production seed as its system under test (see its header comment). That coupling is intended. Do not swap it for a fixture.

- [ ] **Step 1: Add the per-assembly identity assertion**

In `packages/platform/src/seed/catalog.test.ts`, inside the existing `for (const { name, totals, laborHours } of RESULTS)` loop, after the `charges overhead on materials only` test, add:

```ts
    // The two columns are each linear in their base, so they sum to the
    // combined figures with nothing left over — per assembly, not just for the
    // job. This is what lets the editor show two columns with no fudge line.
    it(`${name}'s material and labor columns sum to its totals`, () => {
      expect(totals.materialProfit + totals.laborProfit).toBeCloseTo(
        totals.profit,
        8,
      );
      expect(totals.materialTotal + totals.laborTotal).toBeCloseTo(
        totals.total,
        8,
      );
    });
```

- [ ] **Step 2: Pin Irrigation's two columns to the workbook**

In the same file, inside the existing `it("Irrigation's full buildup matches the sheet's per-phase pattern", ...)` test, append after the `totals.total` assertion:

```ts
    // The workbook runs this phase as two columns (rows 56–59):
    //   M56 1,142.31*  P56 2,427.93     *seed-corrected; the sheet's SUM
    //   M57   761.54   (no labor OH)     drops its last three material rows
    //   M58   285.58   P58   364.19
    //   M59 2,189.43   P59 2,792.12
    expect(totals.materialProfit).toBeCloseTo(285.578445, 5);
    expect(totals.laborProfit).toBeCloseTo(364.189875, 5);
    expect(totals.materialTotal).toBeCloseTo(2189.434745, 5);
    expect(totals.laborTotal).toBeCloseTo(2792.122375, 5);
    expect(totals.materialTotal + totals.laborTotal).toBeCloseTo(4981.55712, 5);
```

- [ ] **Step 3: Run the tests and confirm the lock binds**

Run: `bun run --cwd packages/platform test`

Expected: PASS on arrival.

Then confirm the assertions are not vacuous. Temporarily change `laborProfit` in `packages/domain/src/engine/calc.ts` to `const laborProfit = 0;`, re-run, and check that the Irrigation pin and every per-assembly identity test fail. **Then restore `calc.ts` exactly** — verify with `git diff --exit-code packages/domain/src/engine/calc.ts`, which must print nothing and exit 0 — and re-run to green. Record both the failing output and the restored-green output in your report.

- [ ] **Step 4: Run the full suite**

Run: `bun run test && bun run typecheck && bun run lint`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/seed/catalog.test.ts
git commit -m "test: pin the material/labor split to the workbook's M and P columns"
```

---

## Task 4: The editor renders the split

**Files:**
- Modify: `packages/web/src/screens/EstimateEditorScreen.tsx` — the `@landscape/domain` import, `EMPTY_TOTALS`, `AssemblyFooter`, the local task types and `toBlocks` (deleted), `AssemblyLines`, `GroupRows`, `LineRow`, `TotalsPanel`

Line numbers below are as of this plan's writing and shift as you edit. Locate each target by its symbol name, not by line.

**Interfaces:**
- Consumes: `materialProfit`, `laborProfit`, `materialTotal`, `laborTotal` (Task 1); `summarizeTasks`, `TaskGroup` (Task 2).
- Produces: nothing downstream.

**This task has no test cycle.** `packages/web` has no test infrastructure, and standing one up is explicitly out of scope. Verify with `bun run typecheck`, `bun run lint`, `bun run --cwd packages/web build`, `bun run test` (the other packages must stay green), and a careful reading against this plan. State plainly in your report that no automated test covers the rendered markup.

The rendering rules, so the code below reads as intentional:

- **Line rows blank the columns that don't apply.** A line is material or labor, never both; a `$0.00` in the other column would read as "this cost nothing" rather than "not applicable".
- **Total rows always print a number.** A task with no materials shows `$0.00`, because a total over zero material lines really is zero.
- **The `Total` column holds task totals only** — the workbook's `Q`. It renders only when the table has at least one task-total row, so a flattened single-task assembly gets five columns instead of six with one permanently empty.
- **Overhead's Labor cell is an em dash**, never `$0.00`. Labor never carries overhead, so there is no figure — as opposed to a rate that applied and came to nothing.

- [ ] **Step 1: Update the imports**

In `packages/web/src/screens/EstimateEditorScreen.tsx`, replace the `@landscape/domain` import block (near the top, currently ~line 6):

```ts
import {
  previewEstimate,
  summarizeTasks,
  type CatalogContext,
  type EstimateSelection,
  type EstimateTotals,
  type EstimateView,
  type TaskGroup,
} from "@landscape/domain";
```

- [ ] **Step 2: Add the four fields to `EMPTY_TOTALS`**

Replace the `EMPTY_TOTALS` literal:

```ts
const EMPTY_TOTALS: EstimateTotals = Object.freeze({
  materialCost: 0,
  laborCost: 0,
  tax: 0,
  directCost: 0,
  overhead: 0,
  profit: 0,
  total: 0,
  materialProfit: 0,
  laborProfit: 0,
  materialTotal: 0,
  laborTotal: 0,
});
```

- [ ] **Step 3: Delete the local task types and `toBlocks`**

Delete four declarations and their comments, contiguous in the file: the local `TaskGroup` interface, the `LooseLine` interface, the `LineBlock` type alias, and the `toBlocks` function. That is everything from the comment beginning `// A task group for display:` through `toBlocks`'s closing brace. `summarizeTasks` and the types from `@landscape/domain` replace all of it.

- [ ] **Step 4: Replace `AssemblyFooter` with a shared buildup table**

Replace the whole `AssemblyFooter` function, together with its leading comment, with these two components:

```tsx
// The workbook's two money columns — M (materials) and P (labor) — run down the
// whole buildup and combine only at the bottom. Shared by the per-assembly
// footer and the estimate panel so the two can never disagree about shape.
function BuildupTable({
  totals,
  overheadRate,
  profitRate,
}: {
  totals: EstimateTotals;
  overheadRate: number;
  profitRate: number;
}) {
  const row = (
    label: string,
    material: ReactNode,
    labor: ReactNode,
    strong = false,
  ) => (
    <tr className={strong ? "font-semibold text-slate-800" : "text-slate-600"}>
      <td className={strong ? "pt-1" : undefined}>{label}</td>
      <td className={`text-right tabular-nums ${strong ? "pt-1" : ""}`}>
        {material}
      </td>
      <td className={`text-right tabular-nums ${strong ? "pt-1" : ""}`}>
        {labor}
      </td>
    </tr>
  );

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-xs text-slate-400">
          <th />
          <th className="pb-1 text-right font-medium">Material</th>
          <th className="pb-1 text-right font-medium">Labor</th>
        </tr>
      </thead>
      <tbody>
        {row(
          "Subtotal",
          formatCurrency(totals.materialCost),
          formatCurrency(totals.laborCost),
        )}
        {/* An em dash, not $0.00 — labor never carries overhead, so there is no
            figure. A zero would claim the rate applied and came to nothing. */}
        {row(
          `Overhead (${overheadRate}%)`,
          formatCurrency(totals.overhead),
          "—",
        )}
        {row(
          `Profit (${profitRate}%)`,
          formatCurrency(totals.materialProfit),
          formatCurrency(totals.laborProfit),
        )}
        {row(
          "Total",
          formatCurrency(totals.materialTotal),
          formatCurrency(totals.laborTotal),
          true,
        )}
      </tbody>
    </table>
  );
}

// The sheet ends each phase with its own two-column buildup (rows 56–59). The
// assembly's combined total already sits in the block header above.
function AssemblyFooter({
  totals,
  overheadRate,
  profitRate,
}: {
  totals: EstimateTotals;
  overheadRate: number;
  profitRate: number;
}) {
  return (
    <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-3">
      <BuildupTable
        totals={totals}
        overheadRate={overheadRate}
        profitRate={profitRate}
      />
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `AssemblyLines` for the new columns**

Replace the whole `AssemblyLines` function:

```tsx
function AssemblyLines({ lines }: { lines: LineItemView[] }) {
  if (lines.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-400">No line items yet.</p>
    );
  }
  const blocks = summarizeTasks(lines);
  // Flatten a single-task assembly (e.g. Soil Prep): the assembly header already
  // names it and shows its total, so repeating a task header would be noise.
  const flat =
    blocks.length === 1 && blocks[0].kind === "group" ? blocks[0] : null;
  // The Total column holds task totals only — the workbook's Q. A flattened
  // assembly, or one whose every task is a single line, has no task-total row,
  // so the column would never fill. Drop it rather than leave it empty.
  const showTotal =
    !flat && blocks.some((b) => b.kind === "group" && b.lines.length > 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="px-4 py-1.5 font-medium">Description</th>
            <th className="px-4 py-1.5 text-right font-medium">Qty</th>
            <th className="px-4 py-1.5 text-right font-medium">Unit price</th>
            <th className="px-4 py-1.5 text-right font-medium">Material</th>
            <th className="px-4 py-1.5 text-right font-medium">Labor</th>
            {showTotal && (
              <th className="px-4 py-1.5 text-right font-medium">Total</th>
            )}
          </tr>
        </thead>
        <tbody>
          {flat
            ? flat.lines.map((line) => (
                <LineRow key={line.id} line={line} showTotal={showTotal} />
              ))
            : blocks.map((block) =>
                block.kind === "group" ? (
                  <GroupRows
                    key={block.key}
                    group={block}
                    showTotal={showTotal}
                  />
                ) : (
                  <LineRow
                    key={block.line.id}
                    line={block.line}
                    showTotal={showTotal}
                  />
                ),
              )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `GroupRows` for the three-column task total**

Replace the whole `GroupRows` function, together with its leading comment:

```tsx
// A task: a header row naming it, its lines indented beneath, and a "Task total"
// row carrying all three money columns — the workbook's Q34 pattern. A
// single-line task collapses to just that line; a header and a total around one
// row is only noise, and its one number is already on screen.
function GroupRows({
  group,
  showTotal,
}: {
  group: TaskGroup;
  showTotal: boolean;
}) {
  if (group.lines.length === 1) {
    return <LineRow line={group.lines[0]} showTotal={showTotal} />;
  }
  const columns = showTotal ? 6 : 5;
  return (
    <>
      <tr className="border-b border-slate-100 bg-slate-50/60">
        <td colSpan={columns} className="px-4 py-2 font-medium text-slate-800">
          {group.name}
        </td>
      </tr>
      {group.lines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          showTotal={showTotal}
          indented
        />
      ))}
      <tr className="border-b border-slate-200">
        <td
          colSpan={3}
          className="px-4 pb-2 pt-1 text-right text-xs font-medium uppercase tracking-wide text-slate-400"
        >
          Task total
        </td>
        <td className="px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
          {formatCurrency(group.materialCost)}
        </td>
        <td className="px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
          {formatCurrency(group.laborCost)}
        </td>
        {showTotal && (
          <td className="px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
            {formatCurrency(group.total)}
          </td>
        )}
      </tr>
    </>
  );
}
```

- [ ] **Step 7: Rewrite `LineRow` to fill one money column**

Replace the whole `LineRow` function, together with its leading comment:

```tsx
// One line item row, uniform for labor (qty in hours) and material (qty + unit).
// A line is one or the other, never both, so it fills exactly one money column
// and leaves the rest blank — a "$0.00" there would read as "this cost nothing"
// rather than "not applicable".
function LineRow({
  line,
  showTotal,
  indented = false,
}: {
  line: LineItemView;
  showTotal: boolean;
  indented?: boolean;
}) {
  const isLabor = line.type === "labor";
  return (
    <tr className="border-b border-slate-100">
      <td className={`py-2 text-slate-700 ${indented ? "pl-8 pr-4" : "px-4"}`}>
        {line.description}
      </td>
      <td className="px-4 py-2 text-right text-slate-600">
        {formatQuantity(line.quantity)}
        {isLabor ? " hr" : line.unit ? ` ${line.unit}` : ""}
      </td>
      <td className="px-4 py-2 text-right text-slate-600">
        {formatCurrency(line.unitPrice)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-700">
        {isLabor ? "" : formatCurrency(line.cost)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-700">
        {isLabor ? formatCurrency(line.cost) : ""}
      </td>
      {showTotal && <td />}
    </tr>
  );
}
```

- [ ] **Step 8: Rewrite `TotalsPanel`**

Replace the whole `TotalsPanel` function:

```tsx
function TotalsPanel({ estimate }: { estimate: EstimateView }) {
  const { totals } = estimate;
  return (
    <div className="w-full space-y-2 rounded-lg border border-slate-200 p-4 text-sm shadow-sm">
      <h2 className="text-sm font-medium text-slate-600">Estimate</h2>
      <BuildupTable
        totals={totals}
        overheadRate={estimate.overheadRate}
        profitRate={estimate.profitRate}
      />
      <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-800">
        <span>Price</span>
        <span className="tabular-nums">{formatCurrency(totals.total)}</span>
      </div>
      {/* Tax is already inside materialCost, so it is a note, not a row — a
          fifth additive-looking row would break the column arithmetic above. */}
      <p className="text-xs text-slate-400">
        includes {formatCurrency(totals.tax)} sales tax on materials at{" "}
        {estimate.taxRate}%
      </p>
    </div>
  );
}
```

- [ ] **Step 9: Verify**

Run each and record the output:

```bash
bun run typecheck
bun run lint
bun run test
bun run --cwd packages/web build
```

Expected: all clean. If `typecheck` reports `TaskGroup` unused, you skipped Step 6's prop type; if it reports `toBlocks` still referenced, Step 3's deletion was incomplete.

- [ ] **Step 10: Re-read your diff against the rules**

Confirm each, and say so in your report with a `file:line`:

1. Every `LineRow` money cell for the line's *other* type renders `""`, not `formatCurrency(0)`.
2. Every total row (`GroupRows`' task total, `BuildupTable`'s Total) renders a number, never blank.
3. Overhead's Labor cell is `"—"`, and it is the only em dash.
4. `showTotal` gates the header cell, the `LineRow` filler cell, `GroupRows`' total cell, and `colSpan` — four places. A missed one produces a ragged table.
5. `BuildupTable` is used by both `AssemblyFooter` and `TotalsPanel`, and the buildup markup exists in exactly one place.

- [ ] **Step 11: Commit**

```bash
git add packages/web/src/screens/EstimateEditorScreen.tsx
git commit -m "feat: show material and labor as separate columns in the editor"
```

---

## After the last task

The plan's own verification is complete when Task 4's commands are green. Two things remain that no task covers:

1. **A live look at the running editor** — the only check that can catch a visual defect, since `packages/web` has no tests. Confirm on a saved estimate with two or more assemblies that: each assembly footer's Material and Labor columns each total its rows; the em dash appears under Labor/Overhead and nowhere else; a task-total row's three figures satisfy `material + labor = total`; and the panel's Material and Labor columns equal the sums of the assembly footers' columns.
2. **The whole-branch review**, on the most capable available model, per subagent-driven-development's Final Review section.
