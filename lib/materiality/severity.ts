/**
 * ESRS 1 ¶40-41 severity — the preparer's impact determination, combined into a number and a rule.
 *
 * PURE. No React, no Supabase, no I/O, no dates. The lib/ghg/engine.ts pattern: all of the
 * methodology lives here, callers render its output and never re-derive it. A second derivation in
 * a component is the regression this shape exists to prevent.
 *
 * Source: docs/materiality-questionnaire-spec-v10.md §5.3 (the scales) and §6.2 (the combination).
 * ⚠️ §5.2's three-point option lists were REMOVED on 18 Aug 2026 rather than corrected, so §5.3 is
 * now the only source for the three scales and there is no second copy to read by mistake.
 *
 *
 * =====================================================================
 * THE RULE
 * =====================================================================
 *     severity = mean(scale, scope, irremediability)      each 1-4, per §5.3
 *     material if severity >= 2.5
 *       OR if ANY single dimension = 4                     the top-band override
 *
 * The override is not ThemisIQ's invention: ESRS 1 AR 22 of the adopted ESRS (2026) states that any
 * of the three characteristics can make a negative impact severe. It exists because the mean alone
 * scores a grave permanent harm on few people down to nothing — scale 1, scope 1, irremediability 4
 * means 2.0, and a contaminated aquifer is the canonical case.
 *
 *
 * =====================================================================
 * ⚠️ SOCIAL TOPICS TAKE MAX, AND THE OVERRIDE IS THEREFORE SUBSUMED
 * =====================================================================
 * ESRS 1 ¶40 (2026) / ¶46 (2023): for social topics severity takes precedence over likelihood. A
 * severe potential human rights impact is material even at low likelihood and must never be scored
 * down for being unlikely. §6.2 implements that as max of the three, with the likelihood multiplier
 * suppressed.
 *
 * ⚠️ AND THAT MAKES THE OVERRIDE UNREACHABLE HERE. Under max, any dimension at 4 makes the result 4,
 * which already clears 2.5. The override can never be the thing that decided a social row — so a
 * report saying "the override escalated this" about a social topic is claiming something that did
 * not happen. That is why this function returns WHICH RULE DECIDED and not just a number:
 *
 *     'mean'               non-social; the mean decided, either way
 *     'override'           non-social; the mean was below 2.5 and a single dimension at 4 escalated it
 *     'max'                social; max decided, and no dimension was at the top band
 *     'subsumed_override'  social; max decided, AND a dimension was at 4 — the override WOULD have
 *                          fired on the non-social rule but had nothing left to do
 *
 * The last value exists solely so the distinction survives into the report. Collapsing it into
 * 'override' would restore exactly the false claim, and collapsing it into 'max' would hide that
 * this row is one an auditor comparing methods will ask about.
 *
 * ⚠️ KEYED ON mr_esrs_topics.category = 'soc', NEVER ON topic_code LIKE 'S%'. 20260838 added
 * mr_esrs_topics_category_check constraining that column to env / soc / gov, so the domain is
 * guaranteed rather than assumed. Deriving it from the code string is the move 20260820's header
 * rejects by name: "correct for a one-off check against a seed you can read, and a latent defect the
 * moment it becomes the routing rule for a live response."
 *
 *
 * =====================================================================
 * ⚠️ POSITIVE IMPACTS — ESRS 1 ¶41, AND NEVER NETTED — ¶44
 * =====================================================================
 * A positive impact has no irremediability: there is nothing to remediate. It is assessed on scale
 * and scope alone, and any irremediability passed in is IGNORED — not rejected, because 20260838's
 * CHECK already makes it unstorable, and not folded in, because it is not part of the basis.
 * `basis` on the result names the dimensions actually used, so this is inspectable rather than
 * implied.
 *
 * ⚠️ THIS FUNCTION RETURNS ONE DETERMINATION. It never sums, nets or reconciles a negative against
 * a positive — ¶44 forbids it, and a caller wanting both asks twice and gets two answers. There is
 * deliberately no shape in this module that can hold both at once.
 *
 * ⚠️ THE POSITIVE THRESHOLD IS THE SAME RULE APPLIED TO TWO DIMENSIONS, AND THAT IS AN ASSUMPTION.
 * §6.2's 64-combination argument is made for the three-dimension negative case; the spec states the
 * dimensions for positives but does not restate the threshold. Applying mean >= 2.5 with the same
 * top-band override to (scale, scope) is the only reading consistent with the disclosed rule, and it
 * is applied uniformly. It is called out here and in METHOD_DISCLOSURE rather than left silent.
 *
 *
 * =====================================================================
 * ⚠️ LIKELIHOOD IS NOT MULTIPLIED IN, BECAUSE THE SPEC DOES NOT DEFINE THE WEIGHTING
 * =====================================================================
 * §6.2 says "Potential impact: impact score = severity x likelihood weighting" and then lists the
 * likelihood weighting among the things that "go in the assumptions register with their reasoning".
 * It never states what the weighting IS. There is no defensible number to pick, and inventing one
 * would put an undisclosed constant inside a figure an auditor reads.
 *
 * So this module computes SEVERITY, which the spec defines completely, and reports whether
 * likelihood is APPLICABLE and what suppressed it when it is not. It does not fold likelihood into
 * the number. `likelihood.applicable === true` is the signal that a weighting is owed and not yet
 * disclosed; the caller must not treat the returned severity as a likelihood-weighted impact score.
 *
 * The two suppressions ARE implementable without the weighting, and both are done:
 *   'actual_impact'             an actual impact is already occurring. Applying likelihood to it
 *                               understates severity, and §6.2 names this THE MOST COMMON TECHNICAL
 *                               ERROR IN A DMA. 20260838 makes it unstorable; this makes it
 *                               uncomputable.
 *   'human_rights_precedence'   ESRS 1 ¶40 suppresses the multiplier for social topics outright.
 *
 *
 * =====================================================================
 * ⚠️ A MISSING DIMENSION IS NOT A LOW SCORE — §6.1
 * =====================================================================
 * "Not enough visibility" is null, never zero and never a low. So a determination missing any
 * dimension in its basis yields:
 *
 *     { complete: false, severity: null, material: null, rule: null,
 *       abstained: [...], unscored: [...] }
 *
 * ⚠️ TWO LISTS, AND THE SHAPE IS THE FIX. Until 27 Aug 2026 this was ONE list, `missing`, holding
 * every null whatever its cause — and boardReport.ts renamed it `abstained` on the way out, so the
 * board report told a reader an assessor "recorded that they did not have enough visibility" about
 * dimensions nobody had reached. A DECLINED dimension is a recorded answer under §6.1; an UNSCORED
 * one is an unfinished worksheet. They are different findings about the organisation, and section
 * 12 of the report draws a conclusion from one of them.
 * Two lists rather than one tagged list because the wrong sentence then cannot be written: there is
 * no field a renderer can reach for that means "either of these".
 *
 * There is NO default, no zero-fill, no partial mean over the dimensions that are present, and no
 * "treat absent as 1". A partial mean would be the worst of the available wrong answers: it looks
 * like a score, it is systematically low, and nothing downstream could tell it from a real one.
 *
 * The return type is a DISCRIMINATED UNION on `complete` for the same reason — `severity` is typed
 * `null` on the incomplete arm, so a caller cannot read a number out of it without narrowing first.
 * Making it unrepresentable beats documenting it.
 */

