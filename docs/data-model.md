# Estimating Data Model

How the "Bid system" spreadsheet (`docs/Bid system4 - Del whole Rev 2-22.xlsm`)
maps onto the application's data model.

## The core idea

The spreadsheet is not a static estimate — it's a **generative pricing engine**.
You enter a handful of **driver quantities** (225 ft of drainage, 5 irrigation
zones, 3000 sq ft of soil) and formulas cascade into every material quantity and
labor hour, then a fixed cost buildup produces the price.

We model that in three layers:

1. **Catalog** — reusable, org-owned reference data: materials, assemblies
   (recipes), and pricing settings. This is the "secret sauce."
2. **Estimate** — a per-project calculation: chosen assemblies + driver values,
   plus a **snapshot** of the generated line items and totals.
3. **Job tracking** (later) — bid-vs-actual labor, historical rate calibration.

This document covers layers 1 and 2.

## Design decision: formulas are data (Option C)

Every quantity and labor-hour formula is stored as a **text expression** and
evaluated server-side by a sandboxed math evaluator. Nothing is hardcoded; a
formula change is a data edit, never a deploy. Examples straight from the sheet:

| What | Spreadsheet | Stored formula |
| --- | --- | --- |
| Drainage labor hours | `=0.095*E9` | `0.095 * drainageFt` |
| Catch basins | `=ROUND(E9/85,0)` | `round(drainageFt / 85)` |
| Drain pipe (round up) | `=ROUNDUP(E9/10,0)` | `roundUp(drainageFt / 10)` |
| Curb cores (conditional) | `=IF(E9<175,1,2)` | `drainageFt < 175 ? 1 : 2` |
| Pop-up bodies (chained) | `=ROUND(E40*2/3,0)` where `E40=E34*16` | `round(sprayHeads * 2/3)` |

### Evaluator

