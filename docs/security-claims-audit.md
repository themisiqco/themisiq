# Security claims audit — `app/security/page.tsx`

**Status: unanswered. Every row below needs a founder decision.**

This file lists the security claims on `/security` that are asserted **with no status
qualifier**. On a security page an unqualified claim reads as *"we have this, today"*, and an
enterprise buyer will treat each one as a representation.

Produced as a diagnostic on 7 Sep 2026. No page was changed. Line numbers are as of that date —
re-check them if the page has moved since.

**How to use this file:** fill in the **Status** and **Evidence** columns on each row. Any row
marked `NOT YET` or `PARTIAL` needs either a wording change on the page or a dated target, in the
style the certifications table already uses.

---

## 1. Not in scope — the certifications table is already correct

`app/security/page.tsx:57–63` is **excluded from this audit**, and is the standard the rest of the
page should be brought up to. It gets three things right that nothing below it does:

- every row carries an explicit badge — **In progress** (amber) or **Compliant** (green);
- the in-progress rows carry **dated targets and honest detail** — "gap assessment in progress",
  "ISMS design phase", "dependent on Type I completion";
- the one row resting on a third party says so **in its own status label** — PCI DSS is badged
  **"Via Stripe"**, not "Compliant".

| Certification | Status shown | Detail shown |
|---|---|---|
| SOC 2 Type I | In progress | Target: Q4 2026 — gap assessment in progress |
| SOC 2 Type II | In progress | Target: Q2 2027 — dependent on Type I completion |
| ISO 27001:2022 | In progress | Target: Q2 2027 — controls mapped, ISMS design phase |
| PIPEDA & Law 25 (Québec) | Compliant | DPA templates complete · privacy breach procedures in place |
| GDPR / UK GDPR — data processor | Compliant | SCCs in place · DPA available on request |
| PCI DSS | Via Stripe | Payment processing via Stripe (PCI DSS Level 1) — ThemisIQ never stores card data |

**The problem this audit exists to record is the contrast.** That table tells a buyer *"we are
pre-certification, here are our dates."* The 24 claims below describe a mature, staffed, audited
security programme — 24/7 monitoring, quarterly access reviews, annual third-party penetration
testing, one-hour containment — with no status labels at all. A reviewer who reads the amber badges
and then the green ✓ ticks will ask why every control is in place but the certification that would
evidence them is eighteen months away. **That question is the real exposure, and it is created by
the contrast between the two halves of the page rather than by any single sentence.**

---

## 2. The three highest-exposure claims

These three are called out separately because they carry more risk than the other 21, for different
reasons. They still appear in their numbered rows below.

### ⚠️ A. The annual third-party penetration test — `app/security/page.tsx:168`

> **Annual penetration test** — By an independent third-party security firm. Findings tracked to closure.

**This is the only claim on the page asserting that an external party has already assessed
ThemisIQ.** Every other claim describes something done internally, which a buyer can only take on
trust; this one is falsifiable by a single question — *"who performed it and when? may we see the
report or the attestation letter?"*

Two things make it sharper. It is rendered with a **green ✓ tick**, immediately after "Weekly
scanning" and "Critical patches", so it reads as an established routine rather than an intention.
And it sits below a certifications table that says the SOC 2 **gap assessment** is still in
progress — a buyer who notices both will ask how an annual independent pen test predates the gap
assessment.

`/security:176` already promises the security page's own contact will respond in 24 hours, so the
question arrives by an obvious route.

### ⚠️ B. "Cross-tenant data access is architecturally impossible" — `app/security/page.tsx:107`

> **Tenant isolation** — Your data is logically isolated from all other customers using database-level Row-Level Security (RLS) enforced by tenant_id. **Cross-tenant data access is architecturally impossible.**

RLS enforced at the database is a real and strong control, and the first sentence is defensible.
**The word "impossible" is the exposure.** It admits no misconfiguration, no missing policy on a new
table, no service-role code path, and no `BYPASSRLS`.

The project's own `CLAUDE.md` records that **every new Postgres table needs its own GRANT migration
and that service-role paths fail silently without it** — i.e. the isolation model has operational
edges that must be maintained per table. That is normal and fine; it is simply not "impossible". A
security reviewer will test that word, and a single missing policy on one future table would
falsify it.

Suggested framing if this comes back `PARTIAL`: state the control and its enforcement point, and let
the mechanism carry the weight without the absolute.

### ⚠️ C. "Cannot be modified by any user or administrator" — `app/security/page.tsx:108`

> **Immutable audit trail** — All changes to your compliance data are logged in an immutable audit trail written by the database — not the application. **Cannot be modified by any user or administrator.**

Same shape as B, one degree stronger, because "**any** … administrator" is a claim about people who
hold credentials you control. Anyone with database owner rights, or with access to the Supabase
project, can in principle alter or truncate a table — that is what "owner" means. The claim is
defensible as *"no application path can modify it"* and as *"append-only by trigger"*; it is not
defensible as an absolute about administrators.

