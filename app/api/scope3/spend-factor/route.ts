// app/api/scope3/spend-factor/route.ts
// ThemisIQ — price spend lines against the active EXIOBASE factor edition.
//
// The server half of spend-based pricing. lib/emissionFactors/spendResolver.server.ts imports 2.17 MB
// of factor JSON and must never reach a browser bundle, so a client page cannot call it directly;
// this route is how it gets called. The house pattern: POST, the caller's bearer token,
// getAuthedClient(bearerFrom(req)) so RLS applies as that user. Errors carry { code, message,
// operator_detail }; see ERRORS below for why there are two texts.
//
// PER LINE, IN THIS ORDER. Steps 2-5 are the order lib/emissionFactors/spendAdjustment.ts documents:
//   1. Resolve country_iso2 to its EXIOBASE region through countryRegions.json (at validation, so an
//      unsupported country rejects the request before anything is priced).
//   2. resolveSpendFactor with NO fallback_regions. A miss is a miss.
//   3. On a hit, find the conversion row for (active edition, region, reporting_currency) and
//      convertSpendToFactorBasis — the spend is now in 2019 EUR.
//   4. assertSingleFactorBasisConversion on that line's adjustments, before anything is multiplied.
//   5. kg = converted spend x factor.value, DIRECTLY. See the 1e6 note at the multiplication.
//
// ⚠️ NO FALLBACK REGIONS, DELIBERATELY. The resolver invents no geography and neither does this
// route: a region with no factor for the sector returns no_factor rather than a neighbour's figure.
// Climatiq's region_fallback also defaults to off. A caller wanting a substitution must ask for one
// in a future version of this contract, and it will then be disclosed as one.
//
// ⚠️ THE CALLER SENDS A COUNTRY, NEVER A REGION, AND THAT IS WHAT MAKES 'WF' SAFE. Each line carries
// country_iso2; this route resolves it through lib/emissionFactors/countryRegions.json, the one
// place country becomes region, and rejects a code with no row there. The region is internal and
// comes back only as OUTPUT (used_region on a priced line, resolved_region on a miss).
//   WF is the reason. It is the ISO code for Wallis and Futuna AND the EXIOBASE code for RoW Africa.
// An earlier version of this route took region_code and validated it against the 49 regions — which
// could not catch WF, because WF IS one of the 49: an unresolved Wallis and Futuna code passed the
// check and was priced as African, and no validation of a region value can tell the two meanings
// apart. Taking the country instead removes the ambiguity rather than detecting it. As an input WF
// can only mean Wallis and Futuna, which has no row among the 212, so it is rejected; as an output it
// can only mean RoW Africa. Should the concordance ever gain a Wallis and Futuna row, it would resolve
// to whatever region that row names, which is still the correct reading of the input.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'
import { resolveSpendFactor } from '../../../../lib/emissionFactors/spendResolver.server'
import {
  convertSpendToFactorBasis,
  assertSingleFactorBasisConversion,
  type SpendAdjustment,
  type SpendConversionBasis,
} from '../../../../lib/emissionFactors/spendAdjustment'
import {
  intensityPositionSentences,
  type PriceBasis,
  type SpendFactor,
  type SpendFactorCaveats,
  type SpendFactorSource,
  type SpendFactorType,
} from '../../../../lib/emissionFactors/spend'
import conversionsFile from '../../../../lib/emissionFactors/spendConversions.json'
import ixiFile from '../../../../lib/emissionFactors/exiobaseFactors2019ixi.json'
import sectorsFile from '../../../../lib/emissionFactors/exiobaseSectors.json'
import countryRegionsFile from '../../../../lib/emissionFactors/countryRegions.json'
import { regionLabel, countryLabel } from '../../../../lib/emissionFactors/regionNames'

// Explicit, not the default by accident: this route imports the factor JSON through the resolver
// and is not an Edge candidate.
export const runtime = 'nodejs'

