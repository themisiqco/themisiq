# Stakeholder Questionnaire & Impact Materiality — design spec v5

**Status:** design only. Nothing built. Written 15 August 2026; severity method, positive impacts and sub-topic depth added same day after market survey and codebase recon.
**Purpose:** give the Materiality module a real inside-out axis, and give
customers a stakeholder engagement instrument they can send to internal and
external respondents.

**Why this exists.** The impact axis today is ten low/med/high buttons the
preparer clicks themselves, pre-filled from a sector template. ESRS asks for
severity (scale, scope, irremediability), likelihood, value chain position and
stakeholder engagement. None of those four is in the code. This spec covers
all four, plus the questionnaire that produces the evidence for them.

---

## 1. The two-layer model

The single most important design decision, and it comes from the Bay State
file: **you cannot ask a Finance manager to rate irremediability.** That
questionnaire worked because it asked one plain question per topic with a
paragraph of context. So the ESRS technical scoring and the stakeholder
engagement are two different instruments with two different audiences.

| | Stakeholder Questionnaire | Preparer Worksheet |
|---|---|---|
| Audience | Internal staff, external stakeholders | Sustainability lead |
| Language | Plain, company's own words | ESRS terms |
| Length | 10–15 min | As long as it takes |
| Produces | Evidence record + priority signal | The impact axis scores |
| Framework role | ESRS 2 SBM-2, IRO-1 process evidence | ESRS 1 §3 severity + likelihood |

This mirrors how the engagement actually runs in practice: survey first,
then a facilitated scoring session informed by the results. The product
should not pretend the survey *is* the assessment — it informs it.

**The divergence check is the differentiator.** Where stakeholders rate a
topic high and the preparer scored it low, the report flags it. That is the
question an assurance provider asks — *how did stakeholder engagement inform
your determination?* — and no competing matrix tool answers it.

---

## 2. Which standard — and why the taxonomy must be versioned

⚠️ **ESRS was revised while this spec was being written.** On 3 July 2026 the
European Commission adopted the delegated act containing the simplified ESRS
("ESRS (2026)"), amending Delegated Regulation (EU) 2023/2772. It applies to
financial years beginning on or after 1 January 2027, with early adoption
permitted for FY2026. At the time of writing it is in the Parliament/Council
scrutiny period.

**What changed that matters here:**

| | ESRS (2023) | ESRS (2026) |
|---|---|---|
| Topic list lives in | ESRS 1 **AR 16**, mandatory | ESRS 1 **Appendix A**, non-binding guidance |
| Depth | topics → sub-topics → sub-sub-topics | topics → sub-topics only |
| S1 / S2 | separate topics | merged: "Own Workforce and Workers in the Value Chain (ESRS S1/S2)" |
| E3 | Water and marine resources | Water |
| E5 | Resource use and circular economy | Circular Economy and Resource Use |
| Severity rule | ESRS 1 ¶44, human rights ¶46 | ESRS 1 **¶40**, human rights inside the same paragraph |

Sub-sub-topics did not disappear so much as get absorbed: what were separate
entries now appear as parenthetical lists inside a sub-topic name — "working
conditions" names adequate wages, work-life balance, working time, secure
employment and social protection within it.

**Consequence: the taxonomy is versioned, and so is every assessment.**

**Article 2(2) of the delegated act makes this a legal requirement, not a
design preference.** An undertaking must state in its sustainability statement
which version it applies for financial years beginning between 1 January 2026
and 31 December 2026. So the report prints it on the cover, not in an appendix.

**FY2026 has three options, not two.** Article 2(1) allows:

| Option | What it is |
|---|---|
| `esrs_2023` | ESRS (2023) as last amended by Del. Reg. (EU) 2025/1416 (the 'quick fix') |
| `esrs_2023_reliefs` | the above, plus eight named reliefs from the new act — ESRS 1 ¶27, ¶32–33, ¶74–75, ¶90, ¶91, ¶92, ¶106, ¶110 |
| `esrs_2026` | the revised standards in full |

From FY2027 only `esrs_2026` applies. Entry into force is four months and one
week after adoption — approximately 10 November 2026.

So:

- The taxonomy table carries `standard_version` with **three** values.
- Every assessment records which it was performed against, and the report
  states it on its face.
- All three coexist. This is not a migration from one to another.

