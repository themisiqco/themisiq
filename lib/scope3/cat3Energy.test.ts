import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { priceCat3, type Cat3InputRow, type Cat3Inputs } from './cat3Energy'

// ── CATEGORY 3 PRICING ───────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE EXPECTED FIGURES ARE WRITTEN OUT HERE, NOT READ FROM THE ARTEFACT. Each factor and each
// conversion below is the number the workbook publishes, typed out with the cell it comes from, so the
// test and the module cannot agree by reading the same table. A factor that changes in the artefact
// fails here, which is the point: a Category 3 figure moving is a thing to decide, not to absorb.
//
//   WTT- fuels!D41  natural gas, kWh (Gross CV)          0.03021
//   WTT- fuels!D71  diesel (average biofuel blend), L    0.61101
//   WTT- UK electricity!E19  generation WTT              0.03682
//   Transmission and distribution!E22  T&D loss          0.01299
//   WTT- UK electricity!E24  WTT of the T&D loss         0.00359
//   Conversions!D30  1 therm                             29.307108334876538 kWh
//   Conversions!C40  1 US gallon                         3.7854118034613733 L

const NG_GROSS = 0.03021
const DIESEL_L = 0.61101
const ELEC_GEN = 0.03682
const ELEC_TD = 0.01299
const ELEC_TD_WTT = 0.00359
const THERM_KWH = 29.307108334876538
const GAL_L = 3.7854118034613733

const row = (over: Partial<Cat3InputRow> & Pick<Cat3InputRow, 'id' | 'stream' | 'activity' | 'unit'>): Cat3InputRow => ({
  location: 'Site', country: 'GB', country_resolved: true, entry_method: 'manual', ...over,
})
const inputs = (rows: Cat3InputRow[], undeclared: string[] = []): Cat3Inputs =>
  ({ rows, declaration: { undeclared } })
const line = (r: ReturnType<typeof priceCat3>, id: string, kind: string) =>
  r.lines.find(l => l.row_id === id && l.line === kind)!

