/**
 * Monthly emissions — data load for the trends drill-down.
 * --------------------------------------------------------------------------
 * Reads ghg_monthly_emissions for a given company + reporting_year and buckets
 * the flat rows into per-month chart data (scope1/scope2/scope3 stacked).
 *
 * Mirrors loadSeries: browser singleton, getSession-gated, RLS-scoped, graceful
 * error. MUST be called from a 'use client' component (session-dependent).
 *
 * Monthly is concierge-first and inherently PARTIAL — a year may have zero rows
 * (manual-only inventory, or bills lacking dates). Callers must surface an empty
 * state, not a blank chart. measuredMonths tells the UI how many of 12 months
 * have real bill data (for the measured-vs-estimated note).
 */

import { supabase } from "../supabase";

export interface MonthlyRow {
  period_month: string;     // 'YYYY-MM-01'
  scope: number;            // 1 | 2
  fuel_type: string;
  tco2e: number;
  activity_value: number | null;
  activity_unit: string | null;
}

/** One bar in the monthly chart: a month with stacked scope totals. */
export interface MonthlyBucket {
  month: string;            // 'YYYY-MM' label
  monthLabel: string;       // 'Jan', 'Feb', ... for the axis
  scope1: number | null;
  scope2: number | null;
  scope3: number | null;
  total: number;
}

export interface LoadMonthlyResult {
  buckets: MonthlyBucket[];          // one per month that has data, ascending
  measuredMonths: number;            // distinct months with data (0-12)
  totalTco2e: number;                // sum across all buckets
  error: string | null;
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Pure: bucket flat monthly rows into per-month stacked chart data. */
export function buildMonthlyBuckets(rows: MonthlyRow[]): MonthlyBucket[] {
  const byMonth = new Map<string, { s1: number; s2: number; s3: number }>();
  for (const r of rows) {
    const key = r.period_month.slice(0, 7); // 'YYYY-MM'
    if (!byMonth.has(key)) byMonth.set(key, { s1: 0, s2: 0, s3: 0 });
    const b = byMonth.get(key)!;
    if (r.scope === 1) b.s1 += r.tco2e;
    else if (r.scope === 2) b.s2 += r.tco2e;
    else b.s3 += r.tco2e;
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => {
      const monthIdx = Number(key.slice(5, 7)) - 1;
      return {
        month: key,
        monthLabel: MONTH_LABELS[monthIdx] ?? key,
        // null (not 0) when a scope has nothing, so recharts draws no segment
        scope1: v.s1 > 0 ? +v.s1.toFixed(4) : null,
        scope2: v.s2 > 0 ? +v.s2.toFixed(4) : null,
        scope3: v.s3 > 0 ? +v.s3.toFixed(4) : null,
        total: +(v.s1 + v.s2 + v.s3).toFixed(4),
      };
    });
}

export async function loadMonthly(companyId: string, year: number): Promise<LoadMonthlyResult> {
  const empty = (error: string | null): LoadMonthlyResult => ({
    buckets: [], measuredMonths: 0, totalTco2e: 0, error,
  });

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return empty("Not signed in.");

    const { data, error } = await supabase
      .from("ghg_monthly_emissions")
      .select("period_month, scope, fuel_type, tco2e, activity_value, activity_unit")
      .eq("company_id", companyId)
      .eq("reporting_year", year)
      .order("period_month", { ascending: true });

    if (error) return empty(error.message);

    const rows = (data ?? []) as MonthlyRow[];
    const buckets = buildMonthlyBuckets(rows);
    const totalTco2e = +buckets.reduce((a, b) => a + b.total, 0).toFixed(4);

    return { buckets, measuredMonths: buckets.length, totalTco2e, error: null };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "Failed to load monthly data.");
  }
}
