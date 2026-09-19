// ── FROM THE PRODUCT'S COUNTRY CODES TO DEFRA'S HAUL DEFINITION ─────────────────────────────────
//
// Every country control in the product stores ISO 3166-1 alpha-2 (countryOptions.ts, 212 countries).
// DEFRA's Haul definition sheet keys its 215 territories by ISO3. This is the bridge between the two,
// built from the two committed artefacts and nothing else: no ISO table is shipped or downloaded.
//
// HOW: a country is matched to a territory when their names fold to the same string (foldForMatch, the
// matcher the country picker uses). Where the two sources spell one country differently, an explicit
// override below names the ISO3 code, and a test checks every override lands on a row the sheet has.
// ⚠️ A NAME MATCH IS NOT TRUSTED BLINDLY: the test pins the whole map's size and the unmapped list, and
// spot-checks codes, so a renamed row on either side fails a test rather than quietly re-pointing.
//
// ⚠️ UNMAPPED IS NOT "NOT UK". Thirteen countries the picker offers are not on the Haul definition sheet
// at all (DEFRA_HAUL_UNLISTED_ISO2). That matters only for a flight with a UK end, whose category comes
// from the other end's haul: such a flight is not priced, and says why. A flight with neither end in the
// UK is banded by distance and does not need the sheet, so an unlisted country does not stop it.
//
// CLIENT-SAFE: imports countryOptions.ts and defraTravel.ts, both of which the Scope 3 page already ships.

import { COUNTRY_OPTIONS, foldForMatch } from '../emissionFactors/countryOptions'
import { HAUL_RECORDS, haulForIso3, type Haul } from '../emissionFactors/defraTravel'

/**
 * Countries the two sources spell differently, by the picker's ISO2 and the sheet's ISO3.
 * The sheet's spelling is in each comment, so a reader can find the row.
 */
export const HAUL_ISO3_OVERRIDES: Readonly<Record<string, string>> = {
  BA: 'BIH', // Bosnia-Herzegovina
  BN: 'BRN', // Brunei
  CG: 'COG', // Congo-Brazzaville
  CI: 'CIV', // Ivory Coast
  CV: 'CPV', // Cape Verde
  KG: 'KGZ', // Kyrgyzstan
  PF: 'PYF', // Tahiti (the sheet lists French Polynesia under its main island)
  SK: 'SVK', // Slovak Republic
  SO: 'SOM', // Somali Republic
  SR: 'SUR', // Surinam
  ST: 'STP', // Sao Tome Islands
  TL: 'TLS', // Timor
}

const ISO3_BY_FOLDED_NAME = new Map(HAUL_RECORDS.map(r => [foldForMatch(r.territory), r.iso3]))

const ISO3_BY_ISO2: ReadonlyMap<string, string> = new Map(
  COUNTRY_OPTIONS.flatMap(o => {
    const iso3 = HAUL_ISO3_OVERRIDES[o.iso2] ?? ISO3_BY_FOLDED_NAME.get(foldForMatch(o.source_name))
    return iso3 ? [[o.iso2, iso3] as const] : []
  }),
)

/** The picker's countries that the Haul definition sheet does not list, in the picker's order. */
export const DEFRA_HAUL_UNLISTED_ISO2: readonly string[] = COUNTRY_OPTIONS.filter(o => !ISO3_BY_ISO2.has(o.iso2)).map(o => o.iso2)

/** The sheet's ISO3 for a picker country, or null where the sheet does not list it. */
export function haulIso3ForIso2(iso2: string): string | null {
  return ISO3_BY_ISO2.get(iso2) ?? null
}

/** The sheet's haul for a picker country, or null where the sheet does not list it. */
export function haulForIso2(iso2: string): Haul | null {
  const iso3 = haulIso3ForIso2(iso2)
  return iso3 ? haulForIso3(iso3) : null
}

/**
 * Is this country the UK for DEFRA's purposes: a territory the sheet itself calls Domestic? That is the
 * United Kingdom, Guernsey, Jersey and the Isle of Man; only the first is in the picker today.
 */
export const isUkIso2 = (iso2: string): boolean => haulForIso2(iso2) === 'domestic'
