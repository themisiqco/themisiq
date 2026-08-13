import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildFactorEditions, factorEditionsForSave, factorJurisdiction, sameFactorEditions, FAMILIES_NOT_COVERED,
} from './factorEditions'
import type { FactorEditions } from './factorEditions'
import { EF_SOURCES, emptyLocation, getGridFactor, gridSource, combustionSource } from './engine'
import type { Location } from './engine'

// THE COLUMN EXISTS BECAUSE A 26% FALL LOOKED LIKE PERFORMANCE.
//
// A UK customer's 2025 inventory was priced with DEFRA 2025 (grid 0.177) and their 2026 with DEFRA
// 2026 (0.13096). Same building, same meter, Scope 2 down by roughly a quarter, and nothing on any
// surface saying the factors moved. F3 below is that exact pair, and it is the test this whole file
// is arranged around — if you are deleting or skipping one, do not make it that one.
//
// ⚠️ AND THE WAY TO BREAK F3 IS TO STORE THE CITATION. EF_SOURCES.electricity_uk is deliberately
// year-neutral because GRID_EF.UK holds two editions, so gridSource() returns an IDENTICAL string
// for 2025 and 2026. An implementation that stored it would look completely reasonable, would pass
// a "records an electricity edition" test, and would record the two years as the same. F4 asserts
// the stored edition is NOT that string, so the plausible-looking wrong version cannot go green.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const pageSrc = readFileSync(join(ROOT, PAGE), 'utf8')

// Same contract as gridDisplay.test.ts and reportingYears.test.ts: absent anchor throws, ambiguous
// anchor throws. A guard that silently picks the first of several matches reports on code nobody
// asked about.
const lineContaining = (anchor: string): string => {
  const hits = pageSrc.split('\n').filter(l => l.includes(anchor))
  if (hits.length === 0) throw new Error(`no line containing '${anchor}' in ${PAGE} — the call site moved or was renamed`)
  if (hits.length > 1) throw new Error(`'${anchor}' matches ${hits.length} lines in ${PAGE} — anchor is ambiguous`)
  return hits[0]
}

// A location that burns gas AND draws grid electricity, so both families are exercised at once.
const loc = (over: Partial<Location>): Location => ({
  ...emptyLocation('l1', 'Site'),
  has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf',
  electricity_kwh: 50_000,
  ...over,
})
const uk = (over: Partial<Location> = {}) => loc({ country: 'GB', grid_region: 'UK', ...over })

describe('a single-jurisdiction inventory records one entry with both families', () => {
  it('F1 UK 2026 — one key, combustion and electricity, each with source and edition', () => {
    const ed = buildFactorEditions([uk()], 2026)

    expect(Object.keys(ed), 'one jurisdiction in, one key out').toEqual(['UK'])
    expect(Object.keys(ed.UK!).sort()).toEqual(['combustion', 'electricity'])

    // Combustion: the year-bearing citation, and a label that summarises it.
    expect(ed.UK!.combustion).toEqual({
      source: 'UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting',
      edition: 'DEFRA 2026',
    })
    // Electricity: the year-NEUTRAL citation, and the year the lookup resolved to.
    expect(ed.UK!.electricity).toEqual({
      source: 'UK DEFRA/DESNZ GHG Conversion Factors for Company Reporting',
      edition: '2026',
    })
  })

  it('F2 the sources are the engine\'s own, never retyped here', () => {
    const ed = buildFactorEditions([uk()], 2026)
    // If these were hand-copied strings they could drift from the workings row and the assurance
    // PDF, which is the discrepancy a verifier would find first.
    expect(ed.UK!.combustion!.source).toBe(combustionSource(uk()))
    expect(ed.UK!.electricity!.source).toBe(gridSource(uk()))
    expect(ed.UK!.electricity!.source).toBe(EF_SOURCES.electricity_uk)
  })
})

