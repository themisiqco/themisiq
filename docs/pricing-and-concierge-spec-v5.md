# Pricing and Concierge, spec v5

**Status: current.** Supersedes the Concierge section of `docs/pricing-and-concierge-spec-v4.md`,
which is marked accordingly and kept as the historical record. The GHG software tiers are unchanged
by this revision; only Concierge moved.

`lib/pricing.ts` is the source of truth for every number here. This document explains the model and
records the decisions behind it. Where the two disagree, the code is right and this file is stale.

Dated 28 Sep 2026.

## What changed, and why

v4 priced Concierge on the customer's location count, in three bands: Basic up to 5 at $799,
Standard 6 to 15 at $1,499, Enterprise 16 and above by custom quote. The stated basis was our own
labour, about 15 minutes of review per location per reporting year.

Locations turned out to be the wrong unit. The work is per DATA SOURCE, and a location can carry one
source or five. A single site with electricity and gas is two accounts to read every period; a site
with electricity alone is one. Banding by location charged both the same and priced the work by a
proxy that does not track it.

## The model

**A data source** is one utility account or meter that bills on a recurring basis: an electricity
account, a gas meter. A location with electricity and natural gas is usually two data sources.

**Onboarding**, one time, by GHG tier. Charged on a customer's FIRST Concierge purchase and never
again, including when they later move up a GHG tier.

| GHG tier | Onboarding |
|---|---|
| Essentials | $1,250 |
| Professional | $1,750 |
| Advisory | $2,500 |

**Annual, per data source.** A one-time charge each year that grants the usual 365-day term. There
are no subscriptions in this platform and this did not introduce one.

| Source kind | Per source per year |
|---|---|
| Uploaded, customer uploads bills and Concierge extracts | $90 |
| Connected, pulled directly from the utility | $60 |

**Self-serve ceiling: 60 sources.** Above that the order is a conversation. 60 is 20 locations at 3
sources each, 20 being the Advisory location ceiling under the old model. Without it nothing bounds
a Concierge order, and a typo in a quantity field becomes a five-figure card charge.

## Utility connection is not built

`UTILITY_CONNECT_ENABLED` in `lib/pricing.ts` is `false`. While it is:

- the connected rate is published on the pricing page and on `/climate-ghg`, described as coming soon
- `conciergeQuote()` throws on any connected quantity rather than pricing it
- both purchase routes reject a connected quantity at the server boundary, whatever the client sends
- the `/climate-ghg` FAQ renders an upload-only version, so the live page never describes a
  connection checkout cannot sell

### The target FAQ, for the connection build

`app/climate-ghg/faq.ts` holds two arrays. `FAQ_UPLOAD_ONLY` renders today. `FAQ_CONNECTED` is
written as though connection is live and is **the product spec for that work**: it is what the page
will say the day the flag moves, so the behaviour has to match it.

What `FAQ_CONNECTED` commits to, and therefore what the connection build has to deliver:

1. **Onboarding connects what it can.** A specialist identifies every data source across the
   customer's locations and connects the ones their utilities allow, as part of onboarding.
2. **Connection is authorized by the customer, per utility.** We pull usage and billing data directly
   from the utility with their permission.
3. **Mixed estates are normal.** Where a direct connection is not available, the customer uploads and
   Concierge reads the bills. Both kinds coexist in one inventory.
4. **The customer approves every figure**, connected or uploaded, before it enters the inventory, and
   each figure stays linked to its source record. Connection does not mean unreviewed.
5. **We tell them which is which during onboarding**, before they are billed for a year of either.
6. **A source that gains a connection moves to the connected rate at the next renewal**, not mid-term.

Two questions are deliberately held out of both arrays, with their text preserved in a comment in
`faq.ts`: what a customer does to connect a utility, because the revocation wording depends on which
data provider is chosen, and how long onboarding takes, because it has not been measured. Neither
ships as a bracketed placeholder, because `ModuleFaq` renders the `extra` field on the live page.

## How it is entitled and enforced

Add-ons are rows in `entitlements`, keyed on `module_key`, the same table as modules.

| column | Concierge row | GHG row |
|---|---|---|
| `module_key` | `concierge` | `ghg` |
| `source_allowance` | sources purchased | null |
| `ghg_tier` | null | the tier key |
| `location_allowance` | null | the tier ceiling, null meaning uncapped |
| `term_start` / `term_end` | 365 days, never shortened by a repurchase | same |

`ghg_tier` and `source_allowance` were added by
`supabase/migrations/20260928_concierge_source_model.sql`, applied 28 Sep 2026.

**The onboarding fee is not an entitlement.** It appears as a Stripe line item and in session
metadata as `concierge_onboarding_usd`, and the webhook never turns it into a row. As a row it would
take a 365-day term and then expire, which is meaningless for work done and billed once.

**`source_allowance` is recorded and not yet enforced.** Nothing reads it to cap anything. Its null
means "not recorded", NOT "uncapped", which is the opposite of `location_allowance`'s null. Whatever
enforces it later has to decide which and say so on the column comment.

**Access is term-aware on both readers.** `useHasConcierge()` and `/api/concierge/extract` both
compare `term_end`. Until 28 Sep 2026 neither did, so an expired customer kept bill extraction
indefinitely, with no error and no symptom.

**`isFirstPurchase` is deliberately NOT term-aware.** It asks whether the customer has ever held
Concierge, on any key including the retired band keys. An expired customer has no access but has
still been billed for onboarding once.

## Where the numbers are allowed to differ from the charge

One place, and it is stated on the page. The pricing configurator cannot know `isFirstPurchase`: it
serves logged-out visitors, and the answer is a read of the customer's entitlements that only
`/api/checkout` can make. The preview therefore always includes onboarding, labelled "charged on
your first Concierge order". For a returning Concierge customer the preview is HIGHER than the
charge, never lower.

## Migration from v4

There were no customer purchases on the band model. One developer test grant existed and was
re-keyed from `concierge-basic` to `concierge` with 60 sources, keeping its term. `concierge_jobs`,
`concierge_job_documents` and `concierge_proposals` were all empty; `concierge_jobs.tier` was
narrowed to `concierge` and gained a nullable `source_count` beside the retained `location_count`.

The three old `AddOnKey` members and `conciergeTierForLocations()` remain in `lib/pricing.ts` until
a cleanup batch removes them. Nothing new may read them.
