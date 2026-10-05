import { describe, it, expect, vi, afterEach } from 'vitest'

// The storage calls need a browser; the PARSE does not, and the parse is where every decision lives.
// Same split lib/deals/draft.ts and lib/useEntitlement.ts already use.
vi.mock('../supabase', () => ({ supabase: {} }))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseGhgDraft, saveGhgDraft, readGhgDraftOwned, draftBelongsTo } from './draft'

describe('a GHG draft survives the sign-in round trip without carrying rubbish into the wizard', () => {
  // ⚠️ WHAT THIS PROTECTS. handleSave used to return silently with no session, so a visitor who built an
  // inventory and clicked Save lost it. The draft is what makes the bounce to /login non-destructive, and
  // the parse is what stops a hand-edited or stale localStorage value reaching React state.

  it('keeps the scalars it recognises', () => {
    const d = parseGhgDraft({
      company_name: 'Acme', reporting_year: 2026, revenue_millions: 12.5,
      employee_count: 40, boundary_approach: 'equity_share', california_nexus: true,
      fiscal_year_end_month: 3, prior_year_s1: 1, prior_year_s2: 2,
    })
    expect(d).toEqual({
      company_name: 'Acme', reporting_year: 2026, revenue_millions: 12.5,
      employee_count: 40, boundary_approach: 'equity_share', california_nexus: true,
      fiscal_year_end_month: 3, prior_year_s1: 1, prior_year_s2: 2,
    })
  })

  it('drops a field of the wrong type rather than carrying it', () => {
    // The merge puts this OVER the form's defaults, so a dropped field keeps the default. Carrying a
    // string where a number belongs would reach the calculator instead.
    const d = parseGhgDraft({ company_name: 42, reporting_year: '2026', california_nexus: 'yes', employee_count: 40 })
    expect(d).toEqual({ employee_count: 40 })
  })

  it('rejects non-finite numbers, because a blank is coerced to 0 and 0 is a real figure', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(parseGhgDraft({ revenue_millions: bad, company_name: 'x' })).toEqual({ company_name: 'x' })
    }
  })

  it('never restores a company_id: a companies row belongs to one account, a draft to a browser (5 Oct 2026)', () => {
    // null stays null, because "no company row yet" is a state the save path branches on. A stored id comes back as
    // null too: restored under another account it named a row that account cannot use, and Save was refused. Save
    // resolves the company by name for whoever is signed in.
    expect(parseGhgDraft({ company_id: null })).toEqual({ company_id: null })
    expect(parseGhgDraft({ company_id: 'abc' })).toEqual({ company_id: null })
    expect(parseGhgDraft({ company_name: 'Acme', company_id: 'other-accounts-company' })).toEqual({ company_name: 'Acme', company_id: null })
    expect(parseGhgDraft({ company_id: 7 })).toBeNull()      // wrong type, and nothing else recognised
  })

  it('drops selected_frameworks WHOLE if any member is not a string', () => {
    // A number in that list would reach a .includes() and silently fail to match rather than throw, so
    // a partially-valid list is worse than none: the wizard would look configured and export wrongly.
    expect(parseGhgDraft({ selected_frameworks: ['SB 253', 'CDP'] })?.selected_frameworks).toEqual(['SB 253', 'CDP'])
    expect(parseGhgDraft({ selected_frameworks: ['SB 253', 7], company_name: 'x' })).toEqual({ company_name: 'x' })
  })

  describe('locations are the field that can crash the wizard, so they are checked hardest', () => {
    // The page reads inventory.locations[activeLocation] and indexes into the result on every render.
    it('keeps a non-empty array of objects', () => {
      const locs = [{ id: '1', name: 'HQ' }, { id: '2', name: 'Plant' }]
      expect(parseGhgDraft({ locations: locs })?.locations).toEqual(locs)
    })

    it('drops an EMPTY array, which would restore a wizard that throws on paint', () => {
      // Also never something the form produces: it starts with one location and cannot delete the last.
      expect(parseGhgDraft({ locations: [], company_name: 'x' })).toEqual({ company_name: 'x' })
    })

    it('drops an array containing a primitive or a nested array', () => {
      for (const bad of [['a'], [1], [null], [[]], [{ ok: true }, 'a']]) {
        expect(parseGhgDraft({ locations: bad, company_name: 'x' }), JSON.stringify(bad)).toEqual({ company_name: 'x' })
      }
    })
  })

  describe('what counts as "no draft at all"', () => {
    it('rejects non-objects', () => {
      for (const bad of [null, undefined, 'x', 7, true, []]) {
        expect(parseGhgDraft(bad), JSON.stringify(bad) ?? 'undefined').toBeNull()
      }
    })

    it('rejects an object with nothing recognised, including {}', () => {
      // ⚠️ AN EMPTY RESULT MUST BE null, NOT {}. The caller clears the stash after a successful restore,
      // so `{}` would report success, clear the draft and restore nothing — losing the work this whole
      // module exists to keep.
      expect(parseGhgDraft({})).toBeNull()
      expect(parseGhgDraft({ nope: 1, also_nope: 'x' })).toBeNull()
    })

    it('ignores unknown keys instead of carrying them into the save payload', () => {
      // An unknown key riding into React state reaches handleSave's row payload, and Postgres refuses
      // the whole save. An allow-list is the safe direction.
      const d = parseGhgDraft({ company_name: 'Acme', dropped_column: 'x', locations: [{ id: '1' }] })
      expect(Object.keys(d!).sort()).toEqual(['company_name', 'locations'])
    })
  })

  it('a full round trip through JSON keeps every recognised field', () => {
    // The real path is JSON.stringify into localStorage and JSON.parse out, so the parse must survive it.
    const original = {
      company_name: 'Acme', company_id: null, reporting_year: 2026, revenue_millions: 12.5,
      employee_count: 40, boundary_approach: 'operational_control', california_nexus: false,
      fiscal_year_end_month: 12, prior_year_s1: 0, prior_year_s2: 0,
      selected_frameworks: ['SB 253'], locations: [{ id: '1', name: 'HQ' }],
    }
    expect(parseGhgDraft(JSON.parse(JSON.stringify(original)))).toEqual(original)
  })
})

