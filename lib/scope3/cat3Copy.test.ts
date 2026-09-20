import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cat3InputsFrom } from './cat3Inputs'
import { priceCat3 } from './cat3Energy'
import type { Cat3Flag, Cat3Reason, Cat3Result, Cat3Withheld } from './cat3Energy'
import type { Cat3Skipped, Cat3InputsReason } from './cat3Inputs'
import {
  cat3Sentences, cat3WorkingsSummary, cat3LineText, cat3UnpricedText, cat3FlagText, cat3FlagStatements, cat3ReasonText,
  cat3SkippedText, cat3InputsReasonText, cat3WithheldText, cat3ZeroText, cat3NoFigureText,
  CAT3_STREAM_LABEL, CAT3_LINE_LABEL, CAT3_SOURCE_SENTENCE, CAT3_DERIVED_SENTENCE,
  CAT3_EXCLUDES_COMBUSTION_SENTENCE, CAT3_STAND_IN_SENTENCE, CAT3_LOCATION_BASED_SENTENCE,
  CAT3_GWP_SENTENCE, CAT3_SEPARATE_LINES_SENTENCE, CAT3_CV_BASIS_SENTENCE, CAT3_ATTRIBUTION,
} from './cat3Copy'
import { SCOPE3_FIXTURE_GHG } from './scope3SurfacesFixture'

// ── CATEGORY 3'S CUSTOMER TEXT ───────────────────────────────────────────────────────────────────
//
// Task 5 of ~/themisiq-sources/findings/cat3-design.md. The pricing and the adapter are tested in
// cat3Energy.test.ts and cat3Inputs.test.ts; this file tests what a customer READS, and that the page
// reads it from here rather than typing it again.

const PAGE = join(__dirname, '../../app/dashboard/scope3/page.tsx')
const page = () => readFileSync(PAGE, 'utf8')

/** The worked example, through exactly the path the page takes. */
const worked = () => {
  const read = cat3InputsFrom(SCOPE3_FIXTURE_GHG.workings, SCOPE3_FIXTURE_GHG.locations)
  expect(read.reason, 'the fixture inventory must be readable').toBeNull()
  return { read, priced: priceCat3(read.inputs!) }
}

