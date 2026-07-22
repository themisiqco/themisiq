// app/api/cbam/compute/route.ts
// ThemisIQ — CBAM compute API route. Wraps the proven engine stack (see scripts/cbam-harness.ts)
// in a real, authenticated, RLS-scoped route that loads a customer's process from the DB, runs the
// engine, and persists a see_record.
//
// Flow (matches the house pattern — POST, try/catch, NextResponse.json({error},{status})):
//   1. Authenticate as the user (RLS applies as this user — NOT the anon client; these are
//      per-customer, RLS-protected tables).
//   2. Load the cbam_production_processes row (RLS scopes to the owner).
//   3. Load its source streams and precursor inputs.
//   4. Adapt DB rows -> engine types via the pinned adapters (lib/cbam/adapt.ts).
//   5. Build the ResolveContext with the SAME precursor list handed to computeSEE (pre-fetch and
//      compute MUST see the same set, or a precursor throws on lookup).
//   6. attributeDirect -> computeSEE (the SINGLE source of truth for the figure).
//   7. Compare against the country-agnostic default for the good produced (country 'other', MVP).
//   8. Persist a cbam_see_records row and return it. Surface `unresolved` loudly.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed';
import { attributeDirect, computeSEE } from '../../../../lib/cbam/engine';
import { makeResolveContext } from '../../../../lib/cbam/resolver';
import { adaptSourceStream, adaptPrecursor } from '../../../../lib/cbam/adapt';
import { computeSefaPersist } from '../../../../lib/cbam/sefaCompute';
import { computeDefaultShare } from '../../../../lib/cbam/defaultShare';
import type { BenchmarkRow } from '../../../../lib/cbam/benchmarks';

