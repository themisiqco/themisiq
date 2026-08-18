# Stakeholder Questionnaire & Impact Materiality — design spec v10

**Status:** design only for the questionnaire itself. ⚠️ v6 rewrote §3, §5.1
and §6.3 because the taxonomy the survey hangs off is now BUILT — see §3.0.
⚠️ v7 corrects five things the build recon found wrong, listed at the head of
§9. The S1/S2 routing error in §3.0.1 was the significant one.
⚠️ v8 adds a fifth counter and replaces the single affected-stakeholder flag
with two overlapping booleans, both verified against the adopted Annex I.
⚠️ v9 adds §1.0 and §7.0 after checking published practice: the instrument
is unchanged, its FRAMING was wrong, and the matrix is optional rather than
required.
Everything else is unchanged from v5. Original status line follows.

**v5 status:** design only. Nothing built. Written 15 August 2026; severity method, positive impacts and sub-topic depth added same day after market survey and codebase recon.
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

### 1.0 ⚠️ WHAT THE SCREENING SURVEY IS, AND WHAT IT IS NOT

Added v9, after checking published practice. This section exists because
the instrument is right and its **framing** was wrong, and the framing is
what an assurance provider reads.

**The change CSRD made.** PwC states it plainly: under CSRD the use of
stakeholder input has changed — whereas previously stakeholders were asked
which topics they *considered important*, they are now asked to identify
the organisation's *most significant impacts* on people and the
environment, and its most significant risks and opportunities.

The Bay State question — *"what strategic priority should be assigned
to X"* — is the pre-CSRD form. It asks what the respondent thinks matters.

**But the same source immediately concedes why that change cannot simply
be pushed onto every respondent:** not all stakeholders will be able to
compare and assess a broad range of topics from those two perspectives.

**And its resolution is this spec's §1.** Do part of the assessment with
internal and external experts on the various matters — which gives insight
into the organisation's impact — and let the stakeholder dialogue focus on
what the organisation can do better.

So the two-layer model is not a workaround for a survey that cannot ask
ESRS questions. It is what a Big 4 methodology arrives at independently,
for the same reason.

**What follows for the product, and it is a framing change only:**

| | |
|---|---|
| The screening survey **is** | the stakeholder dialogue layer. It gathers what the people who see this company think it should prioritise, and it is evidence for ESRS 2 SBM-2. |
| The screening survey **is not** | the impact assessment. It does not score severity, and no output of it may be presented as an impact determination. |
| The impact assessment **is** | the preparer's judgement, informed by the survey, scored against ESRS 1 ¶40's characteristics — §5.2 and §6.2. |

PwC's own practical tip puts the survey in the right place: *test* your
material topics with stakeholders, and leave room for challenge and
discussion. Testing and challenge — not origination.

⚠️ **The report must say this.** A screening report that presents survey
results next to a matrix without stating which layer produced which is
inviting a reader to take the survey for the assessment. §7's engagement
section is where the distinction gets made explicit.



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

### 3.0 ⚠️ WHAT IS BUILT SINCE v5 — read this before the rest of §3

This spec was written before the taxonomy existed. It now does, and three
things it assumed are no longer assumptions:

**The survey asks at SUB-TOPIC level, not topic level.** `mr_esrs_subtopics`
holds 37 rows for `esrs_2026`, transcribed from the adopted Annex I. That is
the right granularity for a respondent: *"Health and safety"* is answerable,
*"Own Workforce and Workers in the Value Chain"* is not. Every question in §5
therefore hangs off a sub-topic code, and the topic layer is a grouping for
presentation and roll-up, never a question.

**Everything is scoped by `standard_version`.** A questionnaire built against
`esrs_2026` sub-topics cannot serve a 2023 assessment — the taxonomies differ
in name, in count and in structure. So a survey round records the version it
was built against, and an assessment can only consume a survey built against
its own version. Cross-version reuse is a data error, not a UX inconvenience.

