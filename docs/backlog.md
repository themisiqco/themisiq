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

**Added 24 Sep 2026 — a DB-only CONSTRAINT, not a table.** `campaign_suppliers_status_check`
appears in no migration. `20260618_supplier_portal_schema.sql:53` declares
`status text NOT NULL DEFAULT 'invited'` with no CHECK, and
`20260618_supplier_portal_schema.sql:64` re-adds the column with `ADD COLUMN IF NOT
EXISTS` and still no CHECK. The constraint exists only in the live database, and the
only record of it in git is `db/dumps/schema_public_*.sql`, which spells it:

```
CONSTRAINT campaign_suppliers_status_check CHECK ((status = ANY (ARRAY[
  'invited'::text, 'in_progress'::text, 'completed'::text, 'expired'::text])))
```

Four permitted values: `invited`, `in_progress`, `completed`, `expired`.

⚠️ **Why this one matters more than a drop-candidate table.** Those four values now drive
verifier-facing prose. `lib/supply-chain/supplierStatus.ts` carries a sentence per status
which is frozen into `scope3_category_snapshots.uncovered` at acceptance, and
`lib/supply-chain/supplierStatus.test.ts` pins the set by reading the newest dump, because
the dump is the only source in git. So the test is only as fresh as the last dump: widen
the constraint in the database without taking one and the test keeps passing against a
stale list while a fifth status falls through to the raw-value path. Capturing the
constraint into a migration removes that dependency. Extends the sweep above from tables
to constraints, which nothing has audited.

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


## Verified 8 Sep 2026

### Security artefacts and questionnaire readiness

Raised while correcting `app/security/page.tsx:222`, which offered *"Penetration
test reports, SOC 2 bridge letters, and full security questionnaire responses …
available on request"*. Two of the three artefacts do not exist: no independent
penetration test has been performed, and a SOC 2 bridge letter is issued by an
auditor to cover the gap after a report period ends — offering one implies an
audit that has not happened. The offer is now narrowed to the questionnaire.

⚠️ **This class is sharper than the assertions corrected in tasks 33–39, and that
is the reusable lesson.** An assertion is checked only if someone chooses to
check it. **An OFFER invites the request that reveals the gap** — and it does so
during a sales process, from the buyer who cares most, at the moment the answer
costs the most. Audit offers before assertions.

- **Complete a CAIQ or SIG Lite proactively.** Doing it once, in advance, means a
  completed questionnaire can be sent on the day it is asked for, instead of each
  buyer's own form being filled from scratch under deal pressure. It also surfaces
  the gaps on our own timetable rather than a prospect's. CAIQ (CSA) is the usual
  choice for SaaS; SIG Lite is more common in financial services — pick for the
  buyers we expect. This is the work that makes the narrowed offer honourable.

- **Add `SECURITY.md` to the repository.** GitHub flags it as missing. It is also
  how the 24-hour response promise (`app/security/page.tsx`, disclosure section,
  audit row 24) becomes a real process rather than a sentence on a marketing page:
  a reporter gets a documented channel and scope, and GitHub surfaces it on the
  repo and in the advisory flow. Pair it with whoever actually monitors
  `security@themisiq.co` — nothing in the codebase routes or watches that inbox
  today (verified task 37).

- **Restore the artefact offer if and when the artefacts exist.** A pen test
  report or a SOC 2 report makes the original sentence true. Until then it is an
  invitation to ask for something we cannot send.
  ⚠️ Restoring it is a THREE-place change: this offer, the certifications table
  (`:57–63`), and `docs/security-claims-audit.md` row 17, which records the pen
  test as deleted rather than deferred.


---

## Verified 24 Sep 2026

Found while making the Scope 3 Category 1 supplier data verifier-ready for limited
assurance. All were confirmed against the codebase on the date.

**Scheduling decision, 24 Sep 2026 (Lisa).** Two of these go first: **the raw status
enum in the uncovered reason** and **the `data_quality` split**. Not because they are
the largest, but because both are freezing into immutable snapshots on every
acceptance from today, and `scope3_category_snapshots` has no UPDATE path by design.
Every other item on this list can be fixed at any time and the fix applies
retroactively. These two cannot: a snapshot already written keeps the defective
string, and the only correction is a new snapshot superseding the old one, which
means a restatement of a filed figure for a wording defect. The cost of waiting is
therefore not zero and it compounds.

### `s3_assurance` is absent from `ecovadis`, which is the default questionnaire

`lib/supply-chain/templates.ts` exports five templates. **Only `scope3` asks whether
the supplier's emissions figures are independently assured.** `ecovadis` has no
assurance question at all: its `proc_audit` and `proc_ecovadis` are about the
supplier's OWN suppliers and their rating, neither of which is assurance of their
figures, and `env_reporting` is disclosure rather than assurance.

`ecovadis` is the default. It is the initial value in the campaign creation form
(`app/dashboard/supply-chain/portal/page.tsx:44`) and the fallback in both readers
(`app/supplier/[token]/page.tsx:41`,
`app/dashboard/supply-chain/portal/[id]/supplier/[supplierId]/page.tsx:69`).

The three `s3cat1_*` questions that feed Category 1 are in **both** `ecovadis` and
`scope3`, with byte-identical labels. So the ordinary case is a campaign that
produces supplier-specific Cat 1 lines for which the assurance question was never
put to the supplier. That is now reported honestly as `not_asked`, with one
campaign-level sentence, but the answer still does not exist for those campaigns,
and for a limited assurance engagement it is the first question asked about a
supplier-reported number.

⚠️ **Adding it is one line, and that is exactly why it needs scheduling rather than
doing.** `answeredQuestions / totalQuestions` drives the progress percentage on both
the supplier portal and the buyer's response viewer, so every in-flight `ecovadis`
response would drop below 100 percent and an unanswered question would appear to a
supplier who had already finished. Decide what happens to campaigns already in
flight before touching the template.

### `data_quality` on a Cat 1 line mixes the supplier's words with ours

`app/api/campaigns/[id]/scope3-cat1/route.ts` sets
`data_quality: quality || 'Supplier-reported (basis unspecified)'`, where `quality`
is the supplier's own selection from `s3cat1_quality`. One field therefore holds
either a verbatim source value or a sentence we wrote, and a reader cannot tell
which without comparing against the option list in `templates.ts`.

**Now frozen into `scope3_category_snapshots.lines`**, so the ambiguity is permanent
in every snapshot written from here on. The fix is the split already applied to
assurance in the same pass: one field for what the supplier said, null when they
said nothing, and a separate normalised field for what we know. See
`supplier_assurance_raw` and `assurance` in `lib/scope3/supplierAssurance.ts` for
the shape, and the note on `SnapshotLine` for why the fallback string is the defect.

### The questionnaire picker states two wrong question counts

`app/dashboard/supply-chain/portal/page.tsx:29-30`. Counted by importing `TEMPLATES`
and summing, not by eye:

| Template | Picker says | Actual |
|---|---|---|
| `ecovadis` | "Full 38-question assessment" | **35** |
| `scope3` | "8 questions on GHG emissions..." | **12** |
| `modern_slavery` | "12 questions" | 12 |
| `cs3d` | "15 questions" | 15 |

The buyer chooses a questionnaire partly on its length. Consider deriving the count
from `TEMPLATES` rather than restating it, which is the same argument as never
stating a module count in pricing copy.

### The uncovered reason puts a raw status enum in front of a verifier

`app/api/campaigns/[id]/scope3-cat1/route.ts:180-181` builds
`Questionnaire ${s.status} — no allocated figure submitted yet`, interpolating the
database enum directly. A buyer and later a verifier reads
`Questionnaire in_progress — no allocated figure submitted yet`, underscore and
em-dash included.

⚠️ **As of `20260924_scope3_category_snapshots.sql` this string is frozen into
`scope3_category_snapshots.uncovered` and cannot be corrected in place**, because
the table is immutable and a correction is a new snapshot. Every day this stays
unfixed, more filed records carry it. Fix before the feature sees real use. The
same file's `STATUS_CONFIG` in `app/dashboard/supply-chain/portal/[id]/page.tsx:41-46`
already holds display labels for all four statuses and is the obvious source.

### The Cat 1 contradiction notice does not survive a page refresh

The export-step notice naming a supplier who reported a figure while stating they do
not measure their emissions reads `acceptedCatOneLines` in
`app/dashboard/scope3/page.tsx`, held in component state from the moment of
acceptance. It survives the save but **not a reload**, because snapshots are never
read back from `scope3_category_snapshots` on page load: only `cat_snapshot_ids`,
the pointer, is loaded.

This is a false negative and it is only tolerable because **nothing asserts the
absence of a contradiction** anywhere on that screen, so a missing notice is not
rendered as a clean bill. Fixing it means reading the current snapshot's `lines`
back by `cat_snapshot_ids.cat1`, which is the same read the verifier surface will
need. **Do it with `get_verifier_scope3`, not before**, or the read gets written
twice.

### Comment-stripping in source-reading tests should be one helper

**Approved 24 Sep 2026 (Lisa) as its own task, deliberately not folded into the
Scope 3 assurance work.** Twelve sites across the test suite strip comments before
matching source text, in two shapes that disagree with each other:

- `//` and `*` only: `sources.test.ts:76`, `sb261.test.ts:84`, `sb253.test.ts:84`,
  `ifrsS2.test.ts:59`, `ghg/declarationStates.test.ts:50`,
  `ghg/engineCallSites.test.ts:63`, `materialityDrResolution.test.ts:341`, and two
  inline in `scope3/categorySnapshot.test.ts`.
- also `/*` and `{/*`: `aiAct.test.ts:62`, `cs3d.test.ts:46`,
  `publisherClaims.test.ts:203`.
- SQL `--`: `ghg/verifierWhitelist.test.ts:46` (`stripSql`), and
  `scope3/categorySnapshot.test.ts`.

⚠️ **Deduplication is the weaker reason. The stronger one is that every site is
LINE-based, and a line filter cannot see the interior of a multi-line comment.** A
`{/* ... */}` block's continuation lines do not begin with a comment marker, so they
survive stripping and are matched as if they were code. This is not hypothetical: it
is how the `carriesThirdPartyAssurance` guard in `scope3/supplierAssurance.test.ts`
failed on 24 Sep 2026, on a six-line JSX comment whose forbidden token sat on line
two. There are **447 multi-line JSX comment blocks across 60 files** in `app/` and
`lib/`, so the precondition is everywhere. NOT VERIFIED: whether any of the twelve is
currently fooled. That depends on what each asserts and was not checked. The claim is
a latent hole in the technique, not a live defect in those tests.

Shape when it is done:
- `lib/testing/stripComments.ts` with TWO functions, `stripTsComments` and
  `stripSqlComments`. Two, not one: the languages differ in syntax and in escape
  rules, and one function is wrong for both.
