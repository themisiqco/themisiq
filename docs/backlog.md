# ThemisIQ — Backlog

Standing list of known work not yet scheduled. Items are recorded here rather
than in chat so they survive session boundaries.

Two provenance tiers:
- **Verified** — confirmed against the live system or codebase on the stated date.
- **Carried over** — from earlier sessions, NOT re-verified. May already be done.
  Check before acting.

---

## Verified 22 Jul 2026

### DB-only schema sweep
Tables that exist in the database with no corresponding migration file. Capture
DDL into git and confirm RLS/GRANT on each. Hand-created tables are the
population most likely to have gaps — now evidenced, not theoretical.

- `audit_log` — referenced in code, no migration. Highest priority of the three.
- `ghg_entries` — RLS on, no policy, 0 rows, 0 code references, no migration.
  Deny-all so inert. Drop candidate.
- `organizations` — same profile as `ghg_entries`. Drop candidate. Note the
  platform is single-org-per-user; this may be a scaffold for the unbuilt
  multi-client layer.

### Grant hygiene
- `user_subscriptions` — `service_role` granted full CRUD, zero code references
  under either quote style. Either RPC-mediated or an over-grant. Confirm and
  revoke if the latter.
- REFERENCES / TRIGGER / TRUNCATE are granted to `anon`, `authenticated` and
  `service_role` on every table in `public`. This is `ALTER DEFAULT PRIVILEGES`
  residue, not deliberate. **RLS does not cover TRUNCATE**; PostgREST exposes no
  verb for it, so latent rather than live. Fixing app-wide means altering the
  default privileges, not just revoking on existing tables — touches `mr_*` and
  `ghg_*` too.

### `lib/supabase.ts` type-safety smell
`createServerClient()` asserts `SUPABASE_SERVICE_ROLE_KEY` with `!` and is
exported from a module imported by ~24 client components. The key is **not**
bundled (Next.js only inlines `NEXT_PUBLIC_*`), so this is not a leak — but
nothing stops a client component calling it and failing confusingly at runtime.
Consider moving to a server-only module.

### CBAM — route-layer test coverage
The suite has stayed at 500 tests / 15 files through every route change. Nothing
covers the route layer: not the stale-record tripwire, not the
`processesWithoutRecord` path, not the 404s, not the workings block. All were
verified by live runs against production fixtures instead. A route-level test
stubbing the Supabase client is the cheapest remaining hardening.
See spec §13.11.

### CBAM — `processes_complete` declaration UI
The attestation column and its enforcing trigger exist and are verified, but
there is no surface where an operator can actually make the declaration. Until
one exists, §1.2 items 5 and 6 can never be reported. **The flag must never be
seeded, including in test.** See spec §13.4.

### CBAM — country-specific defaults not seeded
Spec §0 decided to seed country-specific defaults for 13 exporters.
`cbam_default_values` holds only `country = 'other'` rows for the crude-steel CN
codes. The `'other'` fallback handles it correctly, so nothing is broken — but
§0's accuracy argument is unrealised. Confirm whether the seed was deferred or
lost. See spec §13.9.

### CBAM — test fixture cleanup
Test data under company `5a87bed2-3005-42ef-afde-1c32c1c51702` ("Test Co Alpha"):
installation "CBAM Test Mill — Fixture A", two processes, six source streams,
two precursors, several `cbam_see_records` rows, one disclosures row.
Deleting the installation cascades to all of it. Keep until the CBAM UI has its
own data; delete deliberately after.

---

## Carried over — unverified 22 Jul 2026

### Security / data
- **Write-side `company_id` ownership hardening** — `sbti_*` tables and
  `ghg_monthly_emissions`. Do as one consistent pass before real multi-tenant
  data lands.
- **Supabase Free → Pro upgrade** — do just before real customer data arrives.
  No backups on Free.

### Provenance
- Restore `source_doc_id` on the `ghg_monthly_emissions` monthly write.
- Thread `entry_method` through proposal → workings → monthly.
- Concierge batch-acceptance UX: single "Accept all" plus a persisted,
  timestamped acceptance record for the audit trail.

### Product / GTM
- **SEO** — meta tags/OG, structured data, sitemap/robots, per-module titles and
  descriptions, Core Web Vitals.
- **Supplier-to-customer cross-sell** — GHG module offer in the invite email and
  at the top of the supplier questionnaire. Resolve per-supplier-unique vs.
  shared tracked promo code first.