// ── LIMITS AND VOCABULARY ────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ 500 LINES PER REQUEST. THE CONSTRAINT IS RESPONSE SIZE, NOT COMPUTE.
 *
 * Resolution is a handful of Map lookups per line, so CPU is not what limits a batch. The response
 * is: a priced line carries the full factor, its source record (licence, DOI, the unit-conversion
 * note) and its disclosure sentences. MEASURED on 17 Sep 2026 through this handler, 500 priced lines:
 *     DE / EUR / basic prices                      1,602,254 bytes   3.2 KB per line
 *     WA / USD / purchaser prices, 2025 reporting  1,908,543 bytes   3.8 KB per line
 * the second being the heavy case: a composite region's coverage sentence plus a price-basis
 * sentence on every line. Both sit well inside the 4.5 MB request/response payload limit Vercel
 * documents for functions. 1,000 heavy lines would be ~3.8 MB, too close to that limit to leave
 * room for longer ids, and a response that fails at the platform limit fails with no body this
 * route controls. A register larger than 500 lines is sent in batches. Test R4 pins 500 lines under
 * half the limit.
 */
const MAX_LINES = 500

const REPORTING_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const
type ReportingCurrency = typeof REPORTING_CURRENCIES[number]

const FACTOR_TYPES: readonly SpendFactorType[] = ['industry', 'product']
const PRICE_BASES: readonly PriceBasis[] = ['basic', 'producer', 'purchaser']

const MAX_ID_LENGTH = 200

// ── ARTEFACTS, CHECKED AT LOAD ───────────────────────────────────────────────────────────────────

interface ConversionFileRow {
  region_code: string
  currency: string
  to_eur2019_per_unit: number
  basis: SpendConversionBasis
  gdp_coverage_pct: number | null
}

const CONVERSIONS_META = conversionsFile.metadata as {
  edition_id: string
  fingerprint_sha256: string
  data_vintage: number
  upstream_fingerprints: {
    factors_ixi: string
    factors_pxp: string
    sectors: string
    country_regions: string
    price_indices: string
  }
}

/**
 * The 49 EXIOBASE regions, taken from the factor file the resolver itself reads — not from a list
 * typed here, so the valid set cannot drift from the priced set.
 */
const REGIONS: ReadonlySet<string> = new Set(
  (ixiFile.factors as { region: string }[]).map(f => f.region),
)

const CONVERSIONS: ReadonlyMap<string, ConversionFileRow> = new Map(
  (conversionsFile.rows as ConversionFileRow[]).map(r => [`${r.region_code}|${r.currency}`, r]),
)

// ⚠️ FAIL AT LOAD. A region the factors cover with no conversion row would price as no_factor for a
// reason that has nothing to do with the factor; a conversion row for a region the factors do not
// cover would be dead. Either is an artefact mismatch, and a build or first request is the cheap
// place to find it.
{
  if (REGIONS.size !== 49) {
    throw new Error(`spend-factor route: expected 49 EXIOBASE regions in the factor file, found ${REGIONS.size}`)
  }
  const missing: string[] = []
  for (const region of REGIONS) {
    for (const currency of REPORTING_CURRENCIES) {
      if (!CONVERSIONS.has(`${region}|${currency}`)) missing.push(`${region}/${currency}`)
    }
  }
  if (missing.length > 0 || CONVERSIONS.size !== REGIONS.size * REPORTING_CURRENCIES.length) {
    throw new Error(
      `spend-factor route: spendConversions.json does not cover exactly the 49 regions x 5 currencies ` +
      `(${CONVERSIONS.size} rows; missing: ${missing.join(', ') || 'none'})`,
    )
  }
}

/** iso2 -> EXIOBASE region, from the concordance. The only country-to-region mapping this route uses. */
const COUNTRY_TO_REGION: ReadonlyMap<string, string> = new Map(
  (countryRegionsFile.mapping as { iso2: string; region_code: string }[]).map(r => [r.iso2, r.region_code]),
)

// ⚠️ FAIL AT LOAD if the concordance names a region the factors do not carry. Such a country would be
// accepted here and then fail at the conversion lookup for a reason that is not about the country.
{
  const orphaned = [...COUNTRY_TO_REGION].filter(([, region]) => !REGIONS.has(region))
  if (COUNTRY_TO_REGION.size !== 212 || orphaned.length > 0) {
    throw new Error(
      `spend-factor route: countryRegions.json must map 212 countries onto the 49 factor regions ` +
      `(${COUNTRY_TO_REGION.size} rows; outside the 49: ${orphaned.map(([c, r]) => `${c}->${r}`).join(', ') || 'none'})`,
    )
  }
}

/** EXIOBASE's published name for each code, so a notice a customer reads never names a sector by code
 *  alone. The code stays beside it for whoever needs to find the published row. */