**S1 and S2 share six sub-topic definitions but are two determinations.**
`S1.3 Health and safety` and `S2.3 Health and safety` are separate rows,
separately scored, and a company can find one material and the other not —
that is exactly what the annex's own footnote about differing data
availability anticipates.

### 3.0.1 The S1/S2 question — routed by stakeholder CATEGORY, three outcomes

A respondent asked about health and safety is answering one question. The
matrix needs two answers. Three options:

| | What it does | Cost |
|---|---|---|
| **Ask twice** | Two questions per shared sub-topic of every respondent | Six extra questions each — 37 becomes 43. Respondents distinguish them poorly. |
| **Ask once, apply to both** | One answer feeds S1.x and S2.x identically | Shortest. But asserts the two are equally material on evidence that asked about neither specifically. |
| **Ask once per respondent, author twice, route by category** | Each respondent sees the framing they can actually answer; the answer resolves to S1.x or S2.x | No extra questions per respondent, but **two wordings per shared sub-topic in the question set** — "your own workplace" versus "workers in your suppliers' operations". Requires the category model (§4) to drive routing. |

**Recommended: the third**, and note its real cost, which v6 understated. It is
*ask once per respondent, author twice* — not "no extra questions". Still far
cheaper than option 1, and the only one where the answer's provenance matches
the determination it feeds.

#### ⚠️ The routing key is the stakeholder CATEGORY, not an internal/external binary

v6 said "internal respondents answer for S1; value-chain and supplier
respondents answer for S2". That is wrong, and it routes people onto questions
they cannot see. §4's external categories include customers, investors and
lenders, regulators and civil society — none of whom can observe health and
safety in your suppliers' operations.

| Respondent | The six labour sub-topics |
|---|---|
| Internal | asked, resolve to **S1.x** |
| External — value-chain worker, workers' representative (value chain), supplier | asked, resolve to **S2.x** |
| External — customer, investor, regulator, affected community, civil society | **not asked** |

#### ⚠️ NOT ASKED is a third recorded state, distinct from abstention

This is the sharp consequence, and it protects a finding the spec already
relies on. §6.1 makes the abstention count a finding in its own right — a
sub-topic most respondents abstained on usually means the company has no
visibility of its own impact, which is material information.

If a customer who was **never shown** S2.3 is counted as an abstention, the
survey's own routing corrupts that finding. If they are counted in `n`, the
denominator is wrong. **Both errors point the same way: they make the company
look blinder than the evidence says.**

So every sub-topic carries four counters, never two:

```
n_asked      — shown to this respondent (DERIVED, see below)
n_answered   — a value on the scale
n_abstained  — "not enough visibility", a RECORDED answer
n_skipped    — shown it, engaged with neither option
n_not_asked  — routing excluded them; not evidence of anything
```

**Five, not four.** `n_skipped` falls out of the arithmetic —
`n_asked − n_answered − n_abstained` — and naming it is the point. *"I saw
this and didn't engage"* is a different finding from *"I saw this and cannot
say"*: the second says the company has a blind spot, the first says the survey
was too long or the respondent disengaged. Folding skips into abstentions
would corrupt the §6.1 finding in the same direction as counting not-asked
would.

⚠️ **`n_asked` is DERIVED, never counted.** A response row's absence cannot
distinguish *never shown* from *shown and skipped*, and partial submission is
permitted, so both occur. Compute it: respondent R was asked question Q iff
`Q.status = 'included'` and, for the twelve labour rows only, R's category
routes to something other than `not_asked`. Both inputs are already immutable
— the question set freezes on first response, the category table is
append-only — so nothing needs materialising.

⚠️ **Where a survey has no S2-eligible respondents, S2's six sub-topics
resolve to unknown.** Not "no external respondents" — a survey with forty
customers and no value-chain workers still yields unknown S2, and the weaker
condition would read as satisfied. Unknown must never be an inherited S1
score: an absent answer is never a value (§6.1).

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

### 3.2 Sector library — now a SELECTION over sub-topics, not a parallel list

