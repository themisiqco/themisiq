// lib/unitConversions.ts
// ---------------------------------------------------------------------------
// ThemisIQ Concierge — measurement-unit conversions (Tier-1 / Tier-2 cascade).
//
// These are PHYSICAL/MEASUREMENT conversions (volume↔volume, energy↔energy,
// mass→volume). They are NOT emission factors. They are stable, documented
// constants chosen so the conversion is reproducible and verifier-transparent.
//
// Single source of truth — same discipline as lib/pricing.ts. One anchor
// constant per physical quantity; every other factor is DERIVED in code so an
// auditor can trace it. Do not inline magic numbers elsewhere.
//
// Cascade (spec §4):
//   Tier 1 — bill unit already matches a selector option → keep value, set unit.
//   Tier 2 — known convertible → convert, record conversionNote, customer confirms.
//   Tier 3 — unrecognized / no confident path → needs_manual_review (queue).
//
// This file converts UNITS only. It never annualizes, estimates, or gap-fills
// (that is judgment = manual review, not this layer).
// ---------------------------------------------------------------------------

export type FuelType = 'electricity' | 'natural_gas' | 'propane' | 'diesel' | 'gasoline';

// The exact unit-selector option VALUES in the wizard inventory (spec §4,
// "verified against real selectors"). If a selector value string ever changes
// in the wizard, it MUST be changed here too or Tier-1 matching silently breaks.
export const SELECTOR_UNITS: Record<FuelType, readonly string[]> = {
  electricity: ['kwh'],                              // fixed, no selector
  natural_gas: ['mcf', 'therms', 'mmbtu', 'm3', 'kwh'],
  propane: ['gallons', 'litres'],
  diesel: ['gallons', 'litres'],
  gasoline: ['gallons', 'litres'],
};

// ---------------------------------------------------------------------------
// Anchor constants (documented). Everything below is derived from these.
// ---------------------------------------------------------------------------
// ── THE EXACT CONVERSIONS (FI2) ───────────────────────────────────────────────────────────────────
// The ONLY conversions the engine applies at pricing. Every one is exact: a definition, not a measurement, so
// applying it changes the unit and never the quantity. Nothing here depends on a fuel's properties (a density or an
// energy content is not a conversion, and is not in this table). Sources: NIST Special Publication 811 (2008 ed.),
// Appendix B.8 "Factors for units listed alphabetically", which marks each of these as exact, or the SI definition.
//   Gas volume (ruling, 7 Oct 2026): m³ and ft³ (mcf, ccf) are the same physical quantity; the conversion is exact
// by definition and is applied without adjusting for differing reference temperature or pressure. It is stated on
// the row.
export const EXACT_CONVERSIONS = {
  /** US liquid gallon = 231 in³ = 3.785411784 L. NIST SP 811 B.8 (exact). */
  L_PER_US_GALLON: 3.785411784,
  /** ft³ = 0.3048³ m³ (the international foot is 0.3048 m exactly). NIST SP 811 B.8 (exact). */
  M3_PER_FT3: 0.028316846592,
  /** Mcf = 1,000 ft³. */
  M3_PER_MCF: 28.316846592,
  /** Ccf = 100 ft³. */
  M3_PER_CCF: 2.8316846592,
  /** therm = 100,000 Btu (International Table); 1 Btu_IT = 1,055.05585262 J exactly. NIST SP 811 B.8 (exact). */
  GJ_PER_THERM: 0.105505585262,
  /** MMBtu = 1,000,000 Btu (International Table). NIST SP 811 B.8 (exact). */
  GJ_PER_MMBTU: 1.05505585262,
  /** kWh = 3.6 MJ, by the SI definitions of the watt and the hour (exact). */
  GJ_PER_KWH: 0.0036,
  /** MJ = 0.001 GJ, SI prefixes (exact). */
  GJ_PER_MJ: 0.001,
  /** pound (avoirdupois) = 0.45359237 kg, by the 1959 international yard and pound agreement. NIST SP 811 B.8 (exact). */
  KG_PER_LB: 0.45359237,
} as const

