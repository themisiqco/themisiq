// lib/cbam/cn.ts
// CN-code normalisation and prefix matching — the §10.8 requirement, implemented.
//
// WHY THIS EXISTS. Spec §10.8 records three incompatible CN key formats across the CBAM
// datasets:
//   cbam_cn_map.cn_prefix        digits only, no spaces   58 rows: 54× 4-digit, 3× 5-digit, 1× 8-digit
//   cbam_default_values.cn_code  spaced, mixed width      8,052 rows / 224 codes: 27× 4, 63× 6, 134× 8
//   cbam_benchmarks.cn_code      spaced, always 8-digit   2,389 rows / 536 codes
// (Counts verified 29 Jul 2026; the default-values line previously carried the steel-only
// 19/62/119 figures. See spec §10.8 — and §10.9(c): parsing the migrations yields 8,251
// tuples there, 199 of which are discarded on conflict.)
// Literal string equality between any two is wrong in the general case: '26011200' never
// equals '2601 12 00'. The trap is that equality ACCIDENTALLY works on the bare-4-digit
// subset ('7203' === '7203'), so a naive implementation passes on many steel rows and fails
// silently on the 6- and 8-digit ones. Normalise at every cross-dataset boundary.
//
// Pure module. No React, no Supabase, no I/O — the caller supplies the rows, exactly like
// benchmarks.ts. Nothing here is wired into the app yet.
//
// PREFIX MATCHING IS FOR CATEGORY RESOLUTION ONLY. Spec §10.7, first binding rule: prefix
// matching resolves a good to its goods_category and nothing else. Category is uniform
// across a heading's children by construction, which is what makes it legitimate here. It
// is NOT a way to reach a VALUE — cbam_default_values and cbam_benchmarks are keyed on the
// specific good and require exact match at the seed's own granularity. Do not reuse
// matchCnPrefix to find a default or a benchmark.

/**
 * Strip whitespace from a CN code and assert the remainder is digits.
 *
 * Throws rather than coercing. A code that does not parse cleanly is an absence, not a
 * value: silently stripping a stray letter or punctuation mark would produce a plausible
 * wrong code, and a plausible wrong code selects a real-but-wrong category. The message
 * names the offending input so a caller can surface it verbatim.
 */
export function normalizeCn(raw: string): string {
  const stripped = raw.replace(/\s+/g, '');
  if (!/^\d+$/.test(stripped)) {
    throw new Error(
      `normalizeCn: "${raw}" is not a CN code — after removing whitespace it must contain digits only, ` +
        `but it resolved to "${stripped}". Do not strip or substitute characters to make it parse.`,
    );
  }
  return stripped;
}

/** One cbam_cn_map row, as the caller fetched it. Mirrors benchmarks.ts's BenchmarkRow seam. */
export interface CnMapRow {
  cn_prefix: string;
  category_code: string;
}

export interface CnPrefixMatch {
  category_code: string;
  /** The normalised prefix that matched — carried so a caller can show WHY it matched. */
  matched_prefix: string;
}

/**
 * Resolve a CN code to its aggregated goods category by LONGEST matching prefix.
 *
 * Returns null when no prefix matches. Null means "the map has no opinion about this code" —
 * a distinct outcome from a mismatch, and callers must be able to tell them apart. A code
 * outside CBAM scope entirely, and a code whose category disagrees with what a user selected,
 * are different facts and warrant different messages. Do not collapse them.
 *
 * Longest-prefix, not first-match: the seed today has no overlapping prefixes (verified
 * 29 Jul 2026 — all 58 rows are mutually disjoint; there is no '7202' alongside the 5-digit
 * '72021'/'72024'/'72026'), so first-match would coincidentally agree. It would stop agreeing
 * the moment a heading is added above an existing sub-heading, which is exactly how the
 * ferroalloy rows are shaped and how a future sector is likely to arrive.
 *
 * Row prefixes are normalised rather than trusted. They are digits-only as seeded, but a
 * malformed reference row is a real defect and throwing names it — the same fail-loud posture
 * as resolver.ts's missing-default path.
 */
export function matchCnPrefix(
  cnCode: string,
  rows: ReadonlyArray<CnMapRow>,
): CnPrefixMatch | null {
  const code = normalizeCn(cnCode);

  let best: CnPrefixMatch | null = null;
  for (const row of rows) {
    const prefix = normalizeCn(row.cn_prefix);
    if (!code.startsWith(prefix)) continue;
    if (best === null || prefix.length > best.matched_prefix.length) {
      best = { category_code: row.category_code, matched_prefix: prefix };
    }
  }
  return best;
}

