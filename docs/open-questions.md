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

## 3. Irrigation: are three material lines excluded on purpose?

**Status:** open. Needs the sheet author.

`M56 = SUM(M35:M51)` — the Irrigation material subtotal stops at row 51, leaving
out rows 52-54:

| Row | Item | Amount |
|---|---|---|
| 52 | Shrub Bodies | $142.77 |
| 53 | Funny Pipe | $26.94 |
| 54 | Funny Elbows | $28.55 |
| | **Excluded total** | **$198.26** |

These are the red-formatted rows, which suggests the exclusion is deliberate —
optional items, or a drip-conversion variant priced separately. But red
formatting is not a specification.

**Why it matters.** Our catalog has no notion of a line that appears on an
estimate but is excluded from its subtotal. If the exclusion is intentional we
need to model it (an `includedInSubtotal` flag, or a separate optional-items
concept). If it's an oversight, we simply don't reproduce it.

**Blocks:** "Quality-check the formulas," and any attempt to tie the seeded
Irrigation assembly to the sheet to the cent.

---

## 4. Concrete: labor subtotal skips a line — bug?

**Status:** open, but almost certainly a spreadsheet bug.

`P127 = SUM(P100:P125)`, but the labor line "Lay out and install forms" sits at
row **99** — outside the range. $2,219.74 of labor is dropped from the Concrete
phase subtotal.

Unlike the Irrigation case, nothing visually marks this line as excluded; it
looks exactly like the labor lines above and below it. This reads as an
off-by-one in the SUM range.

**Recommendation:** do not reproduce it. Flag it to the sheet's author as a
likely error in their live bidding tool, since it would be underbilling every
concrete job by that amount.

**Blocks:** "Quality-check the formulas," "Add the Concrete phase."

---

## Resolved

_(none yet)_
