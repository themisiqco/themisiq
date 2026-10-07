// ── FI9 DIFF 3: THE WIZARD'S FLEET BLOCK, ITS WORDS AND ITS STATE CHANGES ────────────────────────────
//
// Pure. The block (app/dashboard/ghg/_components/FleetBlock.tsx) renders from these, and the page applies the state
// changes, so every sentence and every transition is tested here without a browser. No em dashes: the copy reaches the
// customer.

import {
  FLEET_FIELDS, fleetAsks, legacyFleetFigures, assignLegacyFleet,
  type FleetAssignment, type FleetChange, type FleetFuel, type Location,
} from './engine'
import type { EquipmentType, FleetType } from '../emissionFactors/mobile/types'
import { countryNameEn } from './countryRefusalCopy'
import { unitLabel } from './unitLabels'

export const FLEET_QUESTION = 'Which vehicles use fuel at this site?'
export const FLEET_TICK_LABEL: Readonly<Record<FleetType, string>> = {
  light: 'Light vehicles (cars, vans, utes, light trucks)',
  heavy: 'Heavy vehicles (trucks, buses)',
  non_road: 'Non-road equipment (forklifts, plant, machinery)',
}
/** The group heading under a ticked type, and the button on a legacy figure. */
export const FLEET_TYPE_NAME: Readonly<Record<FleetType, string>> = {
  light: 'Light vehicles', heavy: 'Heavy vehicles', non_road: 'Non-road equipment',
}
/** The type in a sentence ("Remove the light vehicle figures"). */
const FLEET_TYPE_IN_SENTENCE: Readonly<Record<FleetType, string>> = {
  light: 'light vehicle', heavy: 'heavy vehicle', non_road: 'non-road equipment',
}
export const FLEET_FUEL_LABEL: Readonly<Record<FleetFuel, string>> = { diesel: 'Diesel', petrol: 'Petrol' }
export const MODEL_YEAR_LABEL = 'Typical model year (optional)'
export const MODEL_YEAR_HINT =
  'Used to pick the published factor for vehicles of that age. Leave it blank if your vehicles vary widely; we then use ' +
  'the published factor with the highest methane and nitrous oxide for this vehicle type.'
export const MILES_LABEL = 'Miles driven (optional)'
export const MILES_HINT = 'EPA publishes methane and nitrous oxide per mile. Without miles, we count carbon dioxide only and say so.'
export const EQUIPMENT_LABEL = 'Equipment type'
export const EQUIPMENT_OPTIONS: readonly [EquipmentType, string][] = [
  ['industrial_commercial', 'Industrial and commercial (including forklifts)'],
  ['construction_mining', 'Construction and mining'],
  ['agriculture', 'Agriculture'],
  ['forestry', 'Forestry'],
  ['lawn_garden', 'Lawn and garden'],
]

/** The fleet fields of one type, in display order: diesel first, as the brief lists them. */
export const fieldsOf = (type: FleetType) =>
  FLEET_FIELDS.filter(f => f.type === type).sort((a, b) => (a.fuel === b.fuel ? 0 : a.fuel === 'diesel' ? -1 : 1))

