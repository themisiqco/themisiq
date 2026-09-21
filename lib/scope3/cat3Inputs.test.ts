import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cat3InputsFrom, isUnitedKingdom } from './cat3Inputs'
import { priceCat3 } from './cat3Energy'
// ⚠️ THE TEST MAY IMPORT THE ENGINE; THE ADAPTER MAY NOT. C3I-9 pins the adapter's mirrored
// declaration logic against the engine's own findUndeclaredStreams, which is the only way to know the
// copy still matches. C3I-12 asserts neither module imports it.
import { buildWorkings, emptyLocation, findUndeclaredStreams, efJurisdiction, type Location } from '../ghg/engine'

const STREAMS = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate',
  'fuel_oil_residual', 'mobile', 'refrigerants', 'electricity', 'purchased_steam'] as const

/**
 * ⚠️ DECISION 6 IS STRICT, AND THE FIXTURES HAVE TO BE REALISTIC ABOUT IT. A location that has not
 * answered every stream withholds the whole category, so a fixture that only sets the streams it uses
 * would test nothing but the withholding. `used` are the streams the fixture supplies; the rest are
 * attested absent, which is what a finished GHG inventory carries (the export gate already blocks one
 * that does not: engine.ts findUndeclaredStreams).
 */
const answered = (over: Partial<Location>, used: readonly string[] = []): Location => ({
  ...emptyLocation(over.id ?? 'l1', String(over.name ?? 'Site')), ...over,
  stream_attestations: STREAMS.filter(s => !used.includes(s))
    .map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' })) as Location['stream_attestations'],
})

const loc = (over: Partial<Location>): Location =>
  ({ ...emptyLocation(over.id ?? 'l1', String(over.name ?? 'Site')), ...over })
const workingsOf = (locations: Location[]) => buildWorkings(locations, 'AR6', 2026, [], 12)

