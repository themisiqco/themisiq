// lib/cbam/resolver.ts
// DB-backed ResolveContext for the CBAM engine. Boundary layer — queries Supabase, so it lives
// here and NOT in engine.ts, which stays pure (no React, no Supabase, unit-testable in isolation).
//
// MVP scope (scrap-EAF): defaultLookup + isEuOrExempted are real; the other two encode correct
// current behavior — we cannot verify reports yet, and there are no in-house precursors.
//
// WHY THIS IS PRE-FETCHED. ResolveContext.defaultLookup is typed sync ((p) => number) because the
// engine calls it inside a synchronous reduce. Supabase queries are async. Rather than change the
// engine's interface, makeResolveContext is itself async: it fetches every default this run could
// need UP FRONT into a Map, then hands back a context whose defaultLookup is a pure sync Map read.
// The engine stays pure and sync; the awaiting happens once, here, at the boundary.
//
// cbam_default_values is public reference data (world-readable via a permissive RLS read policy for
// anon, authenticated — see 20260717_cbam_reference_grants_rls.sql), matching the mr_* tables —
// so an anon client suffices and reads go direct via .from(), no SECURITY DEFINER RPC. Following the
// mr_* convention the CALLER (route) owns the client and passes it in; that also keeps this testable.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrecursorInput, ResolveContext } from './types';
import { EU_AND_EXEMPTED } from './params';

// The country-agnostic fallback row seeded for every CN code (IR 2025/2621 Annex I,
// "Other Countries and Territories").
const FALLBACK_COUNTRY = 'other';

const keyOf = (cnCode: string, country: string) => `${cnCode}|${country}`;

// cbam_grid_factors also seeds an 'other' fallback row (IR 2025/2621 Annex II).
const GRID_FALLBACK = 'other';

/**
 * Build a ResolveContext backed by cbam_default_values.
 *
 * Pre-fetches the defaults for exactly the precursors passed in, so defaultLookup can stay sync.
 * Pass the SAME precursor array you hand to computeSEE — a precursor absent from this list has no
 * pre-fetched row and will throw on lookup rather than silently resolve.
 */
export async function makeResolveContext(
  supabase: SupabaseClient,
  precursors: PrecursorInput[],
): Promise<ResolveContext> {
  const cnCodes = [...new Set(precursors.map(p => p.cnCode))];
  const countries = [...new Set([...precursors.map(p => p.originCountry), FALLBACK_COUNTRY])];

  // BOTH legs now. see_indirect is null for most rows (Annex II goods) → treat null as 0.
  const defaults = new Map<string, { direct: number; indirect: number }>();

  if (cnCodes.length > 0) {
    const { data, error } = await supabase
      .from('cbam_default_values')
      .select('cn_code, country, see_direct, see_indirect')
      .in('cn_code', cnCodes)
      .in('country', countries);

    // Fail loud. A failed fetch must not degrade into "no defaults found" — that would be
    // indistinguishable from a genuinely absent row and would surface as the wrong error.
    if (error) {
      throw new Error(`makeResolveContext: cbam_default_values fetch failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      defaults.set(keyOf(row.cn_code, row.country), {
        direct: Number(row.see_direct),
        indirect: row.see_indirect == null ? 0 : Number(row.see_indirect),
      });
    }
  }

  // Grid factors are a small reference table — pre-fetch ALL rows so gridFactor() is a sync Map read,
  // same pattern as defaults. Keyed by installation country (the site drawing grid power).
  const gridFactors = new Map<string, number>();
  {
    const { data, error } = await supabase
      .from('cbam_grid_factors')
      .select('country_code, ef_co2e_mwh');
    if (error) {
      throw new Error(`makeResolveContext: cbam_grid_factors fetch failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      gridFactors.set(row.country_code, Number(row.ef_co2e_mwh));
    }
  }

  return {
    isEuOrExempted: (country: string) => EU_AND_EXEMPTED.has((country || '').toUpperCase().trim()),

    // SEE_i for BOTH legs: returns { direct, indirect }, un-marked-up. See the report/README note —
    // the mark-up columns (markup_2026/2027/2028_plus) apply to see_TOTAL, so no marked-up value
    // exists in this table; applying one is a downstream declaration-layer decision, not this one.
    // see_indirect is null for Annex II goods (already zeroed to 0 at pre-fetch) — a legitimate zero.
    defaultLookup: (p: PrecursorInput): { direct: number; indirect: number } => {
      // Keyed on (cn_code, country) only — NOT route. Correct per IR 2025/2621:
      //  defaults are per good/country; production route affects the 2620 benchmark
      //  (cbam_benchmarks), not the default value. See the 'cbam_default_values
      //  route-independence' design note in the spec. Do not add route here.
      const specific = defaults.get(keyOf(p.cnCode, p.originCountry));
      if (specific != null) return specific;

      const fallback = defaults.get(keyOf(p.cnCode, FALLBACK_COUNTRY));
      if (fallback != null) return fallback;

      // FAIL LOUD — never 0. A missing default is an unpriced precursor, not a free one.
      // Do NOT resolve a heading to a child code to make this succeed. §10.7 forbids
      // heading→child inference: children carry differing values (see the 7224 trap), and no
      // code anywhere performs it. A miss means this cn_code is absent from the seed at the
      // granularity supplied — which may be a "see below" heading (7206, 7207, 7211, …), an
      // unseeded sector, or simply a wrong code. The fix is a correct code from the customer's
      // customs paperwork, never a substituted or inferred one.
      throw new Error(
        `defaultLookup: no cbam_default_values row for cn_code "${p.cnCode}" ` +
        `(country "${p.originCountry}", nor fallback "${FALLBACK_COUNTRY}")`,
      );
    },

    // Grid emission factor for the installation's country (the site drawing grid power), 'other'
    // fallback. Exact match then fallback, un-normalized — same documented DB-match seam as
    // defaultLookup (country codes are stored canonical). FAIL LOUD if neither exists.
    gridFactor: (country: string): number => {
      const specific = gridFactors.get(country);
      if (specific != null) return specific;

      const fallback = gridFactors.get(GRID_FALLBACK);
      if (fallback != null) return fallback;

      throw new Error(
        `gridFactor: no cbam_grid_factors row for country "${country}", nor fallback "${GRID_FALLBACK}"`,
      );
    },

    hasValidVerifierReport: (_p: PrecursorInput) => false, // no verifier-report store exists yet (build step 9) — nothing can be verified, so everything falls loudly to default. Correct, not a placeholder.

    computeChildSEE: (p: PrecursorInput): { direct: number; indirect: number } => {
      throw new Error(`computeChildSEE: computed_here recursion not implemented in MVP (precursor ${p.cnCode}). Scrap-EAF has no in-house CBAM precursors; this is Phase 2 (integrated plants).`);
    },
  };
}
