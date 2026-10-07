/**
 * Monthly emissions compute — PURE, INERT (concierge-first)
 * --------------------------------------------------------------------------
 * Turns an inventory's CONFIRMED, DATED concierge bills into per-month emission
 * slices, by calling the SAME factor functions the annual engine uses
 * (calcGas / pickEF / getGridFactor) once per bill, then prorating each bill's
 * tCO2e across the months it spans by day-fraction.
 *
 * NO DB. NO writes. The annual engine is NOT modified — this module mirrors the
 * (docType, fuelType) -> (EF key, scope) mapping rather than sharing it, so the
 * annual output can never change. Caller passes the live factor fns in (so we
 * don't duplicate the factor tables): see MonthlyDeps.
 *
 * Concierge extracts only: electricity, natural_gas, diesel, propane, gasoline.
 * No fuel oil / steam / refrigerant (manual-only) -> those produce no monthly
 * rows.
 *
 * MONTHLY IS EVIDENCED-ONLY, BY DESIGN. A monthly slice carries a DATE, so it may
 * only represent consumption a bill actually supports. When an annual figure is
 * grossed up for a coverage gap (e.g. 9 bills × 12/9), monthly does NOT mirror the
 * gross-up: distributing an estimated quantity across the uncovered months and
 * stamping it Oct/Nov/Dec would assert consumption no bill supports — fabrication
 * with a timestamp. So on a 9/12 inventory monthly sums to 9/12 of annual. That
 * divergence is CORRECT and is exactly what `reconcile` (below) models and explains.
 *
 * READS COUNTED CONTRIBUTIONS, IN-WINDOW ONLY (T6). Each slice comes from a bill the annual engine
 * counts (billContributions: confirmed, dated, in the reporting window, not excluded as the same bill as
 * another, not mixed units), and only the days of that bill INSIDE the reporting window are split into
 * months. A bill outside the year, or the part of a straddling bill outside it, writes nothing. So for
 * every location and fuel:
 *   Σ slices = Σ counted contributions = the annual figure before the gap gross-up,
 * and `reconcile` below checks exactly that, explaining any remaining difference by the gross-up.
 *
 * Uncounted bills write nothing; each is reported in `skipped` with its reason (a pending proposal is not
 * reported: it is not yet a bill). A confirmed proposal with no value is reported too. A bill whose unit
 * has no factor is skipped and reported, never computed with a guessed factor.
 */

import {
  parseLocalDate, countryRefusal, billContributions, acceptedResolutions, periodFromYearAndEnd,
  deriveLocations, unpricedLines, emissionsByLocationField, streamSwitchOff,
} from "./engine";
import type { CoverageResolution, Location } from "./engine";

/** The inventory fields the monthly split and the reconciliation read. */
export interface MonthlyInventory {
  locations: Location[];
  reporting_year: number;
  fiscal_year_end_month?: number;
  coverage_resolutions?: CoverageResolution[];
}

export type GwpVersion = "AR4" | "AR5" | "AR6";

export interface EFFactor { co2: number; ch4: number; n2o: number }

/** Live factor functions, passed in from the page so we reuse the real tables. */
export interface MonthlyDeps {
  calcGas: (ef: EFFactor, amount: number, gwp: GwpVersion, biogenic?: boolean) => { total: number };
  // FI2: the engine's pickEF, which returns the value with the table that supplied it; this module prices the value.
  pickEF: (loc: any, key: any) => { factor: EFFactor };   // accept caller's Location + literal-union key
  getGridFactor: (region: string, year: number) => { ef: number; usedRegion: string; usedYear: number };
  // True iff region is a real GRID_EF key. Unresolved grid regions OMIT electricity monthly rows
  // (no getGridFactor call, no US_AVG fallback), mirroring the annual calc/workings guard.
  isResolvedGridRegion: (region: string) => boolean;
}

/** Minimal location shape the factor fns need (country/region for EF lookup). */
export interface MonthlyLocation {
  name?: string | null;
  country?: string | null;
  grid_region?: string | null;
  province?: string | null;
}

export interface BillProposal {
  fuelType: string;          // electricity | natural_gas | diesel | propane | gasoline
  value: number | null;      // canonical activity quantity (null => skip)
  unit: string | null;       // canonical unit (plural: gallons/litres, or mcf/therms/mmbtu/m3/kwh)
  periodStart: string | null;
  periodEnd: string | null;
  status: string;            // only 'confirmed' is persisted
}

