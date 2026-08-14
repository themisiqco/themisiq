import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildWorkings, emptyLocation, getGridFactor, combustionSource, isResolvedGridRegion,
  COMBUSTION_EDITION, STEAM_EDITION, EF_SOURCES,
} from './engine'
import type { Location } from './engine'
import { buildFactorEditions } from './factorEditions'

// ── THE VINTAGE COLUMN WAS HALF EMPTY, AND THE EMPTY HALF LOOKED LIKE AN ABSENCE OF FACTS ────────
//
// The workings table (app/dashboard/ghg/page.tsx) and the verifier page (app/verify/[token]) both
// render `w.factor_vintage || '—'`. Grid, T&D and residual rows filled it; EVERY COMBUSTION AND STEAM
// ROW rendered '—'. Seen live on 14 Aug 2026 on a US steam row and a US propane row.
//
// ⚠️ '—' IS NOT A BLANK, IT IS A CLAIM, and it was the wrong one. In a column headed by an edition, a
// dash reads as "no published edition applies to this line" — which is TRUE of a supplier-specific
// steam figure and FALSE of a propane row priced by EPA's 2024 workbook. The two cases rendered
// identically, so the one honest dash in the table was indistinguishable from six dishonest ones.
//
// THE INFORMATION WAS NEVER MISSING — that is what makes this a pass-through fix rather than a
// research one. ghg_inventories.factor_editions has recorded an edition per jurisdiction per family
// since it landed, computed from the same locations and reporting year as the totals. The labels were
// simply declared inside lib/ghg/factorEditions.ts, which IMPORTS engine.ts and therefore could not be
// imported back by it. Moving the two maps into engine.ts is the whole of the fix.
//
// ⚠️ AND THE ROW MUST NOT GET A SECOND SOURCE. The point of asserting agreement below is that the
// stored map and the printed column are the same fact. A verifier who reads "US EPA 2024" in the
// workings and finds a different edition in factor_editions has found a contradiction inside one
// save, which is worse than the blank this replaces.
//
// ⚠️ A COMBUSTION VINTAGE IS NOT A YEAR, AND THAT ASYMMETRY IS DELIBERATE. The grid row stamps
// getGridFactor().usedYear because GRID_EF is year-keyed and 2025 and 2026 are different UK factors.
// The combustion tables have NO year dimension — EF_UK is DEFRA 2026 whichever year is reported — so
// the label is constant across reporting years. G6 pins that, because "make combustion match
// electricity" is the plausible-looking wrong fix: it would stamp the inventory year over a table that
// has no such year, which is the exact falsehood section O removed from the NZ T&D row.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const pageSrc = readFileSync(join(ROOT, PAGE), 'utf8')

const loc = (over: Partial<Location>): Location => ({ ...emptyLocation('l1', 'Site'), ...over })

const rowsFor = (l: Location, year = 2026) => buildWorkings([l], 'AR6', year, [], 12) as any[]
const priced = (l: Location, stream: string, year = 2026) =>
  rowsFor(l, year).find(r => r.stream === stream && !r.declaration)

