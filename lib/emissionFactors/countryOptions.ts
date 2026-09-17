// ── THE COUNTRY PICKER'S DATA AND MATCHING ───────────────────────────────────────────────────────
//
// One list of the 212 countries the EXIOBASE concordance resolves, plus the matching a customer
// needs to find one by typing. Built from lib/emissionFactors/countryRegions.json so that every
// country control in the product offers the same options and resolves to the same region.
//
// CLIENT-SAFE, ON THE industryOptions.ts PATTERN: this imports countryRegions.json (29 KB) and NOT
// the factor files (2.17 MB between them), which is the whole reason the two are separate
// artefacts. Factors are resolved server-side; nothing here needs a factor to offer a country.
//
// ⚠️ THIS FILE HOLDS NO REGION DESCRIPTION AND MUST NOT GAIN ONE. It returns region_code and stops.
// Whether a region reads to the customer as "RoW Asia and Pacific — a regional average" or as
// anything else is the calling page's text. Putting that string here would move customer-facing
// copy into a data module and give every surface one wording none of them could vary.

import mapping from './countryRegions.json'

export interface CountryOption {
  /** ISO 3166-1 alpha-2, plus XK. The value a caller stores, and the concordance's key. */
  iso2: string
  /** The name to SHOW. Locale-dependent — see resolveDisplayName. */
  display_name: string
  /** country_name exactly as countryRegions.json holds it. Matched against, never displayed as
   *  authority: it carries the SOURCE's spellings, which are frequently not the current ones
   *  ("Swaziland", "Macedonia", "Turkey", "Czech Republic"). */
  source_name: string
  /** One of the 49 EXIOBASE regions: either the country's own code, or a rest-of-world bucket. */
  region_code: string
  basis: 'published' | 'manual-resolution'
}

interface ConcordanceRow {
  iso2: string
  country_name: string
  region_code: string
  basis: 'published' | 'manual-resolution'
}

// ── NORMALISATION ────────────────────────────────────────────────────────────────────────────────

/**
 * The form everything is matched on: case-folded, accent-stripped, punctuation-collapsed.
 *
 * ⚠️ PUNCTUATION HAS TO GO TOO, NOT JUST DIACRITICS, AND CÔTE D'IVOIRE IS WHY. Intl renders it with
 * a CURLY apostrophe (U+2019); the concordance holds a STRAIGHT one (U+0027). NFD plus combining-
 * mark removal strips the circumflex and leaves both apostrophes untouched, so the two spellings of
 * one country still do not compare equal, and a customer typing "Cote d Ivoire" with a space enters
 * a third spelling again. Collapsing every run of non-letters to a single space makes all three
 * fold to "cote d ivoire" — and does the same for "St. Kitts & Nevis" against "St Kitts and Nevis".
 *
 * ⚠️ \p{L}\p{N} RATHER THAN [a-z0-9], BECAUSE DISPLAY NAMES ARE LOCALE-DEPENDENT. Under a non-Latin
 * locale Intl returns non-Latin names; an ASCII-only filter would fold those to the empty string and
 * silently stop matching them altogether. Keeping all letters means a Japanese display name stays
 * matchable by a Japanese query, with source_name matchable either way.
 */
export function foldForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// ── DISPLAY NAMES ────────────────────────────────────────────────────────────────────────────────

const DISPLAY_NAMES: Intl.DisplayNames | null =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(undefined, { type: 'region' })
    : null

/**
 * The name to show for a code: Intl first, the concordance's spelling as the fallback.
 *
 * ⚠️ DISPLAY NAMES ARE LOCALE-DEPENDENT, AND THAT IS ACCEPTED HERE RATHER THAN WORKED AROUND.
 * Intl.DisplayNames answers in the runtime's own locale out of whatever CLDR the engine ships, so
 * one code renders "Germany", "Allemagne" or "ドイツ" depending on who is looking, and two browsers
 * on different ICU releases can disagree. That is right for a name shown to a person and wrong for
 * anything else — which is exactly why source_name sits beside it. THE CONCORDANCE'S NAME IS WHAT
 * THE DATA KEYS ON AND IT IS NEVER DISPLAYED AS AUTHORITY: a figure is traced by iso2 and
 * region_code, never by either name, so a verifier's trail does not move when a locale does.
 *
 * ⚠️ XK IS THE CODE THAT NEEDED CHECKING, AND IT BEHAVES. ISO 3166-1 assigns Kosovo nothing — XK is
 * user-assigned — so there was no reason to assume Intl would know it. Probed on Node 24 / en-US it
 * returns "Kosovo", a real name, so the common path needs no special case. The fallback below is
 * what covers a runtime that does not know it, and both failure shapes are handled: an engine with
 * no entry hands the code straight back ("XK"), caught by the `=== iso2` test, and `of()` can throw
 * RangeError on a code it rejects outright, caught by the try. Either way XK falls back to the
 * concordance's own "Kosovo" rather than rendering as a bare code or as an empty option.
 */
