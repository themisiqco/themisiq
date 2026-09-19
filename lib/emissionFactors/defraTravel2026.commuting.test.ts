import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import data from './defraTravel2026.json'

// ── THE CATEGORY 7 TABLES OF defraTravel2026.json ─────────────────────────────────────────────────
//
// Generated, not maintained: python3 scripts/generate-defra-travel.py. The Category 6 tables and their
// fingerprint are pinned by defraTravel2026.test.ts, which is unchanged; these tables have their own.
//
// ⚠️ CT4 TO CT8 DO NOT COME FROM THE GENERATOR'S OWN LOGIC. They test the published numbers against fuel
// chemistry (CT4), against what size and electrification must do to a car's emissions (CT5, CT6), against
// arithmetic the sheet states (CT7), and against DEFRA's own fuel sheets (CT8). A failure there is a finding
// about the data or the reading, not a number to update.

const COMMUTING_SHA256 = '283b55c47e3b87457b4b27f59d35da41694a8d55a93219bc539bde4c3c807277'

type Row = Record<string, unknown>
interface Gas { kg_co2e: number; co2: number; ch4: number; n2o: number }
interface Car extends Gas { size: string; fuel: string; unit: string }
interface WttCar { size: string; fuel: string; kg_co2e: number }

const meta = data.metadata as Row
const cars = data.cars as Car[]
const wttCars = data.wtt_cars as WttCar[]
const guidance = meta.guidance as Record<string, { sheet: string; cell: string; text: string }>
const car = (size: string, fuel: string) => cars.find(c => c.size === size && c.fuel === fuel)
const wtt = (size: string, fuel: string) => wttCars.find(c => c.size === size && c.fuel === fuel)

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Row).sort()) out[k] = sortDeep((value as Row)[k])
    return out
  }
  return value
}