const SECTOR_NAMES: Record<SpendFactorType, ReadonlyMap<string, string>> = {
  industry: new Map((sectorsFile.industries as { exio_code: string; exio_name: string }[]).map(s => [s.exio_code, s.exio_name])),
  product: new Map((sectorsFile.products as { exio_code: string; exio_name: string }[]).map(s => [s.exio_code, s.exio_name])),
}

const KNOWN_SECTORS: Record<SpendFactorType, ReadonlySet<string>> = {
  industry: new Set((sectorsFile.industries as { exio_code: string }[]).map(s => s.exio_code)),
  product: new Set((sectorsFile.products as { exio_code: string }[]).map(s => s.exio_code)),
}

// ── CONTRACT ─────────────────────────────────────────────────────────────────────────────────────

interface RequestLine {
  id: string
  country_iso2: string
  /** Resolved from country_iso2 by this route. Never taken from the caller. */
  region_code: string
  sector_key: string
  factor_type: SpendFactorType
  spend: number
  spend_price_basis: PriceBasis
}

interface PricedLine {
  id: string
  outcome: 'priced'
  country_iso2: string
  emissions_kg: number
  emissions_mt: number
  /** The resolver's SpendFactor, unchanged. factor.value is per ONE EUR at 2019 basic prices. */
  factor: SpendFactor
  source: SpendFactorSource
  /** The EXIOBASE region that priced this line: the country's own code, or a rest-of-world bucket.
   *  ⚠️ An OUTPUT. 'WF' here means RoW Africa, never Wallis and Futuna. */
  used_region: string
  /**
   * The resolver's caveats, VERBATIM. ⚠️ currency_mismatch and price_year_mismatch compare the
   * factor with the QUERY and are computed before any conversion, so on a priced line they are
   * normally true and have been ADDRESSED by `adjustment`. Read them with
   * `caveats_addressed_by_conversion` at the top of the response. price_basis_mismatch and the two
   * intensity positions are NOT addressed by anything and stand as reported; `disclosures` below
   * words them, and words a within-sector position as a rank rather than a caution.
   */
  caveats: SpendFactorCaveats
  adjustment: SpendAdjustment
  edition_id: string
  conversion: { basis: SpendConversionBasis; gdp_coverage_pct: number | null }
  /** Complete sentences for this line. Render them; do not rebuild them from the fields above. */
  disclosures: string[]
}

interface AbsentLine {
  id: string
  outcome: 'absent'
  /** The resolver's reason and explanation, verbatim. The explanation is customer-renderable. */
  reason: string
  explanation: string
  country_iso2: string
  /** The region country_iso2 resolved to. Not "used": nothing was priced. */
  resolved_region: string
  sector_key: string
}

interface NoFactorLine {
  id: string
  outcome: 'no_factor'
  country_iso2: string
  /** The region country_iso2 resolved to. Not "used": nothing was priced. */
  resolved_region: string
  sector_key: string
  factor_type: SpendFactorType
  /** Whether sector_key is a code in exiobaseSectors.json for this factor_type. Checked, not guessed. */
  sector_key_recognised: boolean
  /** What was observed, as a sentence. Names no cause beyond what was checked. */
  notice: string
}

type LineResult = PricedLine | AbsentLine | NoFactorLine

// ── HANDLER ──────────────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate. A 401 carries a body and a code, so a caller can tell it from a failure.
    const { supabase } = await getAuthedClient(bearerFrom(req))

    // ── 2. Parse and validate. Every rejection names the field, and the line where there is one.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return bad('invalid_json', 'The request body is not valid JSON.')
    }
    const parsed = parseRequest(body)
    if ('error' in parsed) return parsed.error
    const { reporting_year, reporting_currency, lines } = parsed

    // ── 3. The active edition, from the database.
    const edition = await readActiveEdition(supabase)
    if ('error' in edition) return edition.error

    // ── 4. Price each line.
    const results: LineResult[] = lines.map(line => priceLine(line, reporting_year, reporting_currency, edition.id))

    return NextResponse.json({
      edition_id: edition.id,
      price_vintage_year: edition.price_vintage_year,
      reporting_year,
      reporting_currency,
      caveats_addressed_by_conversion: ['currency_mismatch', 'price_year_mismatch'],
      ...responseStatements(results, reporting_year, edition),
      lines: results,
    })
  } catch (e) {
    if (e instanceof AuthError) {
      return bad('unauthenticated', e.message, 401, { 'WWW-Authenticate': 'Bearer' })
    }
    // The stack goes to the server log only. operator_detail travels to the browser, and a stack
    // trace there discloses server file paths for no benefit to the person reading it.
    console.error('[scope3/spend-factor] unexpected error:', e)
    return bad('internal_error', `Unexpected error pricing spend lines: ${e instanceof Error ? e.message : String(e)}`, 500)
  }
}