This one also has the widest blast radius if challenged: **the immutable audit trail is the basis of
the verifier-facing claims** — `/verify` describes the record as *"append-only, tamper-evident"* and
cites ISO 14064-3 / ISAE 3410. If the absolute wording is retracted on `/security`, check whether
`/verify` needs the same treatment.

---

## 3. The `/trust` attribution problem — wrong regardless of how the 24 are answered

**This section is separate because it does not depend on any founder answer.** The 24 claims below
may all come back `IN PLACE`; these would still need fixing.

### 3a. `/trust` states four subprocessor certifications with no attribution verb

`app/trust/page.tsx:162–169`, in a key/value table under the heading **"Infrastructure & security"**,
on a page called **Trust**:

| Label | Value as written |
|---|---|
| Hosting | `Supabase on AWS (us-east-1) · SOC 2 Type II certified` |
| Payment processing | `Stripe · PCI DSS Level 1 certified` |
| Email | `Resend · SOC 2 Type II certified` |
| Frontend | `Vercel · SOC 2 Type II certified` |

There is **no verb** — no "holds", no "via", no "provided by". Just a vendor and a certification,
in a table of ThemisIQ's own properties, beside rows that genuinely are ThemisIQ's own
("Encryption in transit — TLS 1.2+ on all connections").

Two aggravating factors:

- **`/trust` carries no in-progress qualifier anywhere.** It never mentions ThemisIQ's own SOC 2 or
  ISO 27001 status. A reader who lands on `/trust` — linked from the site footer, and reading as the
  canonical trust page — sees **four "SOC 2 Type II certified" lines and no indication that ThemisIQ
  holds neither SOC 2 nor ISO 27001.**
- **`/trust` names a fourth subprocessor `/security` never mentions: Resend (email).** The two pages
  disagree about who the subprocessors are.

**`/security` gets this right and `/trust` does not.** `app/security/page.tsx:83–85` names the holder
as the grammatical subject every time — *"Supabase **holds** SOC 2 Type II and ISO 27001
certifications"*, *"Vercel **holds** SOC 2 Type II certification"*. The fix for `/trust` is to adopt
that wording, and ideally the **"Via {vendor}"** badge the PCI DSS row already uses in the
certifications table.

### 3b. `/calculate-emissions` asserts SOC 2 in machine-readable structured data

`app/calculate-emissions/page.tsx:159` — a JSON-LD `FAQPage` answer, eligible for search rich
results, answering *"Is my data secure?"* about **ThemisIQ's** service:

> "Your data belongs to you and is never sold, shared, or used to train AI models. It is encrypted in transit (TLS 1.2+) and at rest (AES-256) **on SOC 2 Type II infrastructure (Supabase on AWS)**, with row-level security isolating it from every other customer. Payments run through Stripe (PCI DSS Level 1)."

The parenthetical does attribute it. But of the three phrasings on the site this is **the one most
likely to be quoted out of context**, because a search engine may surface "SOC 2 Type II" as
ThemisIQ's own answer to a question about ThemisIQ's security, stripped of the parenthesis.

### 3c. `/privacy` cites ISO 27001 / SOC 2 as a retention *basis*

`app/privacy/page.tsx:164`, in a retention table whose third column is the legal/standards **basis**
for the period:

| Data type | Retention | Basis as written |
|---|---|---|
| Security and audit logs | 5 years | **`ISO 27001 / SOC 2`** |

Every other row in that table cites a real binding authority — Canada Revenue Agency, CASL, PIPEDA,
Contract. This row cites two standards ThemisIQ is **not yet certified against**, in the same column,
formatted identically. It reads as *"we retain these for 5 years because our ISO 27001 / SOC 2
obligations require it."*

### Where there is no problem

- **`/terms` §7** makes no security control claims — data ownership and processing only. Correct.
- **No email route and no PDF generator** makes any security, SOC 2, ISO or encryption claim. All
  six email routes and both PDF modules were checked.
- The `ISO 27001` / `SOC 2` strings on `/cyber`, `/pricing`, `/dashboard/cyber` and the nav are
  **product scope** — frameworks the Cyber module helps customers comply with — not claims about
  ThemisIQ. Unambiguous in context.

---

## 4. The 24 claims

Status key: **IN PLACE** — true today, evidence available · **PARTIAL** — partly true, or true
without the process around it · **NOT YET** — aspirational, needs a qualifier or removal.

### Data protection — `app/security/page.tsx:105–109`

