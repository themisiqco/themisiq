/**
 * The contributor-facing copy for the ESRS 1 severity scales, and the worksheet's own S1/S2 framing.
 *
 * ⚠️ TRANSCRIBED VERBATIM from docs/materiality-questionnaire-spec-v12.md §5.3.1 and §5.3.2.
 * That is the only source. If wording needs to change it changes in the spec first and is
 * re-transcribed here — §5.3's own rule, and the reason §5.2's option lists were deleted rather
 * than corrected on 18 Aug 2026: a corrected second copy is still a second copy, and the next
 * reader cannot tell which one is current.
 *
 * ⚠️ NOT IN severity.ts. That file is pure calculation and copy is not calculation. This one holds
 * no arithmetic and no thresholds; the two are imported together by the forms and by the report,
 * and neither imports the other.
 *
 * ⚠️ NO SEVERITY IS COMPUTED FROM THIS FILE AND NONE MAY BE SHOWN TO A CONTRIBUTOR. They are giving
 * three judgements, not a score.
 *
 *
 * =====================================================================
 * ⚠️ SCALE HAS TWO SETS, KEYED ON DIRECTION. THIS IS THE DEFECT THIS FILE WAS RESHAPED TO PREVENT.
 * =====================================================================
 * Until v12 there was one set of scale descriptions, written entirely for harm. The first
 * positive-impact form therefore rendered
 *
 *     "4 · Severe — Grave harm. Life-changing or life-threatening for the people affected"
 *
 * under the heading AS A BENEFIT. A contributor reading that would reasonably score everything low,
 * and nothing in the data would ever have shown why: the scores would be real, self-consistent and
 * wrong, and §6.2's arithmetic does not know which set of words produced a 4.
 *
 * ⚠️ SO THERE IS NO DIRECTION-FREE `SCALE` EXPORT, DELIBERATELY. A caller cannot reach the scale
 * without saying which direction it is for. That is the whole guard: the previous shape made the
 * wrong answer the easy one, and an exported `SCALE` would let it back in the first time someone
 * needed "just the labels". Use scaleFor(direction) or dimensionScale(dim, direction).
 *
 * ⚠️ AND POINT 4's LABEL DIFFERS, NOT ONLY ITS DESCRIPTION — "Severe" against "Transformative",
 * because a severe benefit is incoherent. Any render of a point label that does not come from the
 * direction-keyed set is a bug, and this is the point at which it shows.
 *
 * ⚠️ THE TWO SETS MUST STAY PARALLEL IN MAGNITUDE. A 3 means the same size of thing in both
 * directions, because §6.2's severity arithmetic treats the numbers identically and does not know
 * which set produced them. If one side drifts harder or softer than the other, the same score comes
 * to mean two different things and nothing in the calculation could detect it. Edit the pair, never
 * one side.
 *
 * ⚠️ POINT 1 IS IDENTICAL IN BOTH, AND THAT IS DELIBERATE. "Noticeable, but limited" is already
 * direction-neutral; rewording it for symmetry would make it worse. It is not an oversight and must
 * not be "fixed".
 *
 * SCOPE HAS ONE SET FOR BOTH DIRECTIONS. These are counts, not judgements about harm — "many
 * people, or several sites" reads correctly whichever way the impact runs. There is nothing to vary
 * and no positive variant may be created.
 *
 * IRREMEDIABILITY IS NEGATIVE-ONLY (ESRS 1 ¶41). There is nothing to remediate about a benefit.
 */

export type Direction = 'negative' | 'positive'

/** The four points, on every dimension. §5.3: mismatched ranges cannot be averaged. */
export const SEVERITY_POINTS = [1, 2, 3, 4] as const
export type SeverityPoint = (typeof SEVERITY_POINTS)[number]

export type DimensionKey = 'scale' | 'scope' | 'irremediability' | 'likelihood'

export type ScalePoint = {
  value: SeverityPoint
  /** The terse §5.3 table cell — the label. ⚠️ Differs by direction at point 4. */
  label: string
  /** The §5.3.1 plain-language expansion — what a contributor actually reads. */
  body: string
}

export type ScaleDefinition = {
  key: DimensionKey
  /** The question, as a contributor sees it. ⚠️ For scale, this differs by direction too. */
  heading: string
  points: ScalePoint[]
}

