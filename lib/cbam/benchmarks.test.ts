// lib/cbam/benchmarks.test.ts
// Pins the IR 2025/2620 §5.3 benchmark lookup (lib/cbam/benchmarks.ts).
//
// The ladder fixtures below carry the REAL seeded values from
// supabase/migrations/20260718_cbam_benchmarks.sql, verbatim including their source_cell strings,
// so these tests double as verification of the seeded data. If a seed value is ever re-extracted
// and changes, a test here must fail — that is the point. Do not "fix" a failure by editing the
// expectation without re-checking the OJ text.
//
// The four ladder cases are chosen because each one exercises a DIFFERENT rung: 7205 21 00 has both
// route and band (exact), 7206 10 00 has route but no band, 7218 10 00 has band but no route, and
// 2601 12 00 has neither. A lookup that collapsed the ladder would still pass a single-rung test.
import { describe, it, expect } from 'vitest';
import {
  deriveIndicator, derivePeriodBand, resolveBenchmark, BenchmarkRow,
} from './benchmarks';

// Verbatim from the seed migration — the four ladder rungs plus their siblings.
const ROWS: BenchmarkRow[] = [
  // bare: no route dimension, no band (2601 12 00 sintered ore)
  { cn_code: '2601 12 00', bm_column: 'A', route_indicator: null, period_band: null, value: 0.086 },
  { cn_code: '2601 12 00', bm_column: 'B', route_indicator: null, period_band: null, value: 0.086 },
  // route + band (7205 21 00 col B)
  { cn_code: '7205 21 00', bm_column: 'A', route_indicator: null, period_band: null, value: 0.000 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'F', period_band: 1, value: 1.460 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'G', period_band: 1, value: 0.659 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'H', period_band: 1, value: 0.328 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'J', period_band: 1, value: 0.852 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'F', period_band: 2, value: 1.298 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'G', period_band: 2, value: 0.647 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'H', period_band: 2, value: 0.315 },
  { cn_code: '7205 21 00', bm_column: 'B', route_indicator: 'J', period_band: 2, value: 0.820 },
  // route, no band (7206 10 00) — also the pair motivating the eaf split: B (D)=0.424 vs (E)=0.027
  { cn_code: '7206 10 00', bm_column: 'A', route_indicator: 'C', period_band: null, value: 0.150 },
  { cn_code: '7206 10 00', bm_column: 'A', route_indicator: 'D', period_band: null, value: 0.027 },
  { cn_code: '7206 10 00', bm_column: 'A', route_indicator: 'E', period_band: null, value: 0.027 },
  { cn_code: '7206 10 00', bm_column: 'B', route_indicator: 'C', period_band: null, value: 1.288 },
  { cn_code: '7206 10 00', bm_column: 'B', route_indicator: 'D', period_band: null, value: 0.424 },
  { cn_code: '7206 10 00', bm_column: 'B', route_indicator: 'E', period_band: null, value: 0.027 },
  // band, no route (7218 10 00 col B)
  { cn_code: '7218 10 00', bm_column: 'A', route_indicator: null, period_band: null, value: 0.358 },
  { cn_code: '7218 10 00', bm_column: 'B', route_indicator: null, period_band: 1, value: 1.419 },
  { cn_code: '7218 10 00', bm_column: 'B', route_indicator: null, period_band: 2, value: 1.381 },
];

describe('deriveIndicator', () => {
  it('maps carbon steel across all three routes (C / D / E)', () => {
    expect(deriveIndicator('carbon', 'bof')).toBe('C');
    expect(deriveIndicator('carbon', 'eaf_dri')).toBe('D');
    expect(deriveIndicator('carbon', 'eaf_scrap')).toBe('E');
  });

  it('maps low alloy across all three routes (F / G / H)', () => {
    expect(deriveIndicator('low_alloy', 'bof')).toBe('F');
    expect(deriveIndicator('low_alloy', 'eaf_dri')).toBe('G');
    expect(deriveIndicator('low_alloy', 'eaf_scrap')).toBe('H');
  });

  // The regulation's own collapsing: §5.3 gives ONE high-alloy EAF indicator with no DRI/scrap
  // split. Both feedstocks landing on (J) is correct source fidelity, not a lost distinction.
  it('collapses both high-alloy EAF feedstocks to (J), per the §5.3 legend', () => {
    expect(deriveIndicator('high_alloy', 'eaf_dri')).toBe('J');
    expect(deriveIndicator('high_alloy', 'eaf_scrap')).toBe('J');
  });

  it('throws for high_alloy + bof — IR 2025/2620 defines no such indicator', () => {
    expect(() => deriveIndicator('high_alloy', 'bof')).toThrow(/no such combination|No IR 2025\/2620/i);
  });

  // null grade is NOT an error: non-steel CBAM goods have no grade and use bare benchmark cells.
  it('returns null for a null/undefined grade, on any route', () => {
    expect(deriveIndicator(null, 'bof')).toBeNull();
    expect(deriveIndicator(undefined, 'eaf_dri')).toBeNull();
    expect(deriveIndicator(null, 'eaf_scrap')).toBeNull();
  });
});

