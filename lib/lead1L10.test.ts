import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FREE_CALC_SUBLINE, GHG_FREE_USE_SENTENCE, GHG_PLAN_USE_SENTENCE } from './pricingCopy'
import FreeCalcCta from '../app/components/FreeCalcCta'
import { gridRegionDisplay } from './ghg/gridRegionNames'
import {
  FREE_ACCOUNT_INTRO, FREE_ACCOUNT_ROWS, FREE_ACCOUNT_PROCESSORS, FREE_ACCOUNT_MARKETING,
  FREE_ACCOUNT_TERMS_INTRO, FREE_ACCOUNT_TERMS,
} from './legal/freeAccountCopy'
import { SB253_PLATFORM_SENTENCE } from './sb253'
import { MARKETING_CONSENT } from './consent/marketing'
import { PURCHASE_CONSENT_VERSION, PURCHASE_CONSENT_VERSIONS } from './purchaseConsentVersion'

// For L10-16: the purchase webhook, driven for real with Stripe's signature check and the service-role client faked.
const written = vi.hoisted(() => ({ consents: [] as Array<Record<string, unknown>> }))
vi.mock('./stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent: (raw: string) => JSON.parse(raw) } }) }))
vi.mock('./supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const chain = () => q
      Object.assign(q, {
        select: chain, eq: chain, in: chain, order: chain, limit: chain, update: chain,
        upsert: (row: Record<string, unknown>) => { if (table === 'purchase_consents') written.consents.push(row); return q },
        then: (res: (v: unknown) => unknown) => Promise.resolve(res({ data: [], error: null })),
      })
      return q
    },
  }),
}))

// LEAD1 L10 (Oct 2026): copy, Privacy and Terms for the free account (docs/review/design-lead1.md sections 5 and 8).
const ROOT = join(__dirname, '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}
const SOURCES = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))].map(f => relative(ROOT, f).split('\\').join('/'))

describe('the calculator sub-line', () => {
  it('L10-1: reads "No account needed to start. Create a free account to keep your results."', () => {
    expect(FREE_CALC_SUBLINE).toBe('No account needed to start. Create a free account to keep your results.')
  })

  it('L10-2: it renders under every CTA that shows a sub-line, on each page that uses one, and in the mobile menu', () => {
    for (const variant of ['primary', 'onDark', 'link'] as const) {
      expect(renderToStaticMarkup(createElement(FreeCalcCta, { variant })), variant).toContain(FREE_CALC_SUBLINE)
    }
    const pages: Array<[string, string]> = [
      ['app/page.tsx', '<FreeCalcCta variant="onDark" />'],
      ['app/methodology/page.tsx', '<FreeCalcCta variant="link" />'],
      ['app/assess/page.tsx', '<FreeCalcCta />'],
      ['app/climate-ghg/page.tsx', '<FreeCalcCta />'],
      ['app/frameworks/page.tsx', '<FreeCalcCta variant="link" style={{ fontSize: 14 }} />'],
      ['app/pricing/page.tsx', '<FreeCalcCta variant="link" style={{ fontSize: 12 }} />'],
    ]
    for (const [f, tag] of pages) expect(read(f), f).toContain(tag)
    for (const [f] of pages) expect(read(f), f).not.toContain('subLine={false}')
    expect(read('app/components/Nav.tsx')).toContain('sub: FREE_CALC_SUBLINE, tag: true')
  })
})

describe('no "results emailed" claim before the free account', () => {
  it('L10-3: the free-use sentence ties the email to creating the account', () => {
    expect(GHG_FREE_USE_SENTENCE).toBe('Scope 1 and Scope 2 can be calculated free, in your browser, without an account. Create a free account to get your results by email and keep your calculation.')
    expect(GHG_PLAN_USE_SENTENCE).toContain('more than one inventory')
    expect(GHG_PLAN_USE_SENTENCE).not.toMatch(/^Saving/)
  })

  it('L10-4: no page or copy module says results are emailed without the account', () => {
    const banned = [/emailed to you directly/i, /send your results to you directly/i, /results will be emailed/i, /enter your email address and we/i]
    const hits: string[] = []
    for (const f of SOURCES) {
      const src = read(f)
      for (const re of banned) if (re.test(src)) hits.push(`${f}: ${re}`)
    }
    expect(hits).toEqual([])
    const calc = read('app/calculate-emissions/page.tsx')
    expect(calc).toContain('Then create a free account and we&rsquo;ll email your results to you and keep your calculation.')
    expect(calc.match(/Nothing is saved until you create a free account, which keeps one Scope 1 and Scope 2 calculation\./g) ?? []).toHaveLength(2)
  })
})