/** §5.3.1 — Scale, NEGATIVE impacts. */
const SCALE_NEGATIVE: ScaleDefinition = {
  key: 'scale',
  heading: 'How serious the harm is for the people or the environment affected',
  points: [
    { value: 1, label: 'Minor',
      body: 'Noticeable, but limited. People would mention it; it does not change their health, their income or their safety.' },
    { value: 2, label: 'Moderate',
      body: 'Meaningful, and manageable. A real effect on health, income or the local environment, of a kind that can be put right through ordinary work.' },
    { value: 3, label: 'Major',
      body: 'Serious harm. Lasting damage to health, livelihoods or the environment — the kind a regulator or a journalist would take an interest in.' },
    { value: 4, label: 'Severe',
      body: 'Grave harm. Life-changing or life-threatening for the people affected, or irreversible damage to the environment.' },
  ],
}

/** §5.3.1 — Scale, POSITIVE impacts. ⚠️ Point 1 is identical to the negative set on purpose. */
const SCALE_POSITIVE: ScaleDefinition = {
  key: 'scale',
  heading: 'How much good it does for the people or the environment affected',
  points: [
    { value: 1, label: 'Minor',
      body: 'Noticeable, but limited. People would mention it; it does not change their health, their income or their safety.' },
    { value: 2, label: 'Moderate',
      body: 'Meaningful. A real improvement to health, income or the local environment, of a kind ordinary work sustains.' },
    { value: 3, label: 'Major',
      body: 'Substantial good. A lasting improvement to health, livelihoods or the environment — the kind a regulator or a journalist would take an interest in.' },
    // ⚠️ THE LABEL, NOT ONLY THE DESCRIPTION. "Severe benefit" is incoherent.
    { value: 4, label: 'Transformative',
      body: 'Life-changing for the people affected, or a lasting restoration of the environment.' },
  ],
}

/**
 * §5.3.1 — Scope. ONE SET, BOTH DIRECTIONS. Counts, not judgements about harm.
 *
 * The four points carry no separate label in the spec: the sentence IS the point. Nothing is
 * invented to fill a label field that the source does not have.
 */
export const SCOPE: ScaleDefinition = {
  key: 'scope',
  heading: 'How many people, or how much of the environment, is affected',
  points: [
    { value: 1, label: '', body: 'A few people, or one site.' },
    { value: 2, label: '', body: 'Many people, or several sites.' },
    { value: 3, label: '', body: 'Widespread — a whole region, or an entire workforce.' },
    { value: 4, label: '', body: 'Systemic — the whole supply chain or ecosystem.' },
  ],
}

/** §5.3.1 — Irremediability. Negative impacts only (ESRS 1 ¶41). */
export const IRREMEDIABILITY: ScaleDefinition = {
  key: 'irremediability',
  heading: 'How hard it is to put right',
  points: [
    { value: 1, label: 'Readily reversible',
      body: 'It can be put right quickly, using the resources of ordinary operations.' },
    { value: 2, label: 'Reversible with effort',
      body: 'It can be put right, but it takes deliberate work, money or time.' },
    { value: 3, label: 'Reversible only at major cost, or over years',
      body: 'Putting it right is possible, but slow or expensive enough that it may not happen.' },
    // ⚠️ §5.3.1: point 4 deliberately avoids the word "compensation". Compensation is a response to
    // harm, not a reversal of it, and letting the two blur is how a 4 gets scored as a 3.
    { value: 4, label: 'Not realistically reversible',
      body: 'It cannot be undone. Whatever is done afterwards, the people or the environment affected do not go back to how they were.' },
  ],
}

/**
 * Likelihood — potential impacts only. One set: "how likely is it" is direction-neutral, and the
 * spec gives no variant.
 *
 * ⚠️ ESRS 1 ¶41: an ACTUAL impact takes no likelihood at all. 20260838's CHECK makes it unstorable
 * and 20260840 refuses it with a sentence — this scale is offered only where nature is 'potential'.
 */
export const LIKELIHOOD: ScaleDefinition = {
  key: 'likelihood',
  heading: 'How likely it is to happen within three years',
  points: [
    { value: 1, label: 'Unlikely', body: 'It would be surprising.' },
    { value: 2, label: 'Possible', body: 'It could happen; nothing makes it particularly likely.' },
    { value: 3, label: 'Likely', body: 'It is more likely to happen than not.' },
    { value: 4, label: 'Very likely', body: 'It would be surprising if it did not.' },
  ],
}

/** The scale for one direction — including its heading. There is no direction-free alternative. */
export function scaleFor(direction: Direction): ScaleDefinition {
  return direction === 'negative' ? SCALE_NEGATIVE : SCALE_POSITIVE
}

