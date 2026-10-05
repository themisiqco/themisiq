import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARKETING_CONSENT, MARKETING_CONSENT_VERSIONS, consentWordingFor, activeConsent, readConsentChoice, cleanSourcePage,
  CONSENT_COPY, KEEP_RESULTS_SOURCE, maskEmail, type ConsentRow,
} from './marketing'
import { signUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrls, unsubscribeHeaders, UNSUBSCRIBE_TOKEN_TTL_DAYS } from './unsubscribeToken'
import { unsubscribe, checkUnsubscribe, setAccountConsent, unsubscribeFor, type ConsentInsert } from './consentService'
import { claimFreeCalc, holdFreeCalc, emailResultsAgain, type ClaimDeps, type PendingRow } from '../ghg/freeCalcService'
import { inventoryFromDraft, inventoryRow } from '../ghg/freeCalc'
import { buildResultsEmail, type SavedInventoryRow } from '../ghg/resultsEmail'

// LEAD1 L6 (Oct 2026): marketing consent and unsubscribe (docs/review/design-lead1.md section 5, table M5).
const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const NOW = new Date('2026-10-05T12:00:00Z')
const SECRET = 'test-secret-not-real'
const CID = '11111111-2222-4333-8444-555555555555'
const WORDING = 'Send me occasional ThemisIQ updates about sustainability reporting and compliance. You can unsubscribe at any time.'

const draft = { company_name: 'Acme', reporting_year: 2025, locations: [{ id: '1', name: 'HQ', country: 'US', grid_region: 'US_AVG', electricity_kwh: 10000 }] }
const savedRow = () => ({ ...inventoryRow(inventoryFromDraft(draft as never, 'Acme', NOW), 'user-1', 'co-1', true, NOW), id: 'inv-1' }) as unknown as SavedInventoryRow

