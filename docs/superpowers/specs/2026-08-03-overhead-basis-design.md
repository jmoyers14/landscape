# Selectable Overhead Basis — Design

**Status:** designed, not scheduled. Deferred as low priority on 2026-08-03.
**One open question** blocks implementation — see [Open Questions](#open-questions).

## Problem

Overhead is hard-coded to **margin basis** (`cost / (1 − rate) − cost`). Some
contractors think in **markup basis** (`cost × rate`) instead. Today they'd have
to back-solve a rate to get the number they want: to add a true 40% markup they'd
have to enter an overhead rate of 28.57%. We want the basis itself to be a
choice.

See [`docs/overhead.md`](../../overhead.md) for the plain-English explanation of
the two bases; this doc assumes it.

## Decisions

| Question | Decision |
|---|---|
| Which rates get a basis? | **Overhead only.** Profit stays a markup on cost + overhead. |
| Where does the choice live? | **Org default + per-estimate override.** |
| How does an override survive regeneration? | **Intent + resolved** — two fields (below). |
| Existing data | Defaults to `"margin"` everywhere. No behavior change on upgrade. |

### Why overhead only

Leaving profit as-is yields two coherent configurations rather than four
confusing ones:

- `margin` overhead + markup profit — today's behavior, unchanged.
- `markup` overhead + markup profit — what a markup-thinker expects, end to end.

A `profitBasis` field remains a purely additive follow-up if it's ever wanted.
Deliberately not doing it now.

### Why "intent + resolved"

`EstimateServiceImpl.setAssemblies` re-snapshots rates from org settings on
**every** regeneration. A single basis field would either be clobbered by that
re-snapshot (silently discarding the user's override) or have to opt out of it
(making the basis behave differently from `overheadRate`, which does re-snapshot
— an asymmetry that reads as a bug).

Splitting the two concepts avoids both:

- `overheadBasisOverride: Basis | null` — **user intent.** Survives regeneration
  untouched. `null` means "follow the org default."
- `overheadBasis: Basis` — **resolved snapshot.** What the calc engine reads.
  Recomputed on each snapshot as `override ?? settings.overheadBasis`.

Sent estimates stay frozen (they hold a concrete resolved value); drafts with no
override still track org-settings changes on regeneration, exactly like the rates
do.

```ts
// on regeneration
const basis = estimate.overheadBasisOverride ?? settings.overheadBasis;

replaceSnapshot({
  overheadRate: settings.overheadRate,
  overheadBasis: basis,   // resolved
  // overheadBasisOverride untouched
});
```

## Data model

New shared type in `packages/domain/src/types/pricing.ts`:

```ts
export type OverheadBasis = "margin" | "markup";
```

| Type | Field | Notes |
|---|---|---|
| `PricingSettings` | `overheadBasis: OverheadBasis` | Org default. Defaults to `"margin"`. |
| `Estimate` | `overheadBasis: OverheadBasis` | Resolved snapshot; re-snapshots with the rates. |
| `Estimate` | `overheadBasisOverride: OverheadBasis \| null` | User intent; survives regeneration. |
| `CostRates` | `overheadBasis: OverheadBasis` | So `priceLines` can branch. |

Mongoose schemas get matching fields with `default: "margin"` (settings, resolved)
and `default: null` (override), so existing documents read back as margin-basis
without a migration script.

## Calc engine

The only formula change, in `priceLines` (`packages/domain/src/engine/calc.ts:88`):

```ts
const overhead =
  rates.overheadBasis === "markup"
    ? directCost * (rates.overheadRate / 100)
    : directCost * (1 / (1 - rates.overheadRate / 100) - 1);
```

Profit and total are untouched. This stays the single source of truth shared by
the server and the generative preview engine.

### Validation changes with basis

`PricingSettingsServiceImpl` currently rejects `overheadRate >= 100` because the
margin formula divides by `(1 − rate)` — at 100 it's a divide-by-zero and above
it goes negative. **That bound is margin-specific.** A 150% markup is perfectly
legal. So validation becomes basis-dependent:

- `margin` — `0 <= rate < 100` (unchanged)
- `markup` — `0 <= rate` (no upper bound)

This also means **switching an existing org from markup to margin can invalidate
a stored rate.** Decide at implementation time whether to reject the basis change
or clamp; rejecting with a clear message is probably right.

## Blast radius

Grepped from `overheadRate`. Roughly 17 files, all mechanical except the two
marked.

**domain**
- `types/pricing.ts` — `OverheadBasis`, field on `PricingSettings`
- `types/estimate.ts` — two fields on `Estimate`
- `engine/calc.ts` — **the formula branch**, `CostRates`, `EstimateView` passthrough
- `engine/preview.ts:98` — pass basis through
- `test-support/fixture.ts` — 2 sites

**platform**
- `data-access/models/PricingSettings.ts`, `data-access/models/Estimate.ts` — schema fields
- `data-access/repositories/EstimateRepository/{types.ts,EstimateRepositoryImpl.ts}` — 2 mapping sites (`:69` snapshot, `:120` doc→entity)
- `data-access/repositories/PricingSettingsRepository/PricingSettingsRepositoryImpl.ts:35`
- `seed/pricing.ts`, `test-support/factories.ts` (2 sites)

**api**
- `routers/pricingSettings.ts` — zod enum
- `services/PricingSettingsService/PricingSettingsServiceImpl.ts` — default + **basis-dependent validation**
- `services/EstimateService/EstimateServiceImpl.ts:110,197` — resolve `override ?? default`
- `services/EstimateService/EstimateService.ts` — widen `UpdateEstimateMetaInput` to carry the override

**web**
- `screens/EstimateEditorScreen.tsx:676` — label + control (see open question)

**docs** — `overhead.md` and `data-model.md` both assert overhead is always
margin-basis. Both need updating.

## UI label

`docs/overhead.md` already flags that `Overhead (40%)` next to a number that's
66.7% of direct cost reads as a bug. With a basis toggle the label can finally
disambiguate itself:

- margin → `Overhead (40% of price)`
- markup → `Overhead (40% of cost)`

Worth doing as part of this work regardless of which UI scope is chosen.

## Testing

- `priceLines` table test: both bases × a representative rate, asserting the
  worked numbers from `docs/overhead.md` ($100 cost @ 40% → $66.67 margin,
  $40.00 markup).
- Override resolution: regeneration with an override set keeps it; without one,
  picks up the changed org default.
- Freeze: a sent estimate's totals don't move when org settings change.
- Validation: `markup` accepts a rate ≥ 100; `margin` still rejects it.
- Back-compat: an estimate document with neither new field prices as margin.

## Open Questions

**How much UI ships in the first pass?** Unresolved — this is the one thing to
settle before implementing.

There is no pricing-settings screen today: `pricingSettingsRouter` exists but
nothing in `packages/web` calls it. The estimate editor does exist and already
renders the overhead row.

- *Estimate override only* — build the control in the editor; org default stays
  API-only at `"margin"`. Smallest thing that lets a user actually choose.
- *Settings screen too* — makes the org default editable in-app, but means
  designing a full settings form (tax rate, profit rate, labor rates table) that
  has nothing to do with the basis question.
- *Backend only* — fully testable, but nobody can choose anything yet.

## Not doing

- `profitBasis` — additive later if wanted.
- A single combined basis governing overhead and profit together.
- Combined "O&P margin" (`cost / (1 − (O+P)/100)`) — that's a different pricing
  model, not a basis toggle.
- A data migration — schema defaults cover existing documents.
