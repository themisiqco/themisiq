// lib/ghg/removeStored.test.ts
//
// RM1: Remove must not report a failure for a document it has just deleted. A fake bucket and a fake source_docs
// list stand in for Storage and the page's state, so the double call from the preview is reproduced exactly.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { removeStored, type StorageRemoveResult } from './removeStored'
import { REMOVE_DOC_REFUSED } from './uploadRefusal'
import { stripTsComments } from '../testing/stripComments'

/** A bucket holding some paths, that removes what it holds and reports only those (as Storage does), after a tick. */
const bucket = (held: string[], refuse = false) => {
  const objects = new Set(held)
  let calls = 0
  const remove = async (paths: string[]): Promise<StorageRemoveResult> => {
    calls++
    await new Promise(r => setTimeout(r, 5))
    if (refuse) return { data: [], error: null }      // RLS filters the rows: no error, nothing deleted
    const gone = paths.filter(p => objects.delete(p))
    return { data: gone.map(name => ({ name })), error: null }
  }
  return { remove, objects, calls: () => calls }
}

/** The page's document list and error slot, read as they are NOW. */
const page = (docIds: string[]) => {
  const state = { docs: [...docIds], error: null as string | null, drops: 0 }
  return {
    state,
    deps: (docId: string) => ({
      stillListed: () => state.docs.includes(docId),
      drop: () => { state.drops++; state.docs = state.docs.filter(d => d !== docId) },
      onError: (m: string) => { state.error = `That document couldn’t be deleted: ${m}.` },
      onRefused: () => { state.error = REMOVE_DOC_REFUSED },
    }),
  }
}

describe('removing a stored document (RM1)', () => {
  it('a double call while the first is in flight removes once and shows no error', async () => {
    const b = bucket(['u/2025/A/bill.pdf'])
    const p = page(['d1'])
    const inFlight = new Set<string>()
    const call = () => removeStored({ key: 'd1', inFlight, paths: ['u/2025/A/bill.pdf'], remove: b.remove, ...p.deps('d1') })
    const [first, second] = await Promise.all([call(), call()])
    expect([first, second]).toEqual(['removed', 'in_flight'])
    expect(b.calls(), 'storage is asked once').toBe(1)
    expect(p.state.drops).toBe(1)
    expect(p.state.docs).toEqual([])
    expect(p.state.error).toBeNull()
    expect(inFlight.size, 'the guard is released').toBe(0)
  })

  it('a later call for a document an earlier call already removed shows no error', async () => {
    // The preview's sequence without the in-flight guard: the second request reaches Storage after the first
    // deleted the object, so Storage returns an empty list. The document is no longer listed, so it is not a refusal.
    const b = bucket(['u/2025/A/bill.pdf'])
    const p = page(['d1'])
    expect(await removeStored({ key: 'd1', inFlight: new Set(), paths: ['u/2025/A/bill.pdf'], remove: b.remove, ...p.deps('d1') })).toBe('removed')
    expect(await removeStored({ key: 'd1', inFlight: new Set(), paths: ['u/2025/A/bill.pdf'], remove: b.remove, ...p.deps('d1') })).toBe('already_removed')
    expect(p.state.error).toBeNull()
    expect(p.state.drops).toBe(1)
  })

  it('a real refusal (Storage returns nothing and the document is still listed) keeps the message and the document', async () => {
    const b = bucket(['u/2025/A/bill.pdf'], true)
    const p = page(['d1', 'd2'])
    expect(await removeStored({ key: 'd1', inFlight: new Set(), paths: ['u/2025/A/bill.pdf'], remove: b.remove, ...p.deps('d1') })).toBe('refused')
    expect(p.state.error).toBe('That document couldn’t be deleted. It is still attached to this location.')
    expect(p.state.docs).toEqual(['d1', 'd2'])
    expect(p.state.drops).toBe(0)
    expect(b.objects.has('u/2025/A/bill.pdf'), 'storage first: nothing deleted, nothing dropped').toBe(true)
  })

  it('a storage error keeps the document and says so; storage first, the row only after', async () => {
    const p = page(['d1'])
    const outcome = await removeStored({ key: 'd1', inFlight: new Set(), paths: ['x'], ...p.deps('d1'),
      remove: async () => ({ data: null, error: { message: 'network' } }) })
    expect(outcome).toBe('error')
    expect(p.state.error).toBe('That document couldn’t be deleted: network.')
    expect(p.state.docs).toEqual(['d1'])
  })

  it('a location: a second removal of files already gone, for a location no longer listed, says nothing', async () => {
    const b = bucket(['a', 'b'])
    let listed = true
    let alerts = 0
    const run = () => removeStored({ key: 'location-files:L1', inFlight: new Set(), paths: ['a', 'b'], remove: b.remove,
      stillListed: () => listed, drop: () => { listed = false }, onError: () => { alerts++ }, onRefused: () => { alerts++ } })
    expect(await run()).toBe('removed')
    expect(await run()).toBe('already_removed')
    expect(alerts).toBe(0)
  })
})

describe('the page wires it (source)', () => {
  const PAGE = stripTsComments(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8'))
  const body = (fn: string) => PAGE.slice(PAGE.indexOf(fn), PAGE.indexOf(fn) + 2600)

  it('removeDoc ignores a second call, and judges an empty result on the current state', () => {
    const b = body('const removeDoc = async')
    expect(b).toContain('if (removeInFlight.current.has(docId)) return')
    expect(b).toContain('stillListed: () => !!inventoryRef.current.locations.find(l => l.id === locId)?.source_docs.some(d => d.id === docId)')
    expect(b).toContain("setUploadErrors(prev => ({ ...prev, [errorKey]: REMOVE_DOC_REFUSED }))")
    expect(PAGE).toContain('useEffect(() => { inventoryRef.current = inventory }, [inventory])')
  })

  it("a document's Remove control is disabled while its delete is in flight, and so is a location's", () => {
    expect(PAGE).toContain('disabled={removingDocIds.has(doc.id)}')
    expect(PAGE.split('onRemove={removeDoc} removingDocIds={removing}').length - 1, 'every upload slot').toBe(11)
    expect(PAGE).toContain('disabled={removing.has(`location:${loc.id}`)}')
    const loc = body('const removeLocation = async')
    expect(loc).toContain('if (removeInFlight.current.has(key)) return')
    expect(PAGE).toContain('stillListed: () => inventoryRef.current.locations.some(l => l.id === locId)')
  })

  it('no em dash in the new copy', () => {
    for (const s of [REMOVE_DOC_REFUSED, 'Removing…']) expect(s).not.toContain('\u2014')
    expect(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')).toContain("'Removing…'")
  })
})
