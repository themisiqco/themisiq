// lib/cbam/report/build.ts
// Builds the operator's summary emissions report (IR 2025/2547 Annex IV §1.2) from already-fetched DB
// rows. Pure functions — the caller (route) owns the Supabase reads and passes rows in, the same seam
// as benchmarks.ts / sefa.ts / defaultShare.ts. buildSummaryReport returns the typed Report12 plus a
// flat list of the gaps a verifier-submittable report still has.
//
// PART 1 scope: items (1)-(3) identity + processes, and (7)-(11) the plant-characteristic disclosures.
// Items (4)-(6) and (12)-(16) are reserved in Report12 but built in Part 2.
//
// Two rules run through everything here, both inherited from the schema headers (cbam_identity.sql,
// cbam_disclosures.sql), because the schema deliberately stores "unanswered" and leaves COMPLETENESS
// to this builder:
//   • A null answer is MISSING, never a value. For a boolean this is load-bearing: `false` is a
//     DECLARED negative (an answer) and stays a 'value'; only null is 'missing'. A helper enforces
//     the split so it cannot be got wrong field-by-field.
//   • Conditional sub-fields are gated on their parent. When the gate is unanswered we assume NEITHER
//     branch — the sub-field is 'missing' (undetermined), and no "required" gap is emitted for it,
//     because we do not yet know whether it is required at all.
import type { PrecursorInput } from '../types';
import type {
  ReportField, MissingField, Report12,
  Item1Operator, Item2Installation, Coordinates, ProcessSummary,
  Item7Heat, Item8ZeroRatedFuels, Item9WasteGases, Item10Co2Capture, Item11OnsiteElectricity,
} from './types';

// ── DB-row input shapes (this seam, not engine types — mirrors benchmarks.ts's BenchmarkRow) ─────

export interface OperatorProfileRow {
  operator_name: string | null;
  registration_no: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
}

export interface InstallationRow {
  name: string | null;
  cbam_registry_id: string | null;
  un_locode: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;   // pre-existing cbam_installations.country (also keys the grid factor)
  latitude: number | null;
  longitude: number | null;
}

export interface ProcessRow {
  process_id: string;
  route_code: string | null;
  cn_code: string | null;   // the good produced by this process
}

export interface DisclosuresRow {
  heat_imported: boolean | null;
  heat_exported: boolean | null;
  zero_rated_fuels_used: boolean | null;
  zero_rated_fuels_demonstration: string | null;
  waste_gases_produced_used: boolean | null;
  waste_gases_imported: boolean | null;
  waste_gases_exported: boolean | null;
  co2_capture_used: boolean | null;
  co2_capture_transferred_to: string | null;
  electricity_produced_onsite: boolean | null;
  elec_cogeneration: boolean | null;
  elec_separate_generation: boolean | null;
  elec_source_fossil: boolean | null;
  elec_source_renewable: boolean | null;
  elec_exported_from_process: boolean | null;
}

// A single charge-mix line as stored in cbam_charge_mix: a material type and its mass in tonnes.
export interface ChargeMixRow {
  materialType: string;
  mass: number;
}

export interface Report12Input {
  operator: OperatorProfileRow | null;
  installation: InstallationRow | null;
  processes: ProcessRow[];
  disclosures: DisclosuresRow | null;
}

// ── Field helpers ────────────────────────────────────────────────────────────────────────────────

// A string/text field: null OR empty string → missing (a blank textbox is not an answer). Trims so
// whitespace-only input does not masquerade as a value.
function strField(v: string | null | undefined): ReportField<string> {
  if (v == null || v.trim() === '') return { status: 'missing' };
  return { status: 'value', value: v };
}

// A boolean field: ONLY null is missing. `false` is a declared negative and MUST stay a value — the
// whole reason the disclosure columns are nullable booleans, not `not null default false`.
function boolField(v: boolean | null | undefined): ReportField<boolean> {
  if (v == null) return { status: 'missing' };
  return { status: 'value', value: v };
}

// Coordinates: both legs required. Uses == null (NOT falsy) — 0 is a valid latitude/longitude
// (equator / prime meridian), so a 0 coordinate is a value, not an absence.
function coordField(lat: number | null | undefined, lon: number | null | undefined): ReportField<Coordinates> {
  if (lat == null || lon == null) return { status: 'missing' };
  return { status: 'value', value: { latitude: lat, longitude: lon } };
}