// The names the rest of the code already uses, DERIVED from the table rather than retyped.
export const L_PER_GAL = EXACT_CONVERSIONS.L_PER_US_GALLON
const LB_PER_KG = 1 / EXACT_CONVERSIONS.KG_PER_LB
// Was labelled "(IEA)": the value is the International Table Btu, an exact definition (NIST SP 811), not an IEA figure.
export const GJ_PER_MMBTU = EXACT_CONVERSIONS.GJ_PER_MMBTU
// 3.6, written as the definition. Computing it as GJ_PER_KWH / GJ_PER_MJ gives 3.5999999999999996 in floating point,
// which would move every GJ-to-kWh figure in its last digit; the test pins that the two agree to full precision.
const MJ_PER_KWH = 3.6
// 1 GJ = 1000 MJ, so 1 GJ = 1000/3.6 kWh = 277.777… kWh. Exported because the GHG engine prices UK district heat from
// a DEFRA factor published per kWh and must convert a GJ-entered figure onto that basis.
export const KWH_PER_GJ = 1000 / MJ_PER_KWH
/** FI2: the exact Mcf → m³ factor. Replaces the engine's rounded 1000/35.3147. */
export const M3_PER_MCF = EXACT_CONVERSIONS.M3_PER_MCF

// ── FI2 diff 2: THE UNITS A FACTOR KEY MAY BE CONVERTED BETWEEN ─────────────────────────────────────
// Each factor-key unit token, the QUANTITY it measures and its size in that quantity's base unit, from
// EXACT_CONVERSIONS alone. The engine converts only within one quantity: liquid volume to liquid volume, gas volume to
// gas volume, energy to energy, mass to mass. Crossing quantities (a volume to an energy, a mass to a volume) needs a
// density or energy content, which is never a conversion and never in this table. A token not listed here is
// unrecognised: the line is unpriced, never read as litres.
export type QuantityKind = 'liquid_volume' | 'gas_volume' | 'energy' | 'mass'
export const EXACT_UNITS: Record<string, { kind: QuantityKind; inBase: number; one: string; many: string }> = {
  litre:  { kind: 'liquid_volume', inBase: 1, one: 'litre', many: 'litres' },
  gallon: { kind: 'liquid_volume', inBase: EXACT_CONVERSIONS.L_PER_US_GALLON, one: 'US gallon', many: 'US gallons' },
  m3:     { kind: 'gas_volume', inBase: 1, one: 'm³', many: 'm³' },
  mcf:    { kind: 'gas_volume', inBase: EXACT_CONVERSIONS.M3_PER_MCF, one: 'Mcf', many: 'Mcf' },
  ccf:    { kind: 'gas_volume', inBase: EXACT_CONVERSIONS.M3_PER_CCF, one: 'Ccf', many: 'Ccf' },
  gj:     { kind: 'energy', inBase: 1, one: 'GJ', many: 'GJ' },
  mj:     { kind: 'energy', inBase: EXACT_CONVERSIONS.GJ_PER_MJ, one: 'MJ', many: 'MJ' },
  kwh:    { kind: 'energy', inBase: EXACT_CONVERSIONS.GJ_PER_KWH, one: 'kWh', many: 'kWh' },
  mmbtu:  { kind: 'energy', inBase: EXACT_CONVERSIONS.GJ_PER_MMBTU, one: 'MMBtu', many: 'MMBtu' },
  therms: { kind: 'energy', inBase: EXACT_CONVERSIONS.GJ_PER_THERM, one: 'therm', many: 'therms' },
  kg:     { kind: 'mass', inBase: 1, one: 'kg', many: 'kg' },
  lb:     { kind: 'mass', inBase: EXACT_CONVERSIONS.KG_PER_LB, one: 'lb', many: 'lb' },
}
/** The base unit of each quantity, the one every inBase above is measured in. */
const BASE_OF: Record<QuantityKind, string> = { liquid_volume: 'litre', gas_volume: 'm3', energy: 'gj', mass: 'kg' }

/**
 * The exact conversion from one unit token to another of the SAME quantity: `toPerFrom` units of `to` in one unit of
 * `from`, and the definition stated in words ("1 US gallon = 3.785411784 litres"). Null across quantities, or for an
 * unrecognised token.
 */