// ── ERRORS ───────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ EVERY ERROR CARRIES TWO TEXTS, AND ONLY ONE OF THEM IS FOR A CUSTOMER.
//   message          plain language, safe to render on any screen. Names no table, column, file,
//                    field, fingerprint or edition id, and guesses at no cause the route did not check.
//   operator_detail  what actually happened, in the terms needed to fix it: which line, which field,
//                    which fingerprints differ, the database's own message. Logged server-side on
//                    every error, and returned so a developer can read it in the network panel.
// A caller renders `message` and nothing else. This used to be one `error` string written for an
// operator, and the Scope 3 page rendered it verbatim, which put "public.factor_editions" in front
// of customers.
//
// The customer text is chosen by CODE from this one table rather than written at each call site, so
// it can be audited in one place and cannot pick up a column name from an interpolated detail.

type ErrorCode =
  | 'unauthenticated' | 'internal_error' | 'invalid_json' | 'invalid_body'
  | 'invalid_reporting_year' | 'invalid_reporting_currency' | 'invalid_lines' | 'too_many_lines'
  | 'invalid_line' | 'invalid_line_id' | 'duplicate_line_id' | 'invalid_country_iso2'
  | 'unsupported_country' | 'invalid_sector_key' | 'invalid_factor_type' | 'invalid_spend'
  | 'invalid_spend_price_basis' | 'edition_read_failed' | 'no_active_edition' | 'edition_artefact_mismatch'

const LINES_UNREADABLE = 'The spend details sent could not be read, so nothing was calculated.'

const CUSTOMER_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: 'Your session has ended. Sign in again to see spend-based estimates.',
  internal_error: 'Something went wrong while estimating this spend, so nothing was calculated. Try again shortly.',
  invalid_json: LINES_UNREADABLE,
  invalid_body: LINES_UNREADABLE,
  invalid_reporting_year: 'The reporting year is missing or not valid, so nothing was calculated.',
  invalid_reporting_currency: 'Spend in this currency cannot be estimated. Supported currencies are USD, EUR, GBP, CAD and AUD.',
  invalid_lines: 'There was no spend to estimate.',
  too_many_lines: `Too much spend was sent at once to estimate. Send at most ${MAX_LINES} entries at a time.`,
  invalid_line: LINES_UNREADABLE,
  invalid_line_id: LINES_UNREADABLE,
  duplicate_line_id: LINES_UNREADABLE,
  invalid_country_iso2: 'The country of supply is missing or not recognised, so nothing was calculated.',
  unsupported_country: 'Spend from this country of supply cannot be estimated yet: it is not covered by the emission factor data.',
  invalid_sector_key: 'No supplier sector was given, so nothing was calculated.',
  invalid_factor_type: LINES_UNREADABLE,
  invalid_spend: 'The spend amount must be a number of zero or more.',
  invalid_spend_price_basis: LINES_UNREADABLE,
  edition_read_failed: 'Emission factor data could not be loaded, so nothing was calculated. Try again shortly.',
  no_active_edition: 'Spend-based estimates are not available at the moment, so nothing was calculated.',
  edition_artefact_mismatch: 'Spend-based estimates are temporarily unavailable because of a configuration problem on our side, so nothing was calculated.',
}

function bad(code: ErrorCode, operator_detail: string, status = 400, headers?: Record<string, string>) {
  const log = status >= 500 ? console.error : console.warn
  log(`[scope3/spend-factor] ${status} ${code}: ${operator_detail}`)
  return NextResponse.json(
    { code, message: CUSTOMER_MESSAGE[code], operator_detail },
    { status, headers },
  )
}

// ── VALIDATION ───────────────────────────────────────────────────────────────────────────────────

type Parsed =
  | { reporting_year: number; reporting_currency: ReportingCurrency; lines: RequestLine[] }
  | { error: NextResponse }