// A "full address in English" (§1.2 (1)(c) / (2)(d)). REQUIRED parts: street line, city, country —
// the minimum for a full address; line2 and postcode are optional (not every locale has a postcode).
// Any required part absent → the whole address is 'missing' (one field, one gap), rather than
// surfacing four sub-gaps for one logical field.
function addressField(p: {
  line1: string | null; line2: string | null; city: string | null; postcode: string | null; country: string | null;
}): ReportField<string> {
  const has = (s: string | null) => s != null && s.trim() !== '';
  if (!has(p.line1) || !has(p.city) || !has(p.country)) return { status: 'missing' };
  const value = [p.line1, p.line2, p.city, p.postcode, p.country]
    .filter((s): s is string => s != null && s.trim() !== '')
    .join(', ');
  return { status: 'value', value };
}

// Record a required field as a gap when it is missing. 'not_applicable' and 'value' never emit a gap.
function requireField<T>(f: ReportField<T>, item: string, field: string, hint: string, missing: MissingField[]): void {
  if (f.status === 'missing') missing.push({ item, field, hint });
}

// A text sub-field gated on a boolean parent (used by (8) demonstration and (10) transferredTo):
//   parent missing → sub 'missing', NO gap (requirement undetermined — do not assume it is needed);
//   parent false   → sub not_applicable, with the supplied reason;
//   parent true    → sub required (value, or missing + gap).
function gatedText(
  parent: ReportField<boolean>, value: string | null,
  item: string, field: string, naReason: string, hint: string, missing: MissingField[],
): ReportField<string> {
  if (parent.status === 'missing') return { status: 'missing' };
  if (parent.status === 'value' && parent.value === false) return { status: 'not_applicable', reason: naReason };
  const f = strField(value);
  requireField(f, item, field, hint, missing);
  return f;
}

// ── Sub-builders (one per §1.2 item / group — each pushes its own gaps, independently testable) ───

// (1) Identification of the operator. All parts required. A null profile row → all three missing.
export function buildItem1(operator: OperatorProfileRow | null, missing: MissingField[]): Item1Operator {
  const name = strField(operator?.operator_name);
  const registrationNo = strField(operator?.registration_no);
  const address = addressField({
    line1: operator?.address_line1 ?? null, line2: operator?.address_line2 ?? null,
    city: operator?.city ?? null, postcode: operator?.postcode ?? null, country: operator?.country ?? null,
  });
  const hint = 'CBAM operator profile';
  requireField(name, '(1)(a)', 'operator name', hint, missing);
  requireField(registrationNo, '(1)(b)', 'operator registration number', hint, missing);
  requireField(address, '(1)(c)', 'operator full address (in English)', hint, missing);
  return { name, registrationNo, address };
}

// (2) The installation under verification. (2)(a) name is the pre-existing cbam_installations.name.
export function buildItem2(installation: InstallationRow | null, missing: MissingField[]): Item2Installation {
  const name = strField(installation?.name);
  const cbamRegistryId = strField(installation?.cbam_registry_id);
  const unLocode = strField(installation?.un_locode);
  const address = addressField({
    line1: installation?.address_line1 ?? null, line2: installation?.address_line2 ?? null,
    city: installation?.city ?? null, postcode: installation?.postcode ?? null,
    country: installation?.country ?? null,
  });
  const coordinates = coordField(installation?.latitude, installation?.longitude);
  const hint = 'CBAM installation record';
  requireField(name, '(2)(a)', 'installation name', hint, missing);
  requireField(cbamRegistryId, '(2)(b)', 'CBAM Registry installation ID', hint, missing);
  requireField(unLocode, '(2)(c)', 'UN/LOCODE', hint, missing);
  requireField(address, '(2)(d)', 'installation full address (in English)', hint, missing);
  requireField(coordinates, '(2)(e)', 'main emission source coordinates', hint, missing);
  return { name, cbamRegistryId, unLocode, address, coordinates };
}