⚠️ Changed since v5. The library no longer invents its own entries mapped back
to ESRS. It is a per-sector **selection** over the 37 rows already in
`mr_esrs_subtopics`, plus the customer's own wording on top:

```
mr_esrs_subtopics row          ← locked, transcribed law, versioned
  └── in-scope for this sector?  ← the library's only job
        └── customer's wording   ← fully editable, defaults to the annex text
```

#### ⚠️ The annex label is NOT usable as question wording

v6 said the customer's wording "defaults to the annex text". That fails for
roughly a third of the rows: `S1.1` is 105 characters of parenthetical list,
`S1.5` is 213. Defaulting to those produces a question no Finance manager will
read — precisely the failure §1 exists to prevent.

And the labels cannot be shortened. `20260815_mr_esrs_subtopics.sql` forbids
editing them and a replay would silently revert any edit, because that seed is
the transcription of record.

So a **separate short-name layer**: 37 ThemisIQ-authored display names,
sitting beside the verbatim legal label, never replacing it. The short name
seeds the question; the verbatim label travels to the report. Cheap — 37
strings — and it is the same separation of house copy from transcribed law
that kept `desc` out of `mr_esrs_topic_labels`.

The Bay State file remains the proof of what customers need — 26 questions in
their own language, "grain supply chains" and "oat milling" rather than ESRS
labels. But those roll UP to sub-topics now, rather than being authored beside
them. A customer adding an entity-specific matter picks the sub-topic it maps
to; where none fits, ESRS 1 Appendix A explicitly contemplates entity-specific
disclosures outside its list, and those carry a null sub-topic and are excluded
from the matrix roll-up.

#### Selection rules


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

### 3.3 Versioning — TWO independent versions, do not conflate them

⚠️ Changed since v5. There are now two versioned things in play and they move
for different reasons:

| | What it versions | Moves when |
|---|---|---|
| `standard_version` | which ESRS taxonomy the questions hang off | the regulator amends the standards |
| questionnaire version | the customer's own wording of those questions | the customer edits a question |

A survey round records both. `standard_version` is fixed at creation and can
never change — changing it would re-point every question at a different
sub-topic set. The questionnaire version freezes on first response, per the
rule below.

**An assessment may only consume a survey built against its own
`standard_version`.** Not a warning, a constraint: a 2023 assessment fed by a
2026 survey is scoring sub-topics that do not exist in its taxonomy.

#### ⚠️ THIS IS A GATE ON THE FEATURE, NOT A SEQUENCING QUESTION

`mr_esrs_subtopics` is seeded for `esrs_2026` only — zero rows for
`esrs_2023` and `esrs_2023_reliefs`, deliberately, because the 2023 taxonomy
is a different instrument. Combined with the constraint above:

**A customer reporting under ESRS (2023) cannot have a stakeholder survey at
all.** Not a degraded one — none.

That includes every FY2025 and FY2026 filer who has not early-adopted, which
today is most of the market. §9 open decision 9 treated "which standard first"
as ordering; it decides who the feature exists for. Three ways out, and it
needs deciding before build:

| | Consequence |
|---|---|
| Ship 2026-only | Correct, and narrow. Sells to early adopters and FY2027 planners. |
| Transcribe the 2023 sub-topic taxonomy | Opens the current market. It is AR 16's three-level structure, a second transcription against a different instrument. |
| Let a 2023 assessment consume a 2026 survey, disclosed | Cheapest, and it breaks the constraint above for a reason the report would have to state. I do not recommend it. |

An assessment whose `standard_version` is NULL — "not stated", which is every
assessment created before the wizard asked — matches no survey. That must be
a refusal naming the reason, not a silent empty result.

#### The wording-drift rule


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

#### ⚠️ AFFECTED and USER are two overlapping groups, not one flag

Verified against the adopted Annex I, 15 August 2026. The glossary defines
both, and then says outright: **some, but not all, stakeholders may belong to
the two groups.** A single `affected` boolean cannot express that, so the
category model carries **two booleans, both settable**.

