# How Overhead Works

Overhead in Landscape is calculated on a **margin basis**, not a simple markup.
This surprises people, so here's the plain-English version.

## The two ways to add a percentage

Say a job's **direct cost** (materials + labor) is **$100** and the overhead
rate is **40%**.

- **Markup basis** — "add 40% of cost": `$100 × 0.40 = $40`. Price = $140.
- **Margin basis** — "overhead should be 40% of the *price*": gross up the cost
  so that 40% of the final price covers overhead.

  ```
  price    = cost / (1 − 0.40) = 100 / 0.60 = $166.67
  overhead = price − cost      = 166.67 − 100 = $66.67
  ```

  Check: `$66.67 / $166.67 = 40%` of the price. ✅

Landscape uses the **margin** version.

## Why margin?

Contractors think of overhead as a slice of the money coming in the door
(revenue), not an add-on to what they paid for a job. Overhead — trucks,
office, insurance — has to be covered by a fraction of **revenue**.

The trap this avoids:

> "My overhead is ~40% of my business, so I'll mark up every job 40%."

Marking up 40% on cost only makes overhead **28.6%** of the price you charged
(`40 / 140`) — so you under-recover overhead and slowly lose money. To actually
capture 40% of revenue you divide by `(1 − rate)`, not multiply by `(1 + rate)`.

## Side by side at a 40% rate

| | Markup (× 0.40) | Margin (÷ 0.60) |
|---|---|---|
| Direct cost | $100 | $100 |
| Overhead added | $40 | $66.67 |
| Price | $140 | $166.67 |
| Overhead as % of **cost** | 40% | 66.7% |
| Overhead as % of **price** | 28.6% | **40%** |

Both are "40%" — they just measure against different bases. Landscape's rate is
always a percentage of **price**.

## Where it lives in the code

The calculation is in `priceLines()` in
[`packages/domain/src/engine/calc.ts`](../packages/domain/src/engine/calc.ts):

```ts
const directCost = materialCost + laborCost;
const overhead   = directCost * (1 / (1 - rates.overheadRate / 100) - 1);
const profit     = (directCost + overhead) * (rates.profitRate / 100);
const total      = directCost + overhead + profit;
```

That `1 / (1 - rate) - 1` is the margin gross-up. It's the single source of
truth — used both server-side and in the generative preview engine — and the
`Overhead (40%)` line in the Estimate screen's totals box displays its result.

> **Heads up on the label:** the totals box shows `Overhead (40%)` next to a
> number that is 66.7% of direct cost. That's correct for a margin rate, but it
> can read as a bug to anyone expecting markup math.
