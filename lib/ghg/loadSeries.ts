/**
 * GHG multi-year series — data load
 * --------------------------------------------------------------------------
 * Fetches the user's saved inventories (with their Scope 3 record embedded),
 * maps them to InventoryRow[], and hands off to buildCompanySeries (pure).
 *
 * DB I/O lives here; series.ts stays pure. Uses the browser supabase singleton,
 * which carries the user's auth session — so reads run under RLS (owner-scoped).
 * MUST be called from a 'use client' component (the trends page); a Server
 * Component would have no session and RLS would filter everything out.
 *
 * Scope 3 embed: scope3_inventories is embedded from ghg_inventories. Because
 * the embed direction is reverse (child) and PostgREST cardinality detection
 * isn't guaranteed across versions, we unwrap object-OR-array defensively.
 * No Scope 3 row -> scope3_total null -> buildCompanySeries leaves allScopesTotal
 * null for that year (never reports partial coverage as complete).
 */

import { supabase } from "../supabase";
import { buildCompanySeries, type InventoryRow, type CompanySeries } from "./series";

export interface LoadSeriesResult {
  series: CompanySeries[];
  /** Inventories dropped because they have no company_id (pre-link/unlinked). */
  skippedUnlinked: number;
  /**
   * Inventories dropped because scope1_total OR scope2_location_total is NULL.
   * A null total is an ABSENCE ("no figure for this scope"), not zero — coercing
   * it to 0 would let it anchor a trajectory as if a real measurement said zero.
   */
  skippedNoTotals: number;
  /** Set when the load failed (auth, embed/FK missing, network). series is []. */
  error: string | null;
}

/** Shape of a raw row back from the embedded select (loosely typed). */
interface RawRow {
  company_id: string | null;
  company_name: string | null;
  reporting_year: number;
  scope1_total: number | null;
  scope2_location_total: number | null;
  scope2_market_total: number | null;
  revenue_millions: number | null;
  employee_count: number | null;
  gwp_version: string | null;
  pct_estimated: number | null;
  // reverse embed: object when to-one detected, array otherwise, null when none
  scope3_inventories:
    | { total_scope3_tco2e: number | null }
    | { total_scope3_tco2e: number | null }[]
    | null;
}

const SELECT =
  "company_id, company_name, reporting_year, scope1_total, scope2_location_total, " +
  "scope2_market_total, revenue_millions, employee_count, gwp_version, pct_estimated, " +
  "scope3_inventories(total_scope3_tco2e)";

export async function loadCompanySeries(): Promise<LoadSeriesResult> {
  const empty = (error: string | null): LoadSeriesResult => ({
    series: [],
    skippedUnlinked: 0,
    skippedNoTotals: 0,
    error,
  });

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return empty("Not signed in.");

    const { data, error } = await supabase
      .from("ghg_inventories")
      .select(SELECT)
      .order("reporting_year", { ascending: true });

    if (error) {
      // PGRST200 = embed/FK not found; surface gracefully rather than throwing
      return empty(error.message);
    }
    const rows = (data ?? []) as unknown as RawRow[];

    let skippedUnlinked = 0;
    let skippedNoTotals = 0;
    const mapped: InventoryRow[] = [];
    for (const r of rows) {
      // A NULL Scope 1 OR Scope 2 total is an ABSENCE, not zero. Skip the row entirely rather than
      // coerce ?? 0 — a coerced zero would enter the series as a real figure and anchor a trajectory.
      if (r.scope1_total == null || r.scope2_location_total == null) {
        skippedNoTotals++;
        continue;
      }
      if (!r.company_id) skippedUnlinked++;
      // unwrap the Scope 3 embed: object OR array OR null
      const s3 = Array.isArray(r.scope3_inventories)
        ? r.scope3_inventories[0]
        : r.scope3_inventories;
      mapped.push({
        company_id: r.company_id,
        company_name: r.company_name ?? "",
        reporting_year: r.reporting_year,
        scope1_total: r.scope1_total,
        scope2_location_total: r.scope2_location_total,
        scope2_market_total: r.scope2_market_total,
        scope3_total: s3?.total_scope3_tco2e ?? null,
        revenue_millions: r.revenue_millions,
        employee_count: r.employee_count,
        gwp_version: r.gwp_version,
        pctEstimated: r.pct_estimated, // map straight through; null = wholly manual, NOT 0
      });
    }

    return {
      series: buildCompanySeries(mapped),
      skippedUnlinked,
      skippedNoTotals,
      error: null,
    };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "Failed to load series.");
  }
}
