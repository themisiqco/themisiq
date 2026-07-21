// lib/cbam/sefaCompute.ts
// Wires the pure SEFA calculation (lib/cbam/sefa.ts) and the benchmark lookup (lib/cbam/benchmarks.ts)
// into a single decision the compute route persists: what SEFA to write, its status, and the
// benchmark workings. Boundary-shaped like resolver.ts — the DB fetch is injected as a thunk, so this
// stays unit-testable without Supabase — but the ORDERING is owned here, not the route:
//
//   1. No cbam_sefa_params row for the year → THROW. No CBAM_y factor means SEFA is not computable;
//      that is a genuine error, not a pending state.
//   2. CSCF unpublished (cscf null, equivalently cscf_status != 'published') → 'not_determinable_cscf_pending':
//      all three numerics null, benchmarks NEVER fetched (fetchBenchmarks is not called), sfaProc
//      never invoked. This is the live path for every year 2026-2034 (CSCF confirmed unpublished, §11.1).
//   3. CSCF published → compute via Eq 2/4/6 and record the benchmark used (§1.2 item 4(f)).
//
// The pending case is branched EXPLICITLY on cscf, never via catching sfaProc's throw: a catch would
// also swallow genuine errors (NaN benchmark, missing factor), which are exactly what must surface.
import {
  BenchmarkRow, deriveIndicator, derivePeriodBand, resolveBenchmark,
  RouteCode, SteelGrade,
} from './benchmarks';
import { computeSEFA, resolvePrecursorSefa, sfaProc, SEFAContext } from './sefa';
import type { PrecursorInput } from './types';

// The two year-varying scalars from cbam_sefa_params (CBAM_y, CSCF_y) plus the status that
// disambiguates a null CSCF ('pending') from a published one.
export interface SefaParamsRow {
  cbam_factor: number;
  cscf: number | null;
  cscf_status: string;
}

// Benchmark provenance for the workings jsonb — satisfies §1.2 item 4(f) ("confirmation of the use
// of the applicable CBAM benchmarks and the methods used") without a separate disclosure field.
export interface SefaBenchmarkWorkings {
  value: number;
  column: 'A';
  indicator: string | null;
  periodBand: number;
  cbamFactor: number;
  cscf: number;
}

export interface SefaPersist {
  sefa: number | null;
  sfa_proc: number | null;
  sefa_precursor_contrib: number | null;
  sefa_status: 'computed' | 'not_determinable_cscf_pending';
  // Benchmark details for the workings jsonb. NULL on the pending path — we record nothing there
  // rather than a "would-be" benchmark someone could multiply into a wrong number themselves.
  benchmarkWorkings: SefaBenchmarkWorkings | null;
}

export interface SefaComputeInput {
  params: SefaParamsRow | null;
  cnCode: string;
  steelGrade: SteelGrade | null;
  routeCode: RouteCode | null;
  reportingPeriod: number;
  precursors: PrecursorInput[];
  activityLevel: number;
  isEuOrExempted: (country: string) => boolean;
  // Lazy — MUST NOT be called on the pending path. On the computed path it fetches cbam_benchmarks
  // rows for the process cn_code AND every precursor cn_code (Column B lookups need the precursor rows).
  fetchBenchmarks: () => Promise<BenchmarkRow[]>;
}

export async function computeSefaPersist(input: SefaComputeInput): Promise<SefaPersist> {
  const { params } = input;

  // ── 1. Missing params row is a genuine error, not a pending state ────────────────────────────
  if (!params) {
    throw new Error(
      `computeSefaPersist: no cbam_sefa_params row for reporting year ${input.reportingPeriod}. ` +
        'No CBAM factor (CBAM_y) means SEFA is not computable — this is an error, not a pending state.',
    );
  }

  // ── 2. CSCF check FIRST — short-circuit the pending path (no benchmark fetch, no sfaProc) ─────
  if (params.cscf === null || params.cscf_status !== 'published') {
    return {
      sefa: null,
      sfa_proc: null,
      sefa_precursor_contrib: null,
      sefa_status: 'not_determinable_cscf_pending',
      benchmarkWorkings: null,
    };
  }

  // ── 3. Computed path: CSCF is published ──────────────────────────────────────────────────────
  const indicator = deriveIndicator(input.steelGrade, input.routeCode as RouteCode);
  const band = derivePeriodBand(input.reportingPeriod);
  const benchmarkRows = await input.fetchBenchmarks();
  const benchmark = resolveBenchmark(benchmarkRows, input.cnCode, 'A', indicator, band);

  const sfaProcValue = sfaProc(params.cbam_factor, params.cscf, benchmark);

  const ctx: SEFAContext = {
    isEuOrExempted: input.isEuOrExempted,
    cbamFactor: params.cbam_factor,
    cscf: params.cscf,
    // Eq 6 default path uses Column B. A default-provenance precursor's route/grade is not captured
    // in cbam_precursor_inputs, so indicator is null (bare/period-only lookup); resolveBenchmark
    // fails loud if a precursor carries only route-specific rows — never a silent wrong cell.
    defaultBenchmarkB: (p: PrecursorInput) =>
      resolveBenchmark(benchmarkRows, p.cnCode, 'B', null, derivePeriodBand(p.period)),
  };

  const result = computeSEFA(
    sfaProcValue,
    input.precursors,
    input.activityLevel,
    (p) => resolvePrecursorSefa(p, ctx),
  );

  return {
    sefa: result.sefa,
    sfa_proc: result.sfaProc,
    // Σ over zero precursors is a REAL computed 0, not null — the 'computed' CHECK requires all three
    // numerics non-null. computeSEFA already returns 0 for the empty case; pass it through.
    sefa_precursor_contrib: result.precursorContribution,
    sefa_status: 'computed',
    benchmarkWorkings: {
      value: benchmark,
      column: 'A',
      indicator,
      periodBand: band,
      cbamFactor: params.cbam_factor,
      cscf: params.cscf,
    },
  };
}
