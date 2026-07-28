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
//   7. Resolve the published default for the good produced at the installation's country,
//      falling back to 'other', and compute TWO distinct deltas: a reasonableness delta
//      against the un-marked-up direct default, and an exposure delta against the marked-up
//      default for the reporting year.
//   8. Persist a cbam_see_records row and return it. Surface `unresolved` loudly.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed';
import { loadAndComputeProcess, ProcessLoadError } from '../../../../lib/cbam/loadProcess';
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

    // ── 2–6. Load, adapt, and compute (the shared spine — see lib/cbam/loadProcess.ts). ──
    // Steps 2 (load process), 3 (load streams/precursors/installation/category), 4 (adapt),
    // 5 (ResolveContext on the SAME precursor list), and 6 (computeSEE) live there so the report
    // route runs the IDENTICAL path. `precursors` and `result.resolutions` come from the one call
    // and are keyed by object identity — do not re-adapt or re-resolve them downstream (invariant 10).
    const { process, activityLevel, precursors, ctx, result, installationCountry } =
      await loadAndComputeProcess(supabase, processId);

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

    // ── 7. Compare against the published default for THIS good and THIS country ─────────
    // Two-step, mirroring lib/cbam/resolver.ts defaultLookup: exact (cn_code, country) then
    // the 'other' fallback. Do NOT collapse these into one filter — 'other' is a fallback,
    // not a default basis, and which one resolved is itself a reportable fact.
    //
    // COUNTRY IDENTITY, asserted deliberately: IR 2025/2621 Annex I keys defaults on the
    // good's country of ORIGIN. installationCountry is where the producing installation
    // sits. For a producing installation these are the same country. That identity is a
    // deliberate assertion, not an accident of what happened to be in scope — and the
    // country actually used is recorded in workings so a verifier can see which row the
    // figure came from rather than having to infer it.
    const DEFAULT_COMPARE_COLS = 'see_direct, see_total, markup_2026, markup_2027, markup_2028_plus';

    const { data: defCountry, error: defCountryErr } = await supabase
      .from('cbam_default_values')
      .select(DEFAULT_COMPARE_COLS)
      .eq('cn_code', process.cn_code)
      .eq('country', installationCountry)
      .maybeSingle();
    if (defCountryErr) {
      console.error('CBAM compute default-compare fetch error (country):', defCountryErr);
      return NextResponse.json({ error: 'Failed to load comparison default' }, { status: 500 });
    }

    let def = defCountry;
    let defaultBasisCountry: string | null = defCountry ? installationCountry : null;

    if (!def) {
      const { data: defOther, error: defOtherErr } = await supabase
        .from('cbam_default_values')
        .select(DEFAULT_COMPARE_COLS)
        .eq('cn_code', process.cn_code)
        .eq('country', 'other')
        .maybeSingle();
      if (defOtherErr) {
        console.error('CBAM compute default-compare fetch error (other):', defOtherErr);
        return NextResponse.json({ error: 'Failed to load comparison default' }, { status: 500 });
      }
      def = defOther;
      defaultBasisCountry = defOther ? 'other' : null;
    }

    // REASONABLENESS DELTA — against the UN-MARKED-UP direct default. This is the verifier's
    // question ("is this figure plausible against the published value?"), NOT the customer's
    // ("what would my importer face?"). The two have different denominators and can differ in
    // SIGN. Never relabel this one as a commercial figure.
    const defaultCompared: number | null = def ? Number(def.see_direct) : null;
    const deltaDirectVsDefault: number | null =
      defaultCompared == null ? null : result.direct - defaultCompared;

    // ── 7b. EXPOSURE DELTA — against the MARKED-UP default the importer actually faces ────
    // Mark-up schedule is per reporting year. reporting_period has a floor CHECK (>= 2026)
    // and NO ceiling, so the >= 2028 branch must be open-ended — markup_2028_plus carries
    // the tail by design. Do not write an exhaustive switch.
    const markupBasisYear: number = process.reporting_period;
    const markedUpDefault: number | null =
      def == null
        ? null
        : markupBasisYear <= 2026
          ? Number(def.markup_2026)
          : markupBasisYear === 2027
            ? Number(def.markup_2027)
            : Number(def.markup_2028_plus);

    // DIMENSIONAL GUARD. IR 2025/2621 mark-ups apply to see_TOTAL. For Annex II goods the
    // seed carries see_direct === see_total (8,250 of 8,251 rows), so the marked-up figure is
    // comparable to a direct SEE. Where they differ the good has a real indirect leg and the
    // certificate basis is direct+indirect — comparing a total-based mark-up against a direct
    // SEE would be dimensionally wrong. Fail loud rather than emit a mixed-basis number.
    const defaultIsDirectOnly: boolean =
      def != null && Number(def.see_direct) === Number(def.see_total);

    const exposure =
      def == null || markedUpDefault == null || Number.isNaN(markedUpDefault)
        ? { status: 'no_default_for_good' as const }
        : !defaultIsDirectOnly
          ? { status: 'not_determinable_mixed_basis' as const, basisYear: markupBasisYear }
          : {
              status: 'computed' as const,
              basisYear: markupBasisYear,
              markedUpDefault,
              delta: result.direct - markedUpDefault,
            };

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
      // Conditional, following the sefaBenchmark idiom above: when no default row resolves,
      // NOTHING is recorded — no partial block anyone could read a number out of.
      ...(defaultBasisCountry
        ? {
            defaultComparison: {
              source: 'IR 2025/2621 Annex I',
              methodVersion: 'country-keyed-v2 (2026-07-28)',
              installationCountry,
              countryUsed: defaultBasisCountry,
              countrySpecific: defaultBasisCountry !== 'other',
              seeDirectDefault: defaultCompared,
              deltaDirectVsDefault,
              exposure,
            },
          }
        : {}),
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
    if (error instanceof ProcessLoadError) {
      // Same status codes and strings the inline load/validate steps used to return directly.
      const status = error.code === 'not_found' ? 404 : error.code === 'invalid_input' ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('CBAM compute route error:', error);
    return NextResponse.json({ error: 'Compute failed' }, { status: 500 });
  }
}
