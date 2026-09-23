import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyLocation, calcGas, pickEF, getGridFactor, isResolvedGridRegion,
  findUnpriceableLocations, type Location,
} from './engine'
import { buildMonthlyEmissions } from './monthlyEmissions'
import { factorEditionsForSave, buildFactorEditions } from './factorEditions'
import { editRows } from '../rowList'
import {
  locationDeleteConfirmation, locationDeleteSaveFailed, locationDeleteStorageFailed,
  type LocationDeleteFacts,
} from './locationDeleteCopy'

// ── REMOVING A LOCATION, AND WHAT MUST NOT BE LEFT BEHIND ───────────────────────────────────────
//
// A location owns figures, uploaded files in a storage bucket, attestations, and coverage
// resolutions held one level up on the inventory. Three of those four are reachable only through
// the location itself, so dropping the row without them leaves data nothing can find again.

const loc = (o: Partial<Location> = {}): Location => ({ ...emptyLocation('L1', 'Site'), ...o })
const facts = (o: Partial<LocationDeleteFacts> = {}): LocationDeleteFacts => ({
  name: 'Chicago Warehouse', documents: 0, streamsWithFigures: [], attestations: 0,
  coverageResolutions: 0, ...o,
})
const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')

describe('the confirmation', () => {
  it('names the real counts and omits what is zero', () => {
    const t = locationDeleteConfirmation(facts({
      documents: 3, streamsWithFigures: ['natural_gas', 'electricity'], attestations: 7,
      coverageResolutions: 1,
    }))
    expect(t).toContain('3 uploaded documents')
    expect(t).toContain('figures for natural gas and purchased electricity')
    expect(t).toContain('7 stream attestations')
    expect(t).toContain('1 coverage resolution')
    expect(t, 'a zero is left out, never printed').not.toMatch(/\b0 /)
    // Singulars, because "1 documents" is the tell that a count was interpolated without thought.
    const one = locationDeleteConfirmation(facts({ documents: 1, attestations: 1, coverageResolutions: 1 }))
    expect(one).toContain('1 uploaded document,')
    expect(one).toContain('1 stream attestation')
    expect(one).toContain('1 coverage resolution')
  })

  it('warns only where something of value goes', () => {
    // ⚠️ A WARNING ON EVERY ROW IS A WARNING NOBODY READS by the time it appears on the row holding
    // three years of bills. An empty row destroys nothing, so it is not warned about.
    expect(locationDeleteConfirmation(facts())).toBe(
      'Remove the location Chicago Warehouse? It holds no figures and no documents.')
    expect(locationDeleteConfirmation(facts())).not.toContain('cannot be undone')
    expect(locationDeleteConfirmation(facts({ documents: 1 }))).toContain('This cannot be undone.')
    expect(locationDeleteConfirmation(facts({ streamsWithFigures: ['natural_gas'] })))
      .toContain('This cannot be undone.')
  })

  it('says the documents go straight away only when there are documents', () => {
    expect(locationDeleteConfirmation(facts({ documents: 2 })))
      .toContain('deleted from storage straight away')
    expect(locationDeleteConfirmation(facts({ streamsWithFigures: ['natural_gas'] })))
      .not.toContain('storage')
  })

  it('reproduces the location name exactly and never starts a sentence with it', () => {
    for (const name of ['other', 'chicago warehouse', 'ACME plant 2']) {
      const t = locationDeleteConfirmation(facts({ name, documents: 1 }))
      expect(t).toContain(`the location ${name}?`)
      expect(t.startsWith(`Remove the location ${name}? `)).toBe(true)
    }
    // An unnamed row is described, not given a name it does not have on screen.
    expect(locationDeleteConfirmation(facts({ name: '' }))).toContain('this unnamed location')
    expect(locationDeleteConfirmation(facts({ name: '   ' }))).toContain('this unnamed location')
  })

  it('reads as one paragraph, because a native dialog cannot render a break', () => {
    // ⚠️ window.confirm AND window.alert GIVE NO CONTROL OVER LAYOUT. A sentence written around a
    // blank line would arrive as a run of text with its structure missing, so no sentence here
    // contains a newline at all and none depends on one to make sense.
    const all = [
      locationDeleteConfirmation(facts()),
      locationDeleteConfirmation(facts({ documents: 3, streamsWithFigures: ['natural_gas'], attestations: 2, coverageResolutions: 1 })),
      locationDeleteSaveFailed(facts({ documents: 3 }), 'permission denied'),
      locationDeleteSaveFailed(facts(), 'x'),
      locationDeleteStorageFailed(facts({ documents: 1 }), 'network error'),
    ]
    for (const t of all) {
      expect(t, t).not.toContain('\n')
      // Every sentence of OURS ends in a full stop, so the run reads as prose rather than as
      // fragments. The quoted clause is excluded: "The save reported: permission denied" ends the
      // way Supabase wrote it, and adding punctuation to somebody else's message would change what
      // was observed. Same rule as the empty-result reporting note in CLAUDE.md.
      const ours = t.replace(/ (?:The save|Storage) reported: .*$/, '')
      for (const sentence of ours.split(/(?<=[.?]) /)) {
        expect(sentence.trim(), t).toMatch(/[.?]$/)
      }
    }
  })

  it('holds the copy rules, in every sentence this module can produce', () => {
    const all = [
      locationDeleteConfirmation(facts()),
      locationDeleteConfirmation(facts({ documents: 3, streamsWithFigures: ['natural_gas'], attestations: 2, coverageResolutions: 1 })),
      locationDeleteSaveFailed(facts({ documents: 3 }), 'permission denied'),
      locationDeleteSaveFailed(facts(), ''),
      locationDeleteStorageFailed(facts({ documents: 1 }), 'network error'),
    ]
    for (const t of all) {
      expect(t, t).not.toContain('—')
      expect(t, t).not.toContain('’')
      expect(t, t).not.toMatch(/\bstep\s*\d/i)
    }
  })
})

