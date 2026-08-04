# Open Questions

Decisions that need a human answer, with enough context to actually answer them.
Distinct from [`go-live-todo.md`](./go-live-todo.md), which describes *scope*;
this file tracks *unresolved questions* that scope depends on.

When one is resolved, record the answer inline and move it to the Resolved
section at the bottom rather than deleting it — the reasoning is usually worth
more later than the decision itself.

---

## 1. Should a sent estimate's totals be frozen?

**Status:** open. Surfaced 2026-08-04 while designing per-assembly O&P.

**The question.** If we change a pricing formula, should estimates that were
already sent to customers keep the numbers they were sent with?

**Why it comes up now.** The app stores an estimate's *inputs* — line items, and
the rates snapshotted at generation (`overheadRate`, `profitRate`, `taxRate`) —
but never its *dollar totals*. `computeEstimate` recomputes them from those
inputs on every read (`packages/domain/src/engine/calc.ts`). `Estimate` says so
explicitly: "monetary totals are NOT stored here — they're derived by the
engine."

So the snapshot freezes the inputs but not the formula, and the formula is code.
Any change to `priceLines` retroactively reprices every estimate ever created,
including ones marked `sent`.

This is not hypothetical. The per-assembly O&P work changes overhead's base from
direct cost to materials, which moves the sheet's Irrigation phase from
$6,462.96 to $4,601.56 — a 29% drop on an untouched document.

**What we know.**

- Derived-not-stored is a deliberate, documented choice, and it's the reason the
  engine stays a "one-function edit."
- The rate snapshot already exists, so the intent to freeze *something* per
  estimate is established — it just stops short of the output.
- Freezing totals raises its own questions: what happens if a sent estimate is
  moved back to draft? Does it still render live line items next to frozen
  totals? Which is authoritative if they disagree?

**Options.**

1. **Accept it.** Formula changes reprice history. Fine while the only estimates
   are test data. Costs nothing now.
2. **Freeze totals on send.** Persist computed totals when status becomes
   `sent`. Correct for a product where people hand numbers to customers, but
   it's a feature with its own data model, not a rider on a calc change.

**What unblocks it:** knowing whether any real estimate has been sent to a real
customer yet. If not, option 1 and revisit before launch.

**Blocks:** nothing today. Becomes urgent the moment the product has real users —
worth deciding before go-live either way.

---

## 2. Does labor carry overhead?

**Status:** open — for the *source spreadsheet's author*, not for us.

**The question.** The bid spreadsheet contradicts itself on whether labor gets an
overhead markup.

| | Package tab | Contract Price Breakdown tab |
|---|---|---|
| Labor rate | $35.00/hr | $19.20/hr |
| Overhead on labor | none — the cell is empty in all 6 phases | yes, `/0.6` |
| Effective | `35 × 1.15` = **$40.25/hr** | `19.20/0.6 × 1.15` = **$36.80/hr** |

Both tabs live in the same workbook and describe the same job, but they'd bill it
differently.

**What we decided anyway.** The app follows the **Package tab** — overhead on
materials only — because that's the tab the estimate screen reproduces. That
decision is not blocked on this question.

**Why it still matters.** If the Package tab is the accident and the Contract
Price Breakdown is how the business actually prices labor, then the app is
faithfully reproducing the wrong one. Worth asking the sheet's author directly:
*when you bill a job, does your hourly rate already include overhead?*

**Blocks:** nothing. Feeds "Quality-check the formulas."

---

## Resolved

### Irrigation: are three material lines excluded on purpose?

**Resolved 2026-08-04 — no, it's a sheet bug, and the seed already fixes it.**

`M56 = SUM(M35:M51)` stops at row 51, dropping Shrub Bodies ($142.77), Funny
Pipe ($26.94) and Funny Elbows ($28.55) — $198.26 of material — from the
Irrigation subtotal.

This was already investigated during the Phase D transcription and decided
against. `packages/platform/src/seed/irrigation.ts` says so outright: *"the
sheet's section total SUM(M35:M51) is itself buggy — it drops the last three
material rows; our total correctly includes them."* `catalog.test.ts` anchors
Irrigation's expected `materialCost` at **1142.31378** — the corrected sum, not
the sheet's 944.05.

No modelling needed: the catalog has no concept of an excluded line, and doesn't
need one.

### Concrete: does the labor subtotal skip a line?

**Resolved 2026-08-04 — no. This was my misreading; the sheet is correct.**

Initial reading: `P127 = SUM(P100:P125)` appeared to drop "Lay out and install
forms" at row 99 ($2,219.74), looking like an off-by-one.

It isn't. Row 99 is a **task header whose P cell is a rollup** —
`P99 = P100+P101+P102` — summing the three labor lines beneath it. `P127`
correctly sums the leaf rows and skips the rollup. Including row 99 would
double-count $2,219.74.

Worth noting the structural inconsistency for anyone reading the sheet later:
in Irrigation the task header row *is* a labor line (`P34 = N34*O34`), while in
Concrete the task header is a subtotal of sub-lines. Same visual position,
different meaning.

**Lesson:** an unexpected SUM range in this workbook is more likely a rollup row
than a bug. Check what the skipped cell actually contains before concluding.
