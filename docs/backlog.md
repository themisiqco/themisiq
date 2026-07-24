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