**Depth: two levels is the answer, but keep `parent_code` anyway.** ESRS (2026)
is two levels, which settles the original question. The self-referencing
`parent_code` still earns its place, because it lets both taxonomies live in
one table at their own depths without a schema branch.

---

## 3. Topic model

### 3.1 Three layers, and only the middle one is editable

```
ESRS topic / sub-topic               ← locked, from the versioned taxonomy
  └── Customer's chosen matter        ← selected from the sector library
        └── Question wording          ← fully editable by the customer
```

Note this is three layers of *authorship*, not three layers of ESRS. The ESRS
hierarchy itself is two levels under ESRS (2026); what the customer adds is a
third layer of their own language on top.

The Bay State file is the proof: 26 topics written as "grain supply chains",
"oat milling", "regenerative agriculture" — none is an ESRS label, all roll up
to E4, E5 and S2. Customers must write in their own language; the mapping
underneath must not move.

### 3.2 Sector library

Ship a starter set per sector, in the customer's language, each pre-mapped to
an ESRS topic and an ESRS sub-topic where one exists. The customer:

- **selects** which apply (deselecting is a recorded decision, not a deletion)
- **edits** wording and context freely
- **adds** their own, choosing the ESRS topic it maps to
- **cannot** change or remove the ESRS mapping of a library item

A deselected topic must appear in the report as *considered and excluded*,
with the reason. ESRS expects the process to be described, not just the
result — a topic that silently vanishes is indistinguishable from one never
considered.

### 3.3 Versioning — from a real defect in the Bay State data

The first two responses in that file answer a long-form maturity scale; every
response after answers Low/Medium/High. The wording changed mid-survey and the
answers are not comparable.

**Rule:** a questionnaire version freezes on first response. Editing after
that creates version N+1, and every response records the version it answered.
The report never pools responses across versions without saying so.

---

## 4. Respondent tracks

ESRS 2 SBM-2 requires knowing *who* was engaged, not just what they said.

**Internal.** Captured: function/department, seniority band, site or region.
Not captured: name or email in the response record. The Bay State file is
anonymous with department retained, and that is the right default — it is what
makes people answer honestly about their own employer.

**External.** Captured: stakeholder category, and value chain position.
ESRS 1 AR 23 names the typical categories of *affected* stakeholders — workers
and workers' representatives in the own workforce and in the value chain,
communities affected by operations or value-chain activities, and consumers and
end-users — with particular attention to those in vulnerable situations. To
those add the categories who are *users* rather than affected parties:
suppliers, customers, investors and lenders, regulators, civil society. One Bay
State respondent's department is literally `external`, which is the current
workaround this replaces.

> AR 23 also notes that **nature may be considered a silent affected
> stakeholder**. No survey reaches it, which is exactly why the environmental
> topics lean on reference data and preparer judgement rather than on response
> counts. The report should say so, rather than letting a thin response rate on
> E-topics read as low materiality.

> **AR 25 is a legal requirement, not a nicety.** Under the Accounting
> Directive, management must inform workers' representatives and discuss the
> relevant information with them. A questionnaire reaching workers'
> representatives is evidence toward that obligation, and the engagement record
> should show those responses separately from general staff.

**Routing by function is supported by the evidence.** Respondents used
"not enough visibility" heavily outside their own area — a Safety respondent
abstained on six supply chain topics. Allow the customer to assign topic
subsets per department so people are asked what they can actually answer.

---

## 5. Question design

### 5.1 Screening survey — all selected topics

One question per topic, plus context. This is the Bay State pattern and it is
what makes broad distribution possible.

**Context block** (customer-editable, 2–4 sentences): what the topic is, why
it matters to this company, what the company does today.

**The question:**

> What strategic priority should [Company] assign to this topic?

| Response | Value |
|---|---|
| Existing programs are sufficient; continuous improvement is appropriate | 1 |
| Existing programs are sufficient, but improvements would strengthen performance or reduce risk | 2 |
| Existing programs need significant strategic focus to close gaps, reduce risk or capture opportunity | 3 |
| **Not enough visibility to assess** | **null — never scored** |

The maturity framing beats a bare Low/Med/High because it asks about the gap
rather than the topic's importance in the abstract, and it is directly
actionable. Both scales appear in the Bay State file; this is the better one.