/**
 * The result of comparing a user-selected goods category against what the CN map implies.
 *
 * THREE STATES, and the third is not a weaker form of the first two. 'no_opinion' means the
 * map cannot judge — the code is outside CBAM scope, or not yet typed, or the category is not
 * yet chosen. Collapsing it into 'consistent' would silently bless an unjudged pair;
 * collapsing it into 'inconsistent' would accuse a user who has done nothing wrong. Same
 * discipline as ReportField<T>'s value / missing / not_applicable split in report/types.ts.
 *
 * FOUR REASONS, and the last one is a different KIND of fact from the other three.
 * 'no_prefix_match', 'unparseable_cn' and 'no_category_selected' all describe the user's
 * input — incomplete, out of scope, or not yet typed. 'malformed_reference_row' describes a
 * defect in OUR seed data: a cbam_cn_map row whose cn_prefix is not digits-only.
 *
 * They warrant opposite treatment at the UI surface. A half-typed code deserves SILENCE —
 * the user is mid-keystroke and has done nothing wrong. Broken reference data deserves
 * VISIBILITY — nobody is mid-anything, the category hint is silently degraded for every user
 * hitting that row, and no amount of correct typing will fix it. Merging the two would bury
 * a system defect inside the most-ignored state in the union.
 */
export type CnCategoryAssessment =
  | { kind: 'consistent'; matched_prefix: string; category_code: string }
  | { kind: 'inconsistent'; matched_prefix: string; expected_category: string; selected_category: string }
  | {
      kind: 'no_opinion';
      reason: 'no_prefix_match' | 'unparseable_cn' | 'no_category_selected' | 'malformed_reference_row';
    };

/**
 * Assess whether a selected goods category agrees with the CN map's opinion of a CN code.
 *
 * NEVER THROWS, for any input. This is intended to run at render time on every keystroke, so
 * a throw would take the form down mid-edit. That is the opposite posture from normalizeCn
 * and matchCnPrefix, which fail loud by design — the difference is the call site, not the
 * principle: a save path must refuse bad data, a live hint must not crash while the user is
 * still typing. An unparseable code is reported as an absence of opinion, never as a pass.
 *
 * PRECEDENCE: an unchosen category short-circuits before the code is examined at all. A user
 * who has typed a CN code but not yet picked a category has made no claim to contradict, and
 * telling them their unselected category is wrong would be nonsense.
 *
 * THE TWO THROW SOURCES ARE SEPARATED STRUCTURALLY, not by inspecting the error. The user's
 * code is normalised first, in its own try/catch; only if that succeeds is matchCnPrefix
 * called. So a throw from matchCnPrefix cannot have come from the code — it can only have
 * come from a row's cn_prefix. Matching on the message text would work today and break the
 * first time normalizeCn's wording is edited; the ordering cannot rot that way.
 *
 * Absorbing a malformed row here is deliberate but is NOT a fix. The loud version lives in
 * matchCnPrefix, which the save path should call. Do not treat this function as validation
 * of the seed.
 */
export function assessCnCategory(
  cnCode: string,
  categoryCode: string,
  rows: ReadonlyArray<CnMapRow>,
): CnCategoryAssessment {
  // `?? ''` rather than trusting the signature: this is called from a form, and an untyped
  // caller passing null must not be the thing that crashes it.
  const selected = (categoryCode ?? '').trim();
  if (selected === '') return { kind: 'no_opinion', reason: 'no_category_selected' };

  const raw = (cnCode ?? '').trim();
  if (raw === '') return { kind: 'no_opinion', reason: 'unparseable_cn' };

  // Normalise the USER'S code first, alone. This is what makes the two throw sources
  // distinguishable below: past this point the code is known-good, so nothing downstream can
  // fail because of it. The user's own error is therefore checked first and wins.
  let code: string;
  try {
    code = normalizeCn(raw);
  } catch {
    return { kind: 'no_opinion', reason: 'unparseable_cn' };
  }

  let match: CnPrefixMatch | null;
  try {
    // `code` is already normalised; matchCnPrefix re-normalises it, which is idempotent on
    // digits. Passing it through keeps prefix matching in one place rather than inlining it.
    match = matchCnPrefix(code, rows);
  } catch {
    // Can only be a row's cn_prefix — see the ordering note in the doc comment.
    return { kind: 'no_opinion', reason: 'malformed_reference_row' };
  }

  if (match === null) return { kind: 'no_opinion', reason: 'no_prefix_match' };

  if (match.category_code === selected) {
    return { kind: 'consistent', matched_prefix: match.matched_prefix, category_code: match.category_code };
  }
  return {
    kind: 'inconsistent',
    matched_prefix: match.matched_prefix,
    expected_category: match.category_code,
    selected_category: selected,
  };
}

