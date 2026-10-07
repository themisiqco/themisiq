// lib/ghg/unitLabels.ts
//
// HOW EACH UNIT IS WRITTEN FOR THE CUSTOMER (T10c ruling): kWh, MWh, Mcf, Ccf, MMBtu, GJ, MJ, wherever a unit
// is shown. Units are STORED lower-case (the conversion layer's canonical keys, lib/unitConversions.ts); this
// is the one place that decides how they read. A unit not listed is shown as stored. Pure, with no imports.

export const UNIT_LABEL: Record<string, string> = {
  kwh: 'kWh', mwh: 'MWh', gj: 'GJ', mj: 'MJ', m3: 'm³', mcf: 'Mcf', ccf: 'Ccf', therms: 'therms', mmbtu: 'MMBtu',
  gallons: 'US gallons', litres: 'litres', kg: 'kg', lbs: 'lb', tonnes: 'tonnes',
}

/**
 * T10d: the unit choices for a figure, so the selector agrees with its label. A figure worked out from documents
 * carries the documents' unit, which may be one the country's list does not offer (Paris gas billed in kWh,
 * where the list offers m³ only). The selector is locked then, and shows that unit as its choice rather than
 * an unselected option that reads as the unit in use.
 *
 * FI3: a held unit the list does not offer is ALWAYS kept, so the selector never shows a different unit from the one
 * stored. A typed figure in such a unit (EU gas in m³, say) is labelled "{unit} (not accepted here)"; choosing an
 * offered unit then goes through FI5's changeUnit, which converts exactly or clears and asks.
 */
export const NOT_ACCEPTED_HERE = '(not accepted here)'
export function unitOptionsShowing(options: Array<[string, string]>, unit: string | null | undefined, fromDocuments: boolean): Array<[string, string]> {
  if (!unit || options.some(([v]) => v === unit)) return options
  return [...options, [unit, fromDocuments ? unitLabel(unit) : `${unitLabel(unit)} ${NOT_ACCEPTED_HERE}`]]
}

/** A stored unit as the customer reads it. */
export function unitLabel(u: string | null | undefined, missing = 'no unit'): string {
  if (!u) return missing
  return UNIT_LABEL[u] ?? UNIT_LABEL[u.toLowerCase()] ?? u
}
