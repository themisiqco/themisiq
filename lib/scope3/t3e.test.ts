import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defraTravelFor, DEFRA_TRAVEL_YEARS } from '../emissionFactors/defraTravel'
import { defraWasteMetaFor, wasteRecord, DEFRA_WASTE_YEARS, priceWasteRow } from '../emissionFactors/defraWaste'
import { FACTOR_EDITION_REGISTRY, DATASETS } from '../ghg/factorEditionRegistry'
import { evaluateBusinessTravel, priceFlight, withDistance, type FlightRow } from './businessTravel'
import { priceCommute, type CommuteRow } from './commuting'
import { evaluateWasteRows } from './wasteRows'
import { evaluateEolMaterials } from './endOfLife'
import { cat6CopyFor, cat6Sentences } from './businessTravelCopy'
import { cat7CopyFor, commuteFlags } from './commutingCopy'
import { twFor } from '../testing/defraEditions'

// T3e (ruling R18): DEFRA business travel and waste, selected by the DESNZ rule like every other DESNZ dataset, with
// DEFRA 2023, 2024 and 2025 loaded beside 2026. Lisa's rulings of 8 Oct 2026: 2025's "Incineration with energy recovery"
// is read as the Combustion route and disclosed on each row; 2025's electric car rows quote their own A14 (T&D
// losses included); Hotel stay is not loaded before 2026. The build machine has no copy of ~/themisiq-sources; each
// pinned value below was read from the cited cell by scripts/generate-defra-*.py --year when the artefact was made.

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const flight = (): FlightRow => ({ id: 'f1', origin_iso2: 'GB', destination_iso2: 'US', cabin_class: 'business', count: 1, ...withDistance(5000, 'km') })
const WASTE_ROW = { activity: 'Refuse', waste_type: 'Commercial and industrial waste', route: 'Landfill', tonnes: 2 }

