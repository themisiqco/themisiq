import { describe, it, expect } from 'vitest'
import {
  modelYearProblem, modelYearValue, untickFleetType, typeHasFigures, untickQuestion, fleetForCountryChange, assignLegacy,
  legacyFleetText, legacyFleetFigures, fleetChangeFor,
} from './fleetForm'
import {
  emptyLocation, calcLocation, findUnresolvedCoverage, fleetAsks, applyUnitOutcomes, unitsForCountryChange, type Location,
} from './engine'

// FI9 diff 3: the fleet block's words and state changes (lib/ghg/fleetForm.ts), tested without a browser.

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const AT = '2026-10-07T12:00:00.000Z'
const NOW = new Date('2026-10-07T12:00:00Z')
const loc = (o: Partial<Location>): Location => ({ ...emptyLocation('L1', 'Depot'), has_mobile: true, ...o })

describe('FI9 diff 3: fleet form', () => {
  it('model year: 1950 to next year, or blank; anything else says why and stores nothing', () => {
    for (const ok of ['', '1950', '2015', '2027']) expect(modelYearProblem(ok, NOW), ok).toBeNull()
    const msg = 'Enter a year between 1950 and 2027, or leave it blank.'
    for (const bad of ['1949', '2028', '15', '20155', 'abcd', '2015.5']) expect(modelYearProblem(bad, NOW), bad).toBe(msg)
    expect([modelYearValue('2015', NOW), modelYearValue('', NOW), modelYearValue('1949', NOW)]).toEqual([2015, undefined, null])
  })

  it('miles are asked at US sites only; equipment type only where the publisher splits non-road (US, EU)', () => {
    expect(fleetAsks({ country: 'US' })).toMatchObject({ miles: true, equipment: { petrol: true, diesel: true } })
    expect(fleetAsks({ country: 'DE' })).toMatchObject({ miles: false, equipment: { petrol: true, diesel: true } })
    for (const c of ['CA', 'GB', 'AU', 'NZ']) expect(fleetAsks({ country: c }), c).toMatchObject({ miles: false, equipment: { petrol: false, diesel: false } })
    expect(fleetAsks({ country: 'JP' })).toMatchObject({ miles: false, equipment: { petrol: false, diesel: false }, publisher: null })
  })

  it('unticking a type with figures asks first; Keep leaves them stored and not counted; Remove clears them', () => {
    const l = loc({ country: 'GB', grid_region: 'UK', fleet_light: true, light_diesel_amount: 500, light_diesel_unit: 'litres', light_model_year: 2018 })
    expect(typeHasFigures(l, 'light')).toBe(true)
    expect(typeHasFigures(l, 'heavy')).toBe(false)
    expect(untickQuestion('light', 'Depot')).toBe('Remove the light vehicle figures at Depot? They are not counted while the type is unticked.')
    const kept = untickFleetType(l, 'light', 'keep')
    expect([kept.fleet_light, kept.light_diesel_amount, kept.light_model_year]).toEqual([false, 500, 2018])
    expect(calcLocation(kept, 'AR6', 2025).s1_mobile).toBe(0)
    const removed = untickFleetType(l, 'light', 'remove')
    expect([removed.fleet_light, removed.light_diesel_amount, removed.light_model_year]).toEqual([false, 0, undefined])
  })

  it('a country change from the US to Canada clears the miles, with a message, after FI5 has moved the units', () => {
    const us = loc({ country: 'US', state: 'TX', fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'gallons',
      light_diesel_miles: 12000, fleet_nonroad: true, nonroad_diesel_amount: 50, nonroad_diesel_unit: 'gallons',
      nonroad_diesel_equipment: 'agriculture' })
    const moved = { ...us, country: 'CA' } as Location
    const after = fleetForCountryChange(applyUnitOutcomes(moved, unitsForCountryChange('CA', moved as never), AT, BY), AT, BY)
    expect(after.light_diesel_miles).toBeUndefined()
    expect(after.nonroad_diesel_equipment, 'ECCC does not split non-road by equipment').toBeUndefined()
    expect(fleetChangeFor(after, 'light_diesel_miles')?.message).toBe('The 12,000 miles entered for diesel in light vehicles at Depot ' +
      'were cleared, because miles are used only at US sites. A site in Canada is priced per unit of fuel.')
    expect(fleetChangeFor(after, 'nonroad_diesel_equipment')?.message).toBe('The equipment type (Agriculture) for diesel in non-road ' +
      'equipment at Depot was cleared, because Environment and Climate Change Canada publishes one non-road factor for every equipment type.')
    expect(after.fleet_changes?.[0]).toMatchObject({ field: 'light_diesel_miles', valueBefore: 12000, at: AT, by: BY })
    // FI5 moved the fleet units with the rest: gallons convert exactly to litres.
    expect(after.light_diesel_unit).toBe('litres')
    expect(after.light_diesel_amount).toBeCloseTo(378.5411784, 9)
    // US to Germany keeps an equipment type (IPCC splits non-road by sector) and still clears the miles.
    const de = fleetForCountryChange({ ...us, country: 'DE' } as Location, AT, BY)
    expect([de.light_diesel_miles, de.nonroad_diesel_equipment]).toEqual([undefined, 'agriculture'])
  })

  it('a legacy figure: the line, the button moves it with who and when, and the export block clears', () => {
    const l = loc({ country: 'CA', province: 'ON', grid_region: 'ON', diesel_mobile_amount: 250, diesel_mobile_unit: 'litres' })
    const [legacy] = legacyFleetFigures(l)
    expect(legacyFleetText(legacy.value, legacy.unit, legacy.fuel)).toBe('250 litres of diesel for vehicles was recorded before vehicle ' +
      'types were asked. Choose the vehicles it was used in.')
    expect(findUnresolvedCoverage([l], 2025, 12, []).map(i => i.status)).toContain('fleet_type_missing')
    const r = assignLegacy(l, 'diesel_mobile_amount', 'heavy', AT, BY)
    if (!('location' in r)) throw new Error(r.refusal)
    const moved = r.location
    expect([moved.diesel_mobile_amount, moved.heavy_diesel_amount, moved.fleet_heavy]).toEqual([0, 250, true])
    expect(moved.fleet_assignments).toEqual([{ from: 'diesel_mobile_amount', to: 'heavy', field: 'heavy_diesel_amount', value: 250,
      unit: 'litres', at: AT, by: BY }])
    expect(findUnresolvedCoverage([moved], 2025, 12, []).map(i => i.status)).not.toContain('fleet_type_missing')
    expect(calcLocation(moved, 'AR6', 2025).s1_mobile).toBeGreaterThan(0)
    // A refusal is said in plain words.
    const refused = assignLegacy({ ...l, fleet_heavy: true, heavy_diesel_amount: 9 }, 'diesel_mobile_amount', 'heavy', AT, BY)
    expect(refused).toEqual({ refusal: 'Heavy vehicles already hold a diesel figure at Depot, so this one was not moved. ' +
      'Change or remove that figure first, or choose another vehicle type.' })
  })
})
