// ── EVERY SENTENCE THE COUNTRY REFUSAL SAYS, IN ONE PLACE ────────────────────────────────────────
//
// Three states, two surfaces, eight sentences. Pure strings: no React, no Supabase, no engine
// import beyond the type, on the pattern of lib/scope3/cat3Copy.ts.
//
// ⚠️ ONE MODULE BECAUSE FOUR SURFACES SAY THESE THINGS AND MUST NOT SAY THEM DIFFERENTLY. The
// Review banner, the workings row, the verifier page and the multi-year series each render the same
// refusal. A string literal in four files is the drift this repo keeps writing tests against.
//
// CONSTRAINTS HELD BY EVERY SENTENCE HERE, AND BY ANY ADDED LATER:
//   · no em dashes
//   · no positional words: a sentence may name a step or a field, never "below" or "above"
//   · steps are NAMED, never numbered. The wizard's tab bar renders "2. Company setup"; the number
//     moves when a step is inserted and the name does not.
//   · no absolute claims. "We do not hold emission factors for X" is checkable and true. "No
//     emission factors exist for X" is neither: DEFRA, ECCC and others publish for countries this
//     platform does not carry.
//
// ⚠️ THE STEP IS NAMED "Company setup" AND THE FIELD IS NAMED TOO, AND THAT IS NOT BELT AND BRACES.
// There is no Locations step. Countries are chosen in the field labelled "List your locations",
// which sits on the step the tab bar calls "Company setup" (app/dashboard/ghg/page.tsx:1219,
// rendered at :2837). Naming only the step would send a customer to a tab that does not obviously
// hold countries; naming only the field would not say which tab it is on.
//   That step also carries a SECOND label: its in-page heading reads "Company & inventory setup"
// (page.tsx:1423). This copy follows the TAB BAR, because that is the thing a customer clicks.

import { refusalIsFixable, type CountryRefusal } from './engine'
import { countryByIso2 } from '../emissionFactors/countryOptions'

/** The step and field a customer must go to, named exactly as the wizard labels them. */
const WHERE = 'Choose the country in "List your locations" on the Company setup step.'

// ⚠️ PINNED TO ['en'], UNLIKE THE COUNTRY PICKER'S OWN resolveDisplayName, AND DELIBERATELY SO.
// These names reach a workings row, an export and the verifier page, where one reader must not see
// "Japan" while another sees a name in their own locale for the same stored figure. The picker is
// locale-loose on purpose because a picker is read, not filed. Same guard shape as
// lib/emissionFactors/regionNames.ts, which pins ['en'] for the same reason.
const EN_REGIONS: Intl.DisplayNames | null =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

/**
 * The English name for a code, or the code itself.
 *
 * BOTH FAILURE SHAPES ARE HANDLED, as they are in countryOptions: an engine with no entry hands the
 * code straight back, and of() can throw RangeError on a code it rejects. The concordance's own
 * spelling is the second fallback and the bare code the third, so this never returns empty.
 */
export function countryNameEn(iso2: string): string {
  let viaIntl: string | undefined
  try { viaIntl = EN_REGIONS?.of(iso2) } catch { viaIntl = undefined }
  if (viaIntl && viaIntl !== iso2) return viaIntl
  return countryByIso2(iso2)?.source_name ?? iso2
}

/** Which surface is asking. Review addresses the customer; the others state the record. */
export type RefusalSurface = 'review' | 'verifier'

/**
 * ⚠️ 'OTHER' SELECTS A DIFFERENT WORDING WITHIN ONE STATE, AND THE SPLIT IS THE POINT.
 * "Not listed" is an honest answer a customer can give, and there is no remedy, so the copy must
 * not instruct them to fix it. Any other unrecognised value IS fixable, and the copy must say how.
 * One state, because both are refused identically and both reach Category 3 as location_excluded;
 * two renderings, because a single sentence would either scold a customer who did the right thing
 * or leave a broken value with no way out.
 */
const isNotListedChoice = (value: string): boolean => value.trim().toUpperCase() === 'OTHER'

// ⚠️ THE REMEDY CLAUSE READS refusalIsFixable, THE SAME PREDICATE THE EXPORT GATE READS. Added with
// Task 2a, which split the gate by whether the customer can act. This file cannot now offer a remedy
// for a state the gate waves through, nor stay silent about one the gate blocks on, because both
// answers come from one function. A gate that blocks with no remedy strands the customer; a remedy
// offered where nothing is blocked nags about nothing.
const offersRemedy = refusalIsFixable

/**
 * The sentence for a refusal.
 *
 * `hasFigures` gates one clause and nothing else. ⚠️ "Its figures are kept as entered." IS A CLAIM,
 * and on a location with nothing entered it is a false one. Small, but it is the kind that makes a
 * customer doubt the larger sentence beside it.
 */
