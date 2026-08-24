# Landscape — What's Needed to Launch

This is the work required to turn the current prototype into a real product that
businesses can sign up for and pay to use.

---

**Estimation**
Finish the main screens where a user builds a project estimate — the core of the
product. The app today only covers the core "packages" (drainage, irrigation,
soil prep, planting, concrete, seat wall), but the original spreadsheet this
product is based on does much more. The remaining work includes:

- **Quality-checking the formulas** — verifying that every pricing calculation
  produces the correct numbers, so estimates can be trusted.
- **Adding the Concrete phase** — now built into the estimate, matching the
  spreadsheet to the cent. One open question for the owner: the sheet's
  "Finishers" line charges a flat $350 × 8 (a sub-contract fee that isn't priced
  like normal labor or materials). We've left it out until we confirm what it
  represents and how it should be charged, then we'll add it back in.
- **Per-phase overhead and profit** — letting each phase of a job carry its own
  overhead and profit markup, rather than applying a single markup to the whole
  job.
- **Finalizing and improving the screen's design** — refining the layout and
  look of the estimation screen so it's clear and easy to work in.
- **Add-on services / Bid Sheet** — Beyond the core packages, the contractor
  needs to add individual services (demolition, lighting, carpentry, masonry, and
  many more) to build a complete bid. This is the functionality currently
  represented by the spreadsheet's "Bid Sheet" tab.
- **Per-trade labor rates** — Different types of work are billed at different
  hourly labor rates. The app supports only a couple of rates today; the original
  tool varies the rate by type of work.
- **General Conditions charge** — A standard percentage added across the bid to
  cover general, job-wide costs.
- **Labor time estimate** — A view of how many crew hours each phase of a job
  will take, for scheduling and planning the crew (separate from the price).
- **Per-phase cost breakdown** — A breakdown of the bid by phase, showing hours,
  cost, overhead, and price for each section of the work.
- **Estimated vs. actual hours** — After a job, compare the hours we estimated
  against the hours the crew actually worked, to measure how accurate the bid
  was.
- **Self-improving time estimates** — Use the history of past jobs to
  automatically refine how long each type of work takes, so estimates get more
  accurate over time.
- **Phase reporting charts** — Simple charts showing where the labor time and
  cost go across the phases of a job.

**Estimate Export**
A clean, professional version of a finished estimate that the contractor can
print or send to their customer — rather than only being able to see the number
on screen.

**Manage Parts Prices**
Let each business keep their own material and labor prices up to date. Align on  
how we should handle prices and material management for the first version without 
vendor integration.

**Sign-Up Experience**
The full journey from a visitor landing on our website to signing up and
becoming a paying customer.

**Payments & Plans**
Collecting subscription payments, and letting customers change their plan or
update their payment details. Before we can build this, we need to decide what
plans we offer and what they cost.

**Account & Team Management**
Let a business manage its account and invite team members, each with the right
level of access.

**Legal Pages**
Terms of Service and a Privacy Policy. These are required before we can accept
payments and store customer information.

**Keeping Each Customer's Data Private**
Making sure one business can never see another business's data. This is
essential for trust and is one of the most important things to get right.

**Automatic Emails**
The emails the system sends on its own — team invitations, payment receipts, and
a welcome message when someone signs up.

**Live Production Setup**
Setting up the real, live version of the app, kept completely separate from the
version we use for development and testing. This includes securely handling
sensitive settings (like passwords and keys) and automatically backing up
customer data so nothing is ever lost.

**System Health & Error Reporting**
Recording what the system is doing behind the scenes, so we can spot problems
and help customers quickly when something goes wrong.

**Outage Alerts**
An automatic watchdog that notifies us if the app goes down — so we hear about
problems before our customers do.

**Usage Analytics**
Understanding how people actually use the app, so we can see what's valuable and
decide what to improve.

**Visual Polish**
A cleanup of the app's colors, fonts, and layout so it looks professional and
trustworthy to real customers. This includes a mobile-first approach to the
design, so the app works well on a phone out in the field — not just on a
desktop.

---

## Outside services we'll rely on

The app depends on a handful of specialized outside services, most of which
charge a monthly fee. Each handles something it would be impractical to build
ourselves:

| Service | What it does for us | Provider |
| --- | --- | --- |
| Database hosting | Stores all customer and project data securely | MongoDB Atlas |
| Sign-in & accounts | Handles logins, passwords, and team accounts | Clerk |
| Usage analytics | Shows us how people use the app | PostHog |
| App hosting | Runs the live application on the internet | Google Cloud |
| Payment processing | Collects subscription payments | TBD |
| Email delivery | Sends the app's automatic emails | TBD |
| Domain name | Our web address | TBD |