function parseRequest(body: unknown): Parsed {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: bad('invalid_body', 'The request body must be a JSON object.') }
  }
  const b = body as Record<string, unknown>

  if (!Number.isInteger(b.reporting_year)) {
    return { error: bad('invalid_reporting_year', 'reporting_year must be an integer year.') }
  }
  if (!REPORTING_CURRENCIES.includes(b.reporting_currency as ReportingCurrency)) {
    return {
      error: bad('invalid_reporting_currency', `reporting_currency must be one of ${REPORTING_CURRENCIES.join(', ')}.`),
    }
  }
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return { error: bad('invalid_lines', 'lines must be a non-empty array.') }
  }
  if (b.lines.length > MAX_LINES) {
    return {
      error: bad(
        'too_many_lines',
        `lines holds ${b.lines.length} entries; the maximum per request is ${MAX_LINES}. ` +
        `Send the remainder in further requests.`,
      ),
    }
  }

  const out: RequestLine[] = []
  const seen = new Set<string>()
  for (let i = 0; i < b.lines.length; i++) {
    const raw = b.lines[i] as Record<string, unknown> | null
    const where = `lines[${i}]`
    if (typeof raw !== 'object' || raw === null) {
      return { error: bad('invalid_line', `${where} must be an object.`) }
    }
    const id = raw.id
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) {
      return { error: bad('invalid_line_id', `${where}.id must be a non-empty string of at most ${MAX_ID_LENGTH} characters.`) }
    }
    const at = `${where} (id ${JSON.stringify(id)})`
    if (seen.has(id)) {
      return { error: bad('duplicate_line_id', `${at}: id is used by an earlier line; ids are echoed back and must be unique.`) }
    }
    seen.add(id)

    if (typeof raw.country_iso2 !== 'string' || !/^[A-Z]{2}$/.test(raw.country_iso2)) {
      return {
        error: bad(
          'invalid_country_iso2',
          `${at}: country_iso2 must be a two-letter uppercase ISO 3166-1 alpha-2 code, got ` +
          `${JSON.stringify(raw.country_iso2)}.`,
        ),
      }
    }
    const region = COUNTRY_TO_REGION.get(raw.country_iso2)
    if (region === undefined) {
      return {
        error: bad(
          'unsupported_country',
          `${at}: country_iso2 ${JSON.stringify(raw.country_iso2)} has no entry in the country-to-region ` +
          `concordance, so no EXIOBASE region can be assigned and the line cannot be priced. This field ` +
          `takes a country, not an EXIOBASE region code.`,
        ),
      }
    }
    if (typeof raw.sector_key !== 'string' || raw.sector_key.length === 0) {
      return { error: bad('invalid_sector_key', `${at}: sector_key must be a non-empty EXIOBASE code.`) }
    }
    if (!FACTOR_TYPES.includes(raw.factor_type as SpendFactorType)) {
      return { error: bad('invalid_factor_type', `${at}: factor_type must be 'industry' or 'product'.`) }
    }
    if (typeof raw.spend !== 'number' || !Number.isFinite(raw.spend) || raw.spend < 0) {
      return { error: bad('invalid_spend', `${at}: spend must be a finite number of zero or more.`) }
    }
    if (!PRICE_BASES.includes(raw.spend_price_basis as PriceBasis)) {
      return { error: bad('invalid_spend_price_basis', `${at}: spend_price_basis must be 'basic', 'producer' or 'purchaser'.`) }
    }

    out.push({
      id,
      country_iso2: raw.country_iso2,
      region_code: region,
      sector_key: raw.sector_key,
      factor_type: raw.factor_type as SpendFactorType,
      spend: raw.spend,
      spend_price_basis: raw.spend_price_basis as PriceBasis,
    })
  }

  return {
    reporting_year: b.reporting_year as number,
    reporting_currency: b.reporting_currency as ReportingCurrency,
    lines: out,
  }
}

// ── EDITION ──────────────────────────────────────────────────────────────────────────────────────

interface ActiveEdition {
  id: string
  price_vintage_year: number
}

type SupabaseLike = Awaited<ReturnType<typeof getAuthedClient>>['supabase']

