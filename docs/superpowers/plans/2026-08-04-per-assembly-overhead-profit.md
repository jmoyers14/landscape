# Per-Assembly Overhead and Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and display overhead and profit per assembly, on a materials-only base, matching the source bid spreadsheet.

**Architecture:** One formula change in the pure calc engine (overhead's base moves from direct cost to material cost), plus a per-assembly rollup that runs the same buildup over each assembly's lines. The estimate editor already groups line items by assembly, so the UI change is adding a footer to an existing block component. No schema, repository, or API-contract changes — `EstimateView` is derived, never stored.

**Tech Stack:** Bun, TypeScript, `bun:test`, React + Tailwind, tRPC. Monorepo packages: `domain` (pure engine), `platform` (repos/seed), `api`, `web`.

**Design doc:** [`../specs/2026-08-04-per-assembly-overhead-profit-design.md`](../specs/2026-08-04-per-assembly-overhead-profit-design.md)

## Global Constraints

- **Always brace control-flow bodies** (`if`/`else`/`for`/`while`), even single statements. Biome's linter enforces this (`style/useBlockStatements`).
- **Prettier owns formatting; Biome lints only.** Do not enable Biome's formatter.
- **Conventional Commits** — subjects start with `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, etc. Only `feat`/`fix`/`perf` appear in release notes.
- **Do not hand-edit** the root `package.json` `version` or `CHANGELOG.md` — release-please owns them.
- **The engine is pure.** `packages/domain` has no I/O and no dependency on `platform`/`api`.
- Rates are percentages (`40` means 40%), not fractions.
- Commands: `bun run test` (all packages), `bun run --cwd packages/<pkg> test` (one), `bun run typecheck` (includes web), `bun run lint`.
- **There are no tests in `packages/web`.** The web task is verified with `bun run typecheck` + `bun run lint` + a manual check.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/engine/calc.ts` | Cost buildup + per-assembly rollup | 1, 2 |
| `packages/domain/src/engine/calc.test.ts` | Engine unit tests | 1, 2 |
| `packages/api/src/services/EstimateService/EstimateService.ts` | Re-exports engine view types | 2 |
| `packages/platform/src/seed/catalog.test.ts` | Fidelity guard vs. the spreadsheet | 3 |
| `packages/web/src/screens/EstimateEditorScreen.tsx` | Assembly blocks + totals panel | 4 |
| `docs/overhead.md`, `docs/data-model.md` | Both assert a direct-cost base | 5 |

---

### Task 1: Overhead applies to materials only

The spreadsheet charges overhead on materials and never on labor — the labor overhead cell is empty in all six phases. The engine currently charges it on `directCost = materialCost + laborCost`.

**Files:**
- Modify: `packages/domain/src/engine/calc.ts:60-93`
- Test: `packages/domain/src/engine/calc.test.ts:29-61`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `priceLines(lines: PricedLine[], rates: CostRates): EstimateTotals` — unchanged signature, changed overhead semantics. `EstimateTotals.overhead` is now a function of `materialCost` alone.

- [ ] **Step 1: Replace the test that asserts the old base**

In `packages/domain/src/engine/calc.test.ts`, replace the whole `it("applies margin-basis overhead and profit on cost+overhead", ...)` block (lines 29-61) with these two tests:

```ts
  it("applies overhead to materials only, never to labor", () => {
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
      settings,
    );
    // labor untaxed: 748.125; material taxed: 22.1523225
    expect(totals.materialCost).toBeCloseTo(22.1523225, 5);
    expect(totals.laborCost).toBeCloseTo(748.125, 5);
    expect(totals.directCost).toBeCloseTo(770.2773225, 5);
    // the sheet grosses up MATERIALS only: 22.1523225 / 0.6 - 22.1523225
    expect(totals.overhead).toBeCloseTo(14.768215, 5);
    expect(totals.materialCost + totals.overhead).toBeCloseTo(
      totals.materialCost / 0.6,
      5,
    );
    // profit is unchanged: it still applies to cost + overhead
    expect(totals.profit).toBeCloseTo(117.7568306, 5);
    expect(totals.total).toBeCloseTo(902.8023681, 5);
  });

  it("charges no overhead at all on a labor-only buildup", () => {
    const totals = priceLines(
      [
        {
          type: "labor",
          quantity: 10,
          unitPrice: 50,
          taxable: false,
          deliveryCost: 0,
        },
      ],
      { taxRate: 7.75, overheadRate: 40, profitRate: 15 },
    );
    expect(totals.overhead).toBe(0);
    expect(totals.profit).toBeCloseTo(75, 5); // 500 × 0.15
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/domain test calc.test.ts`

Expected: FAIL. `applies overhead to materials only` reports `overhead` around `513.5182150` (the old direct-cost gross-up) instead of `14.768215`, and `charges no overhead at all` reports about `333.33` instead of `0`.

- [ ] **Step 3: Change overhead's base**

In `packages/domain/src/engine/calc.ts`, in `priceLines`, change the overhead line only:

```ts
  const directCost = materialCost + laborCost;
  const overhead = materialCost * (1 / (1 - rates.overheadRate / 100) - 1);
  const profit = (directCost + overhead) * (rates.profitRate / 100);
  const total = directCost + overhead + profit;
```

Then update the `priceLines` doc comment (lines 60-67) — it currently says overhead is `cost / 0.6 − cost`. Replace that sentence with:

```
 * Overhead is margin-basis on MATERIALS ONLY (`materialCost / 0.6 − materialCost`
 * when overheadRate is 40) — the sheet charges no overhead on labor in any of its
 * six phases. Profit is a markup on cost + overhead.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/domain test calc.test.ts`

Expected: PASS, except `computeEstimate — pricing a stored snapshot` may still pass (it only asserts `total > directCost`). If any other assertion in this file fails, it is asserting the old base — fix it to use `materialCost`.

- [ ] **Step 5: Run the full suite**

Run: `bun run test`

Expected: PASS. `packages/platform/src/seed/catalog.test.ts` asserts only `materialCost` and `laborHours`, so it is unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/engine/calc.ts packages/domain/src/engine/calc.test.ts
git commit -m "fix: charge overhead on materials only, matching the bid sheet

The sheet's labor overhead cell is empty in all six phases; the engine
was grossing up materials + labor. This overpriced the sheet's Irrigation
phase by 29% (\$6,462.96 vs \$4,601.56).

Profit's formula is unchanged — per phase the sheet computes
(M + OH) x 0.15 + P x 0.15, which factors to (directCost + overhead) x 0.15."
```

---

### Task 2: Per-assembly totals replace the phase rollup

`EstimateView.phases` is a bare per-phase subtotal that nothing renders. Replace it with a full cost buildup per assembly.

**Files:**
- Modify: `packages/domain/src/engine/calc.ts:14-17` (remove `PhaseSummary`), `:29-42` (`EstimateView`), `:101-149` (`computeEstimate`, `summarizePhases`)
- Modify: `packages/api/src/services/EstimateService/EstimateService.ts:2-7`
- Test: `packages/domain/src/engine/calc.test.ts:82-139`

**Interfaces:**
- Consumes: `priceLines(lines, rates)` from Task 1.
- Produces:
  - `interface AssemblyTotals extends EstimateTotals { assemblyId: string | null; name: string }`
  - `EstimateView.assemblyTotals: AssemblyTotals[]` (replaces `EstimateView.phases`)
  - `PhaseSummary` and `EstimateView.phases` no longer exist.

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/engine/calc.test.ts`, in the `computeEstimate` describe block, replace the four `view.phases` assertions (lines 131-134) with:

```ts
    // one assembly, carrying its own full buildup
    expect(view.assemblyTotals).toHaveLength(1);
    expect(view.assemblyTotals[0].assemblyId).toBe("drainage");
    expect(view.assemblyTotals[0].name).toBe("Drainage");
    expect(view.assemblyTotals[0].directCost).toBeCloseTo(770.2773225, 5);
    expect(view.assemblyTotals[0].total).toBeCloseTo(view.totals.total, 5);
```

That test's `makeEstimate({...})` call currently passes no `assemblies`, so the name would not resolve. Add this property to it, directly above `lineItems`:

```ts
      assemblies: [
        {
          assemblyId: "drainage",
          name: "Drainage",
          driverValues: { drainageFt: 225 },
        },
      ],
```

Then add a new test at the end of the same describe block, before its closing `});`:

```ts
  it("per-assembly totals sum exactly to the estimate totals", () => {
    const line = (
      id: string,
      assemblyId: string,
      over: Partial<LineItem> = {},
    ): LineItem => ({
      id,
      phase: assemblyId,
      type: "material",
      description: "Line",
      quantity: 3,
      unit: "unit(s)",
      unitPrice: 6.853,
      taxable: true,
      deliveryCost: 0,
      quantityFormula: "1",
      sourceAssemblyId: assemblyId,
      sourceLineKey: id,
      taskKey: null,
      taskName: null,
      ...over,
    });

    const view = computeEstimate(
      makeEstimate({
        overheadRate: 40,
        profitRate: 15,
        taxRate: 7.75,
        assemblies: [
          { assemblyId: "a1", name: "Drainage", driverValues: {} },
          { assemblyId: "a2", name: "Irrigation", driverValues: {} },
        ],
        lineItems: [
          line("li_1", "a1"),
          line("li_2", "a1", {
            type: "labor",
            quantity: 21.375,
            unitPrice: 35,
            taxable: false,
          }),
          line("li_3", "a2", { quantity: 7, unitPrice: 12.5 }),
          line("li_4", "a2", {
            type: "labor",
            quantity: 4,
            unitPrice: 55,
            taxable: false,
          }),
        ],
      }),
    );

    expect(view.assemblyTotals).toHaveLength(2);
    expect(view.assemblyTotals.map((a) => a.name)).toEqual([
      "Drainage",
      "Irrigation",
    ]);

    // Both overhead and profit are linear in their bases, so the parts sum to
    // the whole with no rounding reconciliation. This is the property that lets
    // the UI show per-assembly money without a fudge line.
    const sum = (pick: (a: (typeof view.assemblyTotals)[number]) => number) =>
      view.assemblyTotals.reduce((acc, a) => acc + pick(a), 0);
    expect(sum((a) => a.materialCost)).toBeCloseTo(view.totals.materialCost, 8);
    expect(sum((a) => a.laborCost)).toBeCloseTo(view.totals.laborCost, 8);
    expect(sum((a) => a.overhead)).toBeCloseTo(view.totals.overhead, 8);
    expect(sum((a) => a.profit)).toBeCloseTo(view.totals.profit, 8);
    expect(sum((a) => a.total)).toBeCloseTo(view.totals.total, 8);
  });

  it("groups lines with no source assembly under their own block", () => {
    const view = computeEstimate(
      makeEstimate({
        taxRate: 0,
        assemblies: [],
        lineItems: [
          {
            id: "li_loose",
            phase: null,
            type: "material",
            description: "Hand-added line",
            quantity: 2,
            unit: "unit(s)",
            unitPrice: 10,
            taxable: false,
            deliveryCost: 0,
            quantityFormula: "2",
            sourceAssemblyId: null,
            sourceLineKey: null,
            taskKey: null,
            taskName: null,
          },
        ],
      }),
    );

    expect(view.assemblyTotals).toHaveLength(1);
    expect(view.assemblyTotals[0].assemblyId).toBeNull();
    expect(view.assemblyTotals[0].name).toBe("Other");
    expect(view.assemblyTotals[0].total).toBeCloseTo(view.totals.total, 8);
  });
```

Add `LineItem` to the type imports at the top of the test file:

```ts
import type { LineItem } from "../types/estimate.ts";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/domain test calc.test.ts`

Expected: FAIL — TypeScript errors that `assemblyTotals` does not exist on `EstimateView`.

- [ ] **Step 3: Replace the phase rollup in the engine**

In `packages/domain/src/engine/calc.ts`:

Delete the `PhaseSummary` interface (lines 14-17). Replace it with:

```ts
/** One assembly's own cost buildup, carrying the same shape as the job totals. */
export interface AssemblyTotals extends EstimateTotals {
  assemblyId: string | null; // null = lines with no source assembly
  name: string;
}
```

In `EstimateView`, replace `phases: PhaseSummary[];` with:

```ts
  assemblyTotals: AssemblyTotals[];
```

In `computeEstimate`, replace `phases: summarizePhases(lineItems),` with:

```ts
    assemblyTotals: summarizeAssemblies(estimate),
```

Delete `summarizePhases` entirely (lines 136-149) and add in its place:

```ts
// Each assembly's own cost buildup. The sheet computes overhead and profit per
// phase (our assembly), not once for the whole bid. Both are linear in their
// bases, so these sum exactly to the estimate's totals — no reconciling line.
// Order is first-seen, which is generation order, which follows `assemblies`.
function summarizeAssemblies(estimate: Estimate): AssemblyTotals[] {
  const nameById = new Map(
    estimate.assemblies.map((a) => [a.assemblyId, a.name]),
  );
  const order: (string | null)[] = [];
  const grouped = new Map<string | null, LineItem[]>();

  for (const item of estimate.lineItems) {
    const key = item.sourceAssemblyId;
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = [];
      grouped.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }

  return order.map((assemblyId) => ({
    assemblyId,
    name:
      assemblyId === null
        ? "Other"
        : (nameById.get(assemblyId) ?? "Unknown assembly"),
    ...priceLines(grouped.get(assemblyId) ?? [], estimate),
  }));
}
```

`LineItem` is already imported at the top of `calc.ts`. If it is not, add it to the existing `import type { ... } from "../types/estimate.ts";` block.

- [ ] **Step 4: Update the API's type re-export**

In `packages/api/src/services/EstimateService/EstimateService.ts`, change `PhaseSummary` to `AssemblyTotals` in the re-export block (lines 2-7):

```ts
export type {
  EstimateView,
  EstimateTotals,
  LineItemView,
  AssemblyTotals,
} from "@landscape/domain";
```

Also check `packages/domain/src/index.ts` — if it explicitly names `PhaseSummary` in its exports, rename that to `AssemblyTotals` too. Find it with:

```bash
grep -rn "PhaseSummary" packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

That grep must return nothing when this task is done.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd packages/domain test calc.test.ts`

Expected: PASS, all four `computeEstimate` tests.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `bun run test && bun run typecheck`

Expected: PASS. If `typecheck` fails in `packages/web`, it is because something reads `view.phases` — it should not, but if it does, delete that usage; Task 4 rewrites that area anyway.

- [ ] **Step 7: Commit**

```bash
git add packages/domain packages/api
git commit -m "feat: compute overhead and profit per assembly

Replaces EstimateView.phases (a bare subtotal nothing rendered) with
assemblyTotals, a full cost buildup per assembly. Because overhead and
profit are linear in their bases, the parts sum exactly to the whole."
```

---

### Task 3: Lock the buildup to the spreadsheet

`catalog.test.ts` is the existing regression guard that prices all six seeded assemblies against spreadsheet-derived anchors. Extend it to cover the new overhead base.

**Files:**
- Modify: `packages/platform/src/seed/catalog.test.ts:21-30`, `:56-69`

**Interfaces:**
- Consumes: `priceLines` (Task 1), `EstimateTotals`. Does **not** use `assemblyTotals` — this file prices one assembly at a time directly.
- Produces: nothing consumed by later tasks.

**Important:** do not use the sheet's own Irrigation phase total ($4,601.56). The seed deliberately diverges: the sheet's `SUM(M35:M51)` drops three material rows and `seed/irrigation.ts` corrects that, so seeded materials are `1142.31378`, not `944.05`. The figures below are what the seeded assembly actually produces.

- [ ] **Step 1: Write the failing tests**

In `packages/platform/src/seed/catalog.test.ts`, the describe block currently calls `runAssembly(seed)` inside its `for` loop. Hoist the results so a single assembly can be picked out. Replace lines 56-58:

```ts
describe("starter catalog — fidelity to the Package sheet", () => {
  for (const seed of STARTER_ASSEMBLIES) {
    const { name, totals, laborHours } = runAssembly(seed);
```

with:

```ts
const RESULTS = STARTER_ASSEMBLIES.map(runAssembly);

describe("starter catalog — fidelity to the Package sheet", () => {
  for (const { name, totals, laborHours } of RESULTS) {
```

Then, inside the same describe block and after the existing `it(...)`, add:

```ts
    // Overhead is charged on materials only — the sheet's labor overhead cell
    // is empty in every phase. Asserted per assembly so a regression in the
    // base shows up against real seeded data, not just a synthetic fixture.
    it(`${name} charges overhead on materials only`, () => {
      expect(totals.materialCost + totals.overhead).toBeCloseTo(
        totals.materialCost / 0.6,
        5,
      );
    });
  }

  // One assembly pinned end-to-end. Irrigation is all general labor ($35/hr),
  // so its labor cost follows directly from its hours: 69.3695 × 35.
  it("Irrigation's full buildup matches the sheet's per-phase pattern", () => {
    const irrigation = RESULTS.find((r) => r.name === "Irrigation");
    expect(irrigation, "Irrigation missing from STARTER_ASSEMBLIES").toBeDefined();
    const { totals } = irrigation!;
    expect(totals.materialCost).toBeCloseTo(1142.31378, 5);
    expect(totals.laborCost).toBeCloseTo(2427.9325, 5);
    expect(totals.directCost).toBeCloseTo(3570.24628, 5);
    expect(totals.overhead).toBeCloseTo(761.54252, 5);
    expect(totals.profit).toBeCloseTo(649.76832, 5);
    expect(totals.total).toBeCloseTo(4981.55712, 5);
  });
```

Note the `}` that closes the `for` loop now sits before the Irrigation test — make sure the existing loop-closing brace is not duplicated.

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun run --cwd packages/platform test catalog.test.ts`

Expected: PASS. These assert behavior Task 1 already built, so they should pass immediately — they are a regression lock, not a red-green cycle. **If any fails, stop**: either Task 1's formula is wrong or a seed price has drifted. Do not adjust the expected numbers to make them pass; they are derived from the spreadsheet.

- [ ] **Step 3: Commit**

```bash
git add packages/platform/src/seed/catalog.test.ts
git commit -m "test: pin the per-assembly buildup to the seeded catalog

Adds a materials-only overhead assertion for every starter assembly and
pins Irrigation's full buildup end-to-end."
```

---

### Task 4: Show per-assembly overhead and profit in the editor

The editor already renders one block per assembly. Give each block a footer with its own Overhead / Profit / Total.

**Files:**
- Modify: `packages/web/src/screens/EstimateEditorScreen.tsx` — `lineItemsFor` area (~`:355`), `blockSubtotal` (~`:359`), `DraftAssemblyBlock`, `SavedAssemblyBlock`, `BlockHeader`, `TotalsPanel` (~`:656`)

**Interfaces:**
- Consumes: `EstimateView.assemblyTotals: AssemblyTotals[]` from Task 2; `AssemblyTotals` is re-exported by the api package's `EstimateService`.
- Produces: nothing consumed by later tasks.

**No tests exist in `packages/web`.** Verification is `bun run typecheck`, `bun run lint`, and a manual look at the running app.

- [ ] **Step 1: Replace the subtotal helper with the engine's totals**

Delete the `blockSubtotal` helper:

```ts
const blockSubtotal = (lines: LineItemView[]): number =>
  lines.reduce((sum, line) => sum + line.cost, 0);
```

Add in its place:

```ts
// The engine's buildup for one assembly. An assembly with no lines yet has no
// entry, so fall back to zeros rather than letting the block disappear.
const EMPTY_TOTALS = {
  materialCost: 0,
  laborCost: 0,
  tax: 0,
  directCost: 0,
  overhead: 0,
  profit: 0,
  total: 0,
};

function totalsFor(view: EstimateView, assemblyId: string) {
  const found = view.assemblyTotals.find((a) => a.assemblyId === assemblyId);
  if (!found) {
    return EMPTY_TOTALS;
  }
  return found;
}
```

- [ ] **Step 2: Add the footer component**

Add next to `BlockHeader`:

```tsx
// The sheet ends each phase with its own Overhead / Profit / Total. Overhead is
// charged on materials only, so the label says so — a bare "(40%)" next to a
// number that is 40% of materials reads as a bug.
function AssemblyFooter({
  totals,
  overheadRate,
  profitRate,
}: {
  totals: typeof EMPTY_TOTALS;
  overheadRate: number;
  profitRate: number;
}) {
  const row = (label: string, value: number, strong = false) => (
    <div
      className={`flex justify-between ${
        strong ? "pt-1 font-semibold text-slate-800" : "text-slate-600"
      }`}
    >
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="space-y-1 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
      {row("Cost", totals.directCost)}
      {row(`Overhead (${overheadRate}% of materials)`, totals.overhead)}
      {row(`Profit (${profitRate}%)`, totals.profit)}
      {row("Total", totals.total, true)}
    </div>
  );
}
```

- [ ] **Step 3: Wire the footer into both block components**

In `DraftAssemblyBlock`, change the props to take the view, and render the footer. Replace its signature and body's header/footer lines:

```tsx
function DraftAssemblyBlock({
  selection,
  view,
  lines,
  onRemove,
  onValue,
}: {
  selection: Selection;
  view: EstimateView;
  lines: LineItemView[];
  onRemove: () => void;
  onValue: (key: string, value: string) => void;
}) {
  const totals = totalsFor(view, selection.assemblyId);
```

Change its `<BlockHeader name={selection.name} subtotal={blockSubtotal(lines)}>` to:

```tsx
      <BlockHeader name={selection.name} subtotal={totals.total}>
```

and add the footer immediately after `<AssemblyLines lines={lines} />`:

```tsx
      <AssemblyFooter
        totals={totals}
        overheadRate={view.overheadRate}
        profitRate={view.profitRate}
      />
```

At the call site (~`:296`), pass the view:

```tsx
          <DraftAssemblyBlock
            key={selection.assemblyId}
            selection={selection}
            view={view}
            lines={lineItemsFor(view, selection.assemblyId)}
            onRemove={() => removeAssembly(selection.assemblyId)}
            onValue={(key, value) =>
              setValue(selection.assemblyId, key, value)
            }
          />
```

Replace `SavedAssemblyBlock` in full with:

```tsx
// One assembly block in the read-only saved view: header + total, the frozen
// driver values, its line items, then its own overhead/profit buildup.
function SavedAssemblyBlock({
  assemblyId,
  view,
  name,
  driverValues,
  lines,
}: {
  assemblyId: string;
  view: EstimateView;
  name: string;
  driverValues: Record<string, number>;
  lines: LineItemView[];
}) {
  const drivers = Object.entries(driverValues);
  const totals = totalsFor(view, assemblyId);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <BlockHeader name={name} subtotal={totals.total} />
      {drivers.length > 0 && (
        <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
          {drivers.map(([key, value]) => `${key}: ${value}`).join(", ")}
        </div>
      )}
      <AssemblyLines lines={lines} />
      <AssemblyFooter
        totals={totals}
        overheadRate={view.overheadRate}
        profitRate={view.profitRate}
      />
    </div>
  );
}
```

Its call site (~`:341`) becomes:

```tsx
          <SavedAssemblyBlock
            key={assembly.assemblyId}
            assemblyId={assembly.assemblyId}
            view={view}
            name={assembly.name}
            driverValues={assembly.driverValues}
            lines={lineItemsFor(view, assembly.assemblyId)}
          />
```

- [ ] **Step 4: Fix the estimate-level overhead label**

In `TotalsPanel`, change:

```tsx
      {row(`Overhead (${estimate.overheadRate}%)`, totals.overhead)}
```

to:

```tsx
      {row(
        `Overhead (${estimate.overheadRate}% of materials)`,
        totals.overhead,
      )}
```

- [ ] **Step 5: Verify it compiles and lints**

Run: `bun run typecheck && bun run lint`

Expected: PASS with no errors.

- [ ] **Step 6: Verify it renders**

Run: `bun run dev:web`, open an estimate with at least two assemblies.

Expected: each assembly block ends with Cost / Overhead (40% of materials) / Profit (15%) / Total. Each block's Total matches the number in its header. The per-assembly Overhead figures add up to the Overhead line in the right-hand Estimate panel, and the per-assembly Totals add up to its Total.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/screens/EstimateEditorScreen.tsx
git commit -m "feat: show overhead and profit per assembly in the estimate editor

Each assembly block now ends with its own Cost / Overhead / Profit /
Total, mirroring the bid sheet. Money comes from the engine rather than
being re-summed in the client, so the two can't disagree."
```

---

### Task 5: Correct the docs

Two docs state overhead applies to direct cost. Both are now wrong.

**Files:**
- Modify: `docs/overhead.md:51-69`
- Modify: `docs/data-model.md:155`, `:253-256`

**Interfaces:**
- Consumes: the final formula from Task 1.
- Produces: nothing.

- [ ] **Step 1: Update `docs/overhead.md`**

Replace the code block under "## Where it lives in the code" (lines 56-61) with:

```ts
const directCost = materialCost + laborCost;
const overhead   = materialCost * (1 / (1 - rates.overheadRate / 100) - 1);
const profit     = (directCost + overhead) * (rates.profitRate / 100);
const total      = directCost + overhead + profit;
```

Replace the paragraph beginning "That `1 / (1 - rate) - 1` is the margin gross-up" and the "Heads up on the label" blockquote (lines 63-69) with:

```markdown
That `1 / (1 - rate) - 1` is the margin gross-up. Note its base: **materials
only**. The source sheet charges no overhead on labor — the labor overhead cell
is empty in all six of its phases — so neither do we.

This is computed **per assembly** as well as for the whole estimate; see
[the per-assembly design](./superpowers/specs/2026-08-04-per-assembly-overhead-profit-design.md).
Because the gross-up is linear in its base, the per-assembly figures sum exactly
to the estimate's.

> **Heads up on the label:** the UI says `Overhead (40% of materials)` rather
> than `Overhead (40%)`. The bare percentage reads as a bug next to a number
> that is 66.7% of the material cost.
```

- [ ] **Step 2: Update `docs/data-model.md`**

On line 155, change the trailing comment:

```ts
  overheadRate: number;   // 40 — margin basis on materials; see "Cost buildup" below
```

Replace item 1 under "Two things to note" (lines 253-256) with:

```markdown
1. **Overhead is margin-basis, on materials only.** The sheet computes overhead
   as `materials / 0.6 − materials` — it marks materials up so they become 60%
   of the materials+overhead subtotal. Generalized,
   `overhead = materialCost × (1 / (1 − rate) − 1)`. With `overheadRate = 40`
   this is exactly `materials / 0.6 − materials`, so the stored rate stays a
   clean 40. **Labor carries no overhead** — the sheet's labor overhead cell is
   empty in every phase. Overhead is computed per assembly and for the estimate.
```

- [ ] **Step 3: Verify no stale claims remain**

Run:

```bash
grep -rn "cost / 0.6\|directCost \* (1 /\|overhead = cost" docs/ packages/ --include="*.md" --include="*.ts" | grep -v node_modules
```

Expected: only matches that explicitly describe the *sheet's* per-phase material formula or the historical note in the overhead-basis spec. Any line claiming the engine grosses up direct cost is stale — fix it.

- [ ] **Step 4: Commit**

```bash
git add docs/overhead.md docs/data-model.md
git commit -m "docs: overhead applies to materials only, per assembly"
```

---

## Done

Verify the whole branch:

```bash
bun run test && bun run typecheck && bun run lint
```

Then update the two shuffleboard tasks — **"Per-phase overhead and profit"** (`6a480e9e33744d13e68ac273`) and **"Per-phase cost breakdown"** (`6a480ea633744d13e68ac285`) — to `done`, noting that the second was a duplicate of the first. The hours column that ticket mentions is **not** delivered here; it belongs to "Labor time estimate," which owns the hours model.

## Not in scope

- Per-assembly rate overrides — the sheet uses one rate set for all phases.
- The margin/markup basis toggle — deferred, see [the overhead-basis spec](../specs/2026-08-03-overhead-basis-design.md).
- Freezing totals on sent estimates — [open question #1](../../open-questions.md). Note that this plan's Task 1 **does** retroactively reprice every existing estimate, including sent ones, because totals are derived rather than stored. That is intended.
- Renaming `LineItem.phase` (which holds the assembly name) — it is snapshotted in Mongo, so it needs a migration. Left for a cleanup pass.