**Affected stakeholders** — individuals or groups whose interests are affected
or could be affected, positively or negatively, by the undertaking's
activities and its direct and indirect business relationships across its value
chain (glossary; ESRS 1 ¶42).

**Users** — investors, lenders and creditors, plus the undertaking's business
partners, social partners including trade unions and employer organisations,
civil society and NGOs (glossary).

**Where a supplier lands — all three at once, which is why the flag failed:**

| | Basis |
|---|---|
| **User** | "Business partners" is named explicitly in the users definition. |
| **Affected** | Their interests are affected by your activities. ESRS discloses exactly this: `G1-6 Metrics related to payment practices` covers late payment to SMEs, and sub-topic G1.3 names it. An impact *on* suppliers, disclosed as one. |
| **Proxy for affected** | Answering S2 labour questions, the affected parties are the supplier's *workers* — AR 23's typical categories include workers in the upstream and downstream value chains. ESRS 1 ¶42 anticipates this: civil society, NGOs and trade unions *as users* can be proxies for affected stakeholders. |

Note AR 23 says the **typical** categories are — a list of examples, not a
closed set. A supplier's absence from it excludes nothing.

**What this buys §7.** The engagement disclosure can now state honestly which
categories were engaged as affected parties, which as users, and which acted
as proxies for affected people who could not be reached directly. That last
clause is what an assurance provider is looking for, and a single boolean
could not produce it.

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

### 5.1 Screening survey — one question per SELECTED SUB-TOPIC

⚠️ Changed since v5: per sub-topic, not per topic. A full `esrs_2026` scope is
37 questions before the customer deselects anything; the Bay State survey ran
26 and was completed by 26 people, so that is the right order of magnitude.
Deselection is what keeps it there, and every deselection is a recorded
IRO-1 decision (§3.2).

One question per sub-topic, plus context. This is the Bay State pattern and it is
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

⚠️ **THE OPTION LISTS THAT WERE HERE ARE SUPERSEDED. SEE §5.3.**

This section originally gave scale four options and scope and
irremediability three each. §5.3 corrects that to **four on all three
dimensions**, and states why in terms that matter: a 3 on a three-point
scale is the worst there is, while a 3 on a four-point scale is one below
the worst, so averaging across mismatched ranges silently weights the
shorter scales heavier — and *"would have corrupted every severity figure
the engine produced."*

The lists have been removed rather than corrected in place, because a
corrected copy is still a second copy, and the next reader has no way to
know which of the two is current. §5.3's table is the only source.

**§5.3 IS AUTHORITATIVE FOR ALL THREE DIMENSIONS.** Anything building
contributor-facing copy, a scoring form, or `lib/materiality/severity.ts`
reads it there.

Still true and not superseded — the questions themselves, and their
order:

- **How serious are the consequences for people or the environment?**
  *(scale)*
- **How widely are they felt?** *(scope)*
- **Can the damage be put right?**
  *(irremediability — negative impacts only, ESRS 1 ¶41)*

Each carries **Not enough visibility** as a fourth answer outside the
scale, per §6.1 — a recorded answer, never a zero and never a low.

⚠️ §5.3's four-point wording exists only as terse table cells. It needs
plain-language expansion before a facilities manager sees it, and that
expansion belongs in §5.3, not here.

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

⚠️ **This table is the ONLY source for these three scales.** §5.2's option
lists were removed on 18 August 2026 rather than corrected, because a
corrected second copy is still a second copy and the next reader cannot tell
which is current. If a scale needs changing, it changes here and nowhere else.

⚠️ **The wording above is terse by necessity — it is table cells.** A
contributor-facing form needs plain-language expansion of each point, and that
expansion belongs in this section beneath the table, so it cannot drift from
the scale it describes. Same rule that keeps `question_framing` on the
sub-topic row rather than in application code.

