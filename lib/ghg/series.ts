import { factorEditionState } from "./factorEditions";
import type { FactorEditions, FactorEditionState } from "./factorEditions";

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
 *   - estimationConsistent flags whether every year is fully evidenced — comparing a
 *     partly-estimated baseline against a fully-evidenced year is not valid either.
 *     baselinePctEstimated carries the baseline year's estimated share for disclosure.
 *   - factorEditionState flags whether every year was priced by the SAME emission-factor
 *     editions. A UNION, not a fourth boolean beside the two above — 'we never recorded
 *     them' is a third answer, and it is the common one until the back catalogue is re-saved.
 *   - Rows with a null company_id (pre-link / unlinked) are skipped — they can't
 *     be grouped by identity. Surface those separately in the UI if needed.
 *
 * ⚠️ THIS FILE HAD NO IMPORTS AT ALL until factorEditionState landed, and that was worth
 * noticing before giving it one. The import is type-plus-two-pure-functions from
 * ./factorEditions, which reaches ./engine transitively — no React, no Supabase, no I/O, so
 * "pure & inert" above still holds. The alternative was a second copy of the edition
 * comparison living here, which is the drift this repo has already paid for twice
 * (jurisdictionOf in b3Energy.ts, and the duplicated FUEL_WORDS noted further down).
 */

/**
 * Whether a year's stored totals can be plotted as a figure.
 *
 * 'ok'           — the totals are complete and comparable.
 * 'excluded'     — the saved inventory RECORDS that one or more locations were left out (its
 *                  workings carry an `unpriceable` row). We know exactly what is missing and why,
 *                  and we know the stored total omits it. The figure is real but PARTIAL, which for
 *                  a trend is the same as unknown: a partial total plotted next to complete ones
 *                  reads as a reduction that did not happen.
 * 'unverifiable' — we cannot establish that the stored total is complete. Distinct from 'excluded'
 *                  on purpose: there, we know what was dropped; here, we do not know whether
 *                  anything was. Collapsing the two would let "we can't tell" be reported with the
 *                  confidence of "here is what's missing".
 *
 * Both suppress plotting. Neither is ever coerced to 0.
 */
export type YearDataStatus = 'ok' | 'excluded' | 'unverifiable'

/** One location the saved inventory recorded as left out, in the engine's own tokens. */
export interface YearExclusion {
  locationName: string
  fuel: string
  unit: string
  country: string
}

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
  pctEstimated?: number | null;     // share of S1+2 estimated (0-100); null = wholly manual / unknown
  /**
   * Which factor editions priced this year — `ghg_inventories.factor_editions`.
   * Absent or `{}` means UNRECORDED, not "no factors applied", and drives the whole series to
   * 'unknown'. Every inventory saved before 2026-08-13 is in that state and cannot be recovered.
   */
  factorEditions?: FactorEditions | null;
  /** Absent is treated as 'ok' — the loader is the one place that decides this, and it always sets it. */
  dataStatus?: YearDataStatus;
  exclusions?: YearExclusion[] | null;   // set when dataStatus === 'excluded'
  unverifiableReason?: string | null;    // set when dataStatus === 'unverifiable'
}

export interface SeriesYear {
  year: number;
  /**
   * EVERY figure below is null when dataStatus !== 'ok'. The year is still emitted — dropping it
   * would let a chart draw a straight line from the year before to the year after, which is a
   * claim about a year we cannot describe. Emitting it with nulls is what produces a GAP.
   *
   * scope3 is nulled too even though the exclusion only touches Scope 1 and 2: these stack into a
   * single bar, and a lone Scope 3 segment reads as a near-zero total rather than as missing data.
   */
  scope1: number | null;
  scope2Location: number | null;
  scope2Market: number | null;
  scope3: number | null;             // null when no Scope 3 record for this year
  /** Scope 1 + location-based Scope 2. Null when this year cannot be plotted. */
  scope12Total: number | null;
  /** Scope 1 + 2 + 3. Null until Scope 3 exists for this year. */
  allScopesTotal: number | null;
  /** Intensities computed off scope12Total (the always-available basis). */
  perRevenue: number | null;         // tCO2e per $M revenue
  perFte: number | null;             // tCO2e per FTE
  /** Deltas vs baseline year and vs prior year, on scope12Total. */
  vsBaselinePct: number | null;
  yoyPct: number | null;
  gwpVersion: string | null;
  /** Share of this year's S1+2 tCO2e that is estimated (0-100); null = wholly manual / unknown. */
  pctEstimated: number | null;
  /** Why this year is (or is not) plottable. 'ok' for every year that carries figures. */
  dataStatus: YearDataStatus;
  /** Populated only for 'excluded' — what the saved inventory recorded as left out. */
  exclusions: YearExclusion[] | null;
  /** Populated only for 'unverifiable' — why completeness could not be established. */
  unverifiableReason: string | null;
}

