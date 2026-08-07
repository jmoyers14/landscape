# Initialize new estimates with every assembly

**Date:** 2026-08-06
**Status:** Implemented

## Why

A new estimate today is empty. To get anywhere you first have to understand
that assemblies exist, that they come from a catalog, and that you pick them
from a dropdown before any of the screen means anything.

The source bid workbook has no such step. Every phase is already on the sheet,
carrying the example quantities its author typed in; you adjust them for the
job in front of you. That is the mental model the landscaper who wrote it
already has, and it is also just the common case — nearly every job includes
nearly every assembly.

So: a new estimate arrives with every assembly already in it, each at its
catalog default. Removing one is a click. Understanding a catalog is not a
prerequisite for reading the screen.

See `docs/superpowers/specs/2026-08-05-material-labor-split-design.md` for the
same motivation applied to the editor's columns.

## What a new estimate looks like

```
Drainage        Drainage length     [ 225 ] ft.        $2,231.72
Irrigation      Control valves      [   5 ] unit(s)    $4,981.56
Soil prep       Soil prep area      [3000 ] sq. ft.    $2,582.03
Planting        1-gallon trees      [  80 ] unit(s)   $11,105.85
                5-gallon trees      [  50 ] unit(s)
                …
Concrete        Slab area           [1000 ] sq. ft.  $15,929.25
Seating wall    Wall height         [   2 ] ft.        $3,340.69
                Wall length         [  25 ] ft.

                                    Total            $40,171.09
```

Each driver at its catalog `defaultValue` — the same values that adding an
assembly by hand has always produced. Those defaults are the workbook's own
example figures (225 ft of drainage, 5 control valves, 3,000 sq ft of soil
prep), so a new estimate opens as a priced copy of the sheet the partner
wrote. For reviewing the app against the workbook that is a feature; for a
real bid it means the first thing a user does is adjust numbers rather than
type them from nothing.

The cost is real and accepted: a user who saves without editing has a
plausible-looking estimate they never wrote. The alternative — starting at
zero — was tried first and abandoned, because zero does not mean what it
appears to mean. See the correction below.

## Decisions

| Question | Decision |
|---|---|
| Where does the population happen? | `EstimateService.create`. Not the web layer. |
| Which assemblies? | Every `active` assembly, in `sortOrder`. |
| Starting driver values? | Each driver's catalog `defaultValue`. (Originally `0` — see the correction below.) |
| Does `create` generate line items? | Yes — the same generation path `setAssemblies` uses. |
| Zero-quantity lines that carry a flat delivery? | Fixed in the engine: zero quantity, zero delivery. |
| Existing estimates? | Untouched. No migration. |

> ### Correction (2026-08-06, after review)
>
> **This spec originally claimed that zero drivers produce a $0.00 estimate
> once flat deliveries are fixed. That is false**, and the error was caught by
> the final review rather than by anything written here.
>
> The delivery formulas were checked; the *quantity* formulas were not. The
> workbook is full of quantities that do not depend on any driver — Planting's
> `treeStakes` is the literal `12` (and `cinchTies` is `treeStakes * 4` = 48),
> Drainage's `curbCore` is `drainageFt < 175 ? 1 : 2` = 1, Irrigation's
> `funnyPipe` is `1`, Seating Wall's column blocks are literal `2` and `6`, and
> Concrete's yardage carries the sheet's short-load allowance,
> `(slabArea × 4/12) / 27 + 0.5` = 0.5. Seating Wall's `dobies`,
> `even(wallLength - 1)`, goes **negative** at −2.
>
> Generated at zero drivers, the seeded catalog prices to **$1,230.41** — worse
> than the empty estimate it replaced. That figure includes the $250 concrete
> pump delivery this spec claimed to have fixed: the pump's quantity is 0.5,
> not 0, so the zero-quantity delivery rule never applies to it.
>
> **The resolution:** drop zero as the starting point. Each assembly starts at
> its catalog `defaultValue` — the same values adding an assembly by hand has
> always produced — and `create` generates the snapshot from those. A new
> estimate opens **priced, at $40,171.09** for the seeded catalog, rather than
> at a $0.00 that was never achievable.
>
> That reverses this spec's original "zero for every driver" decision. The
> reasoning for zero was that a user might send an estimate full of numbers
> they never looked at; the reasoning against it is that zero does not mean
> what it appears to mean. Zeroing an assembly's drivers does not zero its
> cost — Seating Wall at zero length still bills $81.78 of constant-quantity
> column block, and a negative dobie. **Making a zeroed assembly cost nothing
> is its own piece of work, deliberately deferred.**
>
> `packages/platform/src/seed/zeroDrivers.test.ts` pins the zero-driver
> behavior per assembly, naming the responsible formula in each case. It is the
> evidence that deferred work starts from. It is also the companion to
> `catalog.test.ts`: that file pins the workbook at its *default* drivers, this
> one at *zero*.