// ── the disclosed constants. §6.2: all of it is disclosed and printed where an auditor reads it. ──

/** Mean at or above this is material. §6.2. A choice, and raisable without touching the override. */
export const MEAN_THRESHOLD = 2.5

/** A single dimension at this value escalates regardless of the mean. ESRS 1 AR 22. */
export const OVERRIDE_BAND = 4

/** §5.3: all three dimensions carry four points. Mismatched ranges cannot be averaged. */
export const SCALE_MIN = 1
export const SCALE_MAX = 4

/**
 * MEAN_THRESHOLD as an exact fraction, because the comparison is done in integers.
 * `sum / n >= 5 / 2`  is evaluated as  `sum * 2 >= 5 * n`.
 *
 * ⚠️ NOT `sum / n >= 2.5` IN FLOATING POINT. For three dimensions the mean can never land exactly on
 * 2.5 (it would need a sum of 7.5), so today either form gives the same answer — but for the
 * two-dimension positive case a sum of 5 lands exactly on the threshold, and materiality then rests
 * on the representation of a division. Integers remove the question rather than answering it.
 */
const THRESHOLD_NUMERATOR = 5
const THRESHOLD_DENOMINATOR = 2

export type Direction = 'negative' | 'positive'
export type Nature = 'actual' | 'potential'