describe('readable grid names in wizard step 2', () => {
  it('L10-5: the name, with the engine code in brackets for a verifier', () => {
    expect(gridRegionDisplay('ON')).toBe('Ontario (ON)')
    expect(gridRegionDisplay('US_IL')).toBe('Illinois (US_IL)')
    expect(gridRegionDisplay('US_AVG')).toBe('United States national average (US_AVG)')
    expect(gridRegionDisplay('NZ')).toBe('New Zealand (NZ)')
    expect(gridRegionDisplay('XX')).toBe('XX')
    const page = read('app/dashboard/ghg/page.tsx')
    expect(page).not.toContain('<strong>{loc.grid_region}</strong>')
    expect(page).not.toContain('<strong>{detectedRegion?.label}</strong>')
    expect(page.match(/<strong>\{gridRegionDisplay\(loc\.grid_region\)\}<\/strong>/g) ?? []).toHaveLength(3)
    expect(page).toContain('<strong>{detectedRegion ? gridRegionDisplay(detectedRegion.value) : \'\'}</strong>')
    expect(page).toContain('<option key={r.value} value={r.value}>{gridRegionDisplay(r.value)}:')
    expect(page).toContain("<option key={s} value={s}>{gridRegionDisplay('US_' + s)}:")
  })
})

describe('"traceable" carries its qualifier', () => {
  it('L10-6: every claim that figures trace to source documents says "where you\'ve uploaded them"', () => {
    expect(SB253_PLATFORM_SENTENCE).toContain("traceable to your source documents where you've uploaded them")
    const hits: string[] = []
    for (const f of SOURCES) {
      for (const line of read(f).split('\n')) {
        const t = line.trim()
        if (t.startsWith('//') || t.startsWith('*')) continue
        if (/traceable to (?:your |the )?(?:source )?documents/i.test(line) && !/where you(?:'|\\'|&apos;|&rsquo;)ve uploaded them/.test(line)) hits.push(`${f}: ${t.slice(0, 100)}`)
      }
    }
    expect(hits).toEqual([])
    const climate = read('app/climate-ghg/page.tsx')
    expect(climate).not.toContain('the source document kept behind every figure')
    expect(climate).not.toContain('the document it came from')
    expect(read('lib/obligations.ts')).not.toContain('rather than a self-declared number')
  })
})

