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
import {
  buildCompanySeries,
  type InventoryRow,
  type CompanySeries,
  type YearDataStatus,
  type YearExclusion,
} from "./series";
import { findUnpriceableLocations, type Location } from "./engine";
import type { FactorEditions } from "./factorEditions";
import { anyPublishedFactorApplied } from "./factorEditions";
import type { PricedRowProbe } from "./factorEditions";

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

// ── Completeness of a stored year ────────────────────────────────────────────────────────────────
// A saved total can be EXCLUSION-BEARING: the engine leaves out any location whose fuel unit has no
// published factor for its country, so scope1_total may be a real number that omits a site. Read
// unqualified, that plots as a reduction the company never achieved.
//
// TWO SOURCES, in this order, because neither alone is sufficient:
//
//   1. workings — the authoritative record. A saved inventory carries one `declaration:
//      'unpriceable'` row per excluded location. When it is there we know exactly what the stored
//      total omits, and why. → 'excluded'.
//
//   2. locations_data — re-derived. Inventories saved before the exclusion existed CANNOT carry the
//      marker, so its absence is not evidence of completeness. locations_data is stored on the same
//      row and findUnpriceableLocations is pure, so priceability is recomputable for any row, old or
//      new — no backfill. But a recomputed hit on a marker-less row does NOT tell us what the stored
//      total did with that location, only that it cannot be priced TODAY. That is 'unverifiable',
//      not 'excluded': we would be guessing at the stored figure's composition.
//
// Recomputation runs against today's factor tables while the stored total was computed against the
// tables of its day. That divergence can only move a year INTO 'unverifiable', never out of it —
// it withholds a year rather than plotting it wrongly.
//
// A row we cannot evaluate at all (locations_data absent or not an array) is 'unverifiable'. It is
// never assumed complete.

/** The shape of the workings rows this file cares about; everything else passes through. */
interface WorkingsRow {
  location?: string;
  declaration?: string;
  unpriceable?: { fuel?: string; unit?: string; country?: string };
}

export interface Completeness {
  dataStatus: YearDataStatus;
  exclusions: YearExclusion[] | null;
  unverifiableReason: string | null;
}

// EXPORTED for a second consumer: the GHG wizard's comparability step, which loads the prior year's
// row directly and needs the same verdict on it. Exported rather than copied for the obvious reason
// — two implementations of "is this stored total complete" would eventually disagree, and the one
// that drifted would be the one qualifying a figure in front of a verifier.
//
// The wizard deliberately does NOT call loadCompanySeries for this: that function drops rows with a
// null total or a null company_id, and a dropped row is indistinguishable from an absent one. The
// whole point of the comparability step is to tell "no prior year" apart from "a prior year we
// cannot describe", so it fetches its one row itself and brings it here for the verdict.
export function assessCompleteness(workings: unknown, locationsData: unknown): Completeness {
  // 1. The recorded marker wins — it describes the stored total, which is what we are qualifying.
  if (Array.isArray(workings)) {
    const marked = (workings as WorkingsRow[]).filter((w) => w?.declaration === "unpriceable");
    if (marked.length > 0) {
      return {
        dataStatus: "excluded",
        exclusions: marked.map((w) => ({
          locationName: w.location ?? "Location",
          fuel: w.unpriceable?.fuel ?? "",
          unit: w.unpriceable?.unit ?? "",
          country: w.unpriceable?.country ?? "",
        })),
        unverifiableReason: null,
      };
    }
  }

  // 2. No marker. Establish completeness from the stored locations, or admit we cannot.
  if (!Array.isArray(locationsData) || locationsData.length === 0) {
    return {
      dataStatus: "unverifiable",
      exclusions: null,
      unverifiableReason: "this year's saved inventory has no location detail to check against",
    };
  }
  try {
    const unpriceable = findUnpriceableLocations(locationsData as Location[]);
    if (unpriceable.length > 0) {
      const names = unpriceable.map((u) => u.locName).join(", ");
      return {
        dataStatus: "unverifiable",
        exclusions: null,
        unverifiableReason: `${unpriceable.length} location${unpriceable.length > 1 ? "s" : ""} in this year's inventory (${names}) can no longer be worked out, and this year was saved before we started recording that — so we can't tell whether its figures include them`,
      };
    }
  } catch {
    // findUnpriceableLocations re-throws anything that is not a pricing refusal. A malformed
    // stored location lands here: unknown, never assumed complete.
    return {
      dataStatus: "unverifiable",
      exclusions: null,
      unverifiableReason: "this year's saved location detail could not be read",
    };
  }
  return { dataStatus: "ok", exclusions: null, unverifiableReason: null };
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
  // jsonb, `not null default '{}'` on the table — but typed nullable here anyway, because a row
  // written before 2026-08-13 predates the column and PostgREST is not the only thing that could
  // hand us an absent key.
  factor_editions: FactorEditions | null;
  // reverse embed: object when to-one detected, array otherwise, null when none
  scope3_inventories:
    | { total_scope3_tco2e: number | null }
    | { total_scope3_tco2e: number | null }[]
    | null;
  // Both jsonb. Needed to qualify the totals above — see assessCompleteness.
  workings: unknown;
  locations_data: unknown;
}

// ⚠️ workings and locations_data are FULL jsonb columns, and the larger ones on this table.
// PostgREST cannot select inside a jsonb array, so there is no narrower projection available. They
// are here because the numeric totals alone cannot be trusted without them — the payload cost buys
// the difference between a plotted figure and a plotted guess.
const SELECT =
  "company_id, company_name, reporting_year, scope1_total, scope2_location_total, " +
  "scope2_market_total, revenue_millions, employee_count, gwp_version, pct_estimated, " +
  // Small (one object, a handful of short strings) and NOT derivable from anything else selected
  // here: workings carries factor_vintage per grid row but nothing for combustion editions, and only
  // for inventories saved since the provenance pass.
  "factor_editions, " +
  "workings, locations_data, " +
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
      const completeness = assessCompleteness(r.workings, r.locations_data);
      mapped.push({
        ...completeness,
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
        // Straight through, INCLUDING the empty object. `?? {}` here rather than a default further
        // in: an inventory saved before the column existed reads as {} and must stay
        // distinguishable from one whose editions were recorded — it drives the series to 'unknown'.
        factorEditions: r.factor_editions ?? {},
        // Derived from the SAME saved workings this row already carries, so the flag and the map
        // describe one calculation. Not recomputed from locations_data: that would make the series
        // depend on deploy time rather than on what was saved.
        anyPublishedFactor: anyPublishedFactorApplied(r.workings as PricedRowProbe[] | null),
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