/**
 * ⚠️ THE SINGLE RESOLVER. Every render of a scale — a form control, a stored value's label, an
 * override button — resolves through here, so a point label can never be drawn from the wrong
 * direction's set. This is the function that makes v12's warning structural rather than advisory:
 * "anywhere the label renders from a shared constant rather than the direction-keyed set, this is
 * where it breaks."
 *
 * Throws for irremediability on a positive impact. That combination is forbidden by ESRS 1 ¶41, is
 * unstorable by constraint, and is filtered out by every caller — so reaching it means the ¶41
 * branching has been bypassed, which is the bug, and returning plausible copy would hide it.
 */
export function dimensionScale(dim: DimensionKey, direction: Direction): ScaleDefinition {
  switch (dim) {
    case 'scale': return scaleFor(direction)
    case 'scope': return SCOPE
    case 'likelihood': return LIKELIHOOD
    case 'irremediability':
      if (direction === 'positive') {
        throw new Error(
          'Irremediability does not apply to a positive impact (ESRS 1 ¶41) — there is nothing to ' +
          'remediate. Reaching this means the ¶41 branching was bypassed upstream.')
      }
      return IRREMEDIABILITY
  }
}

/**
 * §5.3.1, the fourth answer — outside the scale on all three dimensions.
 *
 * ⚠️ §6.1: a RECORDED answer, never a zero and never a low, and styled identically to the four
 * points rather than as a way out of them. Stored in abstained_dimensions (20260841) rather than as
 * a bare null, so it survives a reload and is distinguishable from a question nobody reached.
 */
export const NO_VISIBILITY_LABEL = 'Not enough visibility to assess'

/**
 * §5.3.2 — THE WORKSHEET'S OWN S1/S2 FRAMING. Keyed by TOPIC CODE.
 *
 * ⚠️ THIS IS NOT question_framing AND MUST NEVER BE MERGED WITH IT. Two strings for two
 * instruments. mr_esrs_subtopic_display.question_framing carries the SURVEY's second-person wording
 * about a respondent's own workplace — "in your own workforce" / "in your organisation's
 * workforce" (20260828) — and it is correct there and must not change.
 *
 * The survey asks WHAT ARE CONDITIONS LIKE WHERE YOU WORK. The worksheet asks WHAT HARM DOES THIS
 * UNDERTAKING CAUSE TO THESE PEOPLE. The shift from IN to ON is the whole distinction: conditions
 * inside a workplace, versus harm done to a group of people. Inheriting the survey strings would
 * have put a quietly wrong question in front of an HR director with nothing erroring, which is why
 * 20260840's impact_get withholds question_framing rather than returning it.
 *
 * ⚠️ WHY A CONSTANT RATHER THAN A COLUMN ON mr_esrs_subtopic_display — a real trade, recorded.
 *
 *   FOR THE CONSTANT, and decisive: the fact is PER TOPIC and there are exactly two strings. A
 *   per-sub-topic column stores six copies of each, and six copies of one string is six chances to
 *   drift. That is not hypothetical — 20260834 exists because the S1.6/S2.6 context pair drifted,
 *   and had to be given a replace()-identity guard to stay honest. A key on topic_code cannot drift
 *   from itself.
 *
 *   AND: it is not customer-editable in the way `context` and `question_framing` are. Those are
 *   house copy a customer may reword for their sector. This pair is the methodological distinction
 *   BETWEEN two instruments — a customer who rewrote "on workers in your value chain" back to "in
 *   your value chain" would silently reinstate the survey's question on the worksheet's form.
 *
 *   AGAINST, honestly: §5.3 prefers the sub-topic row over application code, and a DB column would
 *   let the worksheet framing be snapshotted per assessment the way the survey snapshots its own.
 *   ⚠️ THE TRIGGER TO MOVE IT: the first time this needs to vary per customer or per assessment, it
 *   belongs on a snapshot column beside short_name on materiality_impact_assignment_subtopics — not
 *   on mr_esrs_subtopic_display, which is a global default and would change historical worksheets.
 *
 * ⚠️ KEYED ON topic_code, WHICH impact_get ALREADY RETURNS. Not derived from the sub-topic code by
 * string surgery — that is the move 20260820's header rejects by name for exactly this family of
 * lookups.
 */
export const WORKSHEET_TOPIC_FRAMING: Record<string, string> = {
  S1: 'on your own workforce',
  S2: 'on workers in your value chain',
}

/** The heading for one sub-topic, with the worksheet framing appended where the topic has one. */
export function worksheetSubtopicHeading(shortName: string, topicCode: string): string {
  const framing = WORKSHEET_TOPIC_FRAMING[topicCode]
  return framing ? `${shortName} — ${framing}` : shortName
}