function claimDeps(over: Partial<ClaimDeps> = {}) {
  const consents: ConsentInsert[] = []
  const emails: Array<{ text: string; html: string; headers?: Record<string, string> }> = []
  const deps: ClaimDeps = {
    user: { id: 'user-1', email: 'pat@example.com' }, now: NOW,
    getAccess: async () => 'none', listOwnInventories: async () => [],
    resolveCompany: async () => ({ id: 'co-1' }), insertInventory: async () => ({ id: 'inv-1' }),
    replaceFreeInventory: async () => ({ updated: 1 }), getPendingById: async () => null, latestPending: async () => null,
    deletePendingForEmail: async () => {}, upsertProfile: async () => {},
    readSavedRow: async () => savedRow(), profileFullName: async () => 'Pat Lee',
    sendResults: async (_to, e) => { emails.push(e); return { ok: true, id: 'em' } },
    siteUrl: 'https://www.themisiq.co',
    requestMeta: { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 test' },
    insertConsent: async (row) => { consents.push(row); return { id: CID } },
    activeConsentId: async () => null,
    signUnsubscribe: id => signUnsubscribeToken(id, SECRET, NOW),
    ...over,
  }
  return { deps, consents, emails }
}
const choice = (granted: boolean, version: string = MARKETING_CONSENT.version) => ({ granted, version, sourcePage: KEEP_RESULTS_SOURCE })

describe('the box', () => {
  it('MC1: the exact wording, one version, and the modal shows it UNTICKED by default', () => {
    expect(MARKETING_CONSENT.wording).toBe(WORDING)
    expect(MARKETING_CONSENT_VERSIONS[MARKETING_CONSENT.version]).toBe(WORDING)
    const m = read('app/dashboard/ghg/_components/KeepResultsModal.tsx')
    expect(m).toContain('const [marketing, setMarketing] = useState(pending?.marketingConsent === true)')
    expect(m).toContain('<input id="keep-marketing" type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)}')
    expect(m).toContain('<span>{MARKETING_CONSENT.wording}</span>')
    expect(m).not.toMatch(/defaultChecked|checked=\{true\}/)
    for (const s of [WORDING, ...(Object.values(CONSENT_COPY) as unknown[]).filter((v): v is string => typeof v === 'string')]) expect(s).not.toContain('\u2014')
  })

  it('MC2: nothing depends on it: the claim saves ticked, unticked, or with no box at all', async () => {
    for (const mc of [choice(true), choice(false), undefined]) {
      const { deps } = claimDeps()
      expect(await claimFreeCalc({ inventory: draft, ...(mc ? { marketingConsent: mc } : {}) }, deps)).toMatchObject({ status: 200, body: { ok: true } })
    }
    // ...and when the record fails.
    const { deps } = claimDeps({ insertConsent: async () => ({ error: 'relation does not exist' }) })
    expect(await claimFreeCalc({ inventory: draft, marketingConsent: choice(true) }, deps)).toMatchObject({ status: 200, body: { ok: true, consentRecorded: false } })
  })
})

describe('the record', () => {
  it('MC3: a row for ticked AND for unticked, with the verified email, user, wording, version, source page, IP and user agent', async () => {
    for (const granted of [true, false]) {
      const { deps, consents } = claimDeps()
      const r = await claimFreeCalc({ inventory: draft, marketingConsent: choice(granted) }, deps)
      expect(r.body).toMatchObject({ consentRecorded: true })
      expect(consents).toEqual([{
        user_id: 'user-1', email: 'pat@example.com', purpose: 'updates', granted,
        wording: WORDING, wording_version: MARKETING_CONSENT.version, source_page: KEEP_RESULTS_SOURCE,
        ip: '203.0.113.9', user_agent: 'Mozilla/5.0 test',
      }])
    }
  })

  it('MC4: no box shown (a signed-in Save), no row', async () => {
    const { deps, consents } = claimDeps()
    await claimFreeCalc({ inventory: draft }, deps)
    expect(consents).toEqual([])
  })

  it('MC5: the wording stored is the server’s for that version, never the client’s; an unknown version records nothing', async () => {
    const { deps, consents } = claimDeps()
    await claimFreeCalc({ inventory: draft, marketingConsent: { ...choice(true), wording: 'I agree to anything' } }, deps)
    expect(consents[0].wording).toBe(WORDING)
    const b = claimDeps()
    const r = await claimFreeCalc({ inventory: draft, marketingConsent: choice(true, '1999-01-01') }, b.deps)
    expect(b.consents).toEqual([])
    expect(r.body).toMatchObject({ ok: true, consentRecorded: false })
    expect(consentWordingFor('v1')).toBe(WORDING)
    expect(MARKETING_CONSENT.version).toBe('v1')
    expect(consentWordingFor('nope')).toBeNull()
    expect(cleanSourcePage('https://evil.example', '/x')).toBe('/x')
    expect(readConsentChoice({ granted: 'yes' }, '/x')).toBeNull()
  })

  it('MC6: the choice made on one device is recorded when the link is opened on another, with the IP and user agent of the choice', async () => {
    let held: Record<string, unknown> | null = null
    const hold = await holdFreeCalc({ email: 'pat@example.com', fullName: 'Pat', company: 'Acme', inventory: draft, marketingConsent: choice(true) }, {
      ip: '198.51.100.7', userAgent: 'Laptop browser', now: NOW,
      rateLimitOk: async () => true, verifyCaptcha: async () => ({ ok: true }),
      insertPending: async (row) => { held = row.payload as Record<string, unknown>; return { id: 'p-1' } },
      purgeExpired: async () => {},
    })
    expect(hold.status).toBe(200)
    expect(held!.marketingConsent).toEqual({ ...choice(true), ip: '198.51.100.7', userAgent: 'Laptop browser' })
    const pending: PendingRow = { id: 'p-1', email: 'pat@example.com', email_key: 'pat@example.com', full_name: 'Pat', company: 'Acme', payload: held, created_at: NOW.toISOString(), expires_at: '2026-10-06T12:00:00Z' }
    const { deps, consents } = claimDeps({ latestPending: async () => pending, requestMeta: { ip: '192.0.2.1', userAgent: 'Phone browser' } })
    expect(await claimFreeCalc({}, deps)).toMatchObject({ status: 200 })
    expect(consents).toHaveLength(1)
    expect(consents[0]).toMatchObject({ granted: true, ip: '198.51.100.7', user_agent: 'Laptop browser', wording: WORDING })
  })
})

describe('the unsubscribe token', () => {
  // ⚠️ NO KEY PASSED MEANS process.env.UNSUBSCRIBE_TOKEN_SECRET, which Vercel Preview sets (lead1-L6-fix1). The cases
  // that pass none fix the variable themselves; vitest.setup.ts also clears it before every file.
  afterEach(() => { vi.unstubAllEnvs() })
  it('MC7: round trip, and the id it names', () => {
    const t = signUnsubscribeToken(CID, SECRET, NOW)!
    expect(verifyUnsubscribeToken(t, SECRET, NOW)).toEqual({ ok: true, consentId: CID })
    expect(signUnsubscribeToken('not-a-uuid', SECRET, NOW)).toBeNull()
    vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', '')
    expect(signUnsubscribeToken(CID, undefined, NOW)).toBeNull()
    // And with no key passed, the environment's is used.
    vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', SECRET)
    expect(verifyUnsubscribeToken(signUnsubscribeToken(CID, undefined, NOW), undefined, NOW)).toEqual({ ok: true, consentId: CID })
  })

  it('MC8: tampered, re-signed with another secret, or expired: refused', () => {
    const t = signUnsubscribeToken(CID, SECRET, NOW)!
    const [body, sig] = t.split('.')
    // A middle character: the last one of a base64 string can carry unused bits, so changing it may not change a byte.
    const flip = (s: string) => { const i = Math.floor(s.length / 2); return s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1) }
    expect(verifyUnsubscribeToken(`${flip(body)}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyUnsubscribeToken(`${body}.${flip(sig)}`, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' })
    const other = Buffer.from(`${'99999999-2222-4333-8444-555555555555'}.${Math.floor(NOW.getTime() / 1000) + 1000}`).toString('base64url')
    expect(verifyUnsubscribeToken(`${other}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyUnsubscribeToken(t, 'another-secret', NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyUnsubscribeToken('garbage', SECRET, NOW)).toEqual({ ok: false, reason: 'invalid' })
    const later = new Date(NOW.getTime() + (UNSUBSCRIBE_TOKEN_TTL_DAYS * 24 * 3600 + 1) * 1000)
    expect(verifyUnsubscribeToken(t, SECRET, later)).toEqual({ ok: false, reason: 'expired' })
    vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', '')
    expect(verifyUnsubscribeToken(t, undefined, NOW)).toEqual({ ok: false, reason: 'not_configured' })
  })
})

describe('withdrawal', () => {
  const deps = (over: Record<string, unknown> = {}) => {
    const withdrawn: string[] = []
    return {
      withdrawn,
      d: {
        verify: (t: unknown) => verifyUnsubscribeToken(t, SECRET, NOW),
        getConsent: async (id: string) => (id === CID ? { id, email: 'pat@example.com' } : null),
        withdrawForEmail: async (email: string) => { withdrawn.push(email); return { updated: 1 } },
        ...over,
      },
    }
  }
  it('MC9: a valid link withdraws at once, for the whole address; a second click changes nothing and says the same', async () => {
    const t = signUnsubscribeToken(CID, SECRET, NOW)!
    const a = deps()
    expect(await unsubscribe(t, a.d)).toEqual({ status: 200, body: { ok: true, withdrawn: 1, message: CONSENT_COPY.unsubscribed } })
    expect(a.withdrawn).toEqual(['pat@example.com'])
    const b = deps({ withdrawForEmail: async () => ({ updated: 0 }) })
    expect(await unsubscribe(t, b.d)).toMatchObject({ status: 200, body: { ok: true, message: CONSENT_COPY.unsubscribed } })
  })

  it('MC10: refused links say so, and change nothing', async () => {
    const a = deps()
    expect(await unsubscribe('garbage', a.d)).toMatchObject({ status: 400, body: { message: CONSENT_COPY.linkInvalid } })
    const old = signUnsubscribeToken(CID, SECRET, new Date(NOW.getTime() - (UNSUBSCRIBE_TOKEN_TTL_DAYS + 1) * 86400000))!
    expect(await unsubscribe(old, a.d)).toMatchObject({ status: 410, body: { message: CONSENT_COPY.linkExpired } })
    expect(a.withdrawn).toEqual([])
  })

  it('MC11: withdrawal never deletes: the routes only set withdrawn_at, and the SQL grants no DELETE to anyone', () => {
    for (const f of ['app/api/unsubscribe/route.ts', 'app/api/account/marketing-consent/route.ts']) {
      const src = read(f)
      expect(src).toContain(".update({ withdrawn_at: new Date().toISOString() })")
      expect(src).not.toMatch(/\.delete\(/)
    }
    const sql = read('docs/review/patches/L6-M5-marketing-consents.sql')
    expect(sql).toContain('grant update (withdrawn_at) on table public.marketing_consents to service_role;')
    expect(sql).not.toMatch(/grant [^;]*delete[^;]* on table public\.marketing_consents/i)
    expect(sql).toContain("or has_table_privilege('service_role', 'public.marketing_consents', 'delete')")
    // No GET: a link scanner fetching the URL must not unsubscribe anyone.
    expect(read('app/api/unsubscribe/route.ts')).not.toMatch(/export async function GET/)
  })
})

describe('the results email and the link', () => {
  const rows = (...r: Array<Partial<ConsentRow>>) => r.map((x, i) => ({ id: `c${i}`, granted: true, created_at: `2026-10-0${i + 1}T00:00:00Z`, withdrawn_at: null, ...x }))

  it('MC12: active means the newest row is a grant not withdrawn', () => {
    expect(activeConsent(rows({ granted: true }))?.id).toBe('c0')
    expect(activeConsent(rows({ granted: true }, { granted: false }))).toBeNull()
    expect(activeConsent(rows({ granted: false }, { granted: true }))?.id).toBe('c1')
    expect(activeConsent(rows({ granted: true, withdrawn_at: '2026-10-02T00:00:00Z' }))).toBeNull()
    expect(activeConsent([])).toBeNull()
  })

  it('MC13: the link and List-Unsubscribe headers only with active consent; the postal address either way', async () => {
    const on = claimDeps({ activeConsentId: async () => CID })
    await claimFreeCalc({ inventory: draft, marketingConsent: choice(true) }, on.deps)
    const e = on.emails[0]
    const token = signUnsubscribeToken(CID, SECRET, NOW)!
    const urls = unsubscribeUrls('https://www.themisiq.co', token)
    expect(e.html).toContain(`href="${urls.page}"`)
    expect(e.html).toContain('Unsubscribe from ThemisIQ updates')
    expect(e.text).toContain(`Unsubscribe from ThemisIQ updates: ${urls.page}`)
    expect(e.headers).toEqual(unsubscribeHeaders(urls.oneClick))
    expect(e.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(e.html).toContain('11 Oak Drive')

    const off = claimDeps({ activeConsentId: async () => null })
    await claimFreeCalc({ inventory: draft, marketingConsent: choice(false) }, off.deps)
    expect(off.emails[0].html).not.toContain('Unsubscribe')
    expect(off.emails[0].text).not.toContain('Unsubscribe')
    expect(off.emails[0].headers).toBeUndefined()
    expect(off.emails[0].html).toContain('11 Oak Drive')
    // Without the link, both parts are exactly as before L6.
    const plain = buildResultsEmail({ row: savedRow(), fullName: 'Pat Lee', siteUrl: 'https://www.themisiq.co' })
    expect(off.emails[0].text).toBe(plain.text)

    // "Email me my results again" follows the same rule.
    const again = claimDeps({ activeConsentId: async () => CID })
    await emailResultsAgain({ id: 'inv-1' }, { ...again.deps, rateLimitOk: async () => true })
    expect(again.emails[0].headers?.['List-Unsubscribe']).toContain('/api/unsubscribe?token=')
  })

  it('MC14: no secret set: the email goes without the link, and says so in the log', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(unsubscribeFor(CID, 'https://www.themisiq.co', () => null)).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('the dashboard setting', () => {
  const acct = (rowsNow: ConsentRow[]) => {
    const inserted: ConsentInsert[] = []
    let withdrawals = 0
    return {
      inserted, withdrawals: () => withdrawals,
      deps: {
        user: { id: 'user-1', email: 'pat@example.com' }, ip: '203.0.113.9', userAgent: 'UA',
        listOwn: async () => rowsNow,
        insertConsent: async (r: ConsentInsert) => { inserted.push(r); return { id: CID } },
        withdrawForUser: async () => { withdrawals++; return { updated: 1 } },
      },
    }
  }
  it('MC15: choosing updates records a grant with the wording; choosing none withdraws; no change records nothing', async () => {
    const a = acct([])
    expect(await setAccountConsent({ granted: true, version: MARKETING_CONSENT.version }, a.deps)).toMatchObject({ status: 200, body: { ok: true, granted: true } })
    expect(a.inserted[0]).toMatchObject({ granted: true, wording: WORDING, source_page: '/dashboard (Email updates)', ip: '203.0.113.9' })
    const b = acct([{ id: CID, granted: true, created_at: NOW.toISOString(), withdrawn_at: null }])
    await setAccountConsent({ granted: false }, b.deps)
    expect(b.withdrawals()).toBe(1)
    expect(b.inserted).toEqual([])
    const c = acct([])
    await setAccountConsent({ granted: false }, c.deps)
    expect(c.withdrawals()).toBe(0)
    expect(c.inserted).toEqual([])
  })

  it('MC16: the dashboard shows the setting to a signed-in account', () => {
    expect(read('app/dashboard/page.tsx')).toContain('{user && <EmailUpdatesSetting />}')
    expect(read('app/dashboard/_components/EmailUpdatesSetting.tsx')).toContain("fetch('/api/account/marketing-consent'")
  })
})

describe('M5 SQL', () => {
  it('MC17: headers record execution (M5 and verify RUN 5 Oct 2026, 17 checks passed; rollback NOT RUN); the owner SELECT policy wraps auth.uid(); RLS on; anon nothing', () => {
    const m5 = read('docs/review/patches/L6-M5-marketing-consents.sql')
    expect(m5.split('\n')[2]).toContain('⚠️ RUN 5 Oct 2026')
    expect(m5).toContain('passed all 17 checks.\n-- DO NOT RUN AGAIN')
    expect(read('docs/review/patches/L6-M5-rollback.sql').split('\n')[2]).toContain('⚠️ NOT RUN.')
    const verify = read('docs/review/patches/L6-M5-verify.sql')
    expect(verify.split('\n')[2]).toContain('⚠️ RUN 5 Oct 2026')
    expect(verify).toContain('all 17 checks passed. DO NOT RUN AGAIN')
    expect(m5).toContain('using ((select auth.uid()) = user_id);')
    expect(m5).not.toMatch(/[^(]auth\.uid\(\)\s*=/)
    expect(m5).toContain('alter table public.marketing_consents enable row level security;')
    expect(m5).toContain('revoke all on table public.marketing_consents from public, anon, authenticated;')
    expect(m5).toContain("constraint marketing_consents_purpose check (purpose in ('updates'))")
    expect(m5).toContain('references auth.users (id) on delete set null')
  })
})

// L6 amendment (5 Oct 2026): /unsubscribe does not withdraw on load. Security scanners run page scripts.
describe('the unsubscribe page changes nothing until the button is pressed', () => {
  const token = () => signUnsubscribeToken(CID, SECRET, NOW)!
  const deps = () => {
    const withdrawn: string[] = []
    return {
      withdrawn,
      d: {
        verify: (t: unknown) => verifyUnsubscribeToken(t, SECRET, NOW),
        getConsent: async (id: string) => (id === CID ? { id, email: 'lisa@example.com' } : null),
        withdrawForEmail: async (email: string) => { withdrawn.push(email); return { updated: 1 } },
      },
    }
  }

  it('MC18: loading the page alone changes nothing: the check is read only and shows the address masked', async () => {
    const a = deps()
    expect(await checkUnsubscribe(token(), a.d)).toEqual({ status: 200, body: { ok: true, maskedEmail: 'l***@example.com' } })
    expect(a.withdrawn).toEqual([])
    expect(await checkUnsubscribe('garbage', a.d)).toMatchObject({ status: 400, body: { message: CONSENT_COPY.linkInvalid } })
    expect(a.withdrawn).toEqual([])
    // The page posts only a check on load; the withdrawal is in the button's handler and nowhere else.
    const page = read('app/unsubscribe/page.tsx')
    const effect = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, [])'))
    expect(effect).toContain("post(t, 'check')")
    expect(effect).not.toContain("'unsubscribe'")
    expect(page.match(/post\(token, 'unsubscribe'\)/g) ?? []).toHaveLength(1)
    expect(page).toContain("onClick={() => { void confirm(view.masked) }}")
    expect(page).toContain('{CONSENT_COPY.confirmLine(view.masked)}')
  })

  it('MC19: the route withdraws only for the button (action unsubscribe) or a mail client\u2019s one-click POST; JSON without an action is a check; still no GET', () => {
    const r = read('app/api/unsubscribe/route.ts')
    expect(r).toContain("let action: 'check' | 'unsubscribe' = queryToken ? 'unsubscribe' : 'check'")
    expect(r).toContain("action = b.action === 'unsubscribe' ? 'unsubscribe' : 'check'")
    expect(r).toContain("const result = action === 'unsubscribe' ? await unsubscribe(token, deps) : await checkUnsubscribe(token, deps)")
    expect(r).not.toMatch(/export async function GET/)
  })

  it('MC20: pressing the button withdraws at once; the masked address hides all but the first character', async () => {
    const a = deps()
    expect(await unsubscribe(token(), a.d)).toMatchObject({ status: 200, body: { ok: true, message: CONSENT_COPY.unsubscribed } })
    expect(a.withdrawn).toEqual(['lisa@example.com'])
    expect(maskEmail('lisa.foster@goodworksustainability.com')).toBe('l***@goodworksustainability.com')
    expect(maskEmail('x')).toBe('***')
    expect(CONSENT_COPY.confirmButton).toBe('Unsubscribe from ThemisIQ updates')
  })
})