⚠️ **A CONSEQUENCE OF §6.2's HUMAN-RIGHTS RULE, worth knowing here.** For
social topics severity is the MAX of the three rather than the mean. Under
max, any dimension at 4 makes the result 4, which already clears the 2.5
threshold — so **the top-band override never fires for a social topic**. It is
subsumed. A report claiming the override decided a social row is claiming
something that did not happen, so the severity function must return WHICH RULE
decided each row, not just the number.

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

### 6.2.5 ⚠️ THE STATISTIC IS THE DISTRIBUTION, NOT THE MEAN

Added v9. This supersedes the band comparison in §6.4 and every reference
to a survey mean elsewhere in this spec.

**Why not the mean.** The screening scale is **ordinal**, not interval —
1, 2 and 3 are ordered, but the distance between "sufficient with
continuous improvement" and "improvements would strengthen" is not
demonstrably the distance between that and "needs significant strategic
focus." A mean assumes equal spacing, and that assumption is unjustified
here. It is the standard critique of treating rating-scale responses as
interval data.

**And the frameworks make defensibility the criterion, not elegance.** No
framework and no Big 4 methodology prescribes a scoring rule (§10). What
every source requires is that the method be stated and justified. On that
test:

| | |
|---|---|
| *"9 of 12 said this needs significant focus"* | one sentence, no method to defend, verifiable against the raw responses |
| *"mean 2.4, band high"* | requires defending an interval reading of an ordinal scale, in a document written for an auditor |

**What the aggregation produces per sub-topic, per round:**

```
distribution   n at each of 1, 2, 3          ← PRIMARY. Discards nothing.
top_box        share choosing 3              ← the headline figure
median         valid on ordinal data         ← central tendency, not the mean
agreement      dispersion (see 6.2.6)        ← how concentrated the answers are
+ the five counters from §3.0.1
```

⚠️ **No mean is computed or stored anywhere.** Not as a convenience field,
not "for the chart". A mean present in the payload will be used, and the
first place it is used will be the place that needed a defensible number.

---

### 6.2.6 ⚠️ A SPLIT ROOM IS ITS OWN FINDING — the disagreement register

Added v9, and it is the insight the mean actively destroys.

Seven people answer 3, five answer 1. The mean is 2.2 — middling, and it
says nothing. But that is a company whose own people **fundamentally
disagree** about whether a topic needs attention, which is more
interesting than either band and is arguably the most useful thing a
screening survey can surface.

Consider what it means in each direction:

**Internal disagreement** — the topic is visible to some parts of the
organisation and not others, or practice varies by site. Either is worth
knowing before the topic is called immaterial.

**Disagreement between tracks** — own workforce says one thing,
value-chain workers say the opposite about the same sub-topic. That is
the single most decision-relevant output the S1/S2 routing can produce,
and it exists nowhere else in the market because nobody else records who
answered.

**Disagreement inside a track** is different again from disagreement
*across* tracks, and the register reports them separately.

**Measuring it.** On an ordinal three-point scale the appropriate measure
is a coefficient of agreement rather than a variance — variance again
assumes equal spacing. Van der Eijk's coefficient of agreement (A) is
designed for exactly this case: ordered rating scales, measuring whether
responses concentrate on one category or split across the scale. It runs
+1 (perfect agreement) to −1 (perfectly bimodal), with 0 at a uniform
spread.

⚠️ Whatever measure is used, it is **disclosed in the assumptions
register with its definition**, per §10's rule. And a simpler fallback
that needs no defending at all: report the raw split. *"7 of 12 said
significant focus, 5 said sufficient"* is a finding a reader can check.

**The register lists a sub-topic where:**

- responses split across non-adjacent categories (1 and 3, few or no 2s)
- or agreement falls below a disclosed threshold
- or the top-box share differs by more than a disclosed margin **between
  tracks**

**and n is at or above the anonymity floor for every cell it names.**