export interface SourceDocLike {
  document_type: string;     // utility_electricity | utility_bill_gas | fuel_propane | fuel_diesel | fleet_fuel | renewable_cert | ...
  extracted?: BillProposal[];
}

export interface InventoryLocationLike extends MonthlyLocation {
  source_docs?: SourceDocLike[];
}

export interface MonthlySlice {
  // In memory only: ghg_monthly_emissions has no location id column (the page maps each column by name).
  // reconcile matches slices to locations by it; location_name is not unique.
  location_id?: string;
  period_month: string;      // 'YYYY-MM-01'
  reporting_year: number;
  scope: 1 | 2;
  location_name: string | null;
  fuel_type: string;
  activity_value: number | null;   // prorated activity for the month
  activity_unit: string | null;
  tco2e: number;                   // prorated emissions for the month
  gwp_version: GwpVersion;
  ef_source: string | null;
  period_start: string | null;
  period_end: string | null;
  pct_in_month: number;            // fraction of the bill allocated to this month
  // In memory only (T10b), like location_id: 'delivery' when the slice is one delivery placed whole in the
  // month it was delivered. The stored row says the same by period_start = period_end = the delivery date
  // (isDeliveryRow in lib/ghg/loadMonthly.ts), so no column is needed.
  basis?: "delivery";
}

export interface SkippedBill {
  fuelType: string;
  document_type: string;
  reason: string;
}

export interface MonthlyResult {
  slices: MonthlySlice[];
  skipped: SkippedBill[];
}

// ---- date helpers (day-level, mirrors the coverage engine's approach) --------
// parseLocalDate is imported from lib/ghg/engine. Each bill's canonical end now arrives already
// canonicalised on its contribution (periodEndExclusive, built by the engine's exclusiveEnd), so this
// module no longer converts an end date itself — the one definition stays in the engine.
// daysBetween stays LOCAL and half-open on purpose: the engine's daysBetween is
// inclusive (+1 day) for coverage's inclusive ranges. This module prorates over the
// half-open span [start, exclusiveEnd), so it needs the exclusive day count; using
// the engine's inclusive version would inflate every bill's totalDays and break the
// monthly↔annual reconciliation.
const DAY = 86400000;
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / DAY); }
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Split [start, endExclusive) into per-month day counts.
 * Returns [{ monthKey, days, year }], days summing to the bill's total span.
 */
function monthSpans(start: Date, endExcl: Date): { key: string; days: number; year: number }[] {
  const out: { key: string; days: number; year: number }[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur.getTime() < endExcl.getTime()) {
    const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const sliceEnd = nextMonth.getTime() < endExcl.getTime() ? nextMonth : endExcl;
    const days = daysBetween(cur, sliceEnd);
    if (days > 0) out.push({ key: monthKey(monthStart), days, year: monthStart.getFullYear() });
    cur = nextMonth;
  }
  return out;
}

// ---- (docType, fuelType) -> EF key + scope, mirrored from fieldFor + buildWorkings

const PLURAL_TO_SINGULAR = (u: string): string => (u === "gallons" ? "gallon" : u === "litres" ? "litre" : u);

/**
 * Resolve a bill to its EF key + scope, mirroring the annual mapping exactly.
 * Returns null if the (docType, fuelType, unit) combination isn't a computable
 * combustion/electricity bill (caller skips + flags).
 * kind: 'gas' uses calcGas+pickEF; 'electricity' uses getGridFactor.
 */
function resolveBill(
  docType: string,
  fuelType: string,
  unit: string | null
): { kind: "gas"; efKey: string; scope: 1 } | { kind: "electricity"; scope: 2 } | null {
  if (docType === "utility_electricity" && fuelType === "electricity") return { kind: "electricity", scope: 2 };
  if (!unit) return null;
  const tok = PLURAL_TO_SINGULAR(unit);
  if (docType === "utility_bill_gas" && fuelType === "natural_gas") return { kind: "gas", efKey: `natural_gas_${unit}`, scope: 1 };
  if (docType === "fuel_propane" && fuelType === "propane") return { kind: "gas", efKey: `propane_${tok}`, scope: 1 };
  if (docType === "fuel_diesel" && fuelType === "diesel") return { kind: "gas", efKey: `diesel_${tok}`, scope: 1 };
  if (docType === "fleet_fuel" && fuelType === "diesel") return { kind: "gas", efKey: `diesel_mobile_${tok}`, scope: 1 };
  if (docType === "fleet_fuel" && fuelType === "gasoline") return { kind: "gas", efKey: `gasoline_${tok}`, scope: 1 };
  return null; // renewable_cert (no own emissions) and anything else: not a monthly emissions line
}

