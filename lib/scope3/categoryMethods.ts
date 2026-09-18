// ── WHICH CALCULATION EACH SCOPE 3 CATEGORY USES, AND HOW TO DESCRIBE IT ─────────────────────────
//
// ONE map from category to method, read by the Scope 3 calculator's dispatch (getCatEmissions in
// app/dashboard/scope3/page.tsx) AND by every description of a figure's basis. Because the dispatch
// reads this map, a description cannot say one method while the calculation runs another.
//
// ⚠️ THIS REPLACED "DEFRA/Exiobase", WHICH WAS FALSE IN EVERY COPY. When it was written, no DEFRA spend
// or activity factor fed any Scope 3 figure. On 17 Sep 2026 the claim appeared five times: the CSV methodology
// note, the saved factor_basis column, the supply-chain register, and twice on the public methodology
// page. What is actually true differs by category, and a single sentence cannot say it:
//   Cat 1                     EXIOBASE 3.8.2, through a named factor edition
//   Cat 5                     (since 17 Sep 2026) DEFRA/DESNZ 2026 waste factors, per material and route
//   Cat 6, 7                  fixed activity factors in EMISSION_FACTORS, with no recorded source
//   Cat 15                    the PCAF-aligned path in lib/pcaf
//   the other ten             one flat spend factor, with no source, no year and no region
//
// CLIENT-SAFE: imports spend.ts (types and the source catalogue) and lib/emissionFactors.ts, neither
// of which pulls in a factor file, and defraWaste.ts, which pulls in the ~30 KB waste artefact the
// Scope 3 page already ships.

import { SPEND_EF_SOURCES } from '../emissionFactors/spend'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { EMISSION_FACTORS, EMISSION_FACTORS_PROVENANCE, GENERIC_SPEND_FACTOR } from '../emissionFactors'

export type Scope3Method =
  | 'exiobase_spend'
  | 'flat_spend'
  | 'waste_factors'
  | 'travel_factors'
  | 'commuting_factors'
  | 'pcaf'

const METHOD_BY_CATEGORY: Readonly<Record<string, Scope3Method>> = {
  cat1: 'exiobase_spend',
  cat5: 'waste_factors',
  cat6: 'travel_factors',
  cat7: 'commuting_factors',
  cat15: 'pcaf',
}

/** The method a category is calculated with. Anything not named above takes the flat spend factor,
 *  exactly as the calculator's default branch does. */
export function scope3MethodFor(categoryId: string): Scope3Method {
  return METHOD_BY_CATEGORY[categoryId] ?? 'flat_spend'
}

/**
 * "no published source, no year and no region" — built from which provenance fields are null, so it
 * shrinks the moment a real source is recorded. null when nothing is missing.
 */
export function provenanceGap(p: { source: string | null; year: number | null; region: string | null }): string | null {
  const missing = [
    p.source === null && 'no published source',
    p.year === null && 'no year',
    p.region === null && 'no region',
  ].filter((x): x is string => typeof x === 'string')
  if (missing.length === 0) return null
  return missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
}

const gapSentence = (p: Parameters<typeof provenanceGap>[0], subject: string): string => {
  const gap = provenanceGap(p)
  return gap ? ` ${subject} recorded with ${gap}.` : ''
}

/**
 * What a method IS, independent of any one inventory: for the public methodology page, and as the
 * detail line for a category whose data was used as the method describes. Every number and source is
 * read from the factor tables and the source catalogue, not typed here.
 */
export function scope3MethodDescription(method: Scope3Method): string {
  const ef = EMISSION_FACTORS
  switch (method) {
    case 'exiobase_spend': {
      const src = SPEND_EF_SOURCES.exiobase_38
      return (
        `Spend-based, priced from ${src.dataset} version ${src.version} (${src.publisher}, licensed ` +
        `${src.licence}) through the active factor edition, using the factor for the supplier's sector ` +
        `in the EXIOBASE region its country of supply belongs to.`
      )
    }
    case 'flat_spend':
      return (
        `Spend-based, at a flat ${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e per unit of the ` +
        `inventory's currency, the same whatever was bought.` +
        gapSentence(GENERIC_SPEND_FACTOR, 'This factor is')
      )
    case 'waste_factors': {
      const w = DEFRA_WASTE_META
      return (
        `Activity-based: tonnes of waste by material and treatment route, each multiplied by the kg CO2e ` +
        `per tonne published for that pair in ${w.source} (${w.factor_set.toLowerCase()} v${w.file_version}, ` +
        `${w.sheet} sheet, ${w.gwp_basis} GWPs). Only the routes published for a material are offered; ` +
        `re-use is not a disposal route and has no factor. ${w.attribution_required}`
      )
    }
    case 'travel_factors':
      return (
        `Activity-based: flights, hotel nights and rail distance, multiplied by fixed factors of ` +
        `${ef.flight_short} and ${ef.flight_long} kg CO2e per passenger-km for short- and long-haul flights, ` +
        `${ef.hotel} kg CO2e per hotel night and ${ef.rail} kg CO2e per rail km.` +
        gapSentence(EMISSION_FACTORS_PROVENANCE, 'These factors are')
      )
    case 'commuting_factors':
      return (
        `Activity-based: employees, commute distance and working days, multiplied by a fixed factor for ` +
        `the commute mode of ${ef.car_petrol} kg CO2e per km by petrol car, ${ef.car_electric} by electric ` +
        `car, ${ef.bus} by bus or ${ef.rail} by rail.` +
        gapSentence(EMISSION_FACTORS_PROVENANCE, 'These factors are')
      )
    case 'pcaf':
      return (
        `PCAF-aligned financed emissions: known financed emissions where entered, otherwise an assessment ` +
        `asset by asset, otherwise portfolio value multiplied by a sector factor from ThemisIQ's own factor ` +
        `table.` +
        gapSentence(EMISSION_FACTORS_PROVENANCE, 'That table is')
      )
  }
}