describe('Category 3 pricing', () => {
  it('C3-1 the design\'s worked example: nine lines, 19,572.330 kg', () => {
    // UK site: 100,000 kWh electricity and 50,000 kWh gas.
    // US site: 200,000 kWh electricity, 1,000 therms gas and 500 US gallons diesel.
    const r = priceCat3(inputs([
      row({ id: 'uk-elec', stream: 'electricity', activity: 100_000, unit: 'kWh', location: 'UK site', scope2_method: 'location-based' }),
      row({ id: 'uk-gas', stream: 'natural_gas', activity: 50_000, unit: 'kwh', location: 'UK site' }),
      row({ id: 'us-elec', stream: 'electricity', activity: 200_000, unit: 'kWh', location: 'US site', country: 'US', scope2_method: 'location-based', scope1_publisher: 'US EPA (2025) Emission Factors Hub' }),
      row({ id: 'us-gas', stream: 'natural_gas', activity: 1_000, unit: 'therms', location: 'US site', country: 'US' }),
      row({ id: 'us-diesel', stream: 'mobile_diesel', activity: 500, unit: 'gal', location: 'US site', country: 'US' }),
    ]))

    expect(r.status).toBe('priced')
    expect(r.lines).toHaveLength(9)
    expect(r.unpriced).toEqual([])

    const expected: [string, string, number][] = [
      ['uk-elec', 'electricity_generation_wtt', 100_000 * ELEC_GEN],                    // 3,682.000
      ['uk-elec', 'electricity_td_loss', 100_000 * ELEC_TD],                            // 1,299.000
      ['uk-elec', 'electricity_td_wtt', 100_000 * ELEC_TD_WTT],                         //   359.000
      ['uk-gas', 'fuel_wtt', 50_000 * NG_GROSS],                                        // 1,510.500
      ['us-gas', 'fuel_wtt', 1_000 * THERM_KWH * NG_GROSS],                             //   885.368
      ['us-diesel', 'fuel_wtt', 500 * GAL_L * DIESEL_L],                                // 1,156.462
      ['us-elec', 'electricity_generation_wtt', 200_000 * ELEC_GEN],                    // 7,364.000
      ['us-elec', 'electricity_td_loss', 200_000 * ELEC_TD],                            // 2,598.000
      ['us-elec', 'electricity_td_wtt', 200_000 * ELEC_TD_WTT],                         //   718.000
    ]
    for (const [id, kind, kg] of expected) {
      expect(line(r, id, kind).kg_co2e, `${id} ${kind}`).toBeCloseTo(kg, 6)
    }
    expect(r.kg_co2e).toBeCloseTo(expected.reduce((s, [, , kg]) => s + kg, 0), 6)
    expect(r.kg_co2e).toBeCloseTo(19_572.330, 3)

    // The conversions are recorded with the cell that published them, and the activity as entered stays.
    const usGas = line(r, 'us-gas', 'fuel_wtt')
    expect(usGas.activity_as_entered).toBe(1_000)
    expect(usGas.unit_as_entered).toBe('therms')
    expect(usGas.activity_priced).toBeCloseTo(1_000 * THERM_KWH, 9)
    expect(usGas.conversion).toMatchObject({ source: 'defra', key: 'therm_to_kwh', cite: 'Conversions!D30' })
    expect(usGas.factor).toMatchObject({ key: 'natural_gas_kwh_gross_cv', sheet: 'WTT- fuels', cell: 'D41' })
    // ⚠️ NOTHING IS ROUNDED HERE: the figure carries its full precision to the display layer.
    expect(line(r, 'us-diesel', 'fuel_wtt').kg_co2e).toBe(500 * GAL_L * DIESEL_L)
  })

  it('C3-2 every UK row is unflagged and every non-UK row carries uk_stand_in, fuels included', () => {
    const r = priceCat3(inputs([
      row({ id: 'uk-gas', stream: 'natural_gas', activity: 1, unit: 'kwh' }),
      row({ id: 'us-diesel', stream: 'mobile_diesel', activity: 1, unit: 'litres', country: 'US', scope1_publisher: 'US EPA (2025) Emission Factors Hub' }),
      row({ id: 'fr-steam', stream: 'purchased_steam', activity: 1, unit: 'kwh', country: 'FR' }),
    ]))
    expect(line(r, 'uk-gas', 'fuel_wtt').flags).toEqual([])
    // A FUEL at a non-UK location is a stand-in too, and the flag names the Scope 1 publisher beside it.
    expect(line(r, 'us-diesel', 'fuel_wtt').flags).toEqual([
      { code: 'uk_stand_in', country: 'US', scope1_publisher: 'US EPA (2025) Emission Factors Hub' },
    ])
    for (const kind of ['steam_wtt', 'steam_distribution_loss', 'steam_distribution_wtt']) {
      expect(line(r, 'fr-steam', kind).flags.map(f => f.code), kind).toEqual(['uk_stand_in'])
    }
  })

  it('C3-3 an unresolved country still carries uk_stand_in, and says it is unresolved', () => {
    const r = priceCat3(inputs([
      row({ id: 'x', stream: 'natural_gas', activity: 1, unit: 'kwh', country: null, country_resolved: false }),
    ]))
    expect(line(r, 'x', 'fuel_wtt').flags).toEqual([
      { code: 'country_unresolved' },
      { code: 'uk_stand_in', country: null, scope1_publisher: null },
    ])
  })

  it('C3-4 New Zealand: 3c is the engine\'s own figure exactly, and the two WTT lines are DEFRA with a flag', () => {
    const r = priceCat3(inputs([
      row({ id: 'nz', stream: 'electricity', activity: 250_000, unit: 'kWh', country: 'NZ',
            scope2_method: 'location-based', nz_td_result_tco2e: 1.49 }),
    ]))
    const td = line(r, 'nz', 'electricity_td_loss')
    expect(td.kg_co2e).toBe(1.49 * 1000)                     // tonnes to kg, an exact identity
    expect(td.factor).toBeNull()                             // no DEFRA row priced it
    expect(td.flags).toEqual([{ code: 'nz_mfe_3c', source: 'lib/ghg/engine.ts s3_td (MfE)' }])
    // ⚠️ NOT RECOMPUTED: DEFRA's T&D factor would have given a different number for the same loss.
    expect(td.kg_co2e).not.toBeCloseTo(250_000 * ELEC_TD, 3)
    for (const kind of ['electricity_generation_wtt', 'electricity_td_wtt']) {
      expect(line(r, 'nz', kind).factor, kind).not.toBeNull()
      expect(line(r, 'nz', kind).flags.map(f => f.code), kind).toEqual(['uk_stand_in'])
    }
    // An NZ row with no figure loses only its 3c line, and says why.
    const missing = priceCat3(inputs([
      row({ id: 'nz2', stream: 'electricity', activity: 1, unit: 'kWh', country: 'NZ', scope2_method: 'location-based' }),
    ]))
    expect(missing.lines.map(l => l.line)).toEqual(['electricity_generation_wtt', 'electricity_td_wtt'])
    expect(missing.unpriced).toEqual([
      { row_id: 'nz2', location: 'Site', stream: 'electricity', reason: { code: 'no_nz_td_figure', location: 'Site' } },
    ])
  })

  it('C3-5 a market-based electricity row is never priced, and says so', () => {
    const r = priceCat3(inputs([
      row({ id: 'loc', stream: 'electricity', activity: 1_000, unit: 'kWh', scope2_method: 'location-based' }),
      row({ id: 'mkt', stream: 'electricity', activity: 400, unit: 'kWh uncovered', scope2_method: 'market-based' }),
    ]))
    expect(r.lines.every(l => l.row_id === 'loc')).toBe(true)
    expect(r.lines).toHaveLength(3)
    expect(r.unpriced).toEqual([
      { row_id: 'mkt', location: 'Site', stream: 'electricity', reason: { code: 'market_based_row_not_used' } },
    ])
  })

  it('C3-6 a refrigerant row is rejected by name, never silently dropped', () => {
    const r = priceCat3(inputs([
      row({ id: 'r134a', stream: 'refrigerants', activity: 12, unit: 'kg' }),
      row({ id: 'gas', stream: 'natural_gas', activity: 1, unit: 'kwh' }),
    ]))
    expect(r.lines.map(l => l.row_id)).toEqual(['gas'])
    expect(r.unpriced).toEqual([
      { row_id: 'r134a', location: 'Site', stream: 'refrigerants', reason: { code: 'refrigerants_not_in_category' } },
    ])
  })

  it('C3-7 a unit with no published row is unpriced and names the unit', () => {
    const r = priceCat3(inputs([
      row({ id: 'ccf', stream: 'natural_gas', activity: 100, unit: 'ccf' }),
      row({ id: 'lbs', stream: 'propane', activity: 100, unit: 'lbs' }),
      row({ id: 'mwh', stream: 'electricity', activity: 5, unit: 'MWh', scope2_method: 'location-based' }),
      row({ id: 'who-knows', stream: 'fuel_oil_residual', activity: 5, unit: 'barrels' }),
    ]))
    expect(r.status).toBe('withheld')
    expect(r.withheld).toEqual({ code: 'nothing_priced' })
    expect(r.unpriced.map(u => u.reason)).toEqual([
      { code: 'unit_not_published', stream: 'natural_gas', unit: 'ccf' },
      { code: 'unit_not_published', stream: 'propane', unit: 'lbs' },
      { code: 'unit_not_published', stream: 'electricity', unit: 'MWh' },
      { code: 'unit_not_published', stream: 'fuel_oil_residual', unit: 'barrels' },
    ])
  })

  it('C3-8 every unit the GHG side can store is priced, in the spellings the workings use', () => {
    // ⚠️ THE WORKINGS PRETTIFY SOME UNITS: buildWorkings writes 'gal', 'L', 'm³' and 'kWh' where the
    // stored Location fields say 'gallons', 'litres', 'm3' and 'kwh'. Both spellings must price, or a
    // figure would vanish depending on which side of the engine it came from.
    const cases: [Cat3InputRow['stream'], string[], number][] = [
      ['natural_gas', ['kwh', 'kWh', 'm3', 'm³', 'mcf', 'therms', 'mmbtu'], 10],
      ['propane', ['litres', 'L', 'gallons', 'gal', 'kg'], 10],
      ['diesel_stationary', ['litres', 'L', 'gallons', 'gal'], 10],
      ['mobile_diesel', ['litres', 'gallons'], 10],
      ['mobile_gasoline', ['litres', 'gallons'], 10],
      ['fuel_oil_distillate', ['litres', 'gallons'], 10],
      ['fuel_oil_residual', ['litres', 'gallons'], 10],
      ['purchased_steam', ['kwh', 'kWh', 'gj', 'mmbtu'], 10],
      ['electricity', ['kWh', 'kwh'], 10],
    ]
    for (const [stream, units, activity] of cases) {
      for (const unit of units) {
        const r = priceCat3(inputs([row({ id: `${stream}-${unit}`, stream, activity, unit, scope2_method: 'location-based' })]))
        expect(r.unpriced, `${stream} in ${unit}`).toEqual([])
        expect(r.lines.length, `${stream} in ${unit}`).toBeGreaterThan(0)
        for (const l of r.lines) expect(l.kg_co2e, `${stream} in ${unit}`).toBeGreaterThan(0)
      }
    }
  })

  it('C3-9 decision 6: every stream declared and nothing entered is a zero; an undeclared stream withholds', () => {
    const empty = priceCat3(inputs([]))
    expect(empty.status).toBe('zero')
    expect(empty.kg_co2e).toBe(0)
    expect(empty.zero_basis).toEqual({ code: 'no_rows' })
    expect(empty.withheld).toBeNull()

    const undeclared = priceCat3(inputs([
      row({ id: 'gas', stream: 'natural_gas', activity: 1_000, unit: 'kwh' }),
    ], ['purchased_steam', 'propane']))
    expect(undeclared.status).toBe('withheld')
    expect(undeclared.withheld).toEqual({ code: 'undeclared_streams', streams: ['purchased_steam', 'propane'] })
    expect(undeclared.kg_co2e).toBe(0)
    expect(undeclared.lines).toEqual([])
  })

  it('C3-10 steam prices per kWh from all three stored units, on the published total', () => {
    const KWH_PER_GJ = 1000 / 3.6                    // 1 kWh is 3.6 MJ, exactly
    const KWH_PER_MMBTU = 1.05505585262 * KWH_PER_GJ // 1 MMBtu is 1.05505585262 GJ (International Table)
    const STEAM_WTT = 0.03341                        // WTT- heat and steam!E20
    const STEAM_LOSS = 0.00945                       // Transmission and distribution!E27
    const STEAM_LOSS_WTT = 0.00176                   // WTT- heat and steam!E25
    const r = priceCat3(inputs([
      row({ id: 'kwh', stream: 'purchased_steam', activity: 100_000, unit: 'kWh' }),
      row({ id: 'gj', stream: 'purchased_steam', activity: 360, unit: 'gj' }),
      row({ id: 'mmbtu', stream: 'purchased_steam', activity: 100, unit: 'mmbtu' }),
    ]))
    expect(line(r, 'kwh', 'steam_wtt').kg_co2e).toBeCloseTo(100_000 * STEAM_WTT, 6)
    expect(line(r, 'kwh', 'steam_distribution_loss').kg_co2e).toBeCloseTo(100_000 * STEAM_LOSS, 6)
    expect(line(r, 'kwh', 'steam_distribution_wtt').kg_co2e).toBeCloseTo(100_000 * STEAM_LOSS_WTT, 6)
    expect(line(r, 'gj', 'steam_wtt').activity_priced).toBeCloseTo(360 * KWH_PER_GJ, 9)
    expect(line(r, 'gj', 'steam_wtt').kg_co2e).toBeCloseTo(360 * KWH_PER_GJ * STEAM_WTT, 6)
    expect(line(r, 'mmbtu', 'steam_wtt').activity_priced).toBeCloseTo(100 * KWH_PER_MMBTU, 9)
    // The conversion says where it came from: exact identities, not a DEFRA row.
    expect(line(r, 'gj', 'steam_wtt').conversion).toMatchObject({ source: 'definitional', to: 'kWh' })
    // ⚠️ THE PUBLISHED TOTAL, NOT THE GAS SPLIT. The split on the loss row sums to 0.00946, one
    // hundred-thousandth above the published 0.00945; pricing from it would overstate every steam
    // distribution line by 0.106%.
    expect(line(r, 'kwh', 'steam_distribution_loss').factor!.kg_co2e).toBe(STEAM_LOSS)
    expect(line(r, 'kwh', 'steam_distribution_loss').kg_co2e).not.toBeCloseTo(100_000 * 0.00946, 3)
  })

  it('C3-12 a gallon is a US gallon at every jurisdiction, exactly as Scope 1 reads it', () => {
    // ⚠️ CHECKED AGAINST THE GHG SIDE, JURISDICTION BY JURISDICTION, before this module was applied.
    // Scope 1 reads a gallons entry as a US gallon everywhere:
    //   the form only offers it outside the metric countries, and labels it "US gallons"
    //     (lib/ghg/engine.ts:1773-1777, liquidUnitOptions; CA, GB/UK, AU, NZ and the EU-27 get litres)
    //   every jurisdiction table's _gallon value is its own per-litre factor x 3.785411784, the exact
    //     NIST US gallon: EF 5.72117 (line 122), EF_CA 5.734896 (232), EF_UK 5.843086 (315),
    //     EF_EU 5.762 (493) for propane; EF_AU 9.845587 (620) and EF_NZ 11.246004 (666) for distillate
    //   fuelOilToGallons converts litres with L_PER_GAL and says "US gallons (exact, NIST)"
    //     (engine.ts:1902-1905)
    //   and pickEF falls back to the US table for any key a jurisdiction lacks (engine.ts:2187-2208),
    //     so no location is unpriceable for gallons and none reads an imperial gallon.
    // DEFRA's Conversions sheet does publish an Imperial gallon column, and this module needs none.
    const GAL_L_CELL = 3.7854118034613733   // Conversions!C40, DEFRA's own US gallon in litres
    const perGallon = GAL_L_CELL * DIESEL_L
    for (const country of ['US', 'CA', 'GB', 'DE', 'AU', 'NZ', null]) {
      const r = priceCat3(inputs([
        row({ id: `g-${country}`, stream: 'mobile_diesel', activity: 100, unit: 'gallons',
              country, country_resolved: country !== null }),
      ]))
      const l = line(r, `g-${country}`, 'fuel_wtt')
      expect(l.conversion, `${country}`).toMatchObject({ key: 'us_gallon_to_litre', cite: 'Conversions!C40' })
      expect(l.activity_priced, `${country}`).toBeCloseTo(100 * GAL_L_CELL, 9)
      // ⚠️ THE FIGURE DOES NOT VARY BY COUNTRY, ONLY THE FLAG DOES. A country-dependent gallon here
      // would silently disagree with the Scope 1 figure it is derived from.
      expect(l.kg_co2e, `${country}`).toBeCloseTo(100 * perGallon, 9)
    }
  })

  it('C3-11 the module never sums a gas split, and never imports the GHG engine', () => {
    const src = readFileSync(join(__dirname, 'cat3Energy.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    // The same guard defraEnergy.test.ts E10 applies to the reader, one layer along.
    expect(src, 'the module adds gas components together').not.toMatch(/gases[^\n]*[+]/)
    expect(src, 'the module reduces a split').not.toMatch(/\.(co2|ch4|n2o)\b/)
    // ⚠️ AND NOT THE ENGINE. The Scope 3 page loads this module; lib/ghg/engine.ts carries every factor
    // table in the product, and importing it here would put all of them in the browser bundle.
    expect(src, 'the module imports lib/ghg/engine.ts').not.toMatch(/from '\.\.\/ghg\//)
    expect(src).toMatch(/from '\.\.\/emissionFactors\/defraEnergy'/)
    expect(src).toMatch(/from '\.\.\/unitConversions'/)
  })
})