export function exactConversion(from: string, to: string): { toPerFrom: number; statement: string } | null {
  const a = EXACT_UNITS[from], b = EXACT_UNITS[to]
  if (!a || !b || a.kind !== b.kind || from === to) return null
  const base = EXACT_UNITS[BASE_OF[a.kind]]
  const def = (u: { inBase: number; one: string }) => `1 ${u.one} = ${String(u.inBase)} ${base.many}`
  const statement = to === BASE_OF[a.kind] ? def(a) : from === BASE_OF[a.kind] ? def(b) : `${def(a)} and ${def(b)}`
  return { toPerFrom: a.inBase / b.inBase, statement }
}

// PROPANE density anchor — VERIFY PROVENANCE before this goes near a real
// inventory. Nominal liquid propane ≈ 4.24 lb/US-gal at 60°F (EIA / NPGA).
// It is temperature-dependent; for assurance, confirm this matches the source
// your combustion/emission factors assume, and cite it.
const PROPANE_LB_PER_GAL = 4.24;

// ---------------------------------------------------------------------------
// Conservative unit normalization. We map only spelling/casing variants of
// units we ACTUALLY handle. Anything unknown stays unknown → Tier 3. We never
// guess a unit type we don't have a documented factor for.
// ---------------------------------------------------------------------------
const UNIT_ALIASES: Record<string, string> = {
  // electricity / energy
  kwh: 'kwh', 'kw h': 'kwh', 'kw-h': 'kwh', 'kilowatt hour': 'kwh', 'kilowatt hours': 'kwh',
  mwh: 'mwh', 'megawatt hour': 'mwh', 'megawatt hours': 'mwh',
  gj: 'gj', gigajoule: 'gj', gigajoules: 'gj',
  mj: 'mj', megajoule: 'mj', megajoules: 'mj',
  // natural gas
  therm: 'therms', therms: 'therms',
  mcf: 'mcf',
  ccf: 'ccf',
  mmbtu: 'mmbtu', mmbtus: 'mmbtu',
  m3: 'm3', 'm³': 'm3', 'cubic metre': 'm3', 'cubic metres': 'm3', 'cubic meter': 'm3', 'cubic meters': 'm3',
  // liquid volume
  gallon: 'gallons', gallons: 'gallons', gal: 'gallons', gals: 'gallons', usg: 'gallons',
  litre: 'litres', litres: 'litres', liter: 'litres', liters: 'litres', l: 'litres',
  // mass (propane only)
  lb: 'lbs', lbs: 'lbs', pound: 'lbs', pounds: 'lbs',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
};

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (key === '') return null;
  return UNIT_ALIASES[key] ?? null;
}

// ---------------------------------------------------------------------------
// Result shape. `tier` is the CONVERSION-confidence dimension only. The
// extractor's read-confidence ('how clearly did the bill state this') is a
// separate signal combined downstream (spec §5 extracted.confidence).
// ---------------------------------------------------------------------------
export interface ConversionResult {
  tier: 1 | 2 | 3;
  value: number | null;          // canonical value (null only on Tier 3)
  unit: string | null;           // canonical selector unit (null only on Tier 3)
  conversionNote?: string;       // documented, verifier-readable (Tier 2)
  reason?: string;               // why it needs manual review (Tier 3)
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const fmt = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 4 });

// ---------------------------------------------------------------------------
// Tier-2 conversions, keyed by `${fuel}:${fromUnit}`. Each returns the
// canonical {value, unit, conversionNote}. Factors derived from anchors above.
// ---------------------------------------------------------------------------
type Tier2Fn = (v: number) => { value: number; unit: string; conversionNote: string };

