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
 * rows. So reconciliation is "monthly sum ~= annual scope total FOR CONCIERGE-
 * COVERED FUELS", never strict equality across all fuels.
 *
 * Skips any proposal that is not status==='confirmed', or has value==null, or
 * has null/unparseable dates, or whose unit doesn't map to an EF key (skip +
 * flag, never compute with a guessed factor).
 */

export type GwpVersion = "AR4" | "AR5" | "AR6";

export interface EFFactor { co2: number; ch4: number; n2o: number }

/** Live factor functions, passed in from the page so we reuse the real tables. */
export interface MonthlyDeps {
  calcGas: (ef: EFFactor, amount: number, gwp: GwpVersion, biogenic?: boolean) => { total: number };
  pickEF: (loc: MonthlyLocation, key: string) => EFFactor;
  getGridFactor: (region: string, year: number) => { ef: number; usedRegion: string; usedYear: number };
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

function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
const DAY = 86400000;
/** inclusive end -> exclusive end (+1 day), matching the billing-cycle convention */
function exclusiveEnd(d: Date): Date { return new Date(d.getTime() + DAY); }
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
 * Build monthly slices for one inventory. Pure: pass the live factor fns + the
 * inventory's locations.  reportingYear is used for the grid factor lookup and
 * stamped on each slice.
 */
export function buildMonthlyEmissions(
  locations: InventoryLocationLike[],
  reportingYear: number,
  deps: MonthlyDeps,
  gwp: GwpVersion = "AR6"
): MonthlyResult {
  const slices: MonthlySlice[] = [];
  const skipped: SkippedBill[] = [];

  for (const loc of locations) {
    for (const doc of loc.source_docs ?? []) {
      for (const p of doc.extracted ?? []) {
        if (p.status !== "confirmed") continue;            // only confirmed bills persist
        if (p.value == null) { skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: "no canonical value (needs_manual_review)" }); continue; }
        if (!p.periodStart || !p.periodEnd) { skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: "missing bill dates" }); continue; }

        const start = parseLocalDate(p.periodStart);
        const endIncl = parseLocalDate(p.periodEnd);
        if (!start || !endIncl) { skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: "unparseable bill dates" }); continue; }
        const endExcl = exclusiveEnd(endIncl);
        const totalDays = daysBetween(start, endExcl);
        if (totalDays <= 0) { skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: "non-positive date span" }); continue; }

        const resolved = resolveBill(doc.document_type, p.fuelType, p.unit);
        if (!resolved) { skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: `no EF mapping for (${doc.document_type}, ${p.fuelType}, ${p.unit ?? "—"})` }); continue; }

        // total bill emissions, then prorate across months by day-fraction
        let billTotal: number;
        let efSource: string | null;
        if (resolved.kind === "electricity") {
          const gf = deps.getGridFactor(loc.grid_region ?? "", reportingYear);
          billTotal = (p.value * gf.ef) / 1000;
          efSource = `grid:${gf.usedRegion}:${gf.usedYear}`;
        } else {
          let ef: EFFactor;
          try { ef = deps.pickEF(loc, resolved.efKey); }
          catch { skipped.push({ fuelType: p.fuelType, document_type: doc.document_type, reason: `pickEF failed for key ${resolved.efKey}` }); continue; }
          billTotal = deps.calcGas(ef, p.value, gwp).total;
          efSource = resolved.efKey;
        }

        const spans = monthSpans(start, endExcl);
        for (const s of spans) {
          const pct = s.days / totalDays;
          slices.push({
            period_month: s.key,
            reporting_year: s.year,
            scope: resolved.scope,
            location_name: loc.name ?? null,
            fuel_type: p.fuelType,
            activity_value: p.value != null ? +(p.value * pct).toFixed(6) : null,
            activity_unit: p.unit,
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
  }

  return { slices, skipped };
}

/**
 * Reconciliation helper (trust feature). Sums monthly tco2e by scope for a given
 * reporting year. Caller compares to the annual scope*_total FOR CONCIERGE-
 * COVERED FUELS — they should match within rounding/straddle tolerance. Bills
 * that straddle into an adjacent year are attributed to the month/year they fall
 * in, so a clean single-year set sums to that year.
 */
export function reconcileByScope(slices: MonthlySlice[], year: number): { scope1: number; scope2: number } {
  let scope1 = 0, scope2 = 0;
  for (const s of slices) {
    if (s.reporting_year !== year) continue;
    if (s.scope === 1) scope1 += s.tco2e; else scope2 += s.tco2e;
  }
  return { scope1: +scope1.toFixed(4), scope2: +scope2.toFixed(4) };
}
