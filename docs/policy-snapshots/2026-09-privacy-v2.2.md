# ThemisIQ Privacy Policy — snapshot of v2.2

**Effective: September 12, 2026 · TIQ-PRV-001 · v2.2**

## Why this file exists

The Privacy Policy lives only in `app/privacy/page.tsx` and is edited in place, so without a
snapshot each version erases the one before it. This records v2.2 as published.

Companion to [`2026-09-privacy-v2.1.md`](2026-09-privacy-v2.1.md), which records v2.1, and to
[`2026-06-v2-final.md`](2026-06-v2-final.md), which captures the Terms, Refund Policy and consent
wording under consent version `2026-06-v2-final` **and contains the Privacy Policy at v2.0. Neither
of those files may be edited to match this one** — each is the record of its own version.

## What changed from v2.1

One change, in §5 Data sharing — the Purpose given for Anthropic:

| | v2.1 (Effective September 10, 2026) | v2.2 (this file) |
|---|---|---|
| Anthropic · Purpose | AI-assisted features | Reading figures off Concierge documents, answering GHG guide questions |

**This NARROWS a disclosure, and it is a correction rather than a change of practice.** "AI-assisted
features" named no feature and so excluded none; a reader could not tell from it which parts of the
product send data to a model. Nothing about what the product does changed on this date — the two
uses named are the two that existed before, verified by grep on 11 Sep 2026 against
`app/api/concierge/extract/route.ts` and `app/api/ghg-bot/route.ts`, which are the only callers of
the Anthropic API in the repository.

The **Data shared** and **Location** cells are untouched: the data sent and where it goes were
already stated correctly, and only the purpose was vague.

Made in the same pass as three corrections elsewhere that are NOT part of this document:
`app/trust/page.tsx` principle 3 had claimed AI powered "framework classification, risk scoring,
guidance" — two of which are rules-based — and neither `app/trust/page.tsx` nor
`app/security/page.tsx` listed Anthropic as a subprocessor at all. Recorded here because a reader
comparing the three pages at this date should know they were reconciled together.

**`CONSENT_VERSION` was NOT bumped, correctly.** `2026-06-v2-final` covers Terms / Refund Policy /
Consent Part C (`app/components/ConsentForm.tsx:13`); the Privacy Policy is not in that bundle and
no checkout checkbox references `/privacy`. No consent record is made stale by this change.

⚠️ **THIS TEXT HAS A KNOWN EXPIRY.** `supabase/migrations/20260910_concierge_review_schema.sql`
moves Concierge extraction from the Anthropic API to a person reading each document. It is drafted
and unrun as of this date. When it ships, the first of the two uses above stops being true and the
GHG guide becomes the only one — and this row, along with the trust and security pages and both
copies of the sentence in `app/calculate-emissions/page.tsx`, must be revised in that same commit.

## Provenance

| Field | Value |
|---|---|
| **Document** | Privacy Policy, `TIQ-PRV-001 · v2.2` |
| **Effective date** | September 12, 2026 (`app/privacy/page.tsx:37`) |
| **Supersedes** | `TIQ-PRV-001 · v2.1`, effective September 10, 2026 — captured in `2026-09-privacy-v2.1.md` |
| **Source file** | `app/privacy/page.tsx` |
| **Changed row** | `app/privacy/page.tsx:131` |
| **Snapshot taken** | 13 September 2026 |

## Fidelity note

**The unchanged text below is carried over from the v2.1 snapshot rather than re-extracted from
JSX.** Only the two cells that v2.2 changes — the effective-date/version line and the Anthropic
Purpose — were edited, and both were verified against `app/privacy/page.tsx` after the edit. This
is a deliberate choice: a fresh hand-extraction of eleven sections would introduce transcription
differences that would read as policy changes. The trade is that any drift between the page and
the v2.1 snapshot is inherited here — see the §-by-§ verification note at the foot.

The v2.1 extraction conventions therefore still apply:

* **HTML entities resolved** — `&mdash;` → —, `&rsquo;` → ’, `&amp;` → &, `&nbsp;` → space.
* **Styling and navigation dropped** — inline styles, the sticky table of contents, section
  anchors, scroll-spy state. Tables are reproduced as tables.
* **Section order and wording are otherwise unchanged.** Nothing normalised, shortened or
  reordered.
* **§9's heading is the rendered `<h2>`**, "Additional rights for US residents". The page's own
  table of contents shortens it to "US residents", and a 🇺🇸 badge sits above it. Same for §8,
  whose TOC entry is "Your rights".
* **§11 "Contact & complaints" is a styled callout, not body prose**, so an extractor keyed on the
  body style skips it. Read from source and included below.
* ⚠️ **EXTRACTED FROM AN UNCOMMITTED WORKING TREE.** The v2.2 edit was not committed when this
  snapshot was taken. If it is amended before landing, this file records the intent rather than
  what shipped — verify against the commit that actually carries `Effective: September 12, 2026`.

---

# Privacy Policy

**`app/privacy/page.tsx` · Effective: September 12, 2026 · TIQ-PRV-001 · v2.2 · ThemisIQ Compliance Inc. · Canada · privacy@themisiq.co**

