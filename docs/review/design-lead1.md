# LEAD1: free account that keeps the Scope 1 and Scope 2 calculation (design)

Branch `lead1-free-account`, from main at `da3b794`. Design only: no code, migration or copy is changed by this
document. Written 4 Oct 2026; amended the same day with Lisa's decisions and four fixes.

**This supersedes LEAD1 in `docs/review/design-derived-figures.md` section 11** ("Email me my results" with a
`leads` table and no account). That section should be updated to point here; this document does not edit it.

**Status of facts cited.**
- Database facts are from `db/dumps/schema_public_20261001_1057.sql` (the newest dump) and `supabase/migrations/`.
- Facts Lisa checked against the live database on 4 Oct 2026 are marked "(Lisa, 4 Oct)". Otherwise, whether a
  migration has run is stated only from its header.

---

## Decisions (Lisa, 4 Oct 2026)

| # | Decision |
|---|---|
| Option C | Confirmed. The calculator stays open with no email. The free account is created at "Keep my results" and confirmed by a 6-digit code typed in the same window, with the link in the same email as a fallback |
| Q-L1 | Terms acceptance is a sentence under the button, not a checkbox |
| Q-L2 | Free accounts that never upgrade are deleted 24 months after the last sign-in, with 30 days' notice |
| Q-L3 | On purchase, the plan applies to the free calculation automatically: it becomes the first inventory |
| Q-L4 | Resolved: no `ghg_inventories` rows belong to users without a `ghg` entitlement (Lisa, 4 Oct). M1's pre-flight asserts 0 and stops if not |
| Q-L5 | Store IP and user agent with consent records |
| Q-L6 | Block disposable email domains only; free webmail is allowed |
| Q-L7 | Turnstile, through Supabase Auth's CAPTCHA protection (fix 1, section 6) |
| Q-L8 | Codes only for free accounts; no password |
| Q-L9 | App email sent through the Resend API (results, re-email, renewal, marketing): From "ThemisIQ <hello@themisiq.co>", reply-to hello@themisiq.co. Auth email (sign-in codes, sign-up confirmations, password resets) is sent by Supabase through Resend SMTP from "ThemisIQ <noreply@themisiq.co>" (set up 4 Oct 2026, section 10.1) |
| Q-L10 | Keep the next-step sentence with the price in the results email |
| FI0 | `docs/review/patches/FI0-entitlement-gate-only.sql` was RUN in Supabase on 2 Oct 2026 (Lisa, 4 Oct). The behavioural verify passed; only the function-name text check failed, as expected. Its header is updated to say so. M2 builds on the live FI0 body |
| Profiles | No trigger on `auth.users`, and `public.profiles` has 0 rows (Lisa, 4 Oct). M6 adds the trigger and a backfill |

---

## 0. What the code and database do today

| Concern | Today | Where |
|---|---|---|
| Free calculator entry | `/dashboard/ghg?start=new` opens a blank wizard for everyone. Without the parameter: Trends for customers with inventories, the renew wall for expired plans | `lib/ghg/entry.ts` (`entryView`, `entryWall`); `app/dashboard/ghg/page.tsx` mode effect and gate |
| Live totals | Calculated in the browser by `lib/ghg/engine.ts`; no server call | `app/dashboard/ghg/page.tsx` steps 2 and 4 |
| Save, logged out or no plan | `saveGoesToPricing` → `stashDraftAndGoToPricing`: draft to localStorage, then `/pricing?modules=ghg` | `app/dashboard/ghg/page.tsx` handleSave; `lib/ghg/entry.ts` |
| Save of a new inventory | Checks for an existing row with the same company and year and refuses with "You already have a {year} inventory for "{company}"…" before inserting. An edit updates by id | `app/dashboard/ghg/page.tsx:1731-1740` |
| Draft store | localStorage key `DRAFT_KEYS.ghg`. A draft written signed out expires after `ANON_TTL_MS` = 2 hours; one written signed in does not expire. Same browser only | `lib/drafts.ts:34`, `lib/ghg/draft.ts` |
| Database gate on saving | `trg_enforce_ghg_location_allowance` BEFORE INSERT OR UPDATE ON `ghg_inventories` → `enforce_ghg_location_allowance()`. Live body: the FI0 entitlement-only gate, RUN 2 Oct 2026. It refuses any write without an active `ghg` entitlement (`term_end > now()`), with one message for expired plans and one for never-bought | dump 10285; `docs/review/patches/FI0-entitlement-gate-only.sql` |
| Row ownership | Policy `ghg_inventories_owner`: `(select auth.uid()) = user_id`, with `company_id` in the user's companies. Grants: SELECT, INSERT, UPDATE, DELETE to `authenticated` | dump 11913, 13512 |
| One inventory per (user, company, year) | Unique index `ghg_inventories_user_company_year_uniq` on `(user_id, company_name, reporting_year)` | dump 9676 |
| Scope 3 | `scope3_inventories`: policy `scope3_owner_all`, owner only. **No entitlement trigger.** Unreachable today only because a Scope 3 record binds to a saved GHG inventory, which needs a plan | dump 12779; the picker in `app/dashboard/scope3/page.tsx` |
| SBTi | `sbti_company_profile`, `sbti_targets`, `sbti_cycle`, `sbti_scope3_coverage`: owner policies. **No entitlement trigger**; the gate is the page's `PaywallCard` | dump 12607 onward |
| Verifier sharing | `trg_enforce_verifier_invite_term` BEFORE INSERT ON `verifier_access` (and `cbam_verifier_access`) requires an active plan | dump 10313 |
| Uploads | Storage policy "Users can upload own documents" checks only the uid prefix. ENF1 adds the active-plan check | `supabase/migrations/20260804_ghg_source_documents_policies.sql:63` |
| Guide | `/api/ghg-bot` checks that a `ghg` row exists, not that it is active. ENF2 fixes this | `app/api/ghg-bot/route.ts:205-215` |
| Downloads | Built in the browser; the paywall is a blur. ENF3 moves them server-side | `app/dashboard/ghg/page.tsx` generateExport, generateAssurance |
| Browser auth calls | `signUp` (`app/signup/page.tsx:26`), `signInWithPassword` (`app/login/page.tsx:26`), `resetPasswordForEmail` (`app/forgot-password/page.tsx:19`). Server-side admin calls: `admin.generateLink` (`app/api/webhooks/stripe/route.ts:64`) and `admin.createUser` (`lib/order/provision.ts:55`) | |
| Auth callback | ⚠️ Exchanges `?code=` with `createServerClient()`, a service-role client (`lib/supabase.ts`), so the session it creates never reaches the browser. The browser client is `createClient` with default options, which keeps the session in localStorage. Sign-up confirmations and the webhook's first-login link (`redirectTo: /auth/callback?next=/dashboard`) work today only because their tokens arrive in the URL fragment, which the redirect preserves. **Fixed in L2 (fix 3)** | `app/auth/callback/route.ts:12` |
| Profiles | `public.profiles` (id, email, first_name, last_name, role, company, timestamps). Owner policies: "Users can insert/update/view own profile". **Grants:** none to `authenticated`; `service_role` holds only REFERENCES, TRIGGER, TRUNCATE and MAINTAIN, so not even the service role can read or write it today. No trigger fills it, and it has 0 rows (Lisa, 4 Oct) | dump 7857, 11350-11371, 13863 |
| Precedent for "one free" | `enforce_deals_free_tier_cap()`: one free deal per user, refused in a BEFORE INSERT trigger | `supabase/migrations/20260811_deals_free_tier_cap.sql` |
| Consent precedent | `purchase_consents`: consent booleans, `consent_version`, `ip_address`, timestamp | dump 7873 |
| Rate limits and bots | `lib/rateLimit.ts` (table `rate_limits`, IP and email buckets, fails open). `lib/assessmentSubmitGuard.ts` honeypot (`HONEYPOT_FIELD`) | |
| Authed API routes | `lib/supabaseAuthed.ts` `getAuthedClient(token)`: a per-request client acting as the user, so RLS applies | |
| Admin | `ADMIN_EMAIL` match on a signed-in user | `app/api/admin/create-invoice/route.ts:5, 66` |
| Erasure | `scripts/erase-account.mjs` deletes a customer's rows, storage objects and auth user; `erasure_log` records the event without identity | `supabase/migrations/20260910_erasure_log.sql` |
| Email | Resend over fetch, one helper per route (`sendEmail`) | e.g. `app/api/order/quote-request/route.ts:20` |

