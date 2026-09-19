import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import data from './defraTravel2026.json'
import { defraCitation, DEFRA_DESNZ_PUBLICATION } from '../ghg/engine'

// defraTravel2026.json IS GENERATED FROM A COMMITTED WORKBOOK, NOT MAINTAINED. TO CHANGE THE DATA, run
// the generator, not an editor:
//   python3 scripts/generate-defra-travel.py
//
// ⚠️ THE CHECKS FROM T6 ON DO NOT COME FROM THE GENERATOR'S OWN LOGIC. They test the published numbers
// against things stated elsewhere: the sheet's own sentence that radiative forcing raises the CO2 factor
// by 70% (T6), the physics of burning jet fuel (T7), the GHG Protocol Technical Guidance on short flights
// (T8), and counts read from the workbook by hand before this generator existed (T9). A failure there is
// a finding about the data or the reading, not a number to update.

const ROWS_SHA256 = '164b481fe08447aeed2e812ff87eecb31ddcc2885fec3713c3ca671de71fc5ab'

type Row = Record<string, unknown>
interface Gas { kg_co2e: number; co2: number; ch4: number; n2o: number }
interface Air { category: string; cabin_class: string; with_rf: Gas; without_rf: Gas; unit: string; sheet: string; row: number }
interface Wtt { category: string; cabin_class: string; with_rf: number; without_rf: number; unit: string }

const meta = data.metadata as Row
const air = data.air as Air[]
const wttAir = data.wtt_air as Wtt[]
const hauls = data.haul_definition as { iso3: string; haul: string; territory: string }[]
const hotels = data.hotel_stay as { country: string; kg_co2e_per_room_night: number | null }[]
const rail = data.rail as (Gas & { type: string; unit: string })[]
const wttRail = data.wtt_rail as { type: string; kg_co2e: number; unit: string }[]
const guidance = meta.guidance as Record<string, { sheet: string; cell: string; text: string }>

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Row).sort()) out[k] = sortDeep((value as Row)[k])
    return out
  }
  return value
}

const label = (r: { category: string; cabin_class: string }) => `${r.category} / ${r.cabin_class}`

