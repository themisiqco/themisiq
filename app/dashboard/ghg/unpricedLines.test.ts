// app/dashboard/ghg/unpricedLines.test.ts
//
// FI1 diff 2: every unpriced line is explained on screen. Before this, export blocked on an unpriced line and nothing
// on the page said why. The page is one large client component this repo does not render in tests, so these read
// its source, the same way the other page guards do; the engine side (the messages, and each one clearing when its
// input is fixed) is tested in lib/ghg/engine.test.ts "FI1 consumers".

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from '@/lib/testing/stripComments'

const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
const CODE = stripTsComments(PAGE)

describe('the GHG page explains every unpriced line (FI1)', () => {
  it('derives the lines on every render, from the derived locations, so they clear without a save', () => {
    expect(CODE).toContain('const unpricedAll = derivedLocations.flatMap(l => unpricedLines(l))')
    // derivedLocations is a memo of the live inventory, not the saved one.
    expect(CODE).toContain('const derivedLocations = useMemo(() => deriveLocations(inventory), [inventory])')
  })

  it('the step-2 panel lists each line at the location with the engine message, the heading and the trailer', () => {
    expect(CODE).toContain('<UnpricedLinesPanel lines={unpricedAt(loc.id)} />')
    const panel = CODE.slice(CODE.indexOf('function UnpricedLinesPanel('), CODE.indexOf('const unpricedPanelHeading'))
    expect(panel).toContain('{u.message}')
    expect(panel).toContain('{unpricedPanelHeading(lines.length)}')
    expect(panel).toContain('{UNPRICED_PANEL_TRAILER}')
    expect(CODE).toContain(`"One figure at this location can't be calculated yet"`)
  })

  it('each line also shows beside the field that fixes it: every fuel, the refrigerant, and both province selects', () => {
    for (const field of ['natural_gas_amount', 'propane_amount', 'diesel_stationary_amount', 'fuel_oil_distillate_amount',
      'fuel_oil_residual_amount', 'gasoline_amount', 'diesel_mobile_amount', 'refrigerant_purchased_kg']) {
      expect(CODE, field).toContain(`<UnpricedNote line={unpricedFor(loc.id, '${field}')} />`)
    }
    const province = "<UnpricedNote line={unpricedAll.find(u => u.locId === loc.id && u.reason === 'province_missing')} />"
    expect(CODE.split(province).length - 1, 'the step-1 province select and the step-2 region prompt').toBe(2)
    // The note sits inside the refrigerant card, after the type select.
    const refrig = CODE.slice(CODE.indexOf('<Field label="Refrigerant type">'), CODE.indexOf('<Field label="Refrigerant type">') + 1200)
    expect(refrig).toContain("<UnpricedNote line={unpricedFor(loc.id, 'refrigerant_purchased_kg')} />")
  })

  it('the note renders the engine message, and nothing when the line is priced', () => {
    const note = CODE.slice(CODE.indexOf('function UnpricedNote('), CODE.indexOf('function UnpricedLinesPanel('))
    expect(note).toContain('if (!line) return null')
    expect(note).toContain('⚠ {line.message}')
  })

  it('the export gate blocks on the lines and lists each with its message', () => {
    expect(CODE).toContain('const pricingReady = unpricedAll.length === 0 && blockingRefusals.length === 0')
    expect(CODE).toContain('{unpricedAll.map(u => (')
    expect(CODE).toContain('>⚠ {u.message}</div>')
    // The count of issues "explained under its upload" no longer counts these, which are explained elsewhere.
    expect(CODE).toContain('const uploadCoverageIssues = unresolvedCoverage.filter(i => !UNPRICED_STATUSES.has(i.status))')
    expect(CODE).toContain('every figure can be calculated')
  })

  it('the totals note, the live results and the CSV say which lines the figures leave out', () => {
    expect(CODE).toContain("we can't calculate yet (${unpricedAll.map(u => `${u.site}: ${u.source.toLowerCase()}`).join(', ')})")
    expect(CODE).toContain('⚠ Not included above: {unpricedAt(loc.id).map(u => u.source.toLowerCase()).join(\', \')}')
    expect(CODE).toContain("const missing = unpricedAt(loc.id).map(u => `NOT PRICED: ${u.message}`).join(' ')")
  })

  it('the old location-level factor gap is gone from the page', () => {
    for (const gone of ['factorGapLocations', 'factorGapHasCountry', 'unpriceablePanelMessage', 'unpriceableMessage', "kind === 'factor'"]) {
      expect(CODE, gone).not.toContain(gone)
    }
  })

  it('no em dash in the new copy', () => {
    for (const s of [`"One figure at this location can't be calculated yet"`, "Everything else at this location is calculated and included in your totals. Nothing you've entered is lost.",
      'every figure can be calculated', 'Not included above:']) {
      expect(PAGE).toContain(s)
      expect(s).not.toContain('\u2014')
    }
  })
})
