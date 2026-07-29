// lib/cbam/cn.ts
// CN-code normalisation and prefix matching — the §10.8 requirement, implemented.
//
// WHY THIS EXISTS. Spec §10.8 records three incompatible CN key formats across the CBAM
// datasets:
//   cbam_cn_map.cn_prefix        digits only, no spaces      54× 4-digit, 3× 5-digit, 1× 8-digit
//   cbam_default_values.cn_code  spaced, mixed width         19× 4-digit, 62× 6-digit, 119× 8-digit
//   cbam_benchmarks.cn_code      spaced, always 8-digit
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
