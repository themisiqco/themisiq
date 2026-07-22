// lib/cbam/loadProcess.ts
// ThemisIQ — CBAM load-adapt-compute spine, extracted from app/api/cbam/compute/route.ts so the
// compute route and the forthcoming report route call the IDENTICAL path (same select column lists,
// same Promise.all, same validation order, same messages, same engine call).
//
// This is an impure DB-boundary module, sibling to resolver.ts/adapt.ts — it touches Supabase. The
// engine (engine.ts) itself stays pure. Callers map ProcessLoadError.code to HTTP; this module never
// constructs a NextResponse.

import type { SupabaseClient } from '@supabase/supabase-js';
import { attributeDirect, computeSEE } from './engine';
import { makeResolveContext } from './resolver';
import { adaptSourceStream, adaptPrecursor } from './adapt';
import type { SourceStream, PrecursorInput, ResolveContext, SEEResult } from './types';
import type { SteelGrade, RouteCode } from './benchmarks';

export type ProcessLoadErrorCode =
  | 'not_found'          // caller maps to 404
  | 'invalid_input'      // caller maps to 400
  | 'load_failed';       // caller maps to 500

// Typed error mirroring lib/supabaseAuthed.ts AuthError: a named Error carrying a code, NOT an
// HTTP status. The caller owns the code -> status mapping.
export class ProcessLoadError extends Error {
  constructor(message: string, public code: ProcessLoadErrorCode) {
    super(message);
    this.name = 'ProcessLoadError';
  }
}

// The cbam_production_processes row as loaded by the select below. steel_grade/route_code are the
// engine's literal-union types because they flow directly into computeSefaPersist downstream.
export interface ProcessRow {
  id: string;
  company_id: string;
  cn_code: string;
  category_code: string;
  activity_level: number;
  reporting_period: number;
  installation_id: string;
  electricity_consumed: number | null;
  steel_grade: SteelGrade | null;
  route_code: RouteCode | null;
}

// INVARIANT 10 — result.resolutions is keyed by OBJECT IDENTITY on the PrecursorInput objects in
// `precursors`. Both are produced by the SAME loadAndComputeProcess call and returned together so
// callers hold a mutually consistent pair. Never re-adapt (adaptPrecursor) or re-resolve (resolveSEE)
// a precursor downstream: a fresh object would miss its entry in the map, and a fresh map would key
// off different objects. The one call is the guarantee.
export interface LoadedProcess {
  process: ProcessRow;
  activityLevel: number;
  installationCountry: string;
  annexIiDirectOnly: boolean;
  electricityConsumed: number | null;
  streams: SourceStream[];
  precursors: PrecursorInput[];
  ctx: ResolveContext;
  result: SEEResult;        // from computeSEE — carries `resolutions`
}

export async function loadAndComputeProcess(
  supabase: SupabaseClient,
  processId: string,
): Promise<LoadedProcess> {
  // ── 2. Load the process (RLS scopes to the owner) ────────────────
  const { data: process, error: procErr } = await supabase
    .from('cbam_production_processes')
    .select('id, company_id, cn_code, category_code, activity_level, reporting_period, installation_id, electricity_consumed, steel_grade, route_code')
    .eq('id', processId)
    .single();

  if (procErr || !process) {
    // Not found OR not owned by this user — RLS makes those indistinguishable, which is correct.
    throw new ProcessLoadError('Process not found', 'not_found');
  }

  const activityLevel = Number(process.activity_level);
  if (!(activityLevel > 0)) {
    throw new ProcessLoadError('Process activity_level must be > 0', 'invalid_input');
  }
  if (!process.cn_code) {
    throw new ProcessLoadError('Process is missing cn_code (the good produced)', 'invalid_input');
  }

  // ── 3. Load streams + precursors + the two indirect-calc inputs for this process ──
  //   * installation.country keys the grid factor (the SITE drawing grid power — NOT the
  //     precursor's origin_country, which is a different concern: zero-rating + precursor defaults).
  //   * annex_ii_direct_only (per goods category) gates the process's OWN indirect only.
  const [streamsRes, precursorsRes, installationRes, categoryRes] = await Promise.all([
    supabase
      .from('cbam_source_streams')
      .select('stream_kind, activity_data, cc_mode, carbon_content, emission_factor, ncv, biomass_fraction')
      .eq('process_id', processId),
    supabase
      .from('cbam_precursor_inputs')
      .select('precursor_cn_code, precursor_category_code, mass_consumed, boundary, provenance, origin_country, see_value, verifier_report_id, reporting_period')
      .eq('process_id', processId),
    supabase
      .from('cbam_installations')
      .select('country')
      .eq('id', process.installation_id)
      .single(),
    supabase
      .from('cbam_goods_categories')
      .select('annex_ii_direct_only')
      .eq('code', process.category_code)
      .single(),
  ]);

  if (streamsRes.error || precursorsRes.error) {
    console.error('CBAM compute load error:', streamsRes.error || precursorsRes.error);
    throw new ProcessLoadError('Failed to load process inputs', 'load_failed');
  }
  if (installationRes.error || !installationRes.data || categoryRes.error || !categoryRes.data) {
    console.error('CBAM compute indirect-input load error:', installationRes.error || categoryRes.error);
    throw new ProcessLoadError('Failed to load installation/category for indirect calc', 'load_failed');
  }

  const installationCountry: string = installationRes.data.country;
  const annexIiDirectOnly: boolean = categoryRes.data.annex_ii_direct_only;
  const electricityConsumed: number | null =
    process.electricity_consumed == null ? null : Number(process.electricity_consumed);

  // ── 4. Adapt DB rows -> engine types (pinned mapping, testable) ──
  const streams = (streamsRes.data ?? []).map(adaptSourceStream);
  const precursors = (precursorsRes.data ?? []).map(adaptPrecursor);

  // ── 5. ResolveContext built with the SAME precursor list as computeSEE ──
  // Pre-fetch and compute must see the identical set, or a precursor absent from the pre-fetch
  // Map throws on lookup. This is the one invariant the harness proved end-to-end.
  const ctx = await makeResolveContext(supabase, precursors);

  // ── 6. Run the engine (computeSEE is the SINGLE source of truth for the figure) ──
  const attrEm = attributeDirect(streams);
  const result = computeSEE(attrEm, activityLevel, precursors, ctx, {
    annexIiDirectOnly,
    electricityConsumed,
    installationCountry,   // grid factor keys off the installation, not any precursor origin
  });

  return {
    process: process as ProcessRow,
    activityLevel,
    installationCountry,
    annexIiDirectOnly,
    electricityConsumed,
    streams,
    precursors,
    ctx,
    result,
  };
}