/**
 * Read the one active edition and confirm the artefacts deployed with this code ARE that edition.
 *
 * ⚠️ NO ACTIVE EDITION -> 503, AND THAT IS A PROPOSAL AWAITING A DECISION, NOT A SETTLED CHOICE.
 * Today is_active is false on every row, so as written this route prices nothing in any environment
 * until an edition is activated. It refuses rather than falling back to the edition named inside
 * spendConversions.json, because that fallback would quietly make the artefact the authority and the
 * database decorative — exactly what reading the edition from the database is meant to prevent.
 *
 * ⚠️ A MISMATCH -> 500, NOT A GUESS. The conversion scalars are read from spendConversions.json, not
 * from region_spend_conversions. If the active edition's id or fingerprints differ from that file's,
 * pricing would name one edition while applying another's numbers, and the disclosure would be
 * false. Compared: id, the spend-conversions fingerprint, the five upstream fingerprints, the price
 * vintage, and superseded_by (an active edition that names its own successor is a contradiction).
 * The fingerprints are compared as RECORDED values; this does not re-hash the files at request time.
 * The artefact fingerprint tests in lib/emissionFactors/ are what bind the files to those values.
 */
async function readActiveEdition(supabase: SupabaseLike): Promise<ActiveEdition | { error: NextResponse }> {
  const { data, error } = await supabase
    .from('factor_editions')
    .select(
      'id, price_vintage_year, superseded_by, fingerprint_spend_conversions, fingerprint_factors_ixi, ' +
      'fingerprint_factors_pxp, fingerprint_sectors, fingerprint_country_regions, fingerprint_price_indices',
    )
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return {
      error: bad('edition_read_failed', `Could not read the active factor edition: ${error.message}`, 500),
    }
  }
  if (!data) {
    return {
      error: bad(
        'no_active_edition',
        'No row in public.factor_editions has is_active = true, so no spend can be priced. Nothing was ' +
        'calculated. Mark one edition active before this service returns figures.',
        503,
      ),
    }
  }

  const row = data as unknown as Record<string, unknown>
  const up = CONVERSIONS_META.upstream_fingerprints
  const expected: Record<string, unknown> = {
    id: CONVERSIONS_META.edition_id,
    fingerprint_spend_conversions: CONVERSIONS_META.fingerprint_sha256,
    fingerprint_factors_ixi: up.factors_ixi,
    fingerprint_factors_pxp: up.factors_pxp,
    fingerprint_sectors: up.sectors,
    fingerprint_country_regions: up.country_regions,
    fingerprint_price_indices: up.price_indices,
    price_vintage_year: CONVERSIONS_META.data_vintage,
    superseded_by: null,
  }
  const differing = Object.keys(expected).filter(k => row[k] !== expected[k])
  if (differing.length > 0) {
    return {
      error: bad(
        'edition_artefact_mismatch',
        `The active factor edition ${JSON.stringify(row.id)} does not match the conversion artefact ` +
        `deployed with this service (edition ${JSON.stringify(CONVERSIONS_META.edition_id)}). ` +
        `Differing: ${differing.join(', ')}. Nothing was calculated.`,
        500,
      ),
    }
  }

  return { id: row.id as string, price_vintage_year: row.price_vintage_year as number }
}

// ── PRICING ──────────────────────────────────────────────────────────────────────────────────────