- **"Partner With Us"** — sustainability consultant referral/commission model.
  Recon the multi-client org/agency layer first; the platform is currently
  single-org-per-user.
- **"Find a Verifier" directory** — recon ISO 14064-3/14065/17029 impartiality
  principles from primary sources before designing. Paid placement likely
  conflicts with assurance independence. Note spec §0: the verifier is
  explicitly not selected by a software provider, so ThemisIQ is a signpost,
  not a directory.
- **Marketing copy** — clarify that an annual module purchase means multiple
  reports within 12 months, not one-off.

### Parked
- **API key rotation** — CC once printed `ANTHROPIC_API_KEY` to terminal
  scrollback. Local only, never committed. Low risk, still worth rotating.
- **Canonical country list** (`mr_countries`) — app-wide refactor, deferred.

## Verified 23 Jul 2026

### CBAM — precursor form (step 4 of setup wizard)
Not built. Must NOT offer `computed_here` (computeChildSEE throws — Phase 2).
Must warn on `actual_verified` that it currently resolves to the default with
an unresolved flag until a verifier-report record exists. See spec §14.8.

### CBAM — verifier portal
The real remaining gap. Without it the customer's own actuals are unusable
and the SEE advantage evaporates. Separate invite and portal view from GHG
(decided 23 Jul). Verifier needs: all output calculations including
methodology, and all source documents via signed URLs. Mostly a port of the
GHG verifier machinery — verifier_access, invite-consent gate, signed
document delivery. See spec §14.8.

### CBAM — charge mix form and process parameters
`cbam_charge_mix` and `cbam_process_parameters` have no UI. Note
`cbam_charge_mix.source_doc_id` still has NO FK — the same fix applied to
`cbam_source_streams` on 23 Jul should be applied when that form is built.

### CBAM — aluminium categories
`cbam_goods_categories` is steel-only (six categories). Canadian aluminium is
the largest North American CBAM flow into the EU (~US$1.65bn 2025) and Quebec
hydro-powered smelters are the ideal CBAM customer — their actuals would
crush the default. A Canadian CBAM product cannot currently serve them.
Commercial decision, not just a backlog line. See spec §14.9.

### CBAM — UI polish
"+ Add process" opens the form; "Add process" inside it saves. Rename the
second to "Save process". Same pattern likely on the other add/edit forms
(installations, source streams, evidence documents).

### Grid factors — only 13 countries seeded
`cbam_grid_factors` holds 13 countries plus `other` (0.465). An installation
outside those falls to `other` legitimately, but neither the report nor the
xlsx distinguishes a country-specific factor from the fallback. Worth
surfacing so a verifier knows which was used.

### npm advisories (pre-existing, not from CBAM work)
`npm audit --production` reports next (9 advisories, high), postcss, sharp,
dompurify. All predate this work. Fixing next requires moving outside the
stated dependency range, so it is a deliberate decision rather than a routine
update. Note: xlsx was resolved on 23 Jul by vendoring SheetJS 0.20.3 from
cdn.sheetjs.com (the npm registry copy is frozen at 0.18.5 with unfixable
advisories); the tarball is committed at vendor/xlsx-0.20.3.tgz and
package.json points at it via file:, so Vercel builds do not depend on the
CDN.

### Supabase Free -> Pro is now a hard prerequisite
CBAM evidence upload is live. Free gives ~1GB total storage; a single large
customer exceeds that in year one. Storage cost itself is negligible (a
100k t/yr mill generates roughly 0.3-1.4 GB/yr of evidence; Pro includes
100GB and overage is ~$0.021/GB/month), but the plan limit is binding. This
now blocks shipping the feature, not just prudence about backups.

---

## Verified 23 Aug 2026

Both items below were found while making the Impact Materiality module
discoverable. Reported, not actioned — recorded here at Lisa's instruction.

### Nothing proves a module is discoverable — only that its cart resolves

`double-materiality` — the ModuleKey renamed from `impact-materiality` on
26 Aug 2026 — shipped priced (`FLAT_MODULE_PRICES`, $4,900), entitled
(`useEntitlement('double-materiality')` on fifteen worksheet/survey routes) and
purchasable, while appearing on **no** marketing surface: absent from the Nav
Solutions dropdown, from `HomePricing.tsx` and from `/pricing`. The full suite
was green throughout.