describe('THE CASE THE COLUMN EXISTS FOR', () => {
  it('F3 a UK 2025 and a UK 2026 inventory record DIFFERENT electricity editions', () => {
    const WHY =
      'THE FACTOR EDITION STOPPED MOVING WITH THE YEAR. This is the defect the column exists to ' +
      'fix: DEFRA 2025 priced UK grid at 0.177 and DEFRA 2026 at 0.13096, a ~26% fall on an ' +
      'unchanged meter, and if both years record the same edition nothing on the record separates ' +
      'the revision from real decarbonisation. Check that the electricity edition still comes from ' +
      'getGridFactor(region, year).usedYear and not from the citation string.'

    const e25 = buildFactorEditions([uk()], 2025)
    const e26 = buildFactorEditions([uk()], 2026)

    expect(e25.UK!.electricity!.edition, WHY).toBe('2025')
    expect(e26.UK!.electricity!.edition, WHY).toBe('2026')
    expect(e25.UK!.electricity!.edition, WHY).not.toBe(e26.UK!.electricity!.edition)
    expect(sameFactorEditions(e25, e26), WHY).toBe(false)

    // NOT VACUOUS — the two years genuinely price differently, which is why the editions must differ.
    expect(getGridFactor('UK', 2025).ef).toBe(0.177)
    expect(getGridFactor('UK', 2026).ef).toBe(0.13096)
  })

  it('F4 the electricity edition is NOT the citation string — the mutation that would defeat F3', () => {
    // gridSource() returns ONE string for both years. An implementation storing it would satisfy
    // "an electricity edition is recorded" and record the two years identically.
    expect(gridSource(uk()), 'electricity_uk is year-neutral BY DESIGN — see its comment in engine.ts')
      .toBe(gridSource(uk()))
    expect(EF_SOURCES.electricity_uk, 'a year here would contradict factor_vintage on the other half of GRID_EF.UK')
      .not.toMatch(/20\d\d/)

    for (const year of [2023, 2024, 2025, 2026]) {
      const e = buildFactorEditions([uk()], year).UK!.electricity!
      expect(e.edition, `${year}: the edition must not be the citation`).not.toBe(e.source)
      expect(e.edition, `${year}: the edition is a year, not prose`).toMatch(/^\d{4}(, \d{4})*$/)
      expect(e.edition, `${year}: must equal usedYear`).toBe(String(getGridFactor('UK', year).usedYear))
    }
  })

  it('F5 usedYear is the RESOLVED year, not the requested one', () => {
    // GRID_EF.UK holds 2025 and 2026 only, so a 2023 or 2024 UK inventory resolves FORWARD to 2025.
    // Recording the requested year would claim an edition that does not exist and would make F3 pass
    // for the wrong reason.
    expect(getGridFactor('UK', 2023).usedYear).toBe(2025)
    expect(buildFactorEditions([uk()], 2023).UK!.electricity!.edition).toBe('2025')
    expect(buildFactorEditions([uk()], 2024).UK!.electricity!.edition).toBe('2025')
  })
})