function priceLine(
  line: RequestLine,
  reporting_year: number,
  reporting_currency: ReportingCurrency,
  edition_id: string,
): LineResult {
  // 2. Resolve with NO fallback_regions. The field is omitted, not passed empty, so this reads as
  //    the resolver's own default rather than a choice made here.
  const resolved = resolveSpendFactor({
    region: line.region_code,
    sector_key: line.sector_key,
    factor_type: line.factor_type,
    reporting_currency,
    reporting_year,
    spend_price_basis: line.spend_price_basis,
  })

  if (resolved === null) {
    const recognised = KNOWN_SECTORS[line.factor_type].has(line.sector_key)
    return {
      id: line.id,
      outcome: 'no_factor',
      country_iso2: line.country_iso2,
      resolved_region: line.region_code,
      sector_key: line.sector_key,
      factor_type: line.factor_type,
      sector_key_recognised: recognised,
      // Each branch states only what was checked: whether the code is in the sector list, and that
      // the edition returned no usable factor for it in this region. Nothing about why.
      notice: recognised
        // Region and country by NAME, codes in brackets. "Which covers" only when they differ: for a
        // single-country region it would say Austria covers Austria.
        ? `No emission factor is available for ${SECTOR_NAMES[line.factor_type].get(line.sector_key)} ` +
          `(EXIOBASE ${line.factor_type} ${line.sector_key}) in the EXIOBASE region ${regionLabel(line.region_code)}` +
          `${line.region_code === line.country_iso2 ? '' : `, which covers ${countryLabel(line.country_iso2)},`} ` +
          `in edition ${edition_id}. This line was not priced and is not included in any figure.`
        : `${line.sector_key} is not a recognised EXIOBASE ${line.factor_type} code, so no emission ` +
          `factor could be looked up. This line was not priced and is not included in any figure.`,
    }
  }

  if (resolved.kind === 'absent') {
    return {
      id: line.id,
      outcome: 'absent',
      reason: resolved.reason,
      explanation: resolved.explanation,
      country_iso2: line.country_iso2,
      resolved_region: resolved.requested_region,
      sector_key: resolved.sector_key,
    }
  }

  // No fallback was offered, so anything but 'exact' here is a resolver contract breach, not data.
  if (resolved.kind !== 'exact') {
    throw new Error(`spend-factor route: resolver returned ${resolved.kind} with no fallback_regions requested`)
  }

  // 3. The conversion row. Present for every region x currency by the load-time check above.
  const row = CONVERSIONS.get(`${line.region_code}|${reporting_currency}`)!
  const adjustment = convertSpendToFactorBasis({
    amount: line.spend,
    currency: reporting_currency,
    region_code: line.region_code,
    conversion: {
      edition_id,
      to_eur2019_per_unit: row.to_eur2019_per_unit,
      basis: row.basis,
      gdp_coverage_pct: row.gdp_coverage_pct,
    },
  })

  // 4. Exactly one price-year transformation on this figure.
  assertSingleFactorBasisConversion([adjustment])

  // 5. ⚠️ MULTIPLY DIRECTLY. NO 1e6 HERE.
  //    factor.value is ALREADY per ONE EUR: resolveSpendFactor divided the published per-MILLION-EUR
  //    value by 1e6 when it built the SpendFactor (spendResolver.server.ts, toFactor; recorded in
  //    source.unit_conversion). adjustment.output_amount is plain EUR, not millions. Dividing again
  //    here would make every figure a millionth of its true size — and a millionth of a real figure
  //    is still a positive, well-formed number that no downstream check would reject. Pinned by
  //    test "the 1e6 is applied exactly once".
  const emissions_kg = adjustment.output_amount * resolved.factor.value

  return {
    id: line.id,
    outcome: 'priced',
    country_iso2: line.country_iso2,
    emissions_kg,
    emissions_mt: emissions_kg / 1000,
    factor: resolved.factor,
    source: resolved.source,
    used_region: resolved.used_region,
    caveats: resolved.caveats,
    adjustment,
    edition_id,
    conversion: { basis: row.basis, gdp_coverage_pct: row.gdp_coverage_pct },
    disclosures: lineDisclosures(line, resolved.factor, resolved.caveats, adjustment),
  }
}

// ── DISCLOSURE ───────────────────────────────────────────────────────────────────────────────────

function lineDisclosures(
  line: RequestLine,
  factor: SpendFactor,
  caveats: SpendFactorCaveats,
  adjustment: SpendAdjustment,
): string[] {
  const out = [adjustment.disclosure]
  if (caveats.price_basis_mismatch) {
    out.push(
      `This spend is recorded at ${line.spend_price_basis} prices and the emission factor is in ` +
      `${factor.price_basis} prices. No conversion between the two was made, because the factor ` +
      `source publishes no margin data; trade and transport margins and product taxes are not ` +
      `accounted for.`,
    )
  }
  // ⚠️ THIS REPLACED "lies outside the reliability bounds … treat this figure with particular
  // caution", which fired on 15.4% of priceable industry factors — mostly for being among the
  // LOWEST-intensity regions of a sector, which is not a reason for caution — and used a word
  // customers report under with another meaning. The four cases and their wording live in
  // intensityPositionSentences (spend.ts), shared with the resolver's fallback disclosure.
  out.push(...intensityPositionSentences(caveats, factor.factor_type))
  return out
}

/**
 * The response-level sentences, in TWO lists, because they answer two different questions.
 *
 *   disclosures    TRUE OF THE ESTIMATE, whatever the line count: the factor source and its licence,
 *                  the edition used for conversion, and the price-vintage lag when the reporting year
 *                  differs. Render these whenever any line is priced; the licence sentence carries the
 *                  attribution CC BY-SA requires wherever a derived figure is shown.
 *   batch_summary  COUNTS ACROSS THE LINES: how many lines had a price-basis mismatch, used a
 *                  rest-of-world region, used a factor at an extreme of all factors or at the top of
 *                  its sector, or were not priced.
 *                  Each count restates what those lines already say for themselves, so with ONE line
 *                  every one of them is a duplicate. A caller renders these only when it sent more
 *                  than one line.
 *
 * ⚠️ These were one `disclosures` list until 17 Sep 2026. A single-line caller then rendered
 * "1 line records spend at a different price basis…" directly under the line's own sentence saying
 * the same thing. Splitting here, rather than filtering in the page, keeps the caller from having to
 * recognise a count sentence by its wording.
 */