export interface CompanySeries {
  companyId: string;
  company: string;                   // display label (latest year's name)
  baselineYear: number;
  /**
   * Null when the baseline year itself cannot be plotted. Everything measured "vs baseline" then
   * has no basis, so every year's vsBaselinePct is null too — the comparison is not softened to a
   * best guess, it is withheld. A trajectory anchored to a partial baseline is wrong for every
   * later year, not just the baseline.
   */
  baselineScope12Total: number | null;
  years: SeriesYear[];               // ascending by year
  /** True if every year shares one gwp_version — required for a valid comparison. */
  gwpConsistent: boolean;
  /** Estimated share (0-100) of the baseline year's S1+2; null = wholly manual / unknown. */
  baselinePctEstimated: number | null;
  /**
   * True iff every year is fully evidenced (pctEstimated null or 0). Any year carrying
   * estimation → false. Mirrors gwpConsistent in spirit: comparing a partly-estimated year
   * against a fully-evidenced one is not a valid like-for-like comparison, just as comparing
   * across mixed GWP bases is not. SBTi permits estimation; it requires it be disclosed.
   */
  estimationConsistent: boolean;
  /** True if ANY year is 'excluded' or 'unverifiable'. Mirrors gwpConsistent: a flag the consumer
   *  must surface, not a reason to hide the series. */
  exclusionsPresent: boolean;
  /**
   * Whether the years being compared were priced by the same emission-factor editions.
   *
   * A UNION, NOT A FOURTH BOOLEAN — see factorEditionState's own comment for why, and for why
   * 'unknown' beats 'changed' when both apply. The three booleans above are the pattern this
   * deliberately does not extend: 'we cannot say' is a third answer, not a false.
   *
   * Rendered on the trends header (app/dashboard/ghg/trends/page.tsx), amber, alongside the
   * gwpConsistent span. SURFACED, NEVER GATED — a factor revision is a disclosure obligation, not a
   * reason to withhold a customer's own figures.
   */
  factorEditionState: FactorEditionState;
  /** True when the baseline year is plottable. False ⇒ baselineScope12Total and every
   *  vsBaselinePct are null, and a target must not be anchored here. */
  baselineUsable: boolean;
}

const num = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : v;

// ── Plain-language wording for an unplottable year ───────────────────────────────────────────────
// Lives here, not in either page, so the trend chart and the SBTi surface cannot describe the same
// year in two different ways. Pure string building — no rendering, no DOM.
//
// ⚠️ DUPLICATE WORD MAPS. app/dashboard/ghg/page.tsx has its own COUNTRY_WORDS / UNIT_WORDS /
// FUEL_WORDS for the wizard's own message. They should be collapsed onto these; that means editing
// the wizard, which is outside this change. Until then, a unit added to one must be added to both.
//
// COUNTRY_WORDS and FUEL_WORDS are EXPORTED because lib/ghg/comparability.ts needs the same words
// for its structural observations. Importing them is deliberate: a third copy is what this comment
// is already warning about, and two surfaces naming the same country two ways in front of a
// verifier is the defect these maps exist to prevent.
export const COUNTRY_WORDS: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "the UK", UK: "the UK", AU: "Australia", NZ: "New Zealand",
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia",
  DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France", DE: "Germany", EL: "Greece",
  HU: "Hungary", IE: "Ireland", IT: "Italy", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg",
  MT: "Malta", NL: "the Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia",
  SI: "Slovenia", ES: "Spain", SE: "Sweden",
};
const UNIT_WORDS: Record<string, string> = {
  m3: "cubic metres", kwh: "kilowatt-hours", mcf: "thousand cubic feet", therms: "therms",
  mmbtu: "MMBtu", gj: "gigajoules", litres: "litres", gallons: "US gallons", kg: "kilograms",
};
export const FUEL_WORDS: Record<string, string> = {
  natural_gas: "gas", propane: "propane", diesel: "diesel", diesel_mobile: "vehicle diesel",
  gasoline: "petrol", fuel_oil_distillate: "heating oil", fuel_oil_residual: "heavy fuel oil",
};

/**
 * One sentence saying why a year carries no figures, or null when it does.
 *
 * 'excluded' and 'unverifiable' deliberately read differently. The first states what is missing;
 * the second states that we do not know whether anything is. Writing them the same way would give
 * "we can't tell" the confidence of "here is what's missing".
 */