Since fixed on all three: `Nav.tsx:15` and `HomePricing.tsx:18` both link to
`/materiality`, and `pricing/page.tsx:88` is a full `MODULES` entry rendered on
the live branch at `:560`. The finding about what the suite proves stands.

The reason the suite was green is precise and worth keeping: `pricing.test.ts:88`
asserts every `ModuleKey` is reachable through `LEGACY_PRICING_PAGE_ID`, and
`impact` **was** mapped. That test guards **cart reachability** — that a module
selected in a cart is not silently dropped by the `.filter(Boolean)` at
`app/order/page.tsx:75`. It says nothing about whether a customer can ever find
the module to select it. Those are different properties and only the first is
covered.

**Proposed test — do not write yet, decide the shape first.**

Where it should live: `lib/pricing.test.ts` is the wrong home. It is a pure-logic
suite that imports only `./pricing`; a discoverability test has to read three
React modules under `app/`, which drags JSX and the Next module graph into a
suite that currently runs in 161 ms. Put it in a new
`app/components/moduleSurfaces.test.ts` (or `lib/moduleSurfaces.test.ts`)
alongside a small exported manifest — see below.

What it would have to import, and why that is the hard part:

- `MODULES` and `LEGACY_PRICING_PAGE_ID` from `lib/pricing.ts` — the authority for
  what modules exist. Straightforward.
- `HomePricing.tsx`'s `MODULES` / `MODULE_CTA` — **not currently exported.** Both
  are module-private consts.
- `/pricing/page.tsx`'s `MODULES` — **also not exported**, and the file is a
  client component whose import pulls in the whole page.
- `Nav.tsx`'s `MODULES_NAV` — **not exported**, and worse, it has **no id at all**.
  It keys on `href`, so there is nothing to join against `ModuleKey` except a
  by-hand path convention (`climate-ghg` for `ghg`, `climate-risk` for
  `climate-risk`, `supply-chain` for `supply-chain`). A test would have to encode
  that mapping, which makes the test a fourth independent copy of the same
  knowledge — the very problem it is meant to catch.

That last point is the real finding: **the test is cheap only if the data moves
first.** The honest sequence is (a) give Nav an `id: ModuleKey`, (b) export the
three lists, (c) then a ~15-line test asserting
`MODULES.map(m => m.key)` appears in all three. Written before (a) and (b), the
test hardcodes the href convention and will pass while lying.

Deliberately out of scope for that test: `/advisory` is not a module and would
fail any such assertion. See the separate note below.

### `ModuleId` is declared twice and derives from nothing

`app/components/HomePricing.tsx:6` and `app/pricing/page.tsx:22` each declare

```ts
type ModuleId = 'ghg' | 'cbam' | 'risk' | 'impact' | 'supply' | 'people' | 'deals' | 'ai' | 'cyber'
```

Identical, independent, no shared import, and neither derived from
`lib/pricing.ts`. Adding a module means editing the same union in two files;
nothing fails if you do one and forget the other. Both unions are *also* an
untyped restatement of the keys of `LEGACY_PRICING_PAGE_ID`, which already
enumerates exactly these nine shorthands.

**What one source would take.** `lib/pricing.ts` is the right home — it already
owns `ModuleKey`, `MODULES` and `LEGACY_PRICING_PAGE_ID`, and CLAUDE.md names it
the single source of truth for pricing. The change is one line there:

```ts
export type ModulePageId = keyof typeof LEGACY_PRICING_PAGE_ID
```

then both files import `ModulePageId` and delete their local union. That derives
the type from the map rather than restating it, so an id added to
`LEGACY_PRICING_PAGE_ID` is immediately legal in both surfaces and an id removed
from it fails both at compile time.

Two caveats before doing it:

- `LEGACY_PRICING_PAGE_ID` is typed `Record<string, ModuleKey>`, so
  `keyof typeof` widens to `string` and the derived type would be useless. It has
  to be narrowed first — drop the annotation and let the literal infer, or use
  `satisfies Record<string, ModuleKey>`. That is a real edit to a load-bearing
  constant, not a rename, and `pricing.test.ts:88` should be run against it.
- The name matters. `ModuleId` inside `lib/pricing.ts` would sit confusingly
  beside `ModuleKey`; `ModulePageId` or `ModuleShorthand` says which of the two
  identifier spaces it belongs to. The distinction is exactly the one that
  `?modules=double-materiality` gets wrong.