describe('T3e: the editions held, and their values', () => {
  it('the registry holds DEFRA 2023 to 2026 for both datasets, each with the correction its file reflects', () => {
    for (const ds of ['desnz_travel', 'desnz_waste'] as const) {
      const held = FACTOR_EDITION_REGISTRY.filter(e => e.dataset === ds && e.held)
      expect(held.map(e => [e.label, e.heldCorrection ?? null]), ds).toEqual([
        ['DEFRA 2023', '2023-06-28'], ['DEFRA 2024', '2024-10-30'], ['DEFRA 2025', null], ['DEFRA 2026', null]])
      expect(DATASETS[ds].selectionWiredIn, ds).toBeUndefined()
    }
    expect([DEFRA_TRAVEL_YEARS, DEFRA_WASTE_YEARS]).toEqual([[2023, 2024, 2025, 2026], [2023, 2024, 2025, 2026]])
  })

  it('spot values, one per table per edition, with the cell each was read from', () => {
    const T = (y: number) => defraTravelFor(y)!
    // Business travel- air, long-haul business, with and without RF; WTT- business travel- air.
    expect([2023, 2024, 2025, 2026].map(y => [T(y).airRecord('long_haul', 'business')!.with_rf.kg_co2e, T(y).airRecord('long_haul', 'business')!.cells.with_rf]))
      .toEqual([[0.5802869302013423, 'E30:H30'], [0.58028, 'E30:H30'], [0.3394, 'E30:H30'], [0.3394, 'E30:H30']])
    expect([2023, 2024, 2025, 2026].map(y => T(y).airRecord('long_haul', 'business')!.without_rf.kg_co2e)).toEqual([0.3425269302013423, 0.34252, 0.20083, 0.20083])
    expect([2023, 2024, 2025, 2026].map(y => [T(y).wttAirRecord('long_haul', 'business')!.without_rf, T(y).wttAirRecord('long_haul', 'business')!.cells.without_rf]))
      .toEqual([[0.07137, 'F27'], [0.07137, 'F27'], [0.07137, 'F27'], [0.07137, 'F27']])
    // Haul definition: the same 215 territories and hauls in every edition (T3e Step 1).
    for (const y of [2023, 2024, 2025]) expect(T(y).HAUL_RECORDS.map(r => [r.iso3, r.haul]), String(y)).toEqual(T(2026).HAUL_RECORDS.map(r => [r.iso3, r.haul]))
    // Business travel- land: national rail, medium diesel car, medium battery electric car, average motorbike, regular taxi, average local bus.
    expect([2023, 2024, 2025, 2026].map(y => T(y).railRecord('National rail')!.kg_co2e)).toEqual([0.03546296375838926, 0.03546, 0.03546, 0.03092])
    expect([2023, 2024, 2025, 2026].map(y => [T(y).carRecord('medium', 'diesel')!.kg_co2e, T(y).carRecord('medium', 'diesel')!.cells.values]))
      .toEqual([[0.1671564488805369, 'D49:G49'], [0.16807, 'D49:G49'], [0.17174, 'D49:G49'], [0.17209, 'D49:G49']])
    expect([2023, 2024, 2025, 2026].map(y => T(y).carRecord('medium', 'battery_electric')!.kg_co2e)).toEqual([0.05266634899328859, 0.04625, 0.03882, 0.02816])
    expect([2023, 2024, 2025, 2026].map(y => T(y).motorbikeRecord('average')!.kg_co2e)).toEqual([0.1136742644295302, 0.11367, 0.11367, 0.11367])
    expect([2023, 2024, 2025, 2026].map(y => T(y).taxiRecord('regular', 'passenger_km')!.kg_co2e)).toEqual([0.148614925938255, 0.14861, 0.14861, 0.14861])
    expect([2023, 2024, 2025, 2026].map(y => T(y).busRecord('average_local')!.kg_co2e)).toEqual([0.10215039463087248, 0.10846, 0.10385, 0.10151])
    // WTT- pass vehs & travel- land: national rail, its cell moved one row in 2026.
    expect([2023, 2024, 2025, 2026].map(y => [T(y).wttRailRecord('National rail')!.kg_co2e, T(y).wttRailRecord('National rail')!.cells.value]))
      .toEqual([[0.008966173915660059, 'D83'], [0.00897, 'D83'], [0.00897, 'D83'], [0.00897, 'D84']])
    // Homeworking, combined, per FTE working hour.
    expect([2023, 2024, 2025, 2026].map(y => [T(y).homeworkingRecord('combined')!.kg_co2e, T(y).homeworkingRecord('combined')!.cells.value]))
      .toEqual([[0.3337812045667021, 'C24'], [0.33378, 'C24'], [0.33378, 'C24'], [0.32393, 'C24']])
    // Waste disposal: C&I to landfill. 2025 prints no Re-use column, so its value is one column left (by label).
    expect([2023, 2024, 2025, 2026].map(y => [wasteRecord('Refuse', 'Commercial and industrial waste', 'Landfill', y)!.value, wasteRecord('Refuse', 'Commercial and industrial waste', 'Landfill', y)!.cell]))
      .toEqual([[520.3347434629953, 'I53'], [520.3342, 'I52'], [520.5327, 'H52'], [520.58023, 'I52']])
  })

  it('DEFRA 2023 values are held as the workbook stores them, unrounded (the t3d-2024 ruling)', () => {
    expect(defraTravelFor(2023)!.carRecord('medium', 'diesel')!.kg_co2e).toBe(0.1671564488805369)
    expect(wasteRecord('Refuse', 'Commercial and industrial waste', 'Landfill', 2023)!.value).toBe(520.3347434629953)
  })

  it('Hotel stay is not loaded before 2026 (ruling 3), and nothing prices hotels', () => {
    for (const y of [2023, 2024, 2025]) {
      expect(defraTravelFor(y)!.HOTEL_RECORDS, String(y)).toEqual([])
      expect(defraTravelFor(y)!.META.sheets, String(y)).not.toContain('Hotel stay')
    }
    expect(defraTravelFor(2026)!.HOTEL_RECORDS.length).toBe(55)
  })
})

