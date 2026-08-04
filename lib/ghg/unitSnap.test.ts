import { describe, it, expect } from 'vitest'
import {
  UNIT_FIELDS, snapUnitsForCountry, emptyLocation,
  ngUnitOptions, propaneUnitOptions, liquidUnitOptions, steamUnitOptions,
} from './engine'

// ── The unit a location STORES must be one its country actually OFFERS ──────────────────────────
//
// Two lists have to agree: the *UnitOptions functions the selectors render from, and whatever sets
// the unit when a location's country changes. When they disagree the stored unit STRANDS — the
// selector shows only the units the new country offers, the stored one is not among them, so the
// button row renders nothing selected while the label and the emission factor still follow the old
// unit. The customer has no control on screen able to correct it.
//
// This is what that agreement is enforced by. It is not a comment asking two lists to be kept in
// step; snapUnitsForCountry derives from UNIT_FIELDS, and these tests fail if anything falls out.

// Every country the wizard can hold. 'US' and '' are the default branch; the rest each have at
// least one option list that treats them specially.
const COUNTRIES = [
  '', 'US', 'CA', 'GB', 'UK', 'AU', 'NZ',
  // EU_COUNTRIES in full — an option list that special-cases the bloc must do so for all of them.
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'EL', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // Not a country the lists know — must still resolve to something offerable, never undefined.
  'ZZ',
]

// Every unit value that exists anywhere across all fuels, so each field is tested against units it
// should reject as well as ones it should keep.
const ALL_UNITS = ['mcf', 'therms', 'mmbtu', 'm3', 'kwh', 'gallons', 'litres', 'kg', 'gj']

describe('a stored unit is always one its country offers', () => {
  it.each(COUNTRIES)('country %s — every fuel snaps to an offered unit', country => {
    for (const f of UNIT_FIELDS) {
      const offered = f.options(country).map(([v]) => v)

      // Start from every unit any fuel uses, including ones this country does not offer.
      for (const held of [...ALL_UNITS, undefined]) {
        const snapped = snapUnitsForCountry(country, { [f.field]: held })[f.field]

        expect(offered, `\n\n${f.label} offers NO units for country "${country}".\n` +
          `Every fuel must offer at least one unit in every country, or a location there has no valid\n` +
          `state to be in.\n\nTO FIX: give ${f.list}() a fallback branch that returns at least one option.\n`,
        ).not.toHaveLength(0)

        expect(offered.includes(snapped),
          `\n\nA ${f.label} location in country "${country}" would STORE the unit "${snapped}",\n` +
          `but ${f.list}("${country}") only offers: ${offered.join(', ')}.\n\n` +
          `WHAT THIS MEANS: the unit selector renders only the offered units, so the stored one shows\n` +
          `as nothing selected — while the field label and the emission factor still follow "${snapped}".\n` +
          `The customer sees three things disagree and has no control able to fix it.\n\n` +
          `TO FIX: this is snapUnitsForCountry disagreeing with ${f.list}. Both derive from UNIT_FIELDS\n` +
          `in lib/ghg/engine.ts — check the entry for "${f.field}" points at the right option list.\n` +
          `(started from held unit: ${held ?? 'undefined'})\n`,
        ).toBe(true)
      }
    }
  })

  it('keeps a unit the country still offers rather than resetting it', () => {
    // A US location on litres must not be flipped to gallons: both are offered, so the customer's
    // choice stands. Resetting valid choices is how a silent figure change happens.
    expect(snapUnitsForCountry('US', { diesel_stationary_unit: 'litres' }).diesel_stationary_unit).toBe('litres')
    expect(snapUnitsForCountry('US', { fuel_oil_unit: 'litres' }).fuel_oil_unit).toBe('litres')
    expect(snapUnitsForCountry('US', { purchased_steam_unit: 'gj' }).purchased_steam_unit).toBe('gj')
  })

  it('moves a US unit off a metric location', () => {
    const uk = snapUnitsForCountry('GB', {
      fuel_oil_unit: 'gallons', diesel_stationary_unit: 'gallons',
      gasoline_unit: 'gallons', diesel_mobile_unit: 'gallons',
      propane_unit: 'gallons', purchased_steam_unit: 'mmbtu', natural_gas_unit: 'mcf',
    })
    expect(uk).toEqual({
      natural_gas_unit: 'kwh', propane_unit: 'litres', diesel_stationary_unit: 'litres',
      fuel_oil_unit: 'litres', gasoline_unit: 'litres', diesel_mobile_unit: 'litres',
      purchased_steam_unit: 'gj',
    })
  })

  it('honours the jurisdiction exceptions rather than assuming metric means litres', () => {
    // NZ publishes LPG per kg (MfE), so propane is kg there — not litres like its neighbours.
    expect(snapUnitsForCountry('NZ', { propane_unit: 'litres' }).propane_unit).toBe('kg')
    // Canada offers Mcf alongside m³, so an Mcf figure survives a move to Canada.
    expect(snapUnitsForCountry('CA', { natural_gas_unit: 'mcf' }).natural_gas_unit).toBe('mcf')
  })
})

describe('the registry covers every fuel that has a unit', () => {
  it('every *_unit field on a Location has a UNIT_FIELDS entry', () => {
    // emptyLocation is the shape a real location takes, so its keys are the authority on which
    // fields exist. A fuel added with a unit but no registry entry is never snapped at all — the
    // exact omission that stranded fuel oil and steam.
    const onLocation = Object.keys(emptyLocation('1', 'Test')).filter(k => k.endsWith('_unit')).sort()
    const registered = UNIT_FIELDS.map(f => f.field).slice().sort()

    const missing = onLocation.filter(k => !registered.includes(k as never))
    expect(missing,
      `\n\nThese fields hold a unit but have no entry in UNIT_FIELDS:\n` +
      missing.map(m => `    ${m}`).join('\n') +
      `\n\nWHAT THIS MEANS: nothing snaps them when a location's country changes, so the stored unit\n` +
      `can be one the country does not offer — the selector shows nothing selected and the customer\n` +
      `cannot correct it.\n\nTO FIX: add an entry to UNIT_FIELDS in lib/ghg/engine.ts naming the option\n` +
      `list that governs the field. Snapping and this test then cover it automatically.\n`,
    ).toEqual([])

    const orphaned = registered.filter(k => !onLocation.includes(k))
    expect(orphaned,
      `\n\nUNIT_FIELDS names fields that no longer exist on a Location:\n` +
      orphaned.map(o => `    ${o}`).join('\n') +
      `\n\nTO FIX: remove the entry, or correct the spelling against emptyLocation.\n`,
    ).toEqual([])
  })

  it('each registry entry points at a real option list', () => {
    const lists: Record<string, unknown> = {
      ngUnitOptions, propaneUnitOptions, liquidUnitOptions, steamUnitOptions,
    }
    for (const f of UNIT_FIELDS) {
      expect(lists[f.list], `UNIT_FIELDS entry "${f.field}" names list "${f.list}", which is not exported from engine.ts`).toBe(f.options)
    }
  })
})