> ## Rows 1–5 answered 7 Sep 2026 — 1 PARTIAL · 2 PARTIAL · 3 PARTIAL · 4 PARTIAL · 5 NOT YET
>
> Evidence: `next.config.ts`, `db/dumps/schema_public_20260819_0800.sql` (74 tables, 19 Aug 2026),
> `app/api/concierge/extract/route.ts`, `app/api/ghg-bot/route.ts`.
>
> **1 — TLS · PARTIAL · not corrected.** The repo configures nothing: `next.config.ts` holds one
> redirect and no `headers()`; there is no `vercel.json` and no `middleware.ts`. TLS is entirely
> platform default. *"TLS 1.2 or higher"* is plausibly inherited; *"TLS 1.0 and 1.1 are disabled"* is
> a configuration assertion nothing here makes. **Verify with an SSL Labs / testssl.sh scan against
> themisiq.co.** See also the HSTS note under `:84` below.
>
> **2 — AES-256 at rest · PARTIAL · not corrected.** Nothing in the repo configures or records it —
> no KMS reference, no vendor doc, no DPA. Inherited from Supabase with zero local evidence, the same
> shape as the Supabase ISO 27001 claim. **Verify against Supabase's documentation for this project's
> plan and region.**
>
> **3 — isolation · PARTIAL · CORRECTED.** RLS is enabled on **74 of 74 tables** with **106
> policies** — a real and strong control. But the claim named a mechanism that does not exist
> (**zero occurrences of `tenant_id` anywhere in the schema**; 76 policies key on `auth.uid()`, i.e.
> per-user, not per-tenant), **5 tables have RLS enabled with no policy** — `ghg_entries`,
> `materiality_survey_closing_comments`, `materiality_survey_responses`, `organizations`,
> `rate_limits`, which is fail-closed but means application code enforces isolation there — and the
> **service role bypasses RLS on 7 routes**. The 30 `USING (true)` policies are all SELECT on public
> reference data (`cbam_*` factor tables, `mr_*` materiality tables), not customer data.
> Now reads: *"Your data is isolated at the database level. Row-Level Security is enabled on every
> table and scoped to the authenticated user, so one account cannot read another account's rows. A
> small number of server-side operations run with elevated database privileges; these are limited to
> named API routes and are not reachable from the browser."* Label changed `Tenant isolation` →
> `Account isolation`. No absolute, no counts, no route names.
>
> **4 — audit trail · PARTIAL · CORRECTED.** The design is real and strong: `public.log_audit()` is
> `SECURITY DEFINER`, `SET search_path TO 'public'`, firing `AFTER INSERT OR DELETE OR UPDATE FOR
> EACH ROW`; `audit_log` carries only an INSERT policy and a SELECT-own policy, so **no UPDATE or
> DELETE policy exists** and no such GRANT appears in the dump. Application code only ever SELECTs
> from it. Two things were false. **Coverage: 4 tables of 74** — `ghg_inventories`, `ghg_entries`,
> `cbam_production_processes`, `cbam_installation_disclosures` — so "all changes to your compliance
> data" excluded Climate Risk, Materiality, Supply Chain, People, Deals, AI Governance, Cyber and
> SBTi. **And "cannot be modified by any user or administrator" is false for the service role and for
> the table owner**, both of which bypass RLS by definition.
> Now reads: *"Every change to your GHG inventory and CBAM disclosure data is written to an audit log
> by a database trigger, not by the application, so the entry is recorded even if the application is
> bypassed. The log is append-only: no update or delete permission on it is granted to any signed-in
> account. Other modules are not yet covered."*
>
> **5 — AI claim · NOT YET · DELETED from /security.** *"Only structured prompts are sent to our AI
> provider — never raw customer data"* is contradicted by `app/api/concierge/extract/route.ts`, which
> sends the customer's uploaded document **base64-encoded** to `api.anthropic.com` as a
> `{ type: 'document' | 'image', source: { type: 'base64', … } }` block. Those documents are utility,
> gas, propane, diesel, fleet-fuel, fuel-oil and steam bills and refrigerant service records — whole
> pages carrying company name, site addresses, account numbers and billing periods. `api/ghg-bot`
> does send structured prompts only, so the claim was true for one route of two.
> The row is **removed from /security** rather than reworded: an honest version is a disclosure, not
> a protection, and belongs in the privacy register and on the feature page. Corrected in three other
> places — `privacy:130`, `calculate-emissions:159` (JSON-LD) and `:708` (prose).
>
> ⚠️ **"Not used to train AI models" was removed, not reworded, and can come back.** The repo sets no
> zero-retention or no-training header on either Anthropic call — only `content-type`, `x-api-key`
> and `anthropic-version`. Whether training is excluded is a term of the Anthropic account, which the
> code cannot evidence. **If that term exists, restore it as a term** — "under our agreement with
> Anthropic, your data is not used to train models" — in all three places at once.
>
> ⚠️ **`security:84` claims "HSTS enabled" and no `Strict-Transport-Security` header is set anywhere
> in this codebase.** Left unchanged pending verification at the platform. Check the response headers
> on themisiq.co; if Vercel does not add it, either the claim goes or the header does.
>
> ⚠️ **`/verify/[token]:953` says "append-only, tamper-evident record"** and rests on this same
> control. Reported separately — not changed. "Append-only" holds; "tamper-evident" is the word to
> examine, since there is no hash chain or sequence check that would make an alteration detectable.



