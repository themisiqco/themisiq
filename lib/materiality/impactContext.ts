/**
 * WHERE an impact occurs and OVER WHAT PERIOD — the contributor-facing copy for the two questions
 * that sit outside the severity calculation.
 *
 * ⚠️ TRANSCRIBED FROM docs/materiality-questionnaire-spec-v12.md §5.2. That section's SEVERITY
 * option lists were deleted on 18 Aug 2026 and replaced by §5.3; these two were not, and are
 * marked "Still true and not superseded" there. If wording changes it changes in the spec first.
 *
 * ⚠️ NOT IN severityScale.ts, and the reason is that file's own guard. It exists to make a
 * direction-free scale export impossible, and its header is about nothing else. Neither of these
 * vocabularies is direction-keyed, so putting them there would attach copy with no hazard to a
 * warning about a specific one — and would put §5.2 and §5.3 in one file when the two sections have
 * different supersession histories.
 *
 * ⚠️ THIS IS NOT THE VOCABULARY FOR materiality_survey_respondents.value_chain_position.
 * That column is a SINGLE text — where a PERSON sits — and this one is where an IMPACT occurs.
 * The schema says so in terms (20260838:149-152, and the column comment at :523: "Do not unify
 * them"). One impact routinely spans own operations and upstream; a supplier contact cannot be
 * upstream and downstream at once. If the respondent side ever needs option copy, it needs its
 * own — importing this would be the unification the schema forbids.
 *
 * Extracted 21 Aug 2026 from two verbatim copies, in
 * app/dashboard/materiality/worksheet/[id]/determine/page.tsx and app/impact/[token]/page.tsx.
 * Both are live contributor-facing forms and the labels here are byte-identical to what those
 * forms were already showing — impactContext.test.ts pins that, because a silent rewording during
 * an extraction is the one way this move could have cost something.
 */

export type CodedLabel = { code: string; label: string }

/**
 * ⚠️ MUST STAY IN STEP WITH THE CHECK CONSTRAINT:
 *     value_chain_position text[] not null default '{}'::text[]
 *       check (value_chain_position <@ array['own_operations', 'upstream', 'downstream']::text[])
 * Adding an option here without a migration produces a form that saves nothing and a Postgres
 * constraint error the contributor cannot act on. impactContext.test.ts pins the pair.
 *
 * ⚠️ NO "Not enough visibility" OPTION, unlike the three severity dimensions and unlike §5.2's own
 * list. That is the shipped behaviour as of 21 Aug 2026, not an oversight corrected here — adding
 * it changes what contributors are asked and needs a decision, not a refactor.
 */
export const VALUE_CHAIN_POSITIONS: readonly CodedLabel[] = [
  { code: 'own_operations', label: 'Our own operations' },
  { code: 'upstream', label: 'Upstream — our suppliers' },
  { code: 'downstream', label: 'Downstream — our customers and products' },
] as const

/**
 * ESRS 1 §6.4 / IFRS S1 entity-defined horizons.
 * Constraint: check (time_horizon in ('short', 'medium', 'long')). Nullable, no default.
 *
 * ⚠️ DELIBERATELY NOT IN THE BOARD REPORT, and this is the note for whoever reaches for it.
 * Decided 21 Aug 2026. "Medium — one to five years" asserts a timeframe the record cannot
 * substantiate: ESRS 1 §6.4 makes horizons ENTITY-DEFINED, and nothing ties a stored horizon to
 * materiality_assessments.reporting_period_start / _end — so the report would print a span with no
 * anchor. It is also single-valued and frequently null, and a null here reads as "not asked" and
 * "asked and skipped" identically. It belongs on the audit surface (worksheet/[id]/determinations),
 * where an absence can be stated plainly, and not on a document a board reads as a finding.
 * Reviving it for the report means first tying the horizon to the reporting period.
 */
export const TIME_HORIZONS: readonly CodedLabel[] = [
  { code: 'short', label: 'Short — within a year' },
  { code: 'medium', label: 'Medium — one to five years' },
  { code: 'long', label: 'Long — more than five years' },
] as const

/**
 * ⚠️ VALUE CHAIN POSITION AND THE BOARD REPORT — an open question, not a closed one.
 * Also 21 Aug 2026. Unlike the horizon, this one has a case: ESRS 1 requires the assessment to
 * cover the upstream and downstream value chain, and "Water consumption · Harm: severity 3.0 ·
 * material" tells a director nothing about who has to act. It was held back for one reason only —
 * neither field is required by the submit RPC (it validates seven other things and not these), so
 * nobody knows yet what proportion of determinations carry a position. Surfacing it on
 * worksheet/[id]/determinations first is how that gets answered. If most determinations do carry
 * one, the report change is a suffix in assessmentBlock's existing `drivers` idiom.
 */

const labelOf = (list: readonly CodedLabel[], code: string | null | undefined): string | null =>
  (typeof code === 'string' && list.find(x => x.code === code)?.label) || null

/** The plain-language label, or null for an unknown or absent code. NEVER the raw code. */
export const valueChainLabel = (code: string | null | undefined): string | null =>
  labelOf(VALUE_CHAIN_POSITIONS, code)

export const timeHorizonLabel = (code: string | null | undefined): string | null =>
  labelOf(TIME_HORIZONS, code)