- Remove comment SPANS, not comment LINES: `{/* */}`, then `/* */`, then whole-line
  `//`. That is the part the existing sites get wrong.
- Do NOT unify with `scripts/check-sql.py`. It is Python and its stripper also tracks
  single-quoted literals with `''` escapes because it feeds a parser. No shared code
  is possible.
- Migrate the twelve OPPORTUNISTICALLY, one at a time as each file is next edited for
  another reason. ⚠️ A single commit rewriting the stripping in ten test files touches
  the safety net itself, and a mistake there is invisible: the tests still pass, they
  just stop catching things.

⚠️ **And the limit worth carrying into that task: stripping is a workaround.** The
real problem is a guard matching substrings over a file that documents its own rules,
where prose about a rule reads identically to a breach of it. Where a VALUE is
available, assert on the value instead: `scope3/categorySnapshot.test.ts` joins
adjacent SQL string literals so it matches the comment Postgres stores rather than
the file as written. Stripping is the right tool only where there is no value to
assert on, such as a render branch or a call site.

### `get_verifier_inventory` does not enforce consent, and a migration header says it does

**Verified 24 Sep 2026 by `pg_get_functiondef`, and independently in the file.**

`public.get_verifier_inventory(uuid)` validates a token on two conditions and no others:

```sql
where token = p_token and status = 'active' and expires_at > now();
```

`accepted_at` appears exactly once more in the body, as an output key. `tos_accepted_at`
and `privacy_accepted_at` do not appear at all. The newest defining migration,
`20260814_get_verifier_inventory_factor_editions.sql:95`, says the same, so the file and
the database agree. `revoked_at` is not tested either.

**So the consent gate on the GHG verifier surface is client-side only.**
`app/verify/[token]/page.tsx:515` returns the accept-terms screen before rendering the
review, and that is the whole of it: **a direct RPC call with a valid, unaccepted token
returns the company name, reporting year, boundary, all three scope totals,
`locations_data`, the full `workings`, `coverage_resolutions`, `gwp_version`,
`pct_estimated`, `comparability_disclosure`, `factor_editions` and the audit trail.**
Nine grants were active on 24 Sep 2026.

⚠️ **And `20260909_verifier_invite_term_gate.sql:17-19` states the opposite**, verbatim:

> `-- workings and every evidence document for its own 90 days — get_verifier_inventory`
> `-- and both document routes check the grant's own status/expiry/consent and never`
> `-- look at entitlements.`

On entitlements it is right, and that was its subject. On consent it is wrong for the
function. **The document routes DO check it**: `lib/ghg/verifierGrant.ts:42` hard-gates on
`accepted_at` and returns `consent_required`, and both document routes defer to it. So the
claim is half true, which is why it read as true.

**Not falsified elsewhere.** `docs/security-claims-audit.md` carries no row depending on
verifier consent; a search for verifier, consent, `tos_accepted` and `accepted_at` returns
one line, 99, about the audit record being append-only. Nothing published to customers
rests on this.

**What closing it would break, which is why it is logged rather than fixed.**
Adding `if v_access.accepted_at is null then return jsonb_build_object('error',
'consent_required'); end if;` to the function is three lines. The consequences are not:

- **Nine live grants, and an unknown number of them unaccepted.** Any verifier mid-engagement
  who has not accepted would find the page stop loading. Count first:
  `select count(*) from verifier_access where status = 'active' and accepted_at is null;`
- **`app/verify/[token]/page.tsx` treats a `consent_required` verdict as nothing.** Its load
  handler maps the RPC's own verdicts to screens, and this one is not among them, so today it
  would fall through to the invalid-link screen: *"This verifier link is invalid or has
  expired"* to a verifier holding a perfectly good link who simply has not ticked the box.
  That is the exact cause-guessing defect the same handler was rewritten to remove. **The page
  change has to land in the same commit as the function change, or closing this gap creates a
  worse defect than it fixes.**
- **The accept screen needs the payload it currently gets from the gated call.** `verifier_name`
  and `verifier_email` are seeded from `data.verifier` at `page.tsx:395-398`, which comes from
  the same response. Gate the whole response and the accept form loses its prefilled email, so
  either the verdict carries those two fields or the seeding moves to `verifier_accept_invite`.

`get_verifier_scope3` does not inherit the gap: it enforces consent in its own body, reusing
`verifierGrant.ts`'s two denial strings. That is the reference for what closing this looks
like, and it deliberately does not touch `get_verifier_inventory`.

### Source-text guards under-report, and `[a-z_]+` is how

**Its own entry rather than a line on the comment-stripping one above, because the failure
mode is the opposite and so is the remedy.** Both are source-text matching defects. Comment
stripping fixes a FALSE POSITIVE: prose about a rule reads as a breach of it, the test fails,
somebody looks. This one produces a SILENT PASS, which nobody looks at.

**Three occurrences on 24 Sep 2026, all mine, all the same mistake:**

1. Enumerating the questionnaire templates with `awk '/^  [a-zA-Z_]+: \{/'`. It found
   `ecovadis`, `modern_slavery` and `custom`, and missed **`scope3` and `cs3d`** because both
   contain a digit. I reported "three templates" before rechecking. `scope3` is the only
   template that asks about assurance, so the miss went to the centre of the question being
   asked.
2. The same pattern, again, in the next command. Two misses, same cause, minutes apart.
3. `[...body.matchAll(/'error',\s*'([a-z_]+)'/g)]` in the `get_verifier_scope3` whitelist
   test. It found two of four verdicts, because `scope3_not_granted` and `scope3_not_found`
   both contain a `3`.

⚠️ **Why the third is the serious one.** The first two were greps in a report, corrected in
the same session. The third was **an assertion in a whitelist test**. Had it not also
asserted the exact set, it would have passed while checking half of what it claimed to
check, in a test whose whole job is to guard a disclosure boundary. A guard that
under-reports does not fail. It reports success over a subset and nothing indicates which
subset.

**The remedy is not "write better character classes", and this is the part worth carrying.**
It is to make the parse's own result an assertion, so a pattern that matched less than
expected fails on that alone. The pattern already exists in this repo:
`lib/ghg/verifierWhitelist.test.ts` W-1, *"the projection is non-trivial and the parse
actually found it"*, whose comment says exactly why: *"a parse that silently matched nothing
would make every assertion below pass vacuously, which is the classic way a source-text test
rots"*. W-1 guards against zero. It does not guard against "found 2 of 4", which is the case
here and the harder one.

When the comment-stripping helper is built, do this alongside it:

- Audit every `matchAll` / `match` / `exec` in the test suite whose character class omits
  `0-9`. The identifiers in this codebase are full of digits: `scope3`, `cs3d`, `cat15`,
  `s3cat1_allocated`, `ar6`, `sb253`, `iso14001`, `scope2_market_total`. A class without
  digits is wrong far more often than right here.
- Where a parse feeds assertions, assert the COUNT or the exact SET, not just non-emptiness.
  `toEqual([...])` on a sorted list is strictly better than `toContain` plus
  `toBeGreaterThan(0)`, because it fails on a miss as well as on an extra.
- ⚠️ Do NOT do this as one sweep. Same reason as the helper: rewriting the matching in a
  dozen test files touches the safety net, and a mistake there is invisible because the tests
  still pass.
### CS3D copy corrected 24 Sep 2026, with four claims pending EUR-Lex verification

`app/supply-chain/page.tsx` was rewritten on 24 Sep 2026 against **Directive (EU) 2026/470**
(Omnibus I), published 26 Feb 2026, in force 18 March 2026, amending Directive (EU)
2024/1760. `lib/cs3d.ts` gained the new constants and is still the single source; the page
imports every date and figure and retypes none.

What changed on the page: the civil liability framing removed in all four places it appeared,
the "you must comply" framing reversed to "your customers must and the request lands on you",
the "12 to 18 months, companies starting in 2026 will not be ready" urgency removed (it was
written against a 2027 application date), the eliminated phase-in tiers no longer implied,
the non-EU turnover route added, the value chain contact limit added, and a dates-and-sources
section added in the `app/cbam/page.tsx` pattern.

⚠️ **FOUR CLAIMS REST ON SECONDARY SOURCES. Nobody here has read the amended articles on
EUR-Lex.** Recorded so the next reader knows which parts of the page are as solid as its
citation and which are not:

1. **The exact wording of Article 2(1) as amended: "more than 5,000" versus "at least
   5,000".** Secondary sources disagree. The Council press release says *"more than 5,000
   employees and above EUR 1.5 billion net turnover"*; the original art. 2(1)(a) used *"more
   than 1000 employees"*. The repo says "more than" in three places that agree with each
   other: `lib/cs3d.ts` `CS3D_EMPLOYEE_THRESHOLD`, and both the `basis` string and
   `comparison: 'gt'` in `THRESHOLD_TESTS['CS3D']` in `lib/deals/assessment.ts`. ⚠️ **This one
   is not only copy.** `gt` resolves a deal assessment, so a company with exactly 5,000
   employees is assessed as out of scope. If the article says "at least", the comparison, both
   `basis` strings and the copy constant change together, or the report and the page will
   disagree about that company.
   ⚠️ **UPDATED 26 Sep 2026: A FOURTH CONSUMER, AND A PARTIAL MITIGATION.** `app/deals/page.tsx`
   now reads the same engine, so four surfaces rest on one unverified reading of the article.
   **It was proposed that this item be closed on the strength of those four agreeing, and it was
   not.** Internal agreement between consumers of one assumption is the evidence this entry already
   holds and already judged insufficient. What closes it is one read of art. 2(1)(a) as amended on
   EUR-Lex, and nothing else does.
   The mitigation, such as it is: `NEAR_THRESHOLD_BAND` is 0.10 with an INCLUSIVE boundary, so a
   company at exactly 5,000 employees falls inside the marginal band and is flagged near-threshold
   wherever that limb decides the outcome. A reader of the report therefore sees the figure is
   borderline even though the comparison resolves it as out of scope. **That reduces the harm and
   does not remove it** — a flag beside a wrong answer is still a wrong answer, and the flag fires
   only where the limb is decisive.
2. **Deletion of the EU-wide civil liability regime**, reverting to national law. **This is the
   load-bearing one**, because it is the claim that was REMOVED from the page. Removing an
   over-claim on secondary sources is safe in a way that adding one is not, which is why it
   proceeded. If it turns out the regime survives in some form, the page currently understates
   and would need the claim restored, with its source.
3. **Deletion of the mandatory climate transition plan obligation** from CSDDD. Not asserted
   on the page either way, so nothing to correct if wrong.
4. **Penalties: the 5% minimum floor replaced by a 3% cap.** ⚠️ **DELIBERATELY NOT ON THE
   PAGE.** Adding a figure on a secondary source is the thing this list exists to avoid. Verify
   before any surface states a penalty figure.