Use [`expr-eval`](https://www.npmjs.com/package/expr-eval) — dependency-free,
no access to JS globals (so a user-authored formula can't reach the filesystem
or process), and supports comparisons + ternaries out of the box. We register a
small function set so formulas read like the spreadsheet's:

```
round(x)      roundUp(x)    roundDown(x)
even(x)       min(a,b)      max(a,b)      abs(x)
```

(`roundUp`/`roundDown` = `ceil`/`floor`; `even` mirrors Excel's `EVEN()`.)

### Variables in scope

When evaluating an assembly's formulas, the variable bag is:

- the assembly's **drivers** (e.g. `drainageFt`, `valveZones`), and
- the **resolved quantity of any earlier line**, referenced by its `key`.

Line keys are what let chained formulas stay readable instead of collapsing into
one giant expression (the spreadsheet does this constantly — `E43` depends on
`E40` depends on `E34`). Lines are resolved in **dependency order**
(topological sort); a cycle is a validation error.

## Layer 1 — Catalog

### Material (`materials` collection)

One catalog item. Org-scoped so each business keeps its own prices.

```ts
interface Material {
  id: string;
  orgId: string;
  name: string;          // "Single outlet catch basin"
  category: string;      // "Drainage", "Irrigation", ... (for grouping/search)
  unit: string;          // "unit(s)", "ft.", "yds.", "bag(s)"
  unitPrice: number;     // 6.853
  deliveryCost: number;  // per-delivery cost, default 0 (e.g. $150 for mulch)
  taxable: boolean;      // materials true; pass-through items can be false
  active: boolean;
  createdAt: string;
}
```

### Assembly (`assemblies` collection)

A reusable recipe for one section of work (Drainage, Irrigation, Soil Prep,
Planting, Concrete, Seating Wall). It owns its drivers and an ordered list of
embedded **lines**. Lines are embedded because they're always loaded, saved, and
versioned with the assembly — never queried on their own.

```ts
interface AssemblyDriver {
  key: string;           // "drainageFt"  (used in formulas)
  label: string;         // "Drainage length"
  unit: string;          // "ft."
  defaultValue: number;  // seeds a new estimate
}

// AssemblyLine is a discriminated union on `kind`, so narrowing gives a
// material line its non-null materialId or a labor line its laborRateKey, with
// no cross-kind fields to null-check.
interface AssemblyLineBase {
  key: string;           // "catchBasin" (unique within the assembly)
  description: string;   // shown on the estimate line
  quantityFormula: string; // "round(drainageFt / 85)" — units, or hours for labor
  sortOrder: number;
}

interface MaterialAssemblyLine extends AssemblyLineBase {
  kind: "material";
  materialId: string;               // -> Material catalog
  deliveriesFormula: string | null; // null => 0 deliveries
}

interface LaborAssemblyLine extends AssemblyLineBase {
  kind: "labor";
  laborRateKey: string;  // "general" | "skilled" -> PricingSettings
}

type AssemblyLine = MaterialAssemblyLine | LaborAssemblyLine;

interface Assembly {
  id: string;
  orgId: string;
  name: string;          // "Drainage"
  category: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  drivers: AssemblyDriver[];
  lines: AssemblyLine[];
  createdAt: string;
}
```

A labor line carries the production rate inside its formula
(`0.095 * drainageFt` = hours) and points at a named labor rate. A material line
points at a catalog item for its unit price + unit of measure, and its formula
yields a quantity.

### PricingSettings (`pricingsettings`, one per org)

The global knobs the cost buildup uses. One document per org.

```ts
interface LaborRate {
  key: string;    // "general"
  label: string;  // "General labor"
  rate: number;   // 35
}

interface PricingSettings {
  orgId: string;          // unique
  taxRate: number;        // 7.75  (% on taxable material lines)
  overheadRate: number;   // 40 — margin basis; see "Cost buildup" below
  profitRate: number;     // 15
  laborRates: LaborRate[];// [{general,35}, {skilled,55}]
}
```

## Layer 2 — Estimate

The estimate keeps the **inputs** (which assemblies, what driver values) *and* a
**snapshot** of the generated result. The snapshot is the important part:

- Editing the catalog later must **not** silently change a sent estimate.
- The frozen line items also carry the unit prices and rates used, so the
  estimate is reproducible and auditable.

When drivers change on a draft, the service regenerates the snapshot. Once an
estimate is `sent`/`accepted`, the snapshot is the contract.

### Auditability — why the formula is frozen too

The snapshot freezes both the **outputs** (resolved `quantity` + `unitPrice`)
*and* the **formula text** used to produce them (`LineItem.quantityFormula`),
alongside the estimate's `driverValues`. Freezing outputs alone keeps the
estimate's money stable when the catalog changes — but it can't explain *how* a
number was derived once the global formula has since been edited. Storing the
formula-as-used closes that gap: any old line can show its work end to end —
`drainageFt = 225 → round(225 / 85) = 3 → × $6.85 = $20.56` — with no dependency
on the live catalog.

The heavier alternative — an immutable, **versioned catalog** that estimates
point at by revision — gives the same explainability plus diffable history and
zero duplication, but at real cost (revisioning, retaining every version). It's
deferred until catalog editing is frequent enough to justify it; the per-line
formula snapshot serves the same user need for now.

```ts
interface EstimateAssembly {
  assemblyId: string;
  name: string;                       // denormalized for display
  driverValues: Record<string, number>; // { drainageFt: 225 }
}

// A generated line. Superset of today's LineItem so the existing calc/UI keep
// working; the extra fields are provenance + faithful tax handling.
interface LineItem {
  id: string;
  phase: string | null;   // assembly name -> existing phase rollup
  type: "material" | "labor" | "equipment" | "other";
  description: string;
  quantity: number;       // resolved units, or hours for labor
  unit: string | null;
  unitPrice: number;      // snapshotted material price, or hourly rate
  taxable: boolean;       // material lines only
  deliveryCost: number;   // resolved delivery for the line, default 0
  quantityFormula: string;          // the formula AS USED, frozen for "show your work"
  sourceAssemblyId: string | null;  // provenance
  sourceLineKey: string | null;
}

interface Estimate {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  status: "draft" | "sent" | "accepted";

  // rate snapshot (copied from PricingSettings at generation time):
  taxRate: number;
  overheadRate: number;
  profitRate: number;

  assemblies: EstimateAssembly[]; // the inputs
  lineItems: LineItem[];          // the generated snapshot
  createdAt: string;
}
```

## Cost buildup (the calc engine)

Faithful to the spreadsheet. Lives in `engine/calc.ts` as a pure
function, like the current one.

```
for each line:
  lineCost = quantity * unitPrice
  if material:
    lineCost += deliveryCost
    if taxable: lineCost += (quantity * unitPrice) * taxRate/100

directCost = sum(lineCost)
overhead   = directCost * (1 / (1 - overheadRate/100) - 1)
profit     = (directCost + overhead) * profitRate/100
total      = directCost + overhead + profit
```

The engine reproduces the spreadsheet exactly (the current placeholder engine is
being replaced, not preserved). Two things to note:

1. **Overhead is margin-basis.** The sheet computes overhead as `cost / 0.6 −
   cost` — it marks cost up so cost becomes 60% of the cost+overhead subtotal.
   Generalized, `overhead = cost × (1 / (1 − rate) − 1)`. With `overheadRate =
   40` this is exactly `cost / 0.6 − cost`, so the stored rate stays a clean 40.
2. **Tax is per material line.** The sheet taxes each **material** line *before*
   overhead/profit and never taxes labor. That's why `taxable` lives on the
   line, not as a single estimate-level tax added at the end.

## What is intentionally deferred

- **Bid-vs-actual labor** (`BID AND ACTUAL HRS.` sheet) — job-tracking layer.
- **Production-rate calibration** (`Averages` / `Sheet1` / `Sheet2`) — the
  closed loop that recomputes hours-per-unit from historical jobs. For now,
  production rates live as constants inside labor-line formulas.
- **Customer-facing add-ons & proposal formatting** (`Bid Sheet`,
  `Contract Price Breakdown`) — a presentation concern on top of the estimate.
- **General Conditions** (`=SUM(...)*0.06`) — a whole-estimate rollup line;
  modeled later as a special computed line or an estimate-level surcharge.
- **Concrete assembly & flat-fee lines** — the Concrete section has line items
  that are neither hourly labor nor taxable materials (e.g. "Finishers" at a flat
  `$350 × 8`, the concrete pump's setup fee). `AssemblyLine` is only
  `material | labor` today, so Concrete is deferred until we add a flat-cost
  ("equipment"/"other") line kind. The other five Package-sheet assemblies are
  seeded.

## Seeding

The spreadsheet's catalog (materials, the six assemblies with their formulas,
default rates) becomes the **starter dataset** seeded for a new org. That's the
migration: parse the workbook once into `Material` + `Assembly` documents.
