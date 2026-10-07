import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EF_SOURCES, buildWorkings, emptyLocation, type Location } from './ghg/engine'

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
const notesFor = (l: Location) => buildWorkings([l], 'AR6', 2025).map(r => `${r.note ?? ''} ${r.conversion_note ?? ''}`).join('\n')

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
    expect(PAGE).toContain('European Environment Agency 2023')
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