**Optional free text per topic**, and one at the end: *"Is there anything
affecting people, the environment or the business that we have not asked
about?"* Emerging-topic identification is an ESRS IRO-1 expectation and a
survey is the cheapest place to catch it.

### 5.2 Deep-dive survey — flagged topics only

Sent to named experts and affected stakeholders, on topics the screening
survey or the preparer flagged. This is where the ESRS dimensions get asked,
still in plain language.

**Is this a harm or a benefit?**
- A negative impact — harm to people or the environment
- A positive impact — benefit to people or the environment
- Not enough visibility

> Branches the question set. Negative impacts are scored on scale, scope and
> irremediability; positive impacts on scale and scope only, because there is
> nothing to remediate. ESRS 1 ¶41 splits it further: **actual** positive
> impacts take scale and scope; **potential** positive impacts take scale,
> scope *and* likelihood. ESRS requires positive impacts to be assessed, and a
> survey that only asks about harm produces an incomplete determination.
> Positive impacts are never netted against negative ones (¶44).

**Is it happening now?**
- Already happening — actual impact → **no likelihood question follows**
- Could happen — potential impact → likelihood question follows
- Not enough visibility

> ESRS treats actual impacts as certain. Applying likelihood to them
> understates severity, which is the most common technical error in a DMA.

**How serious are the consequences for people or the environment?** *(scale)*
- Minor — noticeable but limited
- Moderate — meaningful harm, manageable
- Major — serious harm
- Severe — grave harm
- Not enough visibility

**How widely are they felt?** *(scope)*
- A few individuals, or one site
- Many people, or several sites
- Widespread — a region, a workforce, or the whole supply chain
- Not enough visibility

**Can the damage be put right?** *(irremediability — negative impacts only)*
- Readily reversible
- Reversible with significant time, cost or effort
- Not realistically reversible
- Not enough visibility

**How likely within three years?** *(potential impacts only)*
- Unlikely / Possible / Likely / Not enough visibility

**Where does it sit?** *(value chain position — multi-select)*
- Our own operations / Upstream, our suppliers / Downstream, our customers
  and products / Not enough visibility

**Financial effect on the company** *(the outside-in axis, for internal and
investor respondents only)*
- Negligible / Noticeable but absorbable / Significant — would show in the
  accounts / Severe — would change the business plan / Not enough visibility

**Over what time horizon?** — short (≤1 yr) / medium (1–5) / long (>5),
matching ESRS 1 §6.4 and IFRS S1's entity-defined horizons.

### 5.3 The severity scales — four points each, no exceptions

⚠️ All three dimensions MUST carry the same number of points. The first draft
of §5.2 gave scale four options and scope and irremediability three, which
cannot be averaged: a 3 on a three-point scale is the worst there is, while a
3 on a four-point scale is one below the worst. Averaging across mismatched
ranges silently weights the shorter scales heavier and would have corrupted
every severity figure the engine produced.

| | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| **Scale** | Minor — noticeable but limited | Moderate — meaningful, manageable | Major — serious harm | Severe — grave harm |
| **Scope** | A few people, one site | Many people, several sites | Widespread — a region or a workforce | Systemic — the whole supply chain or ecosystem |
| **Irremediability** | Readily reversible | Reversible with effort | Reversible only at major cost or over years | Not realistically reversible |

`Not enough visibility` sits alongside all three, and is null per §6.1 — never
a 1.

---

## 6. Scoring rules

### 6.1 Abstention

`Not enough visibility` is **null**, never zero, never a low. It is excluded
from every mean and reported as a count. A topic where most respondents
abstained is itself a finding — usually that the company has no visibility of
its own impact, which is material information.

This is the same invariant as the GHG engine's `declared_unquantified` and the
hazard layer's `band: 'unknown'`. It should be enforced in one place.

### 6.2 Severity

ESRS 1 paragraph 44 defines severity for negative impacts across **scale** (how
grave), **scope** (how widespread) and **irremediability** (how hard to
reverse). It does not prescribe how to combine them, and there is no
verifier-approved formula — every source surveyed agrees the company sets its
own threshold and must be able to justify it.

**What the market actually does** (surveyed 15 August 2026):