export function countryRefusalText(
  refusal: CountryRefusal,
  surface: RefusalSurface,
  hasFigures: boolean,
): string {
  const kept = hasFigures ? ' Its figures are kept as entered.' : ''
  const review = (lead: string, remedy: boolean) =>
    `${lead}${kept}${remedy ? ` ${WHERE}` : ''}`

  switch (refusal.state) {
    case 'country_not_set':
      return surface === 'review'
        ? review('This location has no country set, so its energy is not priced and is left out of every total.', offersRemedy(refusal))
        : 'No country recorded for this location. Nothing from this location is included in any total on this report.'

    case 'country_not_listed':
      if (isNotListedChoice(refusal.value)) {
        return surface === 'review'
          ? review("This location's country is set to Not listed, so its energy is not priced and is left out of every total.", offersRemedy(refusal))
          : 'The country for this location was recorded as not listed. No emission factor set is held for it, and nothing from this location is included in any total on this report.'
      }
      // The stored value is QUOTED, never paraphrased. A customer who sees it can match it to what
      // they picked, and a verifier can check it against the record. "An unrecognised value" leaves
      // both of them nothing to act on.
      return surface === 'review'
        ? review(`This location's country is recorded as "${refusal.value}", which does not name a country, so its energy is not priced and is left out of every total.`, offersRemedy(refusal))
        : `The country recorded for this location, "${refusal.value}", does not name a country. Nothing from this location is included in any total on this report.`

    case 'country_not_supported': {
      // ⚠️ THE NAME IS ALWAYS IN BRACKETS, SO NO NAME EVER NEEDS AN ARTICLE. "for Philippines" is
      // wrong and "for the Philippines" is right; "for Gambia" and "for the Gambia" divide opinion.
      // A generated sentence cannot know which, and getting it wrong in an exported document reads
      // as carelessness about the country rather than about grammar. The bracket form is correct
      // for every name in the list and needs no exception table.
      const name = countryNameEn(refusal.iso2)
      return surface === 'review'
        ? review(`We do not hold emission factors for this location's country (${name}), so its energy is not priced and is left out of every total.`, offersRemedy(refusal))
        : `No emission factor set is held for this location's country (${name}). Nothing from this location is included in any total on this report.`
    }
  }
}

/** The short label a badge or a column shows. Not a sentence; never used in place of one. */
export function countryRefusalLabel(refusal: CountryRefusal): string {
  switch (refusal.state) {
    case 'country_not_set': return 'No country set'
    case 'country_not_listed': return isNotListedChoice(refusal.value) ? 'Country not listed' : 'Country not recognised'
    case 'country_not_supported': return `No factors held (${countryNameEn(refusal.iso2)})`
  }
}

// ── THE BANNER SHELL AROUND THE SENTENCE ─────────────────────────────────────────────────────────
//
// The Energy and fuel step wraps the refusal sentence in a heading and a trailer that were written
// for a unit mismatch, which is always fixable. Read against a refusal the customer cannot clear
// they are wrong twice over: "yet" promises a fix that is not coming, and the trailer repeated
// "left out of your totals" immediately after the sentence had just said it.
//
// ⚠️ SELECTED BY refusalIsFixable, THE SAME PREDICATE THE GATE AND THE REMEDY CLAUSE READ. A third
// answer to "can this be fixed" would be a third thing to keep in step.

/** The banner heading above a refusal sentence. */
export function refusalBannerHeading(refusal: CountryRefusal): string {
  return refusalIsFixable(refusal)
    ? "We can't work out this location's emissions yet"
    : "We don't calculate emissions for this location"
}

/**
 * The line under a refusal sentence.
 *
 * ⚠️ IT SAYS ONLY WHAT THE SENTENCE ABOVE IT HAS NOT ALREADY SAID, AND THAT IS WHY IT TAKES
 * `hasFigures`. Every refusal sentence ends by saying the location is left out of every total, so
 * the trailer no longer repeats that. When figures were entered the sentence ALSO ends "Its figures
 * are kept as entered", so the trailer drops its second clause too and is left with the one thing
 * neither has said: an absence is not a zero.
 *   Two lines that overlap are worse than one longer line. A reader who meets the same fact twice
 * in two wordings starts looking for the difference between them.
 */
export function refusalBannerTrailer(_refusal: CountryRefusal, hasFigures: boolean): string {
  return hasFigures
    ? "It isn't counted as zero."
    : "It isn't counted as zero, and nothing you've entered here is lost."
}

/**
 * The heading over the live results panel for a location that is not priced.
 *
 * ⚠️ SAME SPLIT AS refusalBannerHeading, AND FOR THE SAME REASON: "yet" is a promise. On a country
 * set to "Not listed", or one this platform holds no factors for, no result is coming however long
 * the customer waits, and a heading that keeps saying "yet" eventually reads as a fault in the
 * product rather than a limit of it.
 */
export function refusalResultsHeading(refusal: CountryRefusal): string {
  return refusalIsFixable(refusal)
    ? 'No results for this location yet'
    : 'No results for this location'
}