| # | file:line | Exact wording | Status | Evidence if asked in a vendor questionnaire |
|---|---|---|---|---|
| 1 | `app/security/page.tsx:105` | **Encryption in transit** — All data transmitted to and from ThemisIQ is encrypted using TLS 1.2 or higher. TLS 1.0 and 1.1 are disabled. | | SSL Labs / testssl.sh scan output showing TLS 1.0/1.1 refused on every endpoint; Vercel TLS policy setting |
| 2 | `app/security/page.tsx:106` | **Encryption at rest** — All data at rest is encrypted using AES-256 at the storage layer via AWS-managed encryption keys. | | Supabase/AWS encryption-at-rest documentation for the specific project + region; KMS key configuration |
| 3 | `app/security/page.tsx:107` | **Tenant isolation** — Your data is logically isolated from all other customers using database-level Row-Level Security (RLS) enforced by tenant_id. Cross-tenant data access is architecturally impossible. ⚠️ **See §2B** | | RLS policy dump for every table; proof no table is missing a policy; a negative test showing a cross-tenant read fails; statement of how service-role paths are constrained |
| 4 | `app/security/page.tsx:108` | **Immutable audit trail** — All changes to your compliance data are logged in an immutable audit trail written by the database — not the application. Cannot be modified by any user or administrator. ⚠️ **See §2C** | | Trigger definitions; demonstration that UPDATE/DELETE on the audit table is refused; who holds DB owner rights and what constrains them |
| 5 | `app/security/page.tsx:109` | **No AI training on your data** — Your compliance data is not used to train AI models. Only structured prompts are sent to our AI provider — never raw customer data. | | Anthropic DPA / zero-retention terms; the actual prompt payload for `/api/concierge/extract` and `/api/ghg-bot`, showing what is transmitted |

### Access control — `app/security/page.tsx:122–126`

> ## Row 6 answered 7 Sep 2026 — **NOT YET · CORRECTED**
>
> ⚠️ **There is no RBAC, and this was worse than the `tenant_id` error in row 3.** That misnamed a
> real control; this named a control that does not exist.
>
> Evidence, from `db/dumps/schema_public_20260819_0800.sql` and `app/`:
> - `profiles.role` is a **free-text `text` column**, populated from a signup input whose
>   placeholder is `"e.g. CFO, Head of Sustainability"` — a job title the user types about
>   themselves. `app/signup/page.tsx:127`.
> - **Zero occurrences** of `'Administrator'`, `'Editor'` or `'Viewer'` in the schema or in
>   `app/`/`lib/`. No enum. The three named roles do not exist as values.
> - **Zero policies or functions read `profiles.role`.** All 106 RLS policies key on `auth.uid()`.
> - **There is no multi-user model to have roles within**: no `organization_members`, `user_roles`,
>   `memberships`, `team_members` or `company_users` table. `organizations` exists but is a company
>   *profile* table (name, EIN, NAICS, revenue, address).
>
> Corrected to: *"Your data belongs to the account that created it, and access is per account —
> signing in with your own credentials is what reaches your data, and no other account can. ThemisIQ
> does not offer shared team accounts or per-user permissions within an organisation."*
> Label `You control access` → `Account-level access`. No "planned" qualifier: multi-user access is
> under consideration, not committed.



| # | file:line | Exact wording | Status | Evidence if asked in a vendor questionnaire |
|---|---|---|---|---|
| 6 | `app/security/page.tsx:122` | **You control access** — You manage user access within your organisation via ThemisIQ's role-based access control (RBAC). User roles: Administrator, Editor, Viewer. | | Screenshot of the role management UI; the schema backing the three roles; confirmation all three are implemented and enforced |
| 7 | `app/security/page.tsx:123` | **ThemisIQ staff access** — ThemisIQ employees do not have routine access to customer platform data. Support access requires a documented request, approval, and is logged. | | The documented request/approval procedure; where approvals are recorded; a sample access log |
| 8 | `app/security/page.tsx:124` | **MFA mandatory** — Multi-factor authentication is mandatory for all ThemisIQ staff accessing production systems. We recommend enabling MFA for all customer accounts. | | MFA enforcement setting in Supabase / Vercel / AWS org; evidence it is enforced rather than available |
| 9 | `app/security/page.tsx:125` | **Least privilege** — ThemisIQ staff access follows least-privilege principles. Privileged access is reviewed quarterly. | | The access matrix; dated records of at least two completed quarterly reviews |
| 10 | `app/security/page.tsx:126` | **Offboarding** — All system access is revoked within 1 hour of any staff termination — voluntary or involuntary. | | Written offboarding checklist; evidence of it being followed, or a note that no termination has yet occurred |

### Incident response — `app/security/page.tsx:144–147`

