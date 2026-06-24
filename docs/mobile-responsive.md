# Mobile & Responsive Design

This doc explains the responsive strategy for the web app and the concrete plan
for making the existing screens work on phones, tablets, and desktops.

## The core idea: mobile-first

We use **mobile-first responsive design**, which is the approach Tailwind is
built around.

- Write the **phone layout as the default** (unprefixed classes).
- **Layer on complexity for bigger screens** with breakpoint prefixes.

In Tailwind, an unprefixed class applies at *all* sizes. A prefixed class
(`md:flex-row`) applies at that breakpoint **and up**. So you design the
constrained small screen first, then add overrides for wider viewports:

```jsx
// "Stack vertically by default; switch to a row at md (768px+) and up"
<div className="flex flex-col gap-4 md:flex-row md:gap-8">
```

Why mobile-first rather than desktop-first? The mobile layout is the
*constrained* one — fewer columns, stacked content. It's easier to start simple
and add than to start complex and tear down, and it matches how `min-width`
media queries cascade.

### Breakpoints

Tailwind's defaults (we use the stock set):

| Prefix | Min width | Typical use                          |
| ------ | --------- | ------------------------------------ |
| (none) | 0         | Phone — the default layout           |
| `sm:`  | 640px     | Large phone / small tablet           |
| `md:`  | 768px     | Tablet — the main phone↔desktop line |
| `lg:`  | 1024px    | Desktop                              |
| `xl:`  | 1280px    | Large desktop                        |

In practice we mostly use **`md:`** (the phone↔desktop line) and occasionally
`lg:`.

## The three techniques we use most

| Problem                                | Pattern                                          |
| -------------------------------------- | ------------------------------------------------ |
| Columns that should stack on mobile    | `flex flex-col md:flex-row` / `grid-cols-1 md:grid-cols-3` |
| Padding/spacing too big on mobile      | `p-4 md:p-8` (smaller default, bigger on desktop) |
| Wide tables                            | Scroll-wrap, reflow to cards, or hide columns (see below) |

## Tables: the one genuinely hard part

Tables can't just shrink — they overflow the viewport. Three options, in order
of effort:

1. **Horizontal scroll** (cheapest): wrap in `<div className="overflow-x-auto">`.
   The table keeps its shape; users swipe sideways. Fine for dense, read-only
   lists.
2. **Reflow to cards** (best UX): on mobile, render each row as a stacked card
   (`hidden md:table` for the table, `md:hidden` for a card list). More code,
   but reads naturally on a phone. Right for screens people **edit** on mobile.
3. **Hide low-priority columns**: `hidden sm:table-cell` on less-important
   cells. A quick pressure-relief valve.

## The plan for this app

### Conventions we're adopting

1. **A shared `<Page>` container** replaces the repeated
   `mx-auto max-w-3xl p-8` on every screen. It centralizes responsive padding
   (`px-4 py-6 md:px-8 md:py-8`) so we fix spacing in one place. A `max` prop
   controls the content width per screen.
2. **Mobile-first padding & stacking** applied screen by screen.
3. **A responsive header** — the nav collapses gracefully below `md:`.
4. **Per-screen table strategy** — scroll-wrap for read-only lists, card-reflow
   for screens you edit on a phone.

### Who uses what, where

This is a B2B estimating / job-management tool, so the right treatment depends
on where a screen actually gets used:

- **Field-friendly screens** (project list, project detail, status updates) get
  pulled up on a phone on a job site → these get proper responsive treatment.
- **The estimate editor** (the heavy table) is primarily a desk task, but should
  be *usable* on a tablet → scroll-wrap now, card-reflow later.

### Rollout

| Phase | Scope                                                                 |
| ----- | --------------------------------------------------------------------- |
| 1     | Shared `<Page>` container; responsive header; scroll-wrap both tables; mobile-first padding on all screens |
| 2     | Estimate editor: reflow line-item table to cards on mobile            |

### Status

- [x] Phase 1 — `<Page>`/`<TableScroll>` in `components/ui.tsx`; responsive
      header; all six screens on mobile-first padding; both list tables and the
      estimate phase tables scroll-wrapped; estimate meta header stacks on mobile.
- [ ] Phase 2 — estimate editor: reflow line-item table to cards on mobile.

## Developing & testing

- **Resize the browser constantly** while building — drag it narrow and watch
  where things break. That's the real feedback loop.
- Use the **devtools device toolbar** (Chrome: `Cmd+Shift+M`) and test at
  **375px** (iPhone SE / mini), the narrowest common width.
