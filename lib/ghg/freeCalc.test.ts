import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// lib/drafts.ts (imported by the draft parser) loads the browser Supabase client; nothing here needs it.
vi.mock('../supabase', () => ({ supabase: {} }))

import { validateHold, inventoryFromDraft, inventoryRow, decideClaim, FREE_CALC_MESSAGES, PENDING_TTL_MS, MAX_LOCATIONS, type OwnInventory } from './freeCalc'
import { holdFreeCalc, claimFreeCalc, type ClaimDeps, type HoldDeps, type PendingRow } from './freeCalcService'
import { calcInventory, deriveLocations } from './engine'
import { verifyTurnstile } from '../turnstileVerify'

// LEAD1 L3 (Oct 2026): POST /api/ghg/free-calc/pending and /claim. The route files only wire Supabase; the logic is
// here, driven with fakes. The SQL (M4, M6) is proved by its verify scripts in Supabase; its shape is checked below.

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const NOW = new Date('2026-10-04T12:00:00Z')

const site = { id: '1', name: 'Plant', country: 'US', grid_region: 'US_AVG', electricity_kwh: 120000, has_natural_gas: true, natural_gas_amount: 850, natural_gas_unit: 'therms' }
const draft = (over: Record<string, unknown> = {}) => ({ company_name: 'Acme', reporting_year: 2025, locations: [site], ...over })
const expectedS1 = () => calcInventory(deriveLocations(inventoryFromDraft(draft() as never, 'Acme', NOW)), 'AR6', 2025).s1_total

// ── fakes ──
function claimDeps(over: Partial<ClaimDeps> & { rows?: OwnInventory[]; access?: 'active' | 'expired' | 'none' | 'unknown'; pending?: PendingRow | null } = {}) {
  const writes = { insert: [] as Record<string, unknown>[], replace: [] as Array<{ id: string; row: Record<string, unknown> }>, deleted: [] as string[], profiles: [] as unknown[], emails: [] as Array<{ to: string; subject: string; text: string }> }
  const deps: ClaimDeps = {
    user: { id: 'user-1', email: 'Pat@Example.com' },
    now: NOW,
    getAccess: async () => over.access ?? 'none',
    listOwnInventories: async () => over.rows ?? [],
    resolveCompany: async () => ({ id: 'co-1' }),
    insertInventory: async (row) => { writes.insert.push(row); return { id: 'inv-new' } },
    replaceFreeInventory: async (id, row) => { writes.replace.push({ id, row }); return { updated: 1 } },
    getPendingById: async () => over.pending ?? null,
    latestPending: async () => over.pending ?? null,
    deletePendingForEmail: async (k) => { writes.deleted.push(k) },
    upsertProfile: async (p) => { writes.profiles.push(p) },
    // L5: the saved row read back is the row that was written, with its id.
    readSavedRow: async (id) => {
      const row = writes.replace.find(r => r.id === id)?.row ?? writes.insert[writes.insert.length - 1]
      return row ? ({ ...row, id } as never) : null
    },
    profileFullName: async () => null,
    sendResults: async (to, email) => { writes.emails.push({ to, subject: email.subject, text: email.text }); return { ok: true, id: 'em-1' } },
    siteUrl: 'https://www.themisiq.co',
    ...over,
  }
  return { deps, writes }
}
const pending = (over: Partial<PendingRow> = {}): PendingRow => ({
  id: 'p-1', email: 'pat@example.com', email_key: 'pat@example.com', full_name: 'Pat Lee', company: 'Acme',
  payload: draft(), created_at: '2026-10-04T11:00:00Z', expires_at: '2026-10-05T11:00:00Z', ...over,
})

describe('validateHold (/pending input)', () => {
  it('F1: refuses a bad email, a missing name or company, no calculation, and more than 50 sites', () => {
    const ok = { email: 'pat@example.com', fullName: 'Pat', company: 'Acme', inventory: draft() }
    expect(validateHold(ok).ok).toBe(true)
    expect(validateHold({ ...ok, email: 'not-an-email' })).toMatchObject({ ok: false, code: 'invalid_email', message: FREE_CALC_MESSAGES.invalidEmail })
    expect(validateHold({ ...ok, fullName: '  ' })).toMatchObject({ code: 'missing_name' })
    expect(validateHold({ ...ok, company: '' })).toMatchObject({ code: 'missing_company' })
    expect(validateHold({ ...ok, inventory: {} })).toMatchObject({ code: 'no_calculation' })
    const many = Array.from({ length: MAX_LOCATIONS + 1 }, (_, i) => ({ ...site, id: String(i) }))
    expect(validateHold({ ...ok, inventory: draft({ locations: many }) })).toMatchObject({ code: 'too_large' })
  })
})

