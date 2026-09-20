import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  saveErrorText, constraintNameFrom, SAVE_NOTHING_LOST,
  SCOPE3_SAVE_SENTENCES, SCOPE3_SAVE_CODE_SENTENCES,
} from './saveError'
import { catDataForSave } from './savePayload'

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const PAGE = 'app/dashboard/scope3/page.tsx'

/**
 * Every constraint and trigger public.scope3_inventories carries, from the migrations that created
 * them, confirmed against the live database on 20 Sep 2026: three checks, three foreign keys, the
 * primary key, the unique on inventory_id and the sector trigger's SQLSTATE. A new one fails SE2 until
 * someone writes its sentence.
 */
const LIVE_CONSTRAINTS = [
  'scope3_inventories_sector_is_industry',   // 20260914_exiobase_sectors.sql
  'scope3_inventories_country_iso2_format',  // 20260916_scope3_country.sql
  'scope3_inventories_status_check',         // 20260908_..._definition.sql, inline column check
  'scope3_inventories_sector_fkey',          // 20260914
  'scope3_inventories_user_id_fkey',         // 20260908
  'scope3_inventories_inventory_id_fkey',    // 20260908
  'scope3_inventories_inventory_unique',     // 20260908
  'scope3_inventories_pkey',                 // 20260908
]

