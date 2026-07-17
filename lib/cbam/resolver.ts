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

  const defaults = new Map<string, number>();

  if (cnCodes.length > 0) {
    const { data, error } = await supabase
      .from('cbam_default_values')
      .select('cn_code, country, see_direct')
      .in('cn_code', cnCodes)
      .in('country', countries);

    // Fail loud. A failed fetch must not degrade into "no defaults found" — that would be
    // indistinguishable from a genuinely absent row and would surface as the wrong error.
    if (error) {
      throw new Error(`makeResolveContext: cbam_default_values fetch failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      defaults.set(keyOf(row.cn_code, row.country), Number(row.see_direct));
    }
  }

  return {
    isEuOrExempted: (country: string) => EU_AND_EXEMPTED.has((country || '').toUpperCase().trim()),

    // SEE_i for the DIRECT chain: returns see_direct, un-marked-up. See the report/README note —
    // the mark-up columns (markup_2026/2027/2028_plus) apply to see_TOTAL, so no marked-up direct
    // value exists in this table; applying one is a downstream declaration-layer decision, not this one.
    defaultLookup: (p: PrecursorInput): number => {
      const specific = defaults.get(keyOf(p.cnCode, p.originCountry));
      if (specific != null) return specific;

      const fallback = defaults.get(keyOf(p.cnCode, FALLBACK_COUNTRY));
      if (fallback != null) return fallback;

      // FAIL LOUD — never 0. A missing default is an unpriced precursor, not a free one.
      // Most likely cause: cn_code is a "see below" heading (7206, 7207, 7211, …) deliberately not
      // seeded, and must be resolved to its 8-digit child before lookup.
      throw new Error(
        `defaultLookup: no cbam_default_values row for cn_code "${p.cnCode}" ` +
        `(country "${p.originCountry}", nor fallback "${FALLBACK_COUNTRY}")`,
      );
    },

    hasValidVerifierReport: (_p: PrecursorInput) => false, // no verifier-report store exists yet (build step 9) — nothing can be verified, so everything falls loudly to default. Correct, not a placeholder.

    computeChildSEE: (p: PrecursorInput): number => {
      throw new Error(`computeChildSEE: computed_here recursion not implemented in MVP (precursor ${p.cnCode}). Scrap-EAF has no in-house CBAM precursors; this is Phase 2 (integrated plants).`);
    },
  };
}