---

## 1. Flow, screen by screen

### 1.1 Where the prompt appears

**The calculator stays open with no email.** Nothing in the flow below runs until the visitor asks to keep their
results.

The prompt is **"Keep my results"**, with the line "Create a free account and we'll email your results to you and keep
this calculation." It appears in four places, for a visitor who is signed out or has no free calculation saved yet:

1. **Step 4 (Review & workings), under the totals.** The main placement, because it's where the result is. A card
   with the line above and a primary button, "Keep my results".
2. **The free-use banner at the top of the wizard** (the neutral arm, `noticeIsNeutral`). "Keep my results" as the
   primary button, with "See pricing" staying secondary.
3. **Save, for a signed-out visitor.** Save opens the same form instead of going to pricing. `saveGoesToPricing`
   becomes a decision with four outcomes:
   - signed out: open the form;
   - signed in with no plan (including an expired one) and no free calculation: save as the free calculation;
   - signed in with no plan, editing a row other than the free calculation: the one-free choice (1.5);
   - active plan: save as now.
4. **The step 5 export overlay** (`PaywallOverlay`): a secondary link, "Email me my results instead (free account)",
   under "See GHG pricing". Downloads stay paid.

It is not shown to a customer with an active plan, or to a free account already working in its own free calculation.
For them, Save just saves.

### 1.2 The form (a modal over the wizard, so nothing on screen is lost)

| Field | Required | Why |
|---|---|---|
| Full name | yes | Who the results are for; shown to Lisa in leads; used as typed in the email greeting |
| Work email | yes | Sign-in and delivery |
| Company | yes, prefilled from `inventory.company_name` | Leads, and the company row the inventory saves under (`companies`, which the `ghg_inventories_owner` WITH CHECK requires) |
| Updates consent | no, unticked | Marketing, separately (section 5) |
| Turnstile widget | yes (invisible or managed) | Produces the `captchaToken` Supabase requires (section 6) |
| Honeypot | hidden | Section 6 |

**Not asked:**
- **Country:** derived from the first location's country, already in the calculation.
- **Role and phone:** not needed for the purpose, so not collected (data minimisation).
- **Password:** free accounts use codes only (Q-L8).

**Under the button (Q-L1):** "By creating a free account you agree to the Terms and the Privacy Policy." (links). No
checkbox.

### 1.3 Sign-in: a 6-digit code typed in the same window, with the link as a fallback

**The code:**
- `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken, data: { full_name, company,
  signup_source: 'free_calc' } } })`
- then `supabase.auth.verifyOtp({ email, token, type: 'email' })`

**Why a code first:**
- **The visitor never leaves the wizard tab.** They type six digits into the modal, the tab gains a session, and the
  calculation in memory is saved there and then. No redirect, no reload, no draft round trip.
- **It works across devices.** Someone who reads the email on their phone types the code on the laptop.
- **No password** to choose, store or reset (Q-L8). Paid customers keep password login, unchanged.

**Expiry: 1 hour.** The Email OTP expiry is 3600 s, deliberately (section 10.1): the same Supabase setting governs
sign-up confirmation links and the purchase email's first sign-in link, so a shorter code life would shorten those too.

**The link** in the same email is the fallback for a visitor who clicks instead of typing. It opens a client page,
`/auth/confirm?token_hash=…&type=email`, which calls `verifyOtp({ token_hash, type: 'email' })` in the browser and
then claims the pending calculation (1.6). That works on any device.

**Signing in again later:** the login page gains "Email me a sign-in code" beside the password form, with the same
Turnstile widget.

**Configuration** is in the checklist at the end (section 10).

### 1.4 If the email already has an account

The modal never says whether an address is registered (that would let anyone test addresses). It always says "We've
sent a 6-digit code to {email}." Once the code is verified, what happens depends on the account:

| Account found | What happens |
|---|---|
| New | The account is created and the calculation saved as its free calculation |
| Existing, active plan | Saved as an ordinary inventory, unless the account already has an inventory for the same company and year: then the conflict choice (1.5b). The results email is sent either way |
| Existing, no plan, no free calculation yet (including expired plans) | Saved as the free calculation, unless an existing inventory has the same company and year: then the conflict choice (1.5b) |
| Existing, already has a free calculation | The one-free choice (1.5) |
| Existing password user | Same as the rows above. The code signs them in; their password still works |

### 1.5 The one-free choice

"Your free account keeps one calculation: {company}, {year}, saved {date}."
- **"Replace it with this one":** updates that row, and only that row: `update … where id = {free id} and free_tier`.
  If no row is updated, nothing is written and the choice is shown again.
- **"Open my saved calculation":** this one is discarded, after a confirm.
- **"Keep both with a GHG plan":** goes to pricing with the draft stashed as today.

### 1.5b Never overwrite a real inventory (fix 2)

