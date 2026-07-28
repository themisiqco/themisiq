# CBAM Customer Helper — System Design

Status: DESIGN (not yet built)
Date: 2026-07-28
Amended: 2026-07-28, following the GHG coverage-check validation test (§8).
Amended: 2026-07-28, following a primary-source pass on default-value
conservatism and the actual-vs-default election (§6, §11).
Amended: 2026-07-28, following a schema recon on what `see_direct` holds —
the comparison denominator is un-marked-up and a commercial framing on it
would invert sign for some customers (§6, §10).
**CORRECTED: 2026-07-28** — an earlier entry in this document stated that
actual-vs-default is not the declarant's election. That was the pre-amendment
Article 7(2). Regulation (EU) 2025/2083 amended it; the choice is now free.
See §6.
Scope: CBAM first; framework intended for all modules.
Includes: precursor intake specification (in scope, not deferred).

## 0. Purpose

Enable a first-time CBAM user — a non-EU steel or aluminium exporter, likely a
sustainability or compliance generalist rather than a carbon-accounting
specialist — to complete the SEE calculator and generate a §1.2 report
**entirely self-service**, with no advisory handoff backstop.

No advisory backstop raises the bar: there is no human downstream to catch an
error, so the helper carries the full weight of preventing one.

## 1. Governing principle

Two distinct failure modes, which pull in opposite directions:

- **Abandonment** — user hits a wall and leaves. Visible, recoverable.
- **Silent error** — user guesses, the form accepts it, a plausible but wrong
  SEE reaches an EU importer's declaration. Invisible, unrecoverable.

**This system does not optimise for completion rate.** Where the two conflict,
silent error wins. A helper that stops a confused user and says "go get X
first" outperforms one that walks them to a confident wrong answer. This is
the platform principle — *accuracy forms trust; fail loud where data is
absent* — applied to onboarding.

## 2. Archetypes

Both are in scope and both are first-class.

- **A — Translation.** Has the operational data; doesn't know that "activity
  data for fuel combustion" means the invoice in their finance system.
- **B — Collection.** Data not yet gathered in usable form. Must ask other
  people and wait. **B's first deliverable is not a report — it is a data
  request pack.** Treating B as a degraded A is the abandonment event this
  design exists to prevent.

## 3. Failure-point map

| ID | Failure | Bounce | Silent error |
|----|---------|--------|--------------|
| FP-0 | "Is my product covered / what's my CN code?" | High | High |
| FP-1 | "What do I need before I start?" | Highest | — |
| FP-2 | Operator / installation identity (CBAM Registry ID is voluntary for non-EU operators, §10.16) | Low-mod | Low |
| FP-3 | "What counts as a process?" — boundary definition | Moderate | **Highest** |
| FP-4 | Field-level regulatory literacy | Moderate | Mod-high |
| FP-5 | "Where do I get the numbers?" | Highest (B) | — |
| FP-6 | Precursors — own-vs-inherited, origin country | High | High |
| FP-7 | "TO SUPPLY" flags read as failure, not progress | High | — |
| FP-8 | "What do I do with this?" — the exit | Retention | — |

Notes:

- **FP-0 and FP-3 are conceptual, not informational.** No tooltip solves
  "which CN code" or "what is a process." They require guided structure.
- **FP-3 and FP-6 are structural decisions made once, early, invisibly.**
  They propagate into every downstream number and nothing catches them. They
  need a *confirmation* mechanism, not a *help* mechanism.
- FP-3 canonical error: fuel for a whole site entered against one process.
- FP-6 canonical error: producing your own precursor *and* entering it as
  purchased — double counting the form cannot detect.

## 4. The two spines

What makes this a system rather than four features.

### Spine A — one completeness model

A single machine-readable description of what a complete submission requires
for *this* user's situation, evaluated continuously and rendered three ways:

1. Pre-flight (readiness checklist)
2. In-flight (wizard progress)
3. Post-flight (report TO SUPPLY flags)