**Two things that will make the page need review again, and neither has happened:**

- **Commission implementation guidelines, due before 26 July 2027, not yet published.** They
  will shape how an in-scope company words the request that lands on a supplier, which is the
  page's whole subject. `CS3D_GUIDELINES_DUE` carries the date and the page states the status.
- **National transposition, due 26 July 2028, not started in earnest.** Transposition is what
  turns these dates into obligations, and Member States may diverge on the parts the directive
  leaves to them, now including civil liability. The page says so rather than implying national
  law is settled.

**Where the dates live and what guards them.** `lib/cs3d.ts` holds them all;
`lib/cs3d.test.ts` fails any non-comment line in `app/` or `lib/` containing one as a literal.
Added to `FORBIDDEN` with this change: `1 January 2030`, `18 March 2026`, `26 July 2027`.
⚠️ **`26 February 2026` is a constant but is NOT in `FORBIDDEN`**, because the literal already
appears in live code for a different regime: `lib/sb253.ts:43` dates CARB's Board approval of
the SB 253 initial regulation to 26 February 2026 inside a citation string. Guarding it would
fail correct code, which is the cry-wolf failure that file's own header warns leads to the
guard being deleted. Two of the three new dates could be guarded; the third could not, and
that is written down rather than papered over.
### The ESRS S2 framework row still says "(large EU)", and Omnibus I narrowed what that means

`app/supply-chain/page.tsx`, the key-frameworks table:
`{ fw: 'ESRS S2', scope: 'Value chain workers', deadline: 'FY2024 (large EU)', urgency: 'critical' }`.

⚠️ **This is the same defect that was fixed one row above it on 24 Sep 2026.** The CS3D row read
`'26 July 2029 (large companies)'`; the qualifier was removed because Directive (EU) 2026/470
raised the CS3D thresholds fivefold on headcount, so "large companies" had come to describe a
population five times narrower than when the words were written. Omnibus I also raised the CSRD
thresholds, and `(large EU)` on the ESRS S2 row is the identical construction with the identical
problem: a reader self-assessing against it is measuring themselves against a scope that moved.

**Not changed, because the replacement wording cannot be written yet.** Correcting it needs the
CSRD threshold as amended, and nobody here has read it. Verify on EUR-Lex first, then decide
between naming the threshold, naming the CSRD wave, or dropping the qualifier as the CS3D row
did. ⚠️ **Dropping it is not free**, unlike on the CS3D row: `FY2024` alone reads as applying to
every EU company, which is a wider over-claim than the one being removed.

**`urgency: 'critical'` is correct and should stay.** FY2024 is in the past, so for a wave-one
reporter this is live rather than upcoming, and it is now the only `critical` row in the table.
That is the right calibration: everything else there is a future or a customer-driven date.

**While in that file:** `SB253_FRAMEWORK_DEADLINE` in `lib/sb253.ts` is
`'10 Nov 2026 — proposed, not final'`, which contains an em-dash and is customer-facing, rendered
in the GHG export summary beside computed totals. The standing copy rule is no em-dashes in
customer-facing text. One-character fix, but it is a shared constant read by a surface outside
the supply-chain module, so it belongs to whoever next touches that export.

### A genuine nil is still not expressible, and must never be inferred from absence

**Deliberately not built with the flat-rate removal on 25 Sep 2026.** Those six categories now read as
not calculated, which is honest, but it means a category that genuinely emits nothing cannot say so.

⚠️ **THE CASE IS REAL AND IT IS NOT AN EDGE CASE.** A product with no use-phase emissions has a
Category 11 of zero within the GHG Protocol's minimum boundary. That is a **valid nil return**, not a
gap: the company evaluated the category, applied the boundary, and the answer is nothing. Today it is
indistinguishable from "we have no method" and from "nobody has filled this in".

What it needs, and why each part matters:

- **An explicit per-category customer declaration.** ⚠️ **NEVER INFERRED FROM ABSENCE.** A blank field
  and a declared zero are different facts, and the platform has made that mistake before: `isCalculated`
  for `flat_spend` read `!!d.annual_spend`, so an entered zero and an empty box were the same thing.
  Category 3 already solved its own version properly, and its comment is the model: *"'zero' means every
  stream at every location was answered and none holds any energy, which is an answer; 'withheld' means a
  stream was never answered, where a zero would assert something nobody said."* Category 15 does the same
  with `mt !== null` rather than `> 0`, so a portfolio financing no emissions is calculated at zero.
- **`calculated: true` with `mt: 0`**, which the coverage entry type already permits. Nothing in
  `lib/scope3/categoryStatus.ts` blocks it; what refuses is each method's per-category `isCalculated`.
  So this is not a schema change.
- **A distinction between nil-by-boundary and zero-computed.** These are not the same claim. A DEFRA
  waste calculation that happens to total zero is a computed figure; a company declaring Category 11 nil
  is asserting a boundary judgement, which a verifier may want to test. The minimum-boundary reasoning is
  the company's and should be recorded as theirs, the way `excluded_reason` is.
- **Consider whether a nil belongs in `categoriesInTotal`.** That count filters on
  `getCatEmissions(c.id) > 0`, so a declared nil would be counted as relevant, calculated, in the total,
  and still absent from the "categories in total" figure. Decide that before building, not after.

### `scope3_exclusions_unjustified` is now a second source for something derivable

Since 25 Sep 2026 `scope3_coverage` carries `excluded_reason` per entry, so **a verifier can count the
unjustified exclusions themselves**: entries whose `status` starts `not_relevant` and whose
`excluded_reason` is null. The stored `scope3_exclusions_unjustified` column is therefore no longer the
only way to know, and two sources for one number can disagree.

They agree today by construction: the column is written at save from `unjustifiedExclusions`, which tests
`catData[id].excluded_reason` after trimming, and the entry is written in the same pass from the same
field. But nothing holds them together, so a future change to either side moves one and not the other.
`get_verifier_scope3` discloses both, so a verifier could read `exclusions_unjustified: 2` beside three
entries with no justification and have no way to tell which is right.

**Decide, rather than leaving both:**

- **Keep it as a convenience** and add a test asserting the column equals the count derived from the
  entries, so a disagreement fails in CI rather than in front of a verifier. The sibling columns are
  already defended on this ground: the column comment argues *"a consumer reading a trend should not have
  to parse jsonb to answer 'how many'"*, which is a real argument and applies here too.
- **Or drop it from the verifier projection** and let the entries answer, keeping the column for the
  trend series alone.

⚠️ **Do not simply delete the column.** The same comment records that the relevant-count *"is a customer
judgement that cannot be reconstructed later"*, so the sibling counts are not uniformly derivable and
this one should not be removed by analogy with them. This entry is about **one** count, the unjustified
one, which now is.

### The product has no error boundaries, so any unhandled render error is a blank page

**Verified 25 Sep 2026 while reasoning about the Scope 3 unknown-id guard.** There is no error boundary
of any kind anywhere in this product:

- **No React boundary.** `componentDidCatch`, `getDerivedStateFromError`, `ErrorBoundary` and
  `react-error-boundary` return zero hits across `app/` and `lib/`.
- **No Next.js route-segment boundary.** `find app -name "error.tsx"` returns 0, and there is no
  `global-error.tsx`. `app/dashboard/scope3/` contains `page.tsx` alone, and the layout chain above it is
  `app/layout.tsx` and `app/pricing/layout.tsx`, neither of which catches anything.

So **any unhandled error thrown during render, in any dashboard, is a white screen** rather than
something the customer can act on. That is true today for every dashboard and every cause, not only for
the case that surfaced it.

**`app/dashboard/error.tsx` is the cheapest net and it covers the whole dashboard**, every module at
once, because a Next route-segment boundary catches everything below it. One file.

⚠️ **BUT A ROUTE-SEGMENT BOUNDARY STILL LOSES THE WHOLE PAGE, NOT ONE ROW.** It replaces the segment's
rendered output with the boundary's, so a customer sees a recoverable message instead of a blank screen,
which is a real improvement and is **not** the same as the page continuing to work. Per-row degradation,
where one category fails and the other fourteen render, needs a boundary **around the category list
itself** (a client component wrapping the list, or one per row), which is a different and larger change.
Decide which of the two is wanted before building either; they are not steps on the same path.

⚠️ **AND IF A BOUNDARY IS ADDED, REVISIT THE PRODUCTION NO-THROW GUARD IN `lib/scope3/categoryMethods.ts`.**
`scope3MethodFor` logs and returns `no_method` in production instead of throwing, and the ONLY reason is
that there is nothing to catch a throw: `no_method` is a meaningful product state, so returning it for a
bad id renders a bug to a customer, and discloses it to a verifier through `get_verifier_scope3`, as a
deliberate statement that ThemisIQ does not calculate that category. With a boundary in place, throwing
in production becomes the better option for the same reason it is better in dev.
  ⚠️ **Reconsider all ELEVEN render-path call sites at once, not one at a time.** They are in
`app/dashboard/scope3/page.tsx`: `getCatEmissions`, `isCalculated`, `unpricedCatIds`,
`couldNotPriceCatIds`, `unpricedReason`, `getConfidence` (four separate branches), `categoryBasis` and the
CSV builder, plus one in `lib/scope3/rowPriced.ts` that the same render reaches. Changing the guard for
some and not others would mean one bad id behaves differently depending on which surface reads it first,
which is worse than either answer applied consistently.

**Do not add a boundary as part of the Scope 3 work.** It touches every module in the dashboard and
deserves its own change with its own preview check.
### The scale palette: amber as a data value, not a warning

**Left behind deliberately by step 1 of the brand token work, 25 Sep 2026.** When
`--color-state-warn` was extracted from `--color-module-climate`, 273 uses moved and 29 stayed.
**Fourteen of those 29 are steps in an ORDERED SCALE**, which is neither module identity nor a warning:

- risk severity `med` and `unknown`, against `#A32D2D` for high:
  `app/dashboard/climate-risk/page.tsx:59, 63, 1166`, `app/dashboard/climate-risk/report/page.tsx:53, 159`
- the materiality matrix dot, "Material on one axis", between `#A32D2D` "both" and
  `--color-ink-muted` "lower priority": `app/dashboard/climate-risk/page.tsx:902, 953`,
  `app/dashboard/materiality/report/page.tsx:695, 1011`
- IPCC warming scenarios, "Current trajectory ~2.7C" and "High warming ~4.4C":
  `app/page.tsx:166`, `app/climate-risk/page.tsx:137`

⚠️ **A WARMING SCENARIO IS NOT A WARNING.** Putting these on `--color-state-warn` would be defensible
mechanically and wrong in meaning: nothing is amiss about the 2.7C pathway, it is the middle value on
an axis. Putting them on a module hue is what created the problem step 1 fixed.