| Method | Who |
|---|---|
| Average of the three | Position Green's DMA software — a direct competitor, formula published |
| scale × scope × irremediability × likelihood, 1–4 each, normalised | Upright Platform; Generation Impact Global's guide |
| Any single sub-criterion above threshold ⇒ material | riskpublishing / EFRAG IG 1-derived guidance |

**ThemisIQ method: average, with a top-band override at 4 only.**

```
severity = mean(scale, scope, irremediability)      each 1–4, per §5.3
material if severity >= 2.5
  OR if ANY single dimension = 4                    the override
```

**The override is not our invention — the standard says it.** ESRS 1 **AR 22**
of the adopted ESRS (2026) states that any of the three characteristics — scale,
scope or irremediable character — can make a negative impact severe. That is
the citation for the Severe-only rule, and it is stronger than the reasoning
below, which was written before the adopted text was consulted.

**AR 15 supports the screening/deep-dive split too.** It provides that the
undertaking need not analyse each characteristic of severity separately if a
conclusion that the impact is severe can be reached without doing so — which is
exactly the two-layer model in §1: the screening survey reaches a conclusion for
most matters, and the deep dive analyses characteristics only where it cannot.

**Why the override triggers on 4 alone, not on 3-and-above.** Across all 64
possible score combinations:

| Rule | Combinations material | Share |
|---|---|---|
| Mean ≥ 2.5, no override | 32 of 64 | 50% |
| Mean ≥ 2.5, override at 4 | 41 of 64 | 64% |
| Mean ≥ 2.5, override at 3+ | 56 of 64 | **87.5%** |

An override at 3-and-above makes almost everything material, which defeats the
purpose of the assessment — a DMA exists to narrow a longlist to the topics
warranting full ESRS disclosure. A customer told to disclose against nearly
every topic has not been assessed, and their auditor will ask what the exercise
decided. The override at 4 adds exactly nine combinations to the mean, and
every one is a case where a single dimension sits at the extreme.

The three cases it is for, all of which the mean alone misses:

| Case | Scale | Scope | Irrem. | Mean |
|---|---|---|---|---|
| Localised soil contamination — small, narrow, permanent | 1 | 1 | 4 | 2.0 |
| One catastrophic workplace injury, isolated, recoverable | 4 | 1 | 1 | 2.0 |
| Small wage shortfall across the entire workforce | 2 | 4 | 1 | 2.3 |

Note the 64 combinations are not equiprobable — real topics cluster low — so
the practical effect is smaller than the shares suggest. The 2.5 mean threshold
is itself a choice and can be raised to narrow the outcome without touching the
override.

**Why not multiplication.** On a 1–4 scale, an impact scoring scale 4, scope 1,
irremediability 4 yields 16 of a possible 64 — a grave, permanent harm on few
people, scored as immaterial. A contaminated aquifer is the canonical case.
Multiplying compounds low scores rather than balancing them.

**Why not the mean alone.** Same failure, less severe: 3.0 out of 4 reads as
middling and may fall under threshold.

**Why the override works.** It is the easiest rule to defend in assurance —
*we averaged, except where any single dimension was severe, in which case we
escalated* — and it is the only one of the three that cannot score a grave harm
down to nothing.

**Two rules from the standard, not chosen by us:**

**Human rights precedence — ESRS 1 ¶40 (2026) / ¶46 (2023).** For social
topics, severity takes precedence over likelihood. A severe potential human
rights impact is material even at low likelihood, and must never be scored
down for being unlikely. In practice: take max rather than mean for these
topics, and suppress the likelihood multiplier.

**Positive impacts — ESRS 1 ¶41.** Irremediability does not apply, because
there is nothing to remediate. Actual positive impacts are assessed on scale
and scope; potential positive impacts on scale, scope and likelihood. The
deep-dive survey branches on negative/positive before asking the
irremediability question, and the report states which basis was used per
matter. Positive impacts are assessed on their own and never netted against
negative ones (¶44).

**Actual versus potential:**

- **Actual impact:** impact score = severity, unmodified. No likelihood is
  applied — the impact is already occurring, and applying likelihood to it
  understates severity. This is the most common technical error in a DMA.
- **Potential impact:** impact score = severity × likelihood weighting, except
  where the human-rights rule above applies.

**All of it is disclosed.** The combination rule, the override band, the
likelihood weighting and the human-rights exception go in the assumptions
register with their reasoning. The product's job is not to pick the one true
formula — none exists — but to make the choice explicit, apply it uniformly
across every topic in an assessment, and print it where an auditor reads it.
That is precisely what a consultant's spreadsheet usually does not do.