Inventories are unique per (user, company, year) (`ghg_inventories_user_company_year_uniq`). The claim route, and
every later save of a free calculation, **never updates a row that is not the free calculation**:
- The claim only ever INSERTs a new row, or replaces the free row by id with `and free_tier`.
- A later free save updates by its own id, which is the free row.
- If the insert, or a later edit that changes the company or year, collides with an existing inventory (the unique
  index raises `23505`), nothing is written. The visitor sees:

  "You already have a {year} inventory for "{company}"."
  - **"Open that inventory"**: goes to `/dashboard/ghg?id={existing}`. This calculation is kept in the browser draft
    until they leave.
  - **"Save this calculation under a different year or company"**: the modal shows the year and company fields;
    they change one and save again.

- The database backs this up: the M2 trigger refuses any update of a non-free row without an active plan, and
  nothing in the free path issues an upsert.

### 1.6 The draft survives the round trip

| Case | How |
|---|---|
| Code typed in the same tab | The calculation never leaves memory. After `verifyOtp` the page calls the claim route with it |
| Tab closed or reloaded before the code is typed | On submit, before the code is sent, the client also writes the draft to localStorage (as today) and to a server-side pending record (below). Coming back to `/dashboard/ghg` restores from localStorage; the code can still be typed |
| Link clicked on a different device | `/auth/confirm` verifies, then calls the claim route with no calculation; the route takes the newest unexpired pending record for the verified email, so the calculation appears on the new device. **Decided in L3: the link carries no pending id.** The "Magic Link" template is a fixed URL and stays as it is; the verified email is the key, and an id the client does pass must belong to that same email. Nothing in the template needs to change |

**The pending record**, table `free_calc_pending` (M4):
- **Written** on submit by `POST /api/ghg/free-calc/pending`, without a session. It holds the inventory inputs (the
  same shape `saveGhgDraft` stores), the email and a 24-hour expiry. Turnstile is checked server-side first
  (section 6).
- **Claimed** by `POST /api/ghg/free-calc/claim` with a session (`getAuthedClient`), with either the calculation in
  hand or nothing (then the newest unexpired pending record for the session's verified email). The claim never
  reads a record for any other email. The used record is deleted.
- **Unclaimed records** expire. A daily cleanup deletes them, and the claim route also refuses expired ones.

**The claim route recomputes everything on the server.** It runs `figuresForSave(inventory, 'AR6')`
(`lib/ghg/savePayload.ts`), the same path handleSave uses, and inserts as the user (RLS applies), with `free_tier =
true` unless the user has an active plan. Nothing typed by the client is stored as a figure. The wizard keeps doing
its own saves from then on; only the first save, the one that creates the account, goes through the claim route.

---

## 2. The results email

**When it's sent:** only by the claim route, after a successful claim, so only after the address has been verified
by the code or the link. Nobody can send results to an address they don't control. "Email me my results again"
(signed in, own calculation only, rate-limited) uses the same builder.

**From and reply-to:** hello@themisiq.co (Q-L9). **Subject:** "Your Scope 1 and Scope 2 results: {company},
{reporting year}".

**Body** (plain HTML and a text part; built by a pure `lib/ghg/resultsEmail.ts` from the saved row, so it states what
the engine says):
1. "Hello {full name}," using the name exactly as typed, not a guessed first name. Then "Here are the results you
   calculated on ThemisIQ."
2. **Totals:** Scope 1; Scope 2 location-based; Scope 2 market-based where computed.
   - Where `s3_td` is present, a separate line, never added to the totals above: "Scope 3, Category 3: electricity
     transmission and distribution losses, calculated automatically from your electricity use. Full Scope 3 needs a
     GHG plan."
3. **By location:** each site, its country and grid region, Scope 1 and Scope 2.
4. **By source:** the lines from `buildWorkings` (fuel or energy, quantity and unit, factor and unit, tCO2e), at most
   15, then "and N more lines in your account".
5. **Factor editions:** from `factor_editions` on the saved row (the same values the CSV and PDF cite), with the GWP
   basis (AR6).
6. **Saved for you:** "This calculation is saved in your free ThemisIQ account. Open it any time: {link to
   /dashboard/ghg?id=…}."
7. **Next step** (Q-L10; one factual sentence, not a promotion): "A GHG plan adds Scope 3, document uploads, report
   downloads for each framework and more inventories. Plans start at ${GHG_TIERS.starter.priceUSD} a year." Price
   from `lib/pricing.ts`.
8. **Footer:**
   - "ThemisIQ, 11 Oak Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada. hello@themisiq.co. You received this because
     you asked for your results on themisiq.co."
   - The marketing unsubscribe link only if marketing consent was given.

Because the calculation includes typed figures, the email does not claim the figures are "traceable to source
documents". Free calculations have no uploads (section 3).

---

## 3. What the free account allows, and how the database enforces it

**The rule:**
- One free Scope 1 and Scope 2 calculation per account. It is editable and can be re-emailed.
- Needs a plan:
  - Scope 3;
  - uploads;
  - the guide;
  - Trends;
  - SBTi;
  - verifier sharing;
  - report downloads;
  - any further inventories.
- On purchase, the free calculation becomes the first inventory automatically (Q-L3).

| Feature | Server-side enforcement | New or existing |
|---|---|---|
| One free calculation | Column `ghg_inventories.free_tier`; partial unique index `ghg_inventories_one_free_per_user` on `(user_id) where free_tier`, so two concurrent inserts cannot both win; the rewritten trigger (below) | New |
| Saving without a plan | `enforce_ghg_location_allowance()` rewritten on top of the live FI0 body (name kept, so `trg_enforce_ghg_location_allowance` is untouched). Rules below | Changed |
| No overwrite of a real inventory | The trigger refuses any update of a non-free row without a plan; the claim route only inserts or updates `where id = … and free_tier`; the unique index refuses a collision (1.5b) | New |
| Scope 3 | New `trg_enforce_scope3_entitlement` BEFORE INSERT OR UPDATE ON `scope3_inventories`: active `ghg` plan required. **Needed before free accounts ship**, because a free account will have a saved inventory to bind to. `/api/scope3/spend-factor` also gets the active-plan check | New |
| SBTi | New `trg_enforce_sbti_entitlement` BEFORE INSERT OR UPDATE on the four `sbti_*` tables: active `ghg` plan. Same reason: they hang off the user's companies, which a free account will have | New |
| Uploads | ENF1 storage policy (active plan). The trigger also refuses a free row whose `locations_data` carries any `source_docs` | ENF1 + new |
| Bill Review reading | Existing: `/api/concierge/extract` term-aware check (route.ts:113) and `enforce_concierge_job_open` | Existing |
| Guide | ENF2 (`term_end > now()` in the route) | ENF2 |
| Verifier sharing | `trg_enforce_verifier_invite_term` | Existing |
| Downloads | ENF3 (server-built exports for active plans). Until then, the client gate (`isPaid` is false for a free account) | ENF3 |
| Trends | UI gate. The data is the account's own rows, so there's nothing to withhold server-side | Existing |
| Monthly rows (`ghg_monthly_emissions`) | Written by the save, as now, under owner RLS. They're the account's own data and feed only paid Trends | Existing |

