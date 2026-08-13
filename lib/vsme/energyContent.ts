/**
 * VSME B3 — fuel/energy → MWh conversion
 * --------------------------------------------------------------------------
 * Converts each combustion / energy EF key (as consumed by the GHG engine's
 * calcLocation()) into MWh, for the VSME B3 "total energy consumption" figure.
 *
 * KEYING: keyed on the engine's real EF keys (NOT unitConversions.FuelType,
 * which is coarser and omits fuel_oil / mobile diesel / steam). This guarantees
 * a 1:1 match with the combustion calc — no fuel can silently contribute zero.
 *
 * BASIS: Higher Heating Value (HHV / gross CV), EIA.
 *   Rationale: B3 energy is derived from utility bills and fuel receipts, which
 *   are metered on a gross-CV basis. Gross therefore matches the source data,
 *   and it is the company-reporting convention in BOTH the US (EIA/EPA) and the
 *   UK/EU — DEFRA explicitly directs companies to use gross-CV factors when
 *   reporting from utility bills. (Net CV is the IEA / energy-statistics
 *   convention, not the bill-based company-reporting one.)
 *   The export MUST state "gross CV basis". Switching to net CV (DEFRA) would be
 *   a five-number swap of SOURCE_BTU with identical structure, if an auditor or
 *   customer ever specifically requires it — so this is not a one-way door.
 *
 * SOURCING: every physical-fuel number is a published HHV figure (EIA). All
 * other values derive from these plus the existing unit anchors. Six source
 * figures: natural gas, gasoline, diesel, propane (your four to verify), plus
 * the two fuel-oil grades (distillate / residual) resolved by jurisdiction.
 *
 * (HISTORICAL) fuel_oil_gallon WAS jurisdiction-dependent. The engine's EF tables resolved
 *   this single key to two different fuel grades: distillate / No.2 in the US &
 *   CA tables (CO2 ≈ 10.2–10.4 kg/gal, same as diesel) and residual / No.6 in
 *   the UK & EU tables (CO2 ≈ 11.7–12.0 kg/gal). Energy content differs by grade,
 *   so the energy figure MUST mirror the grade the engine assumed for that
 *   location — otherwise energy and emissions sit on different fuel-grade
 *   assumptions for the same litres. Handled below via FUEL_OIL_GRADE_BY_JUR.
 *
 * ⚠️ ONE THING TO RESOLVE BEFORE WIRING:
 *   Anchor consolidation: the anchors below mirror lib/unitConversions.ts and
 *   page.tsx (M3_PER_MCF). Before merge, export them from ONE source and import
 *   here, rather than re-declaring (single source of truth). Also confirm the
 *   jurisdiction codes in FUEL_OIL_GRADE_BY_JUR match the engine's table keys.
 */

// --- Anchors (mirror the canonical constants; consolidate before merge) -----
const L_PER_GAL = 3.785411784;        // unitConversions.ts — US gallon → litres (NIST)
const GJ_PER_MMBTU = 1.05505585262;   // unitConversions.ts — 1 MMBtu = 1.05505585262 GJ (IEA)
const MJ_PER_KWH = 3.6;               // unitConversions.ts — 1 kWh = 3.6 MJ (exact, SI)
const M3_PER_MCF = 1000 / 35.3147;    // page.tsx — 1 mcf (1000 ft³) → m³ (= 28.3168)

/** Btu per MWh, derived from the existing anchors (no magic number).
 *  1 MMBtu = GJ_PER_MMBTU GJ = GJ_PER_MMBTU*1000 MJ ; ÷ MJ_PER_KWH → kWh.
 *  => 1,000,000 Btu / that kWh value, ×1000 for MWh.  ≈ 3,412,141.6 Btu/MWh. */
const BTU_PER_MWH = 1_000_000 / ((GJ_PER_MMBTU * 1000) / MJ_PER_KWH / 1000);

// --- The source figures (HHV / gross CV, EIA) -------------------------------
// EIA "British thermal units" / heat-content tables. Verify before trusting.
const SOURCE_BTU = {
  natural_gas_per_scf: 1_036,    // EIA: 1 ft³ natural gas = 1,036 Btu
  gasoline_per_gal:    120_214,  // EIA: 1 gal motor gasoline = 120,214 Btu
  diesel_per_gal:      137_381,  // EIA: 1 gal diesel (≤15ppm S) = 137,381 Btu
  propane_per_gal:     91_452,   // EIA: 1 gal propane = 91,452 Btu
  // Two fuel-oil grades, now ordinary entries: the engine key names the grade, so neither is
  // jurisdiction-dependent any more.
  fuel_oil_distillate_per_gal: 138_500,  // EIA heating oil No.2
  fuel_oil_residual_per_gal:   149_690,  // EIA residual No.6 (6.287 MMBtu/bbl ÷ 42)
} as const;