describe('defraTravel2026.json, Category 7 tables', () => {
  it('CT1 the commuting rows match their own pinned fingerprint; the Category 6 fingerprint is unchanged', () => {
    const { cars, wtt_cars, motorbikes, wtt_motorbikes, taxis, wtt_taxis, buses, wtt_buses, homeworking } = data
    const canonical = JSON.stringify(sortDeep({ cars, wtt_cars, motorbikes, wtt_motorbikes, taxis, wtt_taxis, buses, wtt_buses, homeworking }))
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
    expect(digest, 'the Category 7 tables do not match their fingerprint. Regenerate; do not edit.').toBe(COMMUTING_SHA256)
    expect(meta.commuting_fingerprint_sha256).toBe(COMMUTING_SHA256)
    // The Cat 6 digest, exactly as defraTravel2026.test.ts pins it: adding tables did not move it.
    expect(meta.fingerprint_sha256).toBe('164b481fe08447aeed2e812ff87eecb31ddcc2885fec3713c3ca671de71fc5ab')
  })

  it('CT2 what is held: 30 cars (small has no CNG or LPG), each with a WTT row; motorbikes, taxis, buses, homeworking', () => {
    expect(cars).toHaveLength(30)
    const pairs = (rs: { size: string; fuel: string }[]) => rs.map(r => `${r.size}/${r.fuel}`).sort()
    expect(pairs(wttCars)).toEqual(pairs(cars))
    const fuels = ['diesel', 'petrol', 'hybrid', 'cng', 'lpg', 'unknown', 'plug_in_hybrid', 'battery_electric']
    const missing = ['small', 'medium', 'large', 'average'].flatMap(s => fuels.filter(f => !car(s, f)).map(f => `${s}/${f}`))
    expect(missing).toEqual(['small/cng', 'small/lpg'])
    expect((data.motorbikes as Row[]).map(r => r.size)).toEqual(['small', 'medium', 'large', 'average'])
    expect((data.taxis as Row[]).map(r => `${r.type}/${r.basis}`)).toEqual(['regular/passenger_km', 'regular/vehicle_km', 'black_cab/passenger_km', 'black_cab/vehicle_km'])
    expect((data.buses as Row[]).map(r => r.type)).toEqual(['local_not_london', 'local_london', 'average_local', 'coach'])
    expect((data.homeworking as Row[]).map(r => r.component)).toEqual(['office_equipment', 'heating', 'combined'])
    for (const t of ['motorbikes', 'taxis', 'buses'] as const) {
      const key = t === 'motorbikes' ? 'size' : 'type'
      const a = (data[t] as Row[]).map(r => `${r[key]}/${r.basis}`).sort()
      const w = (data[`wtt_${t}` as const] as Row[]).map(r => `${r[key]}/${r.basis}`).sort()
      expect(w, t).toEqual(a)
    }
    // Every value is a positive number: nothing blank was read as zero.
    for (const t of ['cars', 'wtt_cars', 'motorbikes', 'wtt_motorbikes', 'taxis', 'wtt_taxis', 'buses', 'wtt_buses', 'homeworking'] as const) {
      for (const r of data[t] as Row[]) expect(r.kg_co2e as number, `${t} ${JSON.stringify(r).slice(0, 60)}`).toBeGreaterThan(0)
    }
  })

  it('CT3 units: cars and motorbikes per vehicle-km, buses per passenger-km, taxis both, homeworking per FTE hour', () => {
    for (const r of cars) expect(r.unit).toBe('kg CO2e per km (vehicle)')
    for (const r of data.motorbikes as Row[]) expect(r).toMatchObject({ basis: 'vehicle_km', unit: 'kg CO2e per km (vehicle)' })
    for (const r of data.buses as Row[]) expect(r).toMatchObject({ basis: 'passenger_km', unit: 'kg CO2e per passenger.km' })
    for (const r of data.homeworking as Row[]) expect(r.unit).toBe('kg CO2e per FTE working hour')
    // A taxi's vehicle-km factor is above its passenger-km factor: the sheet assumes more than one passenger.
    const tx = data.taxis as (Row & Gas)[]
    for (const type of ['regular', 'black_cab']) {
      const pkm = tx.find(r => r.type === type && r.basis === 'passenger_km')!.kg_co2e
      const vkm = tx.find(r => r.type === type && r.basis === 'vehicle_km')!.kg_co2e
      expect(vkm, type).toBeGreaterThan(pkm)
    }
  })

  it('CT4 magnitude: every petrol and diesel car lies in a band derived from fuel chemistry', () => {
    // ── THE DERIVATION, SO IT CAN BE CHECKED WITHOUT TRUSTING THE CODE ─────────────────────────────
    // CO2 per litre = density x carbon mass fraction x 44.01/12.011 (3.664, CO2 per C). Ranges, not points:
    //   petrol  density 0.720-0.775 kg/L (EN 228), carbon fraction 0.84-0.87 -> 2.22 to 2.47 kg CO2/L
    //   diesel  density 0.820-0.845 kg/L (EN 590), carbon fraction 0.86-0.87 -> 2.58 to 2.69 kg CO2/L
    // Real-world passenger-car fuel use, CC's estimate written down so it can be disputed: 3.5 L/100 km
    // (the most economical small diesels) to 14 L/100 km (large petrol cars in town). The floor is lowered
    // 7% because the sheet's forecourt fuel is a biofuel blend whose biogenic CO2 is outside the scopes; the
    // ceiling is raised 3% for CH4 and N2O.
    const CO2_PER_C = 44.01 / 12.011
    const perLitre = { petrol: [0.720 * 0.84 * CO2_PER_C, 0.775 * 0.87 * CO2_PER_C], diesel: [0.820 * 0.86 * CO2_PER_C, 0.845 * 0.87 * CO2_PER_C] }
    expect(perLitre.petrol[0]).toBeCloseTo(2.22, 2)
    expect(perLitre.diesel[1]).toBeCloseTo(2.69, 2)
    for (const fuel of ['petrol', 'diesel'] as const) {
      const floor = (3.5 / 100) * perLitre[fuel][0] * 0.93
      const ceiling = (14 / 100) * perLitre[fuel][1] * 1.03
      const rows = cars.filter(c => c.fuel === fuel)
      expect(rows).toHaveLength(4)
      for (const r of rows) {
        expect(r.kg_co2e, `${r.size} ${fuel}`).toBeGreaterThanOrEqual(floor)
        expect(r.kg_co2e, `${r.size} ${fuel}`).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  it('CT5 ordering: for petrol and for diesel, small < medium < large', () => {
    for (const fuel of ['petrol', 'diesel']) {
      expect(car('small', fuel)!.kg_co2e, fuel).toBeLessThan(car('medium', fuel)!.kg_co2e)
      expect(car('medium', fuel)!.kg_co2e, fuel).toBeLessThan(car('large', fuel)!.kg_co2e)
    }
  })

  it('CT6 a battery electric car is below every petrol and diesel car of the same size', () => {
    for (const size of ['small', 'medium', 'large', 'average']) {
      const bev = car(size, 'battery_electric')!.kg_co2e
      expect(bev, size).toBeLessThan(car(size, 'petrol')!.kg_co2e)
      expect(bev, size).toBeLessThan(car(size, 'diesel')!.kg_co2e)
    }
  })

  it('CT7 homeworking: combined = office equipment + heating to rounding, and heating is the larger part', () => {
    const hw = Object.fromEntries((data.homeworking as { component: string; kg_co2e: number }[]).map(r => [r.component, r.kg_co2e]))
    // Three figures printed to 5 d.p.: the sum can differ from the printed total by at most 1.5e-5.
    expect(Math.abs(hw.combined - (hw.office_equipment + hw.heating))).toBeLessThanOrEqual(1.5e-5)
    expect(hw.heating).toBeGreaterThan(hw.office_equipment)
    expect(guidance.homeworking_uk_average.text).toBe('●  Conversion factors provided are an average for the UK.')
  })

  it('CT8 well-to-tank as a share of combustion for petrol and diesel cars matches DEFRA\'s own fuel sheets', () => {
    // Per litre of forecourt fuel ('average biofuel blend', which the Fuels sheet A12 says forecourt
    // purchasers should use), read from the committed workbook by hand on 19 Sep 2026:
    //   diesel  WTT- fuels!D71 0.61101 / Fuels!D72 2.58354 = 0.2365
    //   petrol  WTT- fuels!D95 0.58094 / Fuels!D96 2.07500 = 0.2800
    // A car's WTT per km over its combustion per km is the same fuel's ratio, so each car should sit close
    // to it; the car totals also carry CH4 and N2O, and the published car ratios run 1.7% to 2.5% above the
    // fuel ratio. Within 5% on either side.
    const FUEL_RATIO = { diesel: 0.61101 / 2.58354, petrol: 0.58094 / 2.075 }
    for (const fuel of ['diesel', 'petrol'] as const) {
      for (const size of ['small', 'medium', 'large', 'average']) {
        const ratio = wtt(size, fuel)!.kg_co2e / car(size, fuel)!.kg_co2e
        expect(ratio / FUEL_RATIO[fuel], `${size} ${fuel}: ${ratio.toFixed(4)} vs ${FUEL_RATIO[fuel].toFixed(4)}`).toBeGreaterThan(0.95)
        expect(ratio / FUEL_RATIO[fuel], `${size} ${fuel}: ${ratio.toFixed(4)} vs ${FUEL_RATIO[fuel].toFixed(4)}`).toBeLessThan(1.05)
      }
    }
  })

  it('CT9 the guidance is quoted from the cells named for it', () => {
    const at = (k: string) => `${guidance[k].sheet}!${guidance[k].cell}`
    expect({
      homeworking_uk_average: at('homeworking_uk_average'),
      homeworking_example_records: at('homeworking_example_records'),
      homeworking_example_multiply: at('homeworking_example_multiply'),
      homeworking_heating_whole_year: at('homeworking_heating_whole_year'),
      homeworking_method: at('homeworking_method'),
      land_vehicle_vs_passenger_km: at('land_vehicle_vs_passenger_km'),
      land_electric_cars_include_electricity: at('land_electric_cars_include_electricity'),
      passenger_vehicles_scope: at('passenger_vehicles_scope'),
      index_homeworking_updated_annually: at('index_homeworking_updated_annually'),
      index_homeworking_last_updated: at('index_homeworking_last_updated'),
    }).toEqual({
      homeworking_uk_average: 'Homeworking!A11',
      homeworking_example_records: 'Homeworking!A15',
      homeworking_example_multiply: 'Homeworking!A16',
      homeworking_heating_whole_year: 'Homeworking!A17',
      homeworking_method: 'Homeworking!A29',
      land_vehicle_vs_passenger_km: 'Business travel- land!A12',
      land_electric_cars_include_electricity: 'Business travel- land!A14',
      passenger_vehicles_scope: 'Passenger vehicles!A8',
      index_homeworking_updated_annually: 'Index!G51',
      index_homeworking_last_updated: 'Index!H51',
    })
    expect(guidance.land_electric_cars_include_electricity.text).toMatch(/PLUS the emissions from the electricity consumption/)
    expect(guidance.homeworking_method.text).toMatch(/EcoAct, 2020/)
    expect(guidance.index_homeworking_last_updated.text).toMatch(/^Factors last updated in 2022 publication/)
    expect(String(meta.market_segment_note)).toMatch(/Society of Motor Manufacturers and Traders/)
  })
})