const TIER2: Record<string, Tier2Fn> = {
  // Natural gas — exotic units → an existing selector unit
  'natural_gas:ccf': (v) => {
    const value = round(v * 0.1); // 1 ccf = 100 ft³, 1 mcf = 1000 ft³
    return { value, unit: 'mcf', conversionNote: `${fmt(v)} Ccf ÷ 10 = ${fmt(value)} Mcf (100 ft³ → 1,000 ft³)` };
  },
  'natural_gas:gj': (v) => {
    const value = round(v / GJ_PER_MMBTU);
    return { value, unit: 'mmbtu', conversionNote: `${fmt(v)} GJ ÷ ${GJ_PER_MMBTU} = ${fmt(value)} MMBtu` };
  },
  // T10a: Australian gas bills print energy in MJ ("6 944 MJ"). 1 GJ = 1,000 MJ exactly (SI), then the GJ path.
  'natural_gas:mj': (v) => {
    const gj = v / 1000;
    const value = round(gj / GJ_PER_MMBTU);
    return { value, unit: 'mmbtu', conversionNote: `${fmt(v)} MJ ÷ 1,000 = ${fmt(gj)} GJ; ÷ ${GJ_PER_MMBTU} = ${fmt(value)} MMBtu` };
  },

  // Electricity — everything reduces to kWh
  'electricity:mwh': (v) => {
    const value = round(v * 1000);
    return { value, unit: 'kwh', conversionNote: `${fmt(v)} MWh × 1,000 = ${fmt(value)} kWh` };
  },
  'electricity:gj': (v) => {
    const kwhPerGj = 1000 / MJ_PER_KWH; // 1 GJ = 1000 MJ; 1 kWh = 3.6 MJ
    const value = round(v * kwhPerGj);
    return { value, unit: 'kwh', conversionNote: `${fmt(v)} GJ × ${round(kwhPerGj, 4)} = ${fmt(value)} kWh` };
  },

  // Propane — delivery records often by weight (spec §4: main real conversion case)
  'propane:lbs': (v) => {
    const value = round(v / PROPANE_LB_PER_GAL);
    return { value, unit: 'gallons', conversionNote: `${fmt(v)} lb ÷ ${PROPANE_LB_PER_GAL} lb/gal = ${fmt(value)} gal (propane @60°F)` };
  },
  'propane:kg': (v) => {
    const litresPerKg = (LB_PER_KG / PROPANE_LB_PER_GAL) * L_PER_GAL;
    const value = round(v * litresPerKg);
    return { value, unit: 'litres', conversionNote: `${fmt(v)} kg × ${round(litresPerKg, 4)} = ${fmt(value)} L (propane @60°F)` };
  },
};

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------
/**
 * The units a bill for this fuel can be read in and converted from (T9): the selector units, plus every unit
 * with a documented conversion. The unit control on a proposal offers exactly these, so a correction can only
 * name a unit convertToCanonical can convert.
 */
export function convertibleUnits(fuelType: FuelType): string[] {
  const tier2 = Object.keys(TIER2).filter(k => k.startsWith(`${fuelType}:`)).map(k => k.slice(fuelType.length + 1))
  return [...SELECTOR_UNITS[fuelType], ...tier2.filter(u => !SELECTOR_UNITS[fuelType].includes(u))]
}

export function convertToCanonical(
  fuelType: FuelType,
  rawValue: number | null | undefined,
  rawUnit: string | null | undefined,
): ConversionResult {
  // Tier 3 — no usable value
  if (rawValue == null || !Number.isFinite(rawValue)) {
    return { tier: 3, value: null, unit: null, reason: 'missing or non-numeric value' };
  }

  const unit = normalizeUnit(rawUnit);
  if (unit === null) {
    return { tier: 3, value: null, unit: null, reason: `unrecognized unit ${JSON.stringify(rawUnit)}` };
  }

  const selectorUnits = SELECTOR_UNITS[fuelType];

  // Tier 1 — already a valid selector option for this fuel
  if (selectorUnits.includes(unit)) {
    return { tier: 1, value: round(rawValue), unit };
  }

  // Tier 2 — documented conversion path
  const conv = TIER2[`${fuelType}:${unit}`];
  if (conv) {
    const { value, unit: toUnit, conversionNote } = conv(rawValue);
    return { tier: 2, value, unit: toUnit, conversionNote };
  }

  // Tier 3 — known unit, but no confident path for this fuel
  return { tier: 3, value: null, unit: null, reason: `no conversion path: ${unit} → ${fuelType}` };
}