describe('Privacy and Terms', () => {
  it('L10-7: Privacy has a Free accounts section, numbered 3, and the later sections moved up', () => {
    const p = read('app/privacy/page.tsx')
    expect(p).toContain("{ id: 's3', num: '03', title: 'Free accounts' },")
    expect(p).toContain('<h2 style={sectionHead}>Free accounts</h2>')
    expect(p).toContain("{ id: 's12', num: '12', title: 'Contact & complaints' },")
    expect(p).toContain('are set out in Section 10.</div>')
    expect(p).toContain("'Free accounts that never buy a plan, and their calculation'")
    expect(p).toContain("['Account and contact data (customers who have bought a plan)'")
    expect(p).toContain("'Cloudflare (Turnstile)'")
  })

  it('L10-8: the Privacy text says only what the code does', () => {
    const all = [FREE_ACCOUNT_INTRO, ...FREE_ACCOUNT_ROWS.flat(), FREE_ACCOUNT_PROCESSORS, FREE_ACCOUNT_MARKETING].join(' ')
    // Only the processors the free account really uses; no AI.
    for (const n of ['Supabase', 'Resend', 'Cloudflare Turnstile', 'Vercel']) expect(FREE_ACCOUNT_PROCESSORS).toContain(n)
    expect(FREE_ACCOUNT_PROCESSORS).toContain('Stripe is not involved unless you buy a plan.')
    expect(all).not.toMatch(/Anthropic|\bAI\b/)
    // No promise of a deletion nothing performs yet (L11): "may", never "will".
    expect(all).not.toMatch(/will be deleted|we delete|automatically deleted/i)
    // The marketing box as built: unticked, optional, both choices recorded, withdrawal kept.
    expect(MARKETING_CONSENT.version).toBe('v1')
    expect(FREE_ACCOUNT_MARKETING).toContain('unticked and optional')
    expect(FREE_ACCOUNT_MARKETING).toContain('withdrawing does not delete that record')
    expect(all).toContain('whether or not you tick the box')
  })

  it('L10-9: Terms has a Free accounts section, numbered 3, with what was asked; the liability cap is now Section 14', () => {
    const t = read('app/terms/page.tsx')
    expect(t).toContain('<Section id="t3" num="Section 3" title="Free accounts">')
    expect(t).toContain('<Section id="t4" num="Section 4" title="Fees and payment">')
    expect(t).toContain('<Section id="t14" num="Section 14" title="Warranties and limitation of liability">')
    expect(t).toContain('<Section id="t18" num="Section 18" title="Governing law">')
    expect(t).toContain("'Free accounts',")
    const terms = [FREE_ACCOUNT_TERMS_INTRO, ...FREE_ACCOUNT_TERMS].join(' ')
    expect(terms).toContain('one Scope 1 and Scope 2 calculation')
    expect(terms).toContain('the figures in a free calculation are indicative.')
    expect(terms).toContain('becomes the first inventory of your plan')
    expect(terms).toContain('no sign-in for 24 months')
    expect(terms).toContain('(see Section 11)')
    expect(t).toContain('<Section id="t11" num="Section 11" title="Accuracy, methodology and AI-assisted outputs">')
  })

  it('L10-10: no em dash, and no "chase", in any copy L10 changed', () => {
    const changed = [
      FREE_CALC_SUBLINE, GHG_FREE_USE_SENTENCE, GHG_PLAN_USE_SENTENCE, gridRegionDisplay('ON'),
      FREE_ACCOUNT_INTRO, ...FREE_ACCOUNT_ROWS.flat(), FREE_ACCOUNT_PROCESSORS, FREE_ACCOUNT_MARKETING,
      FREE_ACCOUNT_TERMS_INTRO, ...FREE_ACCOUNT_TERMS,
    ]
    for (const s of changed) {
      expect(s).not.toContain('\u2014')
      expect(s).not.toMatch(/\bchas(e|ed|es|ing)\b/i)
    }
    for (const f of ['lib/legal/freeAccountCopy.ts', 'app/privacy/page.tsx', 'app/terms/page.tsx']) expect(read(f), f).not.toContain('\u2014')
  })
})