**The rewritten trigger** (one `plpgsql` function, SECURITY DEFINER, `search_path = public, pg_catalog`, as the live
FI0 body). It keeps FI0's entitlement gate and its two messages, and adds the free-tier branch.

```
active := exists(entitlements where user_id = NEW.user_id and module_key = 'ghg' and term_end > now())
if active: return NEW                      -- paid: any row, any number (free_tier may stay true until converted)
-- no active plan from here
if TG_OP = 'UPDATE' and not OLD.free_tier: raise <FI0's expired or never-bought message>   -- real inventories read-only
if not NEW.free_tier: raise <FI0's message, as today>                                       -- only the free row may be written
if TG_OP = 'UPDATE' and OLD.free_tier is distinct from NEW.free_tier: raise 'This calculation cannot be changed this way.'
if jsonb_path_exists(NEW.locations_data, '$[*].source_docs[*]'): raise 'Uploading documents needs a GHG plan.'
-- the partial unique index enforces "one per account"; the client maps its 23505 to the one-free choice (1.5)
return NEW
```

**Conversion on purchase (Q-L3):**
- The Stripe webhook, after `grantFromMetadata` writes the `ghg` row, runs
  `update ghg_inventories set free_tier = false where user_id = $1 and free_tier`.
- It runs as the service role. The trigger allows it because the plan is now active.
- The free calculation becomes an ordinary inventory: the same id, figures, company and year.
- The customer lands on `/dashboard?purchase=success`, and `/dashboard/ghg` opens it (Trends-first, since they now
  have one inventory).

**Expired plans get free mode:**
- Their old inventories keep `free_tier = false`, stay readable, and cannot be updated (as today).
- They may save one new free calculation, which can never take an existing inventory's company and year (1.5b).
- `?start=new` already opens one for them (`entryWall`).
- On renewal, that row converts the same way.

**How it fits ENF1 to ENF3:**
- ENF1 (uploads) and ENF2 (guide) are prerequisites, because a free account is the first signed-in user without a
  plan who can reach the upload control and the guide with a saved inventory.
- ENF3 (server-built exports) stays post-launch as ruled. The results email already gives a free account its figures,
  so client-side downloads are no extra leak.

---

## 4. Data model and migration plan

All new tables and functions follow the grants rule (memory `grants-separate-from-rls`): revoke from `public`, `anon`
and `authenticated` first, then grant what is needed. New policies use `(select auth.uid())`. Each file opens with a
NOT RUN header and parses offline (pglast) before Lisa runs it.

| # | Migration | Contents |
|---|---|---|
| M1 | `2026MMDD_ghg_free_tier.sql` | **Pre-flight (Q-L4):** count `ghg_inventories` rows whose `user_id` has no `ghg` entitlement row; raise and change nothing unless the count is 0 (it was 0 on 4 Oct). Then `alter table ghg_inventories add column free_tier boolean not null default false` (every existing row becomes `false`, which is correct) and the partial unique index `ghg_inventories_one_free_per_user` |
| M2 | `2026MMDD_ghg_entitlement_gate_free_tier.sql` | Replace `enforce_ghg_location_allowance()` (section 3), building on the live FI0 body. **Before writing it**, run `docs/review/patches/FI0-verify.sql` and `pg_get_functiondef('public.enforce_ghg_location_allowance()'::regprocedure)` against live and diff with the FI0 file, so M2 starts from what is actually there. FI0-verify's "body does not read location_allowance" check always fails, because the function's own name contains that string; M2's verify checks the body only (`prosrc`) |
| M3 | `2026MMDD_scope3_sbti_entitlement.sql` | `enforce_scope3_entitlement()` and `enforce_sbti_entitlement()` plus their triggers. Pre-flight: count Scope 3 and SBTi rows whose owner has no active plan (expected 0; report, do not delete) |
| M4 | `2026MMDD_free_calc_pending.sql` | `free_calc_pending(id uuid pk default gen_random_uuid(), email text not null, email_key text not null, payload jsonb not null, ip text, created_at timestamptz not null default now(), expires_at timestamptz not null)`, index on `(email_key, created_at)`, RLS on with no policy, service role only |
| M5 | `2026MMDD_marketing_consents.sql` | `marketing_consents(id uuid pk, user_id uuid references auth.users on delete set null, email text not null, purpose text not null check (purpose in ('updates')), granted boolean not null, wording text not null, wording_version text not null, source_page text not null, ip text, user_agent text, created_at timestamptz not null default now(), withdrawn_at timestamptz)`. RLS on, owner SELECT policy, writes by service role only. A withdrawal sets `withdrawn_at`; a record of consent is kept for the retention period after it ends |
| M6 | `2026MMDD_profiles_on_signup.sql` | See below |
| M7 | ENF1 storage migration | As designed in section 11 |

**M6 (fix 4).**
- **Columns:** add `profiles.full_name text`, `signup_source text` and `country text`. Existing `first_name` and
  `last_name` stay for password sign-ups, which send them.
- **Function:** `public.handle_new_user()`, `returns trigger`, `language plpgsql security definer set search_path =
  ''`. It inserts into `public.profiles (id, email, first_name, last_name, full_name, company, signup_source)` from
  `new.id`, `new.email` and `new.raw_user_meta_data` (`first_name`, `last_name`, `full_name`, `company`,
  `signup_source`), with `on conflict (id) do nothing`.
- **Never blocks sign-up:** the body is wrapped in `begin … exception when others then raise warning
  'handle_new_user: %', sqlerrm; end;` and returns `new` in every case. A failure leaves the account without a
  profile, which the backfill or the claim route repairs.
- **Trigger:** `on_auth_user_created` AFTER INSERT ON `auth.users` FOR EACH ROW.
- **Backfill (one-off, in the same file):** insert a profile for every `auth.users` row without one, from the same
  metadata, with `on conflict do nothing`. Report the count inserted.
- **Grants:**
  - revoke all on the function from `public`, `anon` and `authenticated` (a trigger function needs no execute
    grant to fire);
  - on `profiles`: grant SELECT, INSERT, UPDATE to `authenticated` (the existing owner policies then apply) and
    SELECT, INSERT, UPDATE to `service_role` (the claim route and the leads page). Today neither role can read or
    write it (section 0).
- **The claim route** then updates the profile (service role): `full_name` and `company` as typed,
  `signup_source = 'free_calc'`, and `country` from the first location.

No change is needed to `entitlements`. "Free account" is not an entitlement row: it's the absence of an active `ghg`
row plus the `free_tier` inventory. Writing a $0 entitlement would make every `module_key = 'ghg'` check (trigger,
hooks, routes) treat a free account as a customer.

