// ── CATEGORY 3: READING THE BOUND GHG INVENTORY ──────────────────────────────────────────────────
//
// Pure adapter. It takes the two jsonb columns the Scope 3 page already fetches from ghg_inventories
// (`workings` and `locations_data`) as `unknown`, and returns the input rows lib/scope3/cat3Energy.ts
// prices, or a named reason why it cannot. IT NEVER THROWS: a bound inventory the reader cannot use is
// an answer, not a crash.
//
// ⚠️ NOTHING FROM lib/ghg/engine.ts, DIRECTLY OR INDIRECTLY. The Scope 3 page loads this module, and the
// engine carries every factor table in the product. Everything below is read structurally from the two
// columns, and the engine's own rules are MIRRORED with the line numbers they were copied from, so a
// reader can check them side by side. cat3Inputs.test.ts asserts the mirrored declaration logic gives
// the same answer as the engine's findUndeclaredStreams for a set of fixtures; the test may import the
// engine, this module may not.
//
// ⚠️ THE ACTIVITY COMES FROM workings, NOT FROM locations_data (design decision 3). A workings row
// carries the figure that actually priced, after any coverage resolution; locations_data can hold a
// grossed-up figure written in an earlier session (lib/ghg/engine.test.ts:411).
//
// ⚠️ THE COUNTRY COMES FROM locations_data, JOINED ON THE LOCATION NAME, BECAUSE A WORKINGS ROW HAS NO
// COUNTRY (design 10a). Nothing makes a name unique, and an unnamed location becomes the literal
// 'Location' (engine.ts:2786). Where the join cannot answer, the country is null and country_resolved
// is false: the pricing module then flags a UK stand-in anyway, which over-discloses rather than
// claiming a UK site.

import type { Cat3InputRow, Cat3Inputs, Cat3Stream } from './cat3Energy'

// ── WHAT CANNOT BE READ ───────────────────────────────────────────────────────────────────────────

export type Cat3InputsReason =
  /** The bound inventory has no saved workings: the column is null, or not an array. */
  | { code: 'no_workings' }
  /** Rows are present but lack the fields Category 3 reads; the inventory predates them. */
  | { code: 'workings_shape_unreadable'; rows: number }
  /** Without locations_data there is no country and no declaration state, so decision 6 cannot be answered. */
  | { code: 'no_locations_data' }

export type Cat3Skipped =
  /** A location the GHG engine excluded from its own totals; it contributes nothing here either. */
  | { code: 'location_excluded'; location: string }
  /** Refrigerants are Scope 1 fugitive emissions and not a Category 3 input at all. */
  | { code: 'refrigerants_not_in_category'; location: string }
  /** The market-based electricity row; the location-based row is the basis (design decision 3). */
  | { code: 'market_based_row_not_used'; location: string }
  /** A row whose stream this reader does not recognise. Named, never guessed at. */
  | { code: 'stream_not_recognised'; location: string; stream: string; source: string }
  /** A mobile row whose fuel the source line does not name; mobile carries two. */
  | { code: 'mobile_fuel_not_named'; location: string; source: string }
  /** A row with no usable activity figure. */
  | { code: 'activity_missing'; location: string; stream: string }
  /**
   * A stream the GHG side itself could not price in its jurisdiction (declaration
   * 'no_published_factor'). The name says Scope 2 because, in the engine as it stands, that marker
   * has exactly ONE emission site and it is inside the purchased-steam branch — engine.ts:2914,
   * reached only from `if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0)` at :2892.
   * A SCOPE 1 FUEL WITH NO FACTOR TAKES A DIFFERENT PATH: pickEF returns MissingEF, calcGas's
   * assertPriceable (:2174, :2275) throws, and unpriceableReason (:2378) turns the throw into a
   * whole-location exclusion — `declaration: 'unpriceable'` at :2798-2803, which is the skip above.
   * C3I-14 pins both halves. If the marker is ever widened to a Scope 1 stream, this code name is
   * then wrong: rename it `not_priced_in_ghg_inventory`, keeping `stream`, which already names it.
   */
  | { code: 'scope2_not_priced'; location: string; stream: string }

export interface Cat3InputsResult {
  /** null when the inventory cannot be read at all; `reason` says why. */
  inputs: Cat3Inputs | null
  reason: Cat3InputsReason | null
  /** Rows deliberately not passed to the pricing module, each with its code. */
  skipped: Cat3Skipped[]
  /** Location names whose country the join could not answer. */
  unresolved_locations: string[]
  /** Per location and stream, what the declaration answer was. For Task 5's copy. */
  undeclared_detail: { location: string; stream: string; state: 'undeclared' | 'declared_unquantified' }[]
}

