# /deals — replacement copy (v2)

Written against the 14 August recon. Every claim below maps to something CC
confirmed is BUILT. Nothing here describes a capability rated FLAG ONLY without
saying so in the copy itself.

Hand this to CC as Task 2, after the deletion pass.

---

## Hero

**Eyebrow**
DEALS & INVESTMENT

**Headline**
Not a values question.
*A valuation question.*

> Same line as the family-office sell sheet. The page and the sheet should open
> with the same sentence — a prospect who reads one and lands on the other
> should recognise where they are.

**Sub-headline**
Enter a target's turnover, balance sheet, headcount and jurisdiction, and see
which climate and sustainability regimes it already falls under — each
threshold tested limb by limb, with the figure applied and the provision it
comes from. Under five minutes, and your first target is free.

**Primary button**
Screen a target →  → `/dashboard/deals`

**Secondary button**
$4,900 USD/yr  → `/order?modules=deals`

**Tertiary link**
Screening your own obligations instead? Take the free assessment →  → `/assess`

> This is the funnel fix. Today the page says "start with our free assessment"
> and links to `/dashboard/deals`; `/assess` is never linked from this page at
> all. The two products answer different questions and the copy should say so
> plainly: `/assess` screens you, `/deals` screens a target.

---

## Stat cards

Four cards. Every number carries its source in the card body. All four should be
read from `lib/sources.ts` / `lib/sb253.ts` rather than hardcoded here, so the
page and the product cite the same dated registry.

**Card 1**
$500,000
PER REPORTING YEAR
Maximum SB 253 administrative penalty for non-filing or late filing.
Cal. Health & Safety Code §38532(f)(2)(B).

**Card 2**
$1 billion
REVENUE TRIGGER
SB 253 catches any US company over $1bn total annual revenue doing business in
California — privately held or public.
Cal. Health & Safety Code §38532.

**Card 3** *(existing card, unchanged except for the added attribution)*
IFRS S2
28 JURISDICTIONS
Have adopted the ISSB standards on a voluntary or mandatory basis, with a
further 12 planning to.
S&P Global ISSB tracker, 22 April 2026.

**Card 4**
Four outcomes
EVERY THRESHOLD TEST
Applies, near-threshold, not applicable, or not assessed. A test we could not
complete never comes back clean.

> Card 4 replaces "Days / not weeks". It is a product claim rather than a market
> statistic, which breaks the rhythm of the row slightly — but it is the single
> most defensible thing the module does, and it is currently advertised nowhere.

---

## Tag chips

Replace the current set with regimes the engine actually tests:

SB 253 · CSRD · SECR · CS3D · Canada S-211 · IFRS S2 · TCFD · M&A diligence · PE / family office

Removed: Portfolio monitoring, IC reporting, LP ESG.

---

## Section — What a screen returns

**Heading**
Six figures in. A defensible answer out.

**Which rules bite, and on which limb.**
SB 253, CSRD, SECR, CS3D, Canada's S-211 and the rest, tested against the
target's turnover, balance sheet total and headcount. Every limb is printed with
the figure applied, the threshold it met or missed, and the provision it comes
from.

**What is close, as well as what applies.**
Targets sitting just under a threshold come back in their own table — the ones
that cross it on the growth you are underwriting.

**What compliance will cost them.**
A build cost derived from the target's own size and number of sites, shown
alongside cited consultant benchmarks for the same scope of work.

**What the exposure is worth against your price.**
A band expressed as a percentage of deal value, weighted by sector and by how
many regimes bite. Presented as exposure, never as a quote.

**What is missing from the data room.**
Whether the target holds a verified GHG inventory and a current ESG report —
the first two things you will ask for, and the basis of the mandate.

**Where the sector risk usually sits.**
The ESG risks typical of the target's sector, each tied to the regime that
governs it and conditioned to the jurisdictions the target is actually
established in. Flagged for your attention, not measured.

> That last line is load-bearing. SECTOR_RISKS is a sector-keyed template, and
> the copy has to say so rather than letting a reader take it for analysis.

---

## Section — Why the answer holds up

**Heading**
Built to survive the other side's advisor.

**Size tests are run the way the statute writes them.**
SECR is a two-of-three test over turnover, balance sheet and headcount — not
turnover alone. Each limb is reported separately, so a disagreement is about a
figure rather than about an opinion.

**Currency never quietly changes the answer.**
Revenue is converted at a dated ECB reference fixing; the statutory threshold is
never restated. The figure on your report still matches the legislation word for
word, and the report prints which fixing a borderline call relied on.

**A blank never becomes a pass.**
Where a figure was not supplied, the report says so and names the figure that
would settle it. Nothing comes back clean because the question was never asked.

**Where a test is incomplete, it says that too.**
CS3D's route tests are not exhaustive, and the engine treats a failed size test
as unresolved rather than as a clean negative.

> This section is new. It is the strongest material in the module and the page
> has never carried any of it.

---

## Section — Across the deal

