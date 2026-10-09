// lib/ghg/fuelNames.ts
//
// HOW EACH READING'S FUEL IS NAMED FOR THE CUSTOMER AND THE VERIFIER: "natural gas", never "natural_gas". Pure, with no
// imports, so the verifier page's helpers (lib/ghg/workingsCells.ts) can read it without loading the engine.
// Moved here unchanged from lib/ghg/engine.ts (T11), where every coverage message already named fuels with it.

export const FUEL_NAME: Record<string, string> = {
  natural_gas: 'natural gas', propane: 'propane', diesel: 'diesel', gasoline: 'gasoline', electricity: 'electricity',
}

/** A fuel key in words: the map's name, else the key with its underscores read as spaces. Never the raw key. */
export const fuelName = (key: string | null | undefined): string => (key ? FUEL_NAME[key] ?? key.replace(/_/g, ' ') : 'fuel')
