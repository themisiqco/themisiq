import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emailKey } from '../emailKey'
import { isDisposableEmail, DISPOSABLE_DOMAINS, DISPOSABLE_EMAIL_MESSAGE } from '../disposableEmailDomains'
import { validateHold, FREE_CALC_MESSAGES } from './freeCalc'
import { holdFreeCalc, claimFreeCalc, type ClaimDeps, type HoldDeps, type PendingRow } from './freeCalcService'

// LEAD1 L7 (Oct 2026): abuse controls added beside L2, L3 and L5's (docs/review/design-lead1.md section 6).
const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const NOW = new Date('2026-10-05T12:00:00Z')
const draft = { company_name: 'Acme', reporting_year: 2025, locations: [{ id: '1', name: 'HQ', country: 'US', grid_region: 'US_AVG', electricity_kwh: 1000 }] }
const holdBody = (email: string, extra: Record<string, unknown> = {}) => ({ email, fullName: 'Pat', company: 'Acme', inventory: draft, ...extra })

describe('disposable email domains', () => {
  it('AB1: throwaway inboxes, and their subdomains, are refused with the plain sentence', () => {
    for (const e of ['x@mailinator.com', 'x@YOPMAIL.com', 'x@sub.mailinator.com', 'x@guerrillamail.com', 'x@10minutemail.com']) {
      expect(isDisposableEmail(e), e).toBe(true)
      expect(validateHold(holdBody(e))).toEqual({ ok: false, code: 'disposable_email', message: 'Please use your work email.' })
    }
    expect(DISPOSABLE_EMAIL_MESSAGE).toBe('Please use your work email.')
  })

  it('AB2: free webmail and company domains stay allowed', () => {
    for (const e of ['pat@gmail.com', 'pat@googlemail.com', 'pat@outlook.com', 'pat@hotmail.com', 'pat@yahoo.com', 'pat@icloud.com',
      'pat@proton.me', 'pat@protonmail.com', 'pat@aol.com', 'pat@gmx.de', 'pat@acme.com', 'pat@notmailinator.co.uk']) {
      expect(isDisposableEmail(e), e).toBe(false)
      expect(validateHold(holdBody(e)).ok, e).toBe(true)
    }
    for (const d of ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me']) expect(DISPOSABLE_DOMAINS.has(d)).toBe(false)
  })

  it('AB3: the file says how to update the list, and calls nothing over the network', () => {
    const src = read('lib/disposableEmailDomains.ts')
    expect(src).toContain('HOW TO UPDATE:')
    expect(src).not.toMatch(/\bfetch\(|import .* from 'node:(http|https|dns)'/)
  })
})

describe('email_key normalisation', () => {
  it('AB4: lower case, trimmed; +tags dropped everywhere; Gmail dots dropped; googlemail.com read as gmail.com', () => {
    expect(emailKey('  Pat@Acme.COM ')).toBe('pat@acme.com')
    expect(emailKey('pat+calc@acme.com')).toBe('pat@acme.com')
    expect(emailKey('p.a.t@acme.com')).toBe('p.a.t@acme.com')
    expect(emailKey('P.a.t+x@gmail.com')).toBe('pat@gmail.com')
    expect(emailKey('pat.lee@googlemail.com')).toBe('patlee@gmail.com')
    expect(emailKey('+tag@acme.com')).toBe('+tag@acme.com')
    expect(emailKey('not-an-email')).toBe('not-an-email')
    // The pending table's check (email_key = lower(btrim(email_key))) holds for every key.
    for (const e of ['  X.Y+z@GMAIL.com', 'A+b@Example.ORG']) expect(emailKey(e)).toBe(emailKey(e).trim().toLowerCase())
  })

  const holdDeps = (rows: Array<{ email_key: string; payload: unknown }>, seen: Array<[string, string | null]>): HoldDeps => ({
    ip: '198.51.100.1', now: NOW,
    rateLimitOk: async (bucket, key) => { seen.push([bucket, key]); return true },
    verifyCaptcha: async () => ({ ok: true }),
    insertPending: async (row) => { rows.push({ email_key: row.email_key, payload: row.payload }); return { id: 'p-1' } },
    purgeExpired: async () => {},
  })
  const claimDeps = (pending: PendingRow[], over: Partial<ClaimDeps> = {}) => {
    const deleted: string[] = []
    const inserted: unknown[] = []
    const deps: ClaimDeps = {
      user: { id: 'u1', email: 'pat@gmail.com' }, now: NOW,
      getAccess: async () => 'none', listOwnInventories: async () => [],
      resolveCompany: async () => ({ id: 'c1' }), insertInventory: async (r) => { inserted.push(r); return { id: 'inv-1' } },
      replaceFreeInventory: async () => ({ updated: 1 }),
      getPendingById: async (id) => pending.find(p => p.id === id) ?? null,
      latestPending: async (k) => pending.find(p => p.email_key === k) ?? null,
      deletePendingForEmail: async (k) => { deleted.push(k) }, upsertProfile: async () => {},
      readSavedRow: async () => null, profileFullName: async () => null,
      sendResults: async () => ({ ok: true, id: null }), siteUrl: 'https://www.themisiq.co',
      ...over,
    }
    return { deps, deleted, inserted }
  }
  const pendingRow = (key: string): PendingRow => ({ id: 'p-1', email: 'x', email_key: key, full_name: 'Pat', company: 'Acme', payload: draft, created_at: NOW.toISOString(), expires_at: '2026-10-06T12:00:00Z' })

  it('AB5: /pending keys the rate limit and the hold by the normalised address, and /claim finds it under the verified one', async () => {
    const rows: Array<{ email_key: string; payload: unknown }> = []
    const seen: Array<[string, string | null]> = []
    await holdFreeCalc(holdBody('P.a.t+calc@GoogleMail.com'), holdDeps(rows, seen))
    expect(rows[0].email_key).toBe('pat@gmail.com')
    expect(seen).toContainEqual(['email', 'pat@gmail.com'])
    const { deps, deleted } = claimDeps([pendingRow('pat@gmail.com')], { user: { id: 'u1', email: 'p.at@gmail.com' } })
    expect(await claimFreeCalc({}, deps)).toMatchObject({ status: 200, body: { ok: true } })
    expect(deleted).toContain('pat@gmail.com')
  })

  it('AB6: a hold written before L7 (plain key) is still found and still refused for another address', async () => {
    const legacy = pendingRow('p.at@gmail.com')
    const { deps, deleted } = claimDeps([legacy], { user: { id: 'u1', email: 'P.at@gmail.com' } })
    expect(await claimFreeCalc({}, deps)).toMatchObject({ status: 200 })
    expect(deleted).toEqual(['pat@gmail.com', 'p.at@gmail.com'])
    const other = claimDeps([pendingRow('someone@acme.com')], { user: { id: 'u1', email: 'pat@gmail.com' } })
    expect(await claimFreeCalc({ pendingId: 'p-1' }, other.deps)).toMatchObject({ status: 403, body: { code: 'email_mismatch' } })
  })

  it('AB7: /pending and /claim use the same function', () => {
    expect(read('lib/ghg/freeCalc.ts')).toContain('emailKey: emailKey(email)')
    expect(read('lib/ghg/freeCalcService.ts')).toContain('const emailKey = normalisedEmailKey(deps.user.email)')
  })
})

describe('new free accounts per IP per day', () => {
  const deps = (allowed: boolean, over: Partial<ClaimDeps> = {}) => {
    const inserted: unknown[] = []
    let checks = 0
    const d: ClaimDeps = {
      user: { id: 'u1', email: 'pat@acme.com' }, now: NOW,
      getAccess: async () => 'none', listOwnInventories: async () => [],
      resolveCompany: async () => ({ id: 'c1' }), insertInventory: async (r) => { inserted.push(r); return { id: 'inv-1' } },
      replaceFreeInventory: async () => ({ updated: 1 }), getPendingById: async () => null, latestPending: async () => null,
      deletePendingForEmail: async () => {}, upsertProfile: async () => {},
      readSavedRow: async () => null, profileFullName: async () => null,
      sendResults: async () => ({ ok: true, id: null }), siteUrl: 'https://www.themisiq.co',
      claimIpRateLimitOk: async () => { checks++; return allowed },
      ...over,
    }
    return { d, inserted, checks: () => checks }
  }

  it('AB8: over the cap, a new free calculation is refused with a plain sentence and nothing is written', async () => {
    const a = deps(false)
    expect(await claimFreeCalc({ inventory: draft }, a.d)).toEqual({ status: 429, body: { ok: false, code: 'claim_rate_limited', message: FREE_CALC_MESSAGES.claimRateLimited } })
    expect(a.inserted).toEqual([])
    expect(FREE_CALC_MESSAGES.claimRateLimited).toBe('Too many free accounts have been set up from this connection today. Try again tomorrow, or email hello@themisiq.co.')
  })

  it('AB9: a paid save and a replacement of the free calculation do not count', async () => {
    const paid = deps(false, { getAccess: async () => 'active' })
    expect(await claimFreeCalc({ inventory: draft }, paid.d)).toMatchObject({ status: 200 })
    expect(paid.checks()).toBe(0)
    const free = { id: 'f1', company_name: 'Other', reporting_year: 2024, free_tier: true }
    const replace = deps(false, { listOwnInventories: async () => [free] })
    expect(await claimFreeCalc({ inventory: draft, replaceFreeId: 'f1' }, replace.d)).toMatchObject({ status: 200 })
    expect(replace.checks()).toBe(0)
  })

  it('AB10: the route counts it in bucket free-calc-claim-ip, per IP, per 24 hours', () => {
    const r = read('app/api/ghg/free-calc/claim/route.ts')
    expect(r).toContain("bucket: 'free-calc-claim-ip', ip: ipFromHeaders(req), email: null, ipLimit: FREE_CLAIMS_PER_IP_PER_DAY")
    expect(r).toContain('windowMs: 24 * 60 * 60 * 1000')
    expect(r).toContain('const FREE_CLAIMS_PER_IP_PER_DAY = 5')
  })
})

describe('the honeypot', () => {
  it('AB11: still drops silently: "ok", nothing held, no rate limit spent', async () => {
    let held = 0
    let limited = 0
    const r = await holdFreeCalc(holdBody('pat@acme.com', { website: 'http://spam.example' }), {
      ip: '1.2.3.4', now: NOW, rateLimitOk: async () => { limited++; return true }, verifyCaptcha: async () => ({ ok: true }),
      insertPending: async () => { held++; return { id: 'x' } }, purgeExpired: async () => {},
    })
    expect(r).toEqual({ status: 200, body: { ok: true } })
    expect(held).toBe(0)
    expect(limited).toBe(0)
  })
})