describe('inventoryRow: figures recomputed on the server', () => {
  it('F2: client totals in the draft are ignored; the row carries the engine’s figures', () => {
    const tampered = draft({ scope1_total: 999999, scope2_location_total: 999999 })
    const row = inventoryRow(inventoryFromDraft(tampered as never, 'Acme', NOW), 'user-1', 'co-1', true, NOW)
    expect(row.scope1_total).toBeCloseTo(expectedS1(), 6)
    expect(row.scope1_total).not.toBe(999999)
    expect(row.scope2_location_total).not.toBe(999999)
    expect(row.free_tier).toBe(true)
    expect(row.gwp_version).toBe('AR6')
  })
})

describe('decideClaim: never updates a real inventory', () => {
  const real: OwnInventory = { id: 'real-1', company_name: 'Acme', reporting_year: 2025, free_tier: false }
  const free: OwnInventory = { id: 'free-1', company_name: 'Other', reporting_year: 2024, free_tier: true }
  const target = { company_name: 'Acme', reporting_year: 2025 }
  it('F3: the cases', () => {
    expect(decideClaim({ rows: [], target, active: false })).toEqual({ action: 'insert' })
    expect(decideClaim({ rows: [free], target, active: false })).toEqual({ action: 'one_free', free })
    expect(decideClaim({ rows: [free], target, active: false, replaceFreeId: 'free-1' })).toEqual({ action: 'replace_free', id: 'free-1' })
    expect(decideClaim({ rows: [real], target, active: true })).toEqual({ action: 'conflict', existing: real })
    expect(decideClaim({ rows: [real], target, active: false })).toEqual({ action: 'conflict', existing: real })
    expect(decideClaim({ rows: [real, free], target, active: false, replaceFreeId: 'free-1' })).toEqual({ action: 'conflict', existing: real })
    expect(decideClaim({ rows: [free], target, active: true })).toEqual({ action: 'insert' })
  })
})

describe('holdFreeCalc (/pending)', () => {
  const base = (over: Partial<HoldDeps> = {}) => {
    const inserted: unknown[] = []
    const deps: HoldDeps = {
      ip: '1.2.3.4', now: NOW,
      rateLimitOk: async () => true,
      verifyCaptcha: async () => ({ ok: true }),
      insertPending: async (row) => { inserted.push(row); return { id: 'p-1' } },
      purgeExpired: vi.fn(async () => {}),
      ...over,
    }
    return { deps, inserted }
  }
  const body = { email: ' Pat@Example.com ', fullName: 'Pat Lee', company: 'Acme', inventory: draft(), turnstileToken: 't' }

  it('H1: holds the calculation for 24 hours under the normalised email, then purges expired records', async () => {
    const { deps, inserted } = base()
    expect(await holdFreeCalc(body, deps)).toEqual({ status: 200, body: { ok: true, id: 'p-1' } })
    expect(inserted[0]).toMatchObject({ email: 'Pat@Example.com', email_key: 'pat@example.com', full_name: 'Pat Lee', company: 'Acme', ip: '1.2.3.4',
      expires_at: new Date(NOW.getTime() + PENDING_TTL_MS).toISOString() })
    expect(deps.purgeExpired).toHaveBeenCalled()
  })

  it('H2: a filled honeypot is told ok and nothing is stored; rate limits and a failed check refuse', async () => {
    const a = base()
    expect(await holdFreeCalc({ ...body, website: 'http://spam' }, a.deps)).toEqual({ status: 200, body: { ok: true } })
    expect(a.inserted).toHaveLength(0)
    const b = base({ rateLimitOk: async (kind) => kind !== 'email' })
    expect(await holdFreeCalc(body, b.deps)).toMatchObject({ status: 429, body: { code: 'rate_limited', message: FREE_CALC_MESSAGES.rateLimited } })
    const c = base({ verifyCaptcha: async () => ({ ok: false }) })
    expect(await holdFreeCalc(body, c.deps)).toMatchObject({ status: 400, body: { code: 'captcha_failed', message: FREE_CALC_MESSAGES.captchaFailed } })
    expect(b.inserted).toHaveLength(0)
    expect(c.inserted).toHaveLength(0)
  })
})