---

## 5. CASL and privacy

**Marketing consent.** A separate, unticked box: "Send me occasional ThemisIQ updates about emissions reporting. You
can unsubscribe at any time." Account creation does not depend on it.
- **Record** (`marketing_consents`): the exact wording shown and its version, the timestamp, the source page (for
  example `/dashboard/ghg` step 4), the email, the user id once verified, and the IP and user agent (Q-L5).
  - CASL puts the burden of proving consent on the sender. IP and user agent are personal data under GDPR and
    PIPEDA; they are kept for proof of consent only and deleted with the record.
- **Unsubscribe:**
  - every marketing email carries a one-click link (signed token, `HMAC(consent_id)` with a new server secret; Lisa
    names the variable, never the value) and a `List-Unsubscribe` / `List-Unsubscribe-Post` header;
  - withdrawal takes effect immediately (CASL allows 10 business days);
  - the account page also shows the setting.
- **Sender identification in every email:** results, sign-in code, re-email, renewal and marketing. "ThemisIQ, 11 Oak
  Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada. hello@themisiq.co". The Supabase templates carry it too
  (section 10.3); those auth emails are sent from noreply@themisiq.co and name hello@themisiq.co for questions.

**Privacy policy (`app/privacy/page.tsx`):**
- "What we collect" (line 74): a free-account row (name, work email, company, one Scope 1 and Scope 2 calculation,
  country from it, sign-in records, and for consent records the IP and user agent).
- "How we use your data" (line 95): sending the results you asked for, keeping your calculation, sign-in codes;
  marketing only with the separate consent.
- "Data retention" (line 155): a new row, "Free accounts that never upgrade: 24 months from last sign-in, with notice
  30 days before deletion". The current "Account and contact data: 7 years from last activity" row is for customers
  with billing records, and the policy must say which row applies to whom.
- Subprocessors: Resend now also sends sign-in emails (via Supabase SMTP); Cloudflare Turnstile.

**Terms (`app/terms/page.tsx`).** A new section, "Free accounts":
- no fee;
- one Scope 1 and Scope 2 calculation;
- no uploads, downloads or Scope 3 without a plan;
- provided as is;
- ThemisIQ may delete free accounts with no sign-in for 24 months, after 30 days' notice;
- the business-capacity statement in section 1 applies.

The section numbers after it move, so check every link to `/terms#tN`.

**Retention for free accounts that never upgrade (Q-L2):**
- An account with no active or past `ghg` entitlement, no other module and no sign-in for **24 months** is emailed:
  "Your free ThemisIQ account will be deleted on {date}. Sign in to keep it."
- 30 days later it is erased with `scripts/erase-account.mjs`, and `erasure_log` records it.
- Marketing consent records are kept 3 years from the last interaction (existing privacy row), then deleted.

**Open items for Lisa's lawyer:**
1. **CASL review of the results email:** confirm it falls under one of the CASL s.6(6) exemptions for messages the
   recipient requested or that concern a service they use, and so needs no consent. It carries one sentence naming the plan and its price,
   which is factual but could be read as promotional; confirm it can stay without express consent, or must go.
2. **Follow-up to sign-ups who did not tick the updates box:** whether creating a free account is an inquiry that
   gives implied consent (CASL s.10(9)–(10): six months from the inquiry), or a relationship that does not. That
   decides whether any non-transactional email may go to them at all, and for how long.
3. **The privacy and Terms additions** above, and the 24-month deletion with notice.

---

## 6. Abuse

**Fix 1: bot protection that cannot be bypassed.**
- **The problem:** a Turnstile check only in `/pending` can be skipped by calling `signInWithOtp` directly with the
  public anon key, which sends a code to any address, so it doesn't prevent email bombing.
- **The fix:** turn on **Supabase Auth's CAPTCHA protection with Cloudflare Turnstile**. Supabase then refuses every
  `signUp`, `signInWithPassword`, `signInWithOtp` and `resetPasswordForEmail` call that does not carry a valid
  `captchaToken`, whoever calls it.
  - Admin API calls with the service role are not affected: the webhook's `generateLink` and `createUser` in
    `lib/order/provision.ts`.
  - `verifyOtp` is not affected.
- **Consequence:** the token is then required on the existing password sign-up, login and password-reset pages too.
  L2 adds the Turnstile widget to:
  - `app/signup/page.tsx`;
  - `app/login/page.tsx`;
  - `app/forgot-password/page.tsx`;
  - the "Keep my results" modal;
  - the login page's code option.

  Each passes `options: { captchaToken }`.
- **Order (section 10):** the code goes live first (Supabase ignores the token while CAPTCHA is off), and CAPTCHA is
  switched on second, so sign-in never breaks in between. Switching CAPTCHA off is the immediate rollback.
- **The `/pending` route also verifies Turnstile** server-side (a second widget token, since each is single-use;
  Cloudflare siteverify with `TURNSTILE_SECRET_KEY`), so the pending table can't be filled by scripts either.

| Threat | Control |
|---|---|
| Scripted sign-ups and email bombing | Supabase Auth CAPTCHA (above); Turnstile on `/pending`; the honeypot (`HONEYPOT_FIELD`); `lib/rateLimit.ts` buckets `free-calc-ip` (5 an hour) and `free-calc-email` (3 a day); Supabase's own OTP limit (one per address per 60 s) and its email rate limit |
| Disposable addresses (Q-L6) | A static blocklist of disposable domains in `lib/` (no network call), refused with "Please use your work email." Free webmail (gmail.com and similar) is allowed |
| One person, many free accounts | Low value to abuse (the calculator is free without an account anyway). A per-IP cap on new free accounts per day (bucket `free-calc-claim-ip`), plus normalising `email_key` (lower case; Gmail dots and `+tags`) for rate limits |
| Re-email abuse | Signed in, own calculation only; 3 a day per account |
| Oversized drafts | `/pending` refuses payloads over 256 KB and more than 50 locations |
| Pending-record access | The claim requires a session and reads only records for the session's verified email; expired records are refused |

---

## 7. Lisa's view of leads

**A page at `/admin/leads`.** It's a server component that refuses unless the signed-in user's email equals
`ADMIN_EMAIL` (the `create-invoice` pattern). It reads with the service-role client, server-side only, which needs
the M6 SELECT grant on `profiles`.

| Column | Source |
|---|---|
| Name, email, company | `profiles` (M6) |
| Signed up | `auth.users.created_at`; source `profiles.signup_source` |
| Country | `profiles.country` (from the first location of the free calculation) |
| Scope 1, Scope 2 (location) | `ghg_inventories` where `free_tier`, or the first inventory once converted |
| Marketing consent | Latest `marketing_consents` row: yes/no, date, withdrawn date |
| Upgraded | Any `entitlements` row for `ghg`: tier, `term_start`, active or expired |
| Last sign-in | `auth.users.last_sign_in_at` |

