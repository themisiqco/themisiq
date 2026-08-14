import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildFactorEditions, factorEditionsForSave, factorJurisdiction, sameFactorEditions, FAMILIES_NOT_COVERED,
  factorEditionState, FACTOR_EDITION_DISCLOSURE, anyPublishedFactorApplied,
} from './factorEditions'
import type { FactorEditions } from './factorEditions'
import { buildCompanySeries } from './series'
import type { InventoryRow } from './series'
import { EF_SOURCES, emptyLocation, getGridFactor, gridSource, combustionSource, findUnpriceableLocations, buildWorkings } from './engine'
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

  it('F15 refrigerants are NOT filed under combustion; steam is its OWN family', () => {
    // Refrigerants price from REFRIGERANT_GWP, whose edition is the AR set gwp_version already records.
    expect([...FAMILIES_NOT_COVERED].sort()).toEqual(['refrigerants'])
    // ⚠️ THIS TEST ASSERTED `{}` UNTIL 14 AUG 2026, and the change is the point rather than a
    // relaxation. Steam WAS excluded because EF.steam_mmbtu was the US EPA table for every country and
    // pickEF was never consulted, so filing a GB steam location under a UK edition would have named a
    // publisher that had not priced the row. Steam now routes per jurisdiction through STEAM_EF, so
    // DEFRA genuinely did price this one and recording it is the truthful answer.
    //   It is its OWN family, not part of combustion: EPA Table 7 / DEFRA's Scope 2 district-heat row
    // are different TABLES from the combustion citations, with different assumptions behind them.
    const ed = buildFactorEditions([
      loc({ country: 'GB', grid_region: 'UK', has_natural_gas: false, natural_gas_amount: 0, electricity_kwh: 0,
            has_purchased_steam: true, purchased_steam_mmbtu: 500,
            has_hfc_refrigerants: true, refrigerant_purchased_kg: 40 }),
    ], 2026)
    expect(ed, 'steam names its own family; refrigerants name nothing').toEqual({
      UK: { steam: { source: EF_SOURCES.steam_uk, edition: 'DEFRA 2026' } },
    })
    expect(ed.UK?.combustion, 'steam must NOT be filed under combustion').toBeUndefined()
  })

  it('F15b a jurisdiction with no published steam factor names no steam edition', () => {
    // CA/AU/NZ/EU publish nothing for purchased steam. An edition here would invent a publication.
    for (const country of ['CA', 'AU', 'NZ', 'DE']) {
      const ed = buildFactorEditions([
        loc({ country, grid_region: '', has_natural_gas: false, natural_gas_amount: 0, electricity_kwh: 0,
              has_purchased_steam: true, purchased_steam_mmbtu: 500 }),
      ], 2026)
      expect(ed, `${country}: no published steam factor, so no steam edition`).toEqual({})
    }
  })

  it('F15c a SUPPLIER-specific factor records no edition, even in a seeded jurisdiction', () => {
    // The row was priced by the customer's own provider figure, not by DEFRA. Filing it under
    // "DEFRA 2026" would put a publication claim on a private number.
    const ed = buildFactorEditions([
      loc({ country: 'GB', grid_region: 'UK', has_natural_gas: false, natural_gas_amount: 0, electricity_kwh: 0,
            has_purchased_steam: true, purchased_steam_mmbtu: 500,
            purchased_steam_supplier_ef: 0.198, purchased_steam_supplier_ef_basis: 'kwh' }),
    ], 2026)
    expect(ed).toEqual({})
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

// ── THE COMPARISON AXIS AND ITS RENDER SITE ──────────────────────────────────────────────────────
// A derivation nobody reads is the local failure mode, not a hypothetical one: exclusionsPresent is
// computed in series.ts and rendered on no surface at all, and mr_jurisdictions.active is a whole
// column no route consults. G9-G13 are what stop factorEditionState joining them — they read the
// trends page from disk, because a React render site is unreachable from this suite any other way.

const UK26 = buildFactorEditions([uk()], 2026)
const UK25 = buildFactorEditions([uk()], 2025)

// ⚠️ THE SIGNATURE CHANGED — factorEditionState now takes { editions, anyPublished } per year,
// because an empty map alone cannot say whether the year had a GAP or had nothing to record.
// `gap()` is the old meaning of {}: a year that DID price from a published table and did not record
// which edition. `nothing()` is the meaning that used to be collapsed into it.
const rec = (editions: FactorEditions) => ({ editions, anyPublished: true })
const gap = (editions: FactorEditions | null | undefined = {}) => ({ editions, anyPublished: true })
const nothing = () => ({ editions: {} as FactorEditions, anyPublished: false })

describe('factorEditionState — a union, because "we cannot say" is a third answer', () => {
  it('G1 three years on one edition → consistent', () => {
    expect(factorEditionState([rec(UK26), rec(UK26), rec(UK26)])).toBe('consistent')
    // Distinct objects with equal content, not the same reference — otherwise this would only be
    // proving that === works.
    expect(factorEditionState([
      rec(buildFactorEditions([uk({ id: 'a' })], 2026)),
      rec(buildFactorEditions([uk({ id: 'b' })], 2026)),
      rec(buildFactorEditions([uk({ id: 'c' })], 2026)),
    ])).toBe('consistent')
  })

  it('G2 a series spanning an edition boundary → changed', () => {
    // The 2025→2026 UK grid step, which is the whole reason the column exists.
    expect(factorEditionState([rec(UK25), rec(UK26)])).toBe('changed')
    expect(factorEditionState([rec(UK25), rec(UK25), rec(UK26)])).toBe('changed')
    // Order-independent: a series is not "unchanged" because the newer edition came first.
    expect(factorEditionState([rec(UK26), rec(UK25)])).toBe('changed')
  })

  it('G3 ANY year with an empty map → unknown, and NEVER consistent', () => {
    const WHY =
      'A YEAR WITH A REAL GAP READ AS CONSISTENT. These years DID price from a published table and ' +
      'did not record which edition, so the basis cannot be compared — it does NOT mean the factors ' +
      'matched. Reading it as consistent asserts a like-for-like basis nobody verified. (A year that ' +
      'applied no published table at all is a DIFFERENT case and is skipped, not counted here — G7.)'

    for (const maps of [
      [gap(), rec(UK26), rec(UK26)],
      [rec(UK26), gap(), rec(UK26)],
      [rec(UK26), rec(UK26), gap()],
      [gap()],
      [gap(), gap()],
      [gap(null), rec(UK26)],
      [gap(undefined), rec(UK26)],
    ]) {
      expect(factorEditionState(maps), WHY).toBe('unknown')
      expect(factorEditionState(maps), WHY).not.toBe('consistent')
    }
  })

  it('G4 UNKNOWN BEATS CHANGED when both apply — the ordering decision', () => {
    // 2024 unrecorded, 2025 and 2026 on different editions: a year is missing AND two recorded years
    // demonstrably differ. 'changed' would assert the edition set was fully observed — that the
    // revision we found is the whole story — which is exactly what an unrecorded year denies.
    expect(factorEditionState([gap(), rec(UK25), rec(UK26)])).toBe('unknown')
    expect(factorEditionState([rec(UK25), rec(UK26), gap()])).toBe('unknown')
    // And the same series WITHOUT the gap is 'changed', so this is an ordering test rather than a
    // test that empty maps break the comparison.
    expect(factorEditionState([rec(UK25), rec(UK26)])).toBe('changed')
  })

  it('G5 a ONE-YEAR series is consistent when recorded, unknown when not', () => {
    // Mirrors gwpConsistent, which is true for a single year (set size 1). Nothing is being
    // compared, so nothing is mis-stated — and 'consistent' renders no message at all, so a
    // single-year customer is told nothing either way.
    expect(factorEditionState([rec(UK26)])).toBe('consistent')
    expect(factorEditionState([gap()])).toBe('unknown')
    // No years at all: nothing to have been consistent about.
    expect(factorEditionState([])).toBe('unknown')
  })

  it('G6 a difference in EITHER family, in ANY jurisdiction, is a change', () => {
    const twoCountries = buildFactorEditions([uk(), loc({ id: 'z', country: 'CA', grid_region: 'ON' })], 2026)
    const sameAgain = buildFactorEditions([uk(), loc({ id: 'z', country: 'CA', grid_region: 'ON' })], 2026)
    expect(factorEditionState([rec(twoCountries), rec(sameAgain)])).toBe('consistent')

    // Combustion label moved, electricity identical.
    const combMoved: FactorEditions = JSON.parse(JSON.stringify(UK26))
    combMoved.UK!.combustion!.edition = 'DEFRA 2027'
    expect(factorEditionState([rec(UK26), rec(combMoved)])).toBe('changed')

    // A jurisdiction appearing in one year and not the other.
    expect(factorEditionState([rec(UK26), rec(twoCountries)])).toBe('changed')
  })
})

describe('the axis reaches CompanySeries and the loader fills it', () => {
  // ⚠️ anyPublishedFactor DEFAULTS TO TRUE HERE, and that is what these fixtures mean. Every empty
  // map below stands for a year that DID price from a published table and did not record the edition
  // — a real GAP. The other meaning of {} (a year that applied no published table at all) is a
  // different fixture and is covered by V-1b; conflating them is the bug this whole commit removes.
  const row = (year: number, factorEditions: FactorEditions | null, anyPublishedFactor = true): InventoryRow => ({
    company_id: 'c1', company_name: 'Acme', reporting_year: year,
    scope1_total: 100, scope2_location_total: 50, factorEditions, anyPublishedFactor,
  })

  it('G7 buildCompanySeries carries the state, over EVERY year', () => {
    expect(buildCompanySeries([row(2025, UK25), row(2026, UK26)])[0].factorEditionState).toBe('changed')
    expect(buildCompanySeries([row(2025, UK26), row(2026, UK26)])[0].factorEditionState).toBe('consistent')
    expect(buildCompanySeries([row(2025, {}), row(2026, UK26)])[0].factorEditionState).toBe('unknown')
    // Absent on the row (a hand-built caller, or a loader that stopped mapping it) is unknown too —
    // it must not default into silence.
    expect(buildCompanySeries([row(2025, null), row(2026, UK26)])[0].factorEditionState).toBe('unknown')
    // ...but an empty year that had NOTHING to record is skipped, not counted as a gap. Same maps as
    // the line three above; only the meaning of the empty differs, and the series answer follows it.
    expect(buildCompanySeries([row(2025, {}, false), row(2026, UK26)])[0].factorEditionState).toBe('consistent')
  })

  it('G7b UNPLOTTABLE YEARS STILL COUNT — a gap in the record must not hide behind a gap in the data', () => {
    // An 'excluded' year was still priced by SOME edition. If that edition is unrecorded, the series
    // genuinely cannot be confirmed on one factor basis, and filtering unplottable years out before
    // computing the state would report 'consistent' off the two years that happen to be plottable.
    //
    // ⚠️ THIS TEST EXISTS BECAUSE A MUTATION SURVIVED. Restricting the input to statusOf(r) === 'ok'
    // passed all 39 tests in this file — the "every year" claim was a comment in series.ts and
    // nothing held it. A comment is not a guard.
    const excluded: InventoryRow = {
      ...row(2024, {}), dataStatus: 'excluded', exclusions: [],
    }
    const s = buildCompanySeries([excluded, row(2025, UK26), row(2026, UK26)])[0]
    expect(s.factorEditionState, 'the unrecorded excluded year drives the series to unknown').toBe('unknown')
    expect(s.exclusionsPresent, 'and the year really is unplottable — otherwise this proves nothing').toBe(true)
    expect(s.years.find(y => y.year === 2024)!.dataStatus).toBe('excluded')

    // Same series with that year RECORDED is consistent, so the test is about the empty map rather
    // than about excluded years being counted at all.
    const recorded: InventoryRow = { ...row(2024, UK26), dataStatus: 'excluded', exclusions: [] }
    expect(buildCompanySeries([recorded, row(2025, UK26), row(2026, UK26)])[0].factorEditionState)
      .toBe('consistent')
  })

  it('G8 IT IS NOT A FOURTH BOOLEAN, and the other three axes are untouched', () => {
    const s = buildCompanySeries([row(2025, UK25), row(2026, UK26)])[0]
    expect(typeof s.factorEditionState, 'a boolean here would collapse changed and unknown').toBe('string')
    expect(['consistent', 'changed', 'unknown']).toContain(s.factorEditionState)
    // The three existing axes still compute, and still mean what they meant.
    expect(s.gwpConsistent).toBe(true)
    expect(s.estimationConsistent).toBe(true)
    expect(s.exclusionsPresent).toBe(false)
  })

  it('G9 the loader selects the column AND maps it — a write-only column otherwise', () => {
    const src = readFileSync(join(ROOT, 'lib/ghg/loadSeries.ts'), 'utf8')
    expect(src, 'not selected = every series reads unknown forever').toContain('"factor_editions, "')
    expect(src, 'selected but unmapped = the same thing, one layer along')
      .toContain('factorEditions: r.factor_editions ?? {}')
  })
})

describe('the trends page renders a DISTINCT output for each state', () => {
  const TRENDS = 'app/dashboard/ghg/trends/page.tsx'
  const trendsSrc = readFileSync(join(ROOT, TRENDS), 'utf8')

  it('G10 the copy is EXACTLY as specified, in one place, and label is detail\'s opening clause', () => {
    expect(FACTOR_EDITION_DISCLOSURE.changed!.detail).toBe(
      'Emission factors changed between years — year-over-year movement reflects both operational ' +
      'change and the factor revision. You may wish to consider whether this affects your base-year ' +
      'recalculation policy.')
    // The trailing sentence was added when years with nothing to record stopped being counted here:
    // without it, 'some years' invited a customer to go looking for a year that has no gap in it.
    expect(FACTOR_EDITION_DISCLOSURE.unknown!.detail).toBe(
      'Emission-factor editions were not recorded for some years — year-over-year comparison cannot ' +
      'be confirmed on a consistent factor basis. Years that applied no published emission factor ' +
      'table are not counted here; this refers to years where a published table was applied and the ' +
      'edition was not recorded.')

    // NOT A PARAPHRASE AND NOT A TRUNCATION: the label is the detail up to the em dash, verbatim, so
    // the strip can never come to say something the panel below it does not.
    for (const st of ['changed', 'unknown'] as const) {
      const d = FACTOR_EDITION_DISCLOSURE[st]!
      expect(d.detail.startsWith(d.label + ' —'), `${st}: label must open detail verbatim`).toBe(true)
      expect(d.label, 'a strip label this long defeats the point').not.toContain('—')
    }
  })

  it('G11 consistent is SILENT — a null entry, not a missing one', () => {
    expect(FACTOR_EDITION_DISCLOSURE.consistent).toBeNull()
    expect(Object.keys(FACTOR_EDITION_DISCLOSURE).sort()).toEqual(['changed', 'consistent', 'unknown'])
  })

  it('G12 THE RENDER SITE EXISTS and reads the state — this is the test that stops it becoming exclusionsPresent', () => {
    const WHY =
      'THE AXIS IS COMPUTED AND RENDERED NOWHERE. That is exactly what happened to ' +
      'exclusionsPresent in lib/ghg/series.ts and to mr_jurisdictions.active — a derivation that ' +
      'exists, passes its own tests, and reaches no customer.'
    expect(trendsSrc, WHY).toContain('FACTOR_EDITION_DISCLOSURE[selected.factorEditionState]')
    expect(trendsSrc, `${WHY}\n  the short label belongs in the header strip`)
      .toContain('{editionDisclosure.label}')
    expect(trendsSrc, `${WHY}\n  the FULL sentence belongs in the panel`)
      .toContain('{editionDisclosure.detail}')
    // Both renders are conditional on the same value, so consistent shows neither.
    expect(trendsSrc.match(/\{editionDisclosure && \(/g) ?? [], 'strip and panel')
      .toHaveLength(2)
  })

  it('G13 SURFACED, NOT GATED — the disclosure hides no figure', () => {
    // The whole point of the amber treatment: gwpConsistent and estimationConsistent both warn
    // without withholding. A factor revision is a disclosure obligation, not grounds to blank a
    // customer's own numbers.
    expect(trendsSrc, 'amber panel, same tokens as the SBTi estimation panel').toContain('#FDF6EC')
    expect(trendsSrc).toContain('#EAD9BE')
    expect(trendsSrc, 'the strip label uses the same amber the GWP warning uses').toContain('#ba7517')
    // Nothing about the state may appear in a condition that suppresses the chart or the metrics.
    for (const gate of ['factorEditionState !== ', 'factorEditionState ===']) {
      expect(trendsSrc, `${gate} would be a gate, not a disclosure`).not.toContain(gate)
    }
  })

  it('G14 scans a real file — a moved render site fails loudly instead of passing vacuously', () => {
    expect(trendsSrc.length, `${TRENDS} looks empty`).toBeGreaterThan(10_000)
    expect(trendsSrc).toContain("from '../../../../lib/ghg/factorEditions'")
    // The pre-existing GWP span is still there — this change sits beside it, it does not replace it.
    expect(trendsSrc).toContain('Mixed GWP basis — comparison may not be valid')
  })
})

// ── THE VERIFIER-FACING STATES ──────────────────────────────────────────────────────────────────
//
// ⚠️ THE VERIFIER PAGE HAS TWO STATES, NOT THREE, AND CONFLATING THEM IS THE TRAP.
// factorEditionState's 'consistent' | 'changed' | 'unknown' describes a SERIES - several reporting
// years compared against each other - and drives the customer's trends page. The verifier page shows
// ONE inventory, which either recorded its editions or did not. A single inventory cannot be
// 'changed' relative to anything, so there is no third state to render there.
describe('the states a verifier and a customer each see', () => {
  const page = readFileSync(join(process.cwd(), 'app', 'verify', '[token]', 'page.tsx'), 'utf8')

  // ⚠️ V-1 WAS SPLIT, NOT LOOSENED. It asserted "an empty map is unknown" on the comment it was
  // written from — "the pre-write-path back catalogue: priced by SOME edition, with no record of
  // which". That comment was false, and it is the origin of the false claim the verifier page made.
  // The two halves below are the two meanings it was collapsing; neither is weaker than the original.
  it('V-1a an empty map with a REAL GAP is still unknown', () => {
    // The year DID price from a published table and did not record which edition. Unchanged behaviour,
    // and it must never read as consistent — that would assert a like-for-like basis nobody verified.
    expect(factorEditionState([gap()])).toBe('unknown')
    expect(factorEditionState([gap(), gap()])).toBe('unknown')
    expect(factorEditionState([gap(null)])).toBe('unknown')
    expect(factorEditionState([gap(undefined)])).toBe('unknown')
    expect(factorEditionState([])).toBe('unknown')
    // A populated year beside a gap year is STILL unknown — the gap poisons the series, which is the
    // documented precedence in factorEditionState's own header.
    const populated: FactorEditions = { UK: { combustion: { source: 'x', edition: 'DEFRA 2026' } } }
    expect(factorEditionState([gap(), rec(populated)])).toBe('unknown')
  })

  it('V-1b an empty map with NOTHING RECORDABLE is skipped, not counted as a gap', () => {
    // The CA STEAM TEST case: a year whose only stream applied no published factor table. It has no
    // factor basis to be consistent or inconsistent WITH, so it must not drag the series to 'unknown'
    // — that message says a consistent basis could not be CONFIRMED, which implies there was one.
    const populated: FactorEditions = { UK: { combustion: { source: 'x', edition: 'DEFRA 2026' } } }
    // Every year nothing-recordable -> consistent, which renders NOTHING at all.
    expect(factorEditionState([nothing()])).toBe('consistent')
    expect(factorEditionState([nothing(), nothing(), nothing()])).toBe('consistent')
    // One recorded year among nothing-recordable years -> one basis, no gap.
    expect(factorEditionState([nothing(), rec(populated), nothing()])).toBe('consistent')
    // And the comparison still works across the recorded years, with the others skipped.
    expect(factorEditionState([nothing(), rec(UK25), rec(UK26)])).toBe('changed')
    // A mix of ALL THREE kinds: the gap still wins, because 'changed' would assert the edition set
    // was fully observed when one year demonstrably was not.
    expect(factorEditionState([nothing(), gap(), rec(UK25), rec(UK26)])).toBe('unknown')
  })

  it('V-2c the predicate decides which empty state renders, over all fourteen routes', () => {
    // The discriminator itself, asserted end to end rather than only its wording. Each fixture is a
    // route to {}, and every one of them must land on B (nothing recordable) — none of them priced
    // from a published table. The two controls land on the other side.
    const w = (l: Location | null) => buildWorkings(l ? [l] : [], 'AR6', 2025, [], 12) as never[]
    const bare = (o: Partial<Location>): Location => ({ ...emptyLocation('l1', 'S'), ...o })
    const NOTHING_RECORDABLE: [string, Location | null][] = [
      ['brand-new', bare({ country: 'US' })],
      ['no locations', null],
      ['declared-unquantified', bare({ country: 'US', has_natural_gas: true, natural_gas_amount: 0 })],
      ['steam CA', bare({ country: 'CA', has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj' })],
      ['steam AU', bare({ country: 'AU', has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj' })],
      ['steam NZ', bare({ country: 'NZ', has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj' })],
      ['steam EU', bare({ country: 'DE', has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj' })],
      ['steam SUPPLIER-specific', bare({ country: 'GB', has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj', purchased_steam_supplier_ef: 0.198, purchased_steam_supplier_ef_basis: 'kwh' })],
      ['electricity us_average', bare({ country: 'US', electricity_kwh: 100_000 })],
      ['electricity region ""', bare({ country: 'US', grid_region: '', electricity_kwh: 100_000 })],
      ['electricity unmapped country', bare({ country: 'JP', grid_region: '', electricity_kwh: 100_000 })],
      ['refrigerants only', bare({ country: 'US', has_hfc_refrigerants: true, refrigerant_purchased_kg: 40 })],
      ['biogenic only', bare({ country: 'US', biogenic_co2_mt: 10 })],
      ['every location excluded', bare({ country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' })],
    ]
    expect(NOTHING_RECORDABLE.length, 'all fourteen routes').toBe(14)
    for (const [name, l] of NOTHING_RECORDABLE) {
      expect(buildFactorEditions(l ? [l] : [], 2025), `${name}: must reach {}`).toEqual({})
      expect(anyPublishedFactorApplied(w(l)), `${name}: nothing was priced from a published table`).toBe(false)
    }
    // ⚠️ THE TWO A NAIVE "did any row price" TEST GETS WRONG, called out because they are the reason
    // this predicate lives beside FAMILIES_NOT_COVERED rather than on the page. Both DO price a row.
    const supplier = NOTHING_RECORDABLE.find(([n]) => n.includes('SUPPLIER'))![1]!
    const refrig = NOTHING_RECORDABLE.find(([n]) => n.includes('refrigerants'))![1]!
    for (const [n, l] of [['supplier steam', supplier], ['refrigerants', refrig]] as [string, Location][]) {
      const priced = (w(l) as { result_tco2e?: number | null; declaration?: string }[])
        .filter(r => r.result_tco2e != null && !r.declaration)
      expect(priced.length, `${n}: really does emit a priced row`).toBeGreaterThan(0)
      expect(anyPublishedFactorApplied(w(l)), `${n}: but not from a published table`).toBe(false)
    }
    // CONTROLS — something WAS priced from a published table.
    const pub = bare({ country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' })
    expect(anyPublishedFactorApplied(w(pub))).toBe(true)
    // MIXED: one stream published (CA electricity), one not (CA steam, no published factor).
    const mixed = bare({ country: 'CA', grid_region: 'ON', electricity_kwh: 50_000,
      has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj' })
    expect(anyPublishedFactorApplied(w(mixed)), 'one published stream is enough').toBe(true)
    // Degenerate inputs must not throw.
    expect(anyPublishedFactorApplied(null)).toBe(false)
    expect(anyPublishedFactorApplied(undefined)).toBe(false)
    expect(anyPublishedFactorApplied([])).toBe(false)
  })

  it('V-2b the B state — NOTHING RECORDABLE — renders its own words', () => {
    // What a real customer's first verifier reads if their inventory is CA STEAM TEST shaped.
    expect(page).toContain('No published factor editions apply')
    expect(page).toContain('was priced from a published emission factor table, so there is no')
    expect(page).toContain('not a limitation of the report')
    expect(page).toContain('This does not mean the figures are incomplete or unsupported')
    expect(page).toContain('no published table was applied')
    // The page must branch on the predicate, not on the map alone.
    expect(page).toContain('anyPublishedFactorApplied(inv.workings)')
  })

  it('V-2d the discipline scan applies to BOTH empty states', () => {
    // V-2 checked wording A only. B is the one a stranger reads above three zeros, so it needs the
    // same guarantee: nothing in either block may read as a warning about the figures themselves.
    const blocks = [
      ['A', 'Not recorded for this inventory'],
      ['B', 'No published factor editions apply'],
    ] as const
    for (const [which, anchor] of blocks) {
      const i = page.indexOf(anchor)
      expect(i, `${which}: block not found`).toBeGreaterThan(-1)
      const body = page.slice(i, i + 1600).toLowerCase()
      for (const alarm of ['error', 'invalid', 'incorrect', 'unreliable', 'cannot be relied']) {
        expect(body, `${which} must not read as a warning about the figures ("${alarm}")`).not.toContain(alarm)
      }
    }
  })

  it('V-2 the EMPTY state renders a stated disclosure, not a blank', () => {
    // The substantive requirement: 23 of 29 production inventories project {}, and a verifier must be
    // able to tell "we did not record which edition" from "no factors were used". Those are opposite
    // meanings, and this repo does not render an absence as a value.
    expect(page).toContain('Not recorded for this inventory')
    // It must SAY the opposite meaning out loud rather than leaving it to be inferred.
    expect(page).toContain('This does not mean no emission factors were used')
    // What a verifier CAN still conclude - the per-row citations survive.
    expect(page).toContain('each row of the calculation workings names the')
    // What they CANNOT - and that re-saving is not retrospective.
    expect(page).toContain('You cannot')
    expect(page).toContain('does not recover them for figures already')
    // And it must not read as a warning about the figures themselves.
    for (const alarm of ['error', 'invalid', 'incorrect', 'unreliable', 'cannot be relied']) {
      expect(page.slice(page.indexOf('Not recorded for this inventory'),
                        page.indexOf('Not recorded for this inventory') + 1600).toLowerCase(),
        `the empty-state disclosure must not read as a warning about the figures ("${alarm}")`,
      ).not.toContain(alarm)
    }
  })

  it('V-3 the POPULATED state names the editions and carries the snapshot caveat', () => {
    expect(page).toContain('Emission Factor Editions')
    expect(page).toContain("'Jurisdiction', 'Factor family', 'Source', 'Edition'")
    // ⚠️ THE CAVEAT IS THE PART THAT IS EASY TO DROP. Without it a verifier can read a recorded
    // edition as a statement about the factor tables the platform holds TODAY. It is a snapshot.
    expect(page).toContain('not the')
    expect(page).toContain('factor tables currently held by the platform')
    // And it must state the one thing that IS guaranteed: the map and the workings were written
    // together, so they describe the same calculation.
    expect(page).toContain('recorded at the same time as the')
  })

  it('V-4 absent, empty and populated are three DIFFERENT renders', () => {
    // Absent (the RPC did not send it) must render nothing at all - it is not a claim about the
    // inventory. Empty and populated both render, differently. The guard is the `!== undefined`.
    expect(page).toContain('inv.factor_editions !== undefined && inv.factor_editions !== null')
    expect(page).toContain('Object.keys(inv.factor_editions).length === 0')
  })

  it('V-5 the SERIES states keep their own wording, and consistent stays silent', () => {
    // The customer-facing trends surface, unchanged by the verifier work. Quoted here so the two
    // surfaces' wording can be compared in one place - the repo's standing rule is that the same
    // finding must not be described two different ways in front of the same reader.
    expect(FACTOR_EDITION_DISCLOSURE.consistent, 'a series on one basis says nothing').toBeNull()
    expect(FACTOR_EDITION_DISCLOSURE.changed!.label).toBe('Emission factors changed between years')
    expect(FACTOR_EDITION_DISCLOSURE.changed!.detail).toContain('base-year')
    expect(FACTOR_EDITION_DISCLOSURE.unknown!.label).toContain('were not recorded for some years')
    expect(FACTOR_EDITION_DISCLOSURE.unknown!.detail).toContain('cannot')
    // label IS the opening clause of detail, verbatim - the strip and the panel cannot diverge.
    for (const s of ['changed', 'unknown'] as const) {
      expect(FACTOR_EDITION_DISCLOSURE[s]!.detail.startsWith(FACTOR_EDITION_DISCLOSURE[s]!.label),
        `${s}: the short label must open the long detail verbatim`).toBe(true)
    }
    // The two surfaces answer DIFFERENT questions and must not borrow each other's words: the series
    // states talk about years, the verifier page about one inventory.
    expect(page, 'the verifier page must not import the series wording').not.toContain('between years')
  })
})

// ── AN EXCLUDED LOCATION NAMES NO EDITION ────────────────────────────────────────────────────────
//
// THE DEFECT. A location whose fuel is recorded in a unit no table carries is excluded WHOLE from
// every total — calcInventory skips it, buildWorkings replaces its rows with one exclusion row, and
// the wizard banners it. buildFactorEditions did not know: it recorded {US: combustion} for a
// location that contributed nothing, and as of the verifier whitelist that reached a verifier, who
// would read "US EPA 2024 - combustion" with no way to know it describes excluded emissions.
//
// It is the INVERSE of the case the electricity gate guards. That one refuses an edition for a
// family that priced nothing (a claim about a table that did not price anything); this refuses one
// for a LOCATION that priced nothing (a claim about a figure that is not in the report). Same rule.
describe('a location excluded from the totals records no edition', () => {
  // Every (country, stream, unit) that makes calcLocation refuse, enumerated by brute force over the
  // engine rather than hand-listed — 18 of them. Kept as the fixture list so the fix is asserted
  // against ALL routes to exclusion, not just the US m3 gas case that surfaced it.
  const UNPRICEABLE: [string, Partial<Location>][] = [
    ['US gas m3',        { country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }],
    ['US gas kwh',       { country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
    ['US propane kg',    { country: 'US', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
    ['CA gas kwh',       { country: 'CA', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
    ['CA propane kg',    { country: 'CA', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
    ['GB gas m3',        { country: 'GB', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }],
    ['GB propane kg',    { country: 'GB', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
    ['DE gas kwh',       { country: 'DE', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
    ['DE propane kg',    { country: 'DE', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
    ['AU gas kwh',       { country: 'AU', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
    ['AU propane kg',    { country: 'AU', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
    ['NZ gas m3',        { country: 'NZ', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }],
    ['JP gas m3',        { country: 'JP', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }],
    ['JP gas kwh',       { country: 'JP', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
    ['JP propane kg',    { country: 'JP', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
    ['(unset) gas m3',   { country: '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }],
    ['(unset) gas kwh',  { country: '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
    ['(unset) propane kg', { country: '', has_propane: true, propane_amount: 1000, propane_unit: 'kg' }],
  ]
  // The fixture builder used by the rest of this file adds gas + electricity, which would make every
  // case unpriceable for the wrong reason. These start clean.
  const bare = (over: Partial<Location>): Location => ({ ...emptyLocation('l1', 'Site'), ...over })

  it('F26 EVERY route to exclusion records nothing — all 18', () => {
    for (const [name, over] of UNPRICEABLE) {
      const l = bare(over)
      // NOT VACUOUS: assert the location really is excluded before asserting the consequence. A
      // fixture that stopped being unpriceable would otherwise pass this test by accident.
      expect(findUnpriceableLocations([l], 'AR6', 2025).length, `${name}: fixture must be unpriceable`).toBe(1)
      expect(buildFactorEditions([l], 2025), `${name}: excluded location must name no edition`).toEqual({})
    }
  })

  it('F27 all three families are covered, not just combustion', () => {
    // The exclusion is decided per LOCATION; the family gates are decided per STREAM. So no
    // stream-level condition could have caught this, and each family had to be checked separately.
    const base = { country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' as const }
    // electricity: resolved region AND quantified kWh — its own gate is fully satisfied.
    const withElec = bare({ ...base, grid_region: 'US_CA', electricity_kwh: 100_000 })
    expect(findUnpriceableLocations([withElec], 'AR6', 2025).length).toBe(1)
    expect(buildFactorEditions([withElec], 2025), 'electricity edition on an excluded location').toEqual({})
    // steam: quantified, published US factor, no supplier figure — its own gate is fully satisfied.
    const withSteam = bare({ ...base, has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'mmbtu' })
    expect(findUnpriceableLocations([withSteam], 'AR6', 2025).length).toBe(1)
    expect(buildFactorEditions([withSteam], 2025), 'steam edition on an excluded location').toEqual({})
    // And all three at once.
    const all = bare({ ...base, grid_region: 'US_CA', electricity_kwh: 100_000,
      has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'mmbtu' })
    expect(buildFactorEditions([all], 2025)).toEqual({})
  })

  it('F28 A MIXED INVENTORY STILL RECORDS THE EDITION, FROM THE PRICEABLE LOCATION', () => {
    // ⚠️ THE TEST THAT MATTERS MOST, AND THE ONE A NAIVE FIX BREAKS. The obvious wrong shape is to
    // drop the whole JURISDICTION when any of its locations is excluded — a US site on m3 gas would
    // then erase the US combustion edition earned by the US site beside it that priced perfectly.
    // That would turn a defect that records too much into one that records too little, and the
    // second is worse: the first over-claims provenance, the second loses it for real figures.
    // The gate is a per-location `continue`, so the loop reaches the good location either way.
    const good = { ...emptyLocation('good', 'Priceable'), country: 'US', grid_region: 'US_CA',
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' as const,
      electricity_kwh: 50_000 }
    const bad = { ...emptyLocation('bad', 'Excluded'), country: 'US',
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' as const }
    expect(findUnpriceableLocations([good], 'AR6', 2025).length, 'good must be priceable').toBe(0)
    expect(findUnpriceableLocations([bad], 'AR6', 2025).length, 'bad must be excluded').toBe(1)

    const mixed = buildFactorEditions([good, bad], 2025)
    const aloneGood = buildFactorEditions([good], 2025)
    // Same jurisdiction, same family, one of each: the edition survives, sourced from the good one.
    expect(mixed, 'the excluded location must not erase its neighbour\'s edition').toEqual(aloneGood)
    expect(mixed.US?.combustion?.edition).toBe('US EPA 2024')
    expect(mixed.US?.electricity?.edition).toBe('2023')
    // Order must not matter — the excluded one first is the same answer.
    expect(buildFactorEditions([bad, good], 2025)).toEqual(aloneGood)
    // And an inventory of ONLY the excluded location records nothing at all.
    expect(buildFactorEditions([bad], 2025)).toEqual({})
  })

  it('F29 a priceable location is completely unaffected', () => {
    // The regression guard on the gate itself: an over-broad probe would silently empty the column
    // for every inventory, and every other test in this file would still pass if it only checked
    // the excluded cases.
    const gb = uk()
    expect(findUnpriceableLocations([gb], 'AR6', 2026).length).toBe(0)
    expect(buildFactorEditions([gb], 2026)).toEqual({
      UK: {
        combustion:  { source: EF_SOURCES.combustion_uk, edition: 'DEFRA 2026' },
        electricity: { source: EF_SOURCES.electricity_uk, edition: '2026' },
      },
    })
    // Steam too — a published-factor US steam location still names its edition.
    const steam = bare({ country: 'US', has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'mmbtu' })
    expect(buildFactorEditions([steam], 2025).US?.steam?.edition).toBe('US EPA 2025 Table 7')
  })
})
