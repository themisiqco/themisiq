/**
 * VSME B3 — energy aggregator
 * --------------------------------------------------------------------------
 * Walks each location's combustion fuels, purchased steam, and electricity,
 * converts everything to MWh via energyContent.fuelEnergyMWh(), and returns
 * the VsmeEnergyConsumption block (total, renewable/non-renewable, and the
 * recommended electricity/fuels split).
 *
 * 1:1 WITH THE ENGINE: the fuel enumeration below mirrors calcLocation()
 * EXACTLY — same has_* gates, same `amount > 0` checks, same EF-key string
 * construction (incl. the gallons→'gallon'/litres→'litre' singular suffix and
 * the natural_gas_${unit} raw-unit exception), and the same country→
 * jurisdiction resolution that pickEF() uses (so fuel_oil grade matches the
 * emissions side). If a fuel is added to the engine, add it here too — an
 * unmapped key throws in fuelEnergyMWh() rather than silently reading zero.
 *
 * Lives in lib/vsme/ alongside energyContent.ts and climateCore.ts.
 */

import { fuelEnergyMWh } from "./energyContent";
import type { VsmeEnergyConsumption } from "./climateCore";

/**
 * Structural subset of the engine's Location (page.tsx:423). The real Location
 * satisfies this by structural typing — no need to import the component-local
 * interface.
 */
export interface B3Location {
  country: string;
  has_natural_gas: boolean;
  natural_gas_amount: number;
  natural_gas_unit: "mcf" | "therms" | "mmbtu" | "m3" | "kwh";
  has_propane: boolean;
  propane_amount: number;
  propane_unit: "gallons" | "litres";
  has_diesel_stationary: boolean;
  diesel_stationary_amount: number;
  diesel_stationary_unit: "gallons" | "litres";
  // ⚠️ tsc DOES NOT FORCE THIS FILE. b3Energy declares its own structural copy of the Location shape
  // rather than importing Location, so the engine's field rename produced no error here. It was found
  // by grep, not by the compiler. Any future Location change has to be applied here by hand.
  has_fuel_oil_distillate: boolean;
  fuel_oil_distillate_amount: number;
  fuel_oil_distillate_unit?: "gallons" | "litres";
  has_fuel_oil_residual: boolean;
  fuel_oil_residual_amount: number;
  fuel_oil_residual_unit?: "gallons" | "litres";
  has_mobile: boolean;
  gasoline_amount: number;
  gasoline_unit: "gallons" | "litres";
  diesel_mobile_amount: number;
  diesel_mobile_unit: "gallons" | "litres";
  has_purchased_steam: boolean;
  purchased_steam_mmbtu: number;
  electricity_kwh: number;
  renewable_electricity_kwh: number;
}

// jurisdictionOf() AND ITS EU_COUNTRIES SET WERE DELETED HERE. Their only job was resolving which
// fuel-oil grade a location's EF table implied, for energyContent's FUEL_OIL_GRADE_BY_JUR. The engine
// now names the grade in the key, so both the map and this mirror of pickEF's country resolution are
// gone. That mirror was a standing drift risk — a second copy of the engine's jurisdiction rules,
// maintained by hand, in a module that does not import Location either.

const galSuffix = (unit: "gallons" | "litres") =>
  unit === "gallons" ? "gallon" : "litre";

/**
 * Sum of combustion + purchased-steam energy (MWh) for one location.
 * Each branch reproduces a branch of calcLocation().
 */
function locationFuelMWh(loc: B3Location): number {
  let mwh = 0;

  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    // natural gas key uses the raw unit string (the one non-singular case)
    mwh += fuelEnergyMWh(`natural_gas_${loc.natural_gas_unit}`, loc.natural_gas_amount);
  }
  if (loc.has_propane && loc.propane_amount > 0) {
    mwh += fuelEnergyMWh(`propane_${galSuffix(loc.propane_unit)}`, loc.propane_amount);
  }
  if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) {
    mwh += fuelEnergyMWh(`diesel_${galSuffix(loc.diesel_stationary_unit)}`, loc.diesel_stationary_amount);
  }
  if (loc.has_fuel_oil_distillate && loc.fuel_oil_distillate_amount > 0) {
    mwh += fuelEnergyMWh("fuel_oil_distillate_gallon", loc.fuel_oil_distillate_amount);
  }
  if (loc.has_fuel_oil_residual && loc.fuel_oil_residual_amount > 0) {
    mwh += fuelEnergyMWh("fuel_oil_residual_gallon", loc.fuel_oil_residual_amount);
  }
  if (loc.has_mobile && loc.gasoline_amount > 0) {
    mwh += fuelEnergyMWh(`gasoline_${galSuffix(loc.gasoline_unit)}`, loc.gasoline_amount);
  }
  if (loc.has_mobile && loc.diesel_mobile_amount > 0) {
    mwh += fuelEnergyMWh(`diesel_mobile_${galSuffix(loc.diesel_mobile_unit)}`, loc.diesel_mobile_amount);
  }
  if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
    mwh += fuelEnergyMWh("steam_mmbtu", loc.purchased_steam_mmbtu);
  }
  return mwh;
}

/**
 * Aggregate all locations into the B3 energy block.
 *
 * Renewable scope note: renewable energy in this model = renewable electricity
 * (renewable_electricity_kwh) only. On-site combustion fuels are fossil;
 * biomass/biogenic is excluded from the engine's energy path; purchased steam
 * carries no renewable flag and is treated non-renewable. If renewable heat or
 * renewable fuels are added later, extend the renewable total here.
 *
 * Steam note: purchased steam is included in `fuelsMWh` (the non-electricity
 * energy bucket) so that electricityMWh + fuelsMWh === totalMWh. If a separate
 * "purchased heat" bucket is wanted, that's a climateCore interface change.
 */
export function buildB3Energy(locations: B3Location[]): VsmeEnergyConsumption {
  let electricityMWh = 0;
  let renewableElecMWh = 0;
  let fuelsMWh = 0;

  for (const loc of locations) {
    const elec = (loc.electricity_kwh || 0) / 1000;
    // clamp renewable to total electricity (mirrors the engine's uncovered guard)
    const renew = Math.min(elec, (loc.renewable_electricity_kwh || 0) / 1000);
    electricityMWh += elec;
    renewableElecMWh += renew;
    fuelsMWh += locationFuelMWh(loc); // combustion + purchased steam
  }

  const totalMWh = electricityMWh + fuelsMWh;
  const renewableMWh = renewableElecMWh;
  const nonRenewableMWh = totalMWh - renewableMWh;

  return {
    totalMWh,
    renewableMWh,
    nonRenewableMWh,
    electricityMWh,
    fuelsMWh, // includes purchased steam
  };
}
