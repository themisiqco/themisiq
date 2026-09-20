import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cat3InputsFrom } from './cat3Inputs'
import { priceCat3 } from './cat3Energy'
import { cat3Fingerprint, cat3FingerprintChange, cat3FingerprintMoved, isCat3Fingerprint } from './cat3Fingerprint'
import { cat3StaleNotice } from './cat3Copy'
import { SCOPE3_FIXTURE_GHG } from './scope3SurfacesFixture'
import { buildWorkings, emptyLocation, type Location } from '../ghg/engine'

// ── TASK 7: THE FINGERPRINT AND THE STALENESS NOTICE ─────────────────────────────────────────────
//
// The saved Category 3 figure is the only figure in the product computed from data another module owns,
// so it is the only one that can go stale while the screen stays right.

const PAGE = join(__dirname, '../../app/dashboard/scope3/page.tsx')
const fpOf = (workings: unknown, locations: unknown) =>
  cat3Fingerprint(cat3InputsFrom(workings, locations).inputs)
const worked = () => fpOf(SCOPE3_FIXTURE_GHG.workings, SCOPE3_FIXTURE_GHG.locations)
/** A workings row or a location as a test edits it: fixture data, loosely typed on purpose. */
type Editable = Record<string, unknown>
/** The fixture's rows and locations, deep-copied so a test can edit one without touching the others. */
const copy = (): { w: Editable[]; l: Editable[] } =>
  JSON.parse(JSON.stringify({ w: SCOPE3_FIXTURE_GHG.workings, l: SCOPE3_FIXTURE_GHG.locations }))