// (3) All production processes and routes, with goods per process. Zero processes → the item is
// missing; otherwise each process must carry a route and at least one good, and any incompleteness is
// recorded per process.
export function buildItem3(processes: ProcessRow[], missing: MissingField[]): ReportField<ProcessSummary[]> {
  const hint = 'CBAM production processes';
  if (processes.length === 0) {
    missing.push({ item: '(3)', field: 'production processes and routes', hint });
    return { status: 'missing' };
  }
  const summaries: ProcessSummary[] = processes.map((p) => {
    const hasRoute = p.route_code != null && p.route_code.trim() !== '';
    const hasGood = p.cn_code != null && p.cn_code.trim() !== '';
    if (!hasRoute) missing.push({ item: '(3)', field: `production route for process ${p.process_id}`, hint });
    if (!hasGood) missing.push({ item: '(3)', field: `goods (CN code) for process ${p.process_id}`, hint });
    return { processId: p.process_id, route: hasRoute ? p.route_code : null, goods: hasGood ? [p.cn_code as string] : [] };
  });
  return { status: 'value', value: summaries };
}

// (7) Measurable heat imported / exported. Two independent required booleans.
export function buildItem7(d: DisclosuresRow | null, missing: MissingField[]): Item7Heat {
  const hint = 'CBAM installation disclosures';
  const imported = boolField(d?.heat_imported);
  const exported = boolField(d?.heat_exported);
  requireField(imported, '(7)', 'measurable heat imported', hint, missing);
  requireField(exported, '(7)', 'measurable heat exported', hint, missing);
  return { imported, exported };
}

// (8) Zero-rated fuels used, plus demonstration (gated on `used`).
export function buildItem8(d: DisclosuresRow | null, missing: MissingField[]): Item8ZeroRatedFuels {
  const hint = 'CBAM installation disclosures';
  const used = boolField(d?.zero_rated_fuels_used);
  requireField(used, '(8)', 'zero-rated fuels used', hint, missing);
  const demonstration = gatedText(
    used, d?.zero_rated_fuels_demonstration ?? null,
    '(8)', 'demonstration of zero-rating applicability', 'no zero-rated fuels used', hint, missing,
  );
  return { used, demonstration };
}

// (9) Waste gases: three independent required booleans.
export function buildItem9(d: DisclosuresRow | null, missing: MissingField[]): Item9WasteGases {
  const hint = 'CBAM installation disclosures';
  const producedUsed = boolField(d?.waste_gases_produced_used);
  const imported = boolField(d?.waste_gases_imported);
  const exported = boolField(d?.waste_gases_exported);
  requireField(producedUsed, '(9)', 'waste gases produced and used', hint, missing);
  requireField(imported, '(9)', 'waste gases imported', hint, missing);
  requireField(exported, '(9)', 'waste gases exported', hint, missing);
  return { producedUsed, imported, exported };
}

// (10) CO2 capture used, plus the transfer destination (gated on `used`).
export function buildItem10(d: DisclosuresRow | null, missing: MissingField[]): Item10Co2Capture {
  const hint = 'CBAM installation disclosures';
  const used = boolField(d?.co2_capture_used);
  requireField(used, '(10)', 'CO2 capture used', hint, missing);
  const transferredTo = gatedText(
    used, d?.co2_capture_transferred_to ?? null,
    '(10)', 'CO2 capture transfer destination', 'no CO2 capture used', hint, missing,
  );
  return { used, transferredTo };
}

// (11) On-site electricity, with the conditional gate. `producedOnsite` is ALWAYS required. The
// (a)-(d) sub-flags:
//   gate true  → required (null sub-flag becomes a gap);
//   gate false → not_applicable, reason 'no on-site electricity generation';
//   gate null  → the gate itself is the one gap; sub-flags are 'missing' (undetermined), and NO
//                per-sub-flag gap is emitted — we cannot assume they are required without knowing the
//                gate is true, nor N/A without knowing it is false.
export function buildItem11(d: DisclosuresRow | null, missing: MissingField[]): Item11OnsiteElectricity {
  const hint = 'CBAM installation disclosures';
  const producedOnsite = boolField(d?.electricity_produced_onsite);

  if (producedOnsite.status === 'missing') {
    missing.push({ item: '(11)', field: 'on-site electricity generation', hint });
    const undetermined: ReportField<boolean> = { status: 'missing' };
    return {
      producedOnsite,
      cogeneration: undetermined, separateGeneration: undetermined,
      sourceFossil: undetermined, sourceRenewable: undetermined, exportedFromProcess: undetermined,
    };
  }

  if (producedOnsite.status === 'value' && producedOnsite.value === false) {
    const na: ReportField<boolean> = { status: 'not_applicable', reason: 'no on-site electricity generation' };
    return {
      producedOnsite,
      cogeneration: na, separateGeneration: na, sourceFossil: na, sourceRenewable: na, exportedFromProcess: na,
    };
  }

  // Gate open (true) — the (a)-(d) sub-flags are required.
  const sub = (v: boolean | null | undefined, item: string, field: string): ReportField<boolean> => {
    const f = boolField(v);
    requireField(f, item, field, hint, missing);
    return f;
  };
  return {
    producedOnsite,
    cogeneration: sub(d?.elec_cogeneration, '(11)(a)', 'electricity produced by co-generation'),
    separateGeneration: sub(d?.elec_separate_generation, '(11)(b)', 'electricity produced by separate generation'),
    sourceFossil: sub(d?.elec_source_fossil, '(11)(c)', 'electricity produced from fossil sources'),
    sourceRenewable: sub(d?.elec_source_renewable, '(11)(c)', 'electricity produced from renewable sources'),
    exportedFromProcess: sub(d?.elec_exported_from_process, '(11)(d)', 'electricity exported from a production process'),
  };
}