**What they want is a `--color-scale-*` family**: a low, a mid and a high, with the mid at today's
`#A94E0D` so nothing moves on the day it is introduced. ⚠️ **Decide the scale's grounds before its
values**: the severity chips sit on `#FEF3E2`, the matrix dots on white, so a mid that clears AA on
one may not on the other, which is the same trap the module `-ink` companions hit.

⚠️ **This must land before the palette swap, or the scale steps inherit whatever Climate Risk becomes.**
Under the intended colourway that is `#004AAD`, a deep blue, which would render "medium risk" and
"current trajectory" in the same blue as the module's identity.

### `-error`, `-info` and `-ok` are declared and almost nothing reads them

Step 1 declared `--color-state-error` `#B91C1C`, `--color-state-info` `#0C447C` and `--color-state-ok`
`#0F6E56` with their washes, and mirrored them in `lib/brand.ts`. **The extraction was the whole of it:
roughly a hundred call sites still carry those three as hardcoded hex.**

That is not a defect today, because the tokens hold exactly the values the literals hold. It becomes one
the moment anybody changes a token and assumes the literals followed. The migration is mechanical and
much easier than the warn one was, because the meanings do not collide: `#B91C1C` is a failure
everywhere it appears, `#0F6E56` a success, `#0C447C` a neutral notice. There is no
identity-versus-state ambiguity to resolve, only volume.

⚠️ **One caveat before a blanket replacement.** `#0F6E56` and `#0C447C` are also used as
CONFIDENCE-PILL colours in the Scope 3 calculator (`confidenceConfig`: `high` is `#0F6E56`, `medium` and
`exiobase_spend` are `#0C447C`), which is a data-quality scale rather than a state. Same distinction as
the scale entry above. Settle `--color-scale-*` first, then do this pass, or those pills will move to
state tokens for want of a better home.

### `app/api/assessment/submit/route.ts:29` hardcodes the warning colour in an email

`const URGENCY_COLOR = { critical: '#B91C1C', high: '#A94E0D', medium: '#0C447C', monitor: '${INK_MUTED}' }`.

⚠️ **It is an email, so it cannot read a CSS token** — that is exactly what `lib/brand.ts` exists for, and
the same line already interpolates `INK_MUTED` from there, so the import is present and three of the four
values are typed out beside it. It should read `STATE_ERROR`, `STATE_WARN` and `STATE_INFO`.

Small, and worth doing with the `-error`/`-info`/`-ok` pass rather than alone: `lib/brand.test.ts` checks
that the token layer and `lib/brand.ts` agree, but **nothing checks that a call site reads the constant
rather than retyping its value**, which is how this line came to hold three literals in the first place.
### The retired brand violet #7425e3 has 32 live uses, and is deliberately not an accent token

**Step 3 of the brand token work, 25 Sep 2026, declared `--color-accent-*` with six members and left the
violet out.** Adopting it as a named accent would make a retired colour permanent, and that decision
belongs to the palette swap, when there is a replacement to put in its place.

CLAUDE.md already records the purple/blue/lime gradient as retired, surviving "as flat category colours
in charts and module accents, and in the transactional email templates". **It is more widespread than
that reads: 32 live uses across 22 files.** Six are email routes, where `lib/brand.ts` is the only
palette and no test renders one: `api/survey-invite`, `api/supplier-invite`, `api/impact-invite`,
`api/order/quote-request`, `api/webhooks/stripe`, `api/assessment/submit`. The rest are in `app/page.tsx`,
`app/dashboard/page.tsx`, the CBAM disclosures and `DisclosureQuestion.tsx`, SBTi, cyber, climate-risk and
its report, trends, reports, materiality, `lib/ghg/engine.ts` and `lib/supply-chain/templates.ts`.

**Three of those sites were in step 3's scope and were left as literals**, because the family has no
member for them: `lib/supply-chain/templates.ts:57` (Labour & Human Rights), `:173` (Risk
Identification), `:209` (the custom questionnaire); `app/trust/page.tsx:24, 30`;
`app/dashboard/supply-chain/portal/page.tsx:29` (the EcoVadis swatch).

⚠️ **Decide at the swap, not before, and decide it once.** Either the violet becomes
`--color-accent-violet` with its current value, or the incoming colourway supplies a sixth accent hue and
all 32 uses move to it. Doing it per-file is how it came to be in 22 of them.

### Accent, state and module members still carrying literals

Step 3 pointed seven sites at `--color-accent-*` and left the rest of each set on hand-typed hex. **This
is not a defect today** — every literal holds exactly the value its token holds — and it becomes one the
moment a token moves and the literals do not follow.

- **Framework chips**, `lib/ghg/engine.ts`: `sb253` `#B91C1C`/`#FCEBEB`, `cdp` `#0C447C`/`#E6F1FB`,
  `gri` `#0F6E56`/`#E1F5EE`, `ifrs` `#555553`/`#f8f7f5`. All four map onto existing accent members.
- **Questionnaire sections**, `lib/supply-chain/templates.ts`: ten of the thirteen, on green, blue, red
  and the violet.
- **Trust page cards**, `app/trust/page.tsx`: five of six, on green, blue, red and the violet twice.
- **Portal swatches**, `app/dashboard/supply-chain/portal/page.tsx`: four of five.
- **`app/api/assessment/submit/route.ts`**: `URGENCY_TEXT.critical` `#501313` and `.high` `#633806`,
  darker-still text variants used where the pill supplies its own background. **No token holds either**,
  and they are the only hand-typed colours left in that file. If they are wanted long term they want
  naming; if they are not, the pill can take the accent colour on the accent wash.

⚠️ **THE LESSON FROM WRITING THAT ROUTE, WHICH IS THE ARGUMENT FOR FINISHING THIS.** Three of the four
washes in its severity maps were assigned a plausibly-named constant that held a **different value**, one
after another, and each was caught only by printing both and comparing:

| Key | The obvious constant | Its value | What was actually there |
|---|---|---|---|
| `high` | `STATE_WARN_WASH` | `#FBE7DD` | `#FEF3E2` = `ACCENT.amber.wash` |
| `monitor` | `SUNKEN` | `#EDEFF0` | `#f8f7f5` = `ACCENT.neutral.wash` |
| `critical` | `STATE_ERROR_WASH` | `#FEE5E6` | `#FCEBEB` = `ACCENT.red.wash` |

Only `medium` matched its state token first time. **Nothing would have failed a test**: `lib/brand.test.ts`
checks that the token layer and `lib/brand.ts` agree with each other, not that a call site picked the
constant matching the value it replaced. A name that fits is not a value that fits. Whoever does the
remaining migration should diff computed values, not read names.
---

## ✅ CLEARED 25 Sep 2026 — was: BLOCKER for step 6, two homepage warming figures fail large-text AA

Logged 25 Sep 2026, during step 4. **Step 6, the swap itself, cannot ship until this is resolved.** It is a
blocker rather than an open item because the failure lands on the homepage, at 32px, in text.

**Cleared by reconciling scales C and D on one tone.** Both trio surfaces now draw all three pathways in
`--color-ink-2` on `--color-paper`, so no module hue reaches a warming figure and the swap cannot make one
unreadable. Confirmed arithmetic: the two failures were CBAM `#A9D2D7` at **1.63:1** and Cyber `#67B8C1`
at **2.28:1** on white, against large-text AA's 3.0:1 at 28px. Climate `#004AAD` was never one of them —
it measures 8.13:1. **The decision recorded below turned out to be the fix, and it was a correctness fix
rather than a consistency one**; see the comment at `app/climate-risk/page.tsx:134`. Left here as the
record of what blocked what.

**The gate was:** `app/page.tsx:166` rendered the three IPCC pathways in three MODULE tones —
`--color-module-cbam`, `--color-module-climate` and `--color-module-cyber`. Under the incoming colourway,
**two of those three fail large-text AA (3.0:1) at the 28px those warming figures render at**, in display
text, on the homepage.

Step 4 left that line alone on purpose: pointing three module identities at `--color-scale-*` would have
been a third answer rather than a reconciliation, and its rows are `tone:`, not `color:`, feeding a shared
card component. **Leaving it alone is fine until step 6 and not after**, because step 6 is what moves the
module values.

Recompute the three ratios against the incoming values before touching the file; do not trust this note's
arithmetic, which was done against the values of 25 Sep 2026. What unblocks it is the decision recorded
under *Is an IPCC pathway a value on a scale, or a module identity?* below — the fix is not "darken two
tones", because that leaves the same three scenarios drawn in two palettes.

---

## Does the platform have ONE worst colour, or two?

Logged 25 Sep 2026, during step 4, and this is why `--color-scale-high` was not declared.

Two values are in use for the top of a scale: `#B91C1C` (risk severity `SEV.high`, persistence
`persistent`, the `-error` state) and `#A32D2D` (the materiality matrix's "material on both", in both
`app/dashboard/climate-risk/page.tsx` and `app/dashboard/materiality/report/page.tsx`).

**They are 1.09:1 apart. That is one colour with two names** — no viewer can tell them apart, and no
methodology distinction is recorded anywhere for the difference.

⚠️ **THERE IS NO NO-OP HERE, WHICH IS THE WHOLE DIFFICULTY.** Declaring `--color-scale-high` as either value
renames one scale's high arm and MOVES the other's. Step 4 declared only `mid` for that reason: every one of
its thirteen migrations resolved to a byte-identical value, and `high` cannot. Someone has to choose, and
the choice should be made as a decision about the palette rather than discovered as a diff.

Note this is separable from the blocker above and from `--color-scale-low`, which needs no decision at all:
every scale's low arm is already `--color-ink-muted`.

---

## `unknown` is not a rung on the scale, and `--color-scale-gap-wash` is what keeps it off one

Logged 25 Sep 2026, during step 4. **Recorded as a decision already taken**, so that a future tidy-up does
not undo it as duplication.

The risk severity N/A band borrows the scale mid's HUE — it is `--color-scale-mid` on
`--color-scale-gap-wash` `#FDF6EC` with a `#EAD9BE` border — while MED is the same colour on
`--color-scale-mid-wash` `#FEF3E2`. Two washes 1.01:1 apart, holding two different claims.

That looks like exactly the kind of near-duplicate a cleanup collapses. It must not be collapsed:

- **A data gap is scored `null`, never `0`.** The comment beside `SEV` in
  `app/dashboard/climate-risk/page.tsx` says the band must never read as an assessed finding of no
  exposure, and the report page's `NOT ASSESSED` chip repeats it. "We did not assess this" and "we assessed
  this as middling" are different statements to a verifier.
- **The ground and the border are the ONLY things separating them**, because the foreground is shared. Fold
  `#FDF6EC` into `#FEF3E2` and a data gap becomes a medium finding on screen with no other signal left.

So `unknown` gets a ground of its own but deliberately no colour of its own: giving it a fourth hue would
imply a fourth severity, which is the opposite error. If a rung is ever added between LOW and MED, it takes
`--color-scale-*`; the gap wash stays out of that sequence.