- **Filters:** consent yes/no, upgraded yes/no, date range.
- **CSV:** `GET /api/admin/leads.csv` with the same check, using `lib/csv.ts`, and the same columns.
- **Pending (unverified) counts** are shown as a number only, never as names or emails: those people haven't
  confirmed the address is theirs.

---

## 8. Copy changes (proposals; not changed by this document)

| Where | Today | Proposed |
|---|---|---|
| `lib/pricingCopy.ts:51` `GHG_FREE_USE_SENTENCE` (used on /calculate-emissions ×4 and in the wizard banner) | "Scope 1 and Scope 2 can be calculated free, in your browser, without an account, with your results emailed to you directly." | "Scope 1 and Scope 2 can be calculated free, in your browser, without an account. Create a free account to get your results by email and keep your calculation." |
| `lib/pricingCopy.ts` `GHG_PLAN_USE_SENTENCE` | "Saving, Scope 3, document uploads, the GHG guide, Trends, SBTi targets, verifier sharing and report downloads need a GHG plan." | "Scope 3, document uploads, the GHG guide, Trends, SBTi targets, verifier sharing, report downloads and more than one inventory need a GHG plan." |
| `lib/pricingCopy.ts:72` `FREE_CALC_SUBLINE` (under every calculator button, and the mobile menu) | "In your browser, no account needed." | "No account needed to start. Create a free account to keep your results." |
| /calculate-emissions footnote (`page.tsx:465`) | "…and your results will be emailed to you directly. Nothing is saved in ThemisIQ until you have a GHG plan. A GHG plan … adds saving, Scope 3 and report downloads…" | "*Your Scope 1 and Scope 2 figures are calculated in your browser, instantly and at no cost. Create a free account to get your results by email and keep your calculation. A GHG plan, from $550 USD a year, adds Scope 3, report downloads and more inventories under any framework you need: SB 253, CSRD (ESRS E1), IFRS S2 and more." |
| /calculate-emissions FAQ "Can I try it before I pay?" (`:188` search version, `:733` visible) | "…Nothing is saved until you have a GHG plan…" | "…Nothing is saved until you create a free account, which keeps one Scope 1 and Scope 2 calculation…" |
| /calculate-emissions step 04 (`:552`) | "Then enter your email address and we'll send your results to you directly." | "Then create a free account and we'll email your results to you and keep your calculation." |
| /calculate-emissions step 05 title and text | "Choose a plan, save and download" / "…Then save your inventory, add Scope 3, and download…" | "Choose a plan for Scope 3 and downloads" / "…Then add Scope 3 and download…" |
| Wizard Save, signed out (`app/dashboard/ghg/page.tsx:1628`) | Pop-up "Saving needs the GHG module. …", then pricing | The free-account form (1.1) |
| Wizard banner, no plan with a saved row (`:3426`) | "Saving needs the GHG module. You can read this inventory, but changes will not be kept." | Free row: "This is your free calculation. You can edit it and email it to yourself. Scope 3, uploads and downloads need a GHG plan." A real inventory on an expired plan: unchanged |
| Wizard unsaved-changes banner (`:3466`) | "Saving needs the GHG module. Your figures are kept…" | Signed out: "Create a free account to keep this calculation." Free slot used: "Your free account keeps one calculation." |
| Export overlay (`:386`, `:395`) | "The module adds the downloads, the assurance package and saving." / "Save and update your inventory for 12 months from purchase" | "The module adds the downloads, the assurance package, Scope 3 and more inventories." / "Save and update more than one inventory for 12 months from purchase" |
| Renew wall, expired (`:320`) | "Renewing turns saving back on. …" | "Renewing turns saving back on for your inventories, which are still here and readable. You can also keep one free calculation." |
| Scope 3 picker (`app/dashboard/scope3/page.tsx:4479`, `:4492`) | "You need a saved GHG inventory first…" / "…is part of the GHG plan." | Unchanged, plus, for a free account whose free calculation is listed: "Scope 3 for this calculation is part of the GHG plan." |
| `app/signup/page.tsx` success text | "…start your free assessment." | Unchanged: this page stays the password sign-up |

**Tests to update with the copy:**
- `lib/freeClaims.test.ts` FC1/FC2: the plan sentence no longer lists saving; FC2's check on
  `GHG_FREE_USE_SENTENCE` still holds.
- `lib/freeCalcCta.test.ts`:
  - FCC1 renders `FREE_CALC_SUBLINE` (new text);
  - FCC3 forbids "save" in the sub-line: "keep your results" passes, so check the forbidden list still describes
    the rule;
  - FCC8 (the mobile menu sub-line).
- `lib/calcCopy.test.ts` CC4: pins the current footnote and `GHG_FREE_USE_SENTENCE`.
- `docs/review/free-claims-audit.md` is then historical.

---

## 9. Tasks, in order

Each task is a small patch with its own tests and a full `npm run build`.

| # | Task | Tests | Days |
|---|---|---|---|
| L0 | **Prerequisites:** ENF1 (uploads) and ENF2 (guide), as designed in section 11 | As designed | 1.5 |
| L1 | **Database:** M1 (pre-flight asserts 0), M2 (on the live FI0 body), M3 (Scope 3, SBTi), M6 (profiles trigger, backfill, grants), with verify SQL | pglast parse; `docs/review/patches/LEAD1-verify.sql` runs every rule inside a transaction that rolls back: insert free; second free refused; real row refused when expired; flip refused; source_docs refused; Scope 3 and SBTi refused without a plan; active plan unrestricted; a new auth user gets a profile; a failing profile insert does not block the user | 2.5 |
| L2 | **Sign-in and auth fixes:** code sign-in; `/auth/confirm` client page; "Email me a sign-in code" on /login; Turnstile widget and `captchaToken` on signup, login, forgot-password and the modal; **fix 3:** `app/auth/callback/route.ts` replaced by a client page | A pure `callbackAction(url)` decides fragment tokens (supabase-js picks them up), `?code` (`exchangeCodeForSession` in the browser), `token_hash` (`verifyOtp`) or nothing, and is tested for each; a source test that no auth page uses `createServerClient`; each auth call passes `captchaToken`; manual: a code signs in on a second device; the webhook's first-login link still lands signed in | 3 |
| L3 | **Pending and claim:** M4; `/api/ghg/free-calc/pending` (Turnstile, size caps, rate limits) and `/claim`; server recompute; one-free and conflict handling; profile update | Route tests with mocked Supabase: claim refused for a mismatched email, an expired record or a second free; recompute ignores client totals; record deleted on claim; replace updates only `where … and free_tier`. **Fix 2 tests:** an active-plan user with an existing inventory for the same company and year gets the conflict, and the existing row is untouched; an expired-plan user in the same position gets the same; a later free save that changes year into a collision is refused with nothing written | 2.5 |
| L4 | **Wizard:** prompt placements, modal, code entry, one-free choice, conflict choice, Save routing, banners | `lib/ghg/entry.test.ts` extended for each visitor; the four-outcome save decision; source tests for the placements; the draft stays in localStorage while the code is pending | 3 |
| L5 | **Results email:** `lib/ghg/resultsEmail.ts`, send on claim, the re-email route | Model from a fixture: the greeting uses the full name as typed; totals; the labelled `s3_td` line, kept out of the totals; by location; by source (15 + "N more"); editions; price from `GHG_TIERS`; footer address and hello@themisiq.co; no "traceable" claim | 1.5 |
| L6 | **Consent and unsubscribe:** M5, the box, `/unsubscribe` page and route, headers | Box unticked by default; record has wording, version, IP and user agent; token round trip; tampered token refused; withdrawal immediate and never deletes the record | 1.5 |
| L7 | **Abuse:** disposable list, rate buckets, size caps (Turnstile itself is in L2 and L3) | Each refusal path returns its plain message; honeypot drops silently | 0.5 |
| L8 | **Purchase conversion:** webhook converts `free_tier`; first-inventory landing | Webhook test: grant then conversion order; trigger allows it | 0.5 |
| L9 | **Lisa's leads:** `/admin/leads` and CSV | Non-admin refused; CSV columns; pending shown as a count only | 1.5 |
| L10 | **Copy and legal text:** section 8 copy, privacy rows, Terms section | The updated tests listed in section 8; a test that every email template carries the postal address | 1 |
| L11 | **Retention job:** daily cron, 30-day notice, erase after 24 months | Due-window edges; notice before erase; `erasure_log` written | 1.5 |