describe('the failure messages', () => {
  it('a failed save says the files are gone and the record still lists them', () => {
    // ⚠️ NOT A GENERIC SAVE ERROR. By this point the bucket, the screen and the stored record are
    // three different accounts of one location. "Save failed, try again" would leave the customer
    // believing nothing had happened, when the irreversible half already has.
    const t = locationDeleteSaveFailed(facts({ documents: 3 }), 'permission denied')
    expect(t).toContain('The location Chicago Warehouse was removed here')
    expect(t).toContain('deleted from storage and cannot be restored')
    expect(t).toContain('the stored inventory still holds this location')
    expect(t).toContain('still lists those documents')
    // ⚠️ SAVING COMPLETES THE REMOVAL, IT DOES NOT REPAIR ANYTHING. An earlier version said "bring
    // the record into line", which describes putting something back, and nothing is coming back.
    expect(t).toContain('Save again and it will be removed there too')
    expect(t, 'no wording that suggests the documents return').not.toContain('into line')
    expect(t).toContain('The save reported: permission denied')
    // With no documents there is nothing irrecoverable, and the sentence does not claim there is.
    expect(locationDeleteSaveFailed(facts(), 'x')).not.toContain('cannot be restored')
  })

  it('a failed storage delete says nothing was changed', () => {
    // The whole reason the handler deletes files first: this case leaves the location exactly as it
    // was, so a customer is never told something is gone while it is still there.
    const t = locationDeleteStorageFailed(facts({ documents: 2 }), 'network error')
    expect(t).toContain('was not removed')
    expect(t).toContain('nothing was changed')
    expect(t).toContain('still here with everything it held')
    expect(t).toContain('Storage reported: network error')
  })
})

describe('the handler', () => {
  it('removes only the named location and only its own coverage resolutions', () => {
    // editRows is the primitive the handler uses; this pins the id-keyed semantics it relies on.
    const a = loc({ id: 'a', name: 'A' }), b = loc({ id: 'b', name: 'B' }), c = loc({ id: 'c', name: 'C' })
    expect(editRows([a, b, c], { kind: 'remove', id: 'b' }).map(l => l.id)).toEqual(['a', 'c'])
    const resolutions = [
      { locId: 'a', fuelType: 'natural_gas' }, { locId: 'b', fuelType: 'natural_gas' },
      { locId: 'b', fuelType: 'electricity' }, { locId: 'c', fuelType: 'natural_gas' },
    ]
    expect(resolutions.filter(r => r.locId !== 'b')).toEqual([resolutions[0], resolutions[3]])
  })

  it('addresses the location by id and edits inside the updater, never by position', () => {
    // ⚠️ THE DEFECT removeDoc ALREADY CARRIES A PARAGRAPH ABOUT. A render-time index is stale the
    // moment a location is added or removed while an async handler runs, and this one awaits
    // storage in the middle. Read from the page source because the hazard is in how the handler is
    // written, not in anything it returns.
    const fn = PAGE.slice(PAGE.indexOf('const removeLocation = async'), PAGE.indexOf('const handleSave'))
    expect(fn).toContain('removeLocation = async (locId: string)')
    expect(fn).toContain("editRows(inv.locations, { kind: 'remove', id: locId })")
    expect(fn, 'the resolutions are filtered inside the updater, from inv')
      .toContain('(inv.coverage_resolutions ?? []).filter(r => r.locId !== locId)')
    expect(fn, 'storage is deleted before the row').toMatch(/storage[\s\S]*remove\(paths\)[\s\S]*editRows/)
    expect(fn, 'a storage failure returns before anything else is touched')
      .toMatch(/locationDeleteStorageFailed[\s\S]{0,80}return/)
  })

  it('sets the selected location explicitly rather than leaving it to the clamp', () => {
    // activeLocation is an index. The clamp keeps it in range while silently pointing it at a
    // different site: remove the second of three and the tab that was Brighton is Manchester, in
    // the same position, with the next figure entered going to the wrong location.
    const fn = PAGE.slice(PAGE.indexOf('const removeLocation = async'), PAGE.indexOf('const handleSave'))
    expect(fn).toContain('setActiveLocation(Math.max(0, removedAt - 1))')
  })

  it('offers no control when a single location remains', () => {
    // Not a disabled control: a title attribute has no reason on a touch device, and a control that
    // refuses without saying why is what the copy rules exist to prevent.
    expect(PAGE).toContain('{inventory.locations.length > 1 && (')
    const fn = PAGE.slice(PAGE.indexOf('const removeLocation = async'), PAGE.indexOf('const handleSave'))
    expect(fn, 'and the handler refuses too, so the guard does not live only in the render')
      .toContain('if (inventory.locations.length <= 1) return')
  })

  it('saves straight after a successful delete, and reports what that save said', () => {
    const fn = PAGE.slice(PAGE.indexOf('const removeLocation = async'), PAGE.indexOf('const handleSave'))
    expect(fn).toContain('await handleSave()')
    expect(fn).toContain('lastSaveError.current')
    expect(fn).toContain('locationDeleteSaveFailed(facts, lastSaveError.current)')
  })
})