function resolveDisplayName(iso2: string, sourceName: string): string {
  let viaIntl: string | undefined
  try {
    viaIntl = DISPLAY_NAMES?.of(iso2)
  } catch {
    viaIntl = undefined
  }
  // Nothing back, or the code handed back unchanged: both mean "this runtime has no name for it".
  if (!viaIntl || viaIntl === iso2) return sourceName
  return viaIntl
}

// ── SYNONYMS ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Typed string -> iso2, for the names neither Intl nor the concordance produces.
 *
 * ⚠️ MATCHED ON THE WHOLE QUERY, NOT AS A SUBSTRING, AND THAT IS WHAT KEEPS 'KOREA' HONEST. A
 * synonym fires only when the folded query EQUALS the key, so typing "Korea" does not hit the
 * 'south korea' or 'north korea' entries; it falls through to substring matching and returns BOTH
 * KR and KP for the customer to choose between. A picker that resolved "Korea" to one of them would
 * be choosing a country on the customer's behalf and showing no sign it had done so.
 *   That whole-query rule now carries more weight than it used to: a synonym OUTRANKS a
 * display_name prefix match (see matchCountries), so a careless key here can push a real country
 * down the list. Before adding one, check that it is not also the name, or the start of the name,
 * of a country it does not point at.
 *
 * ⚠️ 'CONGO' IS DELIBERATELY ABSENT FOR THE SAME REASON — and needs no entry anyway. Intl renders
 * CD and CG as "Congo - Kinshasa" and "Congo - Brazzaville", so a bare "congo" starts-with matches
 * both and both are offered. The two unambiguous long forms ARE listed, because they match nothing
 * otherwise: they differ from each other by the word "Democratic", so neither can be reached by
 * typing the other.
 *
 * ⚠️ 'SAINT' IS NOT A SPELLING EITHER SOURCE USES. Both Intl and the concordance write "St.", which
 * folds to "st", so "Saint Lucia" matches nothing at all without an entry here. Three entries, one
 * per country: LC, KN, VC.
 *
 * Several entries are redundant under an en-US runtime — Intl already answers "Eswatini",
 * "Czechia", "Laos", "South Korea", "Türkiye" — and are kept regardless, both because the spec
 * names them and because they stop being redundant the moment the locale changes or the concordance
 * is regenerated from a source with other spellings. Redundant entries cost a map lookup; missing
 * ones cost a customer a country they cannot find.
 *
 * EVERY VALUE MUST BE AN iso2 PRESENT IN THE 212. Asserted at module load below — and that
 * assertion has already earned its place: MF (St. Martin) is NOT in the concordance, so a fourth
 * "Saint" entry would have offered a country that resolves to no region.
 */
export const SYNONYMS: Readonly<Record<string, string>> = {
  // ── required by the spec ──
  holland: 'NL',
  uae: 'AE',
  emirates: 'AE',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  uk: 'GB',
  usa: 'US',
  america: 'US',
  'ivory coast': 'CI',
  burma: 'MM',
  czechia: 'CZ',
  'czech republic': 'CZ',
  'south korea': 'KR',
  'north korea': 'KP',
  russia: 'RU',
  vietnam: 'VN',
  laos: 'LA',
  'cape verde': 'CV',
  swaziland: 'SZ',
  macedonia: 'MK',
  turkey: 'TR',
  turkiye: 'TR',

  // ── added: each verified to match NOTHING without an entry here ──
  'great britain': 'GB',
  'northern ireland': 'GB',
  'united states of america': 'US',
  'saint lucia': 'LC',
  'saint kitts and nevis': 'KN',
  'saint vincent and the grenadines': 'VC',
  drc: 'CD',
  'democratic republic of the congo': 'CD',
  'republic of the congo': 'CG',
  'east timor': 'TL',
  macau: 'MO',

  // ── added: reachable already, but only by substring, which ranks them last ──
  'cabo verde': 'CV',          // the current UN spelling; the concordance holds "Cabo Verde"
  eswatini: 'SZ',              // the current name; the concordance holds "Swaziland"
  'north macedonia': 'MK',     // the current name; the concordance holds "Macedonia"
}

// ── THE LIST ─────────────────────────────────────────────────────────────────────────────────────

interface Indexed extends CountryOption {
  _display: string
  _source: string
}

const INDEXED: readonly Indexed[] = (() => {
  const rows = (mapping as { mapping: ConcordanceRow[] }).mapping
  const out = rows.map<Indexed>(r => {
    const display_name = resolveDisplayName(r.iso2, r.country_name)
    return {
      iso2: r.iso2,
      display_name,
      source_name: r.country_name,
      region_code: r.region_code,
      basis: r.basis,
      _display: foldForMatch(display_name),
      _source: foldForMatch(r.country_name),
    }
  })
  out.sort((a, b) => a.display_name.localeCompare(b.display_name))
  return out
})()