describe('T3e ruling 1: DEFRA 2025 "Incineration with energy recovery" is the Combustion route', () => {
  it('2025 combustion-route values are read from the renamed column, cited to their own cells', () => {
    const rec = wasteRecord('Plastic', 'Plastics: PET (incl. forming)', 'Combustion', 2025)!
    expect([rec.value, rec.cell, rec.route_as_published]).toEqual([4.68568, 'F79', 'Incineration with energy recovery'])
    const rn = defraWasteMetaFor(2025)!.route_renames
    expect(rn.map(r => [r.published, r.as, r.definition_cell, r.header_cells.length])).toEqual([['Incineration with energy recovery', 'Combustion', 'A12', 7]])
    expect(rn[0].definition).toContain('For incineration with energy recovery and recycling, the factors consider transport to an energy recovery or materials reclamation facility only')
    // Every 2025 Combustion record is in column F, the renamed one; 2026's are in G, after Re-use.
    const all = (y: number) => (['Average construction', 'Mineral oil', 'Wood'] as const).map(t => wasteRecord('Construction', t, 'Combustion', y)?.cell ?? null)
    expect(all(2025).every(c => c === null || c.startsWith('F'))).toBe(true)
    for (const y of [2023, 2024, 2026]) expect(defraWasteMetaFor(y)!.route_renames, String(y)).toEqual([])
    // 2025 prints no Re-use column, and Re-use is never a priced route in any edition.
    expect(defraWasteMetaFor(2025)!.routes).not.toContain('Re-use')
    expect(defraWasteMetaFor(2026)!.routes[0]).toBe('Re-use')
  })

  it('a 2025 row on that route prices from F, and its row says DEFRA published it under the other name, citing A12', () => {
    const p = priceWasteRow({ activity: 'Plastic', waste_type: 'Plastics: PET (incl. forming)', route: 'Combustion', tonnes: 1 }, twFor(2025).waste)
    expect(p).toMatchObject({ status: 'priced', factor_kg_per_tonne: 4.68568, cell: 'F79', edition: { label: 'DEFRA 2025', year: 2025 } })
    if (p.status !== 'priced') throw new Error('not priced')
    expect(p.route_note).toBe(
      'DEFRA published this route in 2025 as "Incineration with energy recovery" (Waste disposal F79). The sheet defines it in the same words as combustion in the other editions ' +
      '(Waste disposal A12: "For landfill, the factors in the tables include collection, transportation and landfill emissions (‘gate to grave’). For incineration with energy recovery and recycling, ' +
      'the factors consider transport to an energy recovery or materials reclamation facility only. This is in line with GHG Protocol Guidelines, with subsequent emissions attributed to electricity ' +
      'generation or recycled material production respectively.").')
  })
})

describe('T3e ruling 2: each electric car row quotes its own edition\'s Business travel- land A14', () => {
  const car = (): CommuteRow => ({ id: 'c', mode: 'car', country_iso2: 'GB', employees: 10, ...withDistance(10, 'km'), days_per_week: 5, weeks_per_year: 46,
    occupancy: 1, car_size: 'medium', car_fuel: 'battery_electric' }) as CommuteRow
  it('2025 says the electric car factors include transmission and distribution losses; 2023, 2024 and 2026 do not', () => {
    for (const [y, td] of [[2023, false], [2024, false], [2025, true], [2026, false]] as const) {
      const eds = twFor(y === 2023 ? 2023 : y, y === 2023 ? 6 : 12)
      const p = priceCommute(car(), eds.travel)
      if (p.status !== 'priced') throw new Error(`${y}: ${p.status}`)
      expect(p.edition.year, String(y)).toBe(y)
      expect(commuteFlags(p).some(f => f.includes('transmission and distribution losses')), String(y)).toBe(td)
      const sentence = cat7CopyFor(eds.travel).CAT7_ELECTRIC_SENTENCE
      expect(sentence, String(y)).toContain('(Business travel- land A14)')
      expect(sentence.includes('transmission & distribution (T&D) losses'), String(y)).toBe(td)
    }
  })
  it('only 2026 claims the rail factors carry UK electricity: no older edition prints What\'s new B22', () => {
    const rail = (): CommuteRow => ({ id: 'r', mode: 'rail', country_iso2: 'GB', employees: 1, ...withDistance(10, 'km'), days_per_week: 5, weeks_per_year: 46, rail_type: 'National rail' }) as CommuteRow
    for (const [y, m, claimed] of [[2023, 6, false], [2024, 12, false], [2025, 12, false], [2026, 12, true]] as const) {
      const p = priceCommute(rail(), twFor(y, m).travel)
      if (p.status !== 'priced') throw new Error(`${y}: ${p.status}`)
      expect(p.uk_electricity, String(y)).toBe(claimed)
    }
  })
})