/** mr_esrs_topics.category. Constrained to this domain by mr_esrs_topics_category_check (20260838). */
export type TopicCategory = 'env' | 'soc' | 'gov'

export type Dimension = 'scale' | 'scope' | 'irremediability'

export type SeverityRule = 'mean' | 'override' | 'max' | 'subsumed_override'

export type LikelihoodSuppression = 'actual_impact' | 'human_rights_precedence'

export type SeverityInput = {
  direction: Direction
  nature: Nature
  /** The TOPIC's category, not the sub-topic's code. See the header. */
  category: TopicCategory
  scale: number | null
  scope: number | null
  /** Ignored entirely when direction is 'positive' (¶41). */
  irremediability?: number | null
  /** Never folded into the number — see the header. Carried so the caller can see what was recorded. */
  likelihood?: number | null
  /**
   * Dimensions the determiner RECORDED as "not enough visibility" —
   * materiality_impact_determinations.abstained_dimensions, passed through as stored.
   *
   * ⚠️ TYPED readonly string[], NOT Dimension[], DELIBERATELY. The stored array's domain is
   * scale / scope / irremediability / LIKELIHOOD (20260841), and likelihood is not a Dimension here
   * because it is never folded into severity. A caller passing the column straight through is the
   * behaviour we want; making them cast or pre-filter is how a filter gets forgotten in one of four
   * call sites. The narrowing happens ONCE, below, against `basis`.
   */
  abstained?: readonly string[] | null
}

type LikelihoodReport = {
  /** True when a likelihood weighting is owed. ⚠️ It is NOT applied — the spec does not define it. */
  applicable: boolean
  suppressedBy: LikelihoodSuppression | null
  value: number | null
}

type SeverityCommon = {
  /** The dimensions this determination is actually scored on. ¶41 drops irremediability for positives. */
  basis: Dimension[]
  likelihood: LikelihoodReport
}

export type SeverityResult = SeverityCommon &
  (
    | {
        complete: true
        severity: number
        material: boolean
        rule: SeverityRule
        /** The dimension values used, in `basis` order. Lets a caller show the working. */
        values: number[]
        abstained: []
        unscored: []
      }
    | {
        complete: false
        severity: null
        material: null
        rule: null
        values: null
        /**
         * Dimensions in `basis` the determiner DECLINED to judge — §6.1's fourth answer, a recorded
         * answer. Never treated as a value of any kind.
         */
        abstained: Dimension[]
        /** Dimensions in `basis` with no value and no abstention — nobody reached them. */
        unscored: Dimension[]
      }
  )

/**
 * Thrown for a value outside 1-4 or a non-integer, and for a dimension carrying BOTH a value and
 * an abstention. NOT used for plain absence: an absent dimension returns `complete: false`, named
 * in `abstained` or `unscored` according to which it is.
 *
 * ⚠️ THIS COMMENT USED TO CALL ALL ABSENCE "abstention" — the same conflation the two-list split
 * exists to end, sitting in the type that now carries the field. Corrected 27 Aug 2026.
 *
 * Both cases are programming errors: 20260838's CHECK constraints make an out-of-range value
 * unstorable, and 20260841's _abstention_excludes_value makes value-plus-abstention unstorable, so
 * either can only arrive from a bug. Clamping one or reconciling the other would put a fabricated
 * number — or a fabricated intention — into a compliance figure.
 */
export class SeverityInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeverityInputError'
  }
}

const assertPoint = (v: number, name: Dimension | 'likelihood'): void => {
  if (!Number.isInteger(v) || v < SCALE_MIN || v > SCALE_MAX) {
    throw new SeverityInputError(
      `${name} must be an integer ${SCALE_MIN}-${SCALE_MAX} per spec v10 §5.3, or null for ` +
      `"not enough visibility" (§6.1). Received ${JSON.stringify(v)}.`,
    )
  }
}

/** ¶41: a positive impact has no irremediability. This is the single place that fact is expressed. */
export function basisFor(direction: Direction): Dimension[] {
  return direction === 'negative'
    ? ['scale', 'scope', 'irremediability']
    : ['scale', 'scope']
}