export function describeYearStatus(y: SeriesYear): string | null {
  if (y.dataStatus === "ok") return null;

  if (y.dataStatus === "excluded") {
    const ex = y.exclusions ?? [];
    const detail = ex
      .map((e) => {
        const country = COUNTRY_WORDS[e.country] ?? (e.country === "(unset)" ? "no country" : e.country);
        const unit = UNIT_WORDS[e.unit] ?? e.unit;
        const fuel = FUEL_WORDS[e.fuel] ?? e.fuel.replace(/_/g, " ");
        return `${e.locationName} — its ${fuel} figure is in ${unit}, which we can't work out for ${country}`;
      })
      .join("; ");
    const n = ex.length;
    return `${y.year} isn't shown: ${n} location${n === 1 ? " was" : "s were"} left out of that year's figures${detail ? ` (${detail})` : ""}. The rest of that year was measured normally, but a total missing a site can't be compared with one that isn't.`;
  }

  return `${y.year} isn't shown: we can't confirm its figures are complete${y.unverifiableReason ? ` — ${y.unverifiableReason}` : ""}. We'd rather leave a gap than plot a number we can't stand behind.`;
}

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

    // Absent status = 'ok'. The loader always sets it; the default keeps hand-built rows (tests,
    // callers constructing InventoryRow directly) working unchanged.
    const statusOf = (r: InventoryRow): YearDataStatus => r.dataStatus ?? "ok";

    const baselineYear =
      opts?.baselineYearByCompanyId?.[companyId] ?? ordered[0].reporting_year;
    const baselineRow =
      ordered.find((r) => r.reporting_year === baselineYear) ?? ordered[0];
    const baselineUsable = statusOf(baselineRow) === "ok";
    const baselineScope12Total = baselineUsable
      ? baselineRow.scope1_total + baselineRow.scope2_location_total
      : null;

    const gwpConsistent =
      new Set(ordered.map((r) => r.gwp_version ?? "unknown")).size <= 1;

    // estimationConsistent mirrors gwpConsistent: true iff every year is fully evidenced
    // (pctEstimated null or 0). Any estimated year → false. Comparing a 25%-estimated baseline
    // against a fully-evidenced current year is no more valid than comparing across GWP bases.
    const estimationConsistent = ordered.every(
      (r) => r.pctEstimated == null || r.pctEstimated === 0
    );
    const baselinePctEstimated = num(baselineRow.pctEstimated);

    const years: SeriesYear[] = ordered.map((r, i) => {
      const status = statusOf(r);

      // A year that cannot be plotted is emitted with every figure null — present in the array so
      // the gap is visible, carrying nothing a consumer could mistake for a measurement. Its
      // reason travels with it so the note can name what happened without a second lookup.
      if (status !== "ok") {
        return {
          year: r.reporting_year,
          scope1: null,
          scope2Location: null,
          scope2Market: null,
          scope3: null,
          scope12Total: null,
          allScopesTotal: null,
          perRevenue: null,
          perFte: null,
          vsBaselinePct: null,
          yoyPct: null,
          gwpVersion: r.gwp_version ?? null,
          pctEstimated: num(r.pctEstimated),
          dataStatus: status,
          exclusions: status === "excluded" ? r.exclusions ?? [] : null,
          unverifiableReason: status === "unverifiable" ? r.unverifiableReason ?? null : null,
        };
      }

      const scope12Total = r.scope1_total + r.scope2_location_total;
      const scope3 = num(r.scope3_total);
      const allScopesTotal = scope3 === null ? null : scope12Total + scope3;

      const rev = num(r.revenue_millions);
      const fte = num(r.employee_count);
      // Year-on-year needs BOTH ends. When the prior year is unplottable there is no change to
      // state — reaching further back for the last known year would silently compare across a gap
      // and label a multi-year movement as one year's.
      const prev = i > 0 ? ordered[i - 1] : null;
      const prevTotal =
        prev && statusOf(prev) === "ok"
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
        // Null for EVERY year when the baseline itself is unplottable — see baselineScope12Total.
        vsBaselinePct:
          baselineScope12Total != null && baselineScope12Total > 0
            ? +(((scope12Total - baselineScope12Total) / baselineScope12Total) * 100).toFixed(1)
            : null,
        yoyPct:
          prevTotal && prevTotal > 0
            ? +(((scope12Total - prevTotal) / prevTotal) * 100).toFixed(1)
            : null,
        gwpVersion: r.gwp_version ?? null,
        pctEstimated: num(r.pctEstimated),
        dataStatus: "ok" as const,
        exclusions: null,
        unverifiableReason: null,
      };
    });

    result.push({
      companyId,
      company,
      baselineYear,
      baselineScope12Total,
      years,
      gwpConsistent,
      baselinePctEstimated,
      estimationConsistent,
      exclusionsPresent: years.some((y) => y.dataStatus !== "ok"),
      // EVERY year, including unplottable ones. An excluded year was still priced by some edition,
      // and if that edition is unrecorded the series genuinely cannot be confirmed on one basis —
      // filtering to plottable years would let a gap in the record hide behind a gap in the data.
      factorEditionState: factorEditionState(ordered.map((r) => r.factorEditions)),
      baselineUsable,
    });
  }

  // companies ordered by display name for stable output
  return result.sort((a, b) => a.company.localeCompare(b.company));
}