| # | file:line | Exact wording | Status | Evidence if asked in a vendor questionnaire |
|---|---|---|---|---|
| 11 | `app/security/page.tsx:144` | **Detect** — We monitor all production systems 24/7 for anomalies, security events, and unauthorised access attempts. | | The monitoring tool and its alert rules; who receives alerts out of hours; on-call arrangement |
| 12 | `app/security/page.tsx:145` | **Contain** — P1 incidents are contained within 1 hour of detection. Affected systems are isolated immediately. | | The P1/P2 severity definitions; the containment runbook; any incident record demonstrating the SLA |
| 13 | `app/security/page.tsx:146` | **Notify** — You are notified within 24 hours of a confirmed data breach affecting your data. Regulatory notifications within 72 hours. | | The breach notification procedure (this one is also a PIPEDA / Law 25 / GDPR obligation, so it must exist in writing regardless) |
| 14 | `app/security/page.tsx:147` | **Review** — Every P1 and P2 incident has a mandatory post-incident review within 14 days. Findings shared with affected customers on request. | | The PIR template; completed PIRs, or a statement that no P1/P2 has occurred |

### Vulnerability management — `app/security/page.tsx:166–171`

> ## Rows 17, 18, 19 answered 7 Sep 2026 — **17 NOT YET (deleted) · 18 NOT YET (corrected) · 19 NOT YET (deleted)**
>
> **17 — annual penetration test · DELETED.** No independent third-party penetration test has been
> performed. This was the highest-exposure claim on the page: the only one asserting that an external
> party had already assessed ThemisIQ, and therefore the only one falsifiable by a single question.
> Removed outright rather than qualified — the dated-target vocabulary belongs to the certifications
> table, and a penetration test is not a certification.
>
> **18 — dependency scanning · CORRECTED.** There is **no `.github/` directory** — no workflows, no
> Dependabot, no Renovate, no Snyk, no scheduled job, and no CI config of any kind outside
> `node_modules`. `npm run build` is `vitest run && tsc --noEmit && next build` with
> **no audit step**. So "scanned … in the CI/CD pipeline on every build" was false twice over.
> What IS true is a real gate and is now stated: the build runs the full test suite and a strict
> TypeScript check **before** `next build`, so a failing test or type error stops the deploy.
> Corrected to: *"Every deploy runs the full test suite and a strict TypeScript check before the
> application is built — a failing test or type error stops the deploy. Dependency vulnerability
> scanning is not automated."* Label `Dependency scanning` → `Build gate`.
>
> **19 — peer review · DELETED.** No `CODEOWNERS` file exists. Branch protection is a GitHub repo
> setting the repo cannot show either way, but `CLAUDE.md` describes a solo founder/developer.
> Deleted rather than reworded: the honest rewrite is self-review, which is not a control an
> enterprise reviewer credits, and stating it invites "reviewed by whom?" — a question whose answer
> weakens the page. The Build gate row now carries the mechanical check that does exist.
>
> ## Rows 15, 16, 20 answered 8 Sep 2026 — **15 PARTIAL · 16 PARTIAL · 20 IN PLACE**, all corrected
>
> **What changed on 8 Sep 2026:** Dependabot alerts and Dependabot security updates enabled at the
> GitHub repo level; GitHub secret scanning enabled. 33 alerts raised on enablement — ~14 High,
> 14 Moderate, 5 Low, **no Critical**. Dependabot opened 6 PRs; `browserslist` and `nanoid` merged
> and deployed. Outstanding: `next`, `postcss`+`next`, `dompurify`, `js-yaml`.
>
> **15 — scanning · PARTIAL · CORRECTED.** Two things were wrong, not one. *"every week"* was a
> cadence no regulation requires and nothing produced; *"all production systems"* described
> infrastructure ThemisIQ does not operate — Vercel and Supabase run it, and their certifications
> cover it. Dependabot is **continuous**, which is both true and stronger than weekly.
> Now reads: *"Third-party dependencies are monitored continuously by GitHub Dependabot, which raises
> an alert and opens a pull request with the patched version when a known vulnerability is published.
> The infrastructure beneath the application is operated by Vercel and Supabase, whose certifications
> cover it."* Label `Weekly scanning` → `Dependency monitoring`.
> **PARTIAL, not IN PLACE**, because it covers npm dependencies only — not application code, not
> container or OS layers, and not the providers' own stack.
>
> **16 — patching · PARTIAL · CORRECTED.** *"Applied within 7 days of discovery"* was an SLA with no
> record behind it. Replaced with what actually happens rather than a window that cannot be
> evidenced. ⚠️ **Dependabot opening a PR is not the same as it being merged** — 4 of the 6 opened
> PRs are still outstanding as of 8 Sep 2026 — so the wording distinguishes the automatic step from
> the manual one.
> Now reads: *"Dependabot opens a pull request for each patched version automatically. Merging is a
> manual review step gated on the full test suite passing, so a fix reaches production once it has
> been reviewed and the build is green. A fixed remediation window is not published."*
> **To move this to IN PLACE**, publish a window you can meet and keep a dated merge log against it.
> Until then, declining to state one is the accurate position.
>
> **20 — secrets · IN PLACE · CORRECTED (strengthened).** The task-37 check covered **the working
> tree only** and explicitly could not scan history — which is precisely what a vendor questionnaire
> asks about. GitHub secret scanning now covers the full commit history, closing that gap.
> Now reads: *"API keys and credentials are held in environment variables and are never committed to
> source code. GitHub secret scanning is enabled on the repository and covers the full commit
> history, not only the files currently checked in."*
> Supporting evidence unchanged: `.gitignore:28` is `.env*`; no key material in the tracked tree;
> `docs/backup-record.md` deliberately holds no credentials and says so at line 6.
>
> ⚠️ **A knock-on fix in the same section.** Task 38's `Build gate` row ended *"Dependency
> vulnerability scanning is not automated."* — true when written on 7 Sep, **false on 8 Sep**, and
> directly contradicting the new Dependency monitoring row two lines above it. Sentence removed; the
> row now states the build gate only. This is the risk of writing an absence into copy: an absence
> that gets filled becomes a false claim without anyone editing the line.
>
> ~~⚠️ **THE SECTION NOW RESTS ENTIRELY ON ROWS 15 AND 16, WHICH ARE STILL UNANSWERED.**~~ *(Superseded 8 Sep 2026 — answered above.)* Four items
> remain: Weekly scanning, Critical patches, Build gate, Secrets management. Secrets management is
> evidenced (row 20) and Build gate is evidenced (`package.json`). **If rows 15 and 16 come back
> NOT YET, the section reduces to two items, neither of which is vulnerability management, and the
> heading stops being earned.** Answer 15 and 16 before treating this section as settled.



