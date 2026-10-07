// lib/ghg/displayPolish.test.ts
//
// T10d: one rounding rule for activity quantities on screen; one statement of "nothing is lost"; and a unit
// selector that agrees with the label when the figure comes from documents.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatActivity, ACTIVITY_DP, workingsActivityCell } from './workingsCells'
import { unitOptionsShowing } from './unitLabels'

const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')

describe('display polish (T10d)', () => {
  it('activity quantities: at most three decimals, with thousands separators, the same on every surface', () => {
    expect(ACTIVITY_DP).toBe(3)
    expect(formatActivity(1062.8581140000001)).toBe('1,062.858')
    expect(workingsActivityCell({ activity_data: 6378.098360655738, activity_unit: 'kwh', result_tco2e: 1 })).toBe('6,378.098 kWh')
    expect(PAGE).toContain('{p.value != null ? `${formatActivity(p.value)} ${unitLabel(p.unit, \'\')}` : \'—\'}')
  })

  it('the documents\' unit is shown as the locked selector\'s choice when the country list lacks it', () => {
    const fr: Array<[string, string]> = [['m3', 'm³']]
    expect(unitOptionsShowing(fr, 'kwh', true)).toEqual([['m3', 'm³'], ['kwh', 'kWh']])
    // FI3: a typed figure's held unit is kept too, labelled as not accepted, so the selector never shows another unit.
    expect(unitOptionsShowing(fr, 'kwh', false)).toEqual([['m3', 'm³'], ['kwh', 'kWh (not accepted here)']])
    expect(unitOptionsShowing(fr, 'm3', true), 'already offered').toEqual(fr)
    expect(unitOptionsShowing(fr, 'm3', false), 'already offered').toEqual(fr)
    // FI9 diff 3: the six fleet fields share one call, in the FleetBlock figure render.
    expect((PAGE.match(/unitOptionsShowing\(/g) ?? []).length, 'gas, propane, stationary diesel, heating oil, heavy fuel oil, fleet (six fields, one call), steam').toBe(7)
  })

  it('the live results panel says "nothing is lost" once', () => {
    // FI1: the results panel's blocked state is a country refusal only, so the sentence is said once, plainly;
    // an unpriced line says it in the per-line panel's trailer instead.
    const panel = PAGE.slice(PAGE.indexOf('{refusalResultsHeading(blockedHere.refusal)}'), PAGE.indexOf('{refusalResultsHeading(blockedHere.refusal)}') + 900)
    expect(panel.split("nothing you&apos;ve entered here is lost").length - 1).toBe(1)
    expect(PAGE).not.toContain('factorGapHasCountry')
  })
})
