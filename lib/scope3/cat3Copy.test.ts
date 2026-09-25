import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cat3InputsFrom } from './cat3Inputs'
import { scope3MethodDescription } from './categoryMethods'
import { priceCat3 } from './cat3Energy'
import type { Cat3Flag, Cat3Reason, Cat3Result, Cat3Withheld } from './cat3Energy'
import type { Cat3Skipped, Cat3InputsReason } from './cat3Inputs'
import {
  cat3Sentences, cat3WorkingsSummary, cat3LineText, cat3UnpricedText, cat3FlagText, cat3FlagStatements, cat3ReasonText,
  cat3SkippedText, cat3InputsReasonText, cat3WithheldText, cat3ZeroText, cat3NoFigureText,
  CAT3_STREAM_LABEL, CAT3_LINE_LABEL, CAT3_SOURCE_SENTENCE, CAT3_DERIVED_SENTENCE,
  CAT3_EXCLUDES_COMBUSTION_SENTENCE, CAT3_STAND_IN_SENTENCE, CAT3_LOCATION_BASED_SENTENCE,
  CAT3_GWP_PUBLISHER, CAT3_SEPARATE_LINES_SENTENCE, CAT3_GROSS_CV_SENTENCE, CAT3_EPA_HHV_SENTENCE, CAT3_ATTRIBUTION,
  cat3Basis, cat3CsvRows, cat3MethodSentences, CAT3_RECORDED_NOT_USED, cat3RetiredSpendText,
} from './cat3Copy'
import { publisherGwpSentence } from './gwpSentence'
import { SCOPE3_FIXTURE_GHG } from './scope3SurfacesFixture'

// ── CATEGORY 3'S CUSTOMER TEXT ───────────────────────────────────────────────────────────────────
//
// Task 5 of ~/themisiq-sources/findings/cat3-design.md. The pricing and the adapter are tested in
// cat3Energy.test.ts and cat3Inputs.test.ts; this file tests what a customer READS, and that the page
// reads it from here rather than typing it again.