describe('a multi-jurisdiction inventory records one entry per jurisdiction', () => {
  it('F6 four countries, four keys, each with its own citations', () => {
    const ed = buildFactorEditions([
      loc({ id: 'a', country: 'GB', grid_region: 'UK' }),
      loc({ id: 'b', country: 'US', grid_region: 'US_FL' }),
      loc({ id: 'c', country: 'CA', grid_region: 'ON' }),
      loc({ id: 'd', country: 'NZ', grid_region: 'NZ' }),
    ], 2026)

    expect(Object.keys(ed).sort()).toEqual(['CA', 'NZ', 'UK', 'US'])
    expect(ed.US!.electricity!.edition, 'every US row is eGRID2023').toBe('2023')
    expect(ed.CA!.electricity!.edition, 'ECCC holds 2026').toBe('2026')
    expect(ed.NZ!.electricity!.edition, 'MfE holds 2023-2025, so 2026 resolves back').toBe('2025')
    expect(ed.UK!.electricity!.edition).toBe('2026')
    expect(ed.CA!.combustion!.edition).toBe('ECCC 2025 v3.0')
    expect(ed.US!.combustion!.source).toBe(EF_SOURCES.combustion)
  })

  it('F7 DE AND FR COLLAPSE TO ONE "EU" KEY — a split would record a difference that does not exist', () => {
    // Their GRID_EF rows differ (EU_DE vs EU_FR are separate values) but one EEA publication priced
    // both, and one IPCC table priced their combustion. Keying on loc.country would put two entries
    // in front of a verifier where one document exists.
    const ed = buildFactorEditions([
      loc({ id: 'a', country: 'DE', grid_region: 'EU_DE' }),
      loc({ id: 'b', country: 'FR', grid_region: 'EU_FR' }),
    ], 2026)

    expect(Object.keys(ed)).toEqual(['EU'])
    expect(ed.EU!.combustion!.edition).toBe('IPCC 2006')
    expect(ed.EU!.electricity!.edition, 'EEA holds 2023 only, so 2026 resolves back').toBe('2023')
    // Not vacuous: the two locations really are priced with different NUMBERS.
    expect(getGridFactor('EU_DE', 2026).ef).not.toBe(getGridFactor('EU_FR', 2026).ef)
  })

  it('F8 an unlisted country records US, because US EPA factors are what actually priced it', () => {
    // pickEF falls back to EF for Japan. Recording 'JP' would name a table that does not exist.
    const ed = buildFactorEditions([loc({ country: 'JP', grid_region: 'US_FL' })], 2026)
    expect(Object.keys(ed)).toEqual(['US'])
    expect(ed.US!.combustion!.source).toBe(EF_SOURCES.combustion)
  })

  it('F9 two locations in one jurisdiction record ONE entry, not two', () => {
    const ed = buildFactorEditions([uk({ id: 'a' }), uk({ id: 'b' })], 2026)
    expect(Object.keys(ed)).toEqual(['UK'])
    expect(ed.UK!.electricity!.edition, 'one distinct usedYear, so one year').toBe('2026')
  })
})

describe('no edition is invented for a family that priced nothing', () => {
  it('F10 a location with no electricity records NO electricity entry', () => {
    const ed = buildFactorEditions([uk({ electricity_kwh: 0 })], 2026)
    expect(ed.UK!.combustion, 'it still burns gas').toBeDefined()
    expect(ed.UK!.electricity, 'zero kWh was priced by no grid edition').toBeUndefined()
    expect(Object.keys(ed.UK!)).toEqual(['combustion'])
  })

  it('F11 an UNRESOLVED grid region records no electricity entry either — calcLocation\'s own gate', () => {
    // calcLocation omits electricity entirely when isResolvedGridRegion is false: no getGridFactor
    // call, no contribution. Naming an edition here would attribute a figure the engine never
    // computed. 'us_average' is the wizard's INITIAL value, so this is the common case, not an edge.
    for (const region of ['us_average', '', 'NOT_A_REGION']) {
      const ed = buildFactorEditions([uk({ grid_region: region })], 2026)
      expect(ed.UK!.electricity, `grid_region '${region}' never resolved`).toBeUndefined()
    }
  })

  it('F12 a location with no fuels records NO combustion entry', () => {
    const bare = loc({ country: 'GB', grid_region: 'UK', has_natural_gas: false, natural_gas_amount: 0 })
    const ed = buildFactorEditions([bare], 2026)
    expect(ed.UK!.combustion).toBeUndefined()
    expect(ed.UK!.electricity).toBeDefined()
  })

  it('F13 declared_unquantified prices nothing, so it names no edition', () => {
    // has_natural_gas true with amount 0 — the exact three-state case StreamState exists for. It
    // produces no priced row, so it must not produce an edition.
    const ed = buildFactorEditions([
      loc({ country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: 0, electricity_kwh: 0 }),
    ], 2026)
    expect(ed, 'nothing was priced anywhere').toEqual({})
  })

  it('F14 an empty inventory records an empty object, not a jurisdiction with empty families', () => {
    expect(buildFactorEditions([], 2026)).toEqual({})
  })

  it('F15 steam and refrigerants are NOT filed under combustion', () => {
    // EF.steam_mmbtu is the US EPA table for every country — pickEF is never consulted — so a UK
    // steam location under "DEFRA 2026" would be a wrong attribution. Refrigerants price from
    // REFRIGERANT_GWP, whose edition is the AR set that gwp_version already records.
    expect([...FAMILIES_NOT_COVERED].sort()).toEqual(['purchased_steam', 'refrigerants'])
    const ed = buildFactorEditions([
      loc({ country: 'GB', grid_region: 'UK', has_natural_gas: false, natural_gas_amount: 0, electricity_kwh: 0,
            has_purchased_steam: true, purchased_steam_mmbtu: 500,
            has_hfc_refrigerants: true, refrigerant_purchased_kg: 40 }),
    ], 2026)
    expect(ed, 'neither family is country-routed, so neither names a jurisdiction edition').toEqual({})
  })
})

