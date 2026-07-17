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
import { attributeDirect, computeSEE, resolveSEE } from '../../../../lib/cbam/engine';
import { makeResolveContext } from '../../../../lib/cbam/resolver';
import { adaptSourceStream, adaptPrecursor } from '../../../../lib/cbam/adapt';

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
      .select('id, company_id, cn_code, category_code, activity_level, reporting_period')
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

    // ── 3. Load streams + precursors for this process ────────────────
    const [streamsRes, precursorsRes] = await Promise.all([
      supabase
        .from('cbam_source_streams')
        .select('stream_kind, activity_data, cc_mode, carbon_content, emission_factor, ncv, biomass_fraction')
        .eq('process_id', processId),
      supabase
        .from('cbam_precursor_inputs')
        .select('precursor_cn_code, precursor_category_code, mass_consumed, boundary, provenance, origin_country, see_value, verifier_report_id, reporting_period')
        .eq('process_id', processId),
    ]);

    if (streamsRes.error || precursorsRes.error) {
      console.error('CBAM compute load error:', streamsRes.error || precursorsRes.error);
      return NextResponse.json({ error: 'Failed to load process inputs' }, { status: 500 });
    }

    // ── 4. Adapt DB rows -> engine types (pinned mapping, testable) ──
    const streams = (streamsRes.data ?? []).map(adaptSourceStream);
    const precursors = (precursorsRes.data ?? []).map(adaptPrecursor);

    // ── 5. ResolveContext built with the SAME precursor list as computeSEE ──
    // Pre-fetch and compute must see the identical set, or a precursor absent from the pre-fetch
    // Map throws on lookup. This is the one invariant the harness proved end-to-end.
    const ctx = await makeResolveContext(supabase, precursors);

    // ── 6. Run the engine (computeSEE is the SINGLE source of truth for the figure) ──
    const attrEm = attributeDirect(streams);
    const result = computeSEE(attrEm, activityLevel, precursors, ctx);

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

    // ── Build a minimal, verifier-legible workings object ────────────
    // aeG + per-precursor m_i / see_i / provenance. see_i is re-derived via resolveSEE for DISPLAY
    // only — the persisted total comes from computeSEE above, never re-summed here.
    const workings = {
      aeG: result.aeG,
      precursorContribution: result.precursorContribution,
      precursors: precursors.map((p) => ({
        cnCode: p.cnCode,
        boundary: p.boundary,
        provenance: p.provenance,
        m_i: p.massConsumed / activityLevel,     // Eq 61
        see_i: resolveSEE(p, ctx).value,          // display value; matches what computeSEE used
        counted: p.boundary !== 'joint',          // 'joint' is already inside AttrEm — not re-added
      })),
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
