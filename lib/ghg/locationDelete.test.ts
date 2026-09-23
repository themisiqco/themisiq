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
  locationDeleteFacts, type LocationDeleteFacts,
} from './locationDeleteCopy'
import { DECLARABLE_STREAMS } from './engine'

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

// ── THE SHAPES THE WIZARD ACTUALLY PRODUCES ─────────────────────────────────────────────────────
//
// ⚠️ THESE START FROM A Location, NOT FROM A HAND BUILT FACTS OBJECT, AND THAT IS THE WHOLE POINT.
// The first version of this file built every fixture from the copy function's own parameter list, so
// each one had either everything or nothing. A location carrying nine attestations and no figures at
// all was never passed through, and that is the commonest shape there is: one click of "Attest all
// remaining as absent" writes all nine. It reached the preview saying a site with no figures had
// emissions. A fixture that cannot occur proves nothing about the product.

/** Added, never opened on the energy step. No answers, no figures, no documents. */
const untouched = () => loc({ id: 'u', name: 'Location 2' })

/** Opened, every stream answered absent, nothing entered. One click of Attest all does this. */
const attestedOnly = () => loc({
  id: 'b', name: 'BLANK',
  stream_attestations: DECLARABLE_STREAMS.map(stream => ({ stream, attested_at: '2026-09-23T00:00:00Z' })) as never,
})

/** A working location: figures, a document, and the attestations for the streams it does not use. */
const working = () => loc({
  id: 'w', name: 'Chicago Warehouse', country: 'US', grid_region: 'US_FL',
  has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf', electricity_kwh: 5000,
  stream_attestations: DECLARABLE_STREAMS.filter(x => x !== 'natural_gas' && x !== 'electricity')
    .map(stream => ({ stream, attested_at: '2026-09-23T00:00:00Z' })) as never,
  source_docs: [{ id: 'd1', file_name: 'b.pdf', document_type: 'utility_bill_gas', file_path: 'p/d1', uploaded_at: '2025-01-01', extracted: [] }] as never,
})

describe('the confirmation, for the shapes the wizard produces', () => {
  it('an attested location with no figures says no total changes, and claims no emissions', () => {
    // ⚠️ THE PREVIEW DEFECT. This read "It has 9 stream attestations. All of it goes, and its
    // emissions leave every total", which said a location with nothing entered had emissions, and
    // counted an answer of "no" as content that goes.
    const t = locationDeleteConfirmation(locationDeleteFacts(attestedOnly()))
    expect(t).toBe(
      'Remove the location BLANK? It holds no figures and no documents, so no total changes.' +
      ' Its 9 streams attested as absent would need attesting again.')
    expect(t, 'it has no emissions to lose').not.toContain('emissions')
    expect(t, 'nothing irrecoverable goes').not.toContain('cannot be undone')
    expect(t, 'an attestation is not a holding').not.toContain('It has')
  })

  it('a location nobody has opened says only that nothing is there', () => {
    expect(locationDeleteConfirmation(locationDeleteFacts(untouched()))).toBe(
      'Remove the location Location 2? It holds no figures and no documents, so no total changes.')
  })

  it('a working location names its holdings, its consequences and its answers separately', () => {
    const t = locationDeleteConfirmation(locationDeleteFacts(working()))
    expect(t).toContain('It has 1 uploaded document and figures for natural gas and purchased electricity.')
    expect(t).toContain('Its emissions leave every total and the uploaded documents are deleted from storage straight away.')
    expect(t).toContain('This cannot be undone.')
    // ⚠️ THE ATTESTATION CLAUSE IS ABSENT HERE, DELIBERATELY. It used to arrive after "This cannot
    // be undone", so the last thing read before deciding was the one item that can be recreated,
    // beside files being destroyed. It belongs only where attestations are all the location holds.
    expect(t, 'no attestation clause beside destroyed documents').not.toContain('attested as absent')
    expect(t.endsWith('This cannot be undone.'), t).toBe(true)
  })

  it('the emissions clause appears only where figures do', () => {
    // Derived, not fixed text. A location with a document and no figure has nothing in any total.
    const docOnly = loc({ id: 'd', name: 'Doc Only', source_docs: [{ id: 'd1', file_name: 'b.pdf', document_type: 'utility_bill_gas', file_path: 'p/d1', uploaded_at: '2025-01-01', extracted: [] }] as never })
    const t = locationDeleteConfirmation(locationDeleteFacts(docOnly))
    expect(t).toContain('It has 1 uploaded document.')
    expect(t, 'no figures, so no emissions').not.toContain('emissions')
    expect(t).toContain('The uploaded documents are deleted from storage straight away.')
    expect(t).toContain('This cannot be undone.')
  })

  it('counts coverage resolutions for this location only', () => {
    const w = working()
    const t = locationDeleteConfirmation(locationDeleteFacts(w, [
      { locId: 'w' }, { locId: 'w' }, { locId: 'other' },
    ]))
    expect(t).toContain('It has 1 uploaded document, 2 coverage resolutions, and figures for natural gas and purchased electricity.')
  })
})

