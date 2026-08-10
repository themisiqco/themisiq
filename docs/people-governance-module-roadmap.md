# Inward self-assessment — the ESRS G1 and CS3D own-operations gap

**Why this file exists.** Scoped **10 August 2026** while working out which modules answer which
obligation. Two gaps surfaced that the platform cannot currently fill from any module:

1. **ESRS G1 business conduct** — maps to **nothing**. No module asks a company about its own
   policies, anti-corruption programme, whistleblowing channel, or political influence.
2. **The own-operations half of CS3D human rights due diligence** — CS3D maps to **Supply Chain
   alone**, which assesses *suppliers*. The Directive's duty covers the company's **own operations and
   subsidiaries** as well as its chain of activities, and nothing addresses that half.

Both are named gaps in the obligation-to-module mapping. This records the shape of a build that would
close them, in terms of machinery that already exists. It is a roadmap, not a plan of record, and it
deliberately contains **no schema and no time estimate**.

---

## 1. The insight — turn the supplier questionnaire inward

`lib/supply-chain/templates.ts` already runs a **policies → actions → results** questionnaire
**OUTBOUND**: the buyer sends it to a supplier, the supplier answers at `app/supplier/[token]`, and the
buyer reads the answers back. The EcoVadis template's four themes are **Environment**, **Labour & Human
Rights**, **Ethics**, **Procurement** — and the question *shapes* are already the ones G1 and CS3D need:

```ts
{ id: 'eth_anticorruption', type: 'radio', label: 'Does your company have a formal anti-corruption policy?',
  options: ['Yes — board approved', 'Yes — management approved', 'In development', 'No'] }
{ id: 'lab_hrdd', type: 'radio', label: 'Has your company conducted a human rights due diligence (HRDD) assessment?',
  options: ['Yes — documented', 'In progress', 'No'] }
```

Note the phrasing: *"Does **your company** have…"*. The questions are **already written in the second
person about the respondent's own organisation** — because the respondent is a supplier being asked
about itself. Pointing the same instrument at the ThemisIQ customer requires no rewording of that kind.
That is the insight: **one inward questionnaire covers several obligations from one build.**

### Reusable as-is

| Machinery | Where | Why it transfers |
|---|---|---|
| **Template structure** | `TEMPLATES: Record<string, { sections: Section[] }>` with `Section { id, title, color, bg, desc, questions }` | A new key (`own_operations`, or one per obligation) is additive. Five templates already coexist: `ecovadis`, `scope3`, `modern_slavery`, `cs3d`, `custom` |
| **Question types** | `QuestionType = 'radio' \| 'checkbox' \| 'number' \| 'text' \| 'textarea'` | Covers every G1 and HRDD answer shape. Its comment records why it is a union not a string: *"an unhandled value renders a labelled question with no input at all"* |
| **One-definition discipline** | the file header | It documents the exact drift this file was created to end — a full copy in the portal and an abbreviated `{ id, label }` copy in the viewer, disagreeing on **68 of 75 shared labels**, several dropping qualifiers that change what an answer means. An inward template must be defined here for the same reason |
| **Completeness denominator** | `app/supplier/[token]/page.tsx` — `totalQuestions = sections.reduce(…)`, `answeredQuestions = Object.keys(responses).length`, `pct` | Template-derived, so it works for any new template without change |
| **CSV export** | `generateExport()` in `app/dashboard/supply-chain/page.tsx` | Row-array → `Blob` → download, filename `{company}_{report}_{year}.csv`. The mechanism transfers; the row *content* is supplier-shaped and would be rewritten |

### Not reusable