describe('Scope 3 save errors', () => {
  it('SE1 the reported failure now reads as a sentence, not as a constraint', () => {
    // The exact error from the preview, 20 Sep 2026.
    const error = {
      code: '23514',
      message: 'new row for relation "scope3_inventories" violates check constraint "scope3_inventories_sector_is_industry"',
    }
    expect(constraintNameFrom(error)).toBe('scope3_inventories_sector_is_industry')
    const text = saveErrorText(error)
    expect(text).toBe(SCOPE3_SAVE_SENTENCES.scope3_inventories_sector_is_industry)
    expect(text).toContain('primary sector')
    expect(text).toContain('Open the Setup step')
    // None of the database's own vocabulary survives into it.
    for (const word of ['constraint', 'relation', 'scope3_inventories', 'null', '23514']) {
      expect(text.toLowerCase(), word).not.toContain(word.toLowerCase())
    }
  })

  it('SE2 every constraint and trigger this table carries has a sentence, and every sentence says nothing was saved', () => {
    for (const name of LIVE_CONSTRAINTS) {
      expect(SCOPE3_SAVE_SENTENCES[name], `${name} has no sentence: write one in lib/scope3/saveError.ts`).toBeTruthy()
    }
    expect(Object.keys(SCOPE3_SAVE_SENTENCES).sort()).toEqual([...LIVE_CONSTRAINTS].sort())
    expect(SCOPE3_SAVE_CODE_SENTENCES.PT422, 'the sector trigger').toBeTruthy()
    // ⚠️ THE SAME PROMISE IN EVERY BRANCH. The upsert is one statement, so "nothing was saved" is true
    // of every failure, and a customer must not have to infer it from which sentence they got.
    const all = [...Object.values(SCOPE3_SAVE_SENTENCES), ...Object.values(SCOPE3_SAVE_CODE_SENTENCES),
      saveErrorText({ code: '08006', message: 'connection failure' }), saveErrorText(null)]
    for (const s of all) {
      expect(s, s).toContain(SAVE_NOTHING_LOST)
      expect(s, 'no em-dash in customer text').not.toContain('—')
      expect(s, 'a value was spliced in without one').not.toMatch(/undefined|\[object/)
      // ⚠️ NO SUPPORT ROUTE IS NAMED, BECAUSE THE PRODUCT HAS NONE. "Please send us this message" told a
      // customer to do something with nowhere to do it. A sentence that cannot be acted on says so
      // instead, and says the refusal is recorded.
      for (const route of ['send us', 'contact us', 'support', 'email us', 'get in touch']) {
        expect(s.toLowerCase(), `names a route the product does not have: ${route}`).not.toContain(route)
      }
    }
  })

  it('SE2b the one failure a customer can act on gives them both ways out', () => {
    // A second Scope 3 record against an inventory that already has one. Unlike the other unactionable
    // failures, this has two remedies and they belong in the sentence.
    const text = SCOPE3_SAVE_SENTENCES.scope3_inventories_inventory_unique
    expect(text).toContain('This GHG inventory already has a Scope 3 record')
    expect(text).toContain('open the Scope 3 record already linked to that inventory')
    expect(text).toContain('link this one to a different GHG inventory')
    // Named as the step calls itself, so the instruction points at something they can see.
    expect(text).toContain('Which inventory is this Scope 3 for?')
    expect(readFileSync(join(ROOT, PAGE), 'utf8'), 'the step heading this sentence names')
      .toContain('Which inventory is this Scope 3 for?')
    expect(text, 'it is actionable, so it does not say there is nothing to put right')
      .not.toContain('not something to put right')
  })

  it('SE3 the fallback names no cause, and carries the code so a report can be looked up', () => {
    const unknown = saveErrorText({ code: '08006', message: 'could not connect to server' })
    expect(unknown).toContain('The database refused this save (08006)')
    expect(unknown).toContain('the details of the refusal are recorded for us')
    // ⚠️ THE FABRICATED-DIAGNOSIS WORDS. Aug 2026: "your browser blocked the pop-up" was printed on
    // every successful click, for a cause that had never occurred once.
    for (const word of ['browser', 'network', 'connection', 'permission', 'offline', 'try again', 'timed out']) {
      expect(unknown.toLowerCase(), `the fallback must not name ${word}`).not.toContain(word)
    }
    // And it never repeats what the database said.
    expect(unknown).not.toContain('could not connect to server')
    // An error with nothing in it still produces a sentence rather than "undefined".
    expect(saveErrorText(undefined)).toContain('The database refused this save.')
    expect(saveErrorText({})).toContain(SAVE_NOTHING_LOST)
  })

  it('SE4 the page shows the sentence inline and shows no database message anywhere', () => {
    const page = read(PAGE)
    // ⚠️ NO alert( AT ALL ON THIS PAGE. It had exactly one, and it concatenated error.message.
    expect(page).not.toMatch(/\balert\s*\(/)
    expect(page).not.toMatch(/error\.message/)
    expect(page).toContain("setSaveError(saveErrorText(error))")
    expect(page).toContain("console.error('Scope 3 save failed:', error)")
    // Rendered, and rendered as its own element rather than spliced into another sentence.
    expect(page).toMatch(/\{saveError && \(/)
    expect(page).toContain('{saveError}')
    // Cleared on a save that worked, so it cannot outlive the failure it describes.
    expect(page).toContain('setSaveError(null)')
  })

  it('SE5 the two writes that caused this send NULL or nothing, never a blank string', () => {
    const page = read(PAGE)
    expect(page).toContain('sector: sector || null,')
    expect(page).not.toMatch(/^\s*sector,\s*$/m)
    expect(page).toContain('cat_data: catDataForSave(catData),')

    // The jsonb paths the sector trigger validates: blank drops out, a real code stays, and a category
    // that never had the field is untouched.
    expect(catDataForSave({ cat1: { supplier_sector: '', total_spend: 10 } }))
      .toEqual({ cat1: { total_spend: 10 } })
    expect(catDataForSave({ cat1: { supplier_sector: '   ' } })).toEqual({ cat1: {} })
    expect(catDataForSave({ cat1: { supplier_sector: 'i01.a' } })).toEqual({ cat1: { supplier_sector: 'i01.a' } })
    expect(catDataForSave({ cat15: { portfolio_sector: '' } })).toEqual({ cat15: {} })
    expect(catDataForSave({ cat2: { spend_sector: '' } }), 'no live constraint reads this one')
      .toEqual({ cat2: { spend_sector: '' } })
    expect(catDataForSave({ cat5: { wasteRows: [] } })).toEqual({ cat5: { wasteRows: [] } })
    // The input is not mutated: the page keeps rendering from the state it passed in.
    const held = { cat1: { supplier_sector: '' } }
    catDataForSave(held)
    expect(held).toEqual({ cat1: { supplier_sector: '' } })
  })
})