// ── THE TWO COLUMNS, READ STRUCTURALLY ────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const bool = (v: unknown): boolean => v === true

/**
 * The UK, exactly as the engine recognises it: 'GB' or 'UK', upper-cased and trimmed
 * (lib/ghg/engine.ts:1269-1270, efJurisdiction). The country select stores 'GB'
 * (app/dashboard/ghg/page.tsx:1571); 'UK' is accepted because the engine accepts it.
 *
 * ⚠️ AND NO FALLBACK TO THE US. efJurisdiction ends `return 'US'` for anything it does not recognise
 * (engine.ts:1276), which is right for picking a factor table and wrong here: an unrecognised country
 * is NOT-UK, and Category 3 says so rather than calling it American. This module never maps a country
 * to a jurisdiction at all; it answers one question, "is this the UK", and hands the rest on.
 */
const isUk = (country: string): boolean => {
  const c = country.toUpperCase().trim()
  return c === 'GB' || c === 'UK'
}

/** The nine streams a location can declare, in the engine's own order (engine.ts:3071-3074). */
const DECLARABLE_STREAMS = [
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
  'mobile', 'refrigerants', 'electricity', 'purchased_steam',
] as const
type DeclarableStream = typeof DECLARABLE_STREAMS[number]

/**
 * ⚠️ MIRRORED FROM THE ENGINE, NOT IMPORTED, AND THE TEST PINS THE TWO TOGETHER. streamDeclared is
 * engine.ts:3127-3143 and streamQuantified is engine.ts:3146-3158; the attestation rule below is
 * findUndeclaredStreams, engine.ts:3179-3191. Electricity has no checkbox, so its quantity is the only
 * signal there is (the engine's own note at engine.ts:3118-3122).
 */
function declaredAndQuantified(loc: Record<string, unknown>, s: DeclarableStream): [boolean, boolean] {
  switch (s) {
    case 'natural_gas': return [bool(loc.has_natural_gas), (num(loc.natural_gas_amount) ?? 0) > 0]
    case 'propane': return [bool(loc.has_propane), (num(loc.propane_amount) ?? 0) > 0]
    case 'diesel_stationary': return [bool(loc.has_diesel_stationary), (num(loc.diesel_stationary_amount) ?? 0) > 0]
    case 'fuel_oil_distillate': return [bool(loc.has_fuel_oil_distillate), (num(loc.fuel_oil_distillate_amount) ?? 0) > 0]
    case 'fuel_oil_residual': return [bool(loc.has_fuel_oil_residual), (num(loc.fuel_oil_residual_amount) ?? 0) > 0]
    case 'mobile': return [bool(loc.has_mobile),
      (num(loc.gasoline_amount) ?? 0) > 0 || (num(loc.diesel_mobile_amount) ?? 0) > 0]
    // Either refrigerant answer declares the stream; ammonia is declarable though never priced.
    case 'refrigerants': return [bool(loc.has_hfc_refrigerants) || bool(loc.uses_ammonia),
      (num(loc.refrigerant_purchased_kg) ?? 0) > 0]
    case 'purchased_steam': return [bool(loc.has_purchased_steam), (num(loc.purchased_steam_mmbtu) ?? 0) > 0]
    case 'electricity': {
      const kwh = (num(loc.electricity_kwh) ?? 0) > 0
      return [kwh, kwh]
    }
  }
}

function declarationState(locations: Record<string, unknown>[]) {
  const detail: Cat3InputsResult['undeclared_detail'] = []
  for (const loc of locations) {
    const attested = new Set(
      (Array.isArray(loc.stream_attestations) ? loc.stream_attestations : [])
        .filter(isRecord).map(a => str(a.stream)),
    )
    for (const stream of DECLARABLE_STREAMS) {
      const [declared, quantified] = declaredAndQuantified(loc, stream)
      if (declared && quantified) continue                       // 'quantified': answered and supplied
      const state = declared ? 'declared_unquantified' : 'undeclared'
      // An attestation answers 'undeclared'. It does NOT answer 'declared_unquantified': a site cannot
      // attest a stream absent and also report using it (engine.ts:3186-3188).
      if (state === 'undeclared' && attested.has(stream)) continue
      detail.push({ location: str(loc.name) || 'Location', stream, state })
    }
  }
  const undeclared = DECLARABLE_STREAMS.filter(s => detail.some(d => d.stream === s))
  return { undeclared, detail }
}