| Machinery | Why not |
|---|---|
| **The RAG risk scorer** | `app/dashboard/supply-chain/page.tsx` scores by **country risk × 2.5 + sector risk × 2.5 + spend concentration + tier**. Every input is a property of a *third party* — a company does not have a country-risk multiplier against itself, and `annual_spend` and `tier` have no inward meaning. A maturity or coverage score would be a **new** scorer, not this one reweighted |
| **The token/portal flow** | `app/supplier/[token]` exists so an **unauthenticated third party** can answer. An inward assessment is answered by the logged-in customer, so it belongs behind `useEntitlement`, not behind a share token. The RLS and token machinery is unnecessary here — and its absence removes a whole attack surface |
| **The buyer viewer** | `app/dashboard/supply-chain/portal/[id]/` and `…/supplier/[supplierId]` read *someone else's* answers. Inward, respondent and reader are the same account: one screen, editable, not a read-only review |
| **Campaign / invite machinery** | `app/api/supplier-invite`, campaign deadlines, response tracking. Nothing to invite |

## 2. What one inward questionnaire covers

- **ESRS S1 own workforce** — the Labour & Human Rights theme already asks LTIFR, fatalities, working
  hours, minimum wage, freedom of association. The People module holds pay-gap and headcount metrics;
  the *policy and process* half is what this adds.
- **ESRS G1 business conduct** — the whole standard, and the gap that has no module today:
  - **G1-1** policies and corporate culture
  - **G1-2** management of relationships with suppliers
  - **G1-3** prevention and detection of corruption or bribery
  - **G1-4** confirmed incidents of corruption or bribery
  - **G1-5** political influence and lobbying activities
  - **G1-6** payment practices — **the exception, see §3**
- **CS3D own-operations HRDD** — risk identification, complaints mechanism, remediation, and ongoing
  monitoring, across **own operations and subsidiaries** as well as the chain of activities. The
  existing `cs3d` template asks a *supplier* these; inward is the missing half of the same duty.
- **Modern Slavery statements** — UK and Australian statements are largely a narrative of the four
  HRDD steps above plus governance. A `modern_slavery` template already exists outbound.
- **An EcoVadis self-assessment before a real submission** — a dry run against the same four themes
  the customer will face, using the instrument they already send to their own suppliers.

The commercial shape of that list: **one questionnaire, five obligations**, and two of them
(`G1`, own-operations HRDD) are currently unanswerable by any module.

## 3. The exception — G1-6 payment practices

G1-6 asks for **contractual payment terms** and the **number or percentage of transactions paid past
the due date**, with particular attention to **SME suppliers**.

**That is accounts-payable data, not a questionnaire answer.** No radio option can produce it, and a
`type: 'number'` field asking a customer to self-report a percentage invites exactly the unsupported
figure this platform refuses elsewhere. It is an **evidence upload**.

**The closest existing machinery is the concierge extraction pipeline**, and specifically these parts:

| Part | Where | Transfers how |
|---|---|---|
| **Document → structured figures via a model call** | `app/api/concierge/extract/route.ts` | The route's shape — one document in, structured per-item results out, each carrying the source quote it was read from — is the pattern. An AP ageing report or payment-terms schedule is a different document class, not a different pipeline |
| **The abstention contract** | same route: `value: null` / `confidence: 'low'` rather than guessing, described as *"the route's safety property"* | Directly applicable. A payment-practices figure the model cannot read with confidence must come back blank and flagged, never estimated |
| **`SourceDoc` + the storage bucket** | `Location.source_docs`, `source-documents` bucket hardened in `supabase/migrations/20260804_ghg_source_documents_bucket_hardening.sql` with three RLS policies | Evidence storage and verifier access already exist. Note the roadmap in `docs/ghg-verifier-grade-roadmap.md`: `SourceDoc` has **no hash field**, so chain-of-custody claims must not be made here either |
| **The supported/unsupported doc-type guard** | `lib/ghg/conciergeDocTypes.ts` + its test | The pattern that prevents *"the concierge returned nothing, silently, for three document types its extractor cannot read"* (CLAUDE.md, 2 Aug 2026). An AP document class the extractor cannot read must be declared unreadable **structurally**, in a list with a test, not in a comment |
| **Customer sign-off before use** | the concierge confirm/reject flow and the export gate `(concierge ⇒ customer_approved)` | A G1-6 figure extracted from an AP report is a *proposal* until the customer confirms it, exactly as a billed consumption figure is |