describe('derivePeriodBand', () => {
  it('maps 2026-2027 to band 1', () => {
    expect(derivePeriodBand(2026)).toBe(1);
    expect(derivePeriodBand(2027)).toBe(1);
  });

  it('maps 2028-2030 to band 2', () => {
    expect(derivePeriodBand(2028)).toBe(2);
    expect(derivePeriodBand(2030)).toBe(2);
  });

  // Both edges throw rather than clamping — see §11.2. A clamped 2031 would silently assert a
  // benchmark the regulation never published.
  it('throws past 2030 rather than extrapolating', () => {
    expect(() => derivePeriodBand(2031)).toThrow(/2026-2030|do not extrapolate/i);
  });

  it('throws before 2026', () => {
    expect(() => derivePeriodBand(2025)).toThrow(/2026-2030|do not extrapolate/i);
  });
});

describe('resolveBenchmark — specificity ladder', () => {
  it('rung 1: exact (route + band) — 7205 21 00 / B / F / band 1 -> 1.460', () => {
    expect(resolveBenchmark(ROWS, '7205 21 00', 'B', 'F', 1)).toBe(1.460);
  });

  it('rung 2: route-only, data carries no band — 7206 10 00 / A / C / band 1 -> 0.150', () => {
    expect(resolveBenchmark(ROWS, '7206 10 00', 'A', 'C', 1)).toBe(0.150);
    // and the band is genuinely ignored, not coincidentally matching
    expect(resolveBenchmark(ROWS, '7206 10 00', 'A', 'C', 2)).toBe(0.150);
  });

  it('rung 3: period-only, data carries no route — 7218 10 00 / B / C / band 1 -> 1.419', () => {
    expect(resolveBenchmark(ROWS, '7218 10 00', 'B', 'C', 1)).toBe(1.419);
    // the requested indicator has no row, so band still selects: band 2 -> 1.381
    expect(resolveBenchmark(ROWS, '7218 10 00', 'B', 'C', 2)).toBe(1.381);
  });

  it('rung 4: bare — 2601 12 00 / A / null indicator / band 1 -> 0.086', () => {
    expect(resolveBenchmark(ROWS, '2601 12 00', 'A', null, 1)).toBe(0.086);
  });

  it('throws on an unknown cn_code, naming the inputs so the miss is diagnosable', () => {
    expect(() => resolveBenchmark(ROWS, '9999 99 99', 'B', 'C', 1)).toThrow(/9999 99 99/);
    expect(() => resolveBenchmark(ROWS, '9999 99 99', 'B', 'C', 1)).toThrow(/column='B'/);
    expect(() => resolveBenchmark(ROWS, '9999 99 99', 'B', 'C', 1)).toThrow(/indicator=C/);
    expect(() => resolveBenchmark(ROWS, '9999 99 99', 'B', 'C', 1)).toThrow(/band=1/);
  });
});

describe('resolveBenchmark — the values motivating the eaf split', () => {
  // The whole reason 'eaf' was split into eaf_dri/eaf_scrap: under a single 'eaf' code these two
  // were indistinguishable, yet they differ ~16x. This pins the spread.
  it('7206 10 00 col B: DRI/EAF (D) = 0.424 vs scrap/EAF (E) = 0.027', () => {
    const d = resolveBenchmark(ROWS, '7206 10 00', 'B', deriveIndicator('carbon', 'eaf_dri'), 1);
    const e = resolveBenchmark(ROWS, '7206 10 00', 'B', deriveIndicator('carbon', 'eaf_scrap'), 1);
    expect(d).toBe(0.424);
    expect(e).toBe(0.027);
    expect(d / e).toBeGreaterThan(15);
  });
});

describe('resolveBenchmark — numeric coercion', () => {
  it('coerces a stringified numeric so downstream arithmetic is never string-poisoned', () => {
    const stringy: BenchmarkRow[] = [
      { cn_code: '2601 12 00', bm_column: 'A', route_indicator: null, period_band: null, value: '0.086' },
    ];
    const v = resolveBenchmark(stringy, '2601 12 00', 'A', null, 1);
    expect(v).toBe(0.086);
    expect(typeof v).toBe('number');
  });
});
