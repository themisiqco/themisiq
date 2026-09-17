import { describe, it, expect } from 'vitest'
import { editRows, type RowEdit } from './rowList'

type R = { id: string; a: string; b: number }
const rows: R[] = [{ id: 'x', a: 'one', b: 1 }, { id: 'y', a: 'two', b: 2 }, { id: 'z', a: 'three', b: 3 }]

/** What React does with queued updaters: each receives the result of the one before. */
const applyInTurn = (start: R[] | undefined, edits: RowEdit<R>[]) => edits.reduce<R[] | undefined>((prev, e) => editRows(prev, e), start)

describe('editRows', () => {
  it('L1 add, remove and update by id, without mutating the input', () => {
    const frozen = Object.freeze(rows.map(r => Object.freeze({ ...r }))) as readonly R[]
    expect(editRows(frozen, { kind: 'add', row: { id: 'w', a: 'four', b: 4 } }).map(r => r.id)).toEqual(['x', 'y', 'z', 'w'])
    expect(editRows(frozen, { kind: 'remove', id: 'y' }).map(r => r.id)).toEqual(['x', 'z'])
    expect(editRows(frozen, { kind: 'update', id: 'y', patch: { b: 20 } })[1]).toEqual({ id: 'y', a: 'two', b: 20 })
    expect(frozen.map(r => r.b)).toEqual([1, 2, 3])
  })

  it('L2 undefined is an empty list, and an unknown id changes nothing', () => {
    expect(editRows<R>(undefined, { kind: 'add', row: { id: 'x', a: '', b: 0 } })).toEqual([{ id: 'x', a: '', b: 0 }])
    expect(editRows<R>(undefined, { kind: 'remove', id: 'x' })).toEqual([])
    expect(editRows(rows, { kind: 'update', id: 'nope', patch: { b: 9 } })).toEqual(rows)
  })

  it('L3 a function patch sees the row as it is when applied', () => {
    const out = applyInTurn(rows, [
      { kind: 'update', id: 'x', patch: { a: 'changed' } },
      { kind: 'update', id: 'x', patch: r => ({ b: r.a === 'changed' ? 100 : -1 }) },
    ])
    expect(out![0]).toEqual({ id: 'x', a: 'changed', b: 100 })
  })

  it('L4 ⚠️ two edits in one tick both survive', () => {
    // The defect this replaced: each edit built from the RENDERED list, so the second overwrote the first.
    const out = applyInTurn(rows, [
      { kind: 'update', id: 'x', patch: { b: 10 } },
      { kind: 'update', id: 'z', patch: { b: 30 } },
      { kind: 'add', row: { id: 'w', a: 'four', b: 4 } },
      { kind: 'add', row: { id: 'v', a: 'five', b: 5 } },
    ])
    expect(out).toEqual([
      { id: 'x', a: 'one', b: 10 }, { id: 'y', a: 'two', b: 2 }, { id: 'z', a: 'three', b: 30 },
      { id: 'w', a: 'four', b: 4 }, { id: 'v', a: 'five', b: 5 },
    ])
  })

  it('L5 two removals in one tick remove the two rows named, not whatever shifted into their places', () => {
    expect(applyInTurn(rows, [{ kind: 'remove', id: 'x' }, { kind: 'remove', id: 'y' }])!.map(r => r.id)).toEqual(['z'])
  })
})
