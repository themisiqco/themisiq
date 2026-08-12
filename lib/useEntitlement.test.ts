import { describe, it, expect, vi } from 'vitest'

// accessFromRow is pure and touches none of this. But it LIVES in a module that imports
// ./supabase, which calls createClient() at import time and throws without NEXT_PUBLIC_SUPABASE_*
// — so importing the pure function drags a browser client in with it. Stubbed rather than
// env-faked, because faking the env would build a real client against a fake URL and make the
// failure mode worse the day something in here starts calling it.
//
// The honest fix is to move accessFromRow into its own module with no supabase import, which
// would also let server code use it. That is a larger change than this task, and is flagged
// rather than done.
vi.mock('./supabase', () => ({ supabase: {} }))

import { accessFromRow, type ResolvedAccess } from './useEntitlement'

// The hook cannot be exercised — this repo has no jsdom and no testing-library, so nothing can
// render it. accessFromRow exists so the part that DECIDES is testable anyway: the hook is now a
// fetch plus one call, and every rule below is checked directly rather than described in a
// comment nobody runs.
//
// WHY THIS MATTERS MORE THAN A USUAL UNIT TEST. Before term-awareness, useEntitlementState read
// `!!row` — which is TRUE for an expired customer, because the RLS policy on `entitlements` has
// no term filter and the row is still SELECTable. So the surface said "paying customer" about
// someone the trigger would refuse. The states below are the fix; these are their teeth.

const T0 = new Date('2026-08-11T12:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const row = (term_end: string | null | undefined) => ({ ok: true as const, row: { term_end } })

describe('accessFromRow — the derivation', () => {
  it('term_end in the future → active', () => {
    expect(accessFromRow(row(at(60_000).toISOString()), T0)).toBe('active')
    expect(accessFromRow(row(at(365 * 86_400_000).toISOString()), T0)).toBe('active')
  })

  it('term_end in the past → expired', () => {
    expect(accessFromRow(row(at(-1).toISOString()), T0)).toBe('expired')
    expect(accessFromRow(row(at(-365 * 86_400_000).toISOString()), T0)).toBe('expired')
  })

  // THE BOUNDARY, PINNED AGAINST THE SERVER'S RULE. Both triggers test `term_end > now()`, so an
  // instant equal to term_end is already over. `>=` here would call it active and disagree with
  // the database at the one moment a customer is standing on the line.
  it('term_end EXACTLY now → expired, matching the triggers strict >', () => {
    expect(accessFromRow(row(T0.toISOString()), T0)).toBe('expired')
    expect(accessFromRow(row(T0.toISOString()), T0)).not.toBe('active')
    // One millisecond either side, to show the boundary is where it is claimed to be.
    expect(accessFromRow(row(at(1).toISOString()), T0)).toBe('active')
    expect(accessFromRow(row(at(-1).toISOString()), T0)).toBe('expired')
  })

  it('no row → none', () => {
    expect(accessFromRow({ ok: true, row: null }, T0)).toBe('none')
    expect(accessFromRow({ ok: true, row: undefined }, T0)).toBe('none')
  })

  it('read error → unknown', () => {
    expect(accessFromRow({ ok: false }, T0)).toBe('unknown')
  })

  // A ROW THAT CANNOT BE READ IS NOT A ROW THAT SAYS NO, AND IS NEVER A ROW THAT SAYS YES.
  // 'active' would be the polarity trap this codebase has already been bitten by twice — absence
  // reading as permission is how unpaid users saved unlimited GHG locations. 'expired' would
  // assert a term ran out, which is a claim about a value that was never read.
  it('null / undefined / unparseable term_end → unknown, never active, never expired', () => {
    for (const bad of [null, undefined, '', 'not-a-date', 'yesterday', '2026-13-45T99:99:99Z']) {
      const got = accessFromRow(row(bad), T0)
      expect(`${JSON.stringify(bad)} → ${got}`).toBe(`${JSON.stringify(bad)} → unknown`)
    }
  })

  it('a missing term_end key is treated the same as an explicit null', () => {
    expect(accessFromRow({ ok: true, row: {} }, T0)).toBe('unknown')
  })

  // THE DISTINCTION THE STATE EXISTS FOR. If these ever collapse, a failed read renders
  // "purchase this module" at someone who already owns it — naming a cause that was never
  // established, which is the defect class CLAUDE.md records four instances of.
  it('unknown is NOT none — a failed read and a missing purchase are different answers', () => {
    const failedRead = accessFromRow({ ok: false }, T0)
    const noPurchase = accessFromRow({ ok: true, row: null }, T0)
    expect(failedRead).not.toBe(noPurchase)
    expect(failedRead).toBe('unknown')
    expect(noPurchase).toBe('none')
    // And a row present-but-unreadable is 'unknown' too — it sides with "we do not know",
    // not with "you never bought it".
    expect(accessFromRow(row(null), T0)).toBe('unknown')
    expect(accessFromRow(row(null), T0)).not.toBe(noPurchase)
  })

  it('all four outcomes are reachable — no state is dead', () => {
    const seen = new Set<ResolvedAccess>([
      accessFromRow(row(at(1).toISOString()), T0),
      accessFromRow(row(at(-1).toISOString()), T0),
      accessFromRow({ ok: true, row: null }, T0),
      accessFromRow({ ok: false }, T0),
    ])
    expect([...seen].sort()).toEqual(['active', 'expired', 'none', 'unknown'])
  })

  it('the clock is a parameter, not a hidden call — same row, two clocks, two answers', () => {
    const r = row('2026-08-11T12:00:00.000Z')
    expect(accessFromRow(r, new Date('2026-08-11T11:59:59.999Z'))).toBe('active')
    expect(accessFromRow(r, new Date('2026-08-11T12:00:00.001Z'))).toBe('expired')
  })

  it('offsets and Z spellings of the same instant agree', () => {
    // timestamptz comes back from PostgREST with an offset; the two forms below are one instant,
    // and a derivation that disagreed about them would flip a customer's state on a formatting
    // change alone.
    const now = new Date('2026-08-11T12:00:00.000Z')
    expect(accessFromRow(row('2026-08-11T13:00:00+02:00'), now)).toBe('expired')  // == 11:00Z
    expect(accessFromRow(row('2026-08-11T11:00:00.000Z'), now)).toBe('expired')
    expect(accessFromRow(row('2026-08-11T15:00:00+02:00'), now)).toBe('active')   // == 13:00Z
    expect(accessFromRow(row('2026-08-11T13:00:00.000Z'), now)).toBe('active')
  })
})

describe('isPaid keeps its contract', () => {
  // isPaid is `active || expired` — "a row exists" — because seventeen callers were written
  // against that meaning. This pins the projection so a later edit to accessFromRow cannot
  // silently start walling lapsed customers on all of them at once.
  const isPaid = (a: ResolvedAccess) => a === 'active' || a === 'expired'

  it('true for active AND expired; false for none and unknown', () => {
    expect(isPaid(accessFromRow(row(at(1).toISOString()), T0))).toBe(true)
    expect(isPaid(accessFromRow(row(at(-1).toISOString()), T0))).toBe(true)
    expect(isPaid(accessFromRow({ ok: true, row: null }, T0))).toBe(false)
    expect(isPaid(accessFromRow({ ok: false }, T0))).toBe(false)
  })

  it('fails closed: every non-entitled outcome is false', () => {
    for (const read of [{ ok: false as const }, { ok: true as const, row: null }, row(null), row('junk')]) {
      expect(isPaid(accessFromRow(read, T0))).toBe(false)
    }
  })
})