describe('Category 3 fingerprint', () => {
  it('FP1 the same inventory read twice is the same value, whatever order the rows arrive in', () => {
    const a = worked()
    // FIVE activity rows behind the nine priced lines: the UK site's electricity and gas, the US site's
    // electricity, gas and mobile diesel. Electricity is one row and three lines.
    expect(a.rows).toHaveLength(5)
    expect(cat3Fingerprint(cat3InputsFrom(SCOPE3_FIXTURE_GHG.workings, SCOPE3_FIXTURE_GHG.locations).inputs))
      .toEqual(a)
    // Re-ordered workings, same fingerprint: a save that rewrites the inventory without changing it
    // must not report itself as a change.
    const { w, l } = copy()
    expect(fpOf([...w].reverse(), [...l].reverse())).toEqual(a)
    // And nothing changed means nothing to say.
    expect(cat3FingerprintMoved(cat3FingerprintChange(a, fpOf(w, l)))).toBe(false)
  })

  it('FP2 it moves when a value, a unit, a country or a location name changes, and names the row', () => {
    const before = worked()
    const cases: [string, (c: { w: Editable[]; l: Editable[] }) => void, { location: string; stream: string }][] = [
      ['the activity figure', c => { c.w[2].activity_data = 50_001 }, { location: 'UK site', stream: 'natural_gas' }],
      ['the unit', c => { c.w[5].activity_unit = 'litres' }, { location: 'US site', stream: 'mobile_diesel' }],
      ['the country', c => { c.l[1].country = 'FR' }, { location: 'US site', stream: 'electricity' }],
    ]
    for (const [what, edit, expected] of cases) {
      const c = copy(); edit(c)
      const change = cat3FingerprintChange(before, fpOf(c.w, c.l))!
      expect(cat3FingerprintMoved(change), what).toBe(true)
      expect(change.changed, what).toContainEqual(expected)
      expect(change.added, what).toEqual([])
      expect(change.removed, what).toEqual([])
    }
    // A LOCATION RENAME is a row leaving and a row arriving, because the name is the row's identity.
    const c = copy()
    c.w.forEach(r => { if (r.location === 'UK site') r.location = 'Bristol site' })
    c.l[0].name = 'Bristol site'
    const renamed = cat3FingerprintChange(before, fpOf(c.w, c.l))!
    expect(renamed.removed).toContainEqual({ location: 'UK site', stream: 'electricity' })
    expect(renamed.added).toContainEqual({ location: 'Bristol site', stream: 'electricity' })
    expect(renamed.changed).toEqual([])
  })

  it('FP3 an edit to a GHG field Category 3 does not read leaves it exactly where it was', () => {
    // ⚠️ THE FIELD USED IS `entry_method`, changed from 'manual' to 'concierge' on every row, plus the
    // market-based electricity row's activity and the GHG row's own result_tco2e. None of the three is
    // an input to a Category 3 figure: entry_method says how a figure reached the inventory,
    // result_tco2e is the GHG module's own Scope 1 or 2 answer, and the market-based row is never
    // priced here (the location-based row is the basis). A fingerprint that moved on any of them would
    // tell a customer their Category 3 figure was stale when not one kilogram of it had changed.
    const before = worked()
    const c = copy()
    c.w.forEach(r => { r.entry_method = 'concierge'; r.result_tco2e = Number(r.result_tco2e ?? 0) + 1 })
    const market = c.w.find(r => r.scope2_method === 'market-based')
    expect(market, 'the fixture carries a market-based row').toBeTruthy()
    market!.activity_data = 999_999
    expect(fpOf(c.w, c.l)).toEqual(before)
    expect(cat3FingerprintMoved(cat3FingerprintChange(before, fpOf(c.w, c.l)))).toBe(false)
  })

  it('FP4 case and padding in a unit are not a change; a real unit is', () => {
    const before = worked()
    const c = copy()
    c.w[2].activity_unit = ' KWH '
    expect(fpOf(c.w, c.l), 'a unit is a label, and kWh is kwh').toEqual(before)
    c.w[2].activity_unit = 'm3'
    expect(fpOf(c.w, c.l)).not.toEqual(before)
  })

  it('FP5 the three load cases have stated behaviour, and none of them guesses', () => {
    const now = worked()
    // (a) No stored fingerprint: a record saved before this field existed. No comparison, no notice.
    expect(cat3FingerprintChange(undefined, now)).toBeNull()
    expect(cat3FingerprintChange(null, now)).toBeNull()
    // A shape this version cannot read is the same answer, not a claim of change.
    expect(cat3FingerprintChange({ version: 2, rows: [] }, now)).toBeNull()
    expect(cat3FingerprintChange('a string', now)).toBeNull()
    expect(cat3FingerprintChange({ version: 1, rows: [{ location: 'x' }] }, now)).toBeNull()
    expect(isCat3Fingerprint({ version: 1, rows: [] })).toBe(true)

    // (b) The inventory can no longer be read at all. The fingerprint of nothing is an empty list, so a
    // comparison would report every row as removed; the page does not run one (cat3Read.reason), and
    // this is the assertion that the empty-inventory fingerprint is not mistaken for a change of data.
    for (const [w, l] of [[null, []], [[{ location: 'A', foo: 1 }], []], [[{ location: 'A', activity_data: 1, activity_unit: 'kWh', scope: 2 }], null]] as const) {
      const read = cat3InputsFrom(w, l)
      expect(read.reason, 'this is an unreadable inventory').not.toBeNull()
      expect(cat3Fingerprint(read.inputs)).toEqual({ version: 1, rows: [] })
    }
    const page = readFileSync(PAGE, 'utf8')
    expect(page, 'the page must not compare when it could not read the inventory')
      .toContain('const cat3Change = cat3Read.reason ? null')

    // (c) Withheld, and zero. Both still have a fingerprint, and it is the activity they were computed
    // from: a withheld category has rows it refused to price, a zero has none.
    const attest = (used: string[]) => ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate',
      'fuel_oil_residual', 'mobile', 'refrigerants', 'electricity', 'purchased_steam']
      .filter(x => !used.includes(x)).map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' }))
    const withheld = cat3InputsFrom(SCOPE3_FIXTURE_GHG.workings,
      SCOPE3_FIXTURE_GHG.locations.map(l => ({ ...l, stream_attestations: [] })))
    expect(priceCat3(withheld.inputs!).status).toBe('withheld')
    expect(cat3Fingerprint(withheld.inputs)).toEqual(worked())  // the activity is the same activity
    const zero = cat3InputsFrom(
      ['natural_gas', 'electricity'].map(stream => ({ location: 'Office', stream, source: 'Declaration',
        scope: 1, activity_data: 0, activity_unit: '—', declaration: 'attested_absent',
        gwp_basis: 'declaration', result_tco2e: null })),
      [{ id: 'o', name: 'Office', country: 'GB', stream_attestations: attest([]) }])
    expect(priceCat3(zero.inputs!).status).toBe('zero')
    expect(cat3Fingerprint(zero.inputs)).toEqual({ version: 1, rows: [] })
    // A record saved when it held energy, re-opened once every meter is gone: every row is reported gone.
    const gone = cat3FingerprintChange(worked(), cat3Fingerprint(zero.inputs))!
    expect(gone.removed).toHaveLength(5)
    expect(gone.changed).toEqual([])
    expect(gone.added).toEqual([])
  })

  it('FP6 the engine\'s own workings produce a stable fingerprint, and a changed meter moves it', () => {
    // Through buildWorkings itself, not a hand-written fixture: the shape this reads is the engine's.
    const loc = (over: Partial<Location>): Location => ({
      ...emptyLocation(String(over.id), String(over.name)), ...over,
      stream_attestations: ['propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
        'mobile', 'refrigerants', 'purchased_steam'].map(stream => ({ stream, attested_at: 'x' })) as Location['stream_attestations'],
    })
    const site = (kwh: number) => loc({ id: 'l1', name: 'Plant', country: 'GB', grid_region: 'UK',
      electricity_kwh: kwh, has_natural_gas: true, natural_gas_amount: 1_000, natural_gas_unit: 'kwh' })
    const at = (kwh: number) => cat3Fingerprint(cat3InputsFrom(buildWorkings([site(kwh)], 'AR6', 2026, [], 12), [site(kwh)]).inputs)
    expect(at(100_000)).toEqual(at(100_000))
    const change = cat3FingerprintChange(at(100_000), at(120_000))!
    expect(change.changed).toEqual([{ location: 'Plant', stream: 'electricity' }])
  })

  it('FP7 the notice is built in cat3Copy.ts, names the rows and claims nothing about the figures', () => {
    const notice = cat3StaleNotice({
      changed: [{ location: 'UK site', stream: 'electricity' }],
      added: [{ location: 'Depot', stream: 'mobile_diesel' }],
      removed: [{ location: 'Old site', stream: 'purchased_steam' }],
    })
    expect(notice).toContain('changed at UK site (electricity)')
    expect(notice).toContain('now also holds Depot (diesel (mobile))')
    expect(notice).toContain('no longer holds Old site (purchased heat and steam)')
    expect(notice).toContain('Save again to store the current figure')
    // ⚠️ IT SAYS WHAT IT CANNOT SAY. The fingerprint stores a hash, so the old values are not knowable.
    expect(notice).toContain('What changed in each row is not recorded here, only that it did')
    // ⚠️ THE RENAME CLAUSE, ON THE ONLY SHAPE A RENAME CAN MAKE. A site renamed with the same meters on
    // it produces one removal and one addition, which is indistinguishable from data actually moving,
    // so the notice names the possibility instead of asserting a move.
    expect(notice).toContain('A location renamed in the GHG module reads the same way')
    // And it is not said where no row arrived or none left, which cannot be a rename.
    const changedOnly = cat3StaleNotice({ changed: [{ location: 'A', stream: 'electricity' }], added: [], removed: [] })
    expect(changedOnly).not.toContain('renamed')
    const addedOnly = cat3StaleNotice({ changed: [], added: [{ location: 'B', stream: 'propane' }], removed: [] })
    expect(addedOnly).not.toContain('renamed')
    // No figure in it: the fingerprint holds hashes, so there is none to give. ("Category 3" and
    // "Scope 3" carry digits, so the check is for a QUANTITY rather than for any digit at all.)
    expect(notice).not.toMatch(/\d[\d,]*\.\d|\d+\s*(kg|mt|t|kWh|litres|gallons)\b/)
    expect(notice).not.toContain('—')
    // The page renders it from here rather than typing its own.
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toContain('{cat3StaleNotice(cat3Change)}')
    expect(page).not.toContain('has changed since this Category 3 figure was saved')
  })

  it('FP8 the page writes it with the figure, restores it on load, and clears the notice on a save that worked', () => {
    const page = readFileSync(PAGE, 'utf8')
    // Written into cat_data.cat3, per Q6: no migration, no new column.
    expect(page).toContain('cat3: { ...(catData.cat3 ?? {}), source_fingerprint: cat3FingerprintNow }')
    expect(page).toContain('const cat3FingerprintNow = cat3Fingerprint(cat3Read.inputs)')
    // Restored from the saved record when an inventory is bound.
    expect(page).toContain("setSavedCat3Fingerprint((s3.cat_data as Record<string, CategoryData> | null)?.cat3?.source_fingerprint ?? null)")
    // And replaced on a save that worked, so the notice does not outlive the state it describes.
    expect(page).toContain('setSavedCat3Fingerprint(cat3FingerprintNow)')
    // ⚠️ updated_at IS NEVER CONSULTED for this: it moves when anything in the GHG module is saved, and
    // does not move when a coverage resolution changes what an existing figure resolves to.
    expect(page).not.toMatch(/updated_at[^)]*cat3|cat3[^)]*updated_at/)
  })
})