---

## ✅ RESOLVED 25 Sep 2026 — was: is an IPCC pathway a value on a scale, or a module identity?

**Answered: NEITHER.** The trio is not a severity scale and not a module identity, so it takes no colour
that means anything — one tone for all three, at both sites, with the ordering left in the figure and the
label where it was already stated twice per card. The deciding argument was not consistency: a cool-to-hot
or green-to-red ramp asserts that 1.8°C is the good end, while `app/dashboard/climate-risk/report/page.tsx`
tells the same customer a policy-driven exposure is "most acute under the Paris-aligned pathway" and that
"physical and transition risk therefore move in opposite directions across the trio". Warming is ordered;
risk is not ordered across it.

⚠️ **THIS DID NOT FORCE "ONE WORST COLOUR OR TWO", AND THE TWO COME APART CLEANLY.** `--color-scale-high`
is still undeclared and still needed by the severity scales A, B and E, where a high arm genuinely means
worst. The trio needed no `high` at all, so the swap unblocked without settling it. Bundling them is how C
and D came to disagree in the first place.

Original entry, for the record. Logged 25 Sep 2026, during step 4. This is the decision that unblocks the step-6 blocker above, and it is
recorded separately because it outlives that blocker: it is a question about what the palette MEANS, and
answering it "darken the two failing tones" would ship a passing contrast ratio and leave the platform
drawing one set of scenarios two ways.

Two surfaces present the same three pathways, and they agree on nothing:

| Scenario | `app/climate-risk/page.tsx:137` (scale D) | `app/page.tsx:166` (scale C) |
|---|---|---|
| ~1.8 &deg;C SSP1-2.6 | `#0F6E56` green on `#E1F5EE` | `--color-module-cbam` |
| ~2.7 &deg;C SSP2-4.5 | `#0C447C` blue on `#E6F1FB` | `--color-module-climate` |
| ~4.4 &deg;C SSP5-8.5 | `--color-scale-mid` on its wash | `--color-module-cyber` |

Scale D reads as an ordered axis — good, caution, bad — and step 4 migrated its high arm accordingly. Scale
C reads as three unrelated products, because that is literally what its tones name.

**RESOLVE IT AS ONE DECISION, NOT TWO.** Either scale C becomes an ordered axis, or scale D becomes
identity-coloured, and either way both files change in the same pass. Deciding them one at a time is how
they came to disagree: each is locally defensible and only the pair is wrong.

Worth noting which way the evidence points. A warming pathway is ordered by construction, the customer is
being shown that ordering, and nothing about SSP2-4.5 belongs to the Climate Risk module any more than
SSP5-8.5 belongs to Cyber — that mapping is arbitrary, and arbitrary colour on a page about severity reads
as meaning that is not there. But this is a brand decision, not a code one, so it is recorded rather than
taken.

---

## Step 7 cannot recompute the 96 ratio comments against white, because they do not all quote the same ground

Logged 25 Sep 2026, while writing `lib/tokenContrast.test.ts`. **This changes what step 7 is**, from a
mechanical recompute into a per-comment decision.

Three of the four `--color-state-*` comments were already wrong when the contrast test was written, and
the fourth is wrong in a more interesting way:

| Token | Comment says | On `--color-paper` | On its own wash |
|---|---|---|---|
| `--color-state-warn` | 5.6:1 | **5.55** ✓ | 4.65 |
| `--color-state-error` | 6.1:1 | **6.47** | 5.41 |
| `--color-state-info` | 8.6:1 | 9.84 | **8.60** |
| `--color-state-ok` | 5.0:1 | **6.20** | 5.46 |

⚠️ **`state-info`'s "8.6" IS ITS RATIO ON ITS OWN WASH, TO TWO DECIMAL PLACES.** That is not a
coincidence and it is not a stale number: whoever wrote it measured a different ground from the three
beside it. So the 96 comments are a mixed population — some against white, at least one against its own
wash, and an unknown number against neither — and "recompute everything against white" would replace
three wrong numbers with four, silently converting a correct measurement into an incorrect one.

**What step 7 has to do instead.** Each comment states its ground explicitly, or drops the number. A bare
`5.6:1` is unfalsifiable by inspection, which is how three of these survived; `5.55:1 on --color-paper` can
be checked by anyone, and can be asserted. The step-4 SCALE block and `lib/brand.ts` already name their
grounds by token for this reason, and an earlier draft of that comment mislabelled `#f8f7f5` as "paper"
(it is `--color-accent-neutral-wash`) — caught only because the test names grounds by token and the two
then disagreed. **A list of bare hex cannot catch a wrong ground; a token name can.**

Worth considering in step 7: once every comment names its ground, `lib/tokenContrast.test.ts` can assert
the comments themselves, which is the only thing that stops them going stale a third time.

---

## `--color-ink-muted` on `--color-module-ai-wash` is the tightest pairing in the layer

Logged 25 Sep 2026. **Step 6 should know this before it moves any value.**

Measured across every body-text-on-wash combination the token layer permits — three text colours against
twenty-one washes, sixty-three pairings:

| | On `--color-paper` | Worst wash |
|---|---|---|
| `--color-ink` `#151A1D` | 17.54 | 14.67 |
| `--color-ink-2` `#3B474D` | 9.57 | 8.00 |
| `--color-ink-muted` `#5A686E` | 5.77 | **4.82** on `--color-module-ai-wash` `#DEEFE3` |

**0.32 of headroom.** `--color-ink-muted` is the labels-and-captions colour and it lands on every wash in
the layer, so the constraint is not "the AI Governance wash" specifically — it is that ANY wash darkened
by roughly 3% puts caption text below AA, and the AI wash is simply the one already closest. Second
tightest is the `#FEE5E6` pair used by both `--color-state-error-wash` and `--color-module-cyber-wash`.

`lib/tokenContrast.test.ts` now asserts all sixty-three, so this fires rather than shipping. It is logged
anyway because a test tells you *after* you have chosen a value, and step 6 is choosing twenty of them.

---

## `--color-ink*` and `*-ink` are different ideas sharing a word

Logged 25 Sep 2026, while writing `lib/tokenContrast.test.ts`. **Not a defect. A naming hazard, recorded
before step 6 declares six more tokens in the second form.**

| Form | Means | Members |
|---|---|---|
| `--color-ink`, `--color-ink-2`, `--color-ink-muted` | **body text**, the prefix form | 3, today |
| `--color-<x>-ink` | **`<x>`'s text companion**: the value to set when `<x>`'s identity colour is too light to read, the suffix form | 0 today, 6 planned |

The two are unrelated. One is a text hierarchy; the other is a per-colour escape hatch. They also need
different grounds: the prefix family has no "own" wash and lands on all twenty-one, while a companion has
exactly one by construction.

⚠️ **`--color-ink` ITSELF ENDS IN `-ink`**, so a naive `/-ink$/` sweeps the primary text colour into the
companion family and measures it against a `--color--wash` that does not exist. `lib/tokenContrast.test.ts`
uses `/^--color-(.+)-ink$/` for companions, requiring a non-empty prefix, and `/^--color-ink(-[a-z0-9-]+)?$/`
for the text family. Note `-ink-2` and `-ink-muted` do not end in `-ink` at all, so only the one token
collides — which is exactly the kind of single exception a regex written quickly gets wrong.

Renaming is NOT proposed: `-ink` is the right word in both places and both are already in the tree or
confirmed. This entry exists so the collision is known rather than rediscovered, and so nobody "tidies"
the two regexes into one.

---

## STEP 6 DECISION: Climate Risk `#004AAD` would be indistinguishable from `--color-state-info` `#0C447C`

Logged 25 Sep 2026, on closing the scale C/D arithmetic. **A genuine collision, and it needs deciding
inside step 6 rather than after it.**

| | Hue | Lightness | Apart |
|---|---|---|---|
| `--color-module-climate` target `#004AAD` | 214.3° | 33.9% | |
| `--color-state-info` `#0C447C` | 210.0° | 26.7° | **4.3° of hue, 1.21:1** |

Same hue, near-same lightness. This is the `#B91C1C` / `#A32D2D` pattern again, in blue: two names for
one colour, where no reader can tell which they are looking at.

**Why it matters more than an aesthetic clash.** `--color-state-info`'s own comment reads *"neutral
notice, activity data"*. After the swap, a neutral notice and the Climate Risk module's identity render in
the same blue, so a module accent and a system message become visually interchangeable — and the module
whose identity it is happens to be the one whose surfaces carry the most state chips.

⚠️ **AND `#0C447C` IS WHERE SCALE D'S MIDDLE CARD USED TO BE.** `app/climate-risk/page.tsx:136` drew
"Current trajectory ~2.7°C" in exactly that value until 25 Sep 2026. That use is gone — the trio is one
tone now — but it is worth knowing the collision was already latent on the page most affected by it.

**Three ways out, and this is the one decision, not three:** move the module (`#004AAD` is a given from the
colourway, so probably not); move the state (`--color-state-info` is not in the colourway and could darken
or shift hue, and ~100 literals hold its value — see the accent/state literal entry above); or accept it
and rule that the two never appear on the same surface, which is unenforceable and therefore not a
decision. **Deliberately not a collision:** Climate `#004AAD` against Deals `#BEC4ED` at 4.77:1, same hue
family but separated by lightness.

---

## STEP 6 DECISION: CBAM `#A9D2D7` and Cyber `#67B8C1` are 0.5° of hue and 1.40:1 apart

Logged 25 Sep 2026, on closing the scale C/D arithmetic. The second genuine collision in the target set,
and this one is **between two modules**, which is worse than a module against a state: module colour exists
to answer "which product am I in", and these two cannot answer it.

| | Hue | Lightness |
|---|---|---|
| `--color-module-cbam` target `#A9D2D7` | 186.5° | 75.3% |
| `--color-module-cyber` target `#67B8C1` | 186.0° | 58.0% |

Half a degree of hue. Both are also in the same family as GHG `#0097B2` (189.1°), so **three of the eight
modules sit inside 3° of hue** — separated only by lightness, at 3.46 / 2.28 / 1.63 on white, and all three
below body AA.

⚠️ **THE HUE-SEPARATION CONSTRAINT IN `lib/ghg/engine.ts:1508-1526` ALREADY EXISTS FOR THIS**, and step 3
carried it into the accent family's comment. The module family has no such guard, which is why this was
found by measuring rather than by a test. Whatever is decided, the fix is worth asserting: a test that
fails when two module tokens land within N degrees of hue and under 1.5:1 would have caught it before the
values were chosen.

**Note the detection method, because contrast ratio alone misses this class.** Contrast measures lightness
only: `#B91C1C` against `#0F6E56` scans as 1.04:1 while being red against green. A collision is same hue
AND same lightness, so the test is hue within 20° *and* contrast under 1.5:1. An earlier pass of this
analysis used contrast alone and produced twenty-two "collisions", of which two were real.