// Drafts record who wrote them (5 Oct 2026): a browser used for several accounts restored one account's figures
// into the next one's form.
describe('draft ownership', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } }
  }
  afterEach(() => { vi.unstubAllGlobals() })

  it('O1: a draft is restored only for the user who wrote it; signed-out and older drafts restore as before', () => {
    expect(draftBelongsTo('user-a', 'user-a')).toBe(true)
    expect(draftBelongsTo('user-a', 'user-b')).toBe(false)
    expect(draftBelongsTo('user-a', null)).toBe(false)      // written signed in, read signed out: not restored
    expect(draftBelongsTo(null, 'user-b')).toBe(true)       // written signed out
    expect(draftBelongsTo(undefined, 'user-b')).toBe(true)  // written before owners were kept
  })

  it('O2: the owner is stored with the draft and read back; an older envelope reads as unknown', () => {
    const storage = mem()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', storage)
    saveGhgDraft({ company_name: 'Acme', company_id: 'co-1' }, { anon: false, owner: 'user-a' })
    expect(readGhgDraftOwned()).toEqual({ draft: { company_name: 'Acme', company_id: null }, owner: 'user-a' })
    saveGhgDraft({ company_name: 'Acme' }, { anon: true, owner: null })
    expect(readGhgDraftOwned()?.owner).toBeNull()
    saveGhgDraft({ company_name: 'Acme' }, { anon: false })
    expect(readGhgDraftOwned()?.owner).toBeUndefined()
  })

  it('O3: the page waits for the session before restoring a draft that names its writer, and clears one that is not theirs', () => {
    const page = readFileSync(join(__dirname, '..', '..', 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain('const stored = readGhgDraftOwned()')
    expect(page).toContain('if (draftBelongsTo(stored.owner, session?.user?.id ?? null)) restore(stored.draft)')
    expect(page).toContain('else { clearGhgDraft(); void proceed() }')
    expect(page).toContain('saveGhgDraft(inventory, { anon: !session, owner: session?.user?.id ?? null })')
    const modal = readFileSync(join(__dirname, '..', '..', 'app/dashboard/ghg/_components/KeepResultsModal.tsx'), 'utf8')
    expect(modal).toContain('saveGhgDraft(claimInventory.current, { anon: false, owner: session?.user?.id ?? null })')
  })
})