// FUEL_OIL_GRADE_BY_JUR IS GONE. It mapped a jurisdiction to a grade because the engine had ONE
// fuel_oil key holding a different product per table, and this module had to guess which. The engine
// now carries fuel_oil_distillate_gallon and fuel_oil_residual_gallon as separate keys, so the grade
// arrives with the key and there is nothing left to infer. It also only ever mapped US/CA/UK/EU and
// THREW on anything else — an AU or NZ location with fuel oil crashed the B3 energy total. That is
// fixed by deletion, not by adding two more entries.

// --- Derived MWh-per-unit helpers -------------------------------------------
const mwhPerGal = (btuPerGal: number) => btuPerGal / BTU_PER_MWH;
const mwhPerLitre = (btuPerGal: number) => mwhPerGal(btuPerGal) / L_PER_GAL;
const ngMwhPerMcf = (SOURCE_BTU.natural_gas_per_scf * 1000) / BTU_PER_MWH;

/** EF key → MWh per native unit. Every key is jurisdiction-independent, including both fuel-oil
 *  grades: the grade is now part of the key, so nothing here has to know where the location is.
 *  Physical fuels use SOURCE_BTU; the four energy keys use anchors directly. */
export const ENERGY_CONTENT_MWH = {
  // ---- Natural gas (physical units need CV; energy units use anchors) ----
  natural_gas_mcf: ngMwhPerMcf,                       // per mcf
  natural_gas_m3: ngMwhPerMcf / M3_PER_MCF,           // per m³
  natural_gas_therms: 100_000 / BTU_PER_MWH,          // 1 therm = 100,000 Btu
  natural_gas_mmbtu: 1_000_000 / BTU_PER_MWH,         // 1 MMBtu
  natural_gas_kwh: 0.001,                             // 1 kWh = 0.001 MWh

  // ---- Liquid fuels (gallon source; litre derived via L_PER_GAL) ----
  propane_gallon: mwhPerGal(SOURCE_BTU.propane_per_gal),
  fuel_oil_distillate_gallon: mwhPerGal(SOURCE_BTU.fuel_oil_distillate_per_gal),
  fuel_oil_residual_gallon: mwhPerGal(SOURCE_BTU.fuel_oil_residual_per_gal),
  propane_litre: mwhPerLitre(SOURCE_BTU.propane_per_gal),
  diesel_gallon: mwhPerGal(SOURCE_BTU.diesel_per_gal),
  diesel_litre: mwhPerLitre(SOURCE_BTU.diesel_per_gal),
  diesel_mobile_gallon: mwhPerGal(SOURCE_BTU.diesel_per_gal),   // same fuel as stationary
  diesel_mobile_litre: mwhPerLitre(SOURCE_BTU.diesel_per_gal),
  gasoline_gallon: mwhPerGal(SOURCE_BTU.gasoline_per_gal),
  gasoline_litre: mwhPerLitre(SOURCE_BTU.gasoline_per_gal),

  // ---- Purchased steam (Scope 2 energy carrier; already energy) ----
  steam_mmbtu: 1_000_000 / BTU_PER_MWH,
} as const;

export type EnergyEfKey = keyof typeof ENERGY_CONTENT_MWH;

/**
 * Convert an amount in an EF key's native unit to MWh.
 *
 * No `jurisdiction` parameter any more — it was required only for fuel_oil_gallon (whose grade — and so
 * energy content — depends on the engine's EF table). Pass the same
 * jurisdiction the engine used to pick the EF table.
 *
 * Throws on an unmapped key, an unmapped fuel_oil jurisdiction, or a missing
 * jurisdiction for fuel_oil — deliberately loud, so nothing silently
 * contributes zero or the wrong-grade energy to the B3 total.
 */
export function fuelEnergyMWh(efKey: string, amount: number): number {
  const factor = (ENERGY_CONTENT_MWH as Record<string, number>)[efKey];
  if (factor === undefined) {
    throw new Error(
      `[vsme/energyContent] No energy-content factor for EF key "${efKey}". ` +
      `Add it to ENERGY_CONTENT_MWH before this fuel can be reported under B3.`
    );
  }
  return amount * factor;
}

/**
 * Reference: the resolved MWh-per-unit values, for review/audit display.
 * (Same numbers the code computes — surfaced so a reviewer can eyeball them
 * without running it.)  HHV / gross CV basis.
 *   natural_gas_mcf  ≈ 0.30362 MWh/mcf      natural_gas_m3 ≈ 0.010722 MWh/m³
 *   natural_gas_therms ≈ 0.029307 MWh       natural_gas_mmbtu ≈ 0.293071 MWh
 *   propane_gallon  ≈ 0.026802 MWh/gal      propane_litre  ≈ 0.0070803 MWh/L
 *   diesel_gallon   ≈ 0.040262 MWh/gal      diesel_litre   ≈ 0.0106362 MWh/L
 *   gasoline_gallon ≈ 0.035231 MWh/gal      gasoline_litre ≈ 0.0093072 MWh/L
 *   steam_mmbtu     ≈ 0.293071 MWh
 *   fuel_oil_gallon (distillate, US/CA) ≈ 0.040590 MWh/gal
 *   fuel_oil_gallon (residual,  UK/EU)  ≈ 0.043871 MWh/gal
 */