export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate as the user ──────────────────────────────────
    const token = bearerFrom(req);
    const { supabase } = await getAuthedClient(token);

    // ── Parse & validate input ───────────────────────────────────────
    const body = await req.json();
    const processId = typeof body.process_id === 'string' ? body.process_id.trim() : '';
    if (!processId) {
      return NextResponse.json({ error: 'process_id is required' }, { status: 400 });
    }

    // ── 2. Load the process (RLS scopes to the owner) ────────────────
    const { data: process, error: procErr } = await supabase
      .from('cbam_production_processes')
      .select('id, company_id, cn_code, category_code, activity_level, reporting_period, installation_id, electricity_consumed, steel_grade, route_code')
      .eq('id', processId)
      .single();

    if (procErr || !process) {
      // Not found OR not owned by this user — RLS makes those indistinguishable, which is correct.
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    const activityLevel = Number(process.activity_level);
    if (!(activityLevel > 0)) {
      return NextResponse.json({ error: 'Process activity_level must be > 0' }, { status: 400 });
    }
    if (!process.cn_code) {
      return NextResponse.json({ error: 'Process is missing cn_code (the good produced)' }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to load process inputs' }, { status: 500 });
    }
    if (installationRes.error || !installationRes.data || categoryRes.error || !categoryRes.data) {
      console.error('CBAM compute indirect-input load error:', installationRes.error || categoryRes.error);
      return NextResponse.json({ error: 'Failed to load installation/category for indirect calc' }, { status: 500 });
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

    // ── 6b. Default-value share (§1.2 item 4(b) / §1.1 15(d)), per leg ─────────────────────────
    // Consumes computeSEE's OWN resolutions map — NOT a re-resolution. If the precursor list and
    // that map ever disagreed, computeDefaultShare's divergence guard would throw; passing the same
    // `result.resolutions` is precisely what guarantees the share and the SEE cannot diverge.
    // Either leg is null when its denominator (that leg's embedded emissions) is zero — that null is
    // "undefined share", not "no defaults used", and MUST be persisted as null, never coerced to 0.
    const defaultShare = computeDefaultShare(
      precursors,
      result.resolutions,
      activityLevel,
      { direct: result.direct, indirect: result.indirect },
    );

    // ── 7. Compare against the default for the good produced (country 'other', MVP) ──
    const { data: def, error: defErr } = await supabase
      .from('cbam_default_values')
      .select('see_direct')
      .eq('cn_code', process.cn_code)
      .eq('country', 'other')
      .maybeSingle();
    if (defErr) {
      console.error('CBAM compute default-compare fetch error:', defErr);
      return NextResponse.json({ error: 'Failed to load comparison default' }, { status: 500 });
    }
    const defaultCompared: number | null = def ? Number(def.see_direct) : null;
    // Direct-to-direct: cbam_default_values.see_direct is a direct-only default, so compare it
    // against the direct SEE, not the direct+indirect sum.
    const deltaDirectVsDefault: number | null =
      defaultCompared == null ? null : result.direct - defaultCompared;

    // ── 7b. SEFA — specific embedded free allocation (§1.2 item 4(e)) ─────────────────────────
    // Load the year's cbam_sefa_params (CBAM_y, CSCF_y). computeSefaPersist owns the ordering:
    // a missing row throws (no CBAM factor → not computable), a null CSCF short-circuits to the
    // pending status WITHOUT fetching benchmarks (the live path for every year), and only a
    // published CSCF triggers the benchmark lookup + Eq 2/4/6 compute.
    const { data: sefaParams, error: sefaParamsErr } = await supabase
      .from('cbam_sefa_params')
      .select('cbam_factor, cscf, cscf_status')
      .eq('year', process.reporting_period)
      .maybeSingle();
    if (sefaParamsErr) {
      console.error('CBAM SEFA params load error:', sefaParamsErr);
      return NextResponse.json({ error: 'Failed to load SEFA parameters' }, { status: 500 });
    }

    const sefaPersist = await computeSefaPersist({
      params: sefaParams,   // null when no row for the year → computeSefaPersist throws (genuine error)
      cnCode: process.cn_code,
      steelGrade: process.steel_grade,
      routeCode: process.route_code,
      reportingPeriod: process.reporting_period,
      precursors,
      activityLevel,
      isEuOrExempted: ctx.isEuOrExempted,
      // Lazy — only invoked on the computed path. Fetch benchmark rows for the process cn_code AND
      // every precursor cn_code (Column B lookups need the precursor rows).
      fetchBenchmarks: async () => {
        const cnCodes = [...new Set([process.cn_code, ...precursors.map((p) => p.cnCode)])];
        const { data, error } = await supabase
          .from('cbam_benchmarks')
          .select('cn_code, bm_column, route_indicator, period_band, value')
          .in('cn_code', cnCodes);
        if (error) throw new Error(`cbam_benchmarks fetch failed: ${error.message}`);
        return (data ?? []) as BenchmarkRow[];
      },
    });

    // ── Build a minimal, verifier-legible workings object ────────────
    // aeG + per-precursor m_i / see_i / provenance. see_i values are READ from computeSEE's own
    // resolutions map — never re-resolved here, so display cannot drift from the persisted figure.
    // A precursor with boundary === 'joint' is legitimately absent from that map (it is already
    // inside AttrEm); it carries null see_i legs — absence of a resolution is not a value, and must
    // never be coerced to 0 or recomputed.
    // When SEFA is computed, the benchmark used goes into the same jsonb (§1.2 item 4(f)); when
    // pending, nothing is recorded — no "would-be" benchmark someone could multiply into a wrong number.
    const workings = {
      aeG: result.aeG,
      precursorContribution: result.precursorContribution,
      precursors: precursors.map((p) => {
        const r = result.resolutions.get(p);      // computeSEE's own resolution; absent for 'joint'
        return {
          cnCode: p.cnCode,
          boundary: p.boundary,
          provenance: p.provenance,
          m_i: p.massConsumed / activityLevel,    // Eq 61
          see_i_direct: r?.direct ?? null,        // both legs, per the direct/indirect split; null when 'joint'
          see_i_indirect: r?.indirect ?? null,
          source: r?.source ?? null,              // PrecursorSource provenance discriminant; null when 'joint'
          counted: p.boundary !== 'joint',        // 'joint' is already inside AttrEm — not re-added
        };
      }),
      ...(sefaPersist.benchmarkWorkings ? { sefaBenchmark: sefaPersist.benchmarkWorkings } : {}),
    };

    // ── 8. Persist the see_record (RLS WITH CHECK enforces company ownership) ──
    const { data: saved, error: saveErr } = await supabase
      .from('cbam_see_records')
      .insert({
        process_id: process.id,
        company_id: process.company_id,
        cn_code: process.cn_code,
        see_direct: result.direct,
        see_indirect: result.indirect,
        see_total: result.direct + result.indirect,   // derived sum — the one legitimate merge point
        ae_g: result.aeG,
        precursor_contribution: result.precursorContribution,
        default_compared: defaultCompared,
        delta_vs_default: deltaDirectVsDefault,
        default_share_direct: defaultShare.direct,      // null = zero denominator, persisted AS null
        default_share_indirect: defaultShare.indirect,
        sefa: sefaPersist.sefa,
        sfa_proc: sefaPersist.sfa_proc,
        sefa_precursor_contrib: sefaPersist.sefa_precursor_contrib,
        sefa_status: sefaPersist.sefa_status,
        workings,
        unresolved: result.unresolved,
      })
      .select('*')
      .single();

    if (saveErr || !saved) {
      console.error('CBAM compute save error:', saveErr);
      return NextResponse.json({ error: 'Failed to save see_record' }, { status: 500 });
    }

    // ── Surface unresolved LOUDLY — a non-empty array means one or more precursors fell to the
    //    default because a verifier report was missing/invalid. Never bury this. ──
    const hasUnresolved = result.unresolved.length > 0;
    return NextResponse.json({
      success: true,
      see_record: saved,
      unresolved: result.unresolved,
      hasUnresolved,
      warning: hasUnresolved
        ? 'One or more precursors could not be resolved to an actual value and fell back to a default. Review `unresolved` — the figure is defensible but not fully evidenced.'
        : undefined,
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('CBAM compute route error:', error);
    return NextResponse.json({ error: 'Compute failed' }, { status: 500 });
  }
}