**Invariant:** `evaluateCompleteness(state) → CompletenessResult` is a pure
function over the same process/installation/precursor data `computeSEE`
consumes. Same input, two projections. **The completeness model must never
restate what the engine reads.** A second, drifting source of truth is the
two-parallel-workings-renderers defect class, which previously shipped a false
methodology claim to live customers.

This fixes FP-7 without softening anything. Eleven flags read as failure
because they appear at the end with no denominator. Against a known total they
read as remaining work — the same information, arguably louder.

### Spine B — one content corpus

All explanatory content in one structured, versioned store. Each entry carries:
plain-language body, primary-source citation (IR / Annex / §), applicable
archetype, and `has_number: bool`.

`has_number` is the enforcement hook for the never-fabricate rule: content
asserting a value is marked and must carry its source. Layer 4 may not emit a
numeric claim not present in a retrieved entry.

Layers 1–2 are not merely prerequisites to Layer 4 — **they are its knowledge
base.**

## 5. Layers

### Layer 0 — Triage (front door)

3–5 questions before anything renders: archetype, sector, precursors present,
CN code known. Emits a **route** that selects the checklist variant, prunes
wizard branches, scopes the corpus, and tells Layer 4 who it's talking to.

Highest-yield question: *"Can you put your hands on last year's fuel and
electricity records for this production line today?"*

### Layer 1 — Readiness

Grouped by **who holds the data**, not form order — the user's real next action
is contacting a person. Groups: own meters and bills / finance and procurement /
plant and production records / precursor suppliers / customs and classification.

Each item: what's needed, why CBAM asks, where it typically lives, what
good-enough looks like.

Exits:
- **A →** start the calculator.
- **B →** generate the **data request pack**: per-holder requests in plain
  business language, CBAM reason stated, deadline field. This is B's first
  deliverable and must be genuinely good — it is the artifact that brings them
  back.

The precursor request is the highest-value item in the pack: hardest data to
obtain, longest lead time, no software substitute. Getting those requests sent
in week one rather than week six is the largest single lever on
time-to-first-report in this design.

### Layer 2 — Inline help

Per field, four parts, always the same shape:
**what it is / why CBAM asks / where to find it / what good looks like.**
Terse by default, expandable, citation on expansion.

Rules:
1. Illustrative values are marked and sourced, never liftable into the field.
   ("Natural gas carbon content is typically around 0.75 — use your supplier's
   fuel spec or SDS; this figure is orientation only.")
2. Replaces the current terse, steel-centric hints wholesale — including the CN
   field's now doubly-wrong "must be 8-digit spaced" copy (both the regex and
   the DB CHECK were dropped 2026-07-27). **That copy fix is shippable
   independently and immediately.**

Solves FP-2 and FP-4. Insufficient for FP-0, FP-3, FP-6.

### Layer 2.5 — Structural confirmation

The silent-error control. Fires at structural commit points, restates the
user's own configuration in plain language, and requires affirmation.

Commit points (all `singleton` scope for CBAM — see below): process boundary;
shared-utility allocation; own-vs-inherited precursor; net-vs-gross production;
output-stream sign convention. (These are also where a verifier would probe — a
useful check on the list.)

Three required properties:
- **Generated from the user's data**, not a static warning — cannot be
  banner-blindnessed.
- **Names the specific failure mode.** A generic "are you sure?" cannot be
  meaningfully affirmed.
- **Carries a scope: `singleton` | `per_instance`.** Configuration-level
  decisions (process boundary, own-vs-inherited precursor) are affirmed once
  and apply throughout. Instance-level decisions (GHG straddle proration) need
  one affirmation per occurrence, and a new occurrence requires a new
  affirmation. Without scope the engine either nags on settled decisions or —
  the dangerous case — silently reuses a stale affirmation against data it
  never saw.

Example: *"You've entered purchased hot metal as a precursor, and you've also
told us this installation produces hot metal. If you're consuming your own
output it isn't a purchased precursor — that's double counting. Which is it?"*