### 6.3 Where the survey feeds the score

The survey does **not** set the impact axis directly. It produces:

1. **Stakeholder priority signal** per topic — mean of non-null screening
   responses, with n and abstention count
2. **Severity evidence** per topic from deep-dive responses, shown to the
   preparer while they score
3. **Divergence flag** — stakeholder priority high, preparer severity low, or
   the reverse

The preparer sets the score. The survey is the evidence they set it against,
and the report shows both.

---

## 7. What the report must disclose

New or changed sections in the Double Materiality Screening Report:

**Stakeholder engagement** *(new — satisfies ESRS 2 SBM-2)*
Who was engaged, by category and function. Method (survey), field dates,
number invited, number responded, response rate. How the results informed the
determination. This section does not exist today and is the single biggest
gap against ESRS.

**Impact determination** *(replaces the current impact column)*
Per topic: severity with its three components, actual vs potential,
likelihood where applicable, value chain position, time horizon, and the
preparer's reasoning.

**Divergence register** *(new)*
Topics where stakeholder priority and preparer determination disagree, with
the preparer's explanation. Expect this to be the most-read page in the
document.

**Process description** *(new — satisfies ESRS 2 IRO-1)*
How topics were identified, which were considered and excluded and why, how
scoring was done, what the thresholds were.

**Assumptions register** — extend with the severity combination method, the
likelihood weighting, and the abstention rule.

---

## 8. Framework alignment

Citations give ESRS (2026) with the ESRS (2023) equivalent where numbering
moved. Both are carried, because both standards are live (§2).

| Requirement | 2026 | 2023 | Where met |
|---|---|---|---|
| Negative impacts — severity: scale, scope, irremediable character | ¶40 | ¶44 | §5.2, §6.2 |
| Human rights — severity takes precedence over likelihood | ¶40 | ¶46 | §6.2 |
| Positive impacts — actual: scale+scope; potential: +likelihood | ¶41 | ¶46 | §5.2, §6.2 |
| Positive impacts never netted against negative | ¶44 | — | §6.2 |
| Actual impacts take no likelihood | ¶40 | ¶44 | §5.2, §6.2 |
| Any one characteristic can make an impact severe | AR 22 | AR 11 | §6.2 |
| Need not analyse each characteristic separately | AR 15 | AR 14 | §1, §6.2 |
| Quantitative scoring not necessarily required | AR 13 | AR 17 | §6.2 |
| Stakeholder engagement is a key input | ¶42 | ¶43 | §1, §4 |
| Stakeholder categories; nature as silent stakeholder | AR 23 | AR 6/7 | §4 |
| Direct input to the assessment may be sought | AR 24 | AR 8 | §1, §4 |
| Workers' representatives informed and consulted | AR 25 | — | §4 |
| Immaterial information **shall not** be disclosed | ¶24 | — | §7 |
| Top-down approach avoids per-IRO assessment | AR 9 | — | §3.2 |
| Topic list | Appendix A (non-binding) | AR 16 | §2, §3, §11 |
| Time horizons — short / medium / long | ¶79 | ¶77 | §5.2 |
| Value chain — own / upstream / downstream | ¶62 | ¶63 | §5.2 |
| Process description | ESRS 2 IRO-1 | IRO-1 | §3.2, §7 |
| Stakeholder views disclosure | ESRS 2 SBM-2 | SBM-2 | §7 |
| EFRAG IG 1 — company-set thresholds, documented rationale | — | — | §6.2 |
| IFRS S1 — financial materiality, value chain, horizons | — | — | §5.2 |
| IFRS S2 — climate risks and opportunities | — | — | existing E1 engine |
| GRI 3 — significance of impacts, stakeholder engagement | — | — | §5, §7 |
| EcoVadis themes | — | — | sector library mapping |

**Not claimed:** this produces a defensible *screening* with a documented
process and a stakeholder evidence base. It does not replace a facilitated
DMA with external assurance. The report title should continue to say
screening, and the marketing should say what it is — the module's own
registers are already honest about this and the pages are not.

---

## 9. Open decisions