## Design

### 1. `EstimateService.create` populates the estimate

`create` loads the org's assemblies, keeps the `active` ones in `sortOrder`,
resolves each one's drivers to their catalog defaults via `resolveDriverValues`,
and generates the snapshot.

The generation body — collect the referenced materials, run
`generateAssemblyLines` per assembly, persist via `replaceSnapshot` — lives in a
private `generateSnapshot` that both `create` and `setAssemblies` call.
`setAssemblies` keeps its draft-status guard and its "assembly does not exist"
error; neither applies to `create`, which builds its selections from assemblies
it has already loaded.

The repository boundary does not change. `create` makes the shell and
`replaceSnapshot` fills it, which is exactly the split `NewEstimate`'s own
comment describes ("the generated parts the repository initializes empty").
Two writes on a rare operation is the right price for not perforating that
boundary.

**Generation can throw, and the shell is already persisted.**
`generateAssemblyLines` raises `FormulaError` on a non-finite result, and a
driver in a denominator is an explicitly supported authoring pattern that goes
non-finite when that driver defaults to zero. Left alone, one bad formula in one
assembly would leak an orphan draft, surface as a 500 rather than a 400, and
block estimate creation for the entire org. So `create` catches `FormulaError`
and degrades to the bare shell: the user still gets a usable draft, adds
assemblies by hand, and `setAssemblies` names the broken one. This mirrors
`previewEstimate`, which already skips rather than throws.

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
Planting's 1-gallon trees and mulch). A line for zero units should not bill a
delivery: nobody pays $150 to have zero blocks delivered.

This is **not** load-bearing for the feature above — `create` no longer
generates lines at all, so no delivery fires at creation regardless. It is kept
because it is correct on its own merits, and it applies whenever a user zeroes
a driver and saves. Of the charges this spec originally claimed it removed, it
actually removes the $150 fill-sand and $150 block deliveries; the $250 pump
survives, because the pump's quantity is 0.5 rather than 0. See the correction
above.

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
`sortOrder`, each driver at `0`, with an inactive assembly absent and
`lineItems` empty. The `lineItems` assertion is the gate; the accompanying
`totals.total === 0` is true by construction once the snapshot is empty and is
kept as documentation of intent, not as a check that can fail.

**`packages/platform/src/seed/zeroDrivers.test.ts`** — the real regression lock
on this feature's premise. It walks every seeded assembly at zero drivers,
asserts Soil Preparation is the only one that costs nothing, and names the
driver-independent formula responsible in each of the other five. If anyone
reintroduces generation at creation, this file is where they find out why not.

**`packages/platform/src/seed/catalog.test.ts`** — unchanged, deliberately. It
is the regression lock proving the engine fix left the workbook tie-out alone.

**`packages/web`** — nothing automated. The package has no test infrastructure
and standing it up is out of scope. Verified with `bun run typecheck`,
`bun run lint`, and `bun run --cwd packages/web build`. The live check of a
newly created estimate is a manual step and has not been run.

## Out of scope

- Existing estimates. Only `create` changes; there is no migration.
- The picker's inactive-assembly inconsistency.
- Any change to what `active` means or to how assemblies are deactivated.
- Reordering, collapsing, or hiding zero-quantity assemblies in the editor. A
  screen with every assembly on it is longer than one with three; whether that
  needs an affordance is a real question, and a separate one.
