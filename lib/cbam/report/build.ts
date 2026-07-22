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
import type { PrecursorInput, PrecursorResolution } from '../types';
import type { SefaBenchmarkWorkings } from '../sefaCompute';
import type {
  ReportField, MissingField, Report12,
  Item1Operator, Item2Installation, Coordinates, ProcessSummary,
  Item7Heat, Item8ZeroRatedFuels, Item9WasteGases, Item10Co2Capture, Item11OnsiteElectricity,
  Item4Good, Item4Indirect, Item5TotalDirect, Item6Indirect,
  Item12DefaultPrecursor, Item13ActualPrecursor, Item14MultiPeriod, Item15MultiInstallation,
  Item16PrecursorOrigin,
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

// ── Part 2 DB-row / computation input shapes ─────────────────────────────────────────────────────

// A persisted cbam_see_records row (the fields the report reads). `workings` is the parsed jsonb; only
// its sefaBenchmark block is consumed here. see_direct/see_indirect are NOT NULL in the DB.
export interface SeeRecordRow {
  see_direct: number;
  see_indirect: number;
  default_share_direct: number | null;
  default_share_indirect: number | null;
  sefa: number | null;
  sefa_status: 'computed' | 'not_determinable_cscf_pending' | null;
  workings: { sefaBenchmark?: SefaBenchmarkWorkings } | null;
}

// The item-(16) origin-identity columns of a precursor (traceability, NOT origin_country which is a
// calculation input). reportingPeriod is the PRECURSOR's period (origin_reporting_period), which may
// differ from the process's — that difference is what (14) turns on.
export interface PrecursorOriginRow {
  operatorName: string | null;      // origin_operator_name
  installationName: string | null;  // origin_installation_name
  cbamRegistryId: string | null;    // origin_cbam_registry_id ("if applicable")
  reportingPeriod: number | null;   // origin_reporting_period
}

// One precursor as the report consumes it: the engine input (which keys the resolutions map) paired
// with its origin-identity row.
export interface PrecursorReportInput {
  precursor: PrecursorInput;
  origin: PrecursorOriginRow;
}

// Everything the Part 2 items need about one produced good / process. resolutions is computeSEE's OWN
// map (keyed by the same PrecursorInput objects) — consuming it, rather than re-resolving, is what
// keeps the report's source classification identical to the engine's.
export interface GoodComputation {
  processId: string;
  cnCode: string | null;
  annexIiDirectOnly: boolean;         // gates (4)(c) and (6): true → direct emissions only
  activityLevel: number;
  aeG: number | null;                 // specific attributed direct emissions
  attrEm?: number | null;             // process total direct emissions — PREFERRED over aeG × AL for (5)
  seeRecord: SeeRecordRow | null;
  precursors: PrecursorReportInput[];
  resolutions: Map<PrecursorInput, PrecursorResolution>;
}

export interface Report12Input {
  operator: OperatorProfileRow | null;
  installation: InstallationRow | null;
  processes: ProcessRow[];
  disclosures: DisclosuresRow | null;
  // Part 2 — optional. Absent → the Part 2 report items are omitted (a Part-1-only slice), exactly as
  // before. Present → items (4)-(6) and (12)-(16) are built from these.
  goods?: GoodComputation[];
  // The caller's assertion that `goods`/`processes` is the COMPLETE set for this installation and
  // reporting period. Installation-level totals (5)/(6) are only reported when this is true — we never
  // pass off a partial sum (e.g. a single process) as the installation's total.
  installationProcessesComplete?: boolean;
}

// Fixed reasons, defined once so every surface renders the same wording to a verifier.
const ANNEX_II_REASON = 'Annex II good — direct emissions only';
const SEFA_PENDING_REASON = 'not determinable — CSCF not yet published by the Commission';
const ZERO_DENOM_REASON = 'no embedded emissions to apportion';
const IMPORTED_ELEC_REASON = 'installation does not import electricity as a CBAM good';

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

// A numeric field: null/undefined → missing. 0 is a value (use == null, not falsy).
function numField(v: number | null | undefined): ReportField<number> {
  if (v == null) return { status: 'missing' };
  return { status: 'value', value: v };
}

// A share (fraction) field read from a persisted see_record. A null share is NOT missing: our
// defaultShare engine returns null ONLY for a zero denominator (an UNDEFINED share), so a null here
// is a deliberate not_applicable — 'no embedded emissions to apportion' — never a to-do gap.
function shareField(v: number | null | undefined): ReportField<number> {
  if (v == null) return { status: 'not_applicable', reason: ZERO_DENOM_REASON };
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

// ── Part 2 sub-builders — items (4), (5), (6), (12)-(16) ─────────────────────────────────────────

// (4)(c) indirect block. GATED on the good's Annex II status: an Annex II good reports direct
// emissions only, so all four sub-fields are not_applicable.
//
// For a non-Annex-II good, (4)(c)'s actual-vs-default indirect split is determined "in accordance with
// Article 9", whose actual/default distinction turns on the EMISSION FACTOR, not on metered
// consumption: the country grid factor (IR 2025/2621 Annex II) is the DEFAULT factor; an ACTUAL factor
// requires a qualifying PPA or direct technical link with documentary evidence. (4)(c)'s own sub-item —
// "confirmation that the criteria for the use of actual values … are met" — attaches criteria and
// evidence to the factor, confirming this reading. This is why the shares are NOT derived from
// default_share_indirect: that field (serving (4)(b)) measures defaulted PRECURSOR contributions over
// total indirect, a different quantity — do not reference it here.
//
// We implement ONLY the grid-default factor path (the PPA / direct-line actual-factor path is
// deferred). So every indirect figure the engine can produce is default-factor-derived: own-indirect
// via gridFactor(), defaulted-precursor indirect via see_indirect, and verified-actual precursors carry
// no indirect at all (spec §10.6). Therefore, for any non-Annex-II good with NON-ZERO indirect:
//   • share on ACTUAL values  = 0 — a real computed zero (we know it is zero and why), not missing/N/A;
//   • share on DEFAULT values = 1 (100%).
// Where total indirect is zero, there is nothing to apportion → both not_applicable.
//
// DOCUMENTED ThemisIQ INTERPRETATION, NOT REGULATORY TEXT: the regulation states neither the
// denominator nor the arithmetic of this split; the 0/1 result follows from our implementing only the
// default-factor path. IF THE PPA / DIRECT-LINE PATH IS EVER BUILT, THIS MUST BE REVISITED — the actual
// share becomes non-zero and the split becomes a real calculation over actual- vs default-factor
// indirect.
function buildItem4c(good: GoodComputation, missing: MissingField[]): Item4Indirect {
  if (good.annexIiDirectOnly) {
    const na: ReportField<never> = { status: 'not_applicable', reason: ANNEX_II_REASON };
    return { actualShare: na, defaultShare: na, criteriaConfirmation: na, specificIndirect: na };
  }
  const rec = good.seeRecord;

  let actualShare: ReportField<number>;
  let defaultShare: ReportField<number>;
  if (!rec) {
    actualShare = { status: 'missing' };
    defaultShare = { status: 'missing' };
  } else if (rec.see_indirect === 0) {
    // No indirect emissions to apportion — neither share is defined.
    const na: ReportField<number> = { status: 'not_applicable', reason: 'no indirect emissions to apportion' };
    actualShare = na;
    defaultShare = na;
  } else {
    // Only the default-factor path exists, so all indirect is default-factor-derived.
    actualShare = { status: 'value', value: 0 };
    defaultShare = { status: 'value', value: 1 };
  }

  // No field carries the "confirmation that the criteria for the use of actual values are met." With
  // the actual share at 0 there are no actual-value criteria to confirm today, but there is no field
  // either way and a future PPA / direct-line path WILL need one — so leave it missing with a hint,
  // never a fabricated confirmation on a verifier-facing report.
  const criteriaConfirmation: ReportField<boolean> = { status: 'missing' };
  missing.push({
    item: '(4)(c)', field: `confirmation the actual-value indirect criteria are met (${good.cnCode ?? good.processId})`,
    hint: 'unbuilt input — there is no field yet for the point-6 Annex IV actual-value criteria confirmation',
  });

  const specificIndirect: ReportField<number> = rec ? { status: 'value', value: rec.see_indirect } : { status: 'missing' };
  return { actualShare, defaultShare, criteriaConfirmation, specificIndirect };
}

// (4)(e) SEFA. When the CSCF is unpublished the see_record carries sefa_status
// 'not_determinable_cscf_pending' with a null sefa — that is not_applicable with a CSCF reason, NEVER
// a reported 0 (a 0 would fabricate a free-allocation figure).
function buildItem4e(rec: SeeRecordRow | null): ReportField<number> {
  if (!rec) return { status: 'missing' };
  if (rec.sefa_status === 'not_determinable_cscf_pending') return { status: 'not_applicable', reason: SEFA_PENDING_REASON };
  if (rec.sefa_status === 'computed' && rec.sefa != null) return { status: 'value', value: rec.sefa };
  return { status: 'missing' };
}

// (4)(f) benchmark confirmation — the sefaBenchmark block persisted in workings when SEFA was computed;
// not_applicable with the same CSCF reason when SEFA is pending (no benchmark was applied).
function buildItem4f(rec: SeeRecordRow | null): ReportField<SefaBenchmarkWorkings> {
  if (!rec) return { status: 'missing' };
  if (rec.sefa_status === 'not_determinable_cscf_pending') return { status: 'not_applicable', reason: SEFA_PENDING_REASON };
  const bm = rec.workings?.sefaBenchmark;
  if (bm) return { status: 'value', value: bm };
  return { status: 'missing' };
}

export function buildItem4(good: GoodComputation, missing: MissingField[]): Item4Good {
  const rec = good.seeRecord;
  return {
    processId: good.processId,
    cnCode: good.cnCode,
    specificDirect: rec ? { status: 'value', value: rec.see_direct } : { status: 'missing' },   // (4)(a)
    defaultShareDirect: rec ? shareField(rec.default_share_direct) : { status: 'missing' },       // (4)(b)
    indirect: buildItem4c(good, missing),                                                          // (4)(c)
    importedElectricity: { status: 'not_applicable', reason: IMPORTED_ELEC_REASON },               // (4)(d)
    sefa: buildItem4e(rec),                                                                        // (4)(e)
    benchmarkConfirmation: buildItem4f(rec),                                                       // (4)(f)
  };
}

// Per-process total DIRECT emissions = attrEm (preferred — the direct value the engine attributed) or
// aeG × activity level. The installation total sums the processes, but ONLY when the caller asserts the
// set is complete; otherwise it is missing — a single process's total is not the installation's.
export function buildItem5(goods: GoodComputation[], complete: boolean, missing: MissingField[]): Item5TotalDirect {
  const perProcess = goods.map((g) => {
    const total = g.attrEm != null ? g.attrEm : (g.aeG != null ? g.aeG * g.activityLevel : null);
    return { processId: g.processId, totalDirect: numField(total) };
  });

  let installationTotal: ReportField<number>;
  const allPresent = perProcess.every((p) => p.totalDirect.status === 'value');
  if (complete && allPresent) {
    const sum = perProcess.reduce((s, p) => s + (p.totalDirect.status === 'value' ? p.totalDirect.value : 0), 0);
    installationTotal = { status: 'value', value: sum };
  } else {
    installationTotal = { status: 'missing' };
    missing.push({
      item: '(5)', field: 'installation-level total direct emissions',
      hint: 'installation-level aggregation requires every process for the installation and reporting period',
    });
  }
  return { perProcess, installationTotal };
}

// (6) installation INDIRECT emissions — only where the installation produces goods NOT in Annex II.
// All-Annex-II → not_applicable. Otherwise the same completeness caveat as (5). Per-process absolute
// indirect = see_indirect × activity level.
export function buildItem6(goods: GoodComputation[], complete: boolean, missing: MissingField[]): Item6Indirect {
  const producesNonAnnexII = goods.some((g) => !g.annexIiDirectOnly);
  if (!producesNonAnnexII) return { status: 'not_applicable', reason: ANNEX_II_REASON };

  const perProcessIndirect = goods.map((g) => (g.seeRecord ? g.seeRecord.see_indirect * g.activityLevel : null));
  const allPresent = perProcessIndirect.every((v) => v != null);
  if (complete && allPresent) {
    return { status: 'value', value: perProcessIndirect.reduce((s, v) => s + (v as number), 0) };
  }
  missing.push({
    item: '(6)', field: 'installation-level indirect emissions',
    hint: 'installation-level aggregation requires every process for the installation and reporting period',
  });
  return { status: 'missing' };
}

// A precursor flattened across all goods, carrying the source classification from its own process's
// resolutions map. 'joint' precursors are excluded upstream (never in the map — produced in the
// process, Article 4(9)).
interface FlatPrecursor {
  cnCode: string;
  originCountry: string;
  source: PrecursorResolution['source'];
  direct: number;                 // resolved SEE_i direct (the default value, or the verified actual)
  origin: PrecursorOriginRow;
}

function collectPrecursors(goods: GoodComputation[]): FlatPrecursor[] {
  const out: FlatPrecursor[] = [];
  for (const g of goods) {
    for (const pri of g.precursors) {
      if (pri.precursor.boundary === 'joint') continue;   // Article 4(9) — produced in the process
      const res = g.resolutions.get(pri.precursor);
      if (res == null) {
        // Same divergence guard as defaultShare: the report must classify precursors off the ENGINE's
        // own resolutions, not a re-resolution that could disagree.
        throw new Error(
          `buildSummaryReport: precursor ${pri.precursor.cnCode} is absent from its process's resolutions map. ` +
            'Pass the same PrecursorInput objects and resolution results computeSEE consumed.',
        );
      }
      out.push({
        cnCode: pri.precursor.cnCode, originCountry: pri.precursor.originCountry,
        source: res.source, direct: res.direct, origin: pri.origin,
      });
    }
  }
  return out;
}

// (12)/(13) — partition precursors by the source discriminant. 'computed_here' is EXCLUDED from BOTH
// lists: that is the REGULATION'S OWN clause — "excluding precursors produced in the production process
// in accordance with Article 4(9)" — not a choice of ours. An 'eu_zero_rated' precursor fits NEITHER
// list, and §1.2 does not say where it belongs; we drop it from both AND record the unresolved
// classification as a gap rather than silently omitting it.
export function buildItem12and13(
  flat: FlatPrecursor[], missing: MissingField[],
): { defaults: Item12DefaultPrecursor[]; actuals: Item13ActualPrecursor[] } {
  const defaults: Item12DefaultPrecursor[] = [];
  const actuals: Item13ActualPrecursor[] = [];

  for (const p of flat) {
    switch (p.source) {
      case 'default':
      case 'default_fallback': {
        missing.push({
          item: '(12)(b)', field: `name of the good for precursor ${p.cnCode}`,
          hint: 'unbuilt input — no good-name field; do not substitute the CN code or the 2620 benchmark description',
        });
        defaults.push({
          cnCode: p.cnCode,
          name: { status: 'missing' },
          originCountry: strField(p.originCountry),
          defaultValue: { status: 'value', value: p.direct },
        });
        break;
      }
      case 'verified_actual': {
        missing.push({
          item: '(13)(b)', field: `name of the good for precursor ${p.cnCode}`,
          hint: 'unbuilt input — no good-name field; do not substitute the CN code or the 2620 benchmark description',
        });
        missing.push({
          item: '(13)(e)', field: `specific indirect embedded emissions for verified precursor ${p.cnCode}`,
          hint: 'not available — a verified actual precursor has no indirect value (PrecursorInput has no seeValueIndirect; spec §10.6)',
        });
        actuals.push({
          cnCode: p.cnCode,
          name: { status: 'missing' },
          originCountry: strField(p.originCountry),
          reportingPeriod: numField(p.origin.reportingPeriod),
          specificDirect: { status: 'value', value: p.direct },
          specificIndirect: { status: 'missing' },
        });
        break;
      }
      case 'computed_here':
        // EXCLUDED from both lists — the regulation's Article 4(9) exclusion, not ours.
        break;
      case 'eu_zero_rated':
        missing.push({
          item: '(12)/(13)', field: `list classification of EU/zero-rated precursor ${p.cnCode}`,
          hint: 'unresolved — §1.2 does not state whether an EU/zero-rated precursor belongs in the default (12) or actual (13) list; not silently dropped',
        });
        break;
    }
  }
  return { defaults, actuals };
}

// Distinct non-... helper: how many distinct values of `key` appear among a cnCode's precursors.
function anyCnCodeSpansMultiple(flat: FlatPrecursor[], key: (p: FlatPrecursor) => string): boolean {
  const byCn = new Map<string, Set<string>>();
  for (const p of flat) {
    const set = byCn.get(p.cnCode) ?? new Set<string>();
    set.add(key(p));
    byCn.set(p.cnCode, set);
  }
  for (const set of byCn.values()) if (set.size >= 2) return true;
  return false;
}

// (14) — Article 14(1) multi-PERIOD averaging. Applies only where ≥2 precursors share a CN code but
// come from different reporting periods. Condition absent → not_applicable. Condition present → missing
// (the averaging is not implemented — do not silently proceed as if it were).
export function buildItem14(flat: FlatPrecursor[], missing: MissingField[]): Item14MultiPeriod {
  const spans = anyCnCodeSpansMultiple(flat, (p) => String(p.origin.reportingPeriod));
  if (!spans) return { status: 'not_applicable', reason: 'all precursors of each CN code from a single reporting period' };
  missing.push({ item: '(14)', field: 'multi-period precursor averaging', hint: 'Article 14(1) multi-period averaging not implemented' });
  return { status: 'missing' };
}

// (15) — Article 14 multi-INSTALLATION averaging. Applies only where ≥2 precursors share a CN code from
// different installations. Same treatment as (14).
export function buildItem15(flat: FlatPrecursor[], missing: MissingField[]): Item15MultiInstallation {
  const spans = anyCnCodeSpansMultiple(flat, (p) => String(p.origin.installationName));
  if (!spans) return { status: 'not_applicable', reason: 'all precursors of each CN code from a single installation' };
  missing.push({ item: '(15)', field: 'multi-installation precursor averaging', hint: 'Article 14 multi-installation averaging not implemented' });
  return { status: 'missing' };
}

// (16) — the operator/installation of origin, per precursor. The CBAM Registry ID is "if applicable"
// in the source, so a null is not treated as a hard gap; operator, installation and period are
// required traceability and become gaps when absent.
export function buildItem16(flat: FlatPrecursor[], missing: MissingField[]): Item16PrecursorOrigin[] {
  return flat.map((p) => {
    const operatorName = strField(p.origin.operatorName);
    const installationName = strField(p.origin.installationName);
    const reportingPeriod = numField(p.origin.reportingPeriod);
    const hint = 'precursor origin identity (cbam_precursor_inputs origin_* columns)';
    requireField(operatorName, '(16)', `operator of origin for precursor ${p.cnCode}`, hint, missing);
    requireField(installationName, '(16)', `installation of origin for precursor ${p.cnCode}`, hint, missing);
    requireField(reportingPeriod, '(16)', `reporting period of origin for precursor ${p.cnCode}`, hint, missing);
    const cbamRegistryId: ReportField<string> = p.origin.cbamRegistryId != null && p.origin.cbamRegistryId.trim() !== ''
      ? { status: 'value', value: p.origin.cbamRegistryId }
      : { status: 'not_applicable', reason: 'not provided; the CBAM Registry identifier is required only where applicable (§1.2 (16))' };
    return { cnCode: p.cnCode, operatorName, installationName, cbamRegistryId, reportingPeriod };
  });
}

// ── Top-level builder ────────────────────────────────────────────────────────────────────────────

/**
 * Build the §1.2 summary report from fetched rows. Returns the typed Report12 alongside a flat list of
 * every gap a submittable report still has. Part 1 items (identity/processes/disclosures) are always
 * built; Part 2 items (per-good, precursor lists) are built only when `input.goods` is supplied.
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

  const goods = input.goods;
  if (goods && goods.length > 0) {
    const complete = input.installationProcessesComplete === true;
    report.item4_perGood = goods.map((g) => buildItem4(g, missing));
    report.item5_totalDirect = buildItem5(goods, complete, missing);
    report.item6_indirect = buildItem6(goods, complete, missing);

    const flat = collectPrecursors(goods);
    const { defaults, actuals } = buildItem12and13(flat, missing);
    report.item12_defaultPrecursors = defaults;
    report.item13_actualPrecursors = actuals;
    report.item14_multiPeriodPrecursor = buildItem14(flat, missing);
    report.item15_multiInstallationPrecursor = buildItem15(flat, missing);
    report.item16_precursorOrigin = buildItem16(flat, missing);
  }

  return { report, missing };
}