describe('Category 3 copy', () => {
  it('C3C-1 the worked example: nine lines, 19.5723 t CO2e, each line saying how it was priced', () => {
    const { read, priced } = worked()
    expect(priced.status).toBe('priced')
    expect(priced.lines).toHaveLength(9)
    expect(priced.kg_co2e).toBeCloseTo(19_572.329976, 6)
    expect((priced.kg_co2e / 1000).toFixed(4)).toBe('19.5723')

    const sentences = cat3Sentences(priced, read)
    // One sentence per priced line, and each carries the arithmetic a verifier reproduces from.
    for (const l of priced.lines) expect(sentences).toContain(cat3LineText(l))
    const gas = priced.lines.find(l => l.location === 'US site' && l.stream === 'natural_gas')!
    expect(cat3LineText(gas)).toContain('1,000 therms converted to kWh at 29.30710833487654 (Conversions!D30) = 29,307.1083 kWh')
    expect(cat3LineText(gas)).toContain('x 0.03021 kg CO2e per kWh (Gross CV) (WTT- fuels D41)')
    expect(cat3LineText(gas)).toContain('= 885.37 kg CO2e.')
    // The stand-in flag is on the lines it belongs to, and names the publisher that priced Scope 1 or 2.
    expect(cat3LineText(gas)).toContain('UK factor used as a stand-in at a location in US')
    expect(cat3LineText(gas)).toContain('US EPA')
    const ukGas = priced.lines.find(l => l.location === 'UK site' && l.stream === 'natural_gas')!
    expect(cat3LineText(ukGas)).not.toContain('stand-in')
    // The three electricity lines exist for each location, and say which is which.
    const ukElec = priced.lines.filter(l => l.location === 'UK site' && l.stream === 'electricity')
    expect(ukElec.map(l => l.line)).toEqual(['electricity_generation_wtt', 'electricity_td_loss', 'electricity_td_wtt'])
    for (const l of ukElec) expect(cat3LineText(l)).toContain(CAT3_LINE_LABEL[l.line])
    // The card's summary counts what it priced, and the total is stated in both units.
    expect(cat3WorkingsSummary(priced)).toBe(
      '9 lines at 2 locations, priced from the DEFRA/DESNZ 2026 upstream energy factors on the bound GHG inventory')
    expect(sentences).toContain('19,572.33 kg CO2e in all, which is 19.5723 t CO2e.')
    // The method sentences are all present, the gross CV one because a therms figure was priced.
    for (const s of [CAT3_SOURCE_SENTENCE, CAT3_DERIVED_SENTENCE, CAT3_EXCLUDES_COMBUSTION_SENTENCE,
      CAT3_SEPARATE_LINES_SENTENCE, CAT3_LOCATION_BASED_SENTENCE, CAT3_GWP_SENTENCE,
      CAT3_STAND_IN_SENTENCE, CAT3_CV_BASIS_SENTENCE, CAT3_ATTRIBUTION]) expect(sentences).toContain(s)
    // The market-based row was read and set aside, and the panel says so rather than dropping it.
    expect(sentences.some(s => /market-based electricity row at UK site is not used/.test(s))).toBe(true)
  })

  it('C3C-2 every code the two modules can emit has a sentence, and none of them is a placeholder', () => {
    // ⚠️ EXHAUSTIVE BY CONSTRUCTION. A code with no sentence is a silent absence on screen, which is
    // the whole reason the copy lives in one module. The switches are exhaustive for tsc; this checks
    // that what they return is a sentence rather than an empty string or an "undefined" spliced in.
    const flags: Cat3Flag[] = [
      { code: 'uk_stand_in', country: 'FR', scope1_publisher: 'US EPA GHG Emission Factors Hub (2025)' },
      { code: 'uk_stand_in', country: null, scope1_publisher: null },
      { code: 'country_unresolved' },
      { code: 'nz_mfe_3c', source: 'lib/ghg/engine.ts s3_td (MfE)' },
    ]
    const reasons: Cat3Reason[] = [
      { code: 'unit_not_published', stream: 'natural_gas', unit: 'barrels' },
      { code: 'refrigerants_not_in_category' },
      { code: 'market_based_row_not_used' },
      { code: 'no_nz_td_figure', location: 'Auckland' },
      { code: 'activity_not_a_number', unit: 'kWh' },
    ]
    const skipped: Cat3Skipped[] = [
      { code: 'location_excluded', location: 'Plant A' },
      { code: 'refrigerants_not_in_category', location: 'Plant A' },
      { code: 'market_based_row_not_used', location: 'Plant A' },
      { code: 'stream_not_recognised', location: 'Plant A', stream: 'hydrogen', source: 'Hydrogen' },
      { code: 'mobile_fuel_not_named', location: 'Depot', source: 'Petrol (mobile)' },
      { code: 'activity_missing', location: 'Plant A', stream: 'propane' },
      { code: 'scope2_not_priced', location: 'CA plant', stream: 'purchased_steam' },
    ]
    const inputsReasons: Cat3InputsReason[] = [
      { code: 'no_workings' }, { code: 'workings_shape_unreadable', rows: 12 }, { code: 'no_locations_data' },
    ]
    const withheld: Cat3Withheld[] = [
      { code: 'undeclared_streams', streams: ['natural_gas', 'mobile'] }, { code: 'nothing_priced' },
    ]
    const all = [
      ...flags.map(cat3FlagText), ...reasons.map(cat3ReasonText), ...skipped.map(cat3SkippedText),
      ...inputsReasons.map(cat3InputsReasonText), ...withheld.map(w => cat3WithheldText(w)), cat3ZeroText(),
      ...Object.values(CAT3_STREAM_LABEL), ...Object.values(CAT3_LINE_LABEL),
    ]
    for (const text of all) {
      expect(text.length, text).toBeGreaterThan(3)
      expect(text, 'no em-dash in customer text').not.toContain('—')
      expect(text, 'a field was spliced in without a value').not.toMatch(/undefined|null|\[object/)
    }
    // The two that must name their data, because acting on them depends on it.
    expect(cat3SkippedText(skipped[4])).toContain('"Petrol (mobile)"')
    expect(cat3ReasonText(reasons[0])).toContain('barrels')
    // An unknown country says the country is unknown rather than printing an empty space.
    expect(cat3FlagText(flags[1])).toBe('UK factor used as a stand-in')

    // ⚠️ THE PAIR AN UNRESOLVED COUNTRY ALWAYS PRODUCES IS ONE STATEMENT. cat3Energy emits
    // country_unresolved and uk_stand_in together for every such row; two clauses joined by "and" put
    // the consequence before the reason and read as fragments.
    const pair = cat3FlagStatements([
      { code: 'country_unresolved' },
      { code: 'uk_stand_in', country: null, scope1_publisher: 'US EPA eGRID' },
    ])
    expect(pair).toEqual(['UK factor used as a stand-in, because the GHG inventory does not say which ' +
      'country this location is in and a location that might not be in the UK is not treated as if it ' +
      'were; its Scope 1 and 2 figures are priced from US EPA eGRID'])
    // A known non-UK country keeps its own single statement, unchanged.
    expect(cat3FlagStatements([flags[0]])).toEqual([cat3FlagText(flags[0])])
    // And the two are rendered as separate sentences on a line, never joined by "and".
    expect(cat3FlagStatements([{ code: 'uk_stand_in', country: 'FR', scope1_publisher: null }, flags[3]]))
      .toHaveLength(2)
  })

  it('C3C-3 the Category 3 panel reads its sentences from this module, and types none of its own', () => {
    const src = page()
    const start = src.indexOf("{cat.id === 'cat3' && <>")
    expect(start, 'the Category 3 panel block').toBeGreaterThan(-1)
    const block = src.slice(start, src.indexOf("{cat.id === 'cat15' && <>", start))
    // Every sentence in the block arrives as an identifier or a call from lib/scope3/cat3Copy.ts.
    for (const name of ['CAT3_DERIVED_SENTENCE', 'CAT3_EXCLUDES_COMBUSTION_SENTENCE', 'CAT3_STAND_IN_SENTENCE',
      'CAT3_ATTRIBUTION', 'cat3WorkingsSummary', 'cat3Sentences']) expect(block, name).toContain(name)
    // ⚠️ AND NOTHING SENTENCE-LIKE IS TYPED IN IT. Two short labels are allowed, the same two Cat 12's
    // panel carries: the heading over the box and the field label beside the override.
    const ALLOWED = ['What this figure is', 'Known emissions (mt CO₂e), optional override']
    // ⚠️ STYLE OBJECTS COME OUT FIRST. A quoted-string scan across `style={{ background: '#E6F1FB',
    // borderRadius: 8, padding: '0.75rem' }}` matches the text BETWEEN two literals and reports the CSS
    // as prose, which is a false positive that would teach the next reader to ignore this test.
    const prose = block.replace(/style=\{\{[^}]*\}\}/g, '')
    const candidates = [
      ...[...prose.matchAll(/'([^'\n]{20,})'/g)].map(m => m[1]),
      ...[...prose.matchAll(/>\s*([^<>{}\n]{20,}?)\s*</g)].map(m => m[1]),
    ].map(t => t.trim())
    // Prose, as distinct from a style value or an attribute: four words or more, and none of the
    // tokens a CSS value or a URL carries.
    const typed = candidates
      .filter(t => !ALLOWED.includes(t))
      .filter(t => t.split(/\s+/).length >= 4)
      .filter(t => !/[#{}<>/]|\d(px|rem|%)|^[\w-]+\s*:/.test(t))
    expect(typed, 'these look like sentences typed into the panel; move them to lib/scope3/cat3Copy.ts').toEqual([])
    // No sentence from the copy module was pasted into the page as a literal.
    for (const s of [CAT3_SOURCE_SENTENCE, CAT3_DERIVED_SENTENCE, CAT3_GWP_SENTENCE, CAT3_STAND_IN_SENTENCE]) {
      expect(src.includes(s), 'a cat3Copy sentence is duplicated in the page').toBe(false)
    }
  })

  it('C3C-4 an entered known figure still wins, and a saved annual_spend prices nothing', () => {
    const src = page()
    // The dispatch: the entered figure first, then the bound inventory. Never calcGenericSpend.
    expect(src).toContain("case 'fuel_and_energy_upstream': return catData[id]?.emissions_override || cat3Mt() || 0")
    expect(src).not.toMatch(/case 'fuel_and_energy_upstream': return calcGenericSpend/)
    // The calculation's only inputs are the two bound columns; no spend field reaches it.
    expect(src).toContain('const cat3Read = cat3InputsFrom(boundWorkings, boundLocations)')
    // Cat 3 is out of the generic panel, so no Annual spend field renders for it.
    const list = src.match(/!\[([^\]]*)\]\.includes\(cat\.id\)/)
    expect(list![1]).toContain("'cat3'")
    // And the calculation cannot see a spend figure even if one is saved: its input rows come from the
    // workings, and the adapter reads no spend field at all.
    const adapter = readFileSync(join(__dirname, 'cat3Inputs.ts'), 'utf8')
    const pricing = readFileSync(join(__dirname, 'cat3Energy.ts'), 'utf8')
    for (const [name, text] of [['cat3Inputs.ts', adapter], ['cat3Energy.ts', pricing]] as const) {
      expect(text, `${name} must not read a spend figure`).not.toMatch(/annual_spend|total_spend/)
    }
  })

  it('C3C-5 decision 6 both ways: an answered inventory with no energy is zero, an unanswered one withholds and says what to answer', () => {
    const answered = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
      'mobile', 'refrigerants', 'electricity', 'purchased_steam']
    const attest = (streams: readonly string[]) =>
      streams.map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' }))
    // ⚠️ EVERY STREAM ANSWERED, NONE OF THEM PRESENT, which is what buildWorkings emits for such an
    // inventory: one declaration row per stream and no activity row at all. The adapter passes those
    // over, the pricing module sees no rows, and the answer is a zero with its basis rather than an
    // empty category.
    const zeroRead = cat3InputsFrom(
      answered.map(stream => ({ location: 'Office', stream, source: 'Declaration', scope: 1,
        activity_data: 0, activity_unit: '—', declaration: 'attested_absent', gwp_basis: 'declaration',
        result_tco2e: null, entry_method: 'manual' })),
      [{ id: 'o', name: 'Office', country: 'GB', electricity_kwh: 0, stream_attestations: attest(answered) }],
    )
    const zero = priceCat3(zeroRead.inputs!)
    expect(zero.status).toBe('zero')
    expect(zero.kg_co2e).toBe(0)
    expect(cat3Sentences(zero, zeroRead)).toContain(cat3ZeroText())
    expect(cat3ZeroText()).toContain('calculated zero, not a blank')
    expect(cat3NoFigureText(zero, zeroRead), 'a zero is a figure, so no notice').toBeNull()

    // One stream never answered: withheld, and the sentence names the stream AND where it is.
    const openRead = cat3InputsFrom(
      [{ location: 'Office', stream: 'electricity', source: 'Electricity (S2 location-based)', scope: 2,
         activity_data: 1_000, activity_unit: 'kWh', scope2_method: 'location-based', result_tco2e: 0.2, entry_method: 'manual' }],
      [{ id: 'o', name: 'Office', country: 'GB', electricity_kwh: 1_000,
         stream_attestations: attest(answered.filter(s => s !== 'propane' && s !== 'mobile')) }],
    )
    const open = priceCat3(openRead.inputs!)
    expect(open.status).toBe('withheld')
    expect(open.withheld).toEqual({ code: 'undeclared_streams', streams: ['propane', 'mobile'] })
    const notice = cat3NoFigureText(open, openRead)!
    expect(notice).toContain('has not answered these, either with an amount or by confirming there is none: Office: propane and vehicle or mobile equipment fuel.')
    expect(notice).toContain('A figure of zero would say they emit nothing')
    expect(notice).toContain('Answer them in the GHG module')
    // Two locations read with semicolons between them, because each one's list already uses "and".
    expect(cat3WithheldText({ code: 'undeclared_streams', streams: ['propane', 'mobile'] }, [
      { location: 'Office', stream: 'propane', state: 'undeclared' },
      { location: 'Depot', stream: 'mobile', state: 'declared_unquantified' },
    ])).toContain('Office: propane; Depot: vehicle or mobile equipment fuel.')
    // The panel shows the same sentence the figure was withheld by, not a second wording.
    expect(cat3Sentences(open, openRead)).toContain(notice)
  })

  it('C3C-6 an unreadable inventory says which of the three it is, and never reads as zero energy', () => {
    for (const [workings, locations, match] of [
      [null, [], /no saved workings/],
      [[{ location: 'A', foo: 1 }], [], /older form/],
      [[{ location: 'A', activity_data: 1, activity_unit: 'kWh', scope: 2 }], null, /no saved locations/],
    ] as const) {
      const read = cat3InputsFrom(workings, locations)
      expect(read.inputs).toBeNull()
      const text = cat3NoFigureText(null, read)!
      expect(text).toMatch(match)
      expect(text, 'never a zero').not.toMatch(/\b0 kg\b|is zero/)
    }
    // The older-shape sentence counts the rows it could not read, so the customer can see it found some.
    expect(cat3InputsReasonText({ code: 'workings_shape_unreadable', rows: 1 })).toContain('1 row)')
    expect(cat3InputsReasonText({ code: 'workings_shape_unreadable', rows: 12 })).toContain('12 rows)')
  })

  it('C3C-7 the unpriced rows are named with their reason, and are not in the figure', () => {
    // A unit no sheet publishes: the row is named and the rest of the location still prices.
    const read = cat3InputsFrom(
      [...SCOPE3_FIXTURE_GHG.workings,
       { location: 'UK site', stream: 'propane', source: 'Propane', scope: 1, activity_data: 4,
         activity_unit: 'barrels', ef_source: 'UK DEFRA/DESNZ (2026)', result_tco2e: 1, entry_method: 'manual' }],
      SCOPE3_FIXTURE_GHG.locations.map(l => l.name === 'UK site'
        ? { ...l, has_propane: true, propane_amount: 4, stream_attestations: l.stream_attestations.filter(a => a.stream !== 'propane') }
        : l),
    )
    const priced = priceCat3(read.inputs!) as Cat3Result
    expect(priced.status).toBe('priced')
    expect(priced.lines).toHaveLength(9)
    expect(priced.unpriced).toHaveLength(1)
    const text = cat3UnpricedText(priced.unpriced[0])
    expect(text).toBe('UK site, propane: not priced, the workbook publishes no upstream factor for propane measured in barrels.')
    expect(cat3Sentences(priced, read)).toContain(text)
    expect(priced.kg_co2e).toBeCloseTo(19_572.329976, 6)
  })
})
