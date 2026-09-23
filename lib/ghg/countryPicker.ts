// ── THE COUNTRY LIST THE GHG LOCATIONS STEP OFFERS ───────────────────────────────────────────────
//
// One list, derived, in three parts: the jurisdictions this platform holds factors for, then every
// other country it can name, then "Not listed" for a site it cannot name at all.
//
// ⚠️ BUILT FROM COUNTRY_OPTIONS SO THERE IS ONE COUNTRY LIST IN THE PRODUCT, NOT TWO. The control
// used to carry its own: five hand written options plus EU_COUNTRY_OPTIONS in the engine, 32 codes
// in all, with everything else behind "Other...". A customer in Japan had no honest answer and
// picked the nearest plausible country, which leaves no marker of any kind. Two lists that disagree
// is the failure lib/vsme/b3Energy.ts was deleted for.
//
// ⚠️ THE SUPPORTED GROUP IS DECIDED BY THE ROUTER, NOT BY A LIST KEPT HERE. efRouting answers, so a
// jurisdiction added to the engine appears here without this file being touched, and one removed
// disappears. A second list of "the supported ones" is exactly the drift this file exists to end.
// Its own test asserts the result against a LITERAL list of 32 codes, which is the independent
// check: if this derivation and that literal ever disagree, one of them is wrong and the test says
// which codes.

import { COUNTRY_OPTIONS } from '../emissionFactors/countryOptions'
import { canonicalCountryCode, efRouting } from './engine'
import { countryNameEn } from './countryRefusalCopy'

export interface CountryPickerOption {
  /** What the control STORES. Canonical: EL for Greece, GB for the UK. Never GR, never UK. */
  value: string
  /** What the control SHOWS. English, whatever the reader's locale. */
  label: string
}

// ⚠️ THE LABEL COMES FROM THE LIST'S CODE AND THE VALUE FROM THE CANONICAL ONE, AND GREECE IS WHY.
// countryNameEn asks Intl.DisplayNames, which knows ISO codes: countryNameEn('GR') is "Greece" and
// countryNameEn('EL') is "EL", because EL is a Eurostat convention and not an ISO region. Naming the
// option from the canonical code would put a bare "EL" in the dropdown. So the row's own iso2 names
// it and the canonical form is stored.
const toOption = (iso2: string): CountryPickerOption => ({
  value: canonicalCountryCode(iso2),
  label: countryNameEn(iso2),
})

const byLabel = (a: CountryPickerOption, b: CountryPickerOption) => a.label.localeCompare(b.label, 'en')

const ALL = COUNTRY_OPTIONS.map(o => toOption(o.iso2))

/** The jurisdictions the engine holds factors for. 32 today: US, CA, GB, AU, NZ and the EU 27. */
export const SUPPORTED_COUNTRY_OPTIONS: readonly CountryPickerOption[] =
  ALL.filter(o => efRouting({ country: o.value }).supported).sort(byLabel)

/** Every other country the platform can name. Each one is refused as country_not_supported. */
export const OTHER_COUNTRY_OPTIONS: readonly CountryPickerOption[] =
  ALL.filter(o => !efRouting({ country: o.value }).supported).sort(byLabel)

/**
 * The last entry, for a site this list cannot name at all.
 *
 * ⚠️ IT IS THE POINT OF THE CHANGE, NOT A CONVENIENCE. COUNTRY_OPTIONS holds 212 of the 249 assigned
 * ISO codes, and the absentees include Jersey, Guernsey, the Isle of Man, Gibraltar, Guam and the
 * French outermost regions. Without this entry a customer at one of those sites has no honest
 * option and picks a country they are not in, which is the defect this whole design removes,
 * re entered by hand at the top of the funnel where nothing can detect it.
 */
export const NOT_LISTED_OPTION: CountryPickerOption = { value: 'OTHER', label: 'Not listed' }

/** Every option the control offers, in render order. The empty placeholder is the page's own. */
export const COUNTRY_PICKER_OPTIONS: readonly CountryPickerOption[] = [
  ...SUPPORTED_COUNTRY_OPTIONS,
  ...OTHER_COUNTRY_OPTIONS,
  NOT_LISTED_OPTION,
]

/**
 * The option that should be SELECTED for a stored value, or null when none matches.
 *
 * ⚠️ CANONICALISED FOR DISPLAY, AND NOTHING IS WRITTEN. A location saved as 'UK' or 'GR' before
 * canonicalCountryCode existed holds a value no option carries, and a select whose value matches no
 * option cannot show it: whatever the browser falls back to is not the stored country. Matching on
 * the canonical form selects the right option for both. It does NOT rewrite the record, because
 * rewriting a stored value on load is a change nobody asked for, and the same rule that keeps an
 * empty location row from being dropped on save applies here.
 */
export function selectedCountryValue(stored: string | undefined): string | null {
  const canonical = canonicalCountryCode(stored)
  if (canonical === '') return ''
  return COUNTRY_PICKER_OPTIONS.some(o => o.value === canonical) ? canonical : null
}
