import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GHG_STEP_ORDER, GHG_STEP_NAME, ghgStepIndex, ghgHref, scope3Href,
  INVENTORY_NOT_OPENED_SCOPE3, inventoryNotOpenedGhg, scope3LinkState,
} from './moduleLinks'
import { CAT3_GHG_LINKS, CAT3_SAVE_FIRST_HINT, cat3GhgFixes, CAT3_FIX_IN_GHG_HEADING } from './scope3/cat3Copy'
import { cat3InputsFrom } from './scope3/cat3Inputs'
import { priceCat3 } from './scope3/cat3Energy'
import { SCOPE3_FIXTURE_GHG } from './scope3/scope3SurfacesFixture'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const GHG = 'app/dashboard/ghg/page.tsx'
const SCOPE3 = 'app/dashboard/scope3/page.tsx'
const ID = '00000000-0000-4000-8000-000000000001'

describe('the GHG and Scope 3 modules, linked', () => {
  it('ML1 the step names are the wizard\'s own, in its own order', () => {
    // ⚠️ READ FROM THE PAGE, NOT TYPED TWICE. A link opens a step by INDEX, so this list and the page's
    // STEPS must stay in lock-step; if a step is inserted, this fails rather than opening the wrong one.
    const declared = /const STEPS = \[([^\]]+)\]/.exec(read(GHG))
    expect(declared, 'the wizard still declares STEPS').toBeTruthy()
    const steps = [...declared![1].matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(steps).toEqual(GHG_STEP_ORDER.map(s => GHG_STEP_NAME[s]))
    expect(GHG_STEP_ORDER).toHaveLength(steps.length)
    // Every name resolves to its own index, and nothing else does.
    GHG_STEP_ORDER.forEach((name, i) => expect(ghgStepIndex(name), name).toBe(i))
    for (const junk of ['', null, undefined, 'Energy & fuel data', 'energy ', '2', 'step2'])
      expect(ghgStepIndex(junk), String(junk)).toBeNull()
  })

  it('ML2 the URLs name the inventory and the step, and encode what they are given', () => {
    expect(ghgHref(ID, 'energy')).toBe(`/dashboard/ghg?id=${ID}&step=energy`)
    expect(scope3Href(ID)).toBe(`/dashboard/scope3?inventoryId=${ID}&from=ghg`)
    expect(ghgHref('a b&c=d', 'review')).toBe('/dashboard/ghg?id=a%20b%26c%3Dd&step=review')
    // Both pages read exactly these parameter names.
    expect(read(GHG)).toContain("searchParams.get('step')")
    expect(read(GHG)).toContain("searchParams.get('id')")
    expect(read(SCOPE3)).toContain("params.get('inventoryId')")
    expect(read(SCOPE3)).toContain("params.get('from')")
  })

  it('ML3 an id that does not open says what was observed, and ends where the page can honour', () => {
    const core = 'That inventory could not be opened with this account. It may have been deleted, or it ' +
      'may belong to a different account. Nothing has been changed.'
    expect(INVENTORY_NOT_OPENED_SCOPE3).toBe(`${core} Pick an inventory below.`)
    expect(inventoryNotOpenedGhg(true)).toBe(`${core} Your saved inventories are listed below; open one of them.`)
    expect(inventoryNotOpenedGhg(false)).toBe(`${core} There are no saved inventories on this account yet, so this is a new one.`)
    // ⚠️ IT NAMES NO CAUSE IT CANNOT SEE. RLS makes "not yours", "never existed" and "deleted" the same
    // empty answer, so the sentence offers them as possibilities and asserts none.
    for (const text of [INVENTORY_NOT_OPENED_SCOPE3, inventoryNotOpenedGhg(true), inventoryNotOpenedGhg(false)]) {
      expect(text).toContain('could not be opened with this account')
      expect(text).toContain('Nothing has been changed')
      expect(text).not.toMatch(/was deleted\b|is not yours|does not exist/)
      expect(text).not.toContain('—')
    }
    // Each page renders its own, and neither renders the other's ending.
    expect(read(SCOPE3)).toContain('INVENTORY_NOT_OPENED_SCOPE3')
    expect(read(SCOPE3)).not.toContain('inventoryNotOpenedGhg')
    expect(read(GHG)).toContain('inventoryNotOpenedGhg(')
    expect(read(GHG)).not.toContain('INVENTORY_NOT_OPENED_SCOPE3')
  })

  it('ML4 the Scope 3 control has three states, and none of them writes or re-binds', () => {
    const unsaved = scope3LinkState(null, false)
    expect(unsaved.kind).toBe('unsaved')
    expect(unsaved.href).toBeNull()
    expect(unsaved.note).toContain('Save this inventory first')
    const open = scope3LinkState(ID, true)
    expect(open).toMatchObject({ kind: 'open', label: 'Open the Scope 3 record for this inventory', href: scope3Href(ID) })
    // ⚠️ "as last saved", NOT "where you left off": the page restores the SAVED record, and anything
    // typed without saving in an earlier session was never stored.
    expect(open.note).toContain('shows it as last saved')
    expect(open.note).not.toContain('where you left off')
    const start = scope3LinkState(ID, false)
    expect(start).toMatchObject({ kind: 'start', label: 'Start Scope 3 for this inventory', href: scope3Href(ID) })
    // ⚠️ BOTH LIVE STATES POINT AT THE SAME URL, WHICH IS WHY NEITHER CAN CREATE A SECOND RECORD OR
    // TOUCH ANOTHER INVENTORY'S: the href names THIS inventory, and the Scope 3 page loads a record by
    // inventory_id and upserts on that column, which the unique constraint backs.
    expect(open.href).toBe(start.href)
    expect(open.href).toContain(ID)
    const s3 = read(SCOPE3)
    expect(s3).toContain(".eq('inventory_id', id)")
    expect(s3).toContain("{ onConflict: 'inventory_id' }")
    // The GHG page reads whether a record exists and never writes to that table.
    const ghg = read(GHG)
    expect(ghg).toContain("supabase.from('scope3_inventories').select('id').eq('inventory_id', id).maybeSingle()")
    expect(ghg).not.toMatch(/from\('scope3_inventories'\)[^\n]*\.(insert|update|upsert|delete)/)
  })

  it('ML5 every Cat 3 link names a real step and is rendered from its constant', () => {
    for (const [key, link] of Object.entries(CAT3_GHG_LINKS)) {
      expect(GHG_STEP_ORDER, `${key} targets a step that exists`).toContain(link.step)
      expect(ghgStepIndex(link.step), key).toBeLessThan(GHG_STEP_ORDER.length)
      expect(link.label.length, key).toBeGreaterThan(8)
      expect(link.label, `${key} names no step number`).not.toMatch(/step \d/i)
      expect(link.label, key).not.toContain('—')
    }
    const s3 = read(SCOPE3)
    // Rendered through one component, from the constants: no label typed in the page.
    expect(s3).toContain('const l = CAT3_GHG_LINKS[link]')
    expect(s3).toContain('{l.label} →')
    for (const link of Object.values(CAT3_GHG_LINKS)) {
      expect(s3.includes(link.label), `${link.label} is typed into the page`).toBe(false)
    }
    expect(s3.includes(CAT3_SAVE_FIRST_HINT), 'the hint is typed into the page').toBe(false)
    expect(s3).toContain('{CAT3_SAVE_FIRST_HINT}')
  })

  it('ML5b no label promises something the page it opens cannot show, and every key is rendered', () => {
    // ⚠️ "See what changed in that inventory" OVERCLAIMED. Review & workings shows the inventory as it
    // stands; there is no before and after on that page, and the fingerprint stores hashes rather than
    // values, so neither module could produce one. A label is a promise about the next screen.
    expect(CAT3_GHG_LINKS.stale.label).toBe("Open that inventory's workings")
    for (const [key, link] of Object.entries(CAT3_GHG_LINKS)) {
      expect(link.label.toLowerCase(), `${key} promises a comparison`)
        .not.toMatch(/what changed|changes|difference|diff\b|compare|comparison|before and after/)
    }

    // ⚠️ AND EVERY KEY IS RENDERED SOMEWHERE. Two entries (country, steamFactor) were designed, agreed
    // and then not rendered: they belong to per-row flags rather than to the category-level notice, and
    // fell out of the build without anyone noticing. A key nobody renders is copy that cannot be read.
    const s3 = read(SCOPE3)
    const rendered = new Set<string>()
    for (const m of s3.matchAll(/link="(\w+)"/g)) rendered.add(m[1])
    for (const m of s3.matchAll(/link:\s*'(\w+)'/g)) rendered.add(m[1])
    // The two row-level ones arrive through cat3GhgFixes rather than as a literal in the page.
    const byFixes = cat3GhgFixes(
      { lines: [{ flags: [{ code: 'country_unresolved' }] }] } as never,
      { skipped: [{ code: 'scope2_not_priced' }] } as never,
    )
    byFixes.forEach(k => rendered.add(k))
    // cat3NoFigure supplies the rest: read its own body, whatever shape each branch takes.
    const copy = read('lib/scope3/cat3Copy.ts')
    const body = copy.slice(copy.indexOf('export function cat3NoFigure('))
    for (const m of body.slice(0, body.indexOf('\n}')).matchAll(/'(\w+)'/g)) rendered.add(m[1])
    for (const key of Object.keys(CAT3_GHG_LINKS)) {
      expect(rendered.has(key), `${key} is in CAT3_GHG_LINKS and is rendered nowhere`).toBe(true)
    }
    expect(s3).toContain('{CAT3_FIX_IN_GHG_HEADING}')
    expect(CAT3_FIX_IN_GHG_HEADING).toBe('Fix in the GHG module:')
  })

  it('ML5c the row-level fixes appear only when the rows call for them', () => {
    const read3 = (w: unknown, l: unknown) => cat3InputsFrom(w, l)
    // The worked example: every country resolves and no steam row was skipped, so no fixes.
    const ok = read3(SCOPE3_FIXTURE_GHG.workings, SCOPE3_FIXTURE_GHG.locations)
    expect(cat3GhgFixes(priceCat3(ok.inputs!), ok)).toEqual([])
    // A location whose country the join cannot answer: the country fix, once, however many lines carry it.
    const unknownCountry = read3(
      SCOPE3_FIXTURE_GHG.workings,
      SCOPE3_FIXTURE_GHG.locations.map(l => ({ ...l, country: '' })),
    )
    expect(cat3GhgFixes(priceCat3(unknownCountry.inputs!), unknownCountry)).toEqual(['country'])
    // ⚠️ A UK STAND-IN AT A KNOWN COUNTRY IS NOT A FIX: it is the method, and no GHG edit removes it.
    const us = read3(SCOPE3_FIXTURE_GHG.workings, SCOPE3_FIXTURE_GHG.locations)
    expect(priceCat3(us.inputs!).lines.some(l => l.flags.some(f => f.code === 'uk_stand_in'))).toBe(true)
    expect(cat3GhgFixes(priceCat3(us.inputs!), us)).not.toContain('country')
  })

  it('ML6 every new link is a plain <a>, because beforeunload does not fire for a client-side route change', () => {
    // ⚠️ THE SAFEGUARD AND THE LINKS ARE ONE DECISION. next/link would navigate without unmounting the
    // document, so the unsaved-changes prompt would never run: the one protection this page has would
    // be stepped around by the links that made it necessary.
    for (const rel of [SCOPE3, GHG]) {
      const src = read(rel)
      expect(src, `${rel} must not import next/link`).not.toMatch(/from 'next\/link'/)
      expect(src, `${rel} must not render <Link`).not.toMatch(/<Link[\s>]/)
    }
    // The Scope 3 page has the prompt, keyed on the same state the Save button reads.
    const s3 = read(SCOPE3)
    expect(s3).toContain("window.addEventListener('beforeunload', handler)")
    expect(s3).toContain('if (!boundInventoryId || showSaved) return')
    // And the links themselves are anchors built from the shared href.
    expect(s3).toContain('<a href={ghgHref(boundInventoryId, l.step as GhgStep)}')
    expect(read(GHG)).toContain('<a href={state.href}')
  })

  it('ML7 a dead ?id= is cleared from the URL, so the next save cannot create a new inventory', () => {
    // ⚠️ THE DEFECT THIS CLOSES: the wizard opened blank with the dead id still in the address bar, and
    // Save draft then INSERTED a new inventory, because the save reads `inventoryId` state and not the
    // URL. Nothing tied the two together and nothing said the link had failed.
    const ghg = read(GHG)
    expect(ghg).toContain('setLoadError(inventoryNotOpenedGhg(')
    expect(ghg).toContain("router.replace(list && list.length > 0 ? '/dashboard/ghg?view=list' : '/dashboard/ghg')")
    // The sentence is shown in both places that redirect can land: the list and the blank wizard.
    expect([...ghg.matchAll(/\{loadError\}/g)]).toHaveLength(2)
    // The step is applied only after the row loaded, and an unknown name opens at the first step.
    const loadBlock = ghg.slice(ghg.indexOf('if (!data) {'), ghg.indexOf('const updateLocation'))
    expect(loadBlock).toContain("const wanted = ghgStepIndex(searchParams.get('step'))")
    expect(loadBlock).toContain('if (wanted !== null) setStep(wanted)')
    expect(loadBlock.indexOf('setInventory(')).toBeLessThan(loadBlock.indexOf('ghgStepIndex'))
  })
})
