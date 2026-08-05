# How Overhead Works

Overhead in Landscape is calculated on a **margin basis**, not a simple markup.
This surprises people, so here's the plain-English version.

## The two ways to add a percentage

Say a job's **materials** cost is **$100** and the overhead rate is **40%**.

- **Markup basis** — "add 40% of cost": `$100 × 0.40 = $40`. Materials +
  overhead = $140.
- **Margin basis** — "overhead should be 40% of the _materials + overhead
  subtotal_": gross up the cost so that 40% of that subtotal covers overhead.

  ```
  subtotal = cost / (1 − 0.40)     = 100 / 0.60 = $166.67
  overhead = subtotal − cost       = 166.67 − 100 = $66.67
  ```

  Check: `$66.67 / $166.67 = 40%` of the subtotal. ✅

Landscape uses the **margin** version.

## Why margin?

Contractors think of overhead as a slice of the money coming in the door
(revenue), not an add-on to what they paid for materials. Overhead — trucks,
office, insurance — has to be covered by a fraction of **revenue**.

The trap this avoids:

> "My overhead is ~40% of my business, so I'll mark up every job's materials
> 40%."

Marking up 40% on materials only makes overhead **28.6%** of the materials +
overhead subtotal (`40 / 140`) — so you under-recover overhead and slowly lose
money. To actually capture 40% of that subtotal you divide by `(1 − rate)`,
not multiply by `(1 + rate)`.

## Side by side at a 40% rate

|                                           | Markup (× 0.40) | Margin (÷ 0.60) |
| ----------------------------------------- | --------------- | --------------- |
| Materials                                 | $100            | $100            |
| Overhead added                            | $40             | $66.67          |
| Materials + overhead                      | $140            | $166.67         |
| Overhead as % of **materials**            | 40%             | 66.7%           |
| Overhead as % of **materials + overhead** | 28.6%           | **40%**         |

Both are "40%" — they just measure against different bases. Landscape's rate
is a percentage of the **materials + overhead subtotal**, not of materials
alone — and not of the estimate's total price, either: labor and profit sit
outside this gross-up entirely.

## Where it lives in the code

The calculation is in `priceLines()` in
[`packages/domain/src/engine/calc.ts`](../packages/domain/src/engine/calc.ts):

```ts
const directCost = materialCost + laborCost;
const overhead   = materialCost * (1 / (1 - rates.overheadRate / 100) - 1);
const profit     = (directCost + overhead) * (rates.profitRate / 100);
const total      = directCost + overhead + profit;
```

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
