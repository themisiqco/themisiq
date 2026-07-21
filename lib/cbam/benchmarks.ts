// lib/cbam/benchmarks.ts
// IR (EU) 2025/2620 §5.3 benchmark lookup, as pure functions. Same shape as adapt.ts: the logic
// lives here so it is unit-testable, and the DB fetch is wired separately — nothing in this file
// touches Supabase. Callers pass in already-fetched rows.
//
// Three steps, deliberately separate: which indicator applies (deriveIndicator), which period band
// applies (derivePeriodBand), and which row those two select (resolveBenchmark). Keeping them apart
// means a wrong benchmark can be traced to whichever step actually made the wrong choice.
// Row shape is declared here rather than in types.ts, matching adapt.ts: these are DB-row shapes
// for this seam, not engine types. numeric arrives from PostgREST as a JSON number, but `value` is
// widened to string and coerced on read so a stringified numeric can never poison the arithmetic.
export interface BenchmarkRow {
  cn_code: string;
  bm_column: 'A' | 'B';
  route_indicator: RouteIndicator | null;
  period_band: PeriodBand | null;
  value: number | string;
}

export type SteelGrade = 'carbon' | 'low_alloy' | 'high_alloy';
export type RouteCode = 'bof' | 'eaf_dri' | 'eaf_scrap';
export type RouteIndicator = 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J';
export type PeriodBand = 1 | 2;

// §5.3 legend. Grade and route jointly determine the indicator — neither alone is sufficient.
// There is no indicator (I) in the source; the sequence runs (H) -> (J).
//
// high_alloy collapses BOTH EAF feedstocks to (J). That is THE REGULATION'S OWN COLLAPSING, not a
// simplification introduced here: the §5.3 legend gives a single high-alloy EAF indicator with no
// DRI/scrap split, unlike carbon (D/E) and low alloy (G/H). Do not "fix" this by inventing a
// second high-alloy indicator — the value it would point at does not exist in the benchmark table.
//
// high_alloy + bof is absent by the same reading: the legend has no BF/BOF high-alloy indicator.
// It is a throw rather than a null because null already means "non-steel good, use the bare cell";
// an unrepresentable steel combination is a different condition and must not be silently swallowed.
const INDICATORS: Record<SteelGrade, Partial<Record<RouteCode, RouteIndicator>>> = {
  carbon:     { bof: 'C', eaf_dri: 'D', eaf_scrap: 'E' },
  low_alloy:  { bof: 'F', eaf_dri: 'G', eaf_scrap: 'H' },
  high_alloy: { eaf_dri: 'J', eaf_scrap: 'J' },
};

/**
 * Resolve the §5.3 route indicator for a grade/route pair.
 * Returns null when grade is null/undefined — non-steel goods (sintered ore, pig iron, DRI,
 * ferroalloys) carry bare benchmark cells with no route dimension at all.
 * Throws for high_alloy + bof, which IR 2025/2620 does not define an indicator for.
 */
export function deriveIndicator(
  grade: SteelGrade | null | undefined,
  route: RouteCode,
): RouteIndicator | null {
  if (grade == null) return null;

  const indicator = INDICATORS[grade]?.[route];
  if (!indicator) {
    throw new Error(
      `No IR 2025/2620 §5.3 benchmark indicator exists for grade '${grade}' with route '${route}'. ` +
        `The §5.3 legend defines no such combination.`,
    );
  }
  return indicator;
}

/**
 * Map a production year to its benchmark period band.
 * Spec §11.2: the benchmark table defines bands only for 2026-2030. A year outside that range
 * throws rather than clamping — extrapolating a benchmark past 2030 would invent a regulatory
 * value that does not exist, and a silently-clamped 2031 would be indistinguishable from a real one.
 */
export function derivePeriodBand(year: number): PeriodBand {
  if (year >= 2026 && year <= 2027) return 1;
  if (year >= 2028 && year <= 2030) return 2;
  throw new Error(
    `No benchmark period band is defined for production year ${year}. ` +
      `IR 2025/2620 §5.3 covers 2026-2030 only (band 1 = 2026-27, band 2 = 2028-30); do not extrapolate.`,
  );
}

/**
 * Select the benchmark value for a CN code, most-specific-first.
 *
 * The benchmark table is ragged: some CN codes vary by route AND band, some by route only, some by
 * band only, some by neither. NULL in a row means "applies to all" for that dimension, so the
 * lookup walks from fully-specified down to bare and takes the first hit:
 *
 *   1. (cnCode, column, indicator, band)  exact
 *   2. (cnCode, column, indicator, null)  route-specific, all bands
 *   3. (cnCode, column, null, band)       period-specific, all routes
 *   4. (cnCode, column, null, null)       bare
 *
 * Order matters between rungs 2 and 3: route is the narrower dimension, so a route-specific value
 * must win over a period-specific one where a code somehow carries both.
 */
export function resolveBenchmark(
  rows: BenchmarkRow[],
  cnCode: string,
  column: 'A' | 'B',
  indicator: RouteIndicator | null,
  band: PeriodBand,
): number {
  const candidates = rows.filter((r) => r.cn_code === cnCode && r.bm_column === column);

  const at = (ind: RouteIndicator | null, b: PeriodBand | null) =>
    candidates.find((r) => r.route_indicator === ind && r.period_band === b);

  const hit =
    (indicator != null ? at(indicator, band) ?? at(indicator, null) : undefined) ??
    at(null, band) ??
    at(null, null);

  if (!hit) {
    throw new Error(
      `No IR 2025/2620 benchmark found for cn_code='${cnCode}' column='${column}' ` +
        `indicator=${indicator ?? 'null'} band=${band}. ` +
        `Checked exact, route-only, period-only and bare rows; ${candidates.length} row(s) exist for this cn_code/column.`,
    );
  }
  return Number(hit.value);
}