describe('claimFreeCalc (/claim)', () => {
  it('C1: a pending record for another email is refused, and nothing is written', async () => {
    const { deps, writes } = claimDeps({ pending: pending({ email: 'someone@else.com', email_key: 'someone@else.com' }) })
    expect(await claimFreeCalc({ pendingId: 'p-1' }, deps)).toMatchObject({ status: 403, body: { code: 'email_mismatch', message: FREE_CALC_MESSAGES.emailMismatch } })
    expect(writes.insert).toHaveLength(0)
    expect(writes.deleted).toHaveLength(0)
  })

  it('C2: an expired record is refused; no record says so', async () => {
    const a = claimDeps({ pending: pending({ expires_at: '2026-10-04T11:59:59Z' }) })
    expect(await claimFreeCalc({}, a.deps)).toMatchObject({ status: 410, body: { code: 'expired', message: FREE_CALC_MESSAGES.expired } })
    expect(a.writes.insert).toHaveLength(0)
    const b = claimDeps({ pending: null })
    expect(await claimFreeCalc({}, b.deps)).toMatchObject({ status: 404, body: { code: 'nothing_to_claim' } })
  })

  it('C3: a second free calculation stops with the one-free choice, and nothing is written', async () => {
    const free: OwnInventory = { id: 'free-1', company_name: 'Other', reporting_year: 2024, free_tier: true }
    const { deps, writes } = claimDeps({ rows: [free] })
    const r = await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme' }, deps)
    expect(r).toMatchObject({ status: 409, body: { code: 'one_free', message: 'Your free account keeps one calculation: Other, 2024.', free: { id: 'free-1', company: 'Other', year: 2024 } } })
    expect(writes.insert).toHaveLength(0)
    expect(writes.replace).toHaveLength(0)
  })

  it('C4: the saved figures are recomputed; client totals are ignored', async () => {
    const { deps, writes } = claimDeps()
    await claimFreeCalc({ inventory: draft({ scope1_total: 123456789 }), fullName: 'Pat', company: 'Acme' }, deps)
    expect(writes.insert[0].scope1_total).toBeCloseTo(expectedS1(), 6)
  })

  it('C5: an ACTIVE-plan user with an inventory for the same company and year: conflict, that row untouched', async () => {
    const real: OwnInventory = { id: 'real-1', company_name: 'Acme', reporting_year: 2025, free_tier: false }
    const { deps, writes } = claimDeps({ access: 'active', rows: [real] })
    const r = await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme' }, deps)
    expect(r).toMatchObject({ status: 409, body: { code: 'conflict', message: 'You already have a 2025 inventory for "Acme".', existing: { id: 'real-1' } } })
    expect(writes.insert).toHaveLength(0)
    expect(writes.replace).toHaveLength(0)
  })

  it('C6: an EXPIRED-plan user with an inventory for the same company and year: conflict, that row untouched, even when asking to replace it', async () => {
    const real: OwnInventory = { id: 'real-1', company_name: 'Acme', reporting_year: 2025, free_tier: false }
    const { deps, writes } = claimDeps({ access: 'expired', rows: [real] })
    expect(await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme', replaceFreeId: 'real-1' }, deps))
      .toMatchObject({ status: 409, body: { code: 'conflict' } })
    expect(writes.insert).toHaveLength(0)
    expect(writes.replace).toHaveLength(0)
  })

  it('C7: a successful claim deletes the held record, fills in the profile, and sets free_tier by the plan', async () => {
    const a = claimDeps({ pending: pending() })
    expect(await claimFreeCalc({}, a.deps)).toEqual({ status: 200, body: { ok: true, id: 'inv-new', freeTier: true, emailed: true } })
    expect(a.writes.deleted).toEqual(['pat@example.com'])
    expect(a.writes.insert[0]).toMatchObject({ free_tier: true, company_name: 'Acme', reporting_year: 2025, company_id: 'co-1', user_id: 'user-1' })
    expect(a.writes.profiles[0]).toEqual({ id: 'user-1', email: 'Pat@Example.com', fullName: 'Pat Lee', company: 'Acme', country: 'US' })
    const b = claimDeps({ access: 'active' })
    expect(await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme' }, b.deps)).toMatchObject({ body: { freeTier: false } })
    expect(b.writes.insert[0].free_tier).toBe(false)
  })

  it('C8: "Replace it" updates only the account’s own free row', async () => {
    const free: OwnInventory = { id: 'free-1', company_name: 'Other', reporting_year: 2024, free_tier: true }
    const { deps, writes } = claimDeps({ rows: [free] })
    expect(await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme', replaceFreeId: 'free-1' }, deps)).toMatchObject({ status: 200, body: { id: 'free-1' } })
    expect(writes.replace.map(w => w.id)).toEqual(['free-1'])
    expect(writes.insert).toHaveLength(0)
  })

  it('C9: the database’s plan refusal is shown as written; an unreadable plan writes nothing', async () => {
    const msg = 'Uploading documents needs an active GHG plan.'
    const a = claimDeps({ insertInventory: async () => ({ error: { code: 'PT402', message: msg } }) })
    expect(await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme' }, a.deps)).toMatchObject({ status: 403, body: { code: 'plan_required', message: msg } })
    const b = claimDeps({ access: 'unknown' })
    expect(await claimFreeCalc({ inventory: draft(), fullName: 'Pat', company: 'Acme' }, b.deps)).toMatchObject({ status: 503, body: { code: 'plan_check_failed' } })
    expect(b.writes.insert).toHaveLength(0)
  })
})

describe('verifyTurnstile', () => {
  it('T1: no secret: skipped with one clear log line; a check that cannot be made fails closed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await verifyTurnstile('tok', null, { secret: '', where: 'free-calc/pending' })).toEqual({ ok: true, skipped: true })
    expect(warn.mock.calls[0][0]).toContain('TURNSTILE_SECRET_KEY is not set: Turnstile was NOT verified')
    warn.mockRestore()
    const okFetch = vi.fn(async () => new Response(JSON.stringify({ success: true })))
    expect(await verifyTurnstile('tok', '1.2.3.4', { secret: 's', fetchImpl: okFetch as never })).toEqual({ ok: true, skipped: false })
    const noFetch = vi.fn(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })))
    expect(await verifyTurnstile('tok', null, { secret: 's', fetchImpl: noFetch as never })).toEqual({ ok: false, codes: ['invalid-input-response'] })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = vi.fn(async () => { throw new Error('down') })
    expect(await verifyTurnstile('tok', null, { secret: 's', fetchImpl: down as never })).toEqual({ ok: false, codes: ['siteverify-unreachable'] })
    err.mockRestore()
    expect(await verifyTurnstile(undefined, null, { secret: 's', fetchImpl: okFetch as never })).toEqual({ ok: false, codes: ['missing-input-response'] })
  })
})