describe('the declared edition labels cannot drift from their citations', () => {
  it('F16 EDITION LABELS MATCH THEIR CITATION — every token of the label appears in the source', () => {
    // The label is a SECOND COPY of a fact, which is the risk that comes with declaring rather than
    // parsing. This is what closes it: refresh a factor table, forget the label, fail here.
    const WHY = 'A FACTOR TABLE MOVED AND ITS EDITION LABEL DID NOT. The stored edition would name ' +
      'the previous publication while the citation names the current one — two provenance claims ' +
      'disagreeing on the same row.'
    const cases: [string, string][] = [
      ['US', EF_SOURCES.combustion], ['CA', EF_SOURCES.combustion_ca], ['UK', EF_SOURCES.combustion_uk],
      ['EU', EF_SOURCES.combustion_eu], ['AU', EF_SOURCES.combustion_au], ['NZ', EF_SOURCES.combustion_nz],
    ]
    const country: Record<string, [string, string]> = {
      US: ['US', 'US_FL'], CA: ['CA', 'ON'], UK: ['GB', 'UK'],
      EU: ['DE', 'EU_DE'], AU: ['AU', 'AU_NSW'], NZ: ['NZ', 'NZ'],
    }
    for (const [j, citation] of cases) {
      const [c, region] = country[j]
      const ed = buildFactorEditions([loc({ country: c, grid_region: region })], 2026)[j as 'UK']!
      expect(ed.combustion!.source, `${j} citation`).toBe(citation)
      for (const token of ed.combustion!.edition.split(/\s+/)) {
        expect(citation, `${WHY}\n  ${j}: label token "${token}" is absent from "${citation}"`).toContain(token)
      }
    }
  })

  it('F17 THE REGEX THAT WOULD HAVE BEEN WRONG — Australia proves prose parsing does not work', () => {
    // Documented in factorEditions.ts as the reason the label is declared. Asserted because a future
    // reader will be tempted by it, and the counter-example is one citation away.
    expect(EF_SOURCES.combustion_au, 'the parenthesised token is a GWP set, not a year')
      .toBe('DCCEEW NGA Factors 2025 (AR5)')
    expect(/\((\d{4})\)/.exec(EF_SOURCES.combustion_au), 'year-in-parens finds no year here').toBeNull()
    // And it DOES match the other five, which is exactly what makes it look safe.
    for (const c of [EF_SOURCES.combustion, EF_SOURCES.combustion_ca, EF_SOURCES.combustion_uk,
                     EF_SOURCES.combustion_eu]) {
      expect(/\((\d{4})\)/.test(c), `${c}`).toBe(true)
    }
  })

  it('F18 the jurisdiction map is EXHAUSTIVE over EF_SOURCES — a new jurisdiction fails here', () => {
    // Iterates EF_SOURCES itself rather than a list, so adding combustion_jp / electricity_jp
    // without extending CITATIONS fails at CI instead of silently dropping every JP location.
    const keys = Object.keys(EF_SOURCES).filter(k => /^(combustion|electricity)(_|$)/.test(k))
    expect(keys.length, 'EF_SOURCES looks empty or renamed').toBeGreaterThanOrEqual(13)

    const l = (c: string, r: string) => loc({ country: c, grid_region: r })
    const mapped = new Set<string>()
    for (const [c, r] of [['US','US_FL'],['CA','ON'],['GB','UK'],['DE','EU_DE'],['AU','AU_NSW'],['NZ','NZ']]) {
      mapped.add(combustionSource(l(c, r)))
      mapped.add(gridSource(l(c, r)))
    }
    for (const k of keys) {
      // `electricity` is the six-jurisdiction CATALOGUE, not a per-jurisdiction citation — its own
      // comment in engine.ts forbids using it on a row. It is the one key with no jurisdiction.
      if (k === 'electricity') continue
      expect(mapped, `EF_SOURCES.${k} is not reachable from any mapped jurisdiction — extend CITATIONS`)
        .toContain((EF_SOURCES as Record<string, string>)[k])
    }
  })

  it('F19 combustion and electricity agree on the jurisdiction for every country', () => {
    // The two families are resolved independently. If a country's combustion citation said UK and
    // its grid citation said EU, one location would write two keys and the record would be
    // incoherent. Nothing enforces the two branches staying in step except this.
    for (const [c, r] of [['US','US_FL'],['CA','ON'],['GB','UK'],['UK','UK'],['DE','EU_DE'],['FR','EU_FR'],
                          ['AU','AU_NSW'],['NZ','NZ'],['JP','US_FL'],['','US_FL']]) {
      const l = loc({ country: c, grid_region: r })
      expect(factorJurisdiction(l, 'combustion'), `${c || '(blank)'}`)
        .toBe(factorJurisdiction(l, 'electricity'))
      expect(factorJurisdiction(l, 'combustion'), `${c || '(blank)'} must map`).not.toBeNull()
    }
  })
})