---

## Three chart series and five tick marks are module hues that were never about modules

Logged 25 Sep 2026, found while surveying what module colour actually does in the product before the palette
swap. **Not part of the swap. Both are the step-3 accent problem in places step 3 did not look**, and both
become visible failures the moment module values move, which is why they are logged now.

**The chart series**, `app/dashboard/ghg/page.tsx:2285-2289`. Three rows of an emissions breakdown:

| Row | Colour | What it means |
|---|---|---|
| Heating & fuel | `--color-module-deals` | Scope 1 stationary |
| Vehicles | `--color-module-cbam` | Scope 1 mobile |
| Scope 2 (electricity) | `--color-module-ai` | Scope 2, and it is `bold: true` |

None is about Deals, CBAM or AI Governance. They are **categories in one chart**, which is what
`--color-accent-*` is for — declared in step 3 with the hue-separation constraint carried over from
`lib/ghg/engine.ts:1508-1526` precisely so a set of category colours stays mutually distinguishable. These
three are currently distinguishable **by accident**: they inherit three modules' hues, and under the 2026
colourway CBAM and Cyber land 0.5° apart, so the accident stops holding.

**The tick marks**, five of them, all `--color-module-ai`:
`app/climate-ghg/page.tsx:181`, `:255`, `:328`, `app/people/page.tsx:148`, `app/supply-chain/page.tsx:122`.
Each is a `✓` marking an included feature. It means **"included"**, which is `--color-state-ok` — the token
whose comment reads *"complete, primary data, passed"*. A tick is also a meaningful graphic under WCAG
1.4.11, so it needs 3:1; `--color-module-ai` `#F47068` reaches **2.85:1** under the colourway and fails.

Both are one-line-per-site changes and neither needs a decision. They are logged rather than done because
they are unrelated to the swap and would have made its diff harder to read.

---

## STEP 6 DECISION: the AI Governance companion collides with `--color-state-error`

Logged 25 Sep 2026. **This is the measurement that confirms `IDENTITY_ONLY` was right**, and it should be
read before anyone revisits that decision.

`lib/tokenContrast.test.ts`'s `IDENTITY_ONLY` comment has said since step 5 that AI Governance is off text
because *"coral darkened to an AA-passing companion is indistinguishable from `--color-state-error`'s red"*.
That was an inspection claim. It is now measured:

| | | Hue apart | Ratio |
|---|---|---|---|
| `ai-ink` `#DA1B10` (derived to clear 4.5:1) | `--color-state-error` `#B91C1C` | 3.3° | **1.28:1** |

So a companion for AI Governance would give that module a text and figure colour **indistinguishable from
the colour the platform uses for "failed, invalid, refused"**. A red figure on an AI Governance summary
block would read as a failure. Declining the companion is the correct answer rather than a concession, and
the cost of declining it is recorded in `docs/colourway-2026.md`: the module has no accent in the product
and its `[data-module]` block must set no `--tq-mod`, so the brand fallback fires.

**People & Workforce is the closer call and went the same way.** Its companion `#866B00` is legible and
collides with nothing — hue 48° is unoccupied — but it is olive, 3.85:1 from `#FFDE59`, so it does not read
as the module either. The decision was that "People has no accent" is a better sentence than "People's
colour is olive". ⚠️ **If that is ever revisited, `#866B00` is the value and it works**; what must not
happen is reverting it by leaving `--tq-mod` set to a value nobody can read, which the assertion in
`lib/tokenContrast.test.ts` now prevents.

**Related and already logged above:** `--color-module-climate` `#004AAD` against `--color-state-info`
`#0C447C` at 1.21:1. That one survives into the companion scheme unchanged, because Climate needs no
companion — its fill *is* its text colour, so the collision is between a module identity and a state at
full strength. Two of the three genuine collisions in the target set are therefore module-against-state,
which suggests the state family, not the module family, is where the swap has the freedom to move.

---

## Retired from app/page.tsx: why the climate resilience showcase was a section and not a band

Moved here 25 Sep 2026 when the homepage was rebuilt and the Flagship section did not survive. **Kept
because it records a measured result, not a preference.** The comment read, in the file:

> ⚠️ A SECTION ON THE PAGE, NOT A BAND. It was a full-bleed `#0d0d0d` block. A dark band and a tinted
> band both read as "marketing"; a 2px ink rule and a heading read as "next section", which is what this
> is. The change is also forced, not stylistic: the scenario ramp below needs white beneath it —
> `var(--color-module-climate)` measures **4.29:1 on the teal band**, under AA.

Two things worth carrying forward:

1. **The measured part.** A module hue on a tinted band loses roughly a third of its ratio against the
   same hue on paper: `--color-module-climate` `#A94E0D` is 5.55:1 on `--color-paper` and 4.29:1 on the
   teal band. Any future band that carries module-coloured text needs its own measurement; the paper
   figure does not transfer. Under the 2026 colourway this gets much worse — see the fill-versus-text
   rule in `docs/colourway-2026.md`.
2. **The judgement part**, which is still the platform's position: a full-bleed dark or tinted block
   reads as an advertisement, and a rule plus a heading reads as the next section. That is why the
   rebuilt homepage puts its only two bands at the top and the bottom, where a page IS advertising
   itself, and keeps the body of the page on paper.

The section's content — the IPCC trio and the six-row "Documented for assurance" list — is not preserved
here. The trio survives at `app/climate-risk/page.tsx:134`, reconciled to one tone on 25 Sep 2026.

---

## ✅ DECIDED 25 Sep 2026 — was: the four use-case pack entry points lost their only discovery surface

Logged 25 Sep 2026, in the homepage rebuild. **`lib/packEntryPoints.ts` is not orphaned** — the four
`/get-started/*` routes still redirect through `PACK_SLUG_MODULES`, so every existing link still works:

| Route | Preselects | Homepage card, until 25 Sep 2026 |
|---|---|---|
| `/get-started/supplier` | `ghg,supply` | Supplier Readiness — "A customer is asking" |
| `/get-started/climate` | `ghg,risk` | Climate Readiness — "Your bank is asking" |
| `/get-started/foundation` | `ghg,people,risk` | ESG Foundation — "Your board wants it" |
| `/get-started/investor` | `ghg,risk,supply,deals` | Investor ESG — "Your investor requires it" |

What was lost is **discovery**, not the mechanism: the four URLs now work only for someone who already
has one. `HomePricing` links to `/pricing` with nothing preselected, so a visitor who arrives because a
customer is asking has to assemble `ghg,supply` themselves in the configurator.

**Restoring it is small.** The cards were four `<a>` elements in a grid reading `PACK_SLUG_MODULES`, and
the natural home is beside the three wider cards under the module grid — same tinted treatment, same
eyebrow-heading-description-link shape, so no new component. Two things would need fixing rather than
copying: the old cards carried a per-card accent colour, one of which was the **retired violet
`#7425e3`** (its last use on the page, gone with the section), so a restored set takes
`--color-accent-*`; and each listed its modules as plain text (`'GHG Inventory'`, `'Supply Chain risk
register'`) beside a `PACK_SLUG_MODULES` value, which is the same fact written twice and free to drift.
`MODULES` in `lib/pricing.ts` has the canonical names, so the list should derive from the slug's module
ids rather than be typed beside them.

**DECIDED: documented as legacy link targets, cards NOT restored.** `/assess` answers "where do I start"
better than four cards do, by asking about the visitor's situation instead of making them pick from four
guesses about it. All four route files and `lib/packEntryPoints.ts` now carry a note saying nothing links
to them by design, so neither the routes nor the constant reads as dead code. The restoration notes below
are kept in case the decision is revisited; they are not a to-do.

Original entry. ⚠️ **The decision is whether the homepage should offer a multi-module starting point at all**, not
whether to paste four cards back. The rebuilt page sends every visitor to `/assess` — which answers the
same question better, by asking about their situation instead of making them pick a card. If that is the
intent, the four routes are legacy link targets and should be documented as such; if it is not, the cards
come back.

---

## The homepage framework chip row is nineteen hand-typed strings

Logged 25 Sep 2026. **Not a defect** — every chip was verified against the tree in that pass, and two
were removed for having no evidence (`SEC Climate Rule`, nowhere in `lib/` or `app/`; `RE100`, one
pricing bullet). It becomes one the next time a framework is added or renamed in `lib/` and the row is
not touched.

Nine of the nineteen are entries in `OBLIGATIONS` (`lib/obligations.ts`) and could be derived from it:
SB 253, SB 261, IFRS S2, CDP, EcoVadis, EU AI Act, EU Pay Transparency, NIS2, DORA. The other ten are
standards the engine or a module cites rather than obligations it scores — ESRS/CSRD, GHG Protocol, SBTi,
TCFD, GRI, ISO 27001, ISO 42001, NIST AI RMF, NIST CSF, SASB — and `OBLIGATIONS` is the wrong home for
them, because an obligation there carries a deadline, a driver and a module mapping.

So the fix is not "derive the row". It is to decide whether a **standard cited** deserves a registry of
its own alongside a **rule we score**, at which point the row derives from both and a new module's
standards appear on the homepage by construction. That is a bigger change than the rebuild and is why
this is logged rather than done: it changes what a chip is.

⚠️ **Whatever happens, no count goes back on that section.** The row replaced a stat reading "30+
Frameworks covered", against which `ALL_OBLIGATION_IDS` has sixteen, the row has nineteen, and the GHG
engine maps five to GWP sets.

---

## Fifteen `UNVERIFIED` markers remain in `lib/sources.ts`, and a dead source link is a stale-date-class defect

Logged 25 Sep 2026, after the DORA link turned out to be a 404. **These URLs render to a customer as
"Official source ↗" on `app/frameworks/page.tsx`, beside a claim about what a regulation requires.** A
reader who clicks one and lands on a 404 has been given the same thing as a stale date: a checkable claim
that turns out false, on the surface whose whole purpose is to be checkable.

### What the DORA case showed

`DORA_COMMISSION_URL` pointed at `finance.ec.europa.eu/…/implementing-and-delegated-acts/digital-operational-resilience-act-dora_en`.
It **404s**, and so does the obvious successor path. It had been marked `UNVERIFIED: carried over from
app/frameworks/page.tsx, not opened` since the constant was created. Nothing failed. `tsc` passed, the
tests passed, the build passed, and the card rendered a link to nothing — the same failure mode as a
retired model string, which is also only a string.

`EFRAG_HOME_URL` was a second, quieter case: `https://www.efrag.org` returns **403** where
`https://www.efrag.org/en` returns 200, and four entries depend on that one constant.

### ⚠️ Twelve of the fourteen were fetched on 25 Sep 2026 and returned 200 — AND THE MARKERS STILL STAND