describe('route wiring and SQL shape', () => {
  it('W1: /claim writes inventories as the user, replaces only free rows, and uses the service role only for pending and profiles', () => {
    const r = read('app/api/ghg/free-calc/claim/route.ts')
    expect(r).toContain('getAuthedClient(bearerFrom(req))')
    expect(r).toContain(".update(row).eq('id', id).eq('free_tier', true)")
    for (const m of r.matchAll(/admin\.from\('([a-z_]+)'\)/g)) expect(['free_calc_pending', 'profiles']).toContain(m[1])
    expect(r).not.toMatch(/upsert\(/)
  })

  it('W2: M4 is service-role only; M6 never blocks a sign-up and grants authenticated SELECT only', () => {
    const m4 = read('docs/review/patches/L3-M4-free-calc-pending.sql')
    const m6 = read('docs/review/patches/L3-M6-profiles-on-signup.sql')
    // The headers record execution (CLAUDE.md): M4, M6 and both verify scripts were RUN on 4 Oct 2026 (13 and 15 checks
    // passed); the rollbacks were not run.
    for (const s of [m4, m6]) expect(s.split('\n')[2]).toContain('⚠️ RUN 4 Oct 2026')
    expect(read('docs/review/patches/L3-M4-verify.sql')).toContain('all 13 checks passed. DO NOT RUN AGAIN')
    expect(read('docs/review/patches/L3-M6-verify.sql')).toContain('all 15 checks passed. DO NOT RUN AGAIN')
    for (const s of [read('docs/review/patches/L3-M4-rollback.sql'), read('docs/review/patches/L3-M6-rollback.sql')]) {
      expect(s.split('\n')[2]).toContain('⚠️ NOT RUN.')
    }
    expect(m4).toContain('alter table public.free_calc_pending enable row level security;')
    expect(m4).toContain('revoke all on table public.free_calc_pending from public, anon, authenticated;')
    expect(m4).toContain('grant select, insert, delete on table public.free_calc_pending to service_role;')
    expect(m6).toContain("exception when others then\n    -- Never block the sign-up.")
    expect(m6).toContain("raise warning 'handle_new_user: no profile for user % (%: %)'")
    expect(m6).toContain("set search_path = ''")
    expect(m6).toContain('create trigger on_auth_user_created\n  after insert on auth.users')
    expect(m6).toContain('grant select on table public.profiles to authenticated;')
    expect(m6).toContain('grant select, insert, update on table public.profiles to service_role;')
    expect(m6).toContain('where not exists (select 1 from public.profiles p where p.id = u.id)')
  })

  it('W3: the verify scripts cover each rule', () => {
    const v4 = read('docs/review/patches/L3-M4-verify.sql')
    const v6 = read('docs/review/patches/L3-M6-verify.sql')
    for (const c of ["('P4 authenticated cannot read', 'refused 42501'", "('P5 anon cannot write', 'refused 42501'", "('P6 un-normalised email_key refused', 'refused 23514'"]) expect(v4).toContain(c)
    for (const c of ["('S1 free-account sign-up: name|company|source', 'Free Person|Free Co|free_calc'", "('S3 failing profile does not block sign-up', 'user kept, no profile'",
      "('S4 signed in: own profile only', 'own 1, other 0'", "('S5 signed in: cannot write', 'refused 42501'"]) expect(v6).toContain(c)
  })
})