const get = (loc: Location, k: keyof Location | undefined) => (k ? (loc as unknown as Record<string, unknown>)[k] : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// ── MODEL YEAR ───────────────────────────────────────────────────────────────────────────────────────

/** The latest model year accepted: next calendar year (a new vehicle can carry next year's model year). */
export const latestModelYear = (now: Date) => now.getFullYear() + 1

/** The message for a typed model year, or null when it is blank or a 4-digit year from 1950 to next year. */
export function modelYearProblem(raw: string, now: Date): string | null {
  const t = raw.trim()
  if (t === '') return null
  const y = Number(t)
  if (/^\d{4}$/.test(t) && y >= 1950 && y <= latestModelYear(now)) return null
  return `Enter a year between 1950 and ${latestModelYear(now)}, or leave it blank.`
}

/** What to store for a typed model year: the year, undefined for blank, or null to leave the stored value alone. */
export function modelYearValue(raw: string, now: Date): number | undefined | null {
  if (raw.trim() === '') return undefined
  return modelYearProblem(raw, now) === null ? Number(raw.trim()) : null
}

// ── TICKS ─────────────────────────────────────────────────────────────────────────────────────────────

export const typeTicked = (loc: Location, type: FleetType) => get(loc, fieldsOf(type)[0].typeSwitch) === true

/** True when any of the type's figures, or its optional answers, hold something. */
export function typeHasFigures(loc: Location, type: FleetType): boolean {
  return fieldsOf(type).some(f => num(get(loc, f.amount)) > 0)
}

/** The question asked before unticking a type that holds figures. */
export const untickQuestion = (type: FleetType, site: string) =>
  `Remove the ${FLEET_TYPE_IN_SENTENCE[type]} figures at ${site}? They are not counted while the type is unticked.`

/**
 * Untick a type. 'keep' leaves its figures stored and only unticks (not counted, as the engine already rules: a fleet
 * figure counts only under its tick). 'remove' clears its figures and its optional answers too.
 */
export function untickFleetType(loc: Location, type: FleetType, mode: 'keep' | 'remove'): Location {
  const next = { ...loc } as unknown as Record<string, unknown>
  const fs = fieldsOf(type)
  next[fs[0].typeSwitch] = false
  if (mode === 'remove') {
    for (const f of fs) {
      next[f.amount] = 0
      for (const k of [f.miles, f.equipment]) if (k) delete next[k]
    }
    if (fs[0].modelYear) delete next[fs[0].modelYear]
  }
  return next as unknown as Location
}

// ── COUNTRY CHANGE ────────────────────────────────────────────────────────────────────────────────────

const fuelWords = (f: FleetFuel) => (f === 'petrol' ? 'petrol' : 'diesel')
const countryWords = (c: string) => {
  const code = (c || '').toUpperCase().trim()
  try { return countryNameEn(code === 'EL' ? 'GR' : code) || code } catch { return code }
}

/**
 * FI9 diff 3, after FI5 has moved the units: the optional fleet answers the new country cannot use are cleared and
 * recorded, with a sentence in FI5's style. Miles leave a site that is no longer in the US; an equipment type leaves a
 * site whose new publisher does not split non-road equipment by type. Figures are FI5's business, not this function's.
 */
export function fleetForCountryChange(loc: Location, at: string, by: FleetChange['by']): Location {
  const asks = fleetAsks(loc)
  const site = loc.name || 'Location'
  const where = countryWords(loc.country)
  const next = { ...loc } as unknown as Record<string, unknown>
  const changes: FleetChange[] = [...(loc.fleet_changes ?? [])]
  for (const f of FLEET_FIELDS) {
    const miles = f.miles ? get(loc, f.miles) : undefined
    if (f.miles && !asks.miles && typeof miles === 'number' && miles > 0) {
      delete next[f.miles]
      changes.push({ field: String(f.miles), valueBefore: miles, at, by, message:
        `The ${miles.toLocaleString('en-US')} miles entered for ${fuelWords(f.fuel)} in ${FLEET_TYPE_IN_SENTENCE[f.type]}s at ${site} ` +
        `were cleared, because miles are used only at US sites. A site in ${where} is priced per unit of fuel.` })
    }
    const eq = f.equipment ? get(loc, f.equipment) : undefined
    if (f.equipment && typeof eq === 'string' && !asks.equipment[f.fuel]) {
      delete next[f.equipment]
      const label = EQUIPMENT_OPTIONS.find(([v]) => v === eq)?.[1] ?? eq
      changes.push({ field: String(f.equipment), valueBefore: eq, at, by, message:
        `The equipment type (${label}) for ${fuelWords(f.fuel)} in non-road equipment at ${site} was cleared, because ` +
        `${asks.publisher ?? 'the publisher for this country'} publishes one non-road factor for every equipment type.` })
    }
  }
  return { ...(next as unknown as Location), ...(changes.length ? { fleet_changes: changes } : {}) }
}

/** The latest cleared-answer message for a field, for the note beside it. */
export const fleetChangeFor = (loc: Location, field: keyof Location | undefined) =>
  field ? (loc.fleet_changes ?? []).filter(c => c.field === String(field)).at(-1) : undefined

// ── LEGACY FIGURES ────────────────────────────────────────────────────────────────────────────────────

/** The line above the fleet block for one figure from the old two fields. */
export const legacyFleetText = (value: number, unit: string, fuel: FleetFuel) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${unitLabel(unit)} of ${fuelWords(fuel)} for vehicles was ` +
  `recorded before vehicle types were asked. Choose the vehicles it was used in.`

/** A refused move, in plain words. */
export function legacyRefusalText(reason: 'nothing_to_move' | 'target_has_figure', to: FleetType, fuel: FleetFuel, site: string): string {
  switch (reason) {
    case 'nothing_to_move': return 'There is no figure here to move.'
    case 'target_has_figure':
      return `${FLEET_TYPE_NAME[to]} already hold a ${fuelWords(fuel)} figure at ${site}, so this one was not moved. ` +
        'Change or remove that figure first, or choose another vehicle type.'
  }
}

/** The button's action: the move, or the reason it was refused. */
export function assignLegacy(
  loc: Location, from: 'gasoline_amount' | 'diesel_mobile_amount', to: FleetType, at: string, by: FleetAssignment['by'],
): { location: Location } | { refusal: string } {
  const r = assignLegacyFleet(loc, from, to, at, by)
  if (r.ok) return { location: r.location }
  return { refusal: legacyRefusalText(r.reason, to, from === 'gasoline_amount' ? 'petrol' : 'diesel', loc.name || 'Location') }
}

export { legacyFleetFigures }
