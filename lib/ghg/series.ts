/**
 * GHG multi-year series assembly
 * --------------------------------------------------------------------------
 * Groups a user's saved ghg_inventories rows by COMPANY (stable company_id) and
 * assembles a baseline-anchored, year-ordered emissions series. This is the
 * shared foundation for BOTH the trend view and the SBTi target-pathway view.
 *
 * Grouping key is company_id (the stable identity from the companies table),
 * NOT the free-text company_name — so a company's history can't be split by a
 * typo. company_name is carried only as a display label (taken from the most
 * recent year, in case the label was tidied over time).
 *
 * Pure & inert: takes already-loaded inventory rows, returns the series. No DB
 * calls. The data load embeds scope3_inventories(total_scope3_tco2e) per
 * inventory and maps it onto scope3_total before calling this.
 *
 * Design notes:
 *   - Headline total uses LOCATION-BASED Scope 2 (the inventory default, matching
 *     the engine and VSME); market-based is carried separately, not in the total.
 *   - Scope 3 is OPTIONAL (null when an inventory has no scope3_inventories row).
 *     Two totals are exposed: scope12Total (always available) and allScopesTotal
 *     (null until S3 exists) — so a consumer never silently reports partial-scope
 *     coverage as complete.
 *   - Baseline defaults to the earliest reporting year per company; override via
 *     opts.baselineYearByCompanyId when target-setting designates one.
 *   - gwpConsistent flags whether every year shares one GWP basis — a cross-year
 *     comparison across mixed bases (e.g. legacy AR4 + new AR6) is not valid.
 *   - Rows with a null company_id (pre-link / unlinked) are skipped — they can't
 *     be grouped by identity. Surface those separately in the UI if needed.
 */

/** Subset of a saved ghg_inventories row needed for the series. */
export interface InventoryRow {
  company_id: string | null;         // stable identity; null = unlinked (skipped)
  company_name: string;              // display label only
  reporting_year: number;
  scope1_total: number;
  scope2_location_total: number;
  scope2_market_total?: number | null;
  scope3_total?: number | null;      // mapped from scope3_inventories embed; null if none
  revenue_millions?: number | null;
  employee_count?: number | null;
  gwp_version?: string | null;
}

export interface SeriesYear {
  year: number;
  scope1: number;
  scope2Location: number;
  scope2Market: number | null;
  scope3: number | null;             // null when no Scope 3 record for this year
  /** Scope 1 + location-based Scope 2. Always available. */
  scope12Total: number;
  /** Scope 1 + 2 + 3. Null until Scope 3 exists for this year. */
  allScopesTotal: number | null;
  /** Intensities computed off scope12Total (the always-available basis). */
  perRevenue: number | null;         // tCO2e per $M revenue
  perFte: number | null;             // tCO2e per FTE
  /** Deltas vs baseline year and vs prior year, on scope12Total. */
  vsBaselinePct: number | null;
  yoyPct: number | null;
  gwpVersion: string | null;
}

export interface CompanySeries {
  companyId: string;
  company: string;                   // display label (latest year's name)
  baselineYear: number;
  baselineScope12Total: number;
  years: SeriesYear[];               // ascending by year
  /** True if every year shares one gwp_version — required for a valid comparison. */
  gwpConsistent: boolean;
}

const num = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : v;

/**
 * Assemble per-company multi-year series from a flat list of inventory rows.
 * Rows for different companies and years may be intermixed; they are grouped by
 * company_id and ordered here. Within a (company_id, year) the last row wins
 * (defensive against any accidental duplicate; the app enforces uniqueness on
 * save). Rows with a null company_id are skipped (no stable identity to group).
 */
export function buildCompanySeries(
  rows: InventoryRow[],
  opts?: { baselineYearByCompanyId?: Record<string, number> }
): CompanySeries[] {
  // group by company_id, dedupe to one row per year (last wins)
  const byCompany = new Map<string, Map<number, InventoryRow>>();
  for (const r of rows) {
    if (!r.company_id) continue; // unlinked rows can't be grouped by identity
    if (!byCompany.has(r.company_id)) byCompany.set(r.company_id, new Map());
    byCompany.get(r.company_id)!.set(r.reporting_year, r);
  }

  const result: CompanySeries[] = [];

  for (const [companyId, yearMap] of byCompany) {
    const ordered = [...yearMap.values()].sort(
      (a, b) => a.reporting_year - b.reporting_year
    );
    if (ordered.length === 0) continue;

    // display label from the most recent year (handles a tidied-up name)
    const company = ordered[ordered.length - 1].company_name;

    const baselineYear =
      opts?.baselineYearByCompanyId?.[companyId] ?? ordered[0].reporting_year;
    const baselineRow =
      ordered.find((r) => r.reporting_year === baselineYear) ?? ordered[0];
    const baselineScope12Total =
      baselineRow.scope1_total + baselineRow.scope2_location_total;

    const gwpConsistent =
      new Set(ordered.map((r) => r.gwp_version ?? "unknown")).size <= 1;

    const years: SeriesYear[] = ordered.map((r, i) => {
      const scope12Total = r.scope1_total + r.scope2_location_total;
      const scope3 = num(r.scope3_total);
      const allScopesTotal = scope3 === null ? null : scope12Total + scope3;

      const rev = num(r.revenue_millions);
      const fte = num(r.employee_count);
      const prev = i > 0 ? ordered[i - 1] : null;
      const prevTotal = prev
        ? prev.scope1_total + prev.scope2_location_total
        : null;

      return {
        year: r.reporting_year,
        scope1: r.scope1_total,
        scope2Location: r.scope2_location_total,
        scope2Market: num(r.scope2_market_total),
        scope3,
        scope12Total,
        allScopesTotal,
        perRevenue: rev && rev > 0 ? +(scope12Total / rev).toFixed(2) : null,
        perFte: fte && fte > 0 ? +(scope12Total / fte).toFixed(2) : null,
        vsBaselinePct:
          baselineScope12Total > 0
            ? +(((scope12Total - baselineScope12Total) / baselineScope12Total) * 100).toFixed(1)
            : null,
        yoyPct:
          prevTotal && prevTotal > 0
            ? +(((scope12Total - prevTotal) / prevTotal) * 100).toFixed(1)
            : null,
        gwpVersion: r.gwp_version ?? null,
      };
    });

    result.push({
      companyId,
      company,
      baselineYear,
      baselineScope12Total,
      years,
      gwpConsistent,
    });
  }

  // companies ordered by display name for stable output
  return result.sort((a, b) => a.company.localeCompare(b.company));
}