// One quantified combustion site per jurisdiction, each in a fuel and unit that jurisdiction offers.
const COMBUSTION_SITES: [string, Location][] = [
  ['US', loc({ country: 'US', grid_region: 'US_CA', has_propane: true, propane_amount: 1000, propane_unit: 'gallons' })],
  ['CA', loc({ country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' })],
  ['UK', loc({ country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' })],
  ['EU', loc({ country: 'FR', grid_region: 'EU_FR', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' })],
  ['AU', loc({ country: 'AU', grid_region: 'AU_NSW', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' })],
  ['NZ', loc({ country: 'NZ', grid_region: 'NZ', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' })],
]

describe('G. combustion and steam rows carry their factor edition', () => {
  it('G1 the two rows seen blank in production now name their edition', () => {
    // THE EXACT PAIR FROM THE REPORT, asserted by value rather than by "is not empty".
    const propane = priced(COMBUSTION_SITES[0][1], 'propane')
    expect(propane.factor_vintage, 'US propane read — before this').toBe('US EPA 2024')

    const steam = priced(loc({
      country: 'US', grid_region: 'US_CA',
      has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'mmbtu',
    }), 'purchased_steam')
    expect(steam.factor_vintage).toBe('US EPA 2025 Table 7')
  })

  it('G2 every jurisdiction stamps its OWN edition — none falls through to another', () => {
    for (const [j, site] of COMBUSTION_SITES) {
      const row = rowsFor(site).find(r => !r.declaration && r.scope === 1)
      expect(row, `${j} produced no priced combustion row — the fixture is wrong, not the code`).toBeDefined()
      expect(row.factor_vintage, `${j}`).toBe(COMBUSTION_EDITION[j as keyof typeof COMBUSTION_EDITION])
    }
    // Six distinct labels, so a fixture that quietly priced two jurisdictions from one table would
    // not be able to pass G2 by coincidence.
    expect(new Set(Object.values(COMBUSTION_EDITION)).size).toBe(6)
  })

  it('G3 the printed column and the stored factor_editions map are the SAME fact', () => {
    // The anti-drift property, and the reason the labels are declared once in engine.ts rather than
    // copied. Compared per jurisdiction against the map the SAME save would write.
    for (const [j, site] of COMBUSTION_SITES) {
      const row = rowsFor(site).find(r => !r.declaration && r.scope === 1)
      const stored = buildFactorEditions([site], 2026)[j as 'US']!
      expect(stored.combustion!.edition, `${j} combustion edition`).toBe(row.factor_vintage)
      // ...and the citation on the row is the same citation the map recorded.
      expect(stored.combustion!.source).toBe(row.ef_source)
      expect(row.ef_source).toBe(combustionSource(site))
    }
  })

  it('G4 a SUPPLIER-priced steam row carries NO vintage — the one honest dash', () => {
    // A district-energy provider's own figure is not an edition of any publication. Labelling it
    // 'US EPA 2025 Table 7' because the site is American would put a publisher's name on a private
    // number, which is a worse defect than the blank this whole file exists to remove.
    const supplied = loc({
      country: 'US', grid_region: 'US_CA',
      has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'mmbtu',
      purchased_steam_supplier_ef: 0.2, purchased_steam_supplier_ef_basis: 'kwh',
    })
    const row = priced(supplied, 'purchased_steam')
    expect(row.factor_vintage, 'a supplier figure has no published edition').toBeUndefined()
    expect(row.ef_source, 'the attribution lives in the citation instead').toContain(EF_SOURCES.steam_supplier)
    // The same gate on the other consumer: no steam entry is stored for this location either.
    expect(buildFactorEditions([supplied], 2026).US?.steam, 'and the stored map agrees').toBeUndefined()
  })

  it('G5 a jurisdiction with NO published steam factor carries none either', () => {
    // Canada publishes no purchased-steam factor; buildWorkings emits a no_published_factor row.
    // Nothing priced it, so there is no edition — and the row must not borrow the US one.
    const ca = loc({
      country: 'CA', province: 'ON', grid_region: 'ON',
      has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'mmbtu',
    })
    const row = rowsFor(ca).find(r => r.stream === 'purchased_steam')
    expect(row.declaration).toBe('no_published_factor')
    expect(row.factor_vintage, 'no factor applied, so no edition').toBeUndefined()
    expect(STEAM_EDITION.CA, 'and no label is declared for it').toBeUndefined()
  })

  it('G6 a combustion vintage does NOT move with the reporting year', () => {
    // The tables have no year dimension. If this ever fails, someone has "aligned" combustion with
    // the grid row's usedYear and reintroduced the NZ T&D defect one stream along.
    for (const year of [2023, 2024, 2025, 2026]) {
      expect(priced(COMBUSTION_SITES[2][1], 'natural_gas', year).factor_vintage, `UK ${year}`).toBe('DEFRA 2026')
    }
    // The grid row beside it DOES move, which is what makes the asymmetry visible rather than assumed.
    const gridRow = (year: number) => rowsFor(loc({
      country: 'GB', grid_region: 'UK', electricity_kwh: 100_000,
    }), year).find(r => r.scope2_method === 'location-based')
    expect(gridRow(2025).factor_vintage).toBe('2025')
    expect(gridRow(2026).factor_vintage).toBe('2026')
  })

  it('G7 NO FIGURE MOVED — the vintage is a label beside the number, not an input to it', () => {
    // Pinned per jurisdiction so a future change that reaches into pushFuel for the vintage and
    // disturbs the pricing fails here rather than in a customer's total.
    //
    // ⚠️ EACH PIN IS THE ARITHMETIC, NOT A CAPTURED RUN. A "nothing moved" figure copied out of the
    // output of the change it is meant to police proves only that the code agrees with itself. These
    // are derived from the tables at AR6 (CH₄ fossil 29.8, N₂O 273) and each one reproduces:
    //   US  EF.propane_gallon        5.72117 + 0.000273x29.8 + 0.0000546x273 = 5.7442112
    //   CA  EF_CA.natural_gas_m3     1.921 (ON override) + 0.000037x29.8 + 0.000035x273 = 1.9316576
    //   UK  EF_UK.natural_gas_kwh    0.18231, combined — no gas split to scale
    //   EU  EF_EU.natural_gas_m3     2.0196 + 0.000036x29.8 + 0.0000036x273 = 2.0216556
    //   AU  EF_AU.natural_gas_m3     2.025, combined
    //   NZ  EF_NZ.commercial.natural_gas_kwh  0.19543, combined
    // x 1,000 units / 1,000 kg per tonne, so the per-unit factor IS the tonnage here.
    const pins: [string, number][] = [
      ['US', 5.7442112],      // 1,000 gal propane, EPA
      ['CA', 1.9316576],      // 1,000 m3 gas, ECCC with the ON provincial CO2 override
      ['UK', 0.18231],        // 1,000 kWh gas, DEFRA 2026
      ['EU', 2.0216556],      // 1,000 m3 gas, MRR Annex VI / IPCC 2006
      ['AU', 2.025],          // 1,000 m3 gas, DCCEEW NGA 2025
      ['NZ', 0.19543],        // 1,000 kWh gas, MfE 2026 commercial use-class
    ]
    const actual = COMBUSTION_SITES.map(([j, site]) =>
      [j, rowsFor(site).find(r => !r.declaration && r.scope === 1).result_tco2e] as [string, number])
    // Reported together so a failure names every jurisdiction that moved, not just the first.
    expect(actual.map(([j, v]) => `${j} ${v.toFixed(5)}`))
      .toEqual(pins.map(([j, v]) => `${j} ${v.toFixed(5)}`))
  })
})

// ── THE STEP-1 GRID LABEL ────────────────────────────────────────────────────────────────────────
//
// Step 1's locations table showed "Grid: <region> (<factor> kg/kWh)" beside a UK, EU or NZ location
// and NOTHING beside a US, Canadian or Australian one, however complete the row was. The condition
// was `country !== 'US' && !== 'CA' && !== 'AU' && gridRegionForCountry(country)`, and the three
// exclusions were redundant with the call: gridRegionForCountry answers only for NATIONAL grids and
// returns '' for exactly those three. So it said "country-level only" twice, in two vocabularies,
// and the effect read as a deliberate exclusion of the three biggest markets when nothing had
// decided that. Step 2 shows all six a factor from the same lookup.
describe('H. step 1 labels the grid factor for every resolved location', () => {
  const lineContaining = (anchor: string): string => {
    const hits = pageSrc.split('\n').filter(l => l.includes(anchor))
    if (hits.length === 0) throw new Error(`no line containing '${anchor}' in ${PAGE} — the render site moved`)
    if (hits.length > 1) throw new Error(`'${anchor}' matches ${hits.length} lines in ${PAGE} — anchor is ambiguous`)
    return hits[0]
  }
  const labelLine = () => lineContaining('Grid: {loc.grid_region}')

  it('H1 the label is gated on the resolved region, not on a list of countries', () => {
    expect(() => labelLine()).not.toThrow()
    const gate = lineContaining('{isResolvedGridRegion(loc.grid_region) && (')
    expect(gate).toContain('isResolvedGridRegion(loc.grid_region)')
  })

  it('H2 the three country exclusions are gone', () => {
    // The exact regression: re-adding any of them re-hides the label for that market.
    expect(pageSrc, 'the step-1 label must not exclude US/CA/AU again')
      .not.toContain("loc.country !== 'US' && loc.country !== 'CA' && loc.country !== 'AU' && gridRegionForCountry(loc.country) && (")
  })

  it('H3 the label prices through the engine at the reporting year', () => {
    // Same contract gridDisplay.test.ts pins for the step-2 dropdowns: never a year-blind constant.
    expect(labelLine()).toContain('getGridFactor(loc.grid_region, inventory.reporting_year).ef')
  })

  it('H4 the gate is TRUE for a resolved US, CA and AU location and FALSE for a fresh one', () => {
    // The behaviour the textual guard stands in for. isResolvedGridRegion is the engine's own
    // predicate, so this asserts the three markets really do resolve rather than that the JSX changed.
    for (const region of ['US_CA', 'ON', 'AU_NSW', 'UK', 'EU_FR', 'NZ']) {
      expect(isResolvedGridRegion(region), region).toBe(true)
      expect(getGridFactor(region, 2026).ef, `${region} must price`).toBeGreaterThan(0)
    }
    // A brand-new location carries the 'us_average' init default, which is deliberately NOT a
    // GRID_EF key — so the label stays hidden until a country or state is actually chosen.
    expect(isResolvedGridRegion(emptyLocation('x', 'New').grid_region), 'the init default').toBe(false)
    expect(isResolvedGridRegion(''), 'a cleared region').toBe(false)
  })
})