/**
 * Build monthly slices for one inventory. Pure: pass the live factor fns + the inventory. The reporting
 * year picks the grid factor (as the annual engine does) and, with the year end, the window. Each slice
 * is stamped with the calendar year of its month (design section 6), not the inventory's year.
 */
export function buildMonthlyEmissions(
  inventory: MonthlyInventory,
  deps: MonthlyDeps,
  gwp: GwpVersion = "AR6"
): MonthlyResult {
  const slices: MonthlySlice[] = [];
  const skipped: SkippedBill[] = [];
  const year = inventory.reporting_year;
  const win = periodFromYearAndEnd(year, inventory.fiscal_year_end_month ?? 12);
  // The window as periodFromYearAndEnd returns it: `end` is the last day IN the year, so the exclusive
  // boundary is end + 1 day. Same construction as billContributions.
  const winStart = new Date(win.start.getFullYear(), win.start.getMonth(), win.start.getDate());
  const winEndExcl = new Date(win.end.getFullYear(), win.end.getMonth(), win.end.getDate() + 1);
  const resolutions = inventory.coverage_resolutions ?? [];
  // FI1: the lines the annual totals leave out as unpriced, keyed `${locId}|${field}`, judged on the derived
  // figures as the totals are (T4). A bill for such a line is skipped with the line's own reason
  // (factor_missing, province_missing), so the monthly split leaves out exactly what the annual does.
  //   The location-level "unpriceable" skip that sat here is gone: since FI1 findUnpriceableLocations returns
  // only country refusals, which the countryRefusal check below already skips. Both read the location's
  // country, and deriveLocations never changes it, so the two could only ever agree.
  const unpricedReason = new Map(deriveLocations(inventory).flatMap(l => unpricedLines(l, gwp)).map(u => [`${u.locId}|${String(u.field)}`, u.reason]));

  for (const loc of inventory.locations) {
    // ⚠️ A LOCATION REFUSED FOR ITS COUNTRY CONTRIBUTES NO MONTHLY ROW AT ALL, AND THE FUEL GUARD
    // BELOW IS NOT ENOUGH ON ITS OWN. Its fuel bills would already land in `skipped`, because
    // pickEF returns a miss and calcGas throws inside the try. Its ELECTRICITY would not: that
    // branch asks only whether the grid region resolves, and a refused location can carry a
    // resolved one (a saved region, or a country edited somewhere that did not clear it). The
    // monthly rows would then hold Scope 2 for a site the annual totals exclude entirely.
    //   That is not the deliberate monthly/annual divergence this module exists to preserve.
    // Monthly is evidenced-only and annual adds estimates; both agree on WHICH locations are in
    // the inventory. A refused location is in neither.
    // `?? undefined` because this module's Location allows null where the engine's allows only
    // undefined, and a null country is the country_not_set case either way.
    const refusal = countryRefusal({ country: loc.country ?? undefined });
    if (refusal) {
      skipped.push({ fuelType: "all", document_type: "all", reason: `location excluded: ${refusal.state}` });
      continue;
    }
    // A confirmed proposal with no value has no contribution row (T1), so it is reported here.
    for (const doc of loc.source_docs ?? []) for (const p of doc.extracted ?? []) {
      if (p.status === "confirmed" && p.value == null) skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: "no canonical value (needs_manual_review)" });
    }
    for (const c of billContributions(loc, acceptedResolutions(loc, resolutions), win)) {
      const doc = loc.source_docs.find(d => d.id === c.docId)!;
      if (!c.counted) {
        if (c.reason !== "not_confirmed") skipped.push({ fuelType: c.fuelType, document_type: doc.document_type, reason: `not counted: ${c.reason}` });
        continue;
      }
      // The field's "uses this fuel" switch is off, so the annual figure omits it; the monthly split
      // matches, and the export-blocking stream_off issue says why (T6 ruling).
      if (streamSwitchOff(loc, c.field)) {
        skipped.push({ fuelType: c.fuelType, document_type: doc.document_type, reason: "stream_off" });
        continue;
      }
      // FI1: a bill for an unpriced line writes no slice, and says why in the line's own words.
      const unpriced = unpricedReason.get(`${loc.id}|${String(c.field)}`);
      if (unpriced) {
        skipped.push({ fuelType: c.fuelType, document_type: doc.document_type, reason: unpriced });
        continue;
      }
      const resolved = resolveBill(doc.document_type, c.fuelType, c.unit);
      if (!resolved) { skipped.push({ fuelType: c.fuelType, document_type: doc.document_type, reason: `no EF mapping for (${doc.document_type}, ${c.fuelType}, ${c.unit ?? "—"})` }); continue; }

      // The whole bill's emissions; each month takes its days' fraction of it.
      let billTotal: number;
      let efSource: string | null;
      if (resolved.kind === "electricity") {
        // Unresolved grid region → OMIT this electricity bill (no getGridFactor call, no US_AVG).
        if (!deps.isResolvedGridRegion(loc.grid_region ?? "")) {
          skipped.push({ fuelType: c.fuelType, document_type: doc.document_type, reason: `unresolved grid region (${loc.grid_region ?? ""})` });
          continue;
        }
        const gf = deps.getGridFactor(loc.grid_region ?? "", year);
        billTotal = (c.value * gf.ef) / 1000;
        efSource = `grid:${gf.usedRegion}:${gf.usedYear}`;
      } else {
        // The refusal now comes from calcGas, not pickEF: pickEF returns a uniform "no factor"
        // marker for a key no table carries, and calcGas is what declines to price it. Both calls
        // sit inside the try, so an unpriceable bill lands in `skipped` where the caller already
        // reads it, rather than taking the whole monthly write down.
        try {
          const ef: EFFactor = deps.pickEF(loc, resolved.efKey).factor;
          billTotal = deps.calcGas(ef, c.value, gwp).total;
        } catch (e) {
          skipped.push({ fuelType: c.fuelType, document_type: doc.document_type, reason: `cannot price ${resolved.efKey}: ${e instanceof Error ? e.message : String(e)}` });
          continue;
        }
        efSource = resolved.efKey;
      }

      // T10b: A DELIVERY goes whole into the calendar month it was delivered (ruling). It is counted only when
      // its date is inside the window, so the month is always inside the window too, and Σ slices still equals
      // the annual figure before any gross-up (a delivery-based field is never grossed up).
      if (c.reason === "delivered" && c.deliveryDate) {
        const dd = parseLocalDate(c.deliveryDate);
        slices.push({
          location_id: loc.id,
          period_month: monthKey(dd),
          reporting_year: dd.getFullYear(),
          scope: resolved.scope,
          location_name: loc.name ?? null,
          fuel_type: c.fuelType,
          activity_value: +c.value.toFixed(6),
          activity_unit: c.unit,
          tco2e: +billTotal.toFixed(6),
          gwp_version: gwp,
          ef_source: efSource,
          period_start: c.deliveryDate,
          period_end: c.deliveryDate,
          pct_in_month: 1,
          basis: "delivery",
        });
        continue;
      }

      // IN-WINDOW DAYS ONLY. A counted bill always has a usable period (undated and invalid ones are
      // never counted), and totalDays is its full span, so each month's fraction is of the whole bill and
      // the in-window months sum to its share.
      const start = parseLocalDate(c.periodStart as string);
      const endExcl = parseLocalDate(c.periodEndExclusive as string);
      const from = start > winStart ? start : winStart;
      const to = endExcl < winEndExcl ? endExcl : winEndExcl;
      const totalDays = c.totalDays as number;
      const p = doc.extracted![c.proposalIndex];
      for (const s of monthSpans(from, to)) {
        const pct = s.days / totalDays;
        slices.push({
          location_id: loc.id,
          period_month: s.key,
          reporting_year: s.year,
          scope: resolved.scope,
          location_name: loc.name ?? null,
          fuel_type: c.fuelType,
          activity_value: +(c.value * pct).toFixed(6),
          activity_unit: c.unit,
          tco2e: +(billTotal * pct).toFixed(6),
          gwp_version: gwp,
          ef_source: efSource,
          period_start: p.periodStart,
          period_end: p.periodEnd,
          pct_in_month: +pct.toFixed(6),
        });
      }
    }
  }

  return { slices, skipped };
}