Each affirmation writes to the audit trail with a timestamp — same discipline
as GHG coverage resolutions. Structural decisions become part of the provenance
record rather than invisible assumptions. This is an assurance asset, not
only a UX device.

### Layer 3 — Guided wizard

Concept-before-field, branching on the Layer 0 route. The existing four setup
steps are the bones; this adds connective tissue.

Owns two things no other layer can:

**CN classifier (FP-0).** Guided narrowing, not lookup: product form → material
→ processing state → candidate codes, each with a plain description and a
"not this if…" disambiguator. Terminates in a confident code, or an honest
*"both are plausible; your customs documentation is authoritative — CBAM
classification follows customs classification."* Backing data already exists:
224 distinct codes in `cbam_default_values`, the universe used by the
seed-membership CN validation.

**Precursor step.** See §7.

### Layer 4 — Grounded assistant

Last, and narrower than it first appears — the spines have absorbed most of its
job. Answers "what do I put here?" by retrieval over Spine B with current form
state as context.

Hard constraints, not prompt suggestions:
- Retrieval-only over the versioned corpus. No answer without a citation.
- **Never asserts a numeric value as the user's answer.** May say where a
  number comes from and which document it lives on; may not say what to type.
- Refuses outside CBAM scope, and refuses on open §11 items (CSCF is
  unpublished; confident commentary on it is precisely the failure the engine
  is built to avoid).
- Fails honest: *"I'm not certain. Here is the primary source and the field
  this affects."*
- All exchanges logged — this is regulatory-advice-adjacent.
- **May escalate to Layer 2.5.** If a question reveals a boundary problem, the
  correct response is not an answer but triggering the relevant playback.

## 6. Self-service completeness bar

### The line

| | Owner |
|---|---|
| Knowing *what* is required | Helper |
| Knowing *where* it lives, *who* holds it | Helper |
| Knowing *how* to structure and enter it | Helper |
| **Possessing it** | **Customer** |

### Completion is not binary

Every item carries one of **five** states:

- **Evidenced** — actual data from the customer's records
- **Substituted** — stands in for actuals, and **method-bearing**:
  - `published_default` — a published Commission default value (carries its
    citation)
  - `derived_estimate` — computed from the customer's own partial data
    (carries its basis note, e.g. GHG's `×12/months_covered` extrapolation)
- **Outstanding** — required, not supplied, substitutable
- **Blocked** — required, not supplied, **not** substitutable
- **Conflicted** — supplied, but contradicted by other supplied data

Two notes on why this shape.

**Substitution is method-bearing** because a published default and a derived
estimate are different claims with different provenance, different
defensibility to a verifier, and different disclosure obligations. The GHG
engine already enforces exactly this distinction — *monthly = evidenced only,
annual = evidenced + estimated* is a locked CLAUDE.md invariant. Collapsing
them would contradict a rule the platform already holds.

**Conflicted is not an absence.** The other four states describe degrees of
having a thing; Conflicted describes having two things that cannot both be
true. GHG's overlap detection is this state (two bills, same period,
duplicate-or-two-meters). CBAM's own-vs-inherited precursor double-count is
the same state: nothing is missing, something is contradictory.

A submission is *generatable* when nothing is **Blocked and nothing is
Conflicted**. It is *complete on actuals* only when nothing is Substituted.
Two finish lines, both displayed — they mean different things to the user's
importer.

FP-7 resolved: *"23 evidenced · 8 on defaults · 3 outstanding · 0 blocked ·
0 conflicts — you can generate now; here's what improves it."*

### Observations channel

Not everything worth surfacing is an item. GHG's out-of-window bills are the
type case: nothing is required, nothing is missing, the customer simply
supplied something irrelevant — and GHG correctly shows a neutral notice
rather than swallowing it silently.

The model therefore carries an **observations channel** alongside items:
non-blocking, non-stateful, never gates anything, never silent. Without it the
framework would regress a behaviour GHG already ships.

### Defaults substitute for data, never for decisions

- **Defaultable:** quantities and factors with a published Commission value —
  embedded emissions per CN code per country of origin (IR 2025/2621),
  precursor SEE where the supplier hasn't responded, origin country via
  `'other'` fallback.