// ── Shared derived helpers (Part 2 reuses these for the per-good / precursor items) ──────────────

// A precursor category that carries reduced iron: DRI, or pig iron in any of its charge-mix variants
// ('pig_iron', 'pig_iron_bf', 'pig_iron_smelting_reduction').
function isReducedIronCategory(category: string): boolean {
  const c = category.toLowerCase();
  return c === 'dri' || c.startsWith('pig_iron');
}

// Whether a reducing agent is reportable for a process — DERIVED from the precursors, not stored
// (mirrors cbam_process_parameters.sql: applicability is derived so it cannot drift from the actual
// inputs). A pure scrap-EAF producer consumes no DRI or pig-iron precursor and therefore has NO
// reducing agent to report at all — this returns false for it, and true once any reduced-iron
// precursor is present.
export function reducingAgentApplicable(precursors: PrecursorInput[]): boolean {
  return precursors.some((p) => isReducedIronCategory(p.category));
}

const sumMassOf = (chargeMix: ChargeMixRow[], type: string): number =>
  chargeMix.filter((r) => r.materialType === type).reduce((s, r) => s + r.mass, 0);

// Scrap ratio = (pre-consumer + post-consumer scrap mass) / activity level. Sums BOTH scrap types.
// Returns null when activityLevel ≤ 0 (or NaN) — an undefined ratio, not a fabricated zero.
export function scrapRatio(chargeMix: ChargeMixRow[], activityLevel: number): number | null {
  if (!(activityLevel > 0)) return null;
  const scrap = sumMassOf(chargeMix, 'scrap_pre_consumer') + sumMassOf(chargeMix, 'scrap_post_consumer');
  return scrap / activityLevel;
}

// Pre-consumer share of scrap = pre / (pre + post). Returns null when the denominator is 0 — an
// undefined ratio is NOT a zero share, and returning 0 would assert "all post-consumer" for a plant
// that reported no scrap at all.
export function preConsumerScrapShare(chargeMix: ChargeMixRow[]): number | null {
  const pre = sumMassOf(chargeMix, 'scrap_pre_consumer');
  const post = sumMassOf(chargeMix, 'scrap_post_consumer');
  const denom = pre + post;
  if (denom === 0) return null;
  return pre / denom;
}

// ── Top-level builder ────────────────────────────────────────────────────────────────────────────

/**
 * Build the §1.2 summary report from fetched rows. Returns the typed Report12 (Part-1 items populated;
 * Part-2 items left unset) alongside a flat list of every gap a submittable report still has.
 */
export function buildSummaryReport(input: Report12Input): { report: Report12; missing: MissingField[] } {
  const missing: MissingField[] = [];
  const report: Report12 = {
    item1_operator: buildItem1(input.operator, missing),
    item2_installation: buildItem2(input.installation, missing),
    item3_processes: buildItem3(input.processes, missing),
    item7_heat: buildItem7(input.disclosures, missing),
    item8_zeroRatedFuels: buildItem8(input.disclosures, missing),
    item9_wasteGases: buildItem9(input.disclosures, missing),
    item10_co2Capture: buildItem10(input.disclosures, missing),
    item11_onsiteElectricity: buildItem11(input.disclosures, missing),
  };
  return { report, missing };
}