/**
 * Completeness report reconciling evidenced monthly slices against the annual engine's figure, BY
 * LOCATION AND FUEL (T6). NOT an equality check — monthly is evidenced-only and annual is evidenced +
 * estimated, so on any extrapolated inventory they legitimately differ. For each location and fuel with
 * counted bills:
 *   annual − Σ slices − the gross-up the engine estimated = 0
 * and a non-zero remainder anywhere is a genuine defect. The annual figure and the estimate come from
 * emissionsByLocationField, the same derivation pctEstimated reports, so the two cannot disagree.
 * Typed figures with no counted bill (steam, refrigerants, a manual gas figure) have no monthly basis
 * and are not compared; slices for a location and fuel with no counted bill are compared against 0.
 */
export interface ReconciliationGroup {
  location_id: string;
  fuel_type: string;
  scope: 1 | 2;
  annual: number;
  evidenced: number;
  estimated: number;
  unexplained: number;
}
export interface ReconciliationReport {
  scope1_evidenced: number;      // Σ monthly slices, scope 1
  scope2_evidenced: number;      // Σ monthly slices, scope 2
  scope1_annual: number;         // annual Scope 1 of the fields with counted bills
  scope2_annual: number;         // annual Scope 2 (location-based) of the fields with counted bills
  months_evidenced: number;      // distinct period_month values present in the slices
  months_in_period: number;      // 12, or the fiscal window's month count
  pct_estimated: number;         // (annual − evidenced) / annual, as a percentage
  reconciles: boolean;           // TRUE iff every group's remainder is within rounding
  unexplained_delta: number;     // Σ group remainders. NON-ZERO ⇒ real bug.
  groups: ReconciliationGroup[];
  summary: string;
}