/**
 * CN 7205 — THE ONE DUAL-LISTED CODE, and the listing is ASYMMETRIC, not an either/or.
 *
 * Annex I Table 1 of IR 2025/2547 lists 7205 under two aggregated goods categories, and the two
 * entries are not phrased as equals:
 *   - under Pig Iron: 'Some products under 7205 (Granules and powders, of pig iron,
 *     spiegeleisen, iron, or steel) may be covered here'
 *   - under Iron or steel products: '7205 - Granules and powders, of pig iron, spiegeleisen,
 *     iron or steel (if not covered under category pig iron)'
 *
 * The parenthetical 'if not covered under category pig iron' is what makes iron or steel
 * products the DEFAULT and pig iron the EXCEPTION: the products entry claims the code except
 * where the pig-iron entry has already taken it, and 'may be covered here' leaves that
 * determination to the operator, who knows what the granules actually are. So primary is the
 * fallback the code lands in absent an operator judgement, and alternative is the judgement
 * they may make. Do not present them as two equal options — that would misstate the Table.
 *
 * CITATION CAVEAT. Table 1 is Annex I POINT 2. The committed extract
 * docs/reference/ir-2025-2547-annex-i-s3-boundaries.md holds Annex I point 3 (system
 * boundaries) and Annex IV §2 — not point 2. This citation is therefore NOT currently checkable
 * against a primary source in this repo, unlike everything in boundaries.ts. Transcribe Table 1
 * into the reference file before treating the quoted phrasings above as verified.
 *
 * cbam_cn_map seeds 7205 -> iron_steel_products (20260716_cbam_reference.sql:69, whose own
 * comment reads '7205 dual-listed; pig-iron-granule exception is operator-resolved'), which is
 * the same primary/exception shape the Table gives.
 */
const DUAL_LISTED = {
  /** Normalised, and normalised THROUGH normalizeCn so a future edit that adds a space or a
   *  stray character fails loudly at import rather than silently never matching. */
  prefix: normalizeCn('7205'),
  primary: 'iron_steel_products',
  alternative: 'pig_iron',
} as const;

/**
 * What the CN map suggests a code's category is, before the user has chosen one.
 *
 * FOUR STATES. 'none' and 'unavailable' are both "no suggestion" but they are not the same
 * fact: 'none' says the map has nothing to offer for this code (out of scope, or the user is
 * still typing), 'unavailable' says the map itself could not be read. The first is ordinary,
 * the second is our defect, and a surface that renders them identically hides a broken seed.
 * Same split as assessCnCategory's 'no_prefix_match' vs 'malformed_reference_row'.
 *
 * 'choice' exists for CN 7205 alone — see DUAL_LISTED. It is NOT a generic "ambiguous" state:
 * no other seeded prefix maps to two categories, and if one ever does, the Table entry that
 * makes it so must be read before extending this.
 */
export type CnCategorySuggestion =
  | { kind: 'none' }
  | { kind: 'single'; category_code: string; matched_prefix: string }
  | { kind: 'choice'; primary: string; alternative: string; matched_prefix: string }
  | { kind: 'unavailable' };

/**
 * Suggest a goods category from a CN code alone.
 *
 * NEVER THROWS, for any input — this runs at render time on every keystroke, so a throw would
 * take the form down mid-edit. Same contract and same reason as assessCnCategory.
 *
 * THE TWO THROW SOURCES ARE SEPARATED STRUCTURALLY, not by inspecting the error. The user's
 * code is normalised first, in its own try/catch; only if that succeeds is matchCnPrefix
 * called. A throw from matchCnPrefix therefore cannot have come from the code — it can only
 * have come from a row's cn_prefix, which is why that arm returns 'unavailable' rather than
 * 'none'. Matching on message text would work today and rot the first time normalizeCn's
 * wording is edited.
 *
 * A half-typed code is 'none', not a complaint: the user has made no claim yet.
 */
export function suggestCategory(
  cnCode: string,
  rows: ReadonlyArray<CnMapRow>,
): CnCategorySuggestion {
  // `?? ''` rather than trusting the signature: called from a form, where an untyped caller
  // passing null must not be the thing that crashes it.
  const raw = (cnCode ?? '').trim();
  if (raw === '') return { kind: 'none' };

  let code: string;
  try {
    code = normalizeCn(raw);
  } catch {
    return { kind: 'none' };
  }

  let match: CnPrefixMatch | null;
  try {
    match = matchCnPrefix(code, rows);
  } catch {
    // Can only be a row's cn_prefix — see the ordering note above.
    return { kind: 'unavailable' };
  }

  if (match === null) return { kind: 'none' };

  // Compare against the MATCHED prefix, which matchCnPrefix has already normalised — not
  // against the user's raw input, which may be spaced ('7205 10 00'), and not against the raw
  // row string.
  if (match.matched_prefix === DUAL_LISTED.prefix) {
    return {
      kind: 'choice',
      primary: DUAL_LISTED.primary,
      alternative: DUAL_LISTED.alternative,
      matched_prefix: match.matched_prefix,
    };
  }

  return {
    kind: 'single',
    category_code: match.category_code,
    matched_prefix: match.matched_prefix,
  };
}
