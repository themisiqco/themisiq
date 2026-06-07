# Verification Readiness — Billing & Entitlement Build Spec

**Status:** Planned. Blocked on Stripe account (expected within a few days). Do not start until Stripe is live — every piece needs real price IDs and a webhook endpoint to test against.

**Purpose:** Capture all decisions made so that Stripe day is execution, not re-deciding.

---

## 1. Where we are today

- The **Verification Readiness landing page** is built, on-brand, and live at `/verification-readiness`. CTAs currently point to `mailto:hello@themisiq.co` as a temporary "buy by email" path until checkout exists.
- The **verifier-access machinery already exists**: `VerifierInvite` component (`app/dashboard/ghg/page.tsx`, ~line 2017) generates secure, read-only, per-inventory links at `/verify/{token}`, backed by a Supabase `verifier_access` table. Links are revocable with a 90-day expiry.
- **No billing/entitlement layer exists yet.** `app/dashboard/ghg/page.tsx` line 833 is `const isPaid = true // TODO: wire to Stripe`. Nothing is actually gated. There is no `profiles` / `subscriptions` / `entitlements` table today — this layer is built from scratch on Stripe day.

---

## 2. Pricing & purchase model

- **Base — Climate-GHG (Scope 1 & 2):** $1,499. **One-time** purchase. Grants **12 months** of account access.
- **Add-on — Verification Readiness:** $499. **One-time.** Separate purchase, but selectable at the base purchase decision.
- **Bundled checkout:** if the add-on is selected at checkout, both line items are charged together — **one payment of $1,998, one card.** If not, $1,499 now and the add-on can be bought later.
- One payment, but **two distinct entitlements** behind it (see §3). Bundling happens at checkout; entitlements stay separate so "add it later" works without rebuilding.

---

## 3. Entitlement layer (build first)

New Supabase table, e.g. `entitlements`:

| Field | Type | Meaning |
|---|---|---|
| `user_id` | uuid | FK to the customer |
| `is_paid` | bool | Base plan purchased |
| `has_verification` | bool | $499 add-on purchased |
| `access_expires_at` | timestamptz | Account access window end |
| `stripe_payment_id` | text | Reference to the charge |

**Active access logic** (replaces the hardcoded `isPaid = true`):

> A capability is active when its flag is `true` **AND** `access_expires_at` is in the future.

- `isPaid` (line 833) → reads `is_paid AND not expired`. Gates document uploads + report downloads (as today).
- `VerifierInvite` (line ~2017) → gate behind **`has_verification` AND not expired** — *not* `isPaid`. Verification access is the add-on and needs its own flag.

---

## 4. Stripe setup

- Two one-time **prices**: base **$1,499**, add-on **$499**.
- Checkout session uses **`mode: payment`** (one-time, not subscription — matches the 12-month-access decision).
- The add-on toggle at checkout controls whether the $499 line item is included. Selecting it → one session, two line items, $1,998.

---

## 5. Webhook (on `checkout.session.completed`)

1. Read which line items were paid.
2. If base line item present → `is_paid = true`.
3. If add-on line item present → `has_verification = true`.
4. Set `access_expires_at = max(current access_expires_at, now + 12 months)`.
   - Any purchase extends the whole account window. Buy base in Jan, add-on in Apr → access runs to the following Apr.
5. Record `stripe_payment_id`.

---

## 6. "Add it later" path

- Standalone $499 `mode: payment` checkout for existing base customers.
- Same webhook: flips `has_verification = true` and refreshes `access_expires_at` via the same `max(...)` rule.

---

## 7. Access & expiry model (two clocks)

**Customer access — account-level, generous.**
- One `access_expires_at` per customer. Any purchase sets it to `max(current, now + 12 months)`.
- While in the future, the customer can open **all** their inventories, modules, and historical data.

**Verifier link access — per-engagement, separate.**
- Governed by existing `verifier_access` records: per-link **90-day** expiry, revocable, scoped to one inventory.
- **Not** affected by customer account renewals. An expired or revoked verifier link stays closed regardless of any later customer purchase. (This is required for independence — a verifier should only see the one inventory they were invited to, for a bounded time.)

---

## 8. Data retention — reconciled with published policy (Privacy Policy §7)

Published policy: **Customer platform data = "Subscription duration + 90 days" (basis: Contract).** The access model must fit inside this.

- **Access** closes at `access_expires_at` (last purchase + 12 months).
- **Data** is retained for a further **90 days** after access closes (the "+ 90 days" in the policy). A re-purchase within this grace window fully restores access.
- **After the 90-day grace,** platform data is eligible for deletion per policy. A much-later purchase starts **fresh**, not restored — so "buy again and it all comes back" is only guaranteed within the grace window.
- **Billing records** (7 years) and **audit/security logs** (5 years) persist on their own clocks regardless of platform-data purge. Deleting inventory data ≠ deleting everything.

---

## 9. UI change that can ship before Stripe (low risk)

- Add a **discovery card** on the Export step (`renderStep5`, the `step === 5` block) linking to `/verification-readiness`. Style it to match the existing Scope 3 prompt cards (green `#E1F5EE` / `#0F6E56`, message left, action button right). Visible to everyone — it is marketing for the add-on, no billing involved.

---

## 10. Open items for legal / product (not blockers)

1. **Policy wording:** §7 says *"subscription duration"* but the GHG module is a one-time purchase with 12-month access. Intent works, but consider broadening the wording to cover "purchased access period" so "subscription" isn't read narrowly. → legal review.
2. **Verifier links at customer lapse:** confirmed they stay on their own 90-day clock and do **not** revive on customer re-purchase. (Decided.)
3. **Add-on bought separately later:** its 12 months align to the account window via `max(...)`, i.e. extends from the later purchase. (Decided.)

---

## 11. Execution order for Stripe day

1. Build the `entitlements` table.
2. Create the two Stripe prices ($1,499, $499).
3. Build the bundled `mode: payment` checkout + the add-on toggle.
4. Build the webhook (set flags + `max()` expiry + retention timestamp).
5. Replace `const isPaid = true` (line 833) with the real entitlement read.
6. Gate `VerifierInvite` (line ~2017) behind `has_verification`.
7. Wire the "add it later" standalone $499 checkout.
8. Swap the landing-page `BUY_URL` from `mailto:` to the real checkout URL.
9. Build the access-expiry + 90-day retention purge job (cron / scheduled function).

---

*This spec reflects decisions made with the team. ThemisIQ is a software provider and is not an accredited assurance or verification provider; verification is performed by an independent third party chosen by the customer.*

## Supabase GRANTs required for entitlements (added 2026-06-07)

These privileges were applied directly in the Supabase dashboard (no migration file).
They MUST be re-applied in any rebuilt or new Supabase environment, or entitlement
writes/reads will fail silently:

1. Webhook writes (service_role):
   GRANT SELECT, INSERT, UPDATE ON public.entitlements TO service_role;

2. In-app entitlement reads (authenticated user, scoped by RLS policy
   "read own entitlements" = auth.uid() = user_id):
   GRANT SELECT ON public.entitlements TO authenticated;

Without #1, the Stripe webhook handler returns 500 ("permission denied for table
entitlements"). Without #2, useEntitlement() returns false for everyone and locks
out paying customers.