describe('what a removal leaves in the database', () => {
  it('no monthly row names a location that is gone', () => {
    // ⚠️ STARTS FROM THE STORED SHAPE, NOT FROM REACT. handleSave deletes every monthly row for the
    // inventory and rebuilds from buildMonthlyEmissions, so the rows are correct by construction
    // rather than by a delete. This asserts the construction: a handler that edited the screen and
    // not the payload would leave the removed location's slices in place on the next save.
    const doc = (id: string, value: number) => ({
      id, file_name: 'b.pdf', document_type: 'utility_bill_gas', file_path: `p/${id}`,
      uploaded_at: '2025-01-01', extracted: [{
        fuelType: 'natural_gas', value, unit: 'mcf', periodStart: '2025-01-01',
        periodEnd: '2025-12-31', status: 'confirmed',
      }],
    })
    const keep = loc({ id: 'keep', name: 'Keep', country: 'US', grid_region: 'US_FL',
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [doc('d1', 1200)] as never })
    const gone = loc({ id: 'gone', name: 'Gone', country: 'US', grid_region: 'US_FL',
      has_natural_gas: true, natural_gas_amount: 500, natural_gas_unit: 'mcf',
      source_docs: [doc('d2', 500)] as never })
    const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion }

    const before = buildMonthlyEmissions([keep, gone], 2025, deps, 'AR6').slices
    expect(before.some(s => s.location_name === 'Gone'), 'the fixture must produce rows for it').toBe(true)

    const after = buildMonthlyEmissions(editRows([keep, gone], { kind: 'remove', id: 'gone' }) as Location[], 2025, deps, 'AR6').slices
    expect(after.some(s => s.location_name === 'Gone')).toBe(false)
    expect(after.length, 'and the survivor keeps its own rows').toBeGreaterThan(0)
  })

  it('KNOWN GAP, NOT FIXED HERE: factor_editions keeps a publisher for a removed location. See location-delete-design.md, the section "factor_editions can name a publisher for a location that is gone"', () => {
    // ⚠️ THIS ASSERTS THE CURRENT BEHAVIOUR AND NAMES IT AS WRONG, rather than failing. The fallback
    // in factorEditionsForSave is load bearing: the column is `not null default '{}'`, so writing {}
    // leaves a value indistinguishable from an inventory saved before the column existed, which that
    // column's own comment calls unrecoverable. Distinguishing "nothing priced" from "never
    // recorded" needs a sentinel or a schema change, so it is its own task, written up in
    // location-delete-design.md. Recorded here so the gap is visible from the code.
    const uk = loc({ id: 'uk', country: 'GB', grid_region: 'UK', electricity_kwh: 5000 })
    const stored = factorEditionsForSave([uk], 2026, null)
    expect(Object.keys(stored).length, 'a priced location records an edition').toBeGreaterThan(0)

    // Remove it, leaving one location that prices nothing. The recompute is empty, so the fallback
    // returns the stored map and the inventory still names a publisher for a location it no longer has.
    const refused = loc({ id: 'jp', country: 'JP' })
    expect(findUnpriceableLocations([refused], 'AR6', 2026).length).toBe(1)
    expect(Object.keys(buildFactorEditions([refused], 2026))).toEqual([])
    expect(factorEditionsForSave([refused], 2026, stored)).toEqual(stored)
  })
})
