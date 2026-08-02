// lib/cbam/labels.ts
// DISPLAY LABELS ONLY. Pure data and pure functions — no React, no Supabase, no imports.
//
// THE CODE IS THE IDENTITY; THE LABEL IS A RENDERING OF IT. Codes are what the database stores,
// what a payload carries, what a select's `value` holds, and what lib/cbam/boundariesLookup.ts
// filters on. Labels exist so a customer does not have to read 'eaf_dri'. The direction is
// strictly one way:
//
//   - NEVER map a label back to a code. Two codes could be given the same label by a careless
//     edit here and nothing would catch it, so the reverse lookup is not merely absent — it is
//     unsound.
//   - NEVER use a label as a key, an option value, a comparison, or a payload field. Editing a
//     string in this file must never be able to change what is saved or what is matched.
//
// A code with no entry here RENDERS ITS RAW CODE. That is deliberate: a route added to
// cbam_production_routes without a matching entry in this file will show as 'some_new_route' in
// the dropdown — visibly unfinished, which is the correct outcome. The alternatives are worse:
// blanking it hides an option the operator can legitimately choose, and inventing a label from
// the code ('Some New Route') would look finished while being ours rather than considered.

/**
 * Production routes. Keys are `cbam_production_routes.route_code`.
 *
 * The two EAF labels carry an EN-DASH (–, U+2013), not a hyphen-minus. It separates the furnace
 * from its charge, which is a range-like relation rather than a compound word.
 */
export const ROUTE_LABELS: Readonly<Record<string, string>> = {
  bof: 'Basic Oxygen Furnace (BOF)',
  eaf_scrap: 'Electric Arc Furnace (EAF) – Scrap',
  eaf_dri: 'Electric Arc Furnace (EAF) – DRI/HBI',
  blast_furnace: 'Blast Furnace',
  direct_reduction: 'Direct Reduction (DRI/HBI)',
  smelting_reduction: 'Smelting Reduction',
  submerged_arc: 'Submerged Arc Furnace',
  primary_electrolysis: 'Primary Smelting (Electrolysis)',
  secondary_remelt: 'Secondary Production (Remelting)',
};

/** Calculation method. Keys are `cbam_production_processes.calc_mode`. */
export const CALC_MODE_LABELS: Readonly<Record<string, string>> = {
  actual: 'Actual Installation Data',
  default: 'CBAM Default Values',
  combined: 'Combination of Actual and Default Values',
};

/** Steel grade. Keys are `cbam_production_processes.steel_grade`. */
export const STEEL_GRADE_LABELS: Readonly<Record<string, string>> = {
  carbon: 'Carbon Steel',
  low_alloy: 'Low-Alloy Steel',
  high_alloy: 'High-Alloy Steel (including Stainless Steel)',
};

/**
 * Carbon-content mode. Keys are `cbam_source_streams.cc_mode`.
 *
 * SENTENCE CASE, deliberately — unlike ROUTE_LABELS and CALC_MODE_LABELS above. These labels
 * carry units, and title case mangles them: 'Emission Factor Per Tonne (t CO₂ / T)' reads as a
 * proper noun and puts a capital on a unit symbol. Do not "correct" these to match the others.
 *
 * The regulation has no name for these as modes. IR 2025/2547 Annex III names ONE quantity —
 * carbon content, CC_k — and two ways of reaching it, distinguished only by the units of the
 * emission factor (Eq 13, t CO₂/TJ; Eq 14, t CO₂/t). So the units ARE the distinction, which is
 * why they are in the label rather than left to the field hint.
 *
 * 'direct' is not a regulatory term at all — it is our name for supplying CC_k with no
 * conversion, hence the bare 'Carbon content'.
 */
export const CC_MODE_LABELS: Readonly<Record<string, string>> = {
  direct: 'Carbon content',
  ef_per_t: 'Emission factor per tonne (t CO₂ / t)',
  ef_per_tj: 'Emission factor per terajoule (t CO₂ / TJ)',
};

/** Source-stream kind. Keys are `cbam_source_streams.stream_kind`. */
export const STREAM_KIND_LABELS: Readonly<Record<string, string>> = {
  fuel: 'Fuel',
  process_material: 'Process material',
  output: 'Output',
};

/**
 * Fall back to the raw code when unmapped — the same contract as categoryLabel in the setup
 * page, which returns `?? code`. An unmapped code is visible rather than hidden.
 *
 * An empty code returns an empty string, because '' is how this codebase represents "not set"
 * for route_code and steel_grade. Rendering a placeholder here would put text on screen where
 * the caller has decided there should be none.
 */
function labelFrom(map: Readonly<Record<string, string>>, code: string): string {
  // Object.hasOwn, not `map[code] ?? code`: a bare index reaches Object.prototype, so the code
  // 'toString' would resolve to a FUNCTION rather than falling back to itself. Route codes come
  // from a database column, so an inherited key is not a hypothetical the type system rules out.
  return Object.hasOwn(map, code) ? map[code] : code;
}

export function routeLabel(code: string): string {
  return labelFrom(ROUTE_LABELS, code);
}

export function calcModeLabel(code: string): string {
  return labelFrom(CALC_MODE_LABELS, code);
}

export function steelGradeLabel(code: string): string {
  return labelFrom(STEEL_GRADE_LABELS, code);
}

export function ccModeLabel(code: string): string {
  return labelFrom(CC_MODE_LABELS, code);
}

export function streamKindLabel(code: string): string {
  return labelFrom(STREAM_KIND_LABELS, code);
}