1. **Sub-topic depth — the live question.** ESRS 1 AR 16 has three levels.
   E1 stops at sub-topics (mitigation, adaptation, energy); S1 goes deeper
   (working conditions → secure employment, working time, adequate wages,
   social dialogue, health and safety…). Recommended: one table with a
   self-referencing `parent_code`, so depth is a property of the data rather
   than the schema, and the questionnaire builder walks whatever tree exists.
   Costs nothing now, avoids a migration when someone wants S1 at full
   granularity.

2. **Primary source for transcription.** The sub-topic names are printed
   verbatim into a compliance artefact, so they come from Commission
   Delegated Regulation (EU) 2023/2772, ESRS 1, AR 16 — not a secondary
   summary. The transcription carries the `lib/sbti/params.ts` provenance
   treatment: regulation, article, date, in the file header.

3. **Likelihood weighting** — what multiplier for unlikely / possible /
   likely? A disclosed constant, not a hidden one.

4. **Anonymity floor** — below how many responses per department are results
   suppressed to protect the respondent? Proposed: 3.

5. **Does the questionnaire ship at $4,900, or justify a tier above it?**
   It is the most labour-intensive part to build and the most valuable to
   the customer.

6. **Sector library scope** — how many sectors at launch, and which? Food
   and beverage is already half-written in the Bay State file.

7. **External respondent identity** — do external stakeholders authenticate,
   or is a tokenised link enough? The supplier portal's token pattern is
   reusable, but its never-expiring, never-revocable link is the weakest
   part of it; `verifier_access` already has the better shape
   (`expires_at`, `revoked_at`, status gate).

9. **Which standard does the module implement first?** ESRS (2026) applies
   from FY2027 and is what a new customer will need, but a customer reporting
   FY2025 or FY2026 is under ESRS (2023). Building 2026 first and 2023 second
   is probably right — but the sector library has to be authored twice, and
   that is real work either way.

10. **Does the report state the standard version on its face?** It should.
    Recommended: on the cover, not buried in the assumptions register.

**Settled:** the two-layer model (§1); the taxonomy is versioned and both
standards coexist (§2); ESRS depth is two levels with `parent_code` retained
(§2); four-point scales on all three dimensions (§5.3); severity as the mean
with a top-band override at 4, supported by ESRS 1 AR 20, plus the
human-rights and positive-impact rules (§6.2).

---

## 10. Sources consulted

- **ESRS (2026)** — Commission Delegated Regulation amending (EU) 2023/2772,
  C(2026) 5010 final, adopted 3 July 2026. Consulted directly:
  `ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010_en.pdf`
  The standards text is in Annex I:
  `ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010-annex_en.pdf`
  **ESRS 1 read in full; Appendix A transcribed into §11.** The topical
  standards (ESRS 2, E1–E5, S1–S4, G1) in the same annex have NOT been read —
  they carry the DRs and datapoints, which the disclosure roadmap will need.
- **EFRAG draft revised ESRS 1, November 2025** — the technical advice the act
  is based on. It was used for the first draft of this spec and **every
  citation taken from it was wrong by one or two.** ¶41→¶40, ¶42→¶41, ¶45→¶44,
  AR 20→AR 22, AR 21→AR 23, AR 22→AR 24, AR 23→AR 25. All have since been
  corrected against the adopted annex. Recorded here because it is the
  cheapest possible demonstration of why a regulatory citation in a
  customer-facing report is checked against the adopted text and nothing else —
  the draft was authoritative, recent, and from the body that wrote the advice,
  and it was still wrong.
- **Delegated Regulation (EU) 2023/2772** — ESRS (2023), still applicable for
  FY2024–2026.
- Market survey of severity methods: Position Green (average), Upright
  Platform (multiplicative), and EFRAG IG 1-derived guidance
  (any-sub-criterion threshold).

⚠️ **Nothing in this spec has been checked against the adopted delegated act's
own text.** The taxonomy transcription task must start there, not here.

---

## 11. ESRS (2026) Appendix A — the verified taxonomy

Transcribed 15 August 2026 from the **adopted text**: Commission Delegated
Regulation C(2026) 5010 final, Annexes 1 to 2, Annex I, ESRS 1 Appendix A —
List of topics. Not from EFRAG's advice, not from a summary.

`ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010-annex_en.pdf`

**Nine topic rows, 31 sub-topics.** Appendix A is explicitly non-binding
guidance and explicitly not a substitute for the materiality process.