function responseStatements(
  results: LineResult[],
  reporting_year: number,
  edition: ActiveEdition,
): { disclosures: string[]; batch_summary: string[] } {
  const priced = results.filter((r): r is PricedLine => r.outcome === 'priced')
  const unpriced = results.length - priced.length
  const disclosures: string[] = []
  const batch_summary: string[] = []

  if (priced.length > 0) {
    const src = priced[0].source
    disclosures.push(
      `Emission factors are from ${src.dataset} version ${src.version} (${src.publisher}), ` +
      `doi:${src.doi}, licensed ${src.licence}. They are published in kg CO2e per euro of output at ` +
      `${priced[0].factor.price_year} ${priced[0].factor.price_basis} prices and were used unchanged.`,
    )
    // ⚠️ THE MISSING DISCLOSURE. Taken from the source record, not asserted here: stated only when the
    // source is recorded as publishing no uncertainty values. Its absence was previously unstated,
    // while a caution that was not about uncertainty at all sat where a reader would look for one.
    if (src.publishes_uncertainty === false) {
      disclosures.push(
        `${src.dataset} version ${src.version} publishes no uncertainty values for these emission ` +
        `factors, so no uncertainty range is given for this estimate.`,
      )
    }
    disclosures.push(
      `Spend was restated to ${priced[0].factor.price_year} euros using factor edition ${edition.id}, ` +
      `whose price data runs to ${edition.price_vintage_year}.`,
    )
    if (reporting_year !== edition.price_vintage_year) {
      disclosures.push(
        `The reporting year is ${reporting_year} but this edition's price data ends at ` +
        `${edition.price_vintage_year}. Spend is treated as being at ${edition.price_vintage_year} ` +
        `prices, so price changes between ${edition.price_vintage_year} and ${reporting_year} are not ` +
        `reflected.`,
      )
    }
    const basisMismatch = priced.filter(p => p.caveats.price_basis_mismatch).length
    if (basisMismatch > 0) {
      batch_summary.push(
        `${count(basisMismatch, 'line')} record${basisMismatch === 1 ? 's' : ''} spend at a different price basis from the emission ` +
        `factors, and no conversion between price bases was made.`,
      )
    }
    const composite = priced.filter(p => p.conversion.basis === 'row_composite').length
    if (composite > 0) {
      batch_summary.push(
        `${count(composite, 'line')} ${composite === 1 ? 'was' : 'were'} priced against a ` +
        `rest-of-world region, whose emission factor and price conversion are regional averages ` +
        `rather than figures for any one country.`,
      )
    }
    // The caution-worthy case only: an extreme across ALL factors. A within-sector position is a rank,
    // and lines at the LOW end of their sector are not counted at all, because a count of them would
    // read as a warning about something that is not one.
    const extreme = priced.filter(p => p.caveats.intensity_among_all_factors.position !== 'within')
    if (extreme.length > 0) {
      const { lower_percentile: lo, upper_percentile: hi } = extreme[0].caveats.intensity_among_all_factors
      batch_summary.push(
        `${count(extreme.length, 'line')} use${extreme.length === 1 ? 's' : ''} an emission factor in the ` +
        `lowest ${lo}% or highest ${100 - hi}% of all factors of its type in the source data; the ` +
        `published values were used unchanged.`,
      )
    }
    const sectorHigh = priced.filter(p =>
      p.caveats.intensity_within_sector.assessed && p.caveats.intensity_within_sector.position === 'above').length
    if (sectorHigh > 0) {
      batch_summary.push(
        `${count(sectorHigh, 'line')} ${sectorHigh === 1 ? 'is' : 'are'} priced in a region with one of the ` +
        `highest emission factors for ${sectorHigh === 1 ? 'its' : 'their'} sector.`,
      )
    }
  }
  if (unpriced > 0) {
    batch_summary.push(
      `${count(unpriced, 'line')} could not be priced and ${unpriced === 1 ? 'is' : 'are'} not ` +
      `included in any figure.`,
    )
  }
  return { disclosures, batch_summary }
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
