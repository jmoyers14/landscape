# Initialize Estimates With Every Assembly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A newly created estimate arrives holding every active assembly, each with its drivers at zero, and totals $0.00.

**Architecture:** Two changes in two packages. In `packages/domain`, the line generator stops charging a material's flat delivery when the line's quantity resolves to zero. In `packages/api`, `EstimateServiceImpl.create` loads the org's active assemblies, builds one zero-driver selection per assembly, and runs them through the same private generation method `setAssemblies` now calls. The web package is untouched.

**Tech Stack:** Bun (runtime + test runner), TypeScript, tsyringe DI, tRPC, Mongoose. Tests use `bun:test` with hand-rolled repository mocks from `@landscape/platform/test-support`.

**Spec:** `docs/superpowers/specs/2026-08-06-initialize-estimates-with-all-assemblies-design.md`

## Global Constraints

- **Always brace control-flow bodies** (`if` / `else` / `for` / `while`), even for a single statement. Biome's linter enforces exactly this one rule; `bun run lint` fails otherwise.
- **Prettier owns formatting; Biome lints only.** Do not reformat lines you did not otherwise change, and do not hand-expand code that Prettier would collapse onto one line.
- **Conventional Commits.** Every commit subject starts with `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, or `chore:`.
- **Never hand-edit** the root `package.json` `version` field or `CHANGELOG.md` — release-please owns both.
- **New estimates use zero for every driver, never the assembly's `defaultValue`.** The seeded defaults are the source workbook's example figures; using them would open every new estimate as a priced copy of someone else's job.
- **Only `active` assemblies are auto-added**, ordered by `sortOrder`.
- **`packages/platform/src/seed/catalog.test.ts` must not be modified** and must still pass. It is the regression lock proving the delivery fix left the workbook tie-out alone.
- **No changes in `packages/web`.** The picker and empty state already behave correctly.
- **Do not change the `EstimateRepository` interface.** `create` makes the shell, `replaceSnapshot` fills it.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/engine/generate.ts` | Modify (~line 100) | Resolve a material line's delivery count; now yields 0 when quantity is 0. |
| `packages/domain/src/engine/generate.test.ts` | Modify (append) | Pins the zero-quantity delivery behavior over a pure function. |
| `packages/api/src/services/EstimateService/EstimateServiceImpl.ts` | Modify | `create` populates; the generation body becomes a private method shared with `setAssemblies`. |
| `packages/api/src/services/EstimateService/EstimateServiceImpl.test.ts` | Modify (append to the `create` describe) | Pins auto-add, ordering, `active` filtering, zero drivers, and the $0.00 total. |

Two tasks. Task 1 must land before Task 2: Task 2's `totals.total === 0` assertion fails without it.

---

### Task 1: A zero-quantity line bills no delivery

**Files:**
- Modify: `packages/domain/src/engine/generate.ts:100-102`
- Test: `packages/domain/src/engine/generate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exported symbol. Task 2 depends on the *behavior* — a generated line whose `quantity` is `0` has `deliveryCost: 0` regardless of its `deliveriesFormula`.

**Background you need.** An assembly's material line may carry a `deliveriesFormula`, a text expression yielding a delivery count. The line's `deliveryCost` is the material's per-delivery cost times that count. Six seeded lines use the literal formula `"1"` — a flat delivery independent of how much is being delivered — so at zero quantity they still bill: Concrete's fill sand ($150) and pump ($250), Seating Wall's block ($150), and Planting's 1-gallon trees and mulch. Overhead and profit are then applied on top. Nobody pays $150 to deliver zero blocks.

The relevant code today, in `generateAssemblyLines`:

```ts
const quantity = quantities.get(line.key) ?? 0;   // ~line 62, already in scope
// …
const deliveries = line.deliveriesFormula
  ? evaluate(line.deliveriesFormula, scope)
  : 0;