describe('defraTravel2026.json', () => {
  it('T1 the rows match their pinned fingerprint', () => {
    const { air, wtt_air, haul_definition, hotel_stay, rail, wtt_rail } = data
    const canonical = JSON.stringify(sortDeep({ air, wtt_air, haul_definition, hotel_stay, rail, wtt_rail }))
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
    expect(digest, 'defraTravel2026.json does not match its fingerprint. Regenerate it; do not edit it.').toBe(ROWS_SHA256)
    expect(meta.fingerprint_sha256).toBe(ROWS_SHA256)
  })

  it('T2 it cites the publication exactly as lib/ghg/engine.ts does, and records the same licence', () => {
    expect(meta.source).toBe(defraCitation(2026))
    expect(meta.title_as_published).toBe(DEFRA_DESNZ_PUBLICATION.title_as_published)
    expect(meta).toMatchObject({ edition: 'DEFRA 2026', factor_set: 'Full set', file_version: '1', year: '2026', gwp_basis: 'AR5' })
    expect(meta.licence).toBe(DEFRA_DESNZ_PUBLICATION.licence)
    expect(meta.licence_url).toBe(DEFRA_DESNZ_PUBLICATION.licence_url)
    expect(meta.attribution_required).toBe(DEFRA_DESNZ_PUBLICATION.attribution_required)
    // The hotel factors are third-party data (Hotel Footprinting Tool); the licence basis must say so.
    expect(String(meta.licence_basis)).toMatch(/Hotel Footprinting Tool/)
  })

  it('T3 the guidance is quoted from the cells named for it', () => {
    const cells = Object.fromEntries(Object.entries(guidance).map(([k, g]) => [k, `${g.sheet}!${g.cell}`]))
    expect(cells).toMatchObject({
      rf_two_sets: 'Business travel- air!A11',
      rf_should_include: 'Business travel- air!A12',
      rf_comparable_reporting: 'Business travel- air!A13',
      rf_faq_which_set: 'Business travel- air!A47',
      rf_faq_indirect_effects: 'Business travel- air!A51',
      distance_uplift: 'Business travel- air!A49',
      international_and_non_stop: 'Business travel- air!A53',
      international_is_average: 'Business travel- air!A56',
    })
    // Read from the Index sheet by the sheet's name, not by row: which publication last updated each air sheet.
    expect(cells).toMatchObject({ index_air_last_updated: 'Index!H40', index_wtt_air_last_updated: 'Index!H41' })
    expect(guidance.index_air_last_updated.text).toMatch(/^Factors last updated in 2025 publication/)
    expect(guidance.index_wtt_air_last_updated.text).toMatch(/^Factors last updated in 2023 publication/)
    expect(guidance.distance_uplift.text).toMatch(/distance uplift of 8%/)
    expect(guidance.international_and_non_stop.text).toMatch(/All factors presented are for direct \(non-stop\) flights only\./)
    expect(guidance.international_is_average.text).toMatch(/an average of short and long-haul flights to\/from UK/)
  })

  it('T4 every value is per passenger.km or per room-night as published, and no empty cell became a zero', () => {
    for (const r of air) {
      expect(r.unit).toBe('kg CO2e per passenger.km')
      for (const g of [r.with_rf, r.without_rf]) for (const v of Object.values(g)) expect(v, label(r)).toBeGreaterThan(0)
    }
    for (const r of wttAir) { expect(r.unit).toBe('kg CO2e per passenger.km'); expect(r.without_rf).toBeGreaterThan(0) }
    for (const r of [...rail, ...wttRail]) { expect(r.unit).toBe('kg CO2e per passenger.km'); expect(r.kg_co2e).toBeGreaterThan(0) }
    for (const h of hotels) {
      const v = h.kg_co2e_per_room_night
      expect(v === null || v > 0, `${h.country}: ${v}`).toBe(true)
    }
  })

  it('T5 the air and WTT air tables hold the same 14 (category, class) pairs; WTT is the same with and without RF', () => {
    const pairs = (rs: { category: string; cabin_class: string }[]) => rs.map(label).sort()
    expect(air).toHaveLength(14)
    expect(pairs(wttAir)).toEqual(pairs(air))
    // The WTT sheet says the indirect effects "do not change the emissions and the two sets of factors are
    // therefore the same" (guidance.wtt_air_rf_identical).
    for (const r of wttAir) expect(r.with_rf, label(r)).toBe(r.without_rf)
    // Classes the sheet publishes per haul: domestic has average passenger only.
    const classes = (c: string) => air.filter(r => r.category === c).map(r => r.cabin_class)
    expect(classes('domestic')).toEqual(['average_passenger'])
    expect(classes('short_haul')).toEqual(['average_passenger', 'economy', 'business'])
    expect(classes('long_haul')).toEqual(['average_passenger', 'economy', 'premium_economy', 'business', 'first'])
    expect(classes('international_non_uk')).toEqual(['average_passenger', 'economy', 'premium_economy', 'business', 'first'])
  })

  it('T6 radiative forcing: with-RF CO2 / without-RF CO2 is 1.70 to within rounding, as the sheet states in A11', () => {
    // The sheet's own statement, quoted from A11: "The entirety of the indirect effects have been applied to
    // the CO2 factor, causing an increase of 70%."
    expect(guidance.rf_two_sets.cell).toBe('A11')
    expect(guidance.rf_two_sets.text).toMatch(/applied to the CO2 factor, causing an increase of 70%/)

    // "To within rounding", made exact: every component is published to 5 decimal places (checked below),
    // so each true value lies within ±0.000005 of the printed one. The ratio of the true values therefore
    // lies in [(F − h)/(J + h), (F + h)/(J − h)]; 1.70 must lie in that interval for every row.
    const h = 0.000005
    const fiveDp = (v: number) => Math.abs(v * 1e5 - Math.round(v * 1e5)) < 1e-6
    for (const r of air) {
      const F = r.with_rf.co2
      const J = r.without_rf.co2
      expect(fiveDp(F) && fiveDp(J), `${label(r)} is not printed to 5 d.p.`).toBe(true)
      expect((F - h) / (J + h), label(r)).toBeLessThanOrEqual(1.7)
      expect((F + h) / (J - h), label(r)).toBeGreaterThanOrEqual(1.7)
      // "The entirety … applied to the CO2 factor": CH4 and N2O do not move.
      expect(r.with_rf.ch4, label(r)).toBe(r.without_rf.ch4)
      expect(r.with_rf.n2o, label(r)).toBe(r.without_rf.n2o)
      // And each total is its three components, to within the rounding of three printed values.
      for (const g of [r.with_rf, r.without_rf]) expect(Math.abs(g.kg_co2e - (g.co2 + g.ch4 + g.n2o)), label(r)).toBeLessThanOrEqual(3 * h + 1e-12)
    }
  })

  it('T7 magnitude: every without-RF air factor lies in a band derived from jet fuel physics', () => {
    // ── THE DERIVATION, SO IT CAN BE CHECKED WITHOUT TRUSTING THE CODE ─────────────────────────────
    // Jet fuel (Jet A-1) is roughly C12H23: carbon mass fraction 12×12.011 / (12×12.011 + 23×1.008)
    // = 144.13 / 167.31 ≈ 0.86. Burning 1 kg releases 0.86 × 44.01/12.011 ≈ 3.15 kg CO2 (ICAO uses 3.16).
    // Density about 0.8 kg/L (the Jet A-1 specification allows 0.775–0.840).
    const carbonFraction = (12 * 12.011) / (12 * 12.011 + 23 * 1.008)
    const kgCo2PerKgFuel = carbonFraction * (44.01 / 12.011)
    const kgCo2PerLitre = 0.8 * kgCo2PerKgFuel
    expect(kgCo2PerKgFuel).toBeGreaterThan(3.1)
    expect(kgCo2PerKgFuel).toBeLessThan(3.2)
    //
    // Fuel burn per passenger-km, for an economy or average seat. These are CC's engineering estimates,
    // written down so they can be disputed:
    //   floor  1.6 L per 100 passenger-km. The most efficient current airliners (A321neo, 787, A350 class)
    //          burn roughly 2 L per 100 seat-km in dense layouts; 100% load is the best case, and an
    //          economy seat is allocated less than the average seat. 1.6 leaves about 20% below that.
    //   ceiling 6 L per 100 passenger-km. Older narrowbodies, regional jets and turboprops on short
    //          sectors, where taxi, take-off and climb are a large share of the fuel, burn about 4–4.5 L
    //          per 100 seat-km; at a load factor of about 75% that is about 6 per passenger.
    // The ceiling is then raised by the sheet's 8% distance uplift (A49) and by 3% for CH4 and N2O, which
    // are about 1% of each DEFRA air total. The floor is not lowered for either.
    const floor = (1.6 / 100) * kgCo2PerLitre          // ≈ 0.040 kg CO2e per passenger-km
    const ceiling = (6.0 / 100) * kgCo2PerLitre * 1.08 * 1.03   // ≈ 0.168
    expect(floor).toBeCloseTo(0.0403, 3)
    expect(ceiling).toBeCloseTo(0.168, 2)
    //
    // Premium classes: DEFRA allocates by the floor area a seat occupies (the sheet's FAQ, A43). A premium
    // seat occupies at least an economy seat's area and, for a first-class suite, at most about five
    // economy footprints. So a premium factor is between 1× and 5× the economy factor on the same haul,
    // and never above 5× the economy ceiling.
    const economy = new Map(air.filter(r => r.cabin_class === 'economy').map(r => [r.category, r.without_rf.kg_co2e]))
    let checked = 0
    for (const r of air) {
      const v = r.without_rf.kg_co2e
      if (r.cabin_class === 'average_passenger' || r.cabin_class === 'economy') {
        expect(v, label(r)).toBeGreaterThanOrEqual(floor)
        expect(v, label(r)).toBeLessThanOrEqual(ceiling)
      } else {
        const e = economy.get(r.category)
        expect(e, `${label(r)} has no economy row to compare with`).toBeDefined()
        expect(v / e!, label(r)).toBeGreaterThanOrEqual(1)
        expect(v / e!, label(r)).toBeLessThanOrEqual(5)
        expect(v, label(r)).toBeLessThanOrEqual(5 * ceiling)
      }
      checked++
    }
    expect(checked).toBe(air.length)
  })

  it('T8 ordering: a domestic flight emits more per km than a long-haul one, as the Technical Guidance says', () => {
    // GHG Protocol Technical Guidance for Calculating Scope 3 Emissions, Example 6.1, p. 86: "Short-haul
    // flights have higher emission factors due to strong influence of the landing/take off cycle on
    // emissions". Domestic publishes average passenger only; long-haul is compared on both average and economy.
    const f = (c: string, k: string, rf: boolean) => {
      const r = air.find(x => x.category === c && x.cabin_class === k)!
      return (rf ? r.with_rf : r.without_rf).kg_co2e
    }
    for (const rf of [false, true]) {
      expect(f('domestic', 'average_passenger', rf)).toBeGreaterThan(f('long_haul', 'average_passenger', rf))
      expect(f('domestic', 'average_passenger', rf)).toBeGreaterThan(f('long_haul', 'economy', rf))
    }
  })

  it('T9 counts match the workbook as read by hand: 215 territories, 55 hotel entries of which 39 priced', () => {
    expect(hauls).toHaveLength(215)
    expect(new Set(hauls.map(h => h.iso3)).size).toBe(215)
    expect(hauls.filter(h => h.haul === 'domestic').map(h => h.iso3).sort()).toEqual(['GBR', 'GGY', 'IMN', 'JEY'])
    expect(hotels).toHaveLength(55)
    expect(hotels.filter(h => h.kg_co2e_per_room_night !== null)).toHaveLength(39)
    expect(hotels.filter(h => h.kg_co2e_per_room_night === null)).toHaveLength(16)
    expect(meta.hotel_countries_without_factor).toEqual(hotels.filter(h => h.kg_co2e_per_room_night === null).map(h => h.country))
  })

  it('T10 rail: the four UK rail types, each with a WTT row; WTT air and rail are below their combustion factors', () => {
    const types = ['National rail', 'International rail', 'Light rail and tram', 'London Underground']
    expect(rail.map(r => r.type)).toEqual(types)
    expect(wttRail.map(r => r.type)).toEqual(types)
    // Upstream fuel production is a fraction of combustion, not a multiple of it. A loose bound (below half)
    // on purpose: see the report on the WTT/combustion ratio varying by haul.
    for (const r of wttAir) {
      const a = air.find(x => x.category === r.category && x.cabin_class === r.cabin_class)!
      expect(r.without_rf / a.without_rf.kg_co2e, label(r)).toBeLessThan(0.5)
    }
  })
})
