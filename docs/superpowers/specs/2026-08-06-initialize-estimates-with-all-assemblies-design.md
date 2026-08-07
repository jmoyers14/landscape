# Initialize new estimates with every assembly

**Date:** 2026-08-06
**Status:** Designed, not implemented

## Why

A new estimate today is empty. To get anywhere you first have to understand
that assemblies exist, that they come from a catalog, and that you pick them
from a dropdown before any of the screen means anything.

The source bid workbook has no such step. Every phase is already on the sheet;
you fill in quantities and the phases you left at zero cost nothing. That is
the mental model the landscaper who wrote it already has, and it is also just
the common case — nearly every job includes nearly every assembly.

So: a new estimate arrives with every assembly already in it, each at zero
quantity. Removing one is a click. Understanding a catalog is not a
prerequisite for reading the screen.

See `docs/superpowers/specs/2026-08-05-material-labor-split-design.md` for the
same motivation applied to the editor's columns.

## What a new estimate looks like

```
Drainage        Drainage length     [   0 ] ft.        $0.00
Irrigation      Control valves      [   0 ] unit(s)    $0.00
Soil prep       Soil prep area      [   0 ] sq. ft.    $0.00
Planting        1-gallon trees      [   0 ] unit(s)    $0.00
                5-gallon trees      [   0 ] unit(s)
                …
Concrete        Slab area           [   0 ] sq. ft.    $0.00
Seating wall    Wall height         [   0 ] ft.        $0.00
                Wall length         [   0 ] ft.

                                    Total              $0.00
```

Zero quantities rather than the catalog's `defaultValue`s. The seeded defaults
are the workbook's own example figures — 225 ft of drainage, 5 control valves,
3,000 sq ft of soil prep — so defaults would open every new estimate as a
priced copy of someone else's job, and a user who saved without editing would
have a plausible-looking estimate they never wrote.

## Decisions

| Question | Decision |
|---|---|
| Where does the population happen? | `EstimateService.create`. Not the web layer. |
| Which assemblies? | Every `active` assembly, in `sortOrder`. |
| Starting driver values? | `0` for every driver. |
| Does `create` generate line items? | Yes — the same generation path `setAssemblies` uses. |
| Zero-quantity lines that carry a flat delivery? | Fixed in the engine: zero quantity, zero delivery. |
| Existing estimates? | Untouched. No migration. |

## Design

### 1. `EstimateService.create` populates the estimate

`create` loads the org's assemblies, keeps the `active` ones in `sortOrder`,
builds one selection per assembly with every driver at `0`, and generates the
snapshot.

The generation body of `setAssemblies` — load each assembly, resolve driver
values, collect the referenced materials, run `generateAssemblyLines` per
assembly, persist via `replaceSnapshot` — moves into a private method that both
`create` and `setAssemblies` call. `setAssemblies` keeps its draft-status guard
and its "assembly does not exist" error; neither applies to `create`, which
builds its selections from assemblies it has already loaded.

The repository boundary does not change. `create` makes the shell and
`replaceSnapshot` fills it, which is exactly the split `NewEstimate`'s own
comment describes ("the generated parts the repository initializes empty").
Two writes on a rare operation is the right price for not perforating that
boundary.

**Why the server and not the draft editor.** The alternative is seeding
`DraftEditor`'s local state whenever the saved selection is empty. It fails on
its own terms: an empty saved list cannot distinguish a brand-new estimate from
one where the user removed every assembly and saved, so the editor would
resurrect what the user just deleted. And the population would exist only in
that one component — the estimate list's total, the API, and any future PDF
would all still see an empty estimate. Server-side, the estimate genuinely *is*
populated from the moment it exists.

**`active` filtering.** `AssemblyRepository.findByOrg` returns every assembly
regardless of `active`, so the service filters. This leaves a pre-existing
inconsistency visible: the editor's "+ Add assembly…" picker draws from
`getContext`, which also does not filter, so an inactive assembly stays
manually addable while auto-add skips it. Flagged, not fixed — the picker's
behavior is its own question and changing it is not what this change is for.

### 2. Zero quantity bills no delivery

Six seeded material lines carry `deliveriesFormula: "1"` — a flat delivery
independent of quantity (Concrete's fill sand and pump, Seating Wall's block,
Planting's 1-gallon trees and mulch). At zero drivers those still bill: $150
fill-sand delivery, $250 pump, $150 block, plus Planting's, all marked up by
overhead and profit. A "$0.00" new estimate would open somewhere north of
$1,000 for zero work.

In `packages/domain/src/engine/generate.ts`:

```ts
const deliveries =
  quantity === 0 || !line.deliveriesFormula
    ? 0
    : evaluate(line.deliveriesFormula, scope);
```

This is a real defect the feature exposed rather than a special case for it. It
fires whenever a driver is zeroed, not only at creation, and it generalizes to
assemblies authored in-app later — neither of which is true of guarding the six
seed formulas individually. Nobody pays a delivery charge for zero mulch.

It changes pricing, so it is stated here rather than folded in silently.

**It changes no pinned figure.** At the seeded default drivers, no line
carrying a delivery formula resolves to zero quantity: `mulchYds` is 6,
`treeOneGal` 80, `slabArea` 1,000, `wallLength` 25. The one driver that does
default to zero — `lawnSqFt` — feeds only lines whose `deliveriesFormula` is
null. `catalog.test.ts`'s Irrigation cells and every other default-driver
expectation are unaffected.

### 3. The web layer does not change

Both behaviors that matter are already correct:

- The picker renders only when `addable.length > 0`. With everything selected
  it disappears; remove an assembly and it returns, offering exactly that one.
- The "No assemblies yet" empty state is now reachable only by removing
  everything — which is what it describes.

## Testing

**`packages/domain/src/engine/generate.test.ts`** — a material line with
`deliveriesFormula: "1"` whose `quantityFormula` resolves to zero produces
`deliveryCost: 0`; the same line at non-zero quantity still bills its delivery.
The fix's real gate, over a pure function.

**`packages/api/src/services/EstimateService/EstimateServiceImpl.test.ts`** —
`create` returns an estimate whose `assemblies` are every active assembly in
`sortOrder`, each driver at `0`; an inactive assembly is absent; `lineItems` is
a generated snapshot rather than empty; and `totals.total` is `0`. That last
assertion is what ties the two halves together — it fails if either the
auto-add or the delivery fix regresses.

**`packages/platform/src/seed/catalog.test.ts`** — unchanged, deliberately. It
is the regression lock proving the engine fix left the workbook tie-out alone.

**`packages/web`** — nothing automated. The package has no test infrastructure
and standing it up is out of scope. Verified with `bun run typecheck`,
`bun run lint`, `bun run --cwd packages/web build`, and a live look at a
newly created estimate.

## Out of scope

- Existing estimates. Only `create` changes; there is no migration.
- The picker's inactive-assembly inconsistency.
- Any change to what `active` means or to how assemblies are deactivated.
- Reordering, collapsing, or hiding zero-quantity assemblies in the editor. A
  screen with every assembly on it is longer than one with three; whether that
  needs an affordance is a real question, and a separate one.
