// lib/ghg/unitLabels.ts
//
// HOW EACH UNIT IS WRITTEN FOR THE CUSTOMER (T10c ruling): kWh, MWh, Mcf, Ccf, MMBtu, GJ, MJ, wherever a unit
// is shown. Units are STORED lower-case (the conversion layer's canonical keys, lib/unitConversions.ts); this
// is the one place that decides how they read. A unit not listed is shown as stored. Pure, with no imports.

export const UNIT_LABEL: Record<string, string> = {
  kwh: 'kWh', mwh: 'MWh', gj: 'GJ', mj: 'MJ', m3: 'm³', mcf: 'Mcf', ccf: 'Ccf', therms: 'therms', mmbtu: 'MMBtu',
  gallons: 'US gallons', litres: 'litres', kg: 'kg', lbs: 'lb',
}

/** A stored unit as the customer reads it. */
export function unitLabel(u: string | null | undefined, missing = 'no unit'): string {
  if (!u) return missing
  return UNIT_LABEL[u] ?? UNIT_LABEL[u.toLowerCase()] ?? u
}
