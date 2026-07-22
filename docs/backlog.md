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