⚠️ **This is a separate register from the divergence one (§6.4).**
Divergence is stakeholders versus the preparer. Disagreement is
stakeholders versus each other. A topic can show both, one, or neither,
and collapsing them would lose the distinction between *"your people
disagree with you"* and *"your people disagree with each other."*

---

### 6.3 Roll-up — sub-topic answers to a topic score

⚠️ New since v5, and it inherits `computeMatrix`'s existing discipline.

The survey scores sub-topics; the matrix plots topics. The roll-up must
propagate **unknown upward**, never average around it. A topic whose
sub-topics are partly unanswered is partly unassessed, and a confident topic
score built from partial sub-topic coverage is exactly the defect
`computeMatrix`'s no-baseline comment already forbids one level up:

> Any OTHER topic with no baseline row for this industry is NOT assessed — it
> must read 'unknown', NEVER a default 2/'low' that renders as a positive
> finding of immateriality.

Concretely: a topic score carries the count of its sub-topics that resolved,
and the report states it. Ten of eleven E1 sub-topics answered is a different
claim from eleven of eleven, and the difference must be visible rather than
absorbed into a mean.

⚠️ S2 with no **S2-eligible** respondents resolves to unknown across all six of
its sub-topics — see §3.0.1. Not "no external respondents": a survey with
forty customers and no value-chain workers still yields unknown S2, and the
weaker condition reads as satisfied. It must not inherit S1's scores.

#### The four counters reach the roll-up intact

A topic score carries `n_asked / n_answered / n_abstained / n_not_asked`
summed across its sub-topics, and the report states them. Collapsing them into
a single coverage percentage would merge *we asked and nobody could say* with
*we never asked* — two findings that mean opposite things about the company.

### 6.4 Where the survey feeds the score

The survey does **not** set the impact axis directly. It produces:

1. **Stakeholder priority signal** per topic — mean of non-null screening
   responses, with n and abstention count
2. **Severity evidence** per topic from deep-dive responses, shown to the
   preparer while they score
3. **Divergence flag** — stakeholder priority high, preparer severity low, or
   the reverse.

   ⚠️ **REVISED IN v9 — the comparison uses TOP-BOX, not a mean.** The
   earlier version banded a survey mean against `topicBand()`. §6.2.5
   retires the mean entirely, so the comparison is:

   ```
   survey side:    top_box — the share of non-null answers choosing 3
   preparer side:  the existing impact band from topicBand()
   diverges when   top_box is high and the preparer band is low,
                   or top_box is low and the preparer band is high
   ```

   Thresholds for "high" and "low" on each side are **disclosed
   constants**, stated in the assumptions register. They are not derived
   and not tuned silently — §10's rule applies to them as hard as to
   anything else.

   Top-box rather than a band, because it needs no interval assumption and
   it states itself: *"9 of 12 respondents said this needs significant
   focus, and the assessment scored it low."* An auditor can check that
   against the response rows.

   A sub-topic with `n_answered` below the anonymity floor yields no
   divergence flag at all, and the report says so rather than showing a
   blank.

The preparer sets the score. The survey is the evidence they set it against,
and the report shows both.

---

## 7. What the report must disclose

### 7.0 ⚠️ THE MATRIX IS NOT REQUIRED, AND IT LOSES INFORMATION

Added v9. PwC is explicit: a materiality matrix is an **option, not a
requirement** under CSRD. Its advantage is an easy-to-read consolidated
overview; its downside is that information is lost, because assumptions
are needed to plot positive and negative impacts, and risks and
opportunities, as a single dot. Some organisations therefore present a
table with more detail instead.

Their own step 6 is not a matrix at all: **separate ranked lists** — one
each for negative impacts, positive impacts, risks and opportunities —
split by a disclosed threshold into material and not material. And they
name the same gap the standard leaves: the challenge is setting the
threshold, since ESRS gives limited guidance.

**The module currently leads with the matrix.** That is a defensible
choice — it is what a board expects to see — but it should be a choice
rather than an inheritance, and the table beneath it is arguably the more
useful artefact.

Three consequences worth deciding:

