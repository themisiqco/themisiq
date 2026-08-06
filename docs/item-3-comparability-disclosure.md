# Item 3 — Year-over-year comparability disclosure

Decided 6 August 2026. Shape: **Option A — one path, two tiers of evidence.**

## What this is

ISO 14064-3:2019 clause 6.3.1.5 requires the verifier to determine whether
changes from prior periods that make the periods incomparable have been
disclosed by the reporting organisation. The obligation sits on the verifier;
the platform's job is to make the determination possible. That means the
disclosure has to exist, reach the verifier alongside the figures, and carry
enough context for the verifier to weigh it.

## Trigger

Ask only when a prior year exists — `prior_year_s1` or `prior_year_s2` present.
On a first inventory the question is noise.

## Two tiers, one path

The question is always asked in the same shape. What varies is the strength of
the observation placed in front of it, recorded in a `basis` field on the
workings row.

**Tier A — magnitude movement.** Available whenever a prior year exists at all,
including customers who did last year in a spreadsheet and typed the totals in.
Compares `prior_year_s1` / `prior_year_s2` against this year's totals and states
the movement.

> You reported 1,240 tCO₂e in Scope 1 last year and 2,910 this year — an
> increase of 135%. What changed?

**Tier B — structural observations.** Requires a stored prior inventory. Adds
location count, fuel types present, jurisdictions, boundary.

> ...and your inventory went from 4 locations to 6.

Tier B is additive to Tier A, not a replacement for it. Both tiers end in the
same free-text field for what the engine can't see — acquisitions, closed
plants, boundary redraws, methodology changes.

## Interaction with year states

`354f924` introduced two distinct year states. They split the **tiers**, not the
feature:

| Prior year state | Tier A | Tier B |
|---|---|---|
| Clean | ✅ | ✅ |
| `excluded` (workings record what was left out) | ✅ with the exclusion stated | ✅ |
| `unverifiable` (composition unknown) | ❌ suppress | ✅ |
| Typed-in totals only, no stored inventory | ✅ | ❌ unavailable |

An `unverifiable` prior total makes the magnitude comparison meaningless —
same reason SBTi already refuses an unknown year as baseline. It does not make
locations uncountable. Do not gate the whole question on year validity.

## Workings row

New row so the disclosure travels with the figures, matching where every other
disclosure already sits. Carries:

- the observation as stated to the customer
- the customer's answer
- `basis` — which tier applied, and why the weaker one applied if it did

Tier A rows must say in plain language that the prior period isn't held on the
platform and the comparison rests on figures the customer supplied. That is a
disclosure of the limits of the disclosure, and it's what lets a verifier tell
"the customer confirmed nothing changed" from "nobody put an observation in
front of them."

## Declaration union — resolve before building

The verifier page has a single row branch handling declaration variants by badge
and background colour, with `WorkingRow.declaration` typed
`'attested_absent' | 'undeclared'`. A new type renders generically unless added.

Two things to settle:

1. **Does a comparability disclosure belong in that union at all?** Both existing
   members are statements about *absence*. This is a statement about *change*,
   and it's present rather than missing. It may want its own field.
2. **`unpriceable` is already rendering generically** — it's in the union's
   conceptual space (a genuine absence) but not in the type. Fix it in this same
   change rather than discovering it later.

## Copy rules

Plain language throughout — no table names, column names, enum values.

Do **not** ask whether the base year needs recalculating. The platform can't act
on that answer today, and asking a question you can't act on is worse than not
asking. Ask what changed.

## Explicit non-goals

- Classifying the change (structural vs. organic)
- Holding a significance threshold
- Recalculating a base year

All three belong to the separate item below.

## Tests

Tier as a parameter, not a separate suite. Cover: no prior year (no question);
typed-in prior only (Tier A, no Tier B); clean stored prior (both); `excluded`
prior (both, exclusion stated); `unverifiable` prior (Tier B only); Tier A
suppression does not suppress Tier B.

---

# Future item — base year recalculation

Not scoped for build. Recorded so it doesn't get lost.

## Why it's separate

The GHG Protocol Corporate Standard asks for more than disclosure. Chapter 5
expects the reporting company to hold a **base year emissions recalculation
policy** — including its own significance threshold — and to actually recalculate
the base year when structural changes cross it.

Item 3 captures the narrative. It does not classify the change, hold a
threshold, recalculate anything, or record a policy. Those are a different
feature with a different owner of the judgement.

## The first real design problem

Recalculation triggers on structural change: acquisitions, divestments, mergers,
outsourcing and insourcing shifts, methodology or data-accuracy improvements,
discovered errors. It explicitly does **not** trigger on organic growth or plant
closures.

Organic growth and an acquisition produce the same magnitude movement and
require opposite treatment. So classification is the feature — the arithmetic is
easy and the judgement isn't. The Item 3 free-text answer is the natural input
to that classification, which is one reason to get its plain-language framing
right now.

## Two thresholds, different owners

Do not conflate these. They have different owners and different purposes, and
conflating them in copy would be expensive to unwind.

- **Significance threshold for recalculation** — GHG Protocol, owned by the
  *reporting company*, sits in their recalculation policy.
- **Materiality threshold** — ISO 14064-3 clause 5.1.7, set or confirmed by the
  *verifier* with the intended users. No number appears anywhere in that
  standard; the 5% figure is market convention.

## Dependencies

- **SBTi.** Trajectories are anchored to a base year. If the base year can move,
  every target derived from it moves with it. Needs deciding before, not after.
- **Item 3.** Supplies the change narrative that classification reads.

## Standards status

Reads against the current Corporate Standard. Nothing in the V3.0 Standard
Development Plan is normative yet.