What is **not** reusable: the fuel-specific vocabulary. `SUPPORTED_FUELS`, `DOC_TYPE_FUELS`, the
per-fuel coverage analysis and `analyzeCoverage`'s billing-period logic are all about metered
consumption over a period. Payment practices are a count and a percentage over a reporting year — no
coverage windows, no gap/overlap/straddle resolution.

## 4. Design principle — the detection system, not only the incident record

**G1-3 asks for the prevention and detection SYSTEM, not only the incident record.** G1-4 asks for
confirmed incidents. A company reporting **zero confirmed incidents and no detection mechanism** is
**unmonitored, not clean** — and a questionnaire that accepts "no incidents" without asking how
incidents would be found produces a clean-looking answer from an absence of information.

**This is the module's version of the platform's `absence of data is not a value` rule.** The same rule
already appears as:

- the GHG engine's *"a dated slice must not assert consumption no bill supports"*
- `stream_attestations` — an undeclared stream blocks export precisely because nobody has answered
- the Deals module's three-state `not-assessed` / `assessed-none` / `assessed-findings`, where
  `assessed-none` is a finding and `not-assessed` is the absence of one
- `notAssessedNote` / `routeNotMetNote` — two different sentences because *withheld for a missing
  figure* and *evaluated and not met* are different claims

Concretely, for this module: a "no incidents" answer must be **paired with** the detection-mechanism
answer, and a nil report with no mechanism must render as **unmonitored** rather than as a nil finding.
The existing outbound template already has the wrong shape here — `eth_incidents` offers
`['No incidents', 'Yes — investigated and resolved', 'Yes — unresolved', 'Unknown']` with no companion
question about how incidents are detected, so `'No incidents'` and *"we have no way of knowing"* are
indistinguishable in the stored answer. **Do not copy that pattern inward.**

## 5. Regulatory status

The **revised ESRS** were adopted as a **delegated act on 3 July 2026**, amending **Delegated Regulation
(EU) 2023/2772**. Mandatory for **financial years beginning on or after 1 January 2027**, with **early
adoption permitted for FY2026**, subject to a **two-month scrutiny period**.

**G1 is restructured into Policies–Actions–Targets, with 61% fewer mandatory datapoints.** **G1-1
through G1-6 remain applicable until FY2026** — so a build targeting the current datapoint numbering is
correct for FY2026 reporting and will need remapping for FY2027 onward.

> ⚠️ **Verified against secondary sources 10 August 2026. PRIMARY SOURCE NOT CHECKED.** Confirm the
> delegated act text before building against specific datapoints — the restructure means datapoint
> identity, not only wording, may have moved. This is the same provenance caveat carried by
> `lib/sb253.ts`, and it is load-bearing: a questionnaire keyed to a datapoint number that no longer
> exists produces answers nobody can map to a disclosure.

## 6. What this unblocks commercially

| Obligation | Maps to today | Would map to |
|---|---|---|
| **ESRS G1 business conduct** | **nothing** | the inward assessment |
| **CS3D own operations + subsidiaries** | **nothing** — CS3D maps to Supply Chain, which assesses suppliers | the inward assessment |
| CS3D chain of activities | Supply Chain | unchanged |
| ESRS S1 own workforce | People (metrics only) | People + the policy/process half |
| Modern Slavery statement | Supply Chain (chain only) | both halves |
| EcoVadis submission | Supply Chain (outbound) | plus a self-assessment dry run |

Two named gaps closed by one build, and the Deals module's CS3D handling becomes explicable rather than
partial: `THRESHOLD_TESTS['CS3D']` already carries `exhaustive: false` because routes (b) group
parentage and (c) franchising/licensing are unmodelled — the own-operations duty is a third thing the
platform asserts nothing about today.