describe('T3e: every reporting year and year end prices on the edition the DESNZ rule requires', () => {
  const CASES: [number, number, string][] = [
    [2026, 12, 'DEFRA 2026'], [2026, 3, 'DEFRA 2025'], [2026, 6, 'DEFRA 2026'], [2026, 9, 'DEFRA 2026'],
    [2025, 12, 'DEFRA 2025'], [2025, 3, 'DEFRA 2024'], [2025, 6, 'DEFRA 2025'], [2025, 9, 'DEFRA 2025'],
    [2024, 12, 'DEFRA 2024'], [2024, 3, 'DEFRA 2023'], [2024, 6, 'DEFRA 2023'], [2024, 9, 'DEFRA 2024'],
  ]
  for (const [y, m, want] of CASES) it(`year ending month ${m}, ${y}: a flight and a waste line price on ${want}, no edition_missing`, () => {
    const eds = twFor(y, m)
    const year = Number(want.slice(-4))
    const f = priceFlight(flight(), true, eds.travel)
    expect(f.status).toBe('priced')
    if (f.status !== 'priced') return
    expect([f.edition.label, f.edition.rule.startsWith('desnz_'), f.edition.published.length > 0]).toEqual([want, true, true])
    expect(f.factor.with_rf.kg_co2e).toBe(defraTravelFor(year)!.airRecord('long_haul', 'business')!.with_rf.kg_co2e)
    const w = priceWasteRow(WASTE_ROW, eds.waste)
    expect(w).toMatchObject({ status: 'priced', edition: { label: want } })
    if (w.status === 'priced') expect(w.factor_kg_per_tonne).toBe(wasteRecord('Refuse', 'Commercial and industrial waste', 'Landfill', year)!.value)
  })

  it('every priced row carries the edition, the rule, its basis and the publication and correction dates', () => {
    const f = priceFlight(flight(), true, twFor(2024, 12).travel)
    if (f.status !== 'priced') throw new Error('not priced')
    expect(f.edition).toMatchObject({ label: 'DEFRA 2024', rule: 'desnz_calendar', published: '8 July 2024', corrected: '30 October 2024', provisional: false, year: 2024 })
    expect(f.edition.basis.length).toBeGreaterThan(0)
    const e = evaluateBusinessTravel({ flights: [flight()] }, twFor(2024, 12).travel)
    expect(f.edition.basis).toBe('DESNZ 2024 factors for reporting year 2024, following DESNZ guidance for calendar years. Values as corrected on 30 October 2024.')
    // The correction is said once: the basis carries it, so the edition sentence does not repeat it.
    expect(cat6Sentences(e, 'GWP.', c => c)).toContain(`Factor edition: DEFRA 2024. ${f.edition.basis} Published 8 July 2024.`)
  })

  it('a reporting year that needs DEFRA 2022 (year ending March 2023) gives the unpriced line with the T3c message, never another edition', () => {
    const eds = twFor(2023, 3)
    expect(eds.travel).toEqual({ missing: { edition: 'DEFRA 2022', message: 'DEFRA 2022 business travel factors are needed for the year ending 31 March 2023 and are not loaded, so this line is not counted.' } })
    expect(eds.waste).toEqual({ missing: { edition: 'DEFRA 2022', message: 'DEFRA 2022 waste disposal factors are needed for the year ending 31 March 2023 and are not loaded, so this line is not counted.' } })
    expect(priceFlight(flight(), true, eds.travel)).toEqual({ status: 'edition_missing', edition: 'DEFRA 2022', message: (eds.travel as { missing: { message: string } }).missing.message })
    expect(priceWasteRow(WASTE_ROW, eds.waste)).toMatchObject({ status: 'edition_missing', edition: 'DEFRA 2022' })
    const ev = evaluateWasteRows([{ id: 'w', ...WASTE_ROW }], eds.waste)
    expect([ev.priced.length, ev.kg]).toEqual([0, 0])
    const eol = evaluateEolMaterials([{ id: 'm', activity: 'Refuse', waste_type: 'Commercial and industrial waste', tonnes: 1, shares: { Landfill: 100 } }], eds.waste)
    expect(eol.evaluated[0].outcome).toMatchObject({ status: 'edition_missing', edition: 'DEFRA 2022' })
    // The year ending June 2023 needs DEFRA 2023, now held.
    expect(twFor(2023, 6).travel).toMatchObject({ held: { label: 'DEFRA 2023' } })
  })
})

