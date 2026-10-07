// app/dashboard/ghg/_components/FleetTypeChooser.test.tsx
//
// FI9 diff 4: the review chooser for a fleet-fuel reading, and the extraction prompt's rule that the reader never
// supplies the vehicle type. Rendered to static markup, as FleetBlock's tests are.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { FleetTypeChooser } from './ProposalEdits'
import type { ExtractedProposal } from '@/lib/ghg/engine'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const p = (o: Partial<ExtractedProposal> = {}): ExtractedProposal => ({
  fuelType: 'diesel', rawValue: 500, rawUnit: 'litres', value: 500, unit: 'litres', periodStart: null, periodEnd: null,
  deliveryDate: '2025-03-04', confidence: 'high', sourceQuote: '500 litres', notes: null, status: 'extracted', ...o,
})
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()

describe('FleetTypeChooser', () => {
  it('"Vehicles: Light / Heavy / Non-road", none pressed, and the reason Confirm waits', () => {
    const h = renderToStaticMarkup(<FleetTypeChooser p={p()} by={BY} onChoose={() => {}} />)
    expect(text(h)).toBe('Vehicles: Light Heavy Non-road Choose the vehicles this diesel was used in before confirming.')
    expect(h.match(/aria-pressed="true"/g)).toBeNull()
    expect(h.match(/aria-pressed="false"/g)).toHaveLength(3)
  })

  it('a chosen type is pressed and says who chose it and when', () => {
    const h = renderToStaticMarkup(<FleetTypeChooser p={p({ fleetType: 'heavy',
      fleetTypeLog: [{ from: null, to: 'heavy', at: '2026-10-07T09:00:00.000Z', by: BY }] })} by={BY} onChoose={() => {}} />)
    expect(h).toMatch(/aria-pressed="true"[^>]*>Heavy</)
    expect(text(h)).toContain('Vehicle type chosen by jo@acme.example, 7 October 2026.')
    expect(text(h)).not.toContain('before confirming')
  })

  it('signed out, the buttons are disabled, so no choice is made without a name on it', () => {
    expect(renderToStaticMarkup(<FleetTypeChooser p={p()} by={null} onChoose={() => {}} />).match(/disabled=""/g)).toHaveLength(3)
  })
})

describe('extraction prompt (FI9 diff 4)', () => {
  it('tells the reader not to guess the vehicle type, and that a registration is not one', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/concierge/extract/route.ts'), 'utf8')
    expect(route).toContain('7. Do not guess the type of vehicle or equipment a fuel was used in. Mention it in notes only if the document ' +
      'states it plainly (for example "forklift" or "heavy goods vehicle"); a vehicle registration or fleet number is not a vehicle type. ' +
      'The customer chooses the vehicle type at review.')
    // The response shape has no vehicle-type field: the reader cannot set one.
    expect(route).not.toMatch(/"fleetType"|vehicleType/)
  })
})
