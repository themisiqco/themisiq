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
export const L_PER_GAL = 3.785411784;        // US liquid gallon → litres (exact, NIST)
const LB_PER_KG = 1 / 0.45359237;     // kg → lb (exact, NIST avoirdupois)
export const GJ_PER_MMBTU = 1.05505585262;   // 1 MMBtu = 1.05505585262 GJ (IEA)
const MJ_PER_KWH = 3.6;               // 1 kWh = 3.6 MJ (exact, SI)

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
    return { value, unit: 'mcf', conversionNote: `${fmt(v)} ccf ÷ 10 = ${fmt(value)} mcf (100 ft³ → 1,000 ft³)` };
  },
  'natural_gas:gj': (v) => {
    const value = round(v / GJ_PER_MMBTU);
    return { value, unit: 'mmbtu', conversionNote: `${fmt(v)} GJ ÷ ${GJ_PER_MMBTU} = ${fmt(value)} MMBtu` };
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