Keep the three-stage Screen / Mandate / Inherit model from the sell sheet, same
copy, same "who pays / effort" framing. It is the argument that makes the price
make sense and it belongs on both surfaces.

---

## Section — SB 253 callout (existing dark band, ~53-98)

KEEP the section. Replace the body, the three ticks, and three of the six
framework rows.

**Eyebrow** — unchanged
SB 253 — M&A liability

**Heading** — unchanged
Acquiring a California company?
You inherit their SB 253 obligations.

**Body** — replaces the "group level / global consolidated revenue" sentence
A target with California nexus and revenue over $1bn is a reporting entity in
its own right, and stays one after you buy it. The screen tests that threshold
against the figures you enter and prints the limb, the figure and the provision
— so the obligation is priced into your deal rather than discovered after it.

> The current sentence asserts that SB 253 applies at group level on global
> consolidated revenue. That is an interpretive question CARB's regulations
> address, not a settled fact, and the page states it flatly. The engine is
> more careful than the page. If you want the group-level argument made, it
> needs a citation and its own review — it should not sit unsourced above a
> buy button.

**The three ticked items** — replaces all three
- SB 253 tested against the target's own revenue, with the provision cited
- What the inventory will cost them to build, from their size and site count
- The gap list you hand the target as a condition of proceeding

> Removed: "CARB compliance timeline" (no per-target deadline is computed) and
> "Post-acquisition integration roadmap" (nothing produces this).

**Frameworks panel — six rows become five**

| Row | Scope line |
|---|---|
| SB 253 | Tested on revenue over $1bn with California nexus |
| CSRD / ESRS E1 | EU disclosure obligations, tested limb by limb |
| SECR | UK two-of-three test on turnover, balance sheet and headcount |
| CS3D | Post-Omnibus size test, reported as unresolved where the route is not met |
| Canada S-211 | Two-of-three test on assets, revenue and employees |

> Removed: "IFRS S2 / TCFD — Physical + transition risk quantification" (no
> scenario analysis runs), "LP ESG requirements" (absent from the module), and
> "SBTi compatibility" (confirm — I do not believe the Deals engine emits SBTi
> at all; it is a separate module).
>
> "Stranded asset risk" also came out. It exists, but only as a sector template
> that fires for Energy & Utilities and nothing else — too narrow to advertise
> as a framework the screen covers.
>
> The replacement rows are all regimes the threshold engine actually tests,
> which makes this panel a truthful summary of the product rather than a wish
> list.

---

## Section — Use cases (existing grid, ~100-121)

KEEP the five audiences and the grid. Replace all five descriptions — each
currently enumerates capabilities that do not exist.

**Heading** — unchanged
Built for every deal structure.

**Private Equity**
Screen every target in a competitive process, not just the ones that reach
exclusivity. Obligations and their cost land before you commit, and the target
carries the work.

**Family Office**
One screen per target, unlimited targets, no advisor engagement to open.
Walking away costs you the five minutes it took to look.

**Corporate M&A**
Find out whether a target already falls under SB 253, CSRD or SECR before the
integration plan assumes it does not.

**Investment Banking**
Give a credit committee a threshold test with its provision cited, rather than
an adjective about ESG risk.

**Venture Capital**
Know which of your growth-stage targets is about to cross a reporting
threshold, and how much the crossing costs them.

> Every description now describes the buyer's situation and points at something
> the screen returns. Removed across the five: portfolio-level Scope 1 + 2
> footprint reporting, LP ESG reporting, SBTi target setting, exit readiness,
> post-merger integration, legacy asset transition planning, and IFRS S2 risk
> disclosure for listing documents.
>
> The Venture Capital card is where the "portfolio-level carbon footprint
> reporting for LPs" claim was living — it was never a section, which is why
> the earlier deletion task could not find it.

---

## Footer CTA

**Heading**
Your first target is free.

**Body**
Create an account and screen one — the complete report, every limb tested,
nothing held back and no card. The subscription is for when you have a pipeline
rather than a deal.

**Button**
Screen your first target →  → `/dashboard/deals`

---

## Open questions for Lisa

1. **Free tier — settled, with two things the copy must respect.** An account
   gets one free saved target and its complete report. The cap counts every
   deal that account has ever saved, so a lapsed customer returning as a free
   user has no free save waiting — "your first target is free" is true of a
   first target, not of a fresh start. And the wizard withholds *findings*
   until there is a session, so no page should promise results before sign-up.

2. **Term-awareness is now live on the three Deals surfaces.** An expired
   customer keeps their saved targets, keeps editing them, and keeps the share
   link they have already handed a counterparty; what lapses is screening new
   ones. Any renewal copy should lead with what they keep.

3. **The Scope 3 timing card** — I left it out of the four above because CARB's
   proposed modified regulatory text of 27 July 2026 is still in flight. If
   `lib/sb253.ts` already carries a settled date, it is a stronger card than
   Card 4 for a deal audience, because it is the one that lands on the buyer's
   own hold period.