describe('T3e: the sentences name the edition priced, or the set held', () => {
  it('each held edition builds its own Category 6 and 7 sentences, with its own Index notes (or says it prints none)', () => {
    const at = (y: number) => ({ held: { label: `DEFRA ${y}`, rule: 'desnz_calendar', basis: 'b', published: 'p', corrected: null, provisional: false, year: y } })
    for (const y of [2023, 2024]) {
      expect(cat6CopyFor(at(y)).CAT6_WTT_SENTENCE, String(y)).toContain("This edition's Index sheet does not say when its flight and well-to-tank flight factors were last updated.")
      expect(cat7CopyFor(at(y)).CAT7_WTT_SENTENCE, String(y)).toContain("This edition's Index sheet does not say when its land travel and well-to-tank factors were last updated.")
    }
    // 2025 records the flights' CO2 update in the annually-updated column (G40); 2026 in the last-updated one (H40).
    expect(cat6CopyFor(at(2025)).CAT6_WTT_SENTENCE).toContain('flight factors in its 2025 publication (Index H41 and Index G40)')
    expect(cat6CopyFor(at(2026)).CAT6_WTT_SENTENCE).toContain('flight factors in its 2025 publication (Index H41 and Index H40)')
    // 2025 updated cars and buses only; rail was last updated in 2021, with motorbikes and taxis.
    expect(cat7CopyFor(at(2025)).CAT7_WTT_SENTENCE).toContain('factors for cars and buses were updated in its 2025 publication and those for motorbike, taxis and rail last in its 2021 publication')
    expect(cat7CopyFor(at(2026)).CAT7_WTT_SENTENCE).toContain('factors for cars, buses and rail were updated in its 2026 publication and those for motorbikes and taxis last in its 2021 publication')
    for (const y of [2023, 2024, 2025, 2026]) expect(cat6CopyFor(at(y)).CAT6_SOURCE_SENTENCE, String(y)).toContain(`UK DEFRA/DESNZ (${y}) GHG Conversion Factors for Company Reporting`)
  })

  it('the methodology page, the assistant and the GWP rule name the editions held, never one year', () => {
    const ms = read('lib/scope3/methodSummary.ts')
    for (const s of ['DEFRA_WASTE_META.year', 'DEFRA_TRAVEL_META.year']) expect(ms, s).not.toContain(s)
    for (const f of ['lib/scope3/businessTravelCopy.ts', 'lib/scope3/commutingCopy.ts']) {
      expect(read(f), f).toContain('of the edition the reporting year requires (${heldYearsWords(DEFRA_TRAVEL_YEARS)})')
    }
  })

  it('no generated sentence has an em dash, in any edition', () => {
    for (const y of DEFRA_TRAVEL_YEARS) {
      const ed = { held: { label: `DEFRA ${y}`, rule: 'r', basis: 'b', published: 'p', corrected: null, provisional: false, year: y } }
      const c6 = cat6CopyFor(ed), c7 = cat7CopyFor(ed)
      for (const s of [c6.CAT6_SOURCE_SENTENCE, c6.CAT6_WTT_SENTENCE, c6.CAT6_UPLIFT_SENTENCE, c6.cat6RfSentence(true), c6.cat6MethodDescription(), c7.CAT7_SOURCE_SENTENCE,
        c7.CAT7_ELECTRIC_SENTENCE, c7.CAT7_WTT_SENTENCE, c7.CAT7_HOMEWORKING_SENTENCE, c7.cat7MethodDescription()]) expect(s, String(y)).not.toContain('\u2014')
    }
  })
})

describe('T3e: the generators and the values CSV', () => {
  it('both generators take the year, and 2026 stays as strict as before', () => {
    for (const f of ['scripts/generate-defra-travel.py', 'scripts/generate-defra-waste.py']) {
      const g = read(f)
      expect(g, f).toContain('YEAR = int(_arg("--year", "2026"))')
      expect(g, f).toContain('STRICT = YEAR == 2026')
    }
    expect(read('scripts/generate-defra-waste.py')).toContain('ROUTE_PUBLISHED_AS = {"Incineration with energy recovery": "Combustion"}')
  })

  it('docs/review/t3e-values.csv lists every 2023 to 2025 value with its cell', () => {
    const csv = read('docs/review/t3e-values.csv')
    const has = (ds: string, ed: string, key: string, v: unknown, cell: string) => {
      const line = csv.split('\n').find(l => l.startsWith(`${ds},${ed},${key},${v},`))
      expect(line, `${ds} ${ed} ${key}`).toBeDefined()
      expect(line, `${ds} ${ed} ${key} cites its cell`).toContain(cell)
    }
    for (const y of [2023, 2024, 2025]) {
      const T = defraTravelFor(y)!
      for (const r of T.AIR_RECORDS) has('desnz_travel', `DEFRA ${y}`, `air:${r.category}:${r.cabin_class}:with_rf`, r.with_rf.kg_co2e, r.cells.with_rf)
      for (const r of T.CAR_RECORDS) has('desnz_travel', `DEFRA ${y}`, `car:${r.size}:${r.fuel}`, r.kg_co2e, r.cells.values)
      for (const r of T.HOMEWORKING_RECORDS) has('desnz_travel', `DEFRA ${y}`, `homeworking:${r.component}`, r.kg_co2e, r.cells.value)
      for (const r of (['Commercial and industrial waste', 'Household residual waste'] as const)) {
        const w = wasteRecord('Refuse', r, 'Landfill', y)!
        has('desnz_waste', `DEFRA ${y}`, `Refuse:${r}:Landfill`, w.value, w.cell)
      }
    }
  })
})