| # | file:line | Exact wording | Status | Evidence if asked in a vendor questionnaire |
|---|---|---|---|---|
| 15 | `app/security/page.tsx:166` | **Weekly scanning** — Automated vulnerability scanning across all production systems every week | | The scanner in use, its schedule, and recent scan reports |
| 16 | `app/security/page.tsx:167` | **Critical patches** — Applied within 7 days of discovery | | Patch log with discovery and deployment dates for recent criticals |
| 17 | `app/security/page.tsx:168` | **Annual penetration test** — By an independent third-party security firm. Findings tracked to closure. ⚠️ **See §2A** | | The firm's name, engagement date, report or attestation letter, and the remediation tracker |
| 18 | `app/security/page.tsx:169` | **Dependency scanning** — All third-party code dependencies scanned for known vulnerabilities in the CI/CD pipeline on every build | | Dependabot / npm audit / Snyk configuration; evidence it runs per build and blocks or reports |
| 19 | `app/security/page.tsx:170` | **Code review** — All code changes require peer review before merging to production | | ⚠️ Branch protection settings requiring review. Note this is a solo-developer repo — decide whether "peer review" is accurate as written |
| 20 | `app/security/page.tsx:171` | **Secrets management** — API keys and credentials managed via secure environment variable injection — never committed to source code | | Vercel environment variable configuration; secret-scanning result over the git history |

### Backups — `app/security/page.tsx:86`

> ## ✅ ANSWERED 7 Sep 2026 — rows 21–23 were **FALSE on the live site**, and are now qualified.
>
> **What was wrong.** The card claimed *"Continuous point-in-time recovery with 30-day retention.
> Backups replicated to geographically separate AWS region. RTO: 4 hours. RPO: 1 hour."* The project
> is on **Supabase Free**, and [`docs/backup-record.md`](backup-record.md) §6 states plainly:
> *"**Point-in-time recovery.** Supabase Free has none. Everything here is a manual snapshot taken at
> one moment."* [`docs/backlog.md`](backlog.md) lists the Free→Pro upgrade as still outstanding and
> calls it *"a hard prerequisite"*. So none of the four figures was true, and the internal record
> already said so.
>
> **What is true today**, per `backup-record.md` §2 and §7: manual `pg_dump` snapshots, most recently
> 19 Aug 2026 (74 tables), held in two locations and verified by SHA-256 across both copies. Not
> continuous, not automated, and — per §6 — **not yet restored into a scratch project**, so the
> recovery path is untested.
>
> **What arrives with Pro:** continuous PITR. The retention window, cross-region replication and the
> RTO/RPO figures are **not** asserted by `backup-record.md` and are not claimed on the page; they
> are held back until Pro is live and a restore has been tested.
>
> **The page now carries an amber "In progress" badge**, the same vocabulary as the certifications
> table, with the position stated in the card body.
>
> ⚠️ **REVISIT DATE — this qualifier is temporary and expires.**
> Revisit **on the day the Supabase Pro upgrade completes**, and in any case **by 30 September 2026**.
> That date is derived from the September launch named in `backup-record.md` §6, not from a
> commitment recorded anywhere — adjust it if the launch moves. Two things must happen at that point,
> and the first without the second leaves the page wrong again in the other direction:
>   1. replace the qualified copy with the measured figures, and
>   2. **test a restore first** — until then, RTO and RPO are targets, not capabilities. §6:
>      *"A backup that has never been restored is a hypothesis."*
>
> Rows 21–23 below are kept for the record. Their **Status** is answered; their **Evidence** column
> is what will substantiate the replacement copy.



