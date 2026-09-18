// app/api/scope3/spend-factor/route.test.ts
// Pins the spend-factor route end to end: real resolver, real factor files, real conversion
// artefact. Only authentication and the factor_editions read are mocked, so every figure below is
// the one production would return for the same request.
//
// THE NUMBERS ARE REAL and copied in rather than imported, so a failure names the number that moved:
//   DE p28 (product)   256,624.197323 kg CO2e per MILLION EUR, 2019 basic prices, as published
//   DE/EUR scalar      0.8367765223463683   basis published
//   WA p28 (product)   886,751.02973 kg CO2e per MILLION EUR    (Vietnam, VN, resolves to WA)
//   WA/USD scalar      0.795762736752818    basis row_composite, 96.9% of measurable GDP
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  authFails: false,
  edition: { data: null as unknown, error: null as unknown },
  editionReads: 0,
}))

vi.mock('../../../../lib/supabaseAuthed', () => {
  class AuthError extends Error {}
  return {
    AuthError,
    bearerFrom: () => 'tok',
    getAuthedClient: async () => {
      if (h.authFails) throw new AuthError('Missing access token')
      return {
        userId: 'u',
        email: undefined,
        supabase: {
          from: (table: string) => {
            if (table !== 'factor_editions') throw new Error(`unexpected table ${table}`)
            return {
              select: () => ({
                eq: (col: string, val: unknown) => {
                  if (col !== 'is_active' || val !== true) throw new Error('edition must be read by is_active = true')
                  return { maybeSingle: async () => { h.editionReads++; return h.edition } }
                },
              }),
            }
          },
        },
      }
    },
  }
})

import { POST } from './route'

// ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────────

const EDITION_ID = 'exiobase-3.8.2-2019-cpi2024-spendconv'

/** The live row as 20260916_edition_spendconv.sql inserts it, once activated. */
const ACTIVE_EDITION = {
  id: EDITION_ID,
  price_vintage_year: 2024,
  superseded_by: null,
  fingerprint_spend_conversions: '041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1',
  fingerprint_factors_ixi: '8747704c24bb045e87b3c02bc9b952cb69c37ffd2e5e07c5cb2241320f206fdb',
  fingerprint_factors_pxp: '300565c2a4448605e4b3ec0aa044977ba09b9077bfcfff5bc01ec17a9a29ddc6',
  fingerprint_sectors: 'b393d1ad7d4966cd0ddd7c29379c98b362ab9bed01be7e98afd53226647e3341',
  fingerprint_country_regions: 'e83c3d0388474c36e160572e8db608094d8529e6c3bffaab3444c5229075c9a8',
  fingerprint_price_indices: '64df489c58c6298c9fe8561289f2185f9bd7f9f1dddda063f16c52c60d23b158',
}

const PUBLISHED_P28_DE = 256624.197323
const DE_EUR = 0.8367765223463683
const PUBLISHED_P28_WA = 886751.02973
const WA_USD = 0.795762736752818

type Line = {
  id: string; country_iso2: string; sector_key: string; factor_type: string
  spend: number; spend_price_basis: string
}

const line = (over: Partial<Line> = {}): Line => ({
  id: 'l1', country_iso2: 'DE', sector_key: 'p28', factor_type: 'product',
  spend: 1, spend_price_basis: 'basic', ...over,
})

const body = (over: Record<string, unknown> = {}) => ({
  reporting_year: 2024, reporting_currency: 'EUR', lines: [line()], ...over,
})