- **Never defaultable:** CN code, Annex II status, process boundary,
  own-vs-inherited precursor, net-vs-gross production, output-stream sign
  convention. These are decisions the operator makes about their own
  installation. A default here is a fabrication with a citation stapled to it.

Consequently **every Blocked and every Conflicted item is by construction a
Layer 2.5 item.** 2.5 is the mechanism that clears both states; those states
are what make 2.5 unskippable. Nothing else in the system can resolve them,
because both are structural decisions rather than missing data.

### Graceful degradation

"Use defaults now, upgrade to actuals later" works per item — the customer
upgrades one line per quarter and the report regenerates with a smaller
defaulted fraction. No re-doing setup.

**Commercial gradient — VERIFIED FROM PRIMARY SOURCE (28 Jul 2026).**
Conservatism is not an artefact; it is the Commission's stated design.

- **Defaults are deliberately conservative.** IR (EU) 2025/2621 recital (3):
  CBAM's anti-leakage objective would be undermined if importers could apply
  defaults lower than actual embedded emissions, so defaults including
  mark-ups are set on a conservative approach ensuring embedded emissions are
  not underestimated.
- **The mark-up assumes you may be a worse-than-average performer.**
  Recital (4): the mark-up accounts for installations whose emissions exceed
  their producer country's average. Because installation-specific third-country
  data is hard to verify, the Commission uses deviations among Union
  installations relative to the Union average as the proxy. Every operator
  carries that assumption until they calculate. **This is the marketing
  message, and it is the regulation's own logic — not our framing of it.**
- **The gap widens on a published schedule.** Mark-up phases in at 10 % (2026),
  20 % (2027), 30 % (2028 onwards) for iron and steel, aluminium, cement and
  hydrogen; fertilisers sit at 1 % flat (recital (5), Annex I headers).
  **No copy may state a single generic mark-up figure** — it is sector- and
  year-dependent. The cost of lacking actuals rises annually, by regulation:
  a renewal argument with a date on it.
- **Actual-vs-default IS the declarant's election — CORRECTED 28 Jul 2026.**
  An earlier draft of this section asserted the opposite, citing Article 7(2)
  of Regulation (EU) 2023/956 as making defaults conditional on actuals being
  undeterminable. **That was the original 2023 text.** Regulation (EU)
  2025/2083 (in force 20 Oct 2025) replaced Article 7(2): embedded emissions
  in goods other than electricity are determined either (a) on actual
  emissions, **or** (b) by reference to default values. Recital 19 confirms
  the either/or framing. The conditionality is gone.

  **This strengthens the product rather than weakening it.** If the route is a
  genuine choice, then knowing your actuals is what *creates* the choice —
  without them the declarant has no option but the default. The pitch is
  therefore: *you cannot elect the better route if you do not know your own
  number.*

  **And the honesty position holds.** Electing defaults where permitted is
  lawful; ThemisIQ's obligation is to produce a true figure, not to police
  what a declarant does with it. The tool reports in either direction. What it
  must never do is imply that a favourable outcome is assured — see the
  framing rule below.
- **Early-year default use is anticipated.** Recital (5) reasons that
  declarants should be able to use defaults in the first years — partly
  because verifier numbers may only increase after the transitional period —
  and rely on actual emissions subsequently. This supports the graceful-
  degradation design rather than undermining it.

**Framing consequence — the pitch is optionality.** Rewritten 28 Jul 2026
after the Article 7(2) correction above, which removed the objection this
paragraph originally answered.

> **Without your number, your importer has no choice — they use the default.
> With it, they can use whichever is lower.**

Three properties make this the right framing, and each is a repair of a
weakness in what it replaces:

- **It cannot be falsified by one customer.** A savings pitch ("your actuals
  will cost less") breaks the first time an installation comes in above its
  country's marked-up default. The optionality pitch does not: for that
  customer the answer is *the default was the better route, and now you know
  that* — a real outcome, not a consolation. **Never promise a direction.
  Promise the choice.**
- **It explains why a high-emitting installation should still buy.** Under the
  savings framing they are the customer you cannot serve. Under this one they
  are a customer who needs the number precisely because they cannot otherwise
  tell which route is cheaper — and who now has a measured baseline to
  improve against.
- **It is what the amended regulation actually provides.** Article 7(2) as
  amended by Reg. (EU) 2025/2083 gives the declarant an either/or. A product
  that supplies the missing input to a lawful choice is a straightforwardly
  honest thing to sell.

**The mark-up remains the reason the choice usually goes one way**, and that
argument is unaffected by the correction: the default carries 10 % (2026),
20 % (2027), 30 % (2028+) on top of the country figure, so an installation
must be worse than its national average by more than that margin before the
default flatters it. State the threshold, not the outcome — *"you would have
to be more than 10 % above your country's average this year"* is checkable;
*"you will almost certainly come in lower"* is a promise we cannot keep for
every customer.

**Copy rules, binding:**
- Never state or imply that a customer's actuals will be lower. Ban
  "almost always", "you'll save", "guaranteed to beat".
- Always state the mark-up as a schedule with years and sectors, never as one
  generic figure (fertilisers are 1 % flat).
- Never imply the declarant is obliged to use actuals. They are not.

### Two numbers, two audiences — do not conflate them

Schema recon (28 Jul 2026) established that the existing comparison uses the
**un-marked-up** default. `cbam_default_values.see_direct` is the annex's raw
direct-emissions column; the three mark-up columns (`markup_2026`,
`markup_2027`, `markup_2028_plus`) hold the mark-up-inclusive values and are
**read nowhere in the codebase** — seeded across 8,251 rows, never selected.

That distinction is not a matter of precision. It flips the sign.

Worked example, `7206 10 00` / `'other'`: `see_direct` 3.750,
`markup_2026` 4.125. A customer whose actual SEE is 3.9 —

| Denominator | Delta | Reads as |
|---|---|---|
| `see_direct` (3.750) | **+0.15** | "your actuals are worse than the default" |
| `markup_2026` (4.125) | **−0.225** | "you beat the figure your importer would otherwise face" |

Both are true. They are answers to different questions, and only the second is
the pitch this section describes. **Had the existing `default_compared` been
surfaced under a commercial framing, some customers would have been told they
are worse off for having calculated — when the regulation's own mark-up means
they are better off.** That is precisely the failure mode §1 exists to prevent,
and it was one render away.

The resolution is two distinct quantities:

| | Denominator | Audience | Question answered |
|---|---|---|---|
| **Reasonableness delta** | `see_direct` (un-marked-up, direct-only) | Verifier, calculation workings | Is this figure plausible against the published default? |
| **Exposure delta** | `markup_YYYY` for the reporting year | Customer, and their EU buyer | What does calculating actually save the importer? |

Consequences for the build:

- **`default_compared` as it stands is already correct** for the verifier
  surface. Keep it; label it explicitly as un-marked-up and direct-only.
  Do not repurpose it.
- **The exposure delta does not exist yet** and must be **year-keyed** —
  10 % / 20 % / 30 % by reporting period, selected from the process's own
  reporting year, never a constant. The widening gap is the renewal argument,
  and it only works if the year is right.
- **Never show both without distinct labels.** Two deltas of opposite sign on
  one screen, unexplained, is worse than showing neither.

**Country-basis defect (separate, still open).** Independently of the mark-up
question, the comparison query hardcodes `country='other'`, so it compares
every process to a global fallback rather than to the default for goods of
their origin. Both defects must be fixed before either delta is surfaced;
neither fix implies the other.

**Total-vs-direct is moot for now, but not permanently.** For Annex II goods
`see_indirect` is null on 8,250 of 8,251 rows, so `see_direct == see_total` and
the two possible mark-up bases coincide. The single discriminating row
(`2601 12 00`, sintered ore, non-Annex-II) shows them diverging by ~11 %. The
distinction becomes live the moment a sector with real indirect values —
cement, fertilisers, hydrogen — enters the table.

### The honest ceiling

- **Assurance.** A verifier is a third party by definition. The helper produces
  a defensible, provenance-stamped report; it cannot make it verified.
- **A supplier who won't answer.** Honest exit is a defaulted precursor line
  plus a documented gap in the record — never a stall. The customer leaves with
  a usable report and a named, dated register of what's missing. That register
  is next quarter's task list.

## 7. Precursor intake (in scope)

Currently a "coming next" placeholder. Built as part of this work, not before
it — building it cold and retrofitting the helper means building it twice.

Requirements:

1. **`origin_country` stored as ISO 3166 alpha-2 UPPERCASE** (§10.17). The
   engine's resolver is a case-sensitive exact Map-key match with no
   normalisation. Until intake exists, both sectors resolve via `'other'` —
   correct and conservative, but the per-country dimension (6,423 steel rows,
   1,628 aluminium defaults, 48 and 68 countries respectively) stays dormant.
2. **Own-vs-inherited gate** (Layer 2.5) — the double-count control.
3. **Supplier request generation** (Layer 1) — origin country and precursor SEE
   are the long-lead items.
4. **Default fallback per precursor line**, marked Default-substituted, never
   silently.
5. **"Origin cannot be identified" is a distinct state, and it is NOT the
   `'other'` fallback.** IR 2025/2621 Art. 1(5) routes unidentified-origin
   precursors to **Annex IV**, whose values sit at the highest-emission-intensity
   third country — recital (9) says plainly this is to stop operators claiming
   unknown origin to dodge a high country default. Annex IV is **not seeded**
   (§11.16). Until it is, intake must require a real ISO alpha-2 country and
   must NOT offer an "unknown" option, because unknown would fall through to
   Annex I's `'other'` average and **understate**. This is a Blocked item in
   §6's terms, not an Outstanding one: it is not substitutable, because the
   substitute the regulation names does not exist in our data.

## 8. Reusability architecture

### Framework vs content

| | Framework (agnostic) | Content (per module) |
|---|---|---|
| Spine A | Item registry, state machine, evaluator, three renderers | Item list, defaultability, engine binding |
| Spine B | Corpus schema, citation enforcement, `has_number`, versioning | Entries and citations |
| Layer 0 | Triage engine, route scoping | Questions, routes |
| Layer 1 | Holder-grouped checklist, request-pack generator | Items, groupings, templates |
| Layer 2 | Four-part help component | Entries |
| Layer 2.5 | Playback engine, audit-trail write | Commit points, templates, failure modes |
| Layer 3 | Wizard shell, branching, disclosure | Steps, concepts, classifiers |
| Layer 4 | Retrieval, refusal, numeric ban, logging, escalation | **None** — consumes Spine B |

Layer 4 having no per-module content is the test that the corpus design is
right. Bespoke assistant logic is a smell that a module's content is
underspecified.

### Two module families

The framework does not generalise evenly.

- **Data-gathering** — CBAM, GHG, Supply Chain. The problem is *possession*.
  Layers 0–1 carry the weight; archetype triage is meaningful.
- **Judgement** — SBTi, Climate Risk, AI Governance, Cyber. The problem is
  *decision*. Layer 1 inverts into "here are the decisions, who must sign off,
  what each commits you to." Layers 2.5 and 3 become primary, since these
  modules are almost entirely structural commit points.

Item states still hold — a decision is evidenced, outstanding, or blocked, and
never default-substituted, which is consistent with §6.

**Type checklist items as `data_item | decision_item` from day one.** That
distinction is what lets both families share the machinery.

### Content in git, state in DB

Corpus lives in the repo as typed modules (`lib/helper/content/cbam/`),
following `cbam_benchmarks.ts` and `lib/sbti/params.ts`.

Rationale: it is not user data; it is citation-bearing regulatory content whose
changes belong in diff review, not an UPDATE statement; and DB-only drift has
repeatedly bitten (location-allowance trigger, verifier RPC whitelist,
`audit_log`), with the Supabase CLI not installed so replay cannot be tested.

State — triage answers, evaluated item state, 2.5 affirmations — is user data
and belongs in Supabase.

**New state tables get `with check (company_id in (select id from
public.companies where user_id = auth.uid()))` on insert and update from the
start.** Backlog item 20 flags exactly this gap on the sbti tables and
`ghg_monthly_emissions`. New tables must not inherit a known defect; written
correctly they become the template for that hardening pass.

### Validation test — RUN 2026-07-28, PASSED WITH AMENDMENTS

**Question:** can this data model express GHG's existing coverage check?
`analyzeCoverage` already produces gap / overlap / straddle / out-of-window,
writes resolutions to the audit trail, and hard-gates export — a completeness
model with structural confirmation, built once without a framework.

**Result: the abstraction is real and not CBAM-shaped.** Three of the four
amendments it forced apply to CBAM equally — which is the opposite of the
feared failure mode. GHG did not need special cases to fit a CBAM model; GHG
surfaced holes that were already latent in the CBAM design.

**Mapped cleanly:**

- Gap → upload missing bill: Outstanding → Evidenced.
- Straddle → three-way resolution: a Layer 2.5 affirmation, exactly. The user
  is shown their own data ("17 of 31 days in RY2025"), a named consequence, a
  choice; the day-split basis writes to workings and the audit trail. 2.5's
  shape, built a year early for another module.
- Export gate → *no Blocked items*. Strongest corroboration in the exercise:
  `gridReady` **is already a Blocked item** in these terms — required, not
  supplied, deliberately not substitutable, engine skips Scope 2 rather than
  fabricate. This model would have described that gate correctly without being
  told it existed.
- Secondary corroboration: `result_tco2e` null vs 0 (undeclared vs
  attested-absent) maps onto Outstanding vs Evidenced-with-value-zero. The
  state machine already agrees with the CLAUDE.md invariant.

**Amendments forced (all now applied above):**

- **A.** "Default-substituted" was too narrow — gap extrapolation is a derived
  estimate from the customer's own data, not a published default. Substitution
  is now method-bearing. (§6)
- **B.** **No state existed for a conflict.** Overlap is not an absence. Added
  `Conflicted`; the gate is now *no Blocked and no Conflicted*. This was the
  finding that justified the exercise — CBAM's own precursor double-count
  control was specified in §7 without the state machine being able to express
  it. (§6, §7)
- **C.** Affirmations need cardinality — `singleton` vs `per_instance`.
  Without it the engine nags on settled decisions, or silently reuses a stale
  affirmation against data it never saw. (§5, Layer 2.5)
- **D.** Added the observations channel for non-blocking notices. (§6)

**Standing rule:** re-run this test against the second module before declaring
the framework stable. GHG remains the natural second implementation.

### Sequencing the abstraction

Design the framework now at the data-model level; build CBAM's implementation
with the seams in the right places (`lib/helper/`, content separated from the
outset). Do **not** declare the framework stable. Expect the second module to
force changes. **GHG is the natural second** — its coverage machinery already
exists and will exert real pressure rather than politely conforming.

## 9. Build sequence

1. **Spine A + Layer 1 + TO SUPPLY reframe** — one build; one object, three
   views. Fixes the two largest bounce points.
2. **Layer 2 + CN copy fix** — cheap, mostly content; begins populating Spine B.
3. **Layer 2.5** — accuracy-critical; small build, disproportionate value, most
   defensible to a verifier.
4. **Layer 3** — wizard, CN classifier, precursor intake together.
5. **Layer 0** — cheap, but only meaningful once two real routes exist
   (B's route needs Layer 1's request pack).
6. **Layer 4** — last, on a mature corpus.

Reordered from the initial 1→2→3→4 because FP-3 and FP-6 carry the highest
silent-error risk and are solved by 2.5 and 3, not by 1 and 2.

## 10. Open items and dependencies

| Item | Nature | Blocks |
|---|---|---|
| `audit_log` schema + RLS unswept (DB-only) | Prerequisite (roadmap 23.1) | Layer 2.5 affirmation writes |
| ~~`'other'` fallback conservatism unverified~~ **RESOLVED 28 Jul 2026** — conservatism is the Commission's stated design (IR 2025/2621 recitals 3–4) | Closed | — |
| ~~Any regulatory limit on share resting on defaults~~ **RESOLVED 28 Jul 2026** — not a percentage cap but a condition: Art. 7(2) makes defaults a fallback where actuals cannot be adequately determined | Closed | — |
| **Actual-vs-default comparison is write-only** — `default_compared` / `delta_vs_default` written by the compute route, read by nothing (no select list, no type, no render) | Decision 28 Jul: surface as the *reasonableness delta* in workings/verifier first; label un-marked-up and direct-only | Verifier surface |
| **Comparison denominator is un-marked-up** — reads `see_direct`; `markup_2026`/`markup_2027`/`markup_2028_plus` are read nowhere. A commercial framing on `see_direct` inverts sign for customers sitting between the raw and marked-up default | Build the *exposure delta* as a separate year-keyed quantity; never repurpose `default_compared` | Customer-facing headline; the §6 commercial gradient |
| ~~**Comparison country basis hardcoded**~~ **RESOLVED 28 Jul 2026** — two-step exact-then-`'other'` lookup mirroring `defaultLookup`; resolved country recorded in `workings.defaultComparison.countryUsed` | Closed | — |
| ~~**Comparison denominator is un-marked-up**~~ **PARTIALLY RESOLVED 28 Jul 2026** — exposure delta now computed against `markup_YYYY` and persisted in `workings.defaultComparison.exposure`, guarded on `see_direct === see_total`. Still not surfaced to any customer UI | Surfacing is the remaining work | Customer-facing headline |
| **IR 2025/2621 Annex IV not seeded** (§11.16) — unidentified-origin precursors would resolve to Annex I's `'other'` average instead of the highest-intensity Annex IV value the regulation requires. Understates | Seed Annex IV before precursor intake offers any "origin unknown" path | Precursor intake (§7) |
| ~~**Spec §3 schema sketch is stale**~~ **RESOLVED 28 Jul 2026** — executable DDL struck; migration is the schema | Closed | — |
| **System boundaries must align with EU ETS** — Reg. (EU) 2025/2083 recital (16) and amended Art. 7(7)(a): certain finishing processes for some steel and aluminium goods are excluded from the boundary. IR 2025/2547 post-dates the amendment so the engine may already be correct, but this is unverified | Verify against `lib/cbam/` boundary logic; §11 watch entry | Correctness of SEE for downstream steel/aluminium goods |
| **Quarterly holding can rest on last year's surrender** — Art. 22(2)(b): from 2027 the 50 % quarterly holding may be based on the prior year's surrendered certificate count for the same goods and CN code, rather than defaults. Supplying verified actuals therefore reduces the importer's tied-up working capital in every subsequent year | Marketing argument, unused | Retention / renewal case |
| **Carbon-price deduction is capped on the default route** — Art. 9(4): where emissions rest on default values, the third-country carbon-price deduction may be claimed only by reference to yearly *default* carbon prices. Actuals open the route to the price actually paid | Marketing argument, unused; material for exporters in carbon-priced jurisdictions | Value case, esp. Canada |
| **Mark-up step 10 %→20 % at 2027, →30 % at 2028**; defaults and mark-ups to be revised by Dec 2027 at latest, with the Commission aiming to bring a revision forward into 2026 where possible | §11 watch | Seeded values' shelf life |
| Corpus review workflow — entries stale as regulation moves | Design | See `docs/regulatory-source-monitoring-design.md` |
| CSCF unpublished; benchmark bands stop at 2030; stainless indicator gap | §11 watch | Layer 4 refusal list |
| Supabase CLI not installed | Tooling | Migration replay testing |
| `/cbam/preview` sample is steel-only | Nice-to-have | — |
