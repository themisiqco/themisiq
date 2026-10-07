// app/dashboard/ghg/_components/FleetBlock.test.tsx
//
// FI9 diff 3: what the fleet block shows, for the cases the brief lists. Rendered to static markup, as FigureInput's
// tests are; the actions are tested in lib/ghg/fleetForm.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { FleetBlock, type FleetBlockProps } from './FleetBlock'
import { emptyLocation, fleetAsks, buildWorkings, type Location } from '@/lib/ghg/engine'
import { legacyFleetFigures } from '@/lib/ghg/fleetForm'

const NOW = new Date('2026-10-07T12:00:00Z')
const loc = (o: Partial<Location>): Location => ({ ...emptyLocation('L1', 'Depot'), has_mobile: true, ...o })
const noop = () => {}
const draw = (l: Location, o: Partial<FleetBlockProps> = {}) => renderToStaticMarkup(
  <FleetBlock loc={l} asks={fleetAsks(l)} now={NOW} figure={(a) => <span data-figure={String(a)} />} legacy={legacyFleetFigures(l)}
    legacyRefusal={null} pendingUntick={null} onTick={noop} onUntickAnswer={noop} onModelYear={noop} onMiles={noop} onEquipment={noop}
    onAssignLegacy={noop} {...o} />)
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

describe('FleetBlock', () => {
  it('the question and the three ticks, none ticked, and no group until one is', () => {
    const h = draw(loc({ country: 'US' }))
    expect(text(h)).toContain('Which vehicles use fuel at this site?')
    for (const label of ['Light vehicles (cars, vans, utes, light trucks)', 'Heavy vehicles (trucks, buses)', 'Non-road equipment (forklifts, plant, machinery)']) {
      expect(text(h)).toContain(label)
    }
    expect(h.match(/type="checkbox"/g)).toHaveLength(3)
    expect(h).not.toContain('checked=""')
    expect(h).not.toContain('data-fleet-group')
  })

  it('one tick shows only that group: Diesel and Petrol inputs and the model year, with its hint', () => {
    const h = draw(loc({ country: 'GB', fleet_light: true }))
    expect(h.match(/data-fleet-group="(\w+)"/g)).toEqual(['data-fleet-group="light"'])
    expect(h).toContain('data-figure="light_diesel_amount"')
    expect(h).toContain('data-figure="light_petrol_amount"')
    expect(text(h)).toContain('Typical model year (optional)')
    expect(text(h)).toContain('Used to pick the published factor for vehicles of that age.')
    expect(text(h)).not.toContain('Miles driven')
  })

  it('a model year outside 1950 to next year says so in place of the hint', () => {
    const h = draw(loc({ country: 'GB', fleet_heavy: true, heavy_model_year: 1900 }))
    expect(text(h)).toContain('Enter a year between 1950 and 2027, or leave it blank.')
    expect(text(h)).not.toContain('Used to pick the published factor')
  })

  it('miles only at a US site, beside a fuel with a figure', () => {
    const us = draw(loc({ country: 'US', fleet_light: true, light_diesel_amount: 100 }))
    expect(us).toContain('name="light_diesel_miles"')
    expect(us).not.toContain('name="light_petrol_miles"')   // no petrol figure
    expect(text(us)).toContain('EPA publishes methane and nitrous oxide per mile. Without miles, we count carbon dioxide only and say so.')
    expect(draw(loc({ country: 'CA', fleet_light: true, light_diesel_amount: 100 }))).not.toContain('_miles"')
  })

  it('equipment type only for US and EU non-road, with no default', () => {
    for (const c of ['US', 'DE']) {
      const h = draw(loc({ country: c, fleet_nonroad: true, nonroad_diesel_amount: 100 }))
      expect(h, c).toContain('name="nonroad_diesel_equipment"')
      expect(h, c).toContain('<option value="" selected="">Choose…</option>')
      expect(text(h), c).toContain('Industrial and commercial (including forklifts)')
      expect(h, c).not.toContain('Typical model year')
    }
    for (const c of ['CA', 'GB', 'AU', 'NZ']) {
      expect(draw(loc({ country: c, fleet_nonroad: true, nonroad_diesel_amount: 100 })), c).not.toContain('_equipment"')
    }
  })

  it('a legacy figure shows its line and three buttons above the block', () => {
    const h = draw(loc({ country: 'US', gasoline_amount: 40, gasoline_unit: 'gallons' }))
    expect(text(h)).toContain('40 US gallons of petrol for vehicles was recorded before vehicle types were asked. Choose the vehicles it was used in.')
    for (const b of ['Light vehicles', 'Heavy vehicles', 'Non-road equipment']) expect(h).toContain(`>${b}</button>`)
    expect(h.indexOf('data-legacy')).toBeLessThan(h.indexOf('Which vehicles use fuel'))
    const refused = draw(loc({ country: 'US', gasoline_amount: 40 }), { legacyRefusal: 'There is no figure here to move.' })
    expect(text(refused)).toContain('There is no figure here to move.')
  })

  it('unticking a type with figures asks, with Remove and Keep', () => {
    const h = draw(loc({ country: 'GB', fleet_light: true, light_diesel_amount: 5 }), { pendingUntick: 'light' })
    expect(text(h)).toContain('Remove the light vehicle figures at Depot? They are not counted while the type is unticked.')
    expect(h).toContain('>Remove</button>')
    expect(h).toContain('>Keep</button>')
  })

  it('results: the row reads "Diesel (light vehicles)" and the US CO2-only sentence is in the note the tables print', () => {
    const rows = buildWorkings([loc({ country: 'US', state: 'NY', fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'gallons' })], 'AR6', 2025, [], 12)
    const r = rows.find(x => x.source === 'Diesel (light vehicles)')!
    expect(r.note).toContain('are not counted because EPA publishes them per mile and no miles were entered. Enter the miles to include them.')
    // The workings and review tables print r.note as text in the cell, not in a title attribute.
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain("{r.note && <div style={{ fontSize: 10, marginTop: 3, lineHeight: 1.4, whiteSpace: 'normal' }}>{r.note}</div>}")
    expect(page).not.toMatch(/title=\{r\.note\}/)
  })
})