| # | file:line | Exact wording | Status | Evidence if asked in a vendor questionnaire |
|---|---|---|---|---|
| 21 | `app/security/page.tsx:86` | **Backups — continuous PITR** — Continuous point-in-time recovery with 30-day retention. | | Supabase plan and PITR setting showing 30-day window |
| 22 | `app/security/page.tsx:86` | Backups replicated to geographically separate AWS region. | | The replication configuration and the target region |
| 23 | `app/security/page.tsx:86` | RTO: 4 hours. RPO: 1 hour. | | A documented, **tested** recovery. An untested RTO/RPO is a target, not a capability — this is the row most often challenged |

### Disclosure — `app/security/page.tsx:187`, `195`

| # | file:line | Exact wording | Status | Evidence if asked in a vendor questionnaire |
|---|---|---|---|---|
| 24 | `app/security/page.tsx:187` and `:195` | We take all security reports seriously and will respond within 24 hours. *(stated twice — the second as "Response time: 24 hours for all security reports")* | | Who monitors `security@themisiq.co`, and the coverage arrangement that makes a 24-hour response hold at weekends |

---

## Notes on scope

- **Claim 19 is flagged rather than assumed.** `CLAUDE.md` describes a solo founder/developer. "Peer
  review" may still be accurate if a reviewer exists, but it is the one claim on the page that the
  repository's own documentation gives reason to check first.
- **Claims 21–23 come from a single sentence** but are split into three rows because they can be
  answered differently — PITR retention is a plan setting, cross-region replication is a
  configuration, and RTO/RPO are only true once a restore has been tested.
- **Claim 24 appears twice on the page.** If the SLA changes, both `:187` and `:195` must change.
- The **infrastructure cards** at `:83–85` are **not** in this list. Their wording is correct — each
  names the certification holder as the subject. The recommendation there is presentational: give
  them the **"Via {vendor}"** badge the PCI DSS row already uses, so a reader scanning the page
  cannot carry a green "SOC 2 Type II" from the vendor cards up to the amber row 30 lines above.

---

## Offers, not assertions — added 8 Sep 2026

Every row above is an **assertion**: a statement about what ThemisIQ does. This
section exists because `app/security/page.tsx:222` was something different — an
**offer**, promising artefacts on request.

⚠️ **An offer is sharper than an assertion.** An assertion is checked only if
someone chooses to check it. An offer *invites* the request that reveals the gap,
and it does so during a sales process, from the buyer who cares most, at the
moment the answer costs the most. When auditing this page again, read the offers
first.

**Corrected 8 Sep 2026 — `security:222`, "Enterprise security reviews".**
Was: *"Penetration test reports, SOC 2 bridge letters, and full security
questionnaire responses are available on request for enterprise customers
conducting security due diligence."*

- **Penetration test reports** — none exists; row 17 records that no independent
  test has been performed, and the claim was deleted from the page in task 38.
- **SOC 2 bridge letters** — a bridge letter is issued by an auditor to cover the
  gap after a report period ends. There is no SOC 2 report (certifications table:
  Type I target Q4 2026, Type II target Q2 2027), so there can be no bridge
  letter, and offering one implies an audit has happened.
- **Security questionnaire responses** — the one deliverable that can be
  honoured. It is work rather than an artefact, so it can be promised.

Now reads: *"If you are conducting security due diligence, send your questionnaire
to security@themisiq.co and we will complete it. ThemisIQ does not yet hold a
SOC 2 report or an independent penetration test report, so those artefacts are not
available; the certification table above gives the current position and target
dates."*

Follow-up work is recorded in **`docs/backlog.md`**, under *Verified 8 Sep 2026 —
Security artefacts and questionnaire readiness*: complete a CAIQ or SIG Lite
proactively, add `SECURITY.md`, and restore the artefact offer if and when the
artefacts exist.

### Other offers on the site, checked 8 Sep 2026

| where | offer | position |
|---|---|---|
| `security:62`, `trust:81` | DPA available on request | **Depends on a founder answer.** `security:61` asserts *"DPA templates complete"*, so the page claims the artefact exists. The repo holds no DPA document and cannot confirm it. If no template exists, this is the same defect as the one above. |
| `security:171` | Post-incident review findings shared on request | Conditional on an incident occurring. Rests on row 14 (a PIR template existing), still unanswered. Low exposure — nothing to produce until there is an incident. |

Checked and clear: `/privacy`, `/terms`, and all six email routes make no artefact
offer.

---

## Status of every row — completed 8 Sep 2026

The file is now fully answered. Earlier sections carry the evidence and the
corrected wording; this table is the index.