describe('the confirmation', () => {
  it('names the real counts and omits what is zero', () => {
    const t = locationDeleteConfirmation(facts({
      documents: 3, streamsWithFigures: ['natural_gas', 'electricity'], attestations: 7,
      coverageResolutions: 1,
    }))
    expect(t).toContain('3 uploaded documents')
    expect(t).toContain('figures for natural gas and purchased electricity')
    expect(t, 'an attestation is never counted as a holding').not.toContain('attestation')
    expect(t).toContain('1 coverage resolution')
    expect(t, 'a zero is left out, never printed').not.toMatch(/\b0 /)
    // Singulars, because "1 documents" is the tell that a count was interpolated without thought.
    const one = locationDeleteConfirmation(facts({ documents: 1, attestations: 1, coverageResolutions: 1 }))
    expect(one).toContain('1 uploaded document and 1 coverage resolution')
    expect(one, 'and no attestation clause, because this location holds documents too')
      .not.toContain('attested as absent')
  })

  it('warns only where something of value goes', () => {
    // ⚠️ A WARNING ON EVERY ROW IS A WARNING NOBODY READS by the time it appears on the row holding
    // three years of bills. An empty row destroys nothing, so it is not warned about.
    expect(locationDeleteConfirmation(facts())).toBe(
      'Remove the location Chicago Warehouse? It holds no figures and no documents, so no total changes.')
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

describe('the holdings list punctuation', () => {
  // ⚠️ ONE ITEM OF THIS LIST IS ITSELF A LIST, which is why it needs its own rule. A fully populated
  // location read "...purchased electricity and purchased steam or district heating and 2 coverage
  // resolutions", with nothing to say which "and" closed which list. Two fixes were tried and both
  // made it worse: a comma inside the shared list helper put a second serial comma in the STREAM
  // enumeration, and a comma "whenever an item contains and" put one into a plain pair. The
  // enumeration going last is what fixes it, and these cases are why.
  const withStreams = (streams: number, docs: number, cov: number) => locationDeleteConfirmation(facts({
    name: 'Site', documents: docs, coverageResolutions: cov,
    streamsWithFigures: DECLARABLE_STREAMS.slice(0, streams),
  }))

  it('a plain pair takes no comma', () => {
    expect(withStreams(1, 1, 0)).toContain('It has 1 uploaded document and figures for natural gas.')
  })

  it('a pair whose second item is itself a list still takes no comma', () => {
    // Nothing follows the enumeration, so there is no second boundary to mistake.
    expect(withStreams(2, 1, 0)).toContain(
      'It has 1 uploaded document and figures for natural gas and propane / LPG.')
    expect(withStreams(2, 1, 0)).not.toContain('document, and figures')
  })

  it('three or more take a serial comma, and the enumeration comes last', () => {
    expect(withStreams(1, 1, 1)).toContain(
      'It has 1 uploaded document, 1 coverage resolution, and figures for natural gas.')
    expect(withStreams(2, 1, 1)).toContain(
      'It has 1 uploaded document, 1 coverage resolution, and figures for natural gas and propane / LPG.')
  })

  it('the stream enumeration itself never takes a serial comma', () => {
    // The whole point of putting it last: one "and" inside it, one before it, and no comma inside.
    const t = withStreams(9, 2, 2)
    expect(t).toContain('and figures for natural gas, propane / LPG,')
    expect(t).toContain('purchased electricity and purchased steam or district heating.')
    expect(t, 'no second serial comma inside the enumeration').not.toContain('electricity, and purchased steam')
    expect(t.indexOf('figures for'), 'the enumeration is the last holding').toBeGreaterThan(t.indexOf('coverage resolutions'))
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