This is the part worth getting right. Confirmed to resolve: `GHG_PROTOCOL_URL`, `IFRS_S2_STANDARD_URL`,
`TCFD_URL`, `CDP_URL`, `SBTI_URL`, `CS3D_COMMISSION_URL`, `EU_AI_ACT_URL`, `NIS2_COMMISSION_URL`,
`NIST_AI_RMF_URL`, `NIST_CSF_URL`, `ECOVADIS_URL`, `CA_PAY_DATA_URL`.

**A 200 does not discharge the marker, because the marker does not say "not fetched" — it says NOT
OPENED.** Those are different claims:

| | What it proves | What it misses |
|---|---|---|
| A 200 | the URL resolves | nothing about whether the page is the page the comment claims |
| Opening it | the content matches the comment's stated intent | — |

So the twelve are **live, and still unverified**. A link that resolves to the wrong page is worse than a
404: a 404 tells the reader something is broken, while a live page about the wrong regulation reads as
confirmation. Several of these comments assert an *intent* a fetch cannot check — `CS3D_COMMISSION_URL`
is described as the page the thresholds framing rests on, and `EU_AI_ACT_URL`'s comment mentions "two
application dates". Whether those pages still say that needs a human.

**Two were not checked at all:** `SBTI_NET_ZERO_STANDARD_URL` (its own comment says it has no rendered
call site, so it is the lowest priority of the fifteen) and `EPA_EGRID_POWER_PROFILER_URL`.

The fifteenth marker is on the file header at `lib/sources.ts:25` and is a general statement about the
whole file rather than one constant.

### The method that worked — use it before concluding a link is dead

1. **Request with a full browser header set before believing a failure.** A bare `curl` gets 403 from
   sites that are perfectly alive. `TCFD_URL` and `EFRAG_HOME_URL` both went **403 → 200** on adding a
   real `User-Agent`, `Accept: text/html,application/xhtml+xml` and `Accept-Language`. Concluding from
   the first 403 would have replaced two working links.
2. **`iso.org` 403s regardless, and that is not evidence of anything.** It blocks automated clients at
   the edge with or without headers. Every ISO link in the file is therefore **form-verified, not
   fetch-verified** — see `ISO_27001_URL`, which a human opened on 25 Sep 2026, confirming that
   `/standard/<catalogue-id>.html` is ISO's convention and that the `/standard/<number>` vanity path also
   works.
3. **Check the obvious successor path too, before picking a replacement.** DORA's `…-dora_en` 404'd and
   so did `…-act_en`; assuming the first was a typo would have produced a second dead link.
4. **Prefer a permanent identifier to a topic page.** The two replacements chosen were EUR-Lex ELI URIs
   (`/eli/reg/2022/2554/oj` for DORA, `/eli/reg/2023/956/oj` for CBAM): stable by design, the legal text
   rather than a supervisor's summary, and consistent with how `lib/cs3d.ts` cites directives. **A
   Commission topic page is exactly the kind of link that moves** — one just did.
5. **Follow redirects and read where you land.** `-L` plus `%{redirect_url}` catches a link that still
   returns 200 by way of a generic landing page, which is a silent failure a bare status check misses.

### Worth considering rather than a one-off sweep

Every URL in that file is a string, so nothing in the build can see it break — the same class as a
retired model string. A test cannot fetch (no network in CI, and it would be flaky), but it **can** assert
the shape: that every `*_URL` is `https`, that no two constants hold the same value under different names,
and that none still carries an `UNVERIFIED` marker once cleared. That last one turns the marker from a
comment into something with teeth.

---

## "ten ESRS topics" is stated in five places and derived from none

Logged 25 Sep 2026, while rebuilding `app/climate-risk/page.tsx` to the shared module shape. **Not a
defect found, a figure not verifiable from `lib/`** — which is the condition CLAUDE.md's no-typed-figures
rule exists for.

The claim appears in `lib/pricing.ts:31` and `:164` (prose in the module-split comment),
`app/dashboard/materiality/report/page.tsx:652`, `app/materiality/page.tsx:116`, and the Climate Risk
pricing feature list. All five say **ten**, so nothing contradicts anything today.

⚠️ **The count comes from the DATABASE, not from code.** `lib/materiality.ts` has no ESRS topic array;
`esrs_topic` is a column, and the topics live in `mr_esrs_subtopics` and its siblings. So no test can
check the five statements against a constant, and a topic added or retired in the DB makes all five stale
at once with nothing failing. That is the same shape as `mr_jurisdictions.active` being a dormant column:
the code and the database can disagree silently.

**Two ways to fix it, and they are different sizes.** Export a `ESRS_TOPIC_COUNT` from `lib/materiality.ts`
with its own as-of date and a note saying where the real list lives, and have the five sites read it — 
cheap, and it makes them consistent by construction rather than by luck. Or derive the count at build
time from the DB, which is the honest version and much more work. The cheap one is worth doing because it
turns five independent claims into one.

Not fixed in this pass because the Climate Risk pricing feature list was carried over verbatim
deliberately: it holds the hard-won "screening, NOT materiality" wording, and editing it in the same
change as a layout rebuild is how that word would get lost.

---

## GHG has no sample output, and it is the largest module

Logged 26 Sep 2026, rebuilding `app/climate-ghg/page.tsx` to the shared module shape. **Section 6, "What
the module produces", is absent from that page** — deliberately, because `ModuleOutputs` was built so a
module with nothing to show omits the section rather than rendering a "coming soon" tile.

What exists and why none of it fills the slot:

| | Why not |
|---|---|
| `public/samples/` | Two Climate Risk PDFs only. No GHG artefact. |
| `lib/assurancePdf.ts` | Generates the pack **per inventory**. Needs data; nothing to open cold. |
| `/calculate-emissions` | A calculator, not a report. |

So the largest module, carrying the most corrected copy on the site, is the one page that cannot show its
output — while Climate Risk shows two reports and CBAM a worked preview.

**The fix, and it is worth more than a marketing asset.** Generate the assurance package for the same
fictional company as the Climate Risk samples (`magnetic-industrial-*`) and put it in `public/samples/`.
Two reasons beyond the page:

1. **It exercises `lib/assurancePdf.ts` end to end**, which today is covered by
   `lib/assurancePdf.exclusion.test.ts` and `lib/materiality/boardReport.test.ts` asserting structure —
   and both files' own comments say they prove the document BUILDS, not that anything in it is readable.
   A generated artefact someone looks at is the check neither test can be.
2. **It would be the strongest artefact on the site.** The page's claim is that every figure carries its
   method, its factor edition and its source document. A pack a prospect can open is that claim
   demonstrated rather than asserted.

⚠️ **One thing to get right if this is built:** the same fictional entity as the existing samples, so a
prospect reading the resilience report and the assurance pack sees one company. Two fictional companies
across three samples would read as stock content.

---

## The retired violet is still on the supplier portal's Labour & Human Rights section

Logged 26 Sep 2026, rebuilding `app/supply-chain/page.tsx`. **Deliberately not fixed in that commit:**
widening a page rebuild to reach the portal is how a page rebuild becomes something else.

`lib/supply-chain/templates.ts:66` sets the `ecovadis` template's Labour & Human Rights section to
`color: '#7425e3'`, `bg: '#EDE9FE'`. That is the retired purple from the old brand gradient, and it is
one of the three sites the step-3 accent work left as a literal **because the accent family has no member
for it** — the others being Risk Identification and the custom questionnaire in the same file, plus
`app/trust/page.tsx` and the portal swatch.

It reaches a real surface: a supplier opening the EcoVadis questionnaire sees that section header
coloured. So it is customer-facing, on a page shown to someone else's supplier, in a colour the platform
retired.

**Blocked on the same decision as the other 32 uses**, recorded above: either the violet becomes
`--color-accent-violet` at its current value, or the 2026 colourway supplies a sixth accent hue and all
of them move to it. ⚠️ **Doing it per-file is how it came to be in 22 of them.**

One thing this instance adds to that decision: the four `ecovadis` sections are a **set of category
colours read together** (Environment green, Labour violet, Ethics blue, Sustainable Procurement), so they
are subject to the hue-separation constraint in `lib/ghg/engine.ts:1508-1526`. Whatever replaces the
violet has to stay distinguishable from the other three, not merely exist.

---

## The ESRS topic count: seven dashboard sites left, and they are a different commit

Logged 26 Sep 2026, after sweeping the marketing side. `ESRS_TOPIC_COUNT` and `ESRS_TOPIC_COUNT_WORD` are
in `lib/csrd.ts` and `lib/csrd.test.ts` guards them; `app/materiality/page.tsx` (7 occurrences),
`app/climate-risk/page.tsx` (2), `app/pricing/page.tsx` (1) and `app/methodology/page.tsx` (1) are
converted. **Seven rendered occurrences remain, all under `app/dashboard/`, plus one in a PDF generator.**

| File | Lines |
|---|---|
| `app/dashboard/climate-risk/page.tsx` | 514, 1098, 1381 |
| `app/dashboard/materiality/report/page.tsx` | 532, 635, 652, **707** |
| `lib/materiality/boardReport.ts` | 538 (not scanned: `SCAN_DIRS` is `app` only) |

Both dashboard files are in `PENDING` in `lib/csrd.test.ts`, which asserts they still hold a literal — so
the list cannot rot in either direction.

⚠️ **WHY THIS IS NOT THE SAME COMMIT.** `app/dashboard/materiality/report/page.tsx` generates a
**verifier-facing document** and carries correction history in its comments, including the ESRS 1 §10.3
phase-in that "was true when written and is now FALSE". Four of the seven are in it. A sweep through that
file is a different risk profile from a marketing-copy edit and deserves its own review.

⚠️ **LINE 707 IS THE TRAP.** It reads *"All ten ESRS topical standards, with their financial and impact
materiality scores (0–10) and band"* — **one real occurrence and one score scale on one line.** A
search-and-replace on `10` breaks the scale. The 26 Sep sweep also found `borderRadius: 10`,
`fontSize: 10`, a `0–10` materiality score and five `ESRS 1 §10.3` citations among its candidates, which
is why the guard matches the WORD and never the digit.

⚠️ **AND TWO OF MY OWN CLASSIFICATIONS WERE WRONG, WHICH IS THE USEFUL PART OF THIS ENTRY.** The report
that preceded the sweep listed twelve rendered occurrences. Three were not rendered at all:
`app/climate-risk/page.tsx:153` (inside the "screening, NOT materiality" JSX comment),
`app/dashboard/materiality/survey/[id]/results/page.tsx:352` and
`.../worksheet/[id]/determine/page.tsx:14`. All three were **continuation lines inside multi-line
comments**, which a per-line comment test reads as code. I converted the first before the guard's
span-based stripper caught it, and the `PENDING` both-directions check reported the other two as stale
entries on its first run.
  **The lesson is the one already logged for the shared comment-stripping helper: strip comment SPANS,