| # | claim | status | outcome |
|---|---|---|---|
| 1 | TLS 1.2+, 1.0/1.1 disabled | **PARTIAL** | Repo sets no TLS floor; platform default. `next.config.ts` now sets HSTS explicitly (task 36). Verify the floor with an SSL Labs scan. |
| 2 | AES-256 at rest, AWS-managed keys | **PARTIAL** | Inherited from Supabase, no local evidence. Verify against Supabase docs for this plan and region. |
| 3 | Tenant isolation | **PARTIAL** | Corrected. `tenant_id` does not exist; 74/74 tables have RLS, 106 policies keyed on `auth.uid()`; 5 tables policy-less; service role bypasses on 7 routes. |
| 4 | Immutable audit trail | **PARTIAL** | Corrected. Trigger-written and append-only is real; coverage is **4 tables of 74** (GHG + CBAM), and the service role and table owner can modify. |
| 5 | No raw customer data to AI | **NOT YET** | Deleted from /security. `api/concierge/extract` sends base64 documents to Anthropic. Corrected on /privacy and /calculate-emissions. |
| 6 | RBAC — Administrator/Editor/Viewer | **NOT YET** | Corrected. No RBAC, no roles, no multi-user model. `profiles.role` is a free-text job title. |
| 7 | Staff have no routine access; requests approved and logged | **N/A — CLAIM REMOVED** | ThemisIQ has no staff. Folded into the new *Who operates ThemisIQ* row. |
| 8 | MFA mandatory for staff | **IN PLACE** | Corrected. MFA enrolled via authenticator app on all three production accounts — Supabase, Vercel, GitHub. Wording no longer implies an enforced org policy. |
| 9 | Least privilege; quarterly privileged-access review | **N/A — CLAIM REMOVED** | No staff, no quarterly review process. Folded into *Who operates ThemisIQ*. |
| 10 | Access revoked within 1 hour of termination | **N/A — CLAIM REMOVED** | No personnel process exists. Folded into *Who operates ThemisIQ*. |
| 11 | 24/7 monitoring | **NOT YET** | Corrected. Automated alerting is not configured. Detection is subprocessor notification plus a push-monitored intake address. |
| 12 | P1 contained within 1 hour | **PENDING PROCEDURE** | Backed once `docs/security-incident-response-procedure.md` is in the repo. Not yet present at time of writing. |
| 13 | Breach notice ≤24h / ≤72h | **PENDING PROCEDURE** | As above. ⚠️ Also a standing PIPEDA / Law 25 / GDPR obligation regardless of what the page says. |
| 14 | Post-incident review within 14 days | **PENDING PROCEDURE** | As above. |
| 15 | Weekly scanning, all production systems | **PARTIAL** | Corrected. Dependabot is continuous; npm dependencies only. |
| 16 | Critical patches within 7 days | **PARTIAL** | Corrected. States the real process; no window published. |
| 17 | Annual third-party penetration test | **NOT YET** | Deleted. No test performed. |
| 18 | Dependency scanning in CI on every build | **NOT YET → superseded** | Rewritten as *Build gate*; Dependabot (row 15) now covers the scanning half. |
| 19 | Peer review before merge | **NOT YET** | Deleted. Solo developer, no CODEOWNERS. |
| 20 | Secrets never committed | **IN PLACE** | Strengthened. GitHub secret scanning enabled and covers full commit history. |
| 21 | Continuous PITR, 30-day retention | **NOT YET** | Qualified with an amber *In progress* badge pending the Supabase Pro upgrade. Revisit by 30 Sep 2026. |
| 22 | Cross-region backup replication | **NOT YET** | As above — not claimed until Pro is live. |
| 23 | RTO 4h / RPO 1h | **NOT YET** | As above. ⚠️ Requires a **tested** restore before it can be stated. |
| 24 | 24-hour response to security reports | **IN PLACE** | `SECURITY.md` added at the repository root, giving the address, the 24-hour acknowledgement, scope, and safe-harbour terms. |

### Not a numbered row, but corrected in the same pass

- **`security:222` enterprise security reviews** — an *offer*, narrowed to the
  questionnaire; pen test reports and SOC 2 bridge letters withdrawn (task 40).
- **Subprocessor attribution** — `/trust`, `/calculate-emissions`, `/privacy`
  (task 30b/31).
- **`security:84` "HSTS enabled"** — true, and now set by `next.config.ts` rather
  than inherited. ⚠️ **The wording still sits inside the Vercel card under a
  `Via Vercel` badge and needs splitting**, since the header is now ours.

### Still open

1. **`docs/security-incident-response-procedure.md` is not in the repo.** Rows
   12–14 stay PENDING until it is, and the /security wording proposed for it is
   held rather than applied — publishing "a documented procedure exists" while
   the repo shows none is the defect this audit exists to prevent.
2. **`security:84`** — split the HSTS half out of the Vercel card.
3. **DPA offer** (`security:62`, `trust:81`) — the page asserts *"DPA templates
   complete"* at `:61`; no DPA document exists in the repo. Same shape as the
   corrected artefact offer.
4. **Rows 1 and 2** — two vendor checks, ten minutes each.
5. **Row 23** — test a restore. An untested RTO is a target, not a capability.