**Total: 20.5 working days, or 19 without the retention job, which can follow launch.** The 4 days added since the
first draft:
- the callback fix and the CAPTCHA widgets on three existing pages (L2, +1.5);
- the conflict handling and its tests (L3 +0.5, L4 +0.5);
- the profiles trigger, backfill and grants (L1 +0.5);
- less in L7 (−0.5), since Turnstile moved to L2 and L3.

Launch-blocking:
- L0 to L8 and L10;
- the current site copy that says results are emailed (calc-copy, on main; see section 11's LEAD1 blocker), which L10
  replaces.

### Open questions

None open for Lisa in this document. The three items in section 5 are for her lawyer.

---

## 10. Supabase, Cloudflare and Vercel checklist (Lisa)

### 10.1 Done on 4 Oct 2026 (recorded from Lisa)

| Setting | As set | Note |
|---|---|---|
| Supabase custom SMTP | ON, through Resend. Sender "ThemisIQ <noreply@themisiq.co>" | Supabase sends **only auth emails** from noreply@: sign-in codes, sign-up confirmations, password resets |
| App email | Sent through the Resend API from "ThemisIQ <hello@themisiq.co>", reply-to hello@themisiq.co | The results email, re-email, renewal and marketing (sections 2 and 5) |
| Email rate limit | 100 an hour | |
| Email OTP length | 6 | |
| Email OTP expiry | **3600 s (1 hour), deliberately** | The same setting governs sign-up confirmation links and the purchase email's first sign-in link, so shortening it to 10 minutes would also cut those to 10 minutes. Codes therefore work for 1 hour; every template and screen says 1 hour, never 10 minutes |
| Redirect URLs | `https://themisiq.co/**` and `https://themisiq-*-lisa-foster-s-projects.vercel.app/**`. **Amended 5 Oct 2026:** `https://www.themisiq.co/**`, `https://themisiq.co/**` and the preview pattern | Covers /auth/callback, /auth/confirm and /reset-password in production and previews. The apex entry stays for links already sent |
| Turnstile widget | Created, Managed mode, hostnames `themisiq.co` and `www.themisiq.co` only | Previews and local development cannot use it; they use Cloudflare's test key (10.2) |
| Email templates | **Done 4 Oct 2026, after L2 went live** (10.3, step 3) | "Magic Link": subject "Your ThemisIQ sign-in code: {{ .Token }}", body with `{{ .Token }}`, a link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and the footer. "Confirm signup": `{{ .ConfirmationURL }}` plus `{{ .Token }}` and the footer. "Reset Password": footer added. A typed code and the link opened on a phone were both tested on production |
| Supabase CAPTCHA protection | **OFF, by decision (Lisa, 4 Oct 2026)** | Stays off until the launch checklist (10.4), so sign-in keeps working on previews and locally while L3 to L9 are built and tested (10.2 explains why it would not) |

### 10.1b Canonical host: https://www.themisiq.co (decided by Lisa, 5 Oct 2026)

| Setting | As set | Note |
|---|---|---|
| Vercel | `www.themisiq.co` is the Production domain; the apex `themisiq.co` 307-redirects to it | Already so before the decision; the decision makes the code agree with it |
| Supabase Site URL | `https://www.themisiq.co` (was the apex) | `{{ .SiteURL }}` in the "Magic Link" template, so the code email's link opens on www |
| Supabase redirect URLs | `https://www.themisiq.co/**`, `https://themisiq.co/**`, the preview pattern | See 10.1 |
| Turnstile hostnames | `www.themisiq.co` and `themisiq.co` | |
| Code | `lib/siteOrigin.ts` `SITE_ORIGIN = 'https://www.themisiq.co'`, the one constant for links the server writes (results email, invites' fallback, the purchase email's first sign-in link fallback, sitemap, robots.txt, metadataBase) | `lib/siteOrigin.test.ts` fails on any other hard-coded origin in app/ or lib/ |
| DNS | Vercel's recommended CNAME for www could not be saved at GoDaddy (another record is flagged invalid); the legacy CNAME remains and works | **Not in scope now.** Revisit before launch if Vercel starts warning on the domain |

⚠️ **A sign-in session is stored per origin.** One made on the apex is not visible on www, which is why everything that
writes a link now writes www: a link to the apex costs a redirect and lands where the session is not.

### 10.2 Turnstile keys by environment

The code chooses the site key (`lib/auth/turnstileKey.ts`, L2):
- **production** (`NEXT_PUBLIC_VERCEL_ENV` is `production`): `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; with it unset, no widget and nothing changes;
- **previews and local development:** Cloudflare's published always-pass **test** site key, in the code. It is public
  (https://developers.cloudflare.com/turnstile/troubleshooting/testing/) and protects nothing, which is the point.

So the real site key is set for **Production only**, and nothing is set for Preview or Development.

⚠️ **After CAPTCHA protection is switched on (step 5), sign-up, password login, code sign-in and password reset stop
working on previews and locally.** Supabase checks every token against the one real secret, and a test-key token
fails that check. Production is unaffected. After step 5, test auth flows on production, or decide on a separate
Supabase project for previews (a larger change, not planned). Everything else on a preview keeps working.

### 10.3 What to do, in order

1. **Vercel env vars, BEFORE deploying L2.** `NEXT_PUBLIC_` values are fixed at build time, so they must be in place
   when the L2 build runs. Vercel → Project → Settings → Environment Variables:

   | Name | Environments | Which key |
   |---|---|---|
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Production only** | The **site key** of the Turnstile widget created on 4 Oct (Cloudflare → Turnstile → the widget → Site key). Public by design: it is sent to every browser |
   | `TURNSTILE_SECRET_KEY` | **Production only** | The widget's **secret key**. Not read by L2. L3's `/pending` route verifies tokens with it (L3 picks Cloudflare's test secret for previews, the same way). It can be added now; it must never have the `NEXT_PUBLIC_` prefix |

   Also check that Settings → Environment Variables → "Automatically expose System Environment Variables" is on
   (Vercel's default). That is what gives the browser `NEXT_PUBLIC_VERCEL_ENV`. Without it, production would use the
   test key, which still passes while CAPTCHA protection is off, so nothing breaks, but step 5 would then refuse
   everyone.

2. **Deploy L2** (merge and push). While templates and CAPTCHA are unchanged:
   - password sign-up, login and reset work exactly as before;
   - the Turnstile widget shows on sign-up, login and forgot-password, and Supabase ignores its token;
   - sign-up confirmations and the purchase email's first sign-in link finish in the browser (the fixed /auth/callback).
   - "Email me a sign-in code" on /login sends Supabase's DEFAULT magic-link email, which has a link but no code,
     until step 3. Do step 3 straight after the deploy.

3. **Supabase → Authentication → Emails → Templates, straight after the deploy.** These emails come from
   noreply@themisiq.co.

   **"Magic Link"** (sign-in codes for existing accounts, from /login now and the free-account form in L4):

   Subject: `Your ThemisIQ sign-in code: {{ .Token }}`

   ```html
   <p>Your ThemisIQ sign-in code is:</p>
   <p style="font-size:24px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>Type it on the page where you asked for it. It works for 1 hour.</p>
   <p>Or open this link on any device:
     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to ThemisIQ</a></p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   <hr>
   <p style="font-size:12px;color:#555">ThemisIQ, 11 Oak Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada.
     Questions: hello@themisiq.co</p>
   ```

   **"Confirm signup"** (new accounts: password sign-ups today, and code sign-ups from the free-account form in L4):

   Subject: `Confirm your ThemisIQ account`

   ```html
   <p>Confirm your email to finish creating your ThemisIQ account:</p>
   <p><a href="{{ .ConfirmationURL }}">Confirm my email</a></p>
   <p>If you were asked for a code, it is:</p>
   <p style="font-size:24px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>The link and the code work for 1 hour. If you didn't sign up, you can ignore this email.</p>
   <hr>
   <p style="font-size:12px;color:#555">ThemisIQ, 11 Oak Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada.
     Questions: hello@themisiq.co</p>
   ```

   ⚠️ **Why "Confirm signup" keeps `{{ .ConfirmationURL }}` instead of a fixed /auth/confirm link.**
   - That link returns the visitor to the address their sign-up asked for: `/auth/callback?next=…` for a password
     sign-up, which is how a sign-up started from checkout lands back on the order, and `/auth/confirm` for a code
     sign-up (L4 sets that).
   - A fixed `/auth/confirm` link would drop `next`, and every password sign-up would land on the calculator instead
     of where they were going.
   - The page it reaches (L2's /auth/callback or /auth/confirm) completes the sign-in in the browser either way.

   **"Reset Password":** keep the body and link, and add the same footer line.

   Then test on production:
   - a code from /login, typed;
   - the same email's link opened on a phone;
   - a password sign-up confirmation;
   - a password reset.

4. **Re-check the purchase email's first sign-in link** (make a test purchase, or ask a customer who bought since the
   deploy). It uses the admin API and the fixed /auth/callback, and is not affected by steps 3 or 5.

5. **LAST, AT LAUNCH (moved to the launch checklist, 10.4, by decision on 4 Oct 2026): Supabase → Authentication →
   Attack Protection → Enable CAPTCHA protection.** Provider: Cloudflare
   Turnstile. Secret key: the widget's secret key (the same one as `TURNSTILE_SECRET_KEY`). Save.

   Test straight away, on production:
   - password sign-up (new address);
   - password login;
   - forgot password;
   - a sign-in code typed on /login;
   - the code email's link on a phone.

   A refusal reads "The security check didn't complete. Please try again." If that appears for a real visitor whose
   widget showed, CAPTCHA is not working as intended.

   **Rollback:** turn "Enable CAPTCHA protection" off again. Sign-in returns at once to how it was after step 4, and
   nothing else needs undoing. Previews regain auth flows at the same moment (10.2).

### 10.4 Launch checklist (before the free account is announced)

Each item is a launch blocker unless marked otherwise.
1. **L0 to L8 and L10 merged and live**, and every L-migration RUN with its verify script passed: L0-ENF1, L1 (M1, M3,
   M2, LEAD1-verify), L3 (M4, M6, and their verify scripts).
2. **The "results emailed" copy on main** is replaced by L10's wording, or "Email me my results" works end to end
   (section 9).
3. **Supabase CAPTCHA protection ON**, as in 10.3 step 5:
   - Authentication → Attack Protection → Enable CAPTCHA protection;
   - Cloudflare Turnstile, with the widget's secret key (the same value as Vercel's `TURNSTILE_SECRET_KEY`).

   Test the five paths on production at once: password sign-up, password login, forgot password, a code typed on
   /login, and the code email's link on a phone. **Rollback:** switch it off again. From this point, auth flows on
   previews and locally stop working (10.2); test them on production.
4. **`TURNSTILE_SECRET_KEY` is set for Production** in Vercel. Without it, `/api/ghg/free-calc/pending` skips its own
   Turnstile check and logs "TURNSTILE_SECRET_KEY is not set: Turnstile was NOT verified" on every hold; that line in
   production logs means this item is not done.
5. **Lawyer review** of the items in section 5 (CASL and the privacy and Terms additions).
6. **Canonical host is www everywhere (10.1b).** Check on production:
   - `https://themisiq.co` redirects to `https://www.themisiq.co`;
   - a sign-in code email's link opens on `https://www.themisiq.co/auth/confirm`;
   - the results email's link opens on `https://www.themisiq.co/dashboard/ghg?id=…`;
   - `https://www.themisiq.co/robots.txt` names `https://www.themisiq.co/sitemap.xml`.
   The GoDaddy DNS warning (10.1b) is not a blocker while the legacy CNAME serves www.

