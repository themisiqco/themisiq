// ── EXIOBASE REGION AND COUNTRY NAMES, FOR SENTENCES AND RECORDS ────────────────────────────────
//
// ONE place that turns a region or country code into a name, read by the spend-factor route (its
// notices), lib/emissionFactors/spendAdjustment.ts (the conversion sentence), and the Scope 3 page
// (the workings summary, the resolved-region line and the CSV). Before this module the five
// rest-of-world names lived in the page alone, so the route could only print "WA".
//
// CLIENT-SAFE. It imports countryRegions.json (29 KB, already shipped to the page by countryOptions.ts)
// and not the factor files.
//
// ⚠️ ONLY KNOWN CODES ARE NAMED, AND THE ALLOW-LIST IS THE POINT. Intl.DisplayNames names far more than
// countries: 'ZZ' is "Unknown Region", 'QO' "Outlying Oceania", 'XA' "Pseudo-Accents", 'EU' "European
// Union", and 'UK' resolves as an alias to "United Kingdom". A deny-list of those is never complete, so
// a name is given only to the 49 EXIOBASE regions and the 212 concordance countries - the only codes
// this product can legitimately be describing - and anything else comes back as its own code.
//
// ⚠️ WHY THIS IS NOT IN countryOptions.ts. That module deliberately holds no region description:
// how a region is DESCRIBED ("a regional average", "country-specific factor") is a surface's copy.
// These are NAMES, not descriptions - the five RoW labels as EXIOBASE and the concordance workbook
// publish them (scripts/generate-country-regions.py, REGION_OVERRIDE, spells them identically) and
// the country names for the 44 single-country regions. The describing words stay in the page.
//
// ⚠️ ENGLISH, FIXED, NOT THE VIEWER'S LOCALE. countryOptions.ts resolves display names in the
// runtime's locale, which is right for a picker a person types into. These names go into disclosure
// sentences, route notices and a CSV a verifier reads - records - and a record must not change with
// the locale of whichever process produced it. A server in one locale and a browser in another would
// otherwise describe the same estimate differently.

import concordance from './countryRegions.json'

/**
 * The five EXIOBASE rest-of-world regions, by their published names.
 *
 * ⚠️ WF IS RoW AFRICA HERE, AND WF IS ALSO THE ISO COUNTRY CODE FOR WALLIS AND FUTUNA. The two are
 * unrelated. This map is keyed by REGION code and must never be handed a country code: both are two
 * uppercase letters, so the mistake passes every check silently. That is why regionName() and
 * countryName() are separate functions: regionName('WF') is RoW Africa, while countryName('WF') is the
 * bare code, because Wallis and Futuna is not one of the 212 supported countries. A caller has to say
 * which question it is asking, and neither answer can borrow the other's name.
 */
export const ROW_BUCKET_NAMES: Readonly<Record<string, string>> = {
  WA: 'RoW Asia and Pacific',
  WE: 'RoW Europe',
  WF: 'RoW Africa',
  WL: 'RoW America',
  WM: 'RoW Middle East',
}

const ROWS = (concordance as { mapping: { iso2: string; region_code: string }[] }).mapping
const KNOWN_REGIONS: ReadonlySet<string> = new Set(ROWS.map(r => r.region_code))
const KNOWN_COUNTRIES: ReadonlySet<string> = new Set(ROWS.map(r => r.iso2))

const ENGLISH: Intl.DisplayNames | null =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

/** Intl's English name for an ISO code, or null when the runtime has none (it returns the code
 *  unchanged, or throws on a code it rejects). */
function englishName(code: string): string | null {
  try {
    const n = ENGLISH?.of(code)
    return n && n !== code ? n : null
  } catch {
    return null
  }
}

/** An EXIOBASE REGION's name: a RoW bucket's published name, or the country's name for one of the 44
 *  single-country regions. The code itself when neither is known, never blank. */
export function regionName(regionCode: string): string {
  if (!KNOWN_REGIONS.has(regionCode)) return regionCode
  return ROW_BUCKET_NAMES[regionCode] ?? englishName(regionCode) ?? regionCode
}

/** A COUNTRY's name from its ISO 3166-1 alpha-2 code (plus XK), for the 212 the concordance covers. The
 *  code itself otherwise - including 'WF', Wallis and Futuna, which is not among them. */
export function countryName(iso2: string): string {
  if (!KNOWN_COUNTRIES.has(iso2)) return iso2
  return englishName(iso2) ?? iso2
}

/** "RoW Asia and Pacific (WA)", "Germany (DE)". The bare code when there is no name, not "WA (WA)". */
export function regionLabel(regionCode: string): string {
  const name = regionName(regionCode)
  return name === regionCode ? regionCode : `${name} (${regionCode})`
}

/** "Vietnam (VN)". The bare code when there is no name. */
export function countryLabel(iso2: string): string {
  const name = countryName(iso2)
  return name === iso2 ? iso2 : `${name} (${iso2})`
}
