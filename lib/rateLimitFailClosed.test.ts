import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ENF-RL1 (Oct 2026): the rate limiter fails CLOSED on the two routes that email an address the visitor types, and
// open everywhere else. The service-role client is a fake whose rate_limits table can fail to read or to write; Resend
// is a fetch spy, so "no email is sent" is observed, not assumed.

const store = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'readFail' | 'writeFail', inserted: 0, count: 0 }))
vi.mock('./supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = {
        select: () => q, eq: () => q,
        gte: () => Promise.resolve(store.mode === 'readFail' ? { count: null, error: { message: 'relation "rate_limits" does not exist' } } : { count: store.count, error: null }),
        insert: () => {
          if (store.mode === 'writeFail') return Promise.resolve({ error: { message: 'permission denied for table rate_limits' } })
          store.inserted++
          return Promise.resolve({ error: null })
        },
      }
      return q
    },
  }),
}))
vi.mock('./order/invoice', () => ({ createDraftInvoiceForOrder: async () => ({ ok: false, reason: 'empty', message: 'test' }) }))

import { checkAndRecordRateLimit, RATE_LIMIT_UNAVAILABLE_MESSAGE } from './rateLimit'
import { SERVICE_UNAVAILABLE_MESSAGE, assessSubmitOutcome, quoteSubmitOutcome } from './serviceUnavailable'

const ROOT = join(__dirname, '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const SENTENCE = 'Something went wrong on our side. Please try again in a moment, or email hello@themisiq.co.'
const check = (failClosed?: boolean) => checkAndRecordRateLimit({ bucket: 'b', ip: '1.2.3.4', email: 'a@b.co', ipLimit: 5, emailLimit: 5, windowMs: 60_000, ...(failClosed === undefined ? {} : { failClosed }) })

let assessment: (req: never) => Promise<Response>
let quote: (req: never) => Promise<Response>
const sent: string[] = []
const resend = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === 'https://api.resend.com/emails') sent.push(JSON.parse(String(init?.body)).to[0])
  return new Response(JSON.stringify({ id: 'em-1' }), { status: 200 })
})

beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-key-not-real')
  vi.stubEnv('RESEND_MONITOR_EMAIL', 'monitor@example.com')
  vi.stubGlobal('fetch', resend)
  assessment = (await import('../app/api/assessment/submit/route')).POST as never
  quote = (await import('../app/api/order/quote-request/route')).POST as never
})
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
beforeEach(() => {
  store.mode = 'ok'; store.inserted = 0; store.count = 0
  sent.length = 0
  resend.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

const post = (url: string, body: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.4' } }) as never
const assessmentBody = { lead: { email: 'someone@acme.com', first: 'Pat' }, obligations: [], profile: [] }
const quoteBody = { contact: { name: 'Pat', email: 'someone@acme.com', company: 'Acme' }, order: { modules: ['ghg'], tier: 'starter', totalUSD: 550 } }

describe('the option', () => {
  it('RL1: default callers still fail open, and log it', async () => {
    for (const mode of ['readFail', 'writeFail'] as const) {
      store.mode = mode
      expect(await check(), mode).toEqual({ ok: true, retryAfterSec: 60 })
    }
    expect(console.error).toHaveBeenCalledWith('[rateLimit] check failed (failing open):', expect.anything())
  })

  it('RL2: failClosed refuses on a read failure and on a write failure, and logs the bucket', async () => {
    for (const mode of ['readFail', 'writeFail'] as const) {
      store.mode = mode
      expect(await check(true), mode).toEqual({ ok: false, retryAfterSec: 60, reason: 'unavailable' })
    }
    expect(console.error).toHaveBeenCalledWith('[rateLimit] check failed (failing closed): bucket b:', expect.anything())
  })

  it('RL3: with the table fine, failClosed changes nothing: allowed, or "limited" at the limit', async () => {
    expect(await check(true)).toEqual({ ok: true, retryAfterSec: 60 })
    store.count = 5
    expect(await check(true)).toEqual({ ok: false, retryAfterSec: 60, reason: 'limited' })
    expect(await check()).toEqual({ ok: false, retryAfterSec: 60, reason: 'limited' })
  })
})

describe('the two routes that email a typed address', () => {
  it('RL4: /api/assessment/submit answers 503 with the sentence and sends no email, on a read or a write failure', async () => {
    for (const mode of ['readFail', 'writeFail'] as const) {
      store.mode = mode
      sent.length = 0
      const res = await assessment(post('https://www.themisiq.co/api/assessment/submit', assessmentBody))
      expect(res.status, mode).toBe(503)
      expect(await res.json()).toEqual({ error: SENTENCE })
      expect(sent, mode).toEqual([])
    }
  })

  it('RL5: /api/order/quote-request answers 503 with the sentence and sends no email', async () => {
    for (const mode of ['readFail', 'writeFail'] as const) {
      store.mode = mode
      sent.length = 0
      const res = await quote(post('https://www.themisiq.co/api/order/quote-request', quoteBody))
      expect(res.status, mode).toBe(503)
      expect(await res.json()).toEqual({ error: SENTENCE })
      expect(sent, mode).toEqual([])
    }
    expect(RATE_LIMIT_UNAVAILABLE_MESSAGE).toBe(SENTENCE)
  })

  it('RL6: with the table fine, both routes work as before', async () => {
    const a = await assessment(post('https://www.themisiq.co/api/assessment/submit', assessmentBody))
    expect(a.status).toBe(200)
    expect(sent).toContain('someone@acme.com')
    sent.length = 0
    const q = await quote(post('https://www.themisiq.co/api/order/quote-request', quoteBody))
    expect(q.status).toBe(200)
    expect(sent).toContain('someone@acme.com')
    // And a reached limit keeps its own reply: silent success on the assessment, 429 on the quote.
    store.count = 1000
    sent.length = 0
    expect((await assessment(post('https://www.themisiq.co/api/assessment/submit', assessmentBody))).status).toBe(200)
    expect((await quote(post('https://www.themisiq.co/api/order/quote-request', quoteBody))).status).toBe(429)
    expect(sent).toEqual([])
  })
})

describe('every other bucket is unchanged', () => {
  it('RL7: failClosed appears in those two routes only, on exactly their three buckets', () => {
    const assessmentSrc = read('app/api/assessment/submit/route.ts')
    expect(assessmentSrc.match(/failClosed: true/g) ?? []).toHaveLength(2)
    expect(read('app/api/order/quote-request/route.ts').match(/failClosed: true/g) ?? []).toHaveLength(1)
    for (const f of ['app/api/ghg/free-calc/pending/route.ts', 'app/api/ghg/free-calc/claim/route.ts', 'app/api/ghg/free-calc/email/route.ts', 'app/api/ghg-bot/route.ts']) {
      const src = read(f)
      expect(src, f).toContain('checkAndRecordRateLimit(')
      expect(src, f).not.toContain('failClosed')
    }
  })
})

// The pages show the 503 sentence (ENF-RL1, second part). Both read the route's status through one pure function each
// (lib/serviceUnavailable.ts), tested here, and the page source is held to using it.
describe('the pages', () => {
  const assess = () => read('app/assess/page.tsx')
  const order = () => read('app/order/page.tsx')
  const assessHandler = () => { const p = assess(); return p.slice(p.indexOf('<button className="tq-btn-brand" disabled={submitting} onClick={async () => {'), p.indexOf('Show my Compliance Obligation Map')) }

  it('RL8: /assess on 503 shows the sentence, not the confirmation, and keeps the answers', () => {
    expect(assessSubmitOutcome(503)).toBe('unavailable')
    expect(SERVICE_UNAVAILABLE_MESSAGE).toBe(SENTENCE)
    const h = assessHandler()
    // The 503 branch returns before the results step, which is where the confirmation lives.
    const branch = h.indexOf("if (assessSubmitOutcome(status) === 'unavailable') { setSubmitError(SERVICE_UNAVAILABLE_MESSAGE); return }")
    expect(branch).toBeGreaterThan(0)
    expect(branch).toBeLessThan(h.indexOf('setStep(RESULTS_STEP)'))
    expect(h).toContain('const status = await submitToAPI()')
    // Nothing in the handler clears what the visitor entered.
    expect(h).not.toMatch(/setAnswers|setEmail\(|EMPTY_ANSWERS/)
    expect(assess()).toContain('{submitError && <p id="assess-submit-error" role="alert"')
    // The page imports the sentence from the client-safe module, never from the server limiter.
    expect(assess()).toContain("from '../../lib/serviceUnavailable'")
    expect(assess()).not.toContain("lib/rateLimit'")
  })

  it('RL9: /assess on a silent success (or any other answer, or none) still shows the results and the confirmation', () => {
    for (const s of [200, 400, 429, 500, null]) expect(assessSubmitOutcome(s), String(s)).toBe('show_results')
    expect(assess()).toContain("We&apos;re sending a copy of your Compliance Obligation Map to")
  })

  it('RL10: /order on 503 shows the sentence and keeps the form', () => {
    expect(quoteSubmitOutcome(503)).toBe('unavailable')
    const o = order()
    expect(o).toContain('setQuoteStatus(quoteSubmitOutcome(res.status))')
    expect(o).toContain("{quoteStatus === 'unavailable' && (")
    expect(o).toContain('{SERVICE_UNAVAILABLE_MESSAGE}</div>')
    // The form is shown for every status but 'done', and submitQuote never resets the fields.
    const submit = o.slice(o.indexOf('const submitQuote = async () => {'), o.indexOf('return (', o.indexOf('const submitQuote = async () => {')))
    expect(submit).not.toMatch(/setQ\(/)
    expect(o).toContain("{quoteStatus === 'done' ? (")
    expect(o).not.toContain("lib/rateLimit'")
  })

  it('RL11: /order on 429 and on other errors keeps its old message', () => {
    for (const s of [429, 400, 500, null]) expect(quoteSubmitOutcome(s), String(s)).toBe('error')
    for (const s of [200, 201]) expect(quoteSubmitOutcome(s)).toBe('done')
    expect(order()).toContain('Something went wrong sending your request. Please try again.</div>')
    for (const f of ['lib/serviceUnavailable.ts', 'app/assess/page.tsx', 'app/order/page.tsx']) {
      const added = read(f)
      expect(added.includes(SENTENCE) || added.includes('SERVICE_UNAVAILABLE_MESSAGE'), f).toBe(true)
    }
    expect(SERVICE_UNAVAILABLE_MESSAGE).not.toContain('\u2014')
  })
})
