import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EF_SOURCES, buildWorkings, emptyLocation, type Location } from './ghg/engine'
import { heldYearFor } from './testing/heldSelection'

// ── FI8: THE METHODOLOGY PAGE'S EMISSION-FACTOR CLAIMS, CHECKED AGAINST THE ENGINE ─────────────────
//
// Until 7 Oct 2026 the "Emission factors" section said missing factors "fall back to US EPA" and that a
// country "published by neither source" was handled by fallback. FI2 removed every cross-country fallback,
// so the page described a method the engine no longer runs. This test pins the rewritten text to the code:
// the retired phrases may not return, the countries and sources the engine now prices from must be named,
// and each figure the page quotes is one the engine applies.
//
// The page text is read as source, not rendered, the same way publisherClaims.test.ts reads app/.

const PAGE = readFileSync(join(__dirname, '..', 'app/methodology/page.tsx'), 'utf8')
const ENGINE = readFileSync(join(__dirname, 'ghg/engine.ts'), 'utf8')

const loc = (o: Partial<Location>): Location => ({ ...emptyLocation('L1', 'Site'), ...o })
// T3c: at the year every edition the site's country needs is held (lib/testing/heldSelection.ts).
const notesFor = (l: Location) => buildWorkings([l], 'AR6', heldYearFor(l.country)).map(r => `${r.note ?? ''} ${r.conversion_note ?? ''}`).join('\n')

describe('methodology page: emission factors (FI8)', () => {
  it('no longer claims a fallback to another publisher', () => {
    expect(PAGE).not.toMatch(/fall back to US EPA/i)
    expect(PAGE).not.toMatch(/published by neither source/i)
  })

  it('names every country the engine prices combustion for, and the sources FI3 and FI7b added', () => {
    for (const s of ['United States', 'Canada', 'United Kingdom', 'EU member states', 'Australia', 'New Zealand',
      'JEC Well-to-Tank report v5', 'Appendix A']) expect(PAGE, s).toContain(s)
  })

  it('cites the editions the engine cites', () => {
    expect(EF_SOURCES.combustion_ca).toContain('v3.0')
    expect(PAGE).toContain('Emission factors and reference values v3.0')
    expect(EF_SOURCES.electricity_us).toContain('eGRID2023')
    expect(PAGE).toContain('eGRID 2023 (US states)')
    expect(EF_SOURCES.electricity_eu).toMatch(/^EEA \(2023\)/)
    // T3d: EEA data year 2024 is held beside 2023, and ECCC v4.0 Table 5.4 beside v3.0; the page names both.
    expect(EF_SOURCES.edition_eea_2024).toMatch(/^EEA \(2025\) .*data year 2024/)
    expect(PAGE).toContain('European Environment Agency generation intensities for data years 2023 and 2024')
    expect(EF_SOURCES.edition_eccc_v4).toContain('v4.0, Table 5.4')
    expect(PAGE).toContain('Emission factors and reference values v3.0 and v4.0')
    expect(EF_SOURCES.edition_aib_2025).toContain('AIB European Residual Mixes 2025')
    expect(PAGE).toContain('European Residual Mixes 2024 and 2025')
    expect(EF_SOURCES.combustion_eu).toContain('2018/2066 Annex VI Table 1')
    expect(PAGE).toContain('2018/2066), Annex VI Table 1')
    expect(EF_SOURCES.residual_eu).toContain('AIB European Residual Mixes 2024')
    expect(EF_SOURCES.residual_us).toContain('Green-e Residual Mix 2025 (2023 data')
    expect(EF_SOURCES.residual_au).toContain('DCCEEW NGA 2025')
    expect(PAGE).toContain('National Greenhouse Accounts Factors 2025 national Residual Mix Factor for Australia')
  })

  it('quotes only figures the engine applies', () => {
    // JEC densities (R9), on the EU litre rows.
    const eu = notesFor(loc({ country: 'DE', grid_region: 'EU_DE', has_diesel_stationary: true, diesel_stationary_amount: 100,
      diesel_stationary_unit: 'litres', has_mobile: true, fleet_light: true, light_petrol_amount: 100, light_petrol_unit: 'litres',
      has_fuel_oil_residual: true, fuel_oil_residual_amount: 100, fuel_oil_residual_unit: 'litres' } as Partial<Location>))
    for (const d of ['832', '743', '970']) {
      expect(PAGE).toContain(d)
      expect(eu, `JEC ${d} kg/m3 on an EU row`).toContain(d)
    }
    // Canada gas in GJ at the national gross heat content (R12).
    expect(PAGE).toContain('38.59 MJ/m³')
    expect(ENGINE).toMatch(/const CA_NG_GJ_PER_M3 = 38\.59 \/ 1000/)
    const ca = notesFor(loc({ country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 100,
      natural_gas_unit: 'gj' } as Partial<Location>))
    expect(ca).toContain('38.59 MJ/m³')
    // Net = 90% of gross (R7) and the 80% steam efficiency (R14).
    expect(PAGE).toContain('net is 90% of gross for natural gas')
    expect(ENGINE).toMatch(/0\.90/)
    expect(PAGE).toContain('80% generation efficiency')
    expect(ENGINE).toMatch(/steam_gas_boiler_80/)
  })

  it('states the Scope 2 fallback for every country with no residual mix loaded', () => {
    expect(PAGE).toContain('Where no residual mix is loaded for a country (currently the United Kingdom, Canada and New Zealand)')
  })

  it('carries a dated change entry and a last-updated date', () => {
    expect(PAGE).toContain("title: 'Methodology changes'")
    expect(PAGE).toContain('7 October 2026. Emission factors are now applied only through')
    expect(PAGE).toContain('Last updated: 7 October 2026')
  })
})

