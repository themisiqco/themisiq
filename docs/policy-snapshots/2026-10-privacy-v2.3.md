# ThemisIQ Privacy Policy: record of v2.3

**Effective: October 6, 2026 · TIQ-PRV-001 · v2.3**

## Why this file exists

The Privacy Policy lives only in `app/privacy/page.tsx` and is edited in place. This records what v2.3 changed from
v2.2, word for word, so the wording a reader saw is not lost when the page is next edited. [`2026-09-privacy-v2.2.md`](2026-09-privacy-v2.2.md)
is the record of v2.2 and is not edited to match this one.

**A change record, not a fresh full extraction.** Every sentence v2.3 adds or changes is quoted below exactly as it
ships (the free-account text is read from `lib/legal/freeAccountCopy.ts`, which the page renders). Everything not
listed is as in the v2.2 snapshot, with the amendments listed under "Carried in" below. A hand re-extraction of the
whole page would risk transcription differences that read as policy changes, the same reason the v2.2 file gives.

## What changed from v2.2 (LEAD1 L10, the free account)

1. **Effective date and version:** "Effective: September 12, 2026 · TIQ-PRV-001 · v2.2" became
   "Effective: October 6, 2026 · TIQ-PRV-001 · v2.3".
2. **New Section 3, "Free accounts".** Sections 3 to 11 of v2.2 are now Sections 4 to 12, unchanged apart from the
   rows below. The governing-law callout's "set out in Section 9" now reads "set out in Section 10".
3. **Section 2, What we collect:** new row
   | Free account data | Name, work email, company, one Scope 1 and Scope 2 calculation, the country of its first site, sign-in records, and the IP address and browser details recorded with a marketing consent choice | Controller |
4. **Section 4 (was 3), How we use your data:** new row
   | Sending the results you asked for, sign-in codes, and keeping your free calculation | Free account data | Contract performance (your request) |
5. **Section 6 (was 5), Data sharing:** the Resend row's Purpose changed from "Transactional email" to "Transactional
   email, including sign-in codes (sent for Supabase) and results emails"; new row
   | Cloudflare (Turnstile) | IP address, browser details | Checking that sign-up, sign-in and "Keep my results" forms are used by a person | Global |
6. **Section 8 (was 7), Data retention:** "Account and contact data" became "Account and contact data (customers who
   have bought a plan)"; two new rows
   | Free accounts that never buy a plan, and their calculation | While the account is used. A free account with no sign-in for 24 months may be deleted, after 30 days' notice by email | PIPEDA: limiting retention |
   | Calculation held while you confirm your email | 24 hours at most: deleted when you confirm, or no longer usable after 24 hours | Providing the service you asked for |

### Section 3: Free accounts (new, full text)

You can calculate Scope 1 and Scope 2 emissions on ThemisIQ without an account. If you choose "Keep my results", we create a free account for you and keep that one calculation. This is what that collects, why, and for how long.

| What we collect | Why | How long we keep it |
|---|---|---|
| Your name | To address your results email and identify your account. | While the account exists. |
| Your work email | To send your sign-in code, sign you in, and email you your results. | While the account exists. |
| Your company | To name the company your calculation is saved under. | While the account exists. |
| Your calculation: the sites and figures you entered, and the results worked out from them | To save it to your account and email it to you. Until you confirm your email, we hold a copy so that you can confirm on another device. | The held copy: deleted when you confirm, or no longer usable after 24 hours. The saved calculation: while the account exists. |
| The country of your first site | To understand which countries our free accounts report from. | While the account exists. |
| Your IP address | To limit repeated requests and sign-ups from one connection, which protects the service from abuse. | With the held copy, for up to 24 hours. In our rate-limit records, as security records. |
| Your marketing choice, with your IP address and browser details (user agent) and the time | To prove what you agreed to, as Canada's anti-spam law (CASL) requires. We record your choice whether or not you tick the box. | As a marketing consent record: 3 years from your last interaction with us. |

The free account uses these service providers: Supabase stores the account, the calculation and the consent records, and sends your sign-in code; Resend delivers the sign-in code and results emails; Cloudflare Turnstile checks that the forms are used by a person, and receives your IP address and browser details for that check; Vercel hosts the site and receives your IP address with each request. Stripe is not involved unless you buy a plan.

The box asking whether you want occasional updates is unticked and optional, and your account does not depend on it. You can withdraw your consent at any time with the unsubscribe link in an email that carries one, or under "Email updates" on your dashboard. Withdrawal takes effect immediately. We keep the record of your choice and of your withdrawal, with the time of each, as proof of consent; withdrawing does not delete that record.

## Carried in: amendments to the live page since the v2.2 snapshot

- **27 Sep 2026, punctuation only:** the eleven em dashes recorded in [`README.md`](README.md).
- **Unrecorded until now:** commit `cb5aaf7` ("Pricing: EU tiers, Bill Review (Oct 2026)") renamed Concierge to Bill
  Review in the Anthropic row, which now reads "Structured prompts; uploaded source documents (Bill Review)" and
  "Reading figures off Bill Review documents, answering GHG guide questions". A product name, not a change of
  practice; recorded here because no snapshot or README entry did.

## Not promised by this text (for the reviewing lawyer)

- The 24-month free-account row says "may be deleted": the retention job that would delete inactive free accounts
  (LEAD1 L11) does not exist yet.
- Nothing yet deletes marketing consent records after 3 years, or rate-limit records (IP address and email key),
  which have no deletion at all.

## Provenance

| Field | Value |
|---|---|
| **Document** | Privacy Policy, `TIQ-PRV-001 · v2.3` |
| **Effective date** | October 6, 2026 (`app/privacy/page.tsx`) |
| **Supersedes** | `TIQ-PRV-001 · v2.2`, effective September 12, 2026, captured in `2026-09-privacy-v2.2.md` |
| **Source files** | `app/privacy/page.tsx`, `lib/legal/freeAccountCopy.ts` |
| **Patch** | `docs/review/patches/lead1-L10.patch` |
| **Record written** | 6 October 2026, from the unapplied patch. ⚠️ If the patch is amended before it lands, this file records the intent; check it against the commit that carries "Effective: October 6, 2026". |