async function post(payload: unknown) {
  const req = new Request('http://localhost/api/scope3/spend-factor', {
    method: 'POST',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
  const res = await POST(req as never)
  return { status: res.status, headers: res.headers, json: await res.json() }
}

// The route logs every error's operator_detail. Silenced here so test output stays readable, and
// spied on so the logging itself is asserted rather than assumed.
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const error = vi.spyOn(console, 'error').mockImplementation(() => {})

/** Everything logged by the route so far in this test, as one string per call. */
const logged = () => [...warn.mock.calls, ...error.mock.calls].map(args => args.join(' '))

beforeEach(() => {
  warn.mockClear()
  error.mockClear()
  h.authFails = false
  h.edition = { data: ACTIVE_EDITION, error: null }
  h.editionReads = 0
})

// ── AUTH ─────────────────────────────────────────────────────────────────────────────────────────

describe('authentication', () => {
  it('A1 a missing token is a 401 WITH a body and a code, not an empty response', async () => {
    h.authFails = true
    const r = await post(body())
    expect(r.status).toBe(401)
    expect(r.json).toEqual({
      code: 'unauthenticated',
      message: 'Your session has ended. Sign in again to see spend-based estimates.',
      operator_detail: 'Missing access token',
    })
    expect(r.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(h.editionReads).toBe(0)
  })
})

// ── PRICED ───────────────────────────────────────────────────────────────────────────────────────

describe('a priced line', () => {
  it('P1 Germany p28, one 2024 euro: 0.21473710338586816 kg, the figure verified in spendAdjustment.test.ts', async () => {
    const r = await post(body())
    expect(r.status).toBe(200)
    expect(r.json.edition_id).toBe(EDITION_ID)
    expect(r.json.price_vintage_year).toBe(2024)

    const l = r.json.lines[0]
    expect(l.id).toBe('l1')
    expect(l.outcome).toBe('priced')
    expect(l.country_iso2).toBe('DE')
    expect(l.emissions_kg).toBe(0.21473710338586816)
    expect(l.emissions_mt).toBe(0.21473710338586816 / 1000)

    expect(l.used_region).toBe('DE')
    expect(l.edition_id).toBe(EDITION_ID)
    expect(l.adjustment.kind).toBe('edition_conversion')
    expect(l.adjustment.output_amount).toBe(DE_EUR)
    expect(l.adjustment.factor_value_modified).toBe(false)
    expect(l.conversion).toEqual({ basis: 'published', gdp_coverage_pct: null })

    expect(l.factor.region).toBe('DE')
    expect(l.factor.price_basis).toBe('basic')
    expect(l.source.licence).toBe('CC BY-SA 4.0')
    expect(l.caveats).toEqual({
      currency_mismatch: false,          // EUR spend, EUR factor
      price_year_mismatch: true,         // 2024 against 2019 — addressed by the conversion
      price_basis_mismatch: false,
      // DE p28 is the 4th lowest of 49 for its sector: inside p5, so no position sentence.
      intensity_among_all_factors: { position: 'within', lower_percentile: 3, upper_percentile: 97 },
      intensity_within_sector: {
        assessed: true, position: 'within', lower_percentile: 5, upper_percentile: 95,
        rank_from_lowest: 4, rank_from_highest: 46, regions_ranked: 49, regions_in_dataset: 49,
      },
    })
    expect(r.json.caveats_addressed_by_conversion).toEqual(['currency_mismatch', 'price_year_mismatch'])
    expect(l.disclosures[0]).toBe(l.adjustment.disclosure)

    // Response-wide prose is complete sentences, not parts.
    expect(r.json.disclosures.some((d: string) => /CC BY-SA 4\.0/.test(d))).toBe(true)
    expect(r.json.disclosures.some((d: string) => d.includes(EDITION_ID))).toBe(true)
    // 2024 reporting against 2024 vintage: no lag sentence.
    expect(r.json.disclosures.some((d: string) => /price data ends at/.test(d))).toBe(false)
  })

  it('P2 the 1e6 is applied exactly once — by the resolver, never again by the route', async () => {
    const r = await post(body({ lines: [line({ spend: 1_000_000 })] }))
    const l = r.json.lines[0]

    // The resolver's value is already per ONE euro.
    expect(l.factor.value).toBeCloseTo(PUBLISHED_P28_DE / 1e6, 15)
    expect(l.source.unit_conversion).toMatch(/^Divided by 1e6/)

    // The route multiplies directly.
    expect(l.emissions_kg).toBe(l.adjustment.output_amount * l.factor.value)

    // A million 2024 euros of German fabricated metal is ~214.7 tonnes. Dividing twice would give
    // 0.2147 kg — a positive, well-formed, entirely wrong number — and no other check would object.
    expect(l.emissions_kg).toBeCloseTo(214_737.10338586816, 6)
    expect(l.emissions_mt).toBeCloseTo(214.73710338586816, 9)
    const dividedTwice = (l.adjustment.output_amount / 1e6) * l.factor.value
    expect(dividedTwice).toBeLessThan(1)
    expect(l.emissions_kg / dividedTwice).toBeCloseTo(1e6, 3)
  })

  it('P3 a country inside a rest-of-world bucket is priced there, and used_region says so', async () => {
    // Vietnam has no EXIOBASE region of its own. The caller sends VN; the route resolves it to WA.
    const r = await post(body({
      reporting_currency: 'USD',
      lines: [line({ id: 'vn-supplier', country_iso2: 'VN', spend: 1000 })],
    }))
    expect(r.status).toBe(200)
    const l = r.json.lines[0]
    expect(l.outcome).toBe('priced')
    expect(l.country_iso2).toBe('VN')
    expect(l.used_region).toBe('WA')
    expect(l.conversion).toEqual({ basis: 'row_composite', gdp_coverage_pct: 96.9 })
    expect(l.adjustment.to_eur2019_per_unit).toBe(WA_USD)
    expect(l.adjustment.gdp_coverage_pct).toBe(96.9)
    expect(l.caveats.currency_mismatch).toBe(true)   // USD spend, EUR factor — addressed by the conversion
    expect(l.emissions_kg).toBe(1000 * WA_USD * (PUBLISHED_P28_WA / 1e6))
    expect(l.adjustment.disclosure).toMatch(/96\.9% of the members' measurable GDP/)
    expect(l.adjustment.disclosure).toContain('per USD for RoW Asia and Pacific (WA).')
    expect(l.adjustment.disclosure).not.toMatch(/WA\/USD/)
    expect(r.json.batch_summary.some((d: string) => /rest-of-world region/.test(d))).toBe(true)
    expect(r.json.disclosures.some((d: string) => /rest-of-world region/.test(d))).toBe(false)
  })

  it('P4 purchaser-price spend is priced but flagged, never converted', async () => {
    const r = await post(body({ lines: [line({ spend_price_basis: 'purchaser' })] }))
    const l = r.json.lines[0]
    expect(l.outcome).toBe('priced')
    expect(l.caveats.price_basis_mismatch).toBe(true)
    expect(l.emissions_kg).toBe(0.21473710338586816)   // unchanged: no basis conversion exists
    expect(l.disclosures.some((d: string) => /purchaser prices and the emission factor is in basic prices/.test(d))).toBe(true)
    expect(r.json.batch_summary.some((d: string) => /1 line records spend at a different price basis/.test(d))).toBe(true)
    expect(r.json.disclosures.some((d: string) => /price basis/.test(d))).toBe(false)
  })

  it('P5 a reporting year past the price vintage is disclosed, not silently treated as current', async () => {
    const r = await post(body({ reporting_year: 2025 }))
    expect(r.json.lines[0].outcome).toBe('priced')
    expect(r.json.disclosures).toContain(
      'The reporting year is 2025 but this edition\'s price data ends at 2024. Spend is treated as ' +
      'being at 2024 prices, so price changes between 2024 and 2025 are not reflected.',
    )
  })
})

describe('response-level statements', () => {
  it('S1 disclosures hold only what is true of the estimate; every count goes to batch_summary', async () => {
    // A batch that triggers every count: purchaser basis, a rest-of-world country, and a miss.
    const r = await post(body({
      reporting_year: 2025,
      reporting_currency: 'USD',
      lines: [
        line({ id: 'de', spend_price_basis: 'purchaser' }),
        line({ id: 'vn', country_iso2: 'VN', spend_price_basis: 'purchaser' }),
        line({ id: 'miss', sector_key: 'p01.w.1' }),
      ],
    }))
    expect(r.status).toBe(200)

    expect(r.json.disclosures).toHaveLength(4)
    expect(r.json.disclosures[0]).toMatch(/^Emission factors are from EXIOBASE 3 version 3\.8\.2 .*licensed CC BY-SA 4\.0/)
    expect(r.json.disclosures[1]).toBe(
      'EXIOBASE 3 version 3.8.2 publishes no uncertainty values for these emission factors, so no ' +
      'uncertainty range is given for this estimate.',
    )
    expect(r.json.disclosures[2]).toBe(
      `Spend was restated to 2019 euros using factor edition ${EDITION_ID}, whose price data runs to 2024.`,
    )
    expect(r.json.disclosures[3]).toMatch(/^The reporting year is 2025 but this edition's price data ends at 2024\./)
    // No disclosure is a count.
    for (const d of r.json.disclosures) expect(d).not.toMatch(/\b\d+ lines?\b/)

    expect(r.json.batch_summary).toEqual([
      '2 lines record spend at a different price basis from the emission factors, and no conversion between price bases was made.',
      '1 line was priced against a rest-of-world region, whose emission factor and price conversion are regional averages rather than figures for any one country.',
      '1 line could not be priced and is not included in any figure.',
    ])
  })

  it('S2 a response with nothing priced has no estimate disclosures, only the count', async () => {
    const r = await post(body({ lines: [line({ sector_key: 'nope' })] }))
    expect(r.json.disclosures).toEqual([])
    expect(r.json.batch_summary).toEqual(['1 line could not be priced and is not included in any figure.'])
  })
})

describe('intensity position and uncertainty', () => {
  const priced = async (over: Partial<Line>) => {
    const r = await post(body({ lines: [line({ factor_type: 'industry', ...over })] }))
    expect(r.status).toBe(200)
    expect(r.json.lines[0].outcome).toBe('priced')
    return r
  }
  /** The line's sentences after the conversion sentence (index 0) and the price-basis one, if any. */
  const positionSentences = (r: { json: { lines: { disclosures: string[] }[] } }) =>
    r.json.lines[0].disclosures.slice(1).filter(d => !/price/.test(d))

  it('I1 a region at the bottom of its sector gets its rank as a fact — no caution, no "reliability"', async () => {
    const r = await priced({ country_iso2: 'DE', sector_key: 'i28' })
    expect(positionSentences(r)).toEqual(['This region has the 3rd lowest emission factor of 49 regions for this sector.'])
    const all = [...r.json.lines[0].disclosures, ...r.json.disclosures, ...r.json.batch_summary].join(' ')
    expect(all).not.toMatch(/reliab|caution/i)
    expect(r.json.batch_summary.some((d: string) => /lowest/.test(d)), 'a low rank is not counted as a warning').toBe(false)
  })

  it('I2 a region at the top of its sector gets its rank and the count below it', async () => {
    const r = await priced({ country_iso2: 'IN', sector_key: 'i28' })
    expect(positionSentences(r)).toEqual([
      'This region has the highest emission factor of 49 regions for this sector: 48 regions have a lower one.',
    ])
    expect(r.json.batch_summary).toContain('1 line is priced in a region with one of the highest emission factors for its sector.')
  })

  it('I3 a global extreme gets the caution', async () => {
    const r = await priced({ country_iso2: 'JP', sector_key: 'i11.b' })
    expect(positionSentences(r)).toEqual([
      'This emission factor is in the highest 3% of all industry factors in the source data. It was used ' +
      'as published; a value at either extreme of the source data should be checked against what is ' +
      'known about the supplier before it is relied on.',
    ])
    expect(r.json.batch_summary).toContain(
      '1 line uses an emission factor in the lowest 3% or highest 3% of all factors of its type in the ' +
      'source data; the published values were used unchanged.',
    )
  })

  it('I4 a sector too thin to rank within says so, with its own count', async () => {
    const r = await priced({ country_iso2: 'AT', sector_key: 'i37.w.1' })
    expect(r.json.lines[0].caveats.intensity_within_sector).toEqual({
      assessed: false, regions_with_factor: 19, minimum_regions: 20, regions_in_dataset: 49,
    })
    expect(positionSentences(r)).toEqual([
      'Only 19 of 49 regions have a non-zero emission factor for this sector, fewer than the 20 needed to ' +
      'place one region within it, so this factor\'s position within the sector was not assessed.',
    ])
  })

  it('I5 the source publishes no uncertainty, and every priced response says so once', async () => {
    const r = await priced({ country_iso2: 'CH', sector_key: 'i28' })
    expect(positionSentences(r), 'CH i28 is 4th lowest: inside, nothing to say').toEqual([])
    expect(r.json.disclosures.filter((d: string) => /uncertainty/.test(d))).toEqual([
      'EXIOBASE 3 version 3.8.2 publishes no uncertainty values for these emission factors, so no ' +
      'uncertainty range is given for this estimate.',
    ])
    expect(r.json.lines[0].source.publishes_uncertainty).toBe(false)
  })
})

// ── NOT PRICED ───────────────────────────────────────────────────────────────────────────────────

describe('lines that are not priced', () => {
  it('N1 a secondary material returns absent with the resolver\'s reason and explanation verbatim', async () => {
    const r = await post(body({ lines: [line({ id: 'scrap', sector_key: 'p01.w.1' })] }))
    const l = r.json.lines[0]
    expect(l).toEqual({
      id: 'scrap',
      outcome: 'absent',
      reason: 'secondary_material_not_priced',
      explanation: expect.stringMatching(/^EXIOBASE models secondary materials as waste treatment flows/),
      country_iso2: 'DE',
      resolved_region: 'DE',
      sector_key: 'p01.w.1',
    })
    expect(l).not.toHaveProperty('emissions_kg')
    expect(r.json.batch_summary).toContain('1 line could not be priced and is not included in any figure.')
  })

  it('N2 an unknown sector returns no_factor, says the code is not recognised, and invents no cause', async () => {
    const r = await post(body({ lines: [line({ id: 'x', sector_key: 'p99.zzz' })] }))
    const l = r.json.lines[0]
    expect(l.outcome).toBe('no_factor')
    expect(l.sector_key_recognised).toBe(false)
    expect(l.notice).toBe(
      'p99.zzz is not a recognised EXIOBASE product code, so no emission factor could be looked up. ' +
      'This line was not priced and is not included in any figure.',
    )
    expect(l).not.toHaveProperty('emissions_kg')
  })

  it('N3 a known sector with no factor in its region is no_factor — NOT a neighbour\'s figure', async () => {
    // Austria publishes 0.0 for paddy rice. With a fallback this would price from another region;
    // with none, it is a miss, and the notice names what was checked and nothing more.
    const r = await post(body({ lines: [line({ id: 'rice', country_iso2: 'AT', sector_key: 'i01.a', factor_type: 'industry' })] }))
    const l = r.json.lines[0]
    expect(l.outcome).toBe('no_factor')
    expect(l.sector_key_recognised).toBe(true)
    expect(l.country_iso2).toBe('AT')
    expect(l.resolved_region).toBe('AT')
    expect(l).not.toHaveProperty('used_region')
    expect(l.notice).toBe(
      'No emission factor is available for Cultivation of paddy rice (EXIOBASE industry i01.a) in the ' +
      `EXIOBASE region Austria (AT) in edition ${EDITION_ID}. This line was not priced and is not included in any figure.`,
    )
  })

  it('N3b a miss in a rest-of-world region names the region AND the country it covers, both by name', async () => {
    const r = await post(body({ lines: [line({ id: 'vn', country_iso2: 'VN', sector_key: 'i20.w', factor_type: 'industry' })] }))
    const l = r.json.lines[0]
    expect(l.outcome).toBe('no_factor')
    expect(l.resolved_region).toBe('WA')
    expect(l.notice).toContain('in the EXIOBASE region RoW Asia and Pacific (WA), which covers Vietnam (VN), in edition')
    expect(l.notice).not.toMatch(/region WA\b|country VN\b/)
  })

  it('N4 a mixed batch keeps order and echoes every id', async () => {
    const r = await post(body({
      lines: [line({ id: 'a' }), line({ id: 'b', sector_key: 'p01.w.1' }), line({ id: 'c', sector_key: 'nope' })],
    }))
    expect(r.json.lines.map((l: { id: string; outcome: string }) => [l.id, l.outcome]))
      .toEqual([['a', 'priced'], ['b', 'absent'], ['c', 'no_factor']])
    expect(r.json.batch_summary).toContain('2 lines could not be priced and are not included in any figure.')
  })
})

// ── REJECTED REQUESTS ────────────────────────────────────────────────────────────────────────────

describe('rejected requests', () => {
  it('R1 a raw EXIOBASE region code is not accepted as a country, so no caller can pass a region', async () => {
    // WA is a region (RoW Asia and Pacific), not an ISO country code, and has no concordance row.
    const r = await post(body({ lines: [line({ id: 'raw-region', country_iso2: 'WA' })] }))
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('unsupported_country')
    expect(r.json.message).toBe(
      'Spend from this country of supply cannot be estimated yet: it is not covered by the emission factor data.',
    )
    expect(r.json.operator_detail).toBe(
      'lines[0] (id "raw-region"): country_iso2 "WA" has no entry in the country-to-region concordance, ' +
      'so no EXIOBASE region can be assigned and the line cannot be priced. This field takes a country, ' +
      'not an EXIOBASE region code.',
    )
    expect(r.json).not.toHaveProperty('lines')
    expect(h.editionReads).toBe(0)
  })

  it('R2 WF as an input is Wallis and Futuna, has no concordance row, and is rejected — never priced as RoW Africa', async () => {
    // WHY THIS REPLACES THE OLD R2. When the route took region_code it validated against the 49
    // EXIOBASE regions, and that could not catch WF: WF IS one of the 49 (RoW Africa) as well as the
    // ISO code for Wallis and Futuna, so an unresolved Wallis and Futuna code passed and was priced as
    // African. No check on a region value can separate the two meanings, because the value is the
    // same. Taking a COUNTRY removes the ambiguity instead of trying to detect it: as input WF can only
    // be Wallis and Futuna, which is not among the concordance's 212, so it is rejected here.
    const r = await post(body({ reporting_currency: 'USD', lines: [line({ id: 'wallis', country_iso2: 'WF' })] }))
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('unsupported_country')
    expect(r.json.operator_detail).toMatch(/^lines\[0\] \(id "wallis"\): country_iso2 "WF" has no entry/)
    expect(r.json).not.toHaveProperty('lines')
    expect(h.editionReads).toBe(0)
  })

  it('R2b WF can still appear as an OUTPUT, where it means RoW Africa: Senegal is priced in WF', async () => {
    const r = await post(body({ reporting_currency: 'USD', lines: [line({ id: 'sn', country_iso2: 'SN' })] }))
    expect(r.status).toBe(200)
    expect(r.json.lines[0].country_iso2).toBe('SN')
    expect(r.json.lines[0].used_region).toBe('WF')
    expect(r.json.lines[0].conversion).toEqual({ basis: 'row_composite', gdp_coverage_pct: 90.6 })
  })

  it('R3 more than 500 lines is rejected with the cap named', async () => {
    const lines = Array.from({ length: 501 }, (_, i) => line({ id: `l${i}` }))
    const r = await post(body({ lines }))
    expect(r.status).toBe(400)
    expect(r.json).toEqual({
      code: 'too_many_lines',
      message: 'Too much spend was sent at once to estimate. Send at most 500 entries at a time.',
      operator_detail: 'lines holds 501 entries; the maximum per request is 500. Send the remainder in further requests.',
    })
    expect(h.editionReads).toBe(0)
  })

  it('R4 exactly 500 priced lines are accepted, and the response stays well inside a 4.5 MB payload limit', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => line({ id: `line-${String(i).padStart(4, '0')}` }))
    const req = new Request('http://localhost/api/scope3/spend-factor', { method: 'POST', body: JSON.stringify(body({ lines })) })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    const bytes = new TextEncoder().encode(await res.text()).length
    expect(bytes).toBeLessThan(4.5 * 1024 * 1024 / 2)   // at least 2x headroom under the limit
  })

  it('R5 malformed input is rejected with a named field', async () => {
    expect((await post('not json')).json.code).toBe('invalid_json')
    expect((await post(body({ reporting_currency: 'JPY' }))).json.code).toBe('invalid_reporting_currency')
    expect((await post(body({ reporting_year: '2024' }))).json.code).toBe('invalid_reporting_year')
    expect((await post(body({ lines: [] }))).json.code).toBe('invalid_lines')
    expect((await post(body({ lines: [line({ spend: -5 })] }))).json.code).toBe('invalid_spend')
    expect((await post(body({ lines: [line({ country_iso2: 'de' })] }))).json.code).toBe('invalid_country_iso2')
    expect((await post(body({ lines: [line({ country_iso2: 'DEU' })] }))).json.code).toBe('invalid_country_iso2')
    expect((await post(body({ lines: [{ ...line(), country_iso2: undefined, region_code: 'DE' }] }))).json.code).toBe('invalid_country_iso2')
    expect((await post(body({ lines: [line({ factor_type: 'service' })] }))).json.code).toBe('invalid_factor_type')
    expect((await post(body({ lines: [line({ spend_price_basis: 'retail' })] }))).json.code).toBe('invalid_spend_price_basis')
    expect((await post(body({ lines: [line({ id: 'd' }), line({ id: 'd' })] }))).json.code).toBe('duplicate_line_id')
  })
})

// ── EDITION ──────────────────────────────────────────────────────────────────────────────────────

describe('the active edition', () => {
  it('E1 no active edition: 503, nothing priced, and the body says so', async () => {
    h.edition = { data: null, error: null }
    const r = await post(body())
    expect(r.status).toBe(503)
    expect(r.json.code).toBe('no_active_edition')
    expect(r.json.message).toBe('Spend-based estimates are not available at the moment, so nothing was calculated.')
    expect(r.json.operator_detail).toMatch(/public\.factor_editions has is_active = true/)
    expect(logged().some(l => l.includes('503 no_active_edition') && l.includes('is_active = true'))).toBe(true)
    expect(r.json).not.toHaveProperty('lines')
  })

  it('E2 an active edition that is not the deployed artefact is refused, naming what differs', async () => {
    h.edition = { data: { ...ACTIVE_EDITION, fingerprint_spend_conversions: 'deadbeef' }, error: null }
    const r = await post(body())
    expect(r.status).toBe(500)
    expect(r.json.code).toBe('edition_artefact_mismatch')
    expect(r.json.message).toBe(
      'Spend-based estimates are temporarily unavailable because of a configuration problem on our side, so nothing was calculated.',
    )
    expect(r.json.operator_detail).toMatch(/Differing: fingerprint_spend_conversions\./)
  })

  it('E3 the superseded -fxnorm edition, if activated, is refused', async () => {
    h.edition = {
      data: { ...ACTIVE_EDITION, id: 'exiobase-3.8.2-2019-cpi2024-fxnorm', fingerprint_spend_conversions: null, superseded_by: EDITION_ID },
      error: null,
    }
    const r = await post(body())
    expect(r.status).toBe(500)
    expect(r.json.operator_detail).toMatch(/Differing: id, fingerprint_spend_conversions, superseded_by\./)
  })

  it('E4 a failed edition read is a 500 that names the failure, not an empty 503', async () => {
    h.edition = { data: null, error: { message: 'permission denied for table factor_editions' } }
    const r = await post(body())
    expect(r.status).toBe(500)
    expect(r.json).toEqual({
      code: 'edition_read_failed',
      message: 'Emission factor data could not be loaded, so nothing was calculated. Try again shortly.',
      operator_detail: 'Could not read the active factor edition: permission denied for table factor_editions',
    })
    expect(logged().some(l => l.includes('500 edition_read_failed') && l.includes('permission denied'))).toBe(true)
  })
})

// ── ERROR WORDING ────────────────────────────────────────────────────────────────────────────────

describe('error wording', () => {
  // Terms that belong to the schema, the artefacts or the request format. None may reach a customer.
  const OPERATOR_TERMS = /factor_editions|fingerprint|superseded|is_active|edition|artefact|concordance|iso2|sector_key|region_code|reporting_|spend_price_basis|factor_type|lines\[|\bjson\b|\bid\b|_/i

  it('X1 every error returns a plain customer message, a separate operator detail, and logs the detail', async () => {
    const cases: Array<[string, () => void, unknown]> = [
      ['unauthenticated', () => { h.authFails = true }, body()],
      ['invalid_json', () => {}, 'not json'],
      ['invalid_reporting_currency', () => {}, body({ reporting_currency: 'JPY' })],
      ['invalid_country_iso2', () => {}, body({ lines: [line({ country_iso2: 'de' })] })],
      ['unsupported_country', () => {}, body({ lines: [line({ country_iso2: 'WF' })] })],
      ['invalid_spend', () => {}, body({ lines: [line({ spend: -1 })] })],
      ['too_many_lines', () => {}, body({ lines: Array.from({ length: 501 }, (_, i) => line({ id: `l${i}` })) })],
      ['no_active_edition', () => { h.edition = { data: null, error: null } }, body()],
      ['edition_artefact_mismatch', () => { h.edition = { data: { ...ACTIVE_EDITION, id: 'x' }, error: null } }, body()],
      ['edition_read_failed', () => { h.edition = { data: null, error: { message: 'boom' } } }, body()],
    ]
    for (const [code, arrange, payload] of cases) {
      h.authFails = false
      h.edition = { data: ACTIVE_EDITION, error: null }
      warn.mockClear(); error.mockClear()
      arrange()
      const r = await post(payload)
      expect(r.json.code, code).toBe(code)
      expect(Object.keys(r.json).sort(), code).toEqual(['code', 'message', 'operator_detail'])
      expect(r.json.message, `${code} message`).not.toMatch(OPERATOR_TERMS)
      expect(r.json.operator_detail.length, `${code} operator_detail`).toBeGreaterThan(0)
      expect(r.json.operator_detail, code).not.toBe(r.json.message)
      expect(logged().some(l => l.includes(code) && l.includes(r.json.operator_detail)), `${code} logged`).toBe(true)
    }
  })
})