// ── FI9 (R16): THE FLEET PARAGRAPH, CHECKED AGAINST THE MOBILE DATA AND pickFleet ────────────────────────────────
import { EPA_MOBILE_2025 } from './emissionFactors/mobile/epa2025'
import { ECCC_MOBILE_2025 } from './emissionFactors/mobile/eccc2025'
import { DEFRA_MOBILE_2026 } from './emissionFactors/mobile/defra2026'
import { NGA_MOBILE_2025 } from './emissionFactors/mobile/nga2025'
import { MFE_MOBILE_2026 } from './emissionFactors/mobile/mfe2026'
import { IPCC_MOBILE_2006 } from './emissionFactors/mobile/ipcc2006'
import { R16_RANKING_GWP, highestRow } from './emissionFactors/mobile/select'
import { fleetAsks } from './ghg/engine'
import type { MobilePublisher } from './emissionFactors/mobile/types'

describe('methodology page: fuel used in vehicles (FI9)', () => {
  // Three paragraphs, consecutive in the Emission factors array and before the steam one: what is priced and from
  // whom; how the row is chosen; the AU and NZ readings, IPCC off-road and legacy figures. `text` joins them.
  const LINES = PAGE.split('\n')
  const OPENINGS = ["'Fuel used in vehicles is entered by vehicle type", "'Where a publisher splits a vehicle type further", "'In Australia, non-road equipment"]
  const at = OPENINGS.map(o => LINES.findIndex(l => l.trim().startsWith(o)))
  const paras = at.map(i => LINES[i].trim().replace(/^'|',$/g, '').replace(/\\'/g, "'"))
  const text = paras.join(' ')

  it('is three paragraphs, in order, one after another, before the steam paragraph', () => {
    expect(at.every(i => i > 0)).toBe(true)
    expect([at[1] - at[0], at[2] - at[1]]).toEqual([1, 1])
    expect(LINES[at[2] + 1].trim()).toMatch(/^'Purchased steam and district heat/)
    expect(paras[0]).toMatch(/because the Regulation publishes none\.$/)
    expect(paras[1]).toMatch(/otherwise shown as not counted\.$/)
  })

  it('the paragraph is there once, with its dated change entry, and no em dash', () => {
    expect(PAGE.match(/Fuel used in vehicles is entered by vehicle type: light vehicles, heavy vehicles and non-road equipment\./g)).toHaveLength(1)
    expect(PAGE).toContain("'7 October 2026. Fuel used in vehicles is entered by vehicle type and priced with each publisher\\'s mobile combustion factors.'")
    expect(text).not.toContain('\u2014')
  })

  it('the UK exception is DEFRA\'s own statement, cited on the row', () => {
    expect(text).toContain('a stationary factor is never used for a vehicle unless the publisher says its factor covers both, as DEFRA does for the UK')
    for (const r of DEFRA_MOBILE_2026.rows) expect(r.cite.basis, r.type).toMatch(/Passenger vehicles!A11|Fuels!A8/)
    expect(ENGINE).toContain('A stationary key is never read for a vehicle.')
  })

  it('EU: CO2 from the MRR, CH4 and N2O from IPCC 2006', () => {
    expect(text).toContain("In the EU, carbon dioxide uses the EU Monitoring and Reporting Regulation's factor, and methane and nitrous oxide use the IPCC 2006 Guidelines' mobile defaults")
    expect(ENGINE).toContain("EU: { jurisdiction: 'EU', publisher: 'IPCC 2006 Guidelines Vol. 2 Ch. 3, Tables 3.2.2 and 3.3.1 (CH4 and N2O); CO2, NCV and density: EU MRR 2018/2066")
  })

  it('the latest-row rule and the highest-row rule are the selector\'s', () => {
    expect(text).toContain("For a model year later than the publisher's latest row, the latest row is used.")
    expect(text).toContain('the published row with the highest methane and nitrous oxide for that type (combined on fixed AR5 values)')
    expect(R16_RANKING_GWP).toEqual({ ch4: 28, n2o: 265 })
  })

  it('equipment type is asked, and needed, only in the US and the EU', () => {
    expect(text).toContain('In the United States and the EU, where the publisher\'s non-road factors differ by equipment type, non-road equipment is priced only once you choose its equipment type.')
    expect(fleetAsks({ country: 'US' }).equipment.diesel).toBe(true)
    expect(fleetAsks({ country: 'DE' }).equipment.diesel).toBe(true)
    for (const c of ['CA', 'GB', 'AU', 'NZ']) expect(fleetAsks({ country: c }).equipment.diesel, c).toBe(false)
  })

  it('US: road CH4 and N2O are per mile; non-road is not', () => {
    expect(text).toContain('EPA publishes methane and nitrous oxide for road vehicles per mile, so they are counted when miles are entered and otherwise shown as not counted')
    expect(EPA_MOBILE_2025.rows.filter(r => r.type !== 'non_road').every(r => r.unit === 'g/vehicle-mile')).toBe(true)
    expect(EPA_MOBILE_2025.rows.filter(r => r.type === 'non_road').every(r => r.unit === 'g/gallon')).toBe(true)
  })

  it('Australia and New Zealand non-road: the publishers\' own classification, as the rows cite it', () => {
    expect(text).toContain('treats fuel not used for transport by vehicles registered for road use, rail, water or air as stationary energy')
    const au = NGA_MOBILE_2025.rows.filter(r => r.type === 'non_road')
    expect(au.length).toBeGreaterThan(0)
    for (const r of au) {
      expect(r.cite.table).toMatch(/^Table 8 .*stationary energy purposes$/)
      expect(r.cite.basis).toContain('(a) transport by vehicles registered for road use')
    }
    expect(text).toContain("in New Zealand, non-road equipment uses MfE's transport fuel factors, because MfE classes fuel used to move a vehicle as transport")
    expect(MFE_MOBILE_2026.rows.filter(r => r.type === 'non_road').length).toBeGreaterThan(0)
    expect(readFileSync(join(__dirname, 'emissionFactors/mobile/mfe2026.ts'), 'utf8')).toContain('"Transport fuels are used in an engine to move a vehicle."')
  })

  it('IPCC off-road diesel: CH4 and N2O are a larger share of the line than any other publisher\'s non-road diesel', () => {
    // The highest non-road diesel row each publisher prints, as a share of CO2 plus CH4 and N2O (AR5), per unit of fuel.
    // CO2 is put in the row's unit: EPA's CO2 is kg per gallon and its rows g per gallon.
    const share = (p: MobilePublisher, co2Scale = 1) => {
      const r = highestRow(p.rows.filter(x => x.type === 'non_road' && x.fuel === 'diesel'))!
      const other = r.gas === 'co2e_ar5' ? r.ch4 + r.n2o : r.ch4 * R16_RANKING_GWP.ch4 + r.n2o * R16_RANKING_GWP.n2o
      const co2 = p.co2.find(c => c.fuel === 'diesel')!.value * co2Scale
      return other / (co2 + other)
    }
    const eu = share(IPCC_MOBILE_2006)
    expect(eu).toBeGreaterThan(0.09)
    for (const [name, s] of [['EPA', share(EPA_MOBILE_2025, 1000)], ['ECCC', share(ECCC_MOBILE_2025)], ['DEFRA', share(DEFRA_MOBILE_2026)],
      ['NGA', share(NGA_MOBILE_2025)], ['MfE', share(MFE_MOBILE_2026)]] as const) expect(s, name).toBeLessThan(eu / 2)
    expect(text).toContain("IPCC's default off-road factors, used for EU non-road equipment, carry a high nitrous oxide value for diesel")
  })

  it('a legacy fleet figure blocks export until its vehicles are chosen', () => {
    expect(text).toContain('A vehicle fuel figure recorded before vehicle types were asked is not counted, and the inventory cannot be exported, until you choose the vehicles it was used in.')
    expect(ENGINE).toContain("'fleet_type_missing'")
  })

  it('the snapshot records the paragraph and the entry word for word', () => {
    const snap = readFileSync(join(__dirname, '..', 'docs/policy-snapshots/2026-10-methodology.md'), 'utf8')
    expect(snap).toContain(paras.map(x => `> ${x}`).join('\n>\n'))
    expect(snap).toContain("> 7 October 2026. Fuel used in vehicles is entered by vehicle type and priced with each publisher's mobile combustion factors.")
  })
})