return {
  ...base,
  type: "material",
  unit: material.unit,
  unitPrice: material.unitPrice,
  taxable: material.taxable,
  deliveryCost: material.deliveryCost * deliveries,
};
```

- [ ] **Step 1: Write the failing test**

Append to `packages/domain/src/engine/generate.test.ts`. The file already imports `describe, expect, it` from `bun:test` and `generateAssemblyLines` from `./generate.ts`; add `makeAssembly`, `makeMaterial`, and `makePricingSettings` to the existing import from `../test-support/fixture.ts`.

```ts
describe("generateAssemblyLines — flat deliveries at zero quantity", () => {
  // A material line with a flat `deliveriesFormula` of "1": one delivery no
  // matter the quantity. Several seeded lines are shaped exactly this way.
  const mulch = makeMaterial({
    id: "mulch",
    name: "Mulch",
    unit: "yds.",
    unitPrice: 40,
    deliveryCost: 150,
  });
  const assembly = makeAssembly({
    drivers: [{ key: "yards", label: "Mulch", unit: "yds.", defaultValue: 0 }],
    lines: [
      {
        kind: "material",
        key: "mulch",
        description: "Mulch",
        quantityFormula: "yards",
        deliveriesFormula: "1",
        materialId: "mulch",
        sortOrder: 1,
        taskKey: null,
      },
    ],
  });
  const generate = (yards: number) =>
    generateAssemblyLines(
      { assembly, driverValues: { yards } },
      new Map([[mulch.id, mulch]]),
      makePricingSettings(),
    )[0]!;

  it("charges no delivery for a line whose quantity resolves to zero", () => {
    const line = generate(0);
    expect(line.quantity).toBe(0);
    expect(line.deliveryCost).toBe(0);
  });

  it("still charges the flat delivery once the quantity is non-zero", () => {
    const line = generate(6);
    expect(line.quantity).toBe(6);
    expect(line.deliveryCost).toBe(150);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run --cwd packages/domain test generate
```

Expected: `charges no delivery for a line whose quantity resolves to zero` FAILS with `expect(received).toBe(expected)`, received `150`, expected `0`. The second test PASSES already — it is the guard proving the fix does not over-reach.

- [ ] **Step 3: Make the change**

In `packages/domain/src/engine/generate.ts`, replace the `deliveries` assignment:

```ts
      // A flat `deliveriesFormula` (e.g. "1") would otherwise bill a delivery
      // for a line of nothing — no one pays to have zero mulch delivered.
      const deliveries =
        quantity === 0 || !line.deliveriesFormula
          ? 0
          : evaluate(line.deliveriesFormula, scope);
```

`quantity` is already in scope from line 62. Leave the `return` block below it untouched.

- [ ] **Step 4: Run the domain suite**

```bash
bun run --cwd packages/domain test
```

Expected: PASS, including both new tests and every existing `generateAssemblyLines` fidelity test.

- [ ] **Step 5: Run the platform suite — the workbook regression lock**

```bash
bun run --cwd packages/platform test
```

Expected: PASS with **no edits** to `packages/platform/src/seed/catalog.test.ts`. This is the point of the step: at the seeded default drivers no line carrying a delivery formula resolves to zero quantity (`mulchYds` is 6, `treeOneGal` 80, `slabArea` 1000, `wallLength` 25; the one zero-defaulting driver, `lawnSqFt`, feeds only lines whose `deliveriesFormula` is `null`), so the pinned Irrigation cells and every other default-driver figure are unaffected. If a `catalog.test.ts` figure moves, **stop and report it** — that means the change reaches further than the spec claims. Do not adjust the expected values to match.

- [ ] **Step 6: Lint and typecheck**

```bash
bun run lint && bun run --cwd packages/domain typecheck
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/engine/generate.ts packages/domain/src/engine/generate.test.ts
git commit -m "fix: charge no delivery on a zero-quantity material line"
```

---

### Task 2: `create` populates the estimate with every active assembly

**Files:**
- Modify: `packages/api/src/services/EstimateService/EstimateServiceImpl.ts`
- Test: `packages/api/src/services/EstimateService/EstimateServiceImpl.test.ts`

**Interfaces:**
- Consumes: Task 1's behavior — a generated line at zero quantity has `deliveryCost: 0`. Without it the `totals.total` assertion below fails at roughly $1,000.
- Produces: no change to the public `EstimateService` interface. `create(orgId, projectId, title?)` keeps its signature and still returns `Promise<EstimateView>`; what changes is that the returned view now carries assemblies and line items.

**Background you need.**

`EstimateServiceImpl.create` today creates an empty shell: it validates the project, picks a default title, snapshots the org's rates, and calls `this.estimates.create`. It never touches assemblies.

`setAssemblies` does all the generation work: loads each selected assembly, resolves its driver values, gathers every material those lines reference, runs `generateAssemblyLines` per assembly, and persists the result through `this.estimates.replaceSnapshot`. That body is what `create` needs, so it moves into a private method both call.

The two callers differ in ways that must stay with the callers, not the shared method:
- `setAssemblies` guards on `status === "draft"` and throws `BAD_REQUEST` for a selection naming an assembly that does not exist. Neither applies to `create`, which builds its selections from assemblies it just loaded.
- Both already hold a `settings` object before generating, so the shared method takes `settings` as a parameter rather than fetching it a second time.

`resolveDriverValues(assembly, provided)` gives each declared driver `provided?.[key] ?? driver.defaultValue`. Passing an explicit `0` yields `0` (`0 ?? x` is `0`), so building `{ [key]: 0 }` for every driver is enough — you do not need a new domain helper.

`SelectedAssembly` is already exported from `@landscape/domain` as `{ assembly: Assembly; driverValues: Record<string, number> }` — the exact type `generateAssemblyLines` takes. Use it; do not declare a new interface.

`AssemblyRepository.findByOrg(orgId)` returns **every** assembly sorted by `sortOrder`, including inactive ones, so the service filters on `active` itself.

**One behavior the tests depend on:** when the org has no active assemblies, `create` returns the bare shell without calling `replaceSnapshot`. There is nothing to generate, and the default `makeEstimateRepoMock().replaceSnapshot` returns `null`, which `requireView` turns into a `NOT_FOUND` throw — so skipping the call is what keeps the two existing `create` tests green.

- [ ] **Step 1: Write the failing tests**

Append these three tests **inside** the existing `describe("EstimateServiceImpl.create", …)` block in `packages/api/src/services/EstimateService/EstimateServiceImpl.test.ts`, after the two tests already there. Add `makeAssembly` to the existing import from `@landscape/platform/test-support`.

The file already defines `makeService`, `pricingStub`, `makeEstimateRepoMock`, and an `echoingEstimates` helper whose `replaceSnapshot` echoes the saved snapshot back as a persisted estimate — reuse it, overriding `create`.

```ts
  // Two assemblies out of catalog order plus a deactivated one, each with a
  // material line that bills a flat delivery — the shape that would put money
  // on a brand-new estimate if either half of this feature regressed.
  const catalogAssemblies = () => [
    makeAssembly({
      id: "assembly_b",
      name: "Planting",
      sortOrder: 2,
      drivers: [
        { key: "trees", label: "Trees", unit: "unit(s)", defaultValue: 80 },
      ],
      lines: [
        {
          kind: "material",
          key: "tree",
          description: "1-gallon tree",
          quantityFormula: "trees",
          deliveriesFormula: "1",
          materialId: "material_1",
          sortOrder: 1,
          taskKey: null,
        },
      ],
    }),
    makeAssembly({
      id: "assembly_a",
      name: "Drainage",
      sortOrder: 1,
      drivers: [
        { key: "feet", label: "Length", unit: "ft.", defaultValue: 225 },
      ],
      lines: [
        {
          kind: "material",
          key: "pipe",
          description: "Solid pipe",
          quantityFormula: "feet",
          deliveriesFormula: "1",
          materialId: "material_1",
          sortOrder: 1,
          taskKey: null,
        },
      ],
    }),
    makeAssembly({ id: "assembly_off", name: "Retired", sortOrder: 3, active: false }),
  ];

  const populatingService = () =>
    makeService({
      estimates: echoingEstimates({
        findByProject: mock(async () => []),
        create: mock(async (_orgId, data) => makeEstimate(data)),
      }),
      assemblies: makeAssemblyRepoMock({
        findByOrg: mock(async () => catalogAssemblies()),
      }),
      materials: makeMaterialRepoMock({
        findByIds: mock(async () => [
          makeMaterial({ id: "material_1", unitPrice: 40, deliveryCost: 150 }),
        ]),
      }),
    });

  it("starts a new estimate holding every active assembly, in sortOrder", async () => {
    const view = await populatingService().create("org_1", "project_1");

    expect(view.assemblies.map((a) => a.assemblyId)).toEqual([
      "assembly_a",
      "assembly_b",
    ]);
    expect(view.assemblies.map((a) => a.name)).toEqual(["Drainage", "Planting"]);
  });

  it("starts every driver at zero rather than its catalog default", async () => {
    const view = await populatingService().create("org_1", "project_1");

    expect(view.assemblies[0]!.driverValues).toEqual({ feet: 0 });
    expect(view.assemblies[1]!.driverValues).toEqual({ trees: 0 });
  });

  it("generates a snapshot that prices to nothing", async () => {
    const view = await populatingService().create("org_1", "project_1");

    // The lines exist — this is a real generated snapshot, not an empty one.
    expect(view.lineItems.length).toBe(2);
    expect(view.lineItems.every((line) => line.quantity === 0)).toBe(true);
    // …and none of them bills its flat delivery, so the estimate opens at zero.
    expect(view.totals.total).toBe(0);
  });
```

`makeAssemblyRepoMock` and `makeMaterialRepoMock` are already imported; add `makeAssembly` and `makeMaterial` to the `@landscape/platform/test-support` imports. The `create` and `findByProject` mocks above are contextually typed by `Partial<EstimateRepository>`, matching how the existing `create` test writes the same override — do not add explicit parameter annotations.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun run --cwd packages/api test EstimateService
```

Expected: all three new tests FAIL. The first two report `[]` for `view.assemblies`; the third reports `0` for `view.lineItems.length` — `create` does not populate anything yet. The two pre-existing `create` tests still PASS.

- [ ] **Step 3: Extract the shared generation path**

In `packages/api/src/services/EstimateService/EstimateServiceImpl.ts`, add a private method below `setAssemblies` holding the generation body verbatim, taking the already-resolved selections and the already-fetched settings:

```ts
  /**
   * Generate and persist an estimate's line-item snapshot from already-resolved
   * assembly selections. Shared by `create` (every active assembly at zero
   * drivers) and `setAssemblies` (the user's chosen set) so both freeze the same
   * way; each caller owns its own validation before getting here.
   */
  private async generateSnapshot(
    orgId: string,
    id: string,
    chosen: SelectedAssembly[],
    settings: PricingSettings,
  ): Promise<EstimateView> {
    // Load every referenced material once, across all chosen assemblies.
    const materialIds = new Set<string>();
    for (const { assembly } of chosen) {
      for (const line of assembly.lines) {
        if (line.kind === "material") {
          materialIds.add(line.materialId);
        }
      }
    }
    const materials = await this.materials.findByIds(orgId, [...materialIds]);
    const materialsById = new Map(
      materials.map((material) => [material.id, material]),
    );

    // Generate each assembly's lines in selection order.
    const lineItems: LineItemInput[] = [];
    const assemblies: EstimateAssembly[] = [];
    for (const { assembly, driverValues } of chosen) {
      const generated = generateAssemblyLines(
        { assembly, driverValues },
        materialsById,
        settings,
      );
      lineItems.push(...generated);
      assemblies.push({
        assemblyId: assembly.id,
        name: assembly.name,
        driverValues,
      });
    }

    const updated = await this.estimates.replaceSnapshot(orgId, id, {
      assemblies,
      lineItems,
      overheadRate: settings.overheadRate,
      profitRate: settings.profitRate,
      taxRate: settings.taxRate,
    });
    return this.requireView(updated);
  }
```

Add `SelectedAssembly` and `PricingSettings` to the existing `import { … } from "@landscape/domain"` (both are exported from it; `SelectedAssembly` is a type-only import).

Then replace everything in `setAssemblies` from the `// Load every referenced material once` comment through its closing `return this.requireView(updated);` with:

```ts
    return this.generateSnapshot(orgId, id, chosen, settings);
```

Leave the rest of `setAssemblies` — the `findById`, the `NOT_FOUND` throw, the draft guard, the `pricingSettings.get`, and the loop building `chosen` with its `BAD_REQUEST` for an unknown assembly — exactly as it is. Change the `chosen` declaration's type annotation from the inferred `const chosen = []` to `const chosen: SelectedAssembly[] = []` so it matches the new parameter type.

This step is a pure refactor: no behavior changes. Its gate is the existing suite, not a new test — do not write one.

- [ ] **Step 4: Verify the refactor changed nothing**

```bash
bun run --cwd packages/api test EstimateService
```

Expected: every pre-existing test still PASSES (six under `setAssemblies`, two under `create`, two under `updateMeta`). The three new tests still FAIL — nothing has taught `create` to populate yet.

- [ ] **Step 5: Commit the refactor on its own**

```bash
git add packages/api/src/services/EstimateService/EstimateServiceImpl.ts
git commit -m "refactor: extract the estimate snapshot generation path"
```

- [ ] **Step 6: Make `create` populate**

Still in `EstimateServiceImpl.ts`, replace the final two lines of `create` — the `const estimate = await this.estimates.create(…)` call's `return computeEstimate(estimate);` — so the method ends like this. The lines above it (project validation, title resolution, `pricingSettings.get`) stay untouched:

```ts
    const estimate = await this.estimates.create(orgId, {
      projectId,
      title: resolvedTitle,
      status: "draft",
      overheadRate: settings.overheadRate,
      profitRate: settings.profitRate,
      taxRate: settings.taxRate,
    });

    // A new estimate arrives holding every assembly, each at zero quantity, so
    // it matches the shape of the source bid workbook: all phases present, fill
    // in the ones the job needs. Removing an unwanted one is a click; having to
    // learn the catalog before the screen means anything is not.
    const all = await this.assemblies.findByOrg(orgId);
    const chosen: SelectedAssembly[] = all
      .filter((assembly) => assembly.active)
      .map((assembly) => ({
        assembly,
        driverValues: Object.fromEntries(
          assembly.drivers.map((driver) => [driver.key, 0]),
        ),
      }));
    if (chosen.length === 0) {
      return computeEstimate(estimate);
    }
    return this.generateSnapshot(orgId, estimate.id, chosen, settings);
```

`findByOrg` already sorts by `sortOrder`, so no sort is needed here — but it does not filter on `active`, so the `.filter` is load-bearing.

- [ ] **Step 7: Run the API suite**

```bash
bun run --cwd packages/api test
```

Expected: PASS, all thirteen `EstimateService` tests included. If `generates a snapshot that prices to nothing` fails with a non-zero total, Task 1 is missing or regressed — check `packages/domain/src/engine/generate.ts` before touching this test.

- [ ] **Step 8: Run the whole suite, lint, and typecheck**

```bash
bun run test && bun run lint && bun run typecheck
```

Expected: all clean. `typecheck` covers `packages/web` too, confirming the untouched web layer still compiles against the unchanged service interface.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/services/EstimateService/EstimateServiceImpl.ts packages/api/src/services/EstimateService/EstimateServiceImpl.test.ts
git commit -m "feat: start new estimates with every active assembly at zero quantity"
```

---

## Manual verification

`packages/web` has no test infrastructure, so the UI side is checked by hand once both tasks are committed.

- [ ] **Step 1: Build the web package**

```bash
bun run --cwd packages/web build
```

Expected: succeeds.

- [ ] **Step 2: Create an estimate in the running app and look at it**

With the local stack running (`bun run dev`, against local MongoDB with a seeded org), open a project and create a new estimate. Confirm:

- Every seeded assembly is present — Drainage, Irrigation, Soil prep, Planting, Concrete, Seating wall — in catalog order.
- Every driver input reads `0`.
- The totals panel reads `$0.00`, including overhead and profit.
- The `+ Add assembly…` picker is **absent** (nothing left to add).
- Removing one assembly makes the picker reappear, offering exactly that assembly.
- Removing all of them shows the "No assemblies yet" empty state.

If the total is not `$0.00`, report the figure rather than adjusting anything — it means a delivery, tax, or markup path still fires at zero quantity, which the spec claims it does not.

---

## Notes for the reviewer

- `packages/platform/src/seed/catalog.test.ts` is deliberately unmodified. Its passing is evidence, not an oversight.
- The `+ Add assembly…` picker draws from `getContext`, which does not filter on `active`, so an inactive assembly stays manually addable while auto-add skips it. That inconsistency is pre-existing and explicitly out of scope — see the spec's "Out of scope" section.
- No migration: only `create` changes, and existing estimates are untouched.
