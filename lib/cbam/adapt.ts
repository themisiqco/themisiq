// lib/cbam/adapt.ts
// DB row -> engine type adapters. Kept OUT of the route so they are unit-testable in isolation
// (the route is the untestable boundary; these are pure functions). The column->field mapping is
// load-bearing: a mis-map silently produces a wrong number, not an error, so it is pinned here once.
//
// Numeric coercion: Postgres `numeric` arrives via PostgREST as a JSON number already, but we wrap
// in Number() defensively so a stringified numeric can never poison the arithmetic downstream.
// Nullable numerics map null -> undefined so the engine's optional-field (`cc?`/`ef?`/…) checks hold.
import type {
  SourceStream, PrecursorInput, SourceStreamKind, CcMode, Boundary, Provenance,
} from './types';

export interface SourceStreamRow {
  stream_kind: string;
  activity_data: number | string;
  cc_mode: string;
  carbon_content: number | string | null;
  emission_factor: number | string | null;
  ncv: number | string | null;
  biomass_fraction: number | string;
}

export interface PrecursorInputRow {
  precursor_cn_code: string;
  precursor_category_code: string;
  mass_consumed: number | string;
  boundary: string;
  provenance: string;
  origin_country: string;
  see_value: number | string | null;
  verifier_report_id: string | null;
  reporting_period: number | string;
}

const num = (v: number | string): number => Number(v);
const optNum = (v: number | string | null): number | undefined => (v == null ? undefined : Number(v));

// stream_kind/cc_mode/boundary/provenance carry DB CHECK constraints enforcing exactly the engine's
// union values, so the casts below are safe — the DB is the guarantor, not this function.
export function adaptSourceStream(row: SourceStreamRow): SourceStream {
  return {
    kind: row.stream_kind as SourceStreamKind,
    ad: num(row.activity_data),
    ccMode: row.cc_mode as CcMode,
    cc: optNum(row.carbon_content),
    ef: optNum(row.emission_factor),
    ncv: optNum(row.ncv),
    bf: num(row.biomass_fraction),
  };
}

export function adaptPrecursor(row: PrecursorInputRow): PrecursorInput {
  return {
    cnCode: row.precursor_cn_code,
    category: row.precursor_category_code,
    massConsumed: num(row.mass_consumed),
    boundary: row.boundary as Boundary,
    provenance: row.provenance as Provenance,
    originCountry: row.origin_country,
    seeValue: optNum(row.see_value),
    verifierReportId: row.verifier_report_id ?? undefined,
    period: num(row.reporting_period),
  };
}