not comment LINES.** This is the fourth occurrence in one session. `lib/csrd.test.ts` now has a
block-tracking stripper; `lib/aiAct.test.ts` and `lib/cs3d.test.ts` still use the per-line form and would
misread the same construction.

**Also recorded, in the constant's own comment rather than here, because a test cannot check it:**
`mr_esrs_topics` is asserted to keep ten rows by a comment in `lib/materiality.ts:52`, the reference route
calls that fetch fatal if it fails, and `ESRS_TOPIC_COUNT` is hand-maintained. The database and the
constant can disagree and nothing would notice.

---

## Comment stripping: `lib/testing/stripComments.ts` exists; seventeen call sites still on the old forms

Logged 26 Sep 2026, with the helper. `stripTsComments` blanks comment SPANS in place, preserving line
numbers, and `lib/aiAct.test.ts` and `lib/cs3d.test.ts` are migrated. **Both migrations were
mutation-proved rather than accepted on a green suite**, which was the requirement: a span stripper strips
more, so the risk was a claim caught by accident quietly ceasing to be caught.

| Guard | Literal in rendered copy | Same string inside a JSX comment |
|---|---|---|
| `lib/aiAct.test.ts` | **fires** — `app/ai-governance/page.tsx:140 — "2 December 2027"` | correctly silent |
| `lib/cs3d.test.ts` | **fires** — `app/supply-chain/page.tsx:248 — "26 July 2029"` | correctly silent |

### The corrected survey: 22 files in four shapes, not twelve in two

An earlier count here said twelve. It was wrong, and so was the shape count.

| Shape | Files | Reads a JSX continuation line as code? |
|---|---|---|
| **span-based** (the new helper) | `aiAct`, `cs3d` | no |
| **block-tracking**, byte-identical in five | `ghg/declarationStates`, `ifrsS2`, `sb253`, `sb261`, `sources` | no, but LINE-granular |
| **block-tracking**, one variant | `csrd` | same |
| **per-line `//` only**, twelve files | `deals/gates`, `ghg/engine`, `ghg/engineCallSites`, `ghg/verifierWhitelist`, `materialityDrResolution`, `pdf/palette`, `scope3/cat3Copy`, `scope3/categorySnapshot`, `scope3/categoryStatus`, `scope3/scope3CategoryCount`, `scope3/supplierAssurance`, `scope3/verifierScope3Whitelist`, `supply-chain/supplierStatus` | **yes, and they never strip block comments at all** |

`lib/cbam/boundaries.test.ts` was a false positive in the survey: its `.replace(/\*\*/g, '')` strips
markdown emphasis.

### Why the six block-tracking files were left alone

They are correct about JSX continuation lines and still **line-granular**, returning a set of comment line
numbers. That loses a line which is both code and comment:

```
try { body = await res.json() } catch { /* a non-JSON body is still a failure below */ }
```

Four such lines exist (`app/api/survey-invite/route.ts:58`, `app/api/impact-invite/route.ts:51`,
`app/verify/[token]/page.tsx:554`, `app/verify-cbam/[token]/page.tsx:119`). **Six files agreeing on that
shape is consensus on the wrong thing rather than evidence for it.** They should move to
`commentOnlyLines`, which the helper exports for exactly this: the same answer, computed correctly.

### Why the twelve are not urgent, and the argument for converting on touch

They are the weakest form and mostly the lowest risk, because **most operate on a narrow slice** —
`ghg/verifierWhitelist` and `ghg/engine` scan a region between two markers, `pdf/palette` and
`supplierStatus` scan one known module. Risk varies by call site, so each conversion wants its own look at
what that guard is actually matching.

⚠️ **AND A SINGLE COMMIT REWRITING THE MATCHING IN A DOZEN TEST FILES TOUCHES THE SAFETY NET.** A mistake
there is invisible: the tests still pass. Convert each when its file is next edited, and mutation-prove it
the way the two above were.

### `stripSqlComments` is not built, deliberately

Nothing in `lib/` strips SQL comments today — the SQL work goes through `scripts/check-sql.py`, which is
out of scope and should stay out: different language, harder job, and its stripper tracks single-quoted
literals because it feeds a parser, where a mangled string is a syntax error rather than a missed match.
A function with tests and no production consumer looks load-bearing without being it. The separation
argument still holds when the second function is written, so write it then.

---

## ✅ RESOLVED 26 Sep 2026 — `--color-state-info` moved off blue, because Climate Risk took blue

Was: *"STEP 6 DECISION: Climate Risk `#004AAD` would be indistinguishable from `--color-state-info`
`#0C447C`"*. Resolved in the commit after the colourway swap.

| | |
|---|---|
| `--color-state-info` | `#0C447C` → **`#B5179E`** |
| `--color-state-info-wash` | `#E6F1FB` → **`#F6EFF5`** |

**The figures.** `#B5179E` measures **5.86:1 on `--color-paper`** and **5.19:1 on its own wash**, both
clearing the AA 4.5 that `lib/tokenContrast.test.ts` requires of every state colour. Against the module it
was colliding with it is **1.39:1 at 94° of hue** from `#004AAD`. Against every other post-swap token —
eight identities, five companions, three other states — it has **zero** collisions under the two-part rule;
its nearest neighbour by hue is `--color-state-error` `#B91C1C` at **51.3°** apart.

**The state moved, not the module.** The module value is given by the colourway; the state value was not,
so the state was the cheaper thing to move. Only two surfaces read the token — `app/people/page.tsx:84`
and `:85` — so the change is small where it is not free.

### Why `#C026D3` was rejected

It was the first candidate and it is **4.71:1 on paper**, which passes. It fails on its **wash**. The four
shipping state washes sit at 1.135–1.196 against paper; the deepest fuchsia wash inside that band is
`#F3F0F4`, on which `#C026D3` measures **4.17:1 — below AA**. Making it pass needed a wash at about 1.015
against paper, which is not a wash but white with a rumour of colour. `app/people/page.tsx:85` renders the
info colour as **11px uppercase text**, the smallest thing on that page, so relaxing to large-text 3.0 was
not available either.

⚠️ **AND `#B5179E` COULD NOT HAVE SHIPPED BEFORE THE SWAP.** Supply Chain's *old* module colour was
`#AF3790`, hue 315.5° — **6.8° and 1.05:1 from `#B5179E`**. Moving info to fuchsia first would have
relocated the collision rather than removed it. That is why this was sequenced after the colourway, and it
is the reason the separation assertion is sequenced after both: an allow-list computed on the old values
would have been wrong on the new ones.

### `--color-accent-blue` and `--color-state-info` are now deliberately split

`--color-accent-blue` keeps `#0C447C`. The two tokens held the same value and now differ, which is what
two families are for: the day one moves, the other must be able to stay.

⚠️ **THE ~60 HARD-CODED `#0C447C` COPIES WERE LEFT ALONE, AND MOST OF THEM SHOULD STAY.** They are
accent-blue semantics, not state-info: the CDP framework chip (`lib/ghg/engine.ts:1501`), the Ethics and
HRDD questionnaire sections, `EV_BLUE`, nine `const BLUE` declarations across the materiality worksheets,
CBAM readiness, and `"medium"` severity in Deals and `/assess` — which is a scale position, not a notice.
**Do not sweep `#0C447C`.** A handful of genuinely informational panels (the `#E6F1FB` notices in
`dashboard/ghg`, `dashboard/scope3`, `dashboard/climate-risk`, `dashboard/people`) arguably want the new
info token, and that is its own small triage rather than a find-and-replace.

---

## Retire the 32 remaining `#7425E3` literals, now that Cyber owns violet

Logged 26 Sep 2026, as a consequence of the Cyber decision. **A separate task; nothing changed now.**

The retired brand violet is still live, and `--color-module-cyber-ink` `#8A4FC6` is **1.29:1 at 4.8°** from
it. So a Cyber accent and a materiality diagram are now the same colour family, by accident. ⚠️ **NEITHER
IS A TOKEN AS FAR AS ANY TEST IS CONCERNED**, so nothing will fail and nothing will warn.

**What makes this newly decidable.** The violet's own entry above has been blocked on one question: does it
become `--color-accent-violet` at its current value, or does the colourway supply a sixth accent hue?
**There is now a third answer that is better than both — Cyber owns 270°, so the violet family can point at
the Cyber tokens** and the platform gains a hue rather than keeping an orphan.

The files, from a sweep on 26 Sep 2026:

| File | What it is |
|---|---|
| `app/materiality/page.tsx` | the **five-step ladder**: `PURPLE #7425E3`, `PURPLE_MID #534AB7`, `PURPLE_SLATE #3C3489`, `PURPLE_INK #26215C`, `PURPLE_TINT #FAF9FE`, plus the decomposed RGB channels for the fill-opacity grounds |
| `lib/supply-chain/templates.ts` | `:66` Labour & Human Rights, `:173` Risk Identification, `:209` the custom questionnaire |
| `app/trust/page.tsx` | `:24`, `:30` — two of the six card accents |
| `app/dashboard/supply-chain/portal/page.tsx` | `:29` — the EcoVadis swatch |

⚠️ **THE LADDER IS THE HARD PART AND MUST NOT BE FLATTENED.** `app/materiality/page.tsx` documents it as
information design, where "colour carries meaning — container weight, lens against ground, a five-step
luminance ladder", with a measured note that `PURPLE_SLATE` rather than `PURPLE_MID` is used on the deepest
card because `PURPLE_MID` is 4.28:1 there, under AA for 12px text. Any replacement needs five steps that
hold those ratios, not one token substituted five times.

⚠️ **AND THE FOUR `ecovadis` SECTION COLOURS ARE A SET READ TOGETHER** — Environment green, Labour violet,
Ethics blue, Sustainable Procurement — so whatever replaces the violet stays subject to the hue-separation
constraint in `lib/ghg/engine.ts:1508-1526`. It has to remain distinguishable from the other three, not
merely exist.

**Do it in one pass, not per file.** Twenty-two of the thirty-two arrived one file at a time, which is how
the value outlived its own retirement.

---

## `next dev` rewrites `AGENTS.md`, so it is dirty after every local run — decide once

Logged 26 Sep 2026. **One decision needed: commit the block, or ignore the file.** Running `next dev`
rewrites `AGENTS.md` and the block says so itself: *"This block is written and re-added by `next dev` —
verify at `node_modules/next/dist/server/lib/generate-agent-files.js`."* Reverting it only re-creates the
change on the next run, so the tree cannot be kept clean by discarding it. Either commit it and let the
next Next.js version produce a small diff, or add it to `.gitignore` and accept that the guidance it
carries stops being reviewed. It has been excluded from every stage line by hand so far, which works and
relies on somebody remembering.