/** Location name to country, or null where the join cannot answer. Never guesses. */
function countryByName(locations: Record<string, unknown>[]): Map<string, string | null> {
  const seen = new Map<string, Set<string>>()
  for (const loc of locations) {
    const name = str(loc.name).trim()
    // ⚠️ A BLANK NAME CANNOT BE JOINED ON. buildWorkings writes the literal 'Location' for an unnamed
    // location (engine.ts:2786), and two unnamed locations are indistinguishable by name.
    const key = name === '' ? 'Location' : name
    const country = str(loc.country).toUpperCase().trim()
    const set = seen.get(key) ?? new Set<string>()
    set.add(country)
    seen.set(key, set)
  }
  const out = new Map<string, string | null>()
  for (const [name, countries] of seen) {
    // ⚠️ TWO LOCATIONS OF THE SAME NAME IN DIFFERENT COUNTRIES CANNOT BE TOLD APART. Unresolved, not
    // the first one found.
    if (countries.size !== 1) { out.set(name, null); continue }
    const only = [...countries][0]
    // '' is never answered and 'OTHER' names no country: neither identifies where the site is, and a
    // stand-in disclosure that says "unknown" is truer than one that says "OTHER".
    out.set(name, only === '' || only === 'OTHER' ? null : only)
  }
  return out
}

// ── THE WORKINGS ROWS CATEGORY 3 READS ────────────────────────────────────────────────────────────

/**
 * Mobile carries two fuels in one stream, so the fuel has to be read from the row's source line —
 * `stream` says only 'mobile'. The engine writes the line as a LITERAL and pushFuel (:2766-2789)
 * passes `source` through to the row untouched, so there are exactly two strings to match:
 *   'Gasoline (mobile)'  engine.ts:2852
 *   'Diesel (mobile)'    engine.ts:2853
 *
 * ⚠️ NEITHER MATCH MEANS UNPRICED, NEVER A DEFAULT. Petrol and diesel have different factors
 * (defraEnergy 0.58094 vs 0.61101 kg CO2e/litre), so guessing between them would put a figure a
 * verifier could check against a fuel nobody said was burned. A row whose text matches neither is
 * returned as `mobile_fuel_not_named` WITH the text, so what was not read can be seen. C3I-13.
 *
 * NO EARLIER WORDING IS KNOWN. The two literals above are the only occurrences in the tree; the
 * only other reader, engine.test.ts:228-229 and :2517, matches them exactly. Nothing here is
 * derived from git history. One near-miss worth knowing: the unit-picker label at engine.ts:1834
 * calls the same fuel 'petrol (mobile)' — a form field's label, never a workings source, and it is
 * deliberately NOT matched, because matching a string the engine has never been observed to write
 * is a guess dressed as compatibility.
 */
function mobileStream(source: string): Cat3Stream | null {
  const s = source.toLowerCase()
  if (s.includes('gasoline')) return 'mobile_gasoline'
  if (s.includes('diesel')) return 'mobile_diesel'
  return null
}

const FUEL_STREAMS: Record<string, Cat3Stream> = {
  natural_gas: 'natural_gas', propane: 'propane', diesel_stationary: 'diesel_stationary',
  fuel_oil_distillate: 'fuel_oil_distillate', fuel_oil_residual: 'fuel_oil_residual',
}

/**
 * Category 3's inputs from the bound inventory, or the reason there are none.
 *
 * @param workings       ghg_inventories.workings, as fetched
 * @param locationsData  ghg_inventories.locations_data, as fetched
 */
