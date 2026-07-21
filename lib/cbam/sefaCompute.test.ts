// lib/cbam/sefaCompute.test.ts
// Pins the SEFA wiring (lib/cbam/sefaCompute.ts) that the compute route persists into the four
// cbam_see_records columns (sefa / sfa_proc / sefa_precursor_contrib / sefa_status).
//
// Two branches carry the weight:
//   * PENDING (CSCF unpublished) — the live path for every year 2026-2034. Status pending, all three
//     numerics null, and benchmarks NEVER fetched. The fetch is a spy so "did not fetch" is asserted,
//     not assumed.
//   * COMPUTED (CSCF stubbed published at 1.0) — status computed, all three numerics populated,
//     including the precursor-free case where sefa_precursor_contrib is a REAL 0 (not null), which is
//     exactly what the DB 'computed' CHECK requires.
import { describe, it, expect, vi } from 'vitest';
import { computeSefaPersist, SefaParamsRow } from './sefaCompute';
import type { BenchmarkRow } from './benchmarks';
import type { PrecursorInput } from './types';

// A carbon / scrap-EAF steel good (indicator E) and its Column A benchmark for band 1 (2026).
// 0.044 is 7208 10 00 Column A, reused from sefa.test.ts.
const PROCESS_CN = '7208 10 00';
const ROWS: BenchmarkRow[] = [
  { cn_code: PROCESS_CN, bm_column: 'A', route_indicator: 'E', period_band: 1, value: 0.044 },
  // A Column B benchmark for a default precursor, band 1 (bare route — a default precursor's route
  // is unknown, so the lookup uses indicator null).
  { cn_code: '7201 10 11', bm_column: 'B', route_indicator: null, period_band: 1, value: 0.5 },
];

const noEu = (_country: string) => false;

const baseInput = () => ({
  cnCode: PROCESS_CN,
  steelGrade: 'carbon' as const,
  routeCode: 'eaf_scrap' as const,
  reportingPeriod: 2026,
  precursors: [] as PrecursorInput[],
  activityLevel: 100,
  isEuOrExempted: noEu,
});

const precursor = (over: Partial<PrecursorInput> = {}): PrecursorInput => ({
  cnCode: '7201 10 11',
  category: 'pig_iron',
  massConsumed: 110,
  boundary: 'external',
  provenance: 'default',
  originCountry: 'CN',
  period: 2026,
  ...over,
});

describe('computeSefaPersist — pending path (CSCF unpublished)', () => {
  it('null CSCF → pending status, three nulls, and benchmarks never fetched', async () => {
    const params: SefaParamsRow = { cbam_factor: 0.975, cscf: null, cscf_status: 'pending' };
    const fetchBenchmarks = vi.fn(async () => ROWS);

    const out = await computeSefaPersist({ ...baseInput(), params, fetchBenchmarks });

    expect(out.sefa_status).toBe('not_determinable_cscf_pending');
    expect(out.sefa).toBeNull();
    expect(out.sfa_proc).toBeNull();
    expect(out.sefa_precursor_contrib).toBeNull();
    expect(out.benchmarkWorkings).toBeNull();
    // The load-bearing assertion: the pending branch short-circuits BEFORE any benchmark fetch.
    expect(fetchBenchmarks).not.toHaveBeenCalled();
  });

  it('cscf_status not "published" is pending even if a stray number is present', async () => {
    // Defensive: the guard keys off cscf_status != 'published', not just cscf === null.
    const params: SefaParamsRow = { cbam_factor: 0.975, cscf: 0.9, cscf_status: 'pending' };
    const fetchBenchmarks = vi.fn(async () => ROWS);

    const out = await computeSefaPersist({ ...baseInput(), params, fetchBenchmarks });

    expect(out.sefa_status).toBe('not_determinable_cscf_pending');
    expect(fetchBenchmarks).not.toHaveBeenCalled();
  });
});

describe('computeSefaPersist — missing params', () => {
  it('throws when no cbam_sefa_params row exists for the year (genuine error, not pending)', async () => {
    const fetchBenchmarks = vi.fn(async () => ROWS);
    await expect(
      computeSefaPersist({ ...baseInput(), params: null, fetchBenchmarks }),
    ).rejects.toThrow(/no cbam_sefa_params row|not computable/i);
    expect(fetchBenchmarks).not.toHaveBeenCalled();
  });
});

describe('computeSefaPersist — computed path (CSCF stubbed published at 1.0)', () => {
  it('precursor-free good → computed, all three numerics set, contribution a REAL 0', async () => {
    const params: SefaParamsRow = { cbam_factor: 0.975, cscf: 1.0, cscf_status: 'published' };
    const fetchBenchmarks = vi.fn(async () => ROWS);

    const out = await computeSefaPersist({ ...baseInput(), params, fetchBenchmarks });

    expect(out.sefa_status).toBe('computed');
    // 0.975 × 1.0 × 0.044 = 0.0429
    expect(out.sfa_proc).toBeCloseTo(0.0429, 10);
    expect(out.sefa).toBeCloseTo(0.0429, 10);
    // Σ over zero precursors is a real computed 0 — NOT null (the 'computed' CHECK requires non-null).
    expect(out.sefa_precursor_contrib).toBe(0);
    expect(Object.is(out.sefa_precursor_contrib, null)).toBe(false);
    // §1.2 item 4(f): the benchmark used is recorded in the workings.
    expect(out.benchmarkWorkings).toEqual({
      value: 0.044,
      column: 'A',
      indicator: 'E',
      periodBand: 1,
      cbamFactor: 0.975,
      cscf: 1.0,
    });
    expect(fetchBenchmarks).toHaveBeenCalledOnce();
  });

  it('with a default precursor → contribution rolls up via Eq 4 (Column B)', async () => {
    const params: SefaParamsRow = { cbam_factor: 0.975, cscf: 1.0, cscf_status: 'published' };
    const out = await computeSefaPersist({
      ...baseInput(),
      params,
      precursors: [precursor()],
      fetchBenchmarks: async () => ROWS,
    });

    expect(out.sefa_status).toBe('computed');
    // SEFA_i = 0.975 × 1.0 × 0.5 = 0.4875 ; m_i = 110/100 = 1.1 ; contrib = 0.53625
    expect(out.sefa_precursor_contrib).toBeCloseTo(0.53625, 10);
    // sefa = sfa_proc (0.0429) + contribution (0.53625) = 0.57915
    expect(out.sefa).toBeCloseTo(0.57915, 10);
  });
});