| Topic | Code | Sub-topics |
|---|---|---|
| Climate Change | E1 | 3 |
| Pollution | E2 | 5 |
| Water | E3 | 1 |
| Biodiversity and Ecosystems | E4 | 4 |
| Circular Economy and Resource Use | E5 | 3 |
| Own Workforce and Workers in the Value Chain | S1/S2 | 6 (shared) |
| Affected Communities | S3 | 3 |
| Consumers and End-users | S4 | 3 |
| Business Conduct | G1 | 3 |

### 11.1 The sub-topics

**E1 Climate Change** — climate change mitigation · climate change
adaptation · energy

**E2 Pollution** — pollution of air · pollution of water · pollution of soil ·
substances of concern, including substances of very high concern ·
microplastics

**E3 Water** — water use, including withdrawal, consumption, discharges and
storage

**E4 Biodiversity and Ecosystems** — drivers of biodiversity and ecosystem
change (including terrestrial and marine habitat change, invasive species) ·
state of species · the extent and condition of terrestrial and marine
ecosystems · ecosystem services

**E5 Circular Economy and Resource Use** — resource inflows · resource
outflows related to products and services · resource outflows (waste)

**S1/S2 Own Workforce and Workers in the Value Chain** — working conditions
(including adequate wages, work-life balance, working time, secure employment)
and social protection · social dialogue and collective bargaining, freedom of
association, information and consultation rights of workers, including through
works councils · health and safety · training and skills development ·
diversity and equal treatment (including gender equality, equal pay for work of
equal value, employment and inclusion of people with disabilities,
non-discrimination, anti-harassment, measures against violence) · other
labour-related human rights (including child labour, forced labour, privacy and
adequate housing, water and sanitation)

**S3 Affected Communities** — communities' economic, social and cultural
rights (including land-related impacts, security-related impacts, adequate
housing and food, water and sanitation) · communities' civil and political
rights (including freedom of expression, freedom of assembly, impacts on human
rights defenders) · rights of indigenous peoples (including free, prior and
informed consent (FPIC), self-determination, cultural rights)

**S4 Consumers and End-users** — information-related impacts for consumers or
users (including privacy, access to information, freedom of expression) ·
personal safety of consumers or end-users (including health and safety,
protection of children, security of a person) · social inclusion of consumers
or end-users (including access to products and services, responsible marketing
practices, non-discrimination)

**G1 Business Conduct** — corporate culture, including anti-corruption and
bribery, the protection of whistle-blowers and animal welfare · political
influence, including lobbying activities · management of relationships with
suppliers, including payment practices, especially late payment to small- and
medium-sized undertakings

### 11.2 ⚠️ S1/S2 share sub-topics — the schema decision this forces

Appendix A gives S1 and S2 **one row with one shared sub-topic set**, with a
footnote stating that while the sub-topics are aligned, the depth and
granularity of assessment may differ between own workforce and value-chain
workers, depending on data availability. A second footnote confines "water and
sanitation" to S2.

But there are still **ten topical standards** — S1 and S2 remain separate
standards with separate DRs. So:

- Keep **ten topic codes**. The DR mapping needs S1 and S2 apart.
- The six labour sub-topics are defined **once** and referenced by both.
- The matrix therefore carries **(topic, sub-topic) pairs**, not sub-topics
  alone: `S1 × health and safety` and `S2 × health and safety` are two separate
  determinations, and a company may well find one material and the other not.
- Six shared definitions → twelve matrix rows across S1 and S2. Total matrix
  rows: 3+5+1+4+3+6+6+3+3+3 = **37**.

A schema that keys sub-topics to a single parent topic cannot express this.
`parent_code` must therefore be a *many* relationship for the labour set, or
the six are duplicated with distinct codes under each standard. Duplication is
uglier but simpler and keeps the DR mapping straightforward — recommended.

### 11.3 One further change in the adopted text

**¶24 hardened.** EFRAG's advice said the undertaking *is not required to*
disclose immaterial information; the adopted text says the undertaking **shall
not** disclose it, except as supplementary information clearly identified as
not resulting from the materiality assessment. That raises the stakes on the
determination: over-inclusion is now a defect, not merely wasted effort. It
strengthens the case for the module — a defensible narrowing is worth more when
breadth is prohibited.