export function cat3InputsFrom(workings: unknown, locationsData: unknown): Cat3InputsResult {
  const empty = (reason: Cat3InputsReason): Cat3InputsResult =>
    ({ inputs: null, reason, skipped: [], unresolved_locations: [], undeclared_detail: [] })

  if (!Array.isArray(workings) || workings.length === 0) return empty({ code: 'no_workings' })
  if (!Array.isArray(locationsData)) return empty({ code: 'no_locations_data' })
  const locations = locationsData.filter(isRecord)

  const rows = workings.filter(isRecord)
  // ⚠️ AN OLDER SHAPE IS NOT AN EMPTY INVENTORY. An inventory saved before these fields existed has
  // rows that carry none of them; reading it as "no energy" would report a zero for a site that burns
  // fuel. The reader says the shape is one it cannot read, and the remedy is to re-save the inventory.
  const readable = rows.filter(r => 'activity_data' in r && 'activity_unit' in r && 'scope' in r)
  if (readable.length === 0) return empty({ code: 'workings_shape_unreadable', rows: rows.length })

  const countries = countryByName(locations)
  const { undeclared, detail } = declarationState(locations)
  const skipped: Cat3Skipped[] = []
  const inputRows: Cat3InputRow[] = []
  const unresolved = new Set<string>()

  // The New Zealand Category 3 line the engine prices itself: scope 3, stamped 'scope3-cat3'
  // (engine.ts:2889-2891). Held aside and attached to that location's electricity row.
  const nzByLocation = new Map<string, number>()
  for (const r of readable) {
    if (num(r.scope) === 3 && str(r.gwp_basis) === 'scope3-cat3') {
      const t = num(r.result_tco2e)
      if (t !== null) nzByLocation.set(str(r.location) || 'Location', t)
    }
  }

  let n = 0
  for (const r of readable) {
    const location = str(r.location) || 'Location'
    const stream = str(r.stream)
    const source = str(r.source)
    const scope = num(r.scope)

    // ⚠️ NOT EVERY WORKINGS ROW IS AN ACTIVITY ROW, and reading one as activity is how a zero gets
    // invented. buildWorkings also emits: one row per location it could not price (declaration
    // 'unpriceable', engine.ts:2798-2803); one per declared stream with no published factor
    // ('no_published_factor', engine.ts:2910-2914); one per stream per location recording what the
    // customer answered ('declared_unquantified' | 'attested_absent' | 'undeclared',
    // engine.ts:2974-2982); and one per coverage resolution (scope 0, engine.ts:2991-3004).
    const declaration = str(r.declaration)
    if (declaration === 'unpriceable') {
      skipped.push({ code: 'location_excluded', location })
      continue
    }
    if (declaration === 'no_published_factor') {
      // The GHG side could not price this stream in its own jurisdiction, and its export gate blocks
      // on it (findSteamFactorGaps). Pricing its upstream anyway would report a Category 3 figure for
      // a stream with no Scope 2 figure beside it. Purchased steam is the only stream that reaches
      // here today — see the note on the reason code — but the test is on the MARKER, not on the
      // stream, so a widened marker keeps the behaviour and only the code name would need changing.
      skipped.push({ code: 'scope2_not_priced', location, stream })
      continue
    }
    // The declaration bookkeeping rows carry no activity: the declaration state is read from
    // locations_data instead, so these are passed over without a skip entry of their own.
    if (declaration !== '') continue
    if (scope === 3) continue                       // the NZ row, already held aside
    // Coverage-resolution and other audit rows: scope 0, no activity, nothing to price.
    if (scope !== 1 && scope !== 2) continue
    if (stream === 'refrigerants') {
      skipped.push({ code: 'refrigerants_not_in_category', location })
      continue
    }
    if (stream === 'electricity' && str(r.scope2_method) === 'market-based') {
      skipped.push({ code: 'market_based_row_not_used', location })
      continue
    }

    let cat3Stream: Cat3Stream | null = null
    if (stream === 'mobile') {
      cat3Stream = mobileStream(source)
      if (!cat3Stream) { skipped.push({ code: 'mobile_fuel_not_named', location, source }); continue }
    } else if (stream === 'electricity' || stream === 'purchased_steam') {
      cat3Stream = stream
    } else if (FUEL_STREAMS[stream]) {
      cat3Stream = FUEL_STREAMS[stream]
    } else {
      skipped.push({ code: 'stream_not_recognised', location, stream, source })
      continue
    }

    const activity = num(r.activity_data)
    if (activity === null) {
      skipped.push({ code: 'activity_missing', location, stream })
      continue
    }

    const resolved = countries.has(location) && countries.get(location) !== null
    if (!resolved) unresolved.add(location)
    const country = resolved ? (countries.get(location) as string) : null

    inputRows.push({
      id: `w${n++}`,
      location,
      stream: cat3Stream,
      activity,
      unit: str(r.activity_unit),
      country,
      country_resolved: resolved,
      entry_method: str(r.entry_method) || null,
      ...(cat3Stream === 'electricity'
        ? {
            scope2_method: str(r.scope2_method) === 'location-based' ? 'location-based' as const : null,
            // Only a New Zealand location has one, and only when the customer opted in; without it the
            // pricing module withholds the 3c line and says why, rather than pricing it from DEFRA.
            nz_td_result_tco2e: country !== null && country === 'NZ'
              ? nzByLocation.get(location) ?? null
              : null,
          }
        : {}),
      // The publisher that priced the Scope 1 or Scope 2 figure this row derives from, for the
      // stand-in disclosure. The workings row states it; this module never maps a country to one.
      scope1_publisher: str(r.ef_source) || null,
    })
  }

  return {
    inputs: { rows: inputRows, declaration: { undeclared } },
    reason: null,
    skipped,
    unresolved_locations: [...unresolved],
    undeclared_detail: detail,
  }
}

/** Whether a location's country is the UK, for a caller that holds the country string. Exported so
 *  Task 5's copy can ask the same question this module asks, rather than testing 'GB' itself. */
export const isUnitedKingdom = isUk