/** `mean(values) >= MEAN_THRESHOLD`, evaluated exactly. See THRESHOLD_NUMERATOR. */
function meetsMeanThreshold(values: number[]): boolean {
  const sum = values.reduce((a, b) => a + b, 0)
  return sum * THRESHOLD_DENOMINATOR >= THRESHOLD_NUMERATOR * values.length
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

/**
 * Compute severity and materiality for ONE determination — one sub-topic, one direction.
 *
 * Never call this expecting a netted figure: ¶44 forbids netting positive against negative, and a
 * caller wanting both asks twice.
 */
export function computeSeverity(input: SeverityInput): SeverityResult {
  const basis = basisFor(input.direction)
  const isSocial = input.category === 'soc'

  // ── likelihood: reported, never multiplied in ────────────────────────────────────────────────
  // Order matters only for which reason is named. An actual social impact is suppressed twice over;
  // 'actual_impact' is named first because it is the one the standard calls an error to ignore.
  const suppressedBy: LikelihoodSuppression | null =
    input.nature === 'actual' ? 'actual_impact'
      : isSocial ? 'human_rights_precedence'
      : null

  const rawLikelihood = input.likelihood ?? null
  if (rawLikelihood !== null) assertPoint(rawLikelihood, 'likelihood')

  const likelihood: LikelihoodReport = {
    applicable: suppressedBy === null,
    suppressedBy,
    // ⚠️ Null when suppressed, so a suppressed likelihood cannot be picked up downstream and used.
    // The value is not lost — it is on the determination row; it is simply not offered here.
    value: suppressedBy === null ? rawLikelihood : null,
  }

  // ── gather the basis dimensions. Absence is recorded, never defaulted (§6.1). ─────────────────
  const present: number[] = []
  const abstained: Dimension[] = []
  const unscored: Dimension[] = []

  /**
   * ⚠️ FILTERED BY basis, EXACTLY AS THE VALUES ARE, AND THIS IS NOT DEFENSIVE TIDYING.
   * For a positive determination irremediability is not in `basis` (¶41), so it was never put to
   * the determiner. Reporting an abstention against it would tell a board the assessor declined a
   * question nobody asked — a claim about a person, invented by a filter that was left out.
   * The stored array can also carry 'likelihood', which is not a Dimension and is never folded into
   * severity; the same filter drops it. 20260841's _abstention_respects_p41 already refuses both at
   * the database, so this is a second gate on a row that should not exist — the posture assertPoint
   * already takes toward an out-of-range value.
   */
  const declined = new Set<string>(
    (input.abstained ?? []).filter(d => (basis as string[]).includes(d)))

  for (const d of basis) {
    // irremediability is only read when it is in the basis, which is what makes it IGNORED rather
    // than merely unused for positives — a value passed there never reaches this loop.
    const raw = d === 'scale' ? input.scale
      : d === 'scope' ? input.scope
      : input.irremediability ?? null

    if (declined.has(d)) {
      // ⚠️ REFUSE, NEVER RECONCILE. A dimension with a value AND an abstention is a contradiction
      // about what the determiner meant, and picking either one is the software deciding that for
      // them. impact_save_determination refuses the same combination at the write
      // (20260841 _abstention_excludes_value) for the same reason, so a row reaching here in that
      // state is a bug upstream, not an input to be salvaged.
      if (raw !== null && raw !== undefined) {
        throw new SeverityInputError(
          `${d} carries both a value (${JSON.stringify(raw)}) and an abstention. A dimension is ` +
          `either scored or recorded as "not enough visibility" (§6.1), never both — the database ` +
          `refuses this combination at the write. Nothing is assumed about which was meant.`,
        )
      }
      abstained.push(d)
      continue
    }

    if (raw === null || raw === undefined) { unscored.push(d); continue }
    assertPoint(raw, d)
    present.push(raw)
  }

  // ⚠️ THE VERDICT IS UNCHANGED BY THE SPLIT, AND MUST STAY THAT WAY. Both lists lead here: a
  // declined dimension and an unreached one both yield no severity and no materiality conclusion.
  // The split changes what is REPORTED, never what is COMPUTED — §6.1's rule at the top of this
  // file is untouched.
  if (abstained.length > 0 || unscored.length > 0) {
    return { complete: false, severity: null, material: null, rule: null, values: null,
             abstained, unscored, basis, likelihood }
  }

  const anyAtTopBand = present.some(v => v === OVERRIDE_BAND)

  if (isSocial) {
    // ESRS 1 ¶40 — severity takes precedence over likelihood. max, not mean.
    const severity = Math.max(...present)
    return {
      complete: true,
      severity,
      material: severity >= MEAN_THRESHOLD,
      // ⚠️ THE SUBSUMPTION, NAMED. max is already 4 whenever a dimension is 4, so the override had
      // nothing to add. Reporting this as 'override' would claim a rule fired that did not.
      rule: anyAtTopBand ? 'subsumed_override' : 'max',
      values: present,
      abstained: [],
      unscored: [],
      basis,
      likelihood,
    }
  }

  const byMean = meetsMeanThreshold(present)
  return {
    complete: true,
    severity: mean(present),
    material: byMean || anyAtTopBand,
    // 'override' names only the cases the override actually DECIDED — where the mean did not.
    rule: !byMean && anyAtTopBand ? 'override' : 'mean',
    values: present,
    abstained: [],
    unscored: [],
    basis,
    likelihood,
  }
}

/**
 * The method, in prose, for the assumptions register and the report. §6.2: the product's job is not
 * to pick the one true formula — none exists — but to make the choice explicit, apply it uniformly,
 * and print it where an auditor reads it.
 *
 * Exported as data so there is ONE copy. A second hand-written paragraph in a report component is
 * how the printed method and the applied method come to disagree.
 */
export const METHOD_DISCLOSURE = {
  combination:
    'Severity is the mean of scale, scope and irremediability, each scored 1-4 on the four-point ' +
    'scales in spec §5.3. An impact is material where severity reaches 2.5, or where any single ' +
    'dimension is scored 4. Multiplication was rejected: on a 1-4 scale it compounds low scores ' +
    'rather than balancing them, and would score a grave permanent harm affecting few people as ' +
    'immaterial.',
  override:
    'The top-band override is ESRS 1 AR 22 of the adopted ESRS (2026): any one of scale, scope or ' +
    'irremediable character can make a negative impact severe. It triggers at 4 alone and not at ' +
    '3-and-above, because an override at 3+ makes 56 of the 64 possible score combinations ' +
    'material and a customer told to disclose against nearly every topic has not been assessed. ' +
    'At 4 it adds exactly nine combinations to the mean.',
  humanRights:
    'For social topics (mr_esrs_topics.category = soc) severity is the MAXIMUM of the three ' +
    'dimensions rather than the mean, and the likelihood weighting is suppressed. ESRS 1 para 40 ' +
    'gives severity precedence over likelihood: a severe potential human rights impact is material ' +
    'even at low likelihood and must never be scored down for being unlikely. Under the maximum ' +
    'the top-band override cannot change any outcome, so it is reported as subsumed and is never ' +
    'presented as having decided a social row.',
  positiveImpacts:
    'Positive impacts carry no irremediability (ESRS 1 para 41) and are scored on scale and scope ' +
    'alone; actual positive impacts take no likelihood, potential ones do. They are assessed on ' +
    'their own and never netted against negative impacts (para 44). The materiality threshold and ' +
    'the top-band override are applied to the two dimensions exactly as to the three; the ' +
    'standard sets the dimensions for positive impacts but not a separate threshold, so the ' +
    'disclosed rule is applied uniformly.',
  likelihoodWeighting:
    'NOT APPLIED. The method specifies that a potential impact score is severity weighted by ' +
    'likelihood, but the weighting itself has not been set. No weighting is invented here: the ' +
    'severity figure is reported unweighted, and every determination records whether a likelihood ' +
    'weighting would be owed. An undisclosed constant inside a figure an auditor reads is worse ' +
    'than a figure that states what it does not yet include.',
  abstention:
    'A dimension recorded as "not enough visibility" is null and is never scored as a zero or a ' +
    'low (spec §6.1). A determination missing any dimension yields no severity and no materiality ' +
    'conclusion at all; it is reported as incomplete, naming the dimensions absent. No default is ' +
    'substituted and no partial average is taken over the dimensions present.',
} as const