const PAGE = join(__dirname, '../../app/dashboard/scope3/page.tsx')
/** As the page builds it: this record is always bound, and the fixture inventory records AR6. */
const GWP = publisherGwpSentence(CAT3_GWP_PUBLISHER, true, 'AR6')
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

    const sentences = cat3Sentences(priced, read, GWP)
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
    expect(sentences).toContain('19,572.33 kg CO2e in all, which is 19.5723 mt CO2e.')
    // The method sentences are all present, the gross CV one because a therms figure was priced.
    for (const s of [CAT3_SOURCE_SENTENCE, CAT3_DERIVED_SENTENCE, CAT3_EXCLUDES_COMBUSTION_SENTENCE,
      CAT3_SEPARATE_LINES_SENTENCE, CAT3_LOCATION_BASED_SENTENCE,
      CAT3_STAND_IN_SENTENCE, CAT3_GROSS_CV_SENTENCE, CAT3_EPA_HHV_SENTENCE, CAT3_ATTRIBUTION, GWP])
      expect(sentences).toContain(s)
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
      // ⚠️ AND NOT CODE CAUGHT BETWEEN TWO TAGS. A JSX condition such as `.length > 0 && boundInventoryId
      // && (` sits between a '>' and a '<' like text does; prose in this panel contains none of these.
      .filter(t => !/&&|=>|\?\.|\$|`/.test(t))
    expect(typed, 'these look like sentences typed into the panel; move them to lib/scope3/cat3Copy.ts').toEqual([])
    // No sentence from the copy module was pasted into the page as a literal.
    for (const s of [CAT3_SOURCE_SENTENCE, CAT3_DERIVED_SENTENCE, CAT3_LOCATION_BASED_SENTENCE, CAT3_STAND_IN_SENTENCE]) {
      expect(src.includes(s), 'a cat3Copy sentence is duplicated in the page').toBe(false)
    }
  })

  it('C3C-4 an entered known figure still wins, and a saved annual_spend prices nothing', () => {
    const src = page()
    // The dispatch: the entered figure first, then the bound inventory. Never calcGenericSpend.
    // ⚠️ THE ORDER, NOT THE EXACT LINE. Task 8 added the activity D branch between the entered figure
    // and the derived one, so the dispatch spans two lines; what this guards is that an entered figure
    // is read FIRST and that the derived figure is the only other source.
    expect(src).toContain('return catData[id]?.emissions_override || (cat3ExcludedFor3d ? 0 : cat3Mt() || 0)')
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
    expect(cat3Sentences(zero, zeroRead, GWP)).toContain(cat3ZeroText())
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
    expect(cat3Sentences(open, openRead, GWP)).toContain(notice)
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

  it('C3C-11 the EPA higher-heating-value sentence appears only where a US gas entry made it true', () => {
    // ⚠️ THE DEFECT: one sentence claimed "the Scope 1 side of that figure is priced on the US EPA's
    // higher heating values" and was shown whenever any line used the gross CV factor. A UK location
    // enters gas in kWh (engine.ts ngUnitOptions gives GB/UK kWh alone) and its Scope 1 side is DEFRA's,
    // so on a UK-only inventory the sentence was false about that customer's own figures.
    const attest = (used: readonly string[]) =>
      ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'mobile',
       'refrigerants', 'electricity', 'purchased_steam'].filter(x => !used.includes(x))
        .map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' }))
    const gasOnly = (country: string, unit: string, amount: number) => cat3InputsFrom(
      [{ location: 'Site', stream: 'natural_gas', source: 'Natural gas', scope: 1, activity_data: amount,
         activity_unit: unit, ef_source: country === 'GB' ? 'UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting' : 'US EPA GHG Emission Factors Hub (2025)',
         result_tco2e: 1, entry_method: 'manual' }],
      [{ id: 's', name: 'Site', country, has_natural_gas: true, natural_gas_amount: amount,
         natural_gas_unit: unit, stream_attestations: attest(['natural_gas']) }],
    )
    // UK, kWh: the gross CV sentence is true and stays; the EPA one is not and goes.
    const uk = gasOnly('GB', 'kwh', 50_000)
    const ukPriced = priceCat3(uk.inputs!)
    expect(ukPriced.lines[0].factor!.key).toBe('natural_gas_kwh_gross_cv')
    const ukSentences = cat3Sentences(ukPriced, uk, GWP)
    expect(ukSentences).toContain(CAT3_GROSS_CV_SENTENCE)
    expect(ukSentences).not.toContain(CAT3_EPA_HHV_SENTENCE)
    expect(ukSentences.join(' '), 'no EPA claim on an inventory the EPA priced nothing in').not.toMatch(/EPA/)

    // US, therms and MMBtu: both sentences, because that entry is where the two bases meet.
    for (const unit of ['therms', 'mmbtu']) {
      const us = gasOnly('US', unit, 1_000)
      const usSentences = cat3Sentences(priceCat3(us.inputs!), us, GWP)
      expect(usSentences, unit).toContain(CAT3_GROSS_CV_SENTENCE)
      expect(usSentences, unit).toContain(CAT3_EPA_HHV_SENTENCE)
    }
    // A US mcf entry prices from the cubic metres row, not the gross CV one, so neither sentence applies.
    const mcf = gasOnly('US', 'mcf', 100)
    const mcfSentences = cat3Sentences(priceCat3(mcf.inputs!), mcf, GWP)
    expect(mcfSentences).not.toContain(CAT3_GROSS_CV_SENTENCE)
    expect(mcfSentences).not.toContain(CAT3_EPA_HHV_SENTENCE)
    // Neither sentence asserts what priced THIS inventory's Scope 1 beyond the unit that was entered.
    expect(CAT3_GROSS_CV_SENTENCE).not.toMatch(/EPA/)
    expect(CAT3_EPA_HHV_SENTENCE).toMatch(/entered in therms or million Btu/)
  })

  it('C3C-12 a spliced publisher name never brings a note with it, and never a second full stop', () => {
    // ⚠️ BOTH DEFECTS CAME FROM ONE STRING. ghg_inventories.workings.ef_source is a composite:
    // "US EPA eGRID2023 · Grid factor for 2023 applied to 2025 inventory (latest vintage held)."
    // (engine.ts:2864-2865 joins the citation to getGridFactor's note, which ends in a full stop).
    // Category 3 spliced the whole thing into its stand-in sentence and then added a stop of its own.
    const attest = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
      'mobile', 'refrigerants', 'purchased_steam'].map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' }))
    const read = cat3InputsFrom(
      [{ location: 'Buffalo', stream: 'electricity', source: 'Electricity (US_NY)', scope: 2,
         activity_data: 10_000, activity_unit: 'kWh', scope2_method: 'location-based',
         ef_source: 'US EPA eGRID2023 \u00b7 Grid factor for 2023 applied to 2025 inventory (latest vintage held).',
         result_tco2e: 2, entry_method: 'manual' }],
      [{ id: 'b', name: 'Buffalo', country: 'US', electricity_kwh: 10_000, stream_attestations: attest }],
    )
    const priced = priceCat3(read.inputs!)
    // The publisher reaches the flag alone.
    const flag = priced.lines[0].flags.find(f => f.code === 'uk_stand_in') as { scope1_publisher: string }
    expect(flag.scope1_publisher).toBe('US EPA eGRID2023')
    // And every rendered surface carries neither the note nor a double stop.
    const rendered = [
      ...cat3Sentences(priced, read, GWP),
      ...cat3CsvRows(priced, read, null, GWP).flat(),
      cat3Basis(priced, read, null).basis, cat3Basis(priced, read, null).detail,
    ]
    for (const text of rendered) {
      expect(text, 'a GHG-side note reached a Category 3 sentence').not.toContain('latest vintage held')
      expect(text, "the GHG module's own separator reached a Category 3 sentence").not.toContain(' \u00b7 ')
      expect(text, 'two full stops').not.toMatch(/\.\./)
    }
    expect(cat3LineText(priced.lines[0]))
      .toContain('whose Scope 1 and 2 figures are priced from US EPA eGRID2023.')

    // ⚠️ AND IT CANNOT RECUR FOR A NAME THAT ENDS IN A STOP OR A BRACKET, whoever publishes it: those
    // come from EF_SOURCES and from factor tables not yet written. The punctuation is applied once.
    for (const publisher of ['Someone Ltd.', 'A publisher (2026)', 'Ends in a quote"', 'Plain name']) {
      const text = cat3LineText({ ...priced.lines[0],
        flags: [{ code: 'uk_stand_in', country: 'US', scope1_publisher: publisher }] })
      expect(text, publisher).not.toMatch(/\.\./)
      expect(text.endsWith('.'), `${publisher}: one full stop at the end`).toBe(true)
    }
  })

  it('C3C-13 the panel and the export print a published constant identically, and print the stored value', () => {
    // ⚠️ ONE PRINTER, AND IT ROUND-TRIPS. A factor or a conversion printed two ways is two claims about
    // one number: 3.7854118034613733 and 3.7854118034613737 are DIFFERENT doubles, one ULP apart, and a
    // reader comparing an export against the workbook cannot tell a formatting slip from a wrong value.
    const { read, priced } = worked()
    const rows = cat3CsvRows(priced, read, null, GWP)
    for (const l of priced.lines) {
      const line = cat3LineText(l)
      // The exact label: two fuel lines at one location share a line label, so a partial match finds
      // the wrong row and would have compared a figure against another line's arithmetic.
      const label = `${l.location}, ${CAT3_STREAM_LABEL[l.stream]}, ${CAT3_LINE_LABEL[l.line]}`
      const row = rows.find(r => r[0] === label)!
      expect(row, label).toBeTruthy()
      if (l.conversion) {
        const printed = String(l.conversion.factor)
        expect(line, 'the panel prints the conversion').toContain(printed)
        expect(row[2], 'the export prints the same characters').toContain(printed)
        // The characters printed parse back to exactly the number that was used.
        expect(Number(printed)).toBe(l.conversion.factor)
      }
      const factor = String(l.factor!.kg_co2e)
      expect(line).toContain(factor)
      expect(row[2]).toContain(factor)
      expect(Number(factor)).toBe(l.factor!.kg_co2e)
    }
    // The gallon conversion, named: the artefact's own cell value, printed as stored.
    const gal = priced.lines.find(l => l.unit_as_entered === 'gallons')!
    expect(String(gal.conversion!.factor)).toBe('3.7854118034613733')
    expect(gal.conversion!.cite).toBe('Conversions!C40')
  })

  it('C3C-14 a spend left by the old method is reported as recorded and not used, and prices nothing', () => {
    // ⚠️ PRECAUTIONARY. The SQL of 20 Sep 2026 found one saved Scope 3 record, Category 3 not relevant,
    // holding only `included` and `relevant`: no live record carries a Category 3 spend. This is for
    // the ones that do not exist yet, and for the pattern, which is Category 15's
    // (CAT15_RECORDED_NOT_USED): keep the number, report it, never price it and never drop it quietly.
    const { read, priced } = worked()
    const withSpend = cat3CsvRows(priced, read, null, GWP, undefined, '400,000 USD')
    expect(withSpend).toContainEqual(['Spend recorded on this record', '400,000 USD', CAT3_RECORDED_NOT_USED])
    expect(CAT3_RECORDED_NOT_USED).toMatch(/^Recorded, and NOT used to produce any figure\./)
    expect(CAT3_RECORDED_NOT_USED).toContain('asks for no spend figure')
    expect(cat3RetiredSpendText('400,000 USD')).toContain('A spend figure of 400,000 USD is stored on this record')

    // The figure is untouched by it: the same rows, the same total, with and without.
    const without = cat3CsvRows(priced, read, null, GWP, undefined, null)
    expect(withSpend.filter(r => r[0] !== 'Spend recorded on this record')).toEqual(without)
    expect(without.some(r => r[0] === 'Spend recorded on this record'), 'no row when none is stored').toBe(false)
    expect(cat3Basis(priced, read, null).detail).not.toMatch(/spend/i)
    expect(priced.kg_co2e).toBeCloseTo(19_572.329976, 6)

    // And it still appears when the category is withheld for activity D or prices zero: those states
    // change the figure, not what is on the record.
    expect(cat3CsvRows(priced, read, null, GWP, true, '400,000 USD'))
      .toContainEqual(['Spend recorded on this record', '400,000 USD', CAT3_RECORDED_NOT_USED])
    const answered = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
      'mobile', 'refrigerants', 'electricity', 'purchased_steam']
    const zeroRead = cat3InputsFrom(
      answered.map(stream => ({ location: 'Office', stream, source: 'Declaration', scope: 1, activity_data: 0,
        activity_unit: '—', declaration: 'attested_absent', gwp_basis: 'declaration', result_tco2e: null })),
      [{ id: 'o', name: 'Office', country: 'GB', stream_attestations: answered.map(x => ({ stream: x, attested_at: 'x' })) }])
    const zero = priceCat3(zeroRead.inputs!)
    expect(zero.kg_co2e).toBe(0)
    expect(cat3CsvRows(zero, zeroRead, null, GWP, undefined, '400,000 USD'))
      .toContainEqual(['Spend recorded on this record', '400,000 USD', CAT3_RECORDED_NOT_USED])
  })

  it('C3C-15 nothing in the Category 3 path reads a stored spend, and the page carries it through unread', () => {
    // The two calculation modules never mention it (SE5 asserts the same for the save payload).
    for (const file of ['cat3Inputs.ts', 'cat3Energy.ts', 'cat3Fingerprint.ts']) {
      expect(readFileSync(join(__dirname, file), 'utf8'), file).not.toMatch(/annual_spend|total_spend/)
    }
    const src = page()
    // The page formats it once, into a string, and hands that to the copy module. A string cannot be
    // priced by accident.
    expect(src).toContain("const cat3RetiredSpend: string | null = catData['cat3']?.annual_spend")
    expect(src).toContain('cat3GwpSentence, cat3SellsEnergyOn, cat3RetiredSpend)')
    // ⚠️ THE ASSERTION GOT STRONGER ON 25 SEP 2026, NOT WEAKER. It used to allow exactly ONE call to
    // calcGenericSpend, on the flat_spend case, because that was the only thing in the page that turned a
    // stored spend into a figure. calcGenericSpend and GENERIC_SPEND_FACTOR are both deleted, so the
    // requirement is now that nothing in the page turns a spend into a figure at all.
    const dispatch = src.slice(src.indexOf('const getCatEmissions'), src.indexOf('// ── CATEGORIES THAT CANNOT BE PRICED'))
    expect([...src.matchAll(/calcGenericSpend\(/g)], 'calcGenericSpend is deleted, not merely unused').toHaveLength(0)
    expect(dispatch, 'the no-method arm returns an entered figure or nothing')
      .toContain("case 'no_method': return catData[id]?.emissions_override || 0")
    // ⚠️ COMMENTS STRIPPED, AND THIS FAILED WITHOUT IT. The page's own comment inside getConfidence quotes
    // the retired line `if (d.annual_spend || d.total_spend) return 'low'` in order to record that it was
    // removed, so a match over the raw source finds the prose describing the rule and reports the rule as
    // broken. Fifth occurrence of that shape in this work; docs/backlog.md carries the approved task to
    // make the stripping one shared helper.
    const conf = src.slice(src.indexOf('const getConfidence ='))
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(conf, 'no branch may key the confidence label on a stored spend')
      .not.toMatch(/d\.annual_spend \|\| d\.total_spend/)
    expect([...conf.matchAll(/return 'low'/g)], 'one fall-through, not a spend test beside it').toHaveLength(1)
  })

  it('C3C-8 the basis says what priced THIS record, in each of its five states', () => {
    const { read, priced } = worked()
    // 1. Priced: the source, the count, the stand-ins and the gaps, with the method description embedded.
    const b = cat3Basis(priced, read, null)
    expect(b.basis).toBe('UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting, upstream energy factors per line, on the bound GHG inventory')
    expect(b.detail).toContain(scope3MethodDescription('fuel_and_energy_upstream'))
    expect(b.detail).toContain('9 lines priced at 2 locations, 19,572.33 kg CO2e in all.')
    // 2. The stand-in lines are counted and their countries named, in the basis itself.
    expect(b.detail).toContain('5 of 9 lines rest on a UK factor away from the UK (US)')
    // 3. Withheld: the reason that withheld it, verbatim, and the same sentence the panel shows.
    const openRead = cat3InputsFrom(SCOPE3_FIXTURE_GHG.workings,
      SCOPE3_FIXTURE_GHG.locations.map(l => ({ ...l, stream_attestations: [] })))
    const open = priceCat3(openRead.inputs!)
    expect(open.status).toBe('withheld')
    expect(cat3Basis(open, openRead, null)).toEqual({ basis: 'Not priced', detail: cat3NoFigureText(open, openRead) })
    // 4. A calculated zero: an answer, and it says so.
    const answered = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
      'mobile', 'refrigerants', 'electricity', 'purchased_steam']
    const zeroRead = cat3InputsFrom(
      answered.map(stream => ({ location: 'Office', stream, source: 'Declaration', scope: 1, activity_data: 0,
        activity_unit: '—', declaration: 'attested_absent', gwp_basis: 'declaration', result_tco2e: null })),
      [{ id: 'o', name: 'Office', country: 'GB', stream_attestations: answered.map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' })) }],
    )
    const zero = priceCat3(zeroRead.inputs!)
    const zb = cat3Basis(zero, zeroRead, null)
    expect(zb.basis).toContain('upstream energy factors, on the bound GHG inventory')
    expect(zb.detail).toContain('calculated zero, not a blank')
    // 5. An entered figure: no factor was applied, and the figure it supersedes is named.
    const ob = cat3Basis(priced, read, 25)
    expect(ob.basis).toBe('Entered figure')
    expect(ob.detail).toBe('25.00 mt CO2e entered directly; no emission factor was applied. The energy in ' +
      'the bound GHG inventory gives 19.5723 mt CO2e; the entered figure is used instead.')
    // ⚠️ ONE UNIT LABEL IN THIS CATEGORY'S PROSE. Two spellings two clauses apart is how a reader starts
    // wondering whether they mean different things. Kilograms are spelled out per line; tonnes are "mt",
    // as the card header, the CSV total and every other category's entered-figure sentence have them.
    const prose = [ob.detail, b.detail, zb.detail, ...cat3Sentences(priced, read, GWP)].join(' ')
    // A space then "t CO2e" is the spelling this bans; " mt CO2e" does not match it.
    expect(/\st CO2e/.test('19.5723 t CO2e'), 'the guard must catch the banned spelling').toBe(true)
    expect(/\st CO2e/.test('19.5723 mt CO2e'), 'and must not catch the chosen one').toBe(false)
    expect(prose).not.toMatch(/\st CO2e/)
    expect(prose).toMatch(/19\.5723 mt CO2e/)
    // An unreadable inventory has no figure to supersede, and the sentence does not invent one.
    const none = cat3InputsFrom(null, [])
    expect(cat3Basis(null, none, 25).detail).toBe('25.00 mt CO2e entered directly; no emission factor was applied.')
    expect(cat3Basis(null, none, null)).toEqual({ basis: 'Not priced', detail: cat3NoFigureText(null, none) })
  })

  it('C3C-9 the export carries one row per priced line, and each can be re-derived from it', () => {
    const { read, priced } = worked()
    const rows = cat3CsvRows(priced, read, null, GWP)
    expect(rows[0][0]).toBe('Basis')
    // One row per line, labelled by location, stream and which of the three lines it is.
    const lineRows = rows.filter(r => r[0].startsWith('UK site') || r[0].startsWith('US site'))
    expect(lineRows).toHaveLength(9)
    expect(lineRows[0]).toEqual(['UK site, electricity, upstream of the fuels burned to generate it (well-to-tank)',
      '100,000 kWh',
      '100,000 kWh x 0.03682 kg CO2e per kWh (WTT- UK electricity E19) = 3,682.00 kg CO2e.'])
    // A converted line shows the conversion, then the priced figure, then the factor and the product.
    const therms = lineRows.find(r => r[1] === '1,000 therms')!
    expect(therms[2]).toBe('Converted to kWh at 29.30710833487654 (Conversions!D30) = 29,307.1083 kWh. ' +
      '29,307.1083 kWh x 0.03021 kg CO2e per kWh (Gross CV) (WTT- fuels D41) = 885.37 kg CO2e. ' +
      'UK factor used as a stand-in at a location in US, whose Scope 1 and 2 figures are priced from US EPA GHG Emission Factors Hub (2025).')
    // The GWP basis and the disclosures, once each.
    expect(rows.filter(r => r[0] === 'GWP basis')).toEqual([['GWP basis', 'AR5', GWP]])
    // The GWP sentence has its own row, so it is not repeated as a disclosure.
    expect(rows.filter(r => r[0] === 'Disclosure').map(r => r[1]))
      .toEqual(cat3MethodSentences(priced, GWP).filter(d => d !== GWP))
    expect(rows.filter(r => r[2] === GWP || r[1] === GWP), 'the GWP sentence appears exactly once').toHaveLength(1)
    // A row the adapter set aside is reported rather than dropped.
    expect(rows.some(r => r[0] === 'Row not used' && /market-based electricity row at UK site/.test(r[2]))).toBe(true)
  })

  it('C3C-10 a New Zealand transmission line names its own source in the export, and no DEFRA factor', () => {
    // ⚠️ THE 3c LINE IS NOT A DEFRA PRODUCT AT AN NZ LOCATION. The GHG engine prices it on the New Zealand
    // factor, and the export must not let it read as one of the DEFRA lines beside it.
    const attest = ['propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'mobile',
      'refrigerants', 'purchased_steam', 'natural_gas'].map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' }))
    const read = cat3InputsFrom(
      [{ location: 'Auckland', stream: 'electricity', source: 'Electricity (S2 location-based)', scope: 2,
         activity_data: 50_000, activity_unit: 'kWh', scope2_method: 'location-based',
         ef_source: 'NZ MfE (2025)', result_tco2e: 5, entry_method: 'manual' },
       { location: 'Auckland', stream: 'electricity', source: 'Electricity T&D losses (NZ) — Scope 3 Cat 3',
         scope: 3, activity_data: 50_000, activity_unit: 'kWh', gwp_basis: 'scope3-cat3',
         ef_source: 'NZ MfE (2025) · T&D losses (Scope 3 Cat 3)', result_tco2e: 0.745, entry_method: 'manual' }],
      [{ id: 'nz', name: 'Auckland', country: 'NZ', electricity_kwh: 50_000, nz_td_losses: true, stream_attestations: attest }],
    )
    const priced = priceCat3(read.inputs!)
    const rows = cat3CsvRows(priced, read, null, GWP)
    const td = rows.find(r => r[0].includes('generation of the electricity lost'))!
    expect(td[2]).toBe("745.00 kg CO2e, taken from the GHG inventory's own New Zealand transmission and " +
      'distribution figure (lib/ghg/engine.ts s3_td (MfE)). No DEFRA factor was applied to this line.')
    expect(td[2]).not.toMatch(/WTT|Transmission and distribution E22|0\.01299/)
    // The basis says the same thing, so the Method cell and the line agree.
    expect(cat3Basis(priced, read, null).detail).toContain("the GHG inventory's own New Zealand figure")
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
    expect(cat3Sentences(priced, read, GWP)).toContain(text)
    expect(priced.kg_co2e).toBeCloseTo(19_572.329976, 6)
  })
})