describe('sameFactorEditions', () => {
  it('F20 equal maps match; a moved edition, a moved source, or a missing family does not', () => {
    const base = buildFactorEditions([uk()], 2026)
    expect(sameFactorEditions(base, buildFactorEditions([uk()], 2026))).toBe(true)
    expect(sameFactorEditions(base, buildFactorEditions([uk()], 2025))).toBe(false)
    expect(sameFactorEditions(base, buildFactorEditions([uk({ electricity_kwh: 0 })], 2026))).toBe(false)
    expect(sameFactorEditions({}, {})).toBe(true)
    expect(sameFactorEditions(base, {}), 'an unknown map is not a matching map').toBe(false)

    const tweaked: FactorEditions = JSON.parse(JSON.stringify(base))
    tweaked.UK!.combustion!.source = 'UK DEFRA/DESNZ (2025) GHG Conversion Factors for Company Reporting'
    expect(sameFactorEditions(base, tweaked), 'the source moved even though the label did not').toBe(false)
  })
})

// ── THE ROUND TRIP ───────────────────────────────────────────────────────────────────────────────
// The load at page.tsx does select('*') and the save payload is built key by key, so a column absent
// from the payload object is DROPPED ON EVERY SAVE. With this column's `not null default '{}'` that
// is worse than a null: a real map would be erased back to an empty object, which reads exactly like
// an inventory that predates the column. No error, no flag. Both halves are asserted from source
// because neither is reachable from a unit test.
describe('factor_editions survives the load-then-save round trip', () => {
  it('F21 the save payload writes it, computed from the SAME locations and year as the totals', () => {
    const line = lineContaining('factor_editions: factorEditionsForSave')
    expect(line, 'the same locations that produced scope1_total').toContain('inventory.locations')
    expect(line, 'the same year passed to buildWorkings — anything else records a calc never performed')
      .toContain('inventory.reporting_year')
    expect(line, 'the stored map must be offered as the fallback').toContain('inventory.factor_editions')
    expect(pageSrc).toContain("from '../../../lib/ghg/factorEditions'")
  })

  it('F22 an empty recompute falls back to the stored map rather than erasing it', () => {
    const stored = buildFactorEditions([uk()], 2026)

    // Nothing priced this time — the stored map survives untouched.
    expect(factorEditionsForSave([], 2026, stored)).toEqual(stored)
    expect(factorEditionsForSave([uk({ has_natural_gas: false, natural_gas_amount: 0, electricity_kwh: 0 })], 2026, stored))
      .toEqual(stored)

    // A REAL RECOMPUTE ALWAYS WINS — the editions must describe the totals saved beside them, so a
    // stale map preserved next to fresh figures would be the defect rather than the fix.
    const fresh = factorEditionsForSave([uk()], 2025, stored)
    expect(fresh.UK!.electricity!.edition, 'the 2025 recompute must not be shadowed by a stored 2026').toBe('2025')

    // And with nothing stored, an empty recompute is an empty object — the column's own default,
    // never null: it is `not null default '{}'` and a null would be rejected at insert.
    expect(factorEditionsForSave([], 2026)).toEqual({})
    expect(factorEditionsForSave([], 2026, null)).toEqual({})
  })

  it('F23 the load path reads it back onto the inventory, defaulting to {}', () => {
    const line = lineContaining('factor_editions: data.factor_editions')
    expect(line, "'{}' is the column's own default — an unrecorded inventory, not a null")
      .toMatch(/factor_editions: data\.factor_editions \?\? \{\}/)
  })

  it('F24 NOTHING ELSE IN THE PAYLOAD CHANGED — the other 24 keys are still there', () => {
    // The payload is one object literal and this change adds one line to it. A key silently dropped
    // here stops being written on every save, with no error at any layer.
    const start = pageSrc.indexOf('    const payload = {')
    expect(start, 'the save payload literal moved or was renamed').toBeGreaterThan(0)
    const end = pageSrc.indexOf('\n    }', pageSrc.indexOf('updated_at: new Date().toISOString(),', start))
    const block = pageSrc.slice(start, end)

    const REQUIRED = [
      'user_id:', 'reporting_year:', 'fiscal_year_end_month:', 'company_name:', 'company_id:',
      'revenue_millions:', 'employee_count:', 'boundary_approach:', 'california_nexus:',
      'prior_year_s1:', 'prior_year_s2:', 'comparability_disclosure:', 'selected_frameworks:',
      'locations_data:', 'coverage_resolutions:', 'pct_estimated:', 'scope1_total:',
      'scope2_location_total:', 'scope2_market_total:', 'scope1_intensity:', 'scope2_intensity:',
      'gwp_version:', 'status:', 'workings:', 'updated_at:',
    ]
    for (const k of REQUIRED) expect(block, `payload key ${k} was dropped`).toContain(k)
    expect(block).toContain('factor_editions:')
    // 25 pre-existing keys + the new one. Pinned so an ADDITION also has to come through this test,
    // rather than the list above quietly covering a payload that grew a key nobody reviewed.
    // [a-z0-9_] — the digits matter. Without them this misses scope1_total, scope2_location_total,
    // scope2_market_total, both intensities and both prior_year_s* keys: seven of the twenty-six.
    const keyCount = block.split('\n').filter(l => /^\s*[a-z0-9_]+:/.test(l)).length
    expect(keyCount, 'payload key count moved — update REQUIRED and this number together').toBe(26)
  })

  it('F25 scans a real file — a moved call site fails loudly instead of passing vacuously', () => {
    expect(pageSrc.length, `${PAGE} looks empty`).toBeGreaterThan(10_000)
    expect(() => lineContaining('factor_editions:')).toThrow(/ambiguous/)  // save + load = 2 matches
    expect(() => lineContaining('factor_editions: data.factor_editions')).not.toThrow()
  })
})
