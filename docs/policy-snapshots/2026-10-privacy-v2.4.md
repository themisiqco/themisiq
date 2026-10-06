# ThemisIQ Privacy Policy: record of v2.4

**Effective: October 6, 2026 · TIQ-PRV-001 · v2.4**

## Why this file exists

The Privacy Policy lives only in `app/privacy/page.tsx` (with the free-account text in `lib/legal/freeAccountCopy.ts`)
and is edited in place. This records what v2.4 changed from v2.3, word for word. [`2026-10-privacy-v2.3.md`](2026-10-privacy-v2.3.md)
is the record of v2.3 and is not edited to match this one. Everything not listed below is as v2.3 recorded it.

## What changed from v2.3 (RET1: retention periods that now end in deletion)

1. **Version:** "TIQ-PRV-001 · v2.3" became "TIQ-PRV-001 · v2.4". The effective date stays "October 6, 2026"; if this
   version goes live on a later day, the page's date and this line should be set to that day together.
2. **Section 3, Free accounts, "Your calculation" row, How long we keep it:**
   - was: "The held copy: deleted when you confirm, or no longer usable after 24 hours. The saved calculation: while the account exists."
   - now: "The held copy: deleted when you confirm, or deleted within a day after its 24 hours end. The saved calculation: while the account exists."
3. **Section 3, Free accounts, "Your IP address" row, How long we keep it:**
   - was: "With the held copy, for up to 24 hours. In our rate-limit records, as security records."
   - now: "With the held copy, until that copy is deleted. In our rate-limit records, for 30 days."
4. **Section 8, Data retention, "Calculation held while you confirm your email" row, Retention period:**
   - was: "24 hours at most: deleted when you confirm, or no longer usable after 24 hours"
   - now: "Deleted when you confirm, or deleted within a day after its 24 hours end"
5. **Section 8, Data retention, new row:**
   | Rate-limit records (IP address and email key) | 30 days, then deleted automatically | Protecting the service from abuse |

## What performs these periods

`docs/review/patches/RET1-M10-retention-jobs.sql` (pg_cron, two daily jobs): `ret1-purge-rate-limits` deletes
rate-limit records older than 30 days at 07:15 UTC; `ret1-purge-free-calc-holds` deletes holds whose 24 hours have
ended at 07:25 UTC. **This version must not go live before M10 has run**: until then the page would promise deletion
that nothing performs.

## Unchanged by this version

The checkout consent version stays `2026-10-v3`: it names the Terms, Refund Policy and checkout consent wording, and
none of them changed.

## Provenance

| Field | Value |
|---|---|
| **Document** | Privacy Policy, `TIQ-PRV-001 · v2.4` |
| **Effective date** | October 6, 2026 (`app/privacy/page.tsx`) |
| **Supersedes** | `TIQ-PRV-001 · v2.3`, effective October 6, 2026, captured in `2026-10-privacy-v2.3.md` |
| **Source files** | `app/privacy/page.tsx`, `lib/legal/freeAccountCopy.ts` |
| **Patch** | `docs/review/patches/ret1.patch` |
| **Record written** | 6 October 2026, from the unapplied patch. ⚠️ If the patch is amended before it lands, this file records the intent; check it against the commit that carries "v2.4". |