### `/advisory` has no navigation entry

Not a backlog item yet — recorded so it is not rediscovered. `/advisory` is a
live page linked from the Footer (`Footer.tsx:37`), from `app/page.tsx` three
times, and from `/assess`, `/cyber`, `/deals` and `/climate-risk` as "Talk to a
specialist" / "Book a demo". It appears **nowhere in `Nav.tsx`** — not in
`MODULES_NAV`, not as a top-level item, not in the mobile menu. Whether it
belongs in the Solutions dropdown (it is not a module) or as a sibling of
Pricing is an open question, deliberately left for a separate conversation.

### `labelShort` in `Nav.tsx` is dead data

`MODULES_NAV` requires `labelShort` on every entry and nothing reads it —
zero consumers repo-wide, only the type and the nine literals. The comment at
`Nav.tsx:8` says it is "retained for any short-label surface". Either find the
surface or drop the field; today it is nine strings maintained for nobody.

---

## Verified 24 Aug 2026

### The contributor's empty-scope message names two causes it cannot verify

`app/impact/[token]/page.tsx:363` — shown when `impact_submit` returns
`assigned = 0`:

> No sub-topics are assigned to you, so there was nothing to record. They may not
> have been assigned yet, or they may have been moved to someone else since this
> link was sent.
> Whoever sent you the link can see which it is and put it right.

Both offered causes are wrong when a lead **deliberately** emptied the
assignment: nothing was "not assigned yet", nothing "moved to someone else", and
"put it right" sends the contributor to chase a person who did it on purpose.
Same class as the four instances CLAUDE.md records — a message naming a cause it
cannot observe.

**Reachable today, independently of custom IROs.** `assigned` counts
`materiality_impact_assignment_subtopics` rows for the assignment, and
20260838:582 grants `delete` on that table to `authenticated` so a lead can edit
assignment coverage. Removing every row produces `assigned = 0`. Not caused by
20260855/20260856 and not fixed by them — PT414 (20260856 §4) stops an IRO
emptying a scope, but the lead's own edit still can.

**IT NEEDS SCHEMA, WHICH IS WHY IT IS HERE AND NOT IN 20260856.** Telling *never
assigned* from *assigned then withdrawn* requires history, and
`materiality_impact_assignment_subtopics` has neither soft-delete nor audit. Two
options:

- **`removed_at` soft-delete column** — cheapest to write and the worse choice.
  Every read of that table must then say `where removed_at is null`; there are
  eight-plus call sites and no view to hide the predicate behind. That is the
  `iro_key` hazard again and the `mr_jurisdictions.active` hazard before it: a
  filter everyone must remember, silent when omitted.
- **Audit table** — additive, read only by the message that needs it, no existing
  query changes. **Recommended.**

Until then the honest fix is to stop guessing: say what is observed ("no
sub-topics are assigned to you") and drop both speculative causes, which is a
copy change and could ship on its own.

### Overload-count assertions in 20260854 §6.4 and 20260855 §10.6

Both carry, identically:

```sql
if (select count(*) from pg_proc p ...
     where n.nspname='public' and p.proname='impact_save_determination') <> 2 then
  raise exception 'Expected exactly two impact_save_determination overloads (10 args and 12). ...'
```

**Latent, narrow, and not worth a migration to fix an assertion.** It uses an
exact name rather than a prefix, so it cannot be broadened by an unrelated
function — it would NOT have failed the way 20260856 §9 did, where
`like 'materiality_custom_iro_%'` silently gained a fourth member.

The weakness it does share: **it counts overloads rather than naming their
signatures.** A signature change that PRESERVES THE TOTAL passes it. Replace the
10-argument overload with a differently-shaped one while the 12-argument survives
and the count is still 2, the assertion is still green, and the live contributor
path is broken. Naming the two argument lists —
`pg_get_function_identity_arguments` against the expected pair — would catch that;
counting cannot.

Both migrations are applied and green, so this is latent rather than live, and the
exposure needs a deliberate signature change. Fix it opportunistically the next
time either function is forked, not on its own.

**The general lesson, which is the reusable part:** an assertion that counts tests
arithmetic; an assertion that names tests identity. 20260856 §9 asserted
`count(*) <> 3` over a prefix, a correctly-written file grew a fourth matching
function, and the migration aborted at install on a file with nothing wrong with
it. Both of its assertions now list names. Prefer a name list wherever the
population is knowable at write time.