export function reconcile(
  slices: MonthlySlice[],
  inventory: MonthlyInventory,
  gwp: GwpVersion = "AR6",
  monthsInPeriod: number = 12
): ReconciliationReport {
  const key = (loc: string, fuel: string) => `${loc}|${fuel}`;
  const groups = new Map<string, ReconciliationGroup>();
  const group = (loc: string, fuel: string, scope: 1 | 2) => {
    const k = key(loc, fuel);
    if (!groups.has(k)) groups.set(k, { location_id: loc, fuel_type: fuel, scope, annual: 0, evidenced: 0, estimated: 0, unexplained: 0 });
    return groups.get(k)!;
  };
  for (const f of emissionsByLocationField(inventory, gwp)) {
    if (!f.documentBacked) continue;
    const g = group(f.locId, f.fuelType, f.scope);
    g.annual += f.annual;
    g.estimated += f.estimated;
  }
  for (const s of slices) group(s.location_id ?? "", s.fuel_type, s.scope).evidenced += s.tco2e;

  let scope1_evidenced = 0, scope2_evidenced = 0, scope1_annual = 0, scope2_annual = 0, unexplained = 0;
  for (const g of groups.values()) {
    g.unexplained = +(g.annual - g.evidenced - g.estimated).toFixed(4);
    unexplained += g.unexplained;
    if (g.scope === 2) { scope2_evidenced += g.evidenced; scope2_annual += g.annual; }
    else { scope1_evidenced += g.evidenced; scope1_annual += g.annual; }
  }
  const unexplained_delta = +unexplained.toFixed(4);
  const reconciles = [...groups.values()].every(g => Math.abs(g.unexplained) < 0.01); // rounding tolerance

  const months_evidenced = new Set(slices.map(s => s.period_month)).size;
  const annualTotal = scope1_annual + scope2_annual;
  const evidencedTotal = scope1_evidenced + scope2_evidenced;
  const pct_estimated = annualTotal > 0
    ? +(((annualTotal - evidencedTotal) / annualTotal) * 100).toFixed(1)
    : 0;

  const summary = reconciles
    ? `Monthly evidences ${months_evidenced} of ${monthsInPeriod} months. Annual includes ${monthsInPeriod - months_evidenced} estimated month(s) (${pct_estimated}%).`
    : `⚠ Unexplained difference of ${unexplained_delta} mtCO₂e between monthly and annual. This is not accounted for by any acknowledged coverage gap.`;

  return {
    scope1_evidenced: +scope1_evidenced.toFixed(4), scope2_evidenced: +scope2_evidenced.toFixed(4),
    scope1_annual, scope2_annual,
    months_evidenced, months_in_period: monthsInPeriod,
    pct_estimated, reconciles, unexplained_delta, groups: [...groups.values()], summary,
  };
}