// L10 amendment (6 Oct 2026).
describe('L10 amendment', () => {
  const OLD_GATE = 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.'
  const NEW_GATE = 'This needs a GHG plan. Your work is still on screen; choose a plan to keep it.'
  const m2Body = () => {
    const s = read('docs/review/patches/L1-M2-ghg-entitlement-gate-free-tier.sql')
    const start = s.indexOf('create or replace function public.enforce_ghg_location_allowance()\nreturns trigger as $$')
    const b0 = s.indexOf('$$', start) + 2
    return s.slice(b0, s.indexOf('$$ language plpgsql security definer set search_path = public, pg_catalog;', b0))
  }
  const embedded = (f: string) => { const s = read(f); const a = s.indexOf('$body$') + 6; return s.slice(a, s.indexOf('$body$', a)) }

  it('L10-11: the Terms "Indicative figures" bullet, word for word', () => {
    expect(FREE_ACCOUNT_TERMS).toContain('Indicative figures: the figures in a free calculation are indicative. You remain responsible for checking them before you rely on them or use them in any filing, disclosure or decision (see Section 11).')
    expect(FREE_ACCOUNT_TERMS.join(' ')).not.toContain('until you have reviewed them')
  })

  it('L10-12: M8 changes only the PT402 sentence, from the exact L1-M2 body; both files NOT RUN', () => {
    const m8 = read('docs/review/patches/L10-M8-gate-message.sql')
    const verify = read('docs/review/patches/L10-M8-verify.sql')
    expect(m8.split('\n')[2]).toContain('⚠️ NOT RUN.')
    expect(verify.split('\n')[2]).toContain('⚠️ NOT RUN.')
    // The body both files carry is byte for byte the body L1-M2 installed (RUN 4 Oct 2026), with the old sentence once.
    const body = m2Body()
    expect(body.length).toBeGreaterThan(500)
    expect(embedded('docs/review/patches/L10-M8-gate-message.sql')).toBe(body)
    expect(embedded('docs/review/patches/L10-M8-verify.sql')).toBe(body)
    expect(body.split(OLD_GATE)).toHaveLength(2)
    expect(m8).toContain(`v_old      text := '${OLD_GATE}';`)
    expect(m8).toContain(`v_new      text := '${NEW_GATE}';`)
    // The function is rebuilt from the live body with replace(), never retyped.
    expect(m8).toContain('replace(v_src, v_old, v_new));')
    expect(m8).toContain('if v_src is distinct from v_expected then')
    expect(m8).toContain("if v_after <> replace(v_expected, v_old, v_new) or replace(v_after, v_new, v_old) <> v_expected then")
    // The verify script checks the body, both messages, and the behaviour each branch gives.
    for (const id of ['B1', 'B2', 'B3', 'B4', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']) expect(verify).toContain(`'${id} `)
    expect(verify).toContain(`'refused PT402: ${NEW_GATE}'`)
    expect(NEW_GATE).not.toContain('—')
  })

  it('L10-13: the Supply Chain save refusal, word for word', () => {
    const p = read('app/dashboard/supply-chain/page.tsx')
    expect(p).toContain("none: 'Saving a register needs the Supply Chain module. Your suppliers are still on screen; choose a plan to keep them.',")
    expect(p).not.toContain('Purchase to save them')
  })

  it('L10-14: dates and versions: Privacy v2.3 and Terms effective October 6, 2026; CLAUDE.md cites §14; both recorded', () => {
    // RET1 then moved Privacy to v2.4 on the same date (lib/ret1.test.ts).
    expect(read('app/privacy/page.tsx')).toMatch(/\{\['Effective: October 6, 2026', 'TIQ-PRV-001 · v2\.[34]',/)
    expect(read('app/terms/page.tsx')).toContain("{['Effective: October 6, 2026',")
    const claude = read('CLAUDE.md')
    expect(claude).toContain('Terms §14 is the liability cap')
    expect(claude).not.toContain('Terms §13')
    const readme = read('docs/policy-snapshots/README.md')
    expect(readme).toContain('`2026-10-privacy-v2.3.md` | Privacy Policy v2.3')
    expect(readme).toContain('`2026-10-terms.md` | Terms of Service effective October 6, 2026 (current)')
    expect(read('docs/policy-snapshots/2026-10-privacy-v2.3.md')).toContain(FREE_ACCOUNT_MARKETING)
    expect(read('docs/policy-snapshots/2026-10-terms.md')).toContain(FREE_ACCOUNT_TERMS_INTRO)
  })

  it('L10-15: of the four design section 8 rows, the two untrue ones changed and the others stand', () => {
    const ghg = read('app/dashboard/ghg/page.tsx')
    // Export overlay: untrue for a free account holder, so changed to the design's wording.
    expect(ghg).toContain('The module adds the downloads, the assurance package, Scope 3 and more inventories.')
    expect(ghg).toContain("'Save and update more than one inventory for 12 months from purchase',")
    expect(ghg).not.toContain('the assurance package and saving.')
    expect(ghg).not.toContain("'Save and update your inventory for 12 months from purchase'")
    // Renew wall, step 05 and the Scope 3 picker: not untrue for a free account holder, unchanged.
    expect(ghg).toContain("body: 'Renewing turns saving back on. Your existing inventories are still here and still readable: open any of them from your inventory list.',")
    expect(read('app/calculate-emissions/page.tsx')).toContain('<div className="vstep-title">Choose a plan, save and download</div>')
    expect(read('app/dashboard/scope3/page.tsx')).toContain('You need a saved GHG inventory first.')
  })
})

// L10, second amendment (6 Oct 2026): the checkout consent version, and the Supply Chain trigger message.
describe('L10 amendment 2', () => {
  let POST: (req: never) => Promise<Response>
  beforeAll(async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_not_real')
    POST = (await import('../app/api/webhooks/stripe/route')).POST as never
  })
  afterAll(() => { vi.unstubAllEnvs() })

  it('L10-16: a purchase records the new consent version, end to end', async () => {
    expect(PURCHASE_CONSENT_VERSION).toBe('2026-10-v3')
    expect(PURCHASE_CONSENT_VERSIONS).toEqual(['2026-06-v2-final', '2026-10-v3'])
    // The form sends it, and the checkout route falls back to it, never to a literal.
    const { CONSENT_VERSION } = await import('../app/components/ConsentForm')
    expect(CONSENT_VERSION).toBe(PURCHASE_CONSENT_VERSION)
    expect(read('app/api/checkout/route.ts')).toContain('consent_version: c!.version ?? PURCHASE_CONSENT_VERSION,')
    // The webhook records what checkout put in the metadata.
    written.consents.length = 0
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_v3', payment_status: 'paid', payment_intent: 'pi_v3', metadata: {
      user_id: 'u1', entitlements: 'supply-chain', business_name: 'Acme', business_reg_number: '123', purchaser_name: 'Pat',
      consent_business_capacity: 'true', consent_digital_access: 'true', consent_data_authority: 'true', consent_version: CONSENT_VERSION,
    } } } }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await POST(new Request('https://www.themisiq.co/api/webhooks/stripe', { method: 'POST', body: JSON.stringify(event), headers: { 'stripe-signature': 't' } }) as never)
    log.mockRestore()
    expect(res.status).toBe(200)
    expect(written.consents).toHaveLength(1)
    expect(written.consents[0]).toMatchObject({ stripe_session_id: 'cs_v3', consent_version: '2026-10-v3' })
  })

  it('L10-17: nothing still writes only the old version; every version maps to its record', () => {
    const hits: string[] = []
    for (const f of SOURCES) {
      if (f === 'lib/purchaseConsentVersion.ts') continue
      for (const line of read(f).split('\n')) {
        const t = line.trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('{/*')) continue
        if (line.includes("'2026-06-v2-final'")) hits.push(`${f}: ${t.slice(0, 100)}`)
      }
    }
    expect(hits).toEqual([])
    const readme = read('docs/policy-snapshots/README.md')
    for (const v of PURCHASE_CONSENT_VERSIONS) expect(readme).toContain(`| \`${v}\` |`)
    expect(read('docs/policy-snapshots/2026-10-terms.md')).toContain('record consent version **`2026-10-v3`**')
  })

  const DUMP_BODY = () => {
    const d = read('db/dumps/schema_public_20261001_1057.sql')
    const j = d.indexOf('CREATE FUNCTION public.enforce_supply_chain_entitlement()')
    const a = d.indexOf('$$', j) + 2
    return d.slice(a, d.indexOf('$$;', a))
  }
  const embedded = (f: string) => { const s = read(f); const a = s.indexOf('$body$') + 6; return s.slice(a, s.indexOf('$body$', a)) }
  const SC_NEW = 'Saving a register needs the Supply Chain module. Your suppliers are still on screen; choose a plan to keep them.'

  it('L10-18: M9 swaps only the never-bought sentence, from the exact live body; both files NOT RUN', () => {
    const m9 = read('docs/review/patches/L10-M9-supply-chain-message.sql')
    const verify = read('docs/review/patches/L10-M9-verify.sql')
    expect(m9.split('\n')[2]).toContain('⚠️ NOT RUN.')
    expect(verify.split('\n')[2]).toContain('⚠️ NOT RUN.')
    const body = DUMP_BODY()
    expect(body).toContain('purchase to save them.')
    expect(embedded('docs/review/patches/L10-M9-supply-chain-message.sql')).toBe(body)
    expect(embedded('docs/review/patches/L10-M9-verify.sql')).toBe(body)
    expect(m9).toContain(`v_new      text := '${SC_NEW}';`)
    expect(m9).toContain('replace(v_src, v_old, v_new));')
    expect(m9).toContain('if v_src is distinct from v_expected then')
    expect(m9).toContain('if v_after <> replace(v_expected, v_old, v_new) or replace(v_after, v_new, v_old) <> v_expected then')
    for (const id of ['B1', 'B2', 'B3', 'B4', 'S1', 'S2', 'S3']) expect(verify).toContain(`'${id} `)
    expect(verify).toContain(`'refused PT402: ${SC_NEW}'`)
  })

  it('L10-19: the page sentence equals the new trigger sentence, and the comment says when they match', () => {
    const p = read('app/dashboard/supply-chain/page.tsx')
    expect(p).toContain(`none: '${SC_NEW}',`)
    expect(p).toContain('THEY MATCH ONLY ONCE docs/review/patches/L10-M9-supply-chain-message.sql HAS RUN.')
    expect(p).not.toContain('deliberately identical')
    // The expired sentence already matches the live trigger.
    const expired = 'Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.'
    expect(p).toContain(`expired: '${expired}',`)
    expect(DUMP_BODY()).toContain(expired)
  })
})