function strip(o: Indexed): CountryOption {
  const { _display, _source, ...pub } = o
  return pub
}

/** All 212, sorted by display_name. */
export const COUNTRY_OPTIONS: readonly CountryOption[] = INDEXED.map(strip)

const BY_ISO2: ReadonlyMap<string, Indexed> = new Map(INDEXED.map(o => [o.iso2, o]))

// ⚠️ FAIL AT LOAD, NOT AT THE FIRST MISSED SEARCH. A synonym pointing at a code the concordance does
// not carry is a typo that would otherwise surface as a country the customer can name but never
// select — on a screen nobody thinks to test by typing "Holland". Throwing here makes it a build
// failure instead, which is the only place it is cheap.
{
  const missing = Object.entries(SYNONYMS).filter(([, iso2]) => !BY_ISO2.has(iso2))
  if (missing.length > 0) {
    throw new Error(
      `countryOptions: ${missing.length} SYNONYMS entr${missing.length === 1 ? 'y targets' : 'ies target'} ` +
      `an iso2 absent from countryRegions.json: ` +
      missing.map(([k, v]) => `"${k}" -> ${v}`).join(', '),
    )
  }
}

/**
 * The option for a code, or undefined.
 *
 * Never throws. A stored value we no longer recognise must stay inspectable rather than crash the
 * screen rendering it — the same reason industryOptions.industryName() hands back the code itself
 * on a miss rather than blanking the field.
 */
export function countryByIso2(iso2: string): CountryOption | undefined {
  const hit = BY_ISO2.get(iso2)
  return hit ? strip(hit) : undefined
}

// ── MATCHING ─────────────────────────────────────────────────────────────────────────────────────

const RANK_ISO2 = 0
const RANK_SYNONYM = 1
const RANK_STARTS = 2
const RANK_SUBSTRING = 3

/**
 * Countries matching a typed query, best first, at most `limit` (default 8).
 *
 * Rank: exact iso2, then a whole-query synonym, then display_name starts-with, then substring
 * anywhere (display or source). Ties break on display_name, so the order is stable for a given
 * query.
 *
 * ⚠️ iso2 MATCHES IN FULL OR NOT AT ALL. The code is compared against the whole folded query, so
 * "DE" finds Germany and "d" finds nothing by code. Letting a two-letter field join substring
 * matching would put code noise at the top of every short query.
 *   One deliberate consequence: typing exactly "in" ranks India first, because IN is India's code.
 * That is the code field working, not a collision.
 *
 * ⚠️ A WHOLE-QUERY SYNONYM OUTRANKS A PREFIX MATCH, AND THE REASONING IS ABOUT EVIDENCE OF
 * INTENT, NOT ABOUT ANY PARTICULAR COUNTRY. An exact match on a name we already know people use is
 * stronger evidence of what the customer meant than a prefix match on a name that merely begins
 * with the same letters. Someone typing "uk" means the United Kingdom; Ukraine sharing those two
 * letters is a coincidence of spelling, and ranking the coincidence first puts the wrong country at
 * the top of the list. The rule is general — nothing here special-cases GB — and it costs the
 * prefix match nothing: Ukraine is still returned, one place lower.
 *   ⚠️ "uk" IS THE ONLY QUERY THIS ORDERING ACTUALLY REORDERS. All 38 synonym keys were checked
 * against all 212 display names: 'uk' -> GB is the sole key that is a prefix of a different
 * country's name, and NO key equals a different country's name outright. So the swap is not a
 * trade-off between two populated buckets — it moves one pair. If a future synonym is added, that
 * check is worth re-running, because a key that collides with a whole country name would now
 * outrank it.
 *
 * An empty or whitespace-only query returns an empty array rather than the whole list, which a
 * typeahead would otherwise render as a 212-row dropdown the moment the field takes focus.
 */
export function matchCountries(query: string, limit = 8): CountryOption[] {
  const q = foldForMatch(query)
  if (q === '') return []

  const asCode = q.length === 2 ? q.toUpperCase() : null
  const synonymTarget = SYNONYMS[q]

  const scored: Array<{ rank: number; o: Indexed }> = []
  for (const o of INDEXED) {
    let rank: number
    if (asCode !== null && o.iso2 === asCode) rank = RANK_ISO2
    else if (synonymTarget === o.iso2) rank = RANK_SYNONYM
    else if (o._display.startsWith(q)) rank = RANK_STARTS
    else if (o._display.includes(q) || o._source.includes(q)) rank = RANK_SUBSTRING
    else continue
    scored.push({ rank, o })
  }

  scored.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.o.display_name.localeCompare(b.o.display_name),
  )

  return scored.slice(0, limit).map(({ o }) => strip(o))
}