> **Governing law: Canada (PIPEDA · Law 25 · CASL) + US state privacy laws + GDPR / UK GDPR for EU/UK customers**
>
> ThemisIQ Compliance Inc. is a Canadian company. This Privacy Policy complies with Canadian federal and provincial privacy law as the primary framework. Additional rights for US residents (CCPA/CPRA, state laws, CAN-SPAM, COPPA) are set out in Section 9.

### Section 1 — Who we are

**ThemisIQ Compliance Inc.** ("ThemisIQ", "we", "us") is a compliance intelligence and SaaS platform company incorporated in Canada, operating www.themisiq.co.

Our designated **Privacy Officer** is the Chief Executive Officer — privacy@themisiq.co. All privacy requests should be directed to this address.

### Section 2 — What we collect

| Category | Examples | Our role |
|---|---|---|
| Account data | Name, work email, job title, company, billing address | Controller |
| Platform data | GHG data, workforce metrics, supply chain data, AI inventories entered into ThemisIQ modules | Processor — you are the controller |
| Assessment data | Compliance Assessment answers, email, company, role | Controller |
| Usage data | Log data, IP addresses, browser type, pages visited, feature usage | Controller |

> **What we never collect**
>
> Payment card numbers (Stripe handles these). Special category personal data unless specifically agreed in writing. We never sell personal data. We use no advertising cookies or tracking pixels.

### Section 3 — How we use your data

| Purpose | Data used | Legal basis |
|---|---|---|
| Delivering the ThemisIQ platform | Account data, platform data | Contract performance |
| Sending assessment results | Assessment data, email | Express consent (CASL) |
| Marketing emails | Account data, email | Express consent (CASL) — unsubscribe anytime |
| Billing and invoicing | Account data | Contract / legal obligation (CRA) |
| Platform security | Usage data, log data | Legitimate interests |

### Section 4 — Legal basis

For Canadian residents, our basis is the **PIPEDA fair information principles** — primarily consent and legitimate business purposes.

For EU/EEA/UK residents, our bases under GDPR / UK GDPR are: contract performance (Art. 6(1)(b)), consent (Art. 6(1)(a)), legal obligation (Art. 6(1)(c)), and legitimate interests (Art. 6(1)(f)).

For Québec residents, **Law 25** applies additional requirements — Privacy Impact Assessments, 72-hour breach reporting to the CAI, named Privacy Officer, and data portability rights.

### Section 5 — Data sharing

| Recipient | Data shared | Purpose | Location |
|---|---|---|---|
| Supabase (AWS) | All platform data | Database, auth, storage | USA |
| Vercel | Application traffic | Hosting and CDN | Global |
| Stripe | Billing data | Payment processing | USA |
| Resend | Name, email | Transactional email | USA |
| Anthropic | Structured prompts; uploaded source documents (Concierge) | Reading figures off Concierge documents, answering GHG guide questions | USA |

> **We do not sell, share, or trade personal data**
>
> ThemisIQ does not sell personal information as defined under CCPA. We do not share personal information for cross-context behavioural advertising. ThemisIQ products are entirely ad-free.

### Section 6 — International transfers

ThemisIQ is Canadian. Data is processed in Canada and transferred to sub-processors in the United States.

> **EU/UK customers — GDPR transfer mechanism**
>
> For EU/UK customers, we rely on Standard Contractual Clauses (SCCs) under GDPR Article 46(2)(c) and the UK International Data Transfer Agreement (IDTA). Our DPA incorporating SCCs is available at legal@themisiq.co.

### Section 7 — Data retention

| Data type | Retention period | Basis |
|---|---|---|
| Customer platform data | **Subscription duration + 12 months** | Contract |
| Account and contact data | 7 years from last activity | Canada Revenue Agency |
| Marketing consent records | 3 years from last interaction | CASL |
| Assessment / lead data | 3 years from collection | PIPEDA / CASL |
| Security and audit logs | 5 years | Legitimate interest — security |
| Billing records | 7 years | Canada Revenue Agency |

### Section 8 — Your rights (all jurisdictions)

To exercise any right, email privacy@themisiq.co. We respond within 30 days (Canada/EU) or 45 days (US). No charge for the first request in any 12-month period.

### Section 9 — Additional rights for US residents

*(Rendered with the badge "🇺🇸 US residents — additional rights"; listed as "US residents" in the page's table of contents.)*

ThemisIQ does not sell personal information as defined under CCPA §1798.140(ad). You do not need to submit a "Do Not Sell or Share" request because we do not engage in these activities.

Residents of California, Virginia, Colorado, Connecticut, Texas, Montana, Oregon, Delaware, New Hampshire, New Jersey, Nebraska, and Maryland have rights to access, delete, correct, and port their personal data. To exercise any right, email privacy@themisiq.co.

**CAN-SPAM:** All ThemisIQ commercial emails to US recipients comply with CAN-SPAM. Every commercial email contains a functioning one-click unsubscribe link honoured within 48 hours.

**COPPA:** The ThemisIQ platform is directed exclusively at business professionals. We do not knowingly collect personal information from persons under 13.

### Section 10 — Cookies

We use essential cookies (session management, authentication) and optional analytics cookies (anonymised usage). We do not use advertising cookies, tracking pixels, or third-party behavioural targeting. ThemisIQ products are entirely ad-free.

### Section 11 — Contact & complaints

*(A styled callout, not body prose.)*

> **Privacy Officer — ThemisIQ Compliance Inc.**
>
> Email: privacy@themisiq.co · Response: 30 days (Canada/EU) · 45 days (US)