describe('Category 3 inputs, from the bound GHG inventory', () => {
  it('C3I-1 no workings: null, not an empty inventory', () => {
    for (const w of [null, undefined, 'not an array', {}, []]) {
      const r = cat3InputsFrom(w, [])
      expect(r.inputs, String(w)).toBeNull()
      expect(r.reason, String(w)).toEqual({ code: 'no_workings' })
    }
  })

  it('C3I-2 an older shape says so, and never reads as zero energy', () => {
    // Rows from before the fields Category 3 reads existed.
    const old = [{ location: 'Site', source: 'Natural gas', result_tco2e: 12 }]
    const r = cat3InputsFrom(old, [{ name: 'Site', country: 'GB' }])
    expect(r.inputs).toBeNull()
    expect(r.reason).toEqual({ code: 'workings_shape_unreadable', rows: 1 })
  })

  it('C3I-3 no locations_data: the country and the declaration state are both unanswerable', () => {
    const w = workingsOf([answered({ name: 'Site', country: 'GB', electricity_kwh: 1000, grid_region: 'UK' }, ['electricity'])])
    expect(cat3InputsFrom(w, null).reason).toEqual({ code: 'no_locations_data' })
    expect(cat3InputsFrom(w, 'nope').reason).toEqual({ code: 'no_locations_data' })
  })

  it('C3I-4 an unpriceable location contributes nothing and is named', () => {
    // A US location holding a gas figure in m3: no factor for that unit there, so the engine excludes
    // the whole location (engine.ts:2364-2394) and emits one row saying so.
    const l = answered({ name: 'Odd site', country: 'US', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' }, ['natural_gas'])
    const r = cat3InputsFrom(workingsOf([l]), [l])
    expect(r.inputs!.rows).toEqual([])
    expect(r.skipped).toEqual([{ code: 'location_excluded', location: 'Odd site' }])
  })

  it('C3I-5 a duplicate name in two countries is unresolved, never the first one found', () => {
    const l1 = answered({ id: 'a', name: 'Depot', country: 'GB', electricity_kwh: 1000, grid_region: 'UK' }, ['electricity'])
    const l2 = answered({ id: 'b', name: 'Depot', country: 'US', electricity_kwh: 2000, grid_region: 'US_CA' }, ['electricity'])
    const r = cat3InputsFrom(workingsOf([l1, l2]), [l1, l2])
    for (const row of r.inputs!.rows) {
      expect(row.country).toBeNull()
      expect(row.country_resolved).toBe(false)
    }
    expect(r.unresolved_locations).toEqual(['Depot'])
    // And the pricing module flags every one of them.
    const pricedRows = priceCat3(r.inputs!)
    expect(pricedRows.lines.length, 'the fixture must actually price, or this loop proves nothing').toBe(6)
    for (const line of pricedRows.lines) {
      expect(line.flags.map(f => f.code)).toEqual(['country_unresolved', 'uk_stand_in'])
    }
  })

  it('C3I-6 a blank name becomes the engine\'s own "Location" default, and joins on it', () => {
    const l = answered({ name: '', country: 'GB', electricity_kwh: 1000, grid_region: 'UK' }, ['electricity'])
    const w = workingsOf([l])
    expect((w[0] as { location: string }).location).toBe('Location')
    // One unnamed location: the join still answers, because 'Location' is the key on both sides.
    const one = cat3InputsFrom(w, [l])
    expect(one.inputs!.rows[0].country).toBe('GB')
    expect(one.inputs!.rows[0].country_resolved).toBe(true)
    // Two unnamed locations in different countries: indistinguishable, so unresolved.
    const l2 = answered({ id: 'b', name: '', country: 'US', electricity_kwh: 1, grid_region: 'US_CA' }, ['electricity'])
    const two = cat3InputsFrom(workingsOf([l, l2]), [l, l2])
    expect(two.inputs!.rows.every(r => r.country_resolved === false)).toBe(true)
  })

  it('C3I-7 a name missing from locations_data is unresolved', () => {
    const siteA = answered({ name: 'Site A', country: 'GB', electricity_kwh: 1000, grid_region: 'UK' }, ['electricity'])
    const siteB = answered({ id: 'b', name: 'Site B', country: 'GB' }, [])
    const w = workingsOf([siteA])
    // locations_data holds a different site: the name in the workings row joins to nothing.
    const r = cat3InputsFrom(w, [siteB])
    expect(r.inputs!.rows[0].country_resolved).toBe(false)
    expect(r.unresolved_locations).toEqual(['Site A'])
  })

  it('C3I-8 New Zealand: the engine\'s own 3c row is attached, and the market-based row is skipped', () => {
    const nz = answered({ name: 'Auckland', country: 'NZ', electricity_kwh: 250_000, grid_region: 'NZ',
                          renewable_electricity_kwh: 50_000, nz_td_losses: true }, ['electricity'])
    const r = cat3InputsFrom(workingsOf([nz]), [nz])
    const elec = r.inputs!.rows.filter(row => row.stream === 'electricity')
    expect(elec).toHaveLength(1)                                   // location-based only
    expect(elec[0].scope2_method).toBe('location-based')
    expect(elec[0].activity).toBe(250_000)                         // the total, renewable included
    expect(elec[0].nz_td_result_tco2e).toBeCloseTo(250_000 * 0.00596 / 1000, 12)
    expect(r.skipped).toContainEqual({ code: 'market_based_row_not_used', location: 'Auckland' })
    // Priced: 3c is the engine's figure, the two WTT lines are DEFRA with a stand-in flag.
    const priced = priceCat3(r.inputs!)
    const td = priced.lines.find(l => l.line === 'electricity_td_loss')!
    expect(td.factor).toBeNull()
    expect(td.kg_co2e).toBeCloseTo(250_000 * 0.00596, 9)
    // An NZ location that never opted in has no engine figure, so the 3c line withholds and says why.
    const dunedin = answered({ name: 'Dunedin', country: 'NZ', electricity_kwh: 1000, grid_region: 'NZ' }, ['electricity'])
    const off = cat3InputsFrom(workingsOf([dunedin]), [dunedin])
    expect(off.inputs!.rows[0].nz_td_result_tco2e).toBeNull()
    expect(priceCat3(off.inputs!).unpriced.map(u => u.reason.code)).toEqual(['no_nz_td_figure'])
  })

  it('C3I-9 the mirrored declaration logic agrees with the engine\'s findUndeclaredStreams', () => {
    // ⚠️ THE ADAPTER COPIES THE ENGINE'S RULES RATHER THAN IMPORTING THEM, so this is the check that
    // the copy is still the same rule. Three shapes: everything answered and empty, one stream
    // unanswered, and everything answered with data.
    const allDeclaredEmpty = loc({
      name: 'Empty', country: 'GB',
      stream_attestations: [
        'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
        'mobile', 'refrigerants', 'electricity', 'purchased_steam',
      ].map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' })) as Location['stream_attestations'],
    })
    const oneUndeclared = loc({
      ...allDeclaredEmpty,
      stream_attestations: (allDeclaredEmpty.stream_attestations ?? []).filter(a => a.stream !== 'propane'),
    })
    const declaredWithData = loc({
      name: 'Busy', country: 'GB', electricity_kwh: 10_000, grid_region: 'UK',
      has_natural_gas: true, natural_gas_amount: 5_000, natural_gas_unit: 'kwh',
      stream_attestations: ['propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
        'mobile', 'refrigerants', 'purchased_steam']
        .map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' })) as Location['stream_attestations'],
    })
    for (const [name, locations] of [
      ['all declared, empty', [allDeclaredEmpty]],
      ['one undeclared', [oneUndeclared]],
      ['declared with data', [declaredWithData]],
      ['a mixture', [allDeclaredEmpty, oneUndeclared, declaredWithData]],
    ] as [string, Location[]][]) {
      const fromEngine = [...new Set(findUndeclaredStreams(locations).map(u => u.stream))].sort()
      const fromAdapter = [...cat3InputsFrom(workingsOf(locations), locations).inputs!.declaration.undeclared].sort()
      expect(fromAdapter, name).toEqual(fromEngine)
    }
    // And the two ends of decision 6, through the pricing module.
    const empty = cat3InputsFrom(workingsOf([allDeclaredEmpty]), [allDeclaredEmpty])
    expect(empty.inputs!.declaration.undeclared).toEqual([])
    expect(priceCat3(empty.inputs!).status).toBe('zero')
    const missing = cat3InputsFrom(workingsOf([oneUndeclared]), [oneUndeclared])
    expect(missing.inputs!.declaration.undeclared).toEqual(['propane'])
    expect(priceCat3(missing.inputs!).status).toBe('withheld')
  })

  it('C3I-10 the UK is recognised in every spelling the engine accepts, and nothing else becomes the US', () => {
    for (const spelling of ['GB', 'gb', 'UK', ' uk ', 'Gb']) {
      expect(isUnitedKingdom(spelling), spelling).toBe(true)
      expect(efJurisdiction({ country: spelling }), `${spelling}: the engine agrees`).toBe('UK')
    }
    for (const other of ['US', 'FR', 'NZ', 'ZZ', 'OTHER', '']) expect(isUnitedKingdom(other), other).toBe(false)
    // ⚠️ AN UNRECOGNISED COUNTRY IS NOT-UK, AND SINCE 21 SEP 2026 IT IS NOT AMERICAN ANYWHERE.
    // This line used to read `.toBe('US')` and carried a note that the engine's fallback was right
    // for picking a factor table and wrong here. The fallback is gone: efJurisdiction answers null,
    // and Category 3's own answer for the same country is unchanged, which is the point of keeping
    // the assertion rather than deleting it.
    expect(efJurisdiction({ country: 'ZZ' })).toBeNull()

    // ⚠️ AND THE CONSEQUENCE FOR CATEGORY 3 IS STRONGER THAN IT WAS, WHICH IS WHY THE BODY OF THIS
    // TEST CHANGED RATHER THAN ITS TITLE. Until 21 Sep 2026 a 'ZZ' location was PRICED by the GHG
    // engine from US tables, so its rows arrived here as ordinary priced rows and Category 3 did
    // the honest thing one level down: it carried 'ZZ' as stored, refused to call it the UK, and
    // flagged uk_stand_in on the figure. That was the right answer to the wrong question. The
    // location is now excluded by the engine itself, so no priced row reaches this module at all
    // and the only thing to assert is that the exclusion arrives intact.
    //   Nothing about Category 3's own logic changed. The rows it used to receive are simply no
    // longer produced, which is the outcome the uk_stand_in flag was standing in for.
    for (const country of ['ZZ', 'OTHER', '', 'JP']) {
      const odd = answered({ name: 'Elsewhere', country, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'therms' }, ['natural_gas'])
      const r = cat3InputsFrom(workingsOf([odd]), [odd])
      expect(r.skipped, `${JSON.stringify(country)} arrives as an exclusion`)
        .toContainEqual({ code: 'location_excluded', location: 'Elsewhere' })
      expect(r.inputs!.rows, `${JSON.stringify(country)} contributes no priced row`).toEqual([])
    }
  })

  it('C3I-11 end to end: the design\'s worked example comes to 19,572.330 kg', () => {
    // The same two sites as cat3Energy.test.ts C3-1, this time through the engine's own workings.
    const uk = answered({ id: 'uk', name: 'UK site', country: 'GB', grid_region: 'UK',
                          electricity_kwh: 100_000, has_natural_gas: true, natural_gas_amount: 50_000,
                          natural_gas_unit: 'kwh' }, ['electricity', 'natural_gas'])
    const us = answered({ id: 'us', name: 'US site', country: 'US', grid_region: 'US_CA',
                          electricity_kwh: 200_000,
                          has_natural_gas: true, natural_gas_amount: 1_000, natural_gas_unit: 'therms',
                          has_mobile: true, diesel_mobile_amount: 500, diesel_mobile_unit: 'gallons' },
                        ['electricity', 'natural_gas', 'mobile'])
    const r = cat3InputsFrom(workingsOf([uk, us]), [uk, us])
    expect(r.reason).toBeNull()
    const priced = priceCat3(r.inputs!)
    expect(priced.status).toBe('priced')
    expect(priced.lines).toHaveLength(9)
    // The design's figure is the rounded one; the module rounds nothing, so the test holds both.
    expect(priced.kg_co2e).toBeCloseTo(19_572.329976, 6)
    expect(priced.kg_co2e.toFixed(3)).toBe('19572.330')
    // The mobile row split into its fuel by the source line the engine writes.
    expect(priced.lines.filter(l => l.stream === 'mobile_diesel')).toHaveLength(1)
    // Every US line carries the stand-in flag, naming the publisher that priced its Scope 1 figure.
    const usLine = priced.lines.find(l => l.location === 'US site' && l.stream === 'mobile_diesel')!
    expect(usLine.flags[0]).toMatchObject({ code: 'uk_stand_in', country: 'US' })
    expect(String((usLine.flags[0] as { scope1_publisher: string }).scope1_publisher)).toMatch(/EPA/)
  })

  it('C3I-13 a mobile row naming neither fuel is unpriced and says so, never defaulted', () => {
    // ⚠️ HAND-BUILT, BECAUSE THE ENGINE CANNOT PRODUCE THIS ROW TODAY. The two source lines are
    // literals (engine.ts:2852-2853) and pushFuel passes them through untouched, so the only way a
    // saved inventory carries a third wording is if an older engine wrote one. That is exactly the
    // case worth guarding: the reader must not fall back to a fuel, because petrol and diesel carry
    // different factors and the wrong one is a checkable number against a fuel nobody burned.
    const site = answered({ id: 'l1', name: 'Depot', country: 'GB' }, ['mobile'])
    const unnamed = (source: string) => [{
      location: 'Depot', stream: 'mobile', source, scope: 1,
      activity_data: 1_000, activity_unit: 'litres', result_tco2e: 2.7, entry_method: 'manual',
    }]
    for (const source of ['Petrol (mobile)', 'Fleet fuel', 'Mobile combustion', '']) {
      const r = cat3InputsFrom(unnamed(source), [site])
      // Nothing priced, and nothing invented: no row at all rather than a row on a guessed fuel.
      expect(r.inputs?.rows ?? [], source).toHaveLength(0)
      const named = r.skipped.filter(sk => sk.code === 'mobile_fuel_not_named')
      expect(named, source).toHaveLength(1)
      // The unread text is carried, so what the reader could not read can be seen.
      expect(named[0]).toMatchObject({ code: 'mobile_fuel_not_named', location: 'Depot', source })
      // The failure this exists to catch: a silent default to either fuel.
      const streams = (r.inputs?.rows ?? []).map(row => row.stream)
      expect(streams, source).not.toContain('mobile_gasoline')
      expect(streams, source).not.toContain('mobile_diesel')
    }
    // And the control: the engine's own wording still reads, so the guard is not passing by refusing
    // everything. Both literals, exactly as engine.ts:2852-2853 write them.
    for (const [source, stream] of [['Gasoline (mobile)', 'mobile_gasoline'], ['Diesel (mobile)', 'mobile_diesel']] as const) {
      const r = cat3InputsFrom(unnamed(source), [site])
      expect(r.inputs?.rows.map(row => row.stream), source).toEqual([stream])
      expect(r.skipped.filter(sk => sk.code === 'mobile_fuel_not_named'), source).toHaveLength(0)
    }
  })

  it('C3I-14 no_published_factor is the purchased-steam path; a Scope 1 fuel with no factor is a whole-location exclusion', () => {
    // Which path a missing factor takes decides which skip reason is honest, so both are pinned
    // against the engine rather than asserted from the reading of it.
    // Scope 2: Canada publishes no purchased-steam factor (engine.test.ts T4).
    const steam = answered({ id: 's', name: 'CA plant', country: 'CA', grid_region: 'CA_ON',
                             has_purchased_steam: true, purchased_steam_mmbtu: 1_000,
                             purchased_steam_unit: 'gj' }, ['purchased_steam'])
    const steamRows = workingsOf([steam])
    expect(steamRows.filter(r => r.declaration === 'no_published_factor').map(r => r.stream))
      .toEqual(['purchased_steam'])
    const sr = cat3InputsFrom(steamRows, [steam])
    expect(sr.skipped).toContainEqual({ code: 'scope2_not_priced', location: 'CA plant', stream: 'purchased_steam' })
    expect(sr.inputs?.rows ?? []).toHaveLength(0)

    // Scope 1: natural gas in m3 has no US factor (engine.test.ts GROUP K/L). The engine does NOT
    // mark the row 'no_published_factor' — it excludes the whole location instead.
    const fuel = answered({ id: 'f', name: 'US plant', country: 'US',
                            has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' },
                          ['natural_gas'])
    const fuelRows = workingsOf([fuel])
    expect(fuelRows.filter(r => r.declaration === 'no_published_factor')).toHaveLength(0)
    expect(fuelRows.filter(r => r.declaration === 'unpriceable')).toHaveLength(1)
    const fr = cat3InputsFrom(fuelRows, [fuel])
    expect(fr.skipped).toContainEqual({ code: 'location_excluded', location: 'US plant' })
    expect(fr.inputs?.rows ?? []).toHaveLength(0)
  })

  it('C3I-15 the publisher is taken without the GHG module\'s own vintage note', () => {
    // ⚠️ ef_source IS A COMPOSITE, and only its first part is a publisher. engine.ts:2864-2865 joins
    // the citation to getGridFactor's note with ' \u00b7 ', and that note is about what the GHG side did,
    // not about the Category 3 line: "Grid factor for 2023 applied to 2025 inventory (latest vintage
    // held)." It reached a customer inside a Category 3 sentence, with its full stop.
    const attest = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate',
      'fuel_oil_residual', 'mobile', 'refrigerants', 'purchased_steam']
      .map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' }))
    const row = (ef: string) => cat3InputsFrom(
      [{ location: 'Buffalo', stream: 'electricity', source: 'Electricity (US_NY)', scope: 2,
         activity_data: 10_000, activity_unit: 'kWh', scope2_method: 'location-based',
         ef_source: ef, result_tco2e: 2, entry_method: 'manual' }],
      [{ id: 'b', name: 'Buffalo', country: 'US', electricity_kwh: 10_000, stream_attestations: attest }],
    ).inputs!.rows[0].scope1_publisher
    expect(row('US EPA eGRID2023 \u00b7 Grid factor for 2023 applied to 2025 inventory (latest vintage held).'))
      .toBe('US EPA eGRID2023')
    // A citation with no note is unchanged, and an empty field is an absence rather than an empty name.
    expect(row('US EPA eGRID2023')).toBe('US EPA eGRID2023')
    expect(row('  US EPA eGRID2023  ')).toBe('US EPA eGRID2023')
    expect(row('')).toBeNull()
    // Two notes joined the same way: still only the publisher.
    expect(row('AIB 2024 \u00b7 residual mix \u00b7 latest vintage held.')).toBe('AIB 2024')
  })

  it('C3I-12 neither Category 3 module imports the GHG engine', () => {
    // ⚠️ THE IMPORT SPECIFIERS, NOT EVERY STRING IN THE FILE. cat3Energy.ts names 'lib/ghg/engine.ts'
    // inside the New Zealand flag's `source` field, which is a citation for a verifier and not an
    // import; a whole-file match failed on it, which is the wrong thing to guard.
    for (const file of ['cat3Inputs.ts', 'cat3Energy.ts']) {
      const src = readFileSync(join(__dirname, file), 'utf8')
      const specifiers = [...src.matchAll(/^\s*import\s[\s\S]*?from\s+'([^']+)'/gm)].map(m => m[1])
      expect(specifiers.length, `${file} has imports to check`).toBeGreaterThan(0)
      for (const spec of specifiers) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/ghg/)
      }
    }
    // The adapter's only imports are the type it produces and nothing else.
    const adapter = readFileSync(join(__dirname, 'cat3Inputs.ts'), 'utf8')
    expect([...adapter.matchAll(/^import .*$/gm)].map(m => m[0]))
      .toEqual(["import type { Cat3InputRow, Cat3Inputs, Cat3Stream } from './cat3Energy'"])
  })
})