**A single dot per topic hides the sub-topic detail.** Once sub-topic
scoring exists (§3.0), one E1 dot is an average over three sub-topics with
different answers. The ranked table can show all three; the matrix cannot.

**Positive and negative impacts are netted by plotting.** ESRS 1 ¶44
forbids netting them in the assessment (§6.2). A matrix that plots one
impact score per topic has netted them *presentationally*, which is not
the same defect but is close enough to be worth a disclosure.

**The counters do not fit on a matrix.** `n_asked`, `n_answered`,
`n_abstained`, `n_skipped`, `n_not_asked` (§3.0.1) are the evidence base
for every point plotted, and a scatter plot can carry none of it. The
ranked table can carry all five.

⚠️ Recommendation, not settled: **keep the matrix, lead with the table.**
The matrix is the summary a board reads; the ranked table with counters is
the artefact an assurance provider works from, and it is the one this
module can produce better than anyone else.



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
Sub-topics where the stakeholder signal and the preparer's determination
disagree — top-box high against a low determination, or the reverse — with
the preparer's explanation. Expect this to be the most-read page in the
document.

**Disagreement register** *(new in v9 — §6.2.6)*
Sub-topics where the respondents disagree with *each other*: responses
split across non-adjacent categories, agreement below the disclosed
threshold, or a top-box share differing materially **between tracks**.

⚠️ Separate from the divergence register and never merged with it. One
says *your people disagree with you*; the other says *your people disagree
with each other*. A topic can appear on both.

The between-track case is the one to lead with: own workforce and
value-chain workers answering the same sub-topic differently is the
sharpest output the S1/S2 routing produces, and no competing tool can
produce it, because none records who answered.

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

**Settled in v8:** five counters, not four, with `n_asked` derived rather than
counted (§3.0.1); and the stakeholder model carries two overlapping booleans,
`is_affected` and `is_user`, because the glossary says a stakeholder may be
both — a supplier is both, and is additionally a proxy when answering S2 (§4).

**Settled in v7, from the build recon:** the routing key is stakeholder
category with three outcomes including *not asked* (§3.0.1); four counters
rather than two; the S2 fallback condition is *no S2-eligible respondents*
(§6.3); the annex label needs a separate 37-string short-name layer (§3.2);
the 2026-only taxonomy is a gate on who can have a survey at all (§3.3); and
the divergence flag compares bands, not values.

**Settled since v5, by building it:** the survey asks at sub-topic level (§3.0);
S1/S2 shared sub-topics are answered by respondent track rather than asked
twice (§3.0.1); the sector library is a selection over the taxonomy rather
than a parallel list (§3.2); two independent versions, standard and
questionnaire, must not be conflated (§3.3); the roll-up propagates unknown
upward (§6.3).

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
- **Published practice, checked 16 August 2026.** No framework and no Big 4
  methodology prescribes a scoring or weighting rule. KPMG names the ESRS
  criteria — scale, scope, remediability, likelihood — and stops. Deloitte
  describes engagement methods (interviews, focus groups, surveys) without
  arithmetic. One review notes pointedly that KPMG's guide says nothing
  about how to quantify materiality. **So the assumptions register is the
  whole game, and a method that is easy to state and verify beats one that
  is statistically elegant.**
- **PwC Netherlands, CSRD Double Materiality Assessment** — the source for
  §1.0 and §7.0. The question-form change, the concession that stakeholders
  cannot all assess impacts, the expert/dialogue split, the matrix being
  optional and lossy, and ranked-lists-plus-threshold as their step 6.
- **LSEG double materiality assessment methodology 2025** — a real
  company's published practice rather than a consultancy's brochure. Their
  engagement table surveys customers, suppliers and employees directly;
  reaches communities, NGOs, investors and regulators by interview with
  **internal proxies**; and lists nature as a silent stakeholder. That is
  §4's proxy design and `typically_surveyed`'s split, independently
  arrived at by a FTSE 100 filer.
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
