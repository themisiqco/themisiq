import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildResultsEmail, resultsEmailModel, RESULTS_EMAIL_COPY, RESULTS_EMAIL_FROM, RESULTS_EMAIL_REPLY_TO,
  SOURCE_LINE_LIMIT, plain, perUnitFactor, editionAddsSomething, type SavedInventoryRow,
} from './resultsEmail'
import { SITE_ORIGIN } from '../siteOrigin'
import { sendResultsEmail } from './resultsEmailSend'
import { inventoryFromDraft, inventoryRow } from './freeCalc'
import { claimFreeCalc, emailResultsAgain, sendClaimEmail, RESULTS_AGAIN_MESSAGES, type ClaimDeps } from './freeCalcService'
import { calcInventory, deriveLocations } from './engine'
import { GHG_TIERS } from '../pricing'

// The results email (LEAD1 L5, Oct 2026; docs/review/design-lead1.md section 2). The fixture is made by the real save
// path (inventoryFromDraft, then inventoryRow, which runs figuresForSave), so the email is tested against a row shaped
// exactly as the claim route writes it.

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const NOW = new Date('2026-10-05T12:00:00Z')
const SITE = 'https://www.themisiq.co'

const us = (i: number) => ({ id: `us${i}`, name: `Plant ${i}`, country: 'US', grid_region: 'US_AVG', electricity_kwh: 10000 * i, has_natural_gas: true, natural_gas_amount: 100 * i, natural_gas_unit: 'therms' })
const nz = { id: 'nz1', name: 'Auckland office', country: 'NZ', grid_region: 'NZ', electricity_kwh: 100000, nz_td_losses: true }
const draft = { company_name: 'L4 Test Co', reporting_year: 2025, locations: [nz, ...Array.from({ length: 8 }, (_, i) => us(i + 1))] }

const inv = inventoryFromDraft(draft as never, 'L4 Test Co', NOW)
const saved = (free = true, over: Partial<SavedInventoryRow> = {}): SavedInventoryRow =>
  ({ ...inventoryRow(inv, 'user-1', 'co-1', free, NOW), id: 'inv-1', ...over }) as unknown as SavedInventoryRow
const engine = calcInventory(deriveLocations(inv), 'AR6', 2025)
const build = (row = saved(), fullName: string | null = 'dr. Jean-Luc O’Brien-Ng') => buildResultsEmail({ row, fullName, siteUrl: SITE })
const model = (row = saved()) => resultsEmailModel({ row, fullName: 'Pat', siteUrl: SITE })

describe('the results email', () => {
  it('R1: the subject, and the greeting with the name exactly as typed', () => {
    const e = build()
    expect(e.subject).toBe('Your Scope 1 and Scope 2 results: L4 Test Co, 2025')
    expect(e.text.split('\n')[0]).toBe('Hello dr. Jean-Luc O’Brien-Ng,')
    expect(e.html).toContain('Hello dr. Jean-Luc O’Brien-Ng,')
    expect(build(saved(), null).text.split('\n')[0]).toBe('Hello,')
    expect(e.text).toContain('Here are the results you calculated on ThemisIQ.')
  })

  it('R2: the totals are the saved columns, rounded as step 4 shows them', () => {
    const m = model()
    const row = saved()
    expect(m.totals.scope1).toBe(row.scope1_total)
    expect(m.totals.scope1).toBeCloseTo(engine.s1_total, 9)
    expect(m.totals.scope2Location).toBeCloseTo(engine.s2_location, 9)
    const e = build()
    expect(e.text).toContain(`Scope 1: ${engine.s1_total.toFixed(2)} tCO₂e`)
    expect(e.text).toContain(`Scope 2, location-based: ${engine.s2_location.toFixed(2)} tCO₂e`)
    expect(e.text).toContain(`Scope 2, market-based: ${engine.s2_market.toFixed(2)} tCO₂e`)
  })

  it('R3: Scope 2 market-based only where computed', () => {
    const gasOnly = inventoryFromDraft({ company_name: 'Gas Co', reporting_year: 2025, locations: [{ ...us(1), electricity_kwh: 0 }] } as never, 'Gas Co', NOW)
    const row = { ...inventoryRow(gasOnly, 'u', 'c', true, NOW), id: 'g' } as unknown as SavedInventoryRow
    expect(resultsEmailModel({ row, fullName: null, siteUrl: SITE }).totals.scope2Market).toBeNull()
    expect(buildResultsEmail({ row, fullName: null, siteUrl: SITE }).text).not.toContain('market-based')
  })

  it('R4: the transmission and distribution line, labelled exactly and kept out of the totals', () => {
    const m = model()
    expect(engine.s3_td).toBeGreaterThan(0)
    expect(m.s3td).toBeCloseTo(engine.s3_td, 9)
    const e = build()
    expect(RESULTS_EMAIL_COPY.s3td).toBe('Scope 3, Category 3: electricity transmission and distribution losses, calculated automatically from your electricity use. Full Scope 3 needs a GHG plan.')
    expect(e.text).toContain(`${RESULTS_EMAIL_COPY.s3td}\n${engine.s3_td.toFixed(2)} tCO₂e. Not included in the totals above.`)
    // Not added in: the totals are the S1 and S2 columns as saved, which the engine never folds it into.
    expect(m.totals.scope2Location).toBeCloseTo(engine.s2_location, 9)
    expect(m.totals.scope1 + m.totals.scope2Location).not.toBeCloseTo(engine.s1_total + engine.s2_location + engine.s3_td, 6)
    // And it is not a by-source line either: it has its own line.
    expect(m.sourceLines.join('\n')).not.toContain('T&D')
  })

  it('R5: by location: each site, its country and grid region, Scope 1 and Scope 2', () => {
    const m = model()
    expect(m.locations).toHaveLength(9)
    const a = m.locations.find(l => l.name === 'Auckland office')!
    expect(a).toMatchObject({ country: 'New Zealand', gridRegion: 'New Zealand', scope1: 0 })
    const p3 = m.locations.find(l => l.name === 'Plant 3')!
    expect(p3.country).toBe('United States')
    expect(p3.gridRegion).toBe('United States national average')
    expect(p3.scope1).toBeGreaterThan(0)
    expect(p3.scope2).toBeGreaterThan(0)
    expect(build().text).toContain(`Plant 3 (United States, grid region ${p3.gridRegion}): Scope 1 ${p3.scope1!.toFixed(2)} tCO₂e, Scope 2 ${p3.scope2!.toFixed(2)} tCO₂e`)
    // The sites add up to the saved totals.
    expect(m.locations.reduce((s, l) => s + (l.scope1 ?? 0), 0)).toBeCloseTo(m.totals.scope1, 6)
    expect(m.locations.reduce((s, l) => s + (l.scope2 ?? 0), 0)).toBeCloseTo(m.totals.scope2Location, 6)
  })

  it('R6: by source: the saved workings lines, at most 15, then "and N more lines in your account"', () => {
    const m = model()
    const priced = (saved().workings as Array<{ scope?: number; result_tco2e?: number | null }>)
      .filter(r => (r.scope === 1 || r.scope === 2) && typeof r.result_tco2e === 'number' && (r as { scope2_method?: string }).scope2_method !== 'market-based')
    expect(priced.length).toBeGreaterThan(SOURCE_LINE_LIMIT)
    expect(m.sourceLines).toHaveLength(15)
    expect(m.moreLines).toBe(priced.length - 15)
    expect(build().text).toContain(`and ${priced.length - 15} more lines in your account`)
    expect(m.sourceLines[0]).toMatch(/ tCO₂e$/)
    expect(RESULTS_EMAIL_COPY.moreLines(1)).toBe('and 1 more line in your account')
  })

  it('R7: the factor editions as saved, and the GWP basis', () => {
    const row = saved()
    const m = model(row)
    expect(m.gwpBasis).toBe('AR6')
    const eds = Object.values(row.factor_editions ?? {}).flatMap(f => Object.values(f ?? {}))
    expect(eds.length).toBeGreaterThan(0)
    for (const ed of eds) {
      const line = m.editions.find(l => l.includes(plain(ed!.source)))
      expect(line, ed!.source).toBeTruthy()
      // The edition is printed only when the source's name does not already carry it (amendment 2).
      expect(line!.includes(`edition ${ed!.edition}`)).toBe(editionAddsSomething(ed!.source, String(ed!.edition)))
    }
    expect(build().text).toContain('GWP basis: AR6')
    expect(model(saved(true, { factor_editions: {} })).editions).toEqual([])
    expect(build(saved(true, { factor_editions: {} })).text).toContain(RESULTS_EMAIL_COPY.noEditions)
  })

  it('R8: saved line and link, free or on a plan; the next step with the price from lib/pricing.ts, for a free account', () => {
    const free = build(saved(true))
    expect(free.text).toContain(`This calculation is saved in your free ThemisIQ account. Open it any time: ${SITE}/dashboard/ghg?id=inv-1`)
    expect(free.text).toContain(`Plans start at $${GHG_TIERS.starter.priceUSD} USD a year.`)
    const plan = build(saved(false))
    expect(plan.text).toContain(`This calculation is saved in your ThemisIQ account. Open it any time: ${SITE}/dashboard/ghg?id=inv-1`)
    expect(plan.text).not.toContain('Plans start at')
  })

  it('R9: the footer; no traceability claim, no em dash, no image, nothing unescaped', () => {
    const e = build(saved(true, { company_name: 'A <b>&</b> Co' }))
    const footer = 'ThemisIQ, 11 Oak Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada. Questions: hello@themisiq.co. You received this because you asked for your results on themisiq.co.'
    expect(e.text.trim().endsWith(footer)).toBe(true)
    expect(e.html).toContain(footer)
    for (const part of [e.text, e.html, e.subject]) {
      expect(part.toLowerCase()).not.toContain('traceable')
      expect(part).not.toContain('—')
    }
    expect(e.html).not.toMatch(/<img|<script/i)
    expect(e.html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; Co')
    expect(read('lib/ghg/resultsEmail.ts')).toContain('L6: the marketing unsubscribe link goes here')
  })
})

describe('sending', () => {
  // ⚠️ NO TEST HERE MAY READ THE REAL RESEND_API_KEY (L5 fix1, 5 Oct 2026). sendResultsEmail falls back to
  // process.env.RESEND_API_KEY when it is passed no key, and Vercel Preview and Production set it while a local run
  // does not, so "no key" passed locally and failed the Preview build. Every case below fixes the variable itself.
  afterEach(() => { vi.unstubAllEnvs() })

  it('R10: from hello@themisiq.co with reply-to hello@themisiq.co, both parts; a refusal is reported, never thrown', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; auth: string }> = []
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization })
      return new Response(JSON.stringify({ id: 'em-1' }), { status: 200 })
    }) as unknown as typeof fetch
    expect(await sendResultsEmail('pat@example.com', build(), ok, 'k')).toEqual({ ok: true, id: 'em-1' })
    expect(calls[0].url).toBe('https://api.resend.com/emails')
    expect(calls[0].body).toMatchObject({ from: RESULTS_EMAIL_FROM, reply_to: RESULTS_EMAIL_REPLY_TO, to: ['pat@example.com'], subject: build().subject })
    expect(RESULTS_EMAIL_FROM).toBe('ThemisIQ <hello@themisiq.co>')
    expect(RESULTS_EMAIL_REPLY_TO).toBe('hello@themisiq.co')
    expect(typeof calls[0].body.html).toBe('string')
    expect(typeof calls[0].body.text).toBe('string')
    const refused = (async () => new Response('bad', { status: 422 })) as unknown as typeof fetch
    expect(await sendResultsEmail('a@b.co', build(), refused, 'k')).toEqual({ ok: false, reason: 'resend_422' })
    const down = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await sendResultsEmail('a@b.co', build(), down, 'k')).toEqual({ ok: false, reason: 'network' })
    // No key passed and none in the environment: nothing is sent, whatever the machine running this has set.
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await sendResultsEmail('a@b.co', build(), ok, undefined)).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('R10b: with no key passed, the environment\'s key is used', async () => {
    let auth = ''
    const ok = (async (_url: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).Authorization
      return new Response(JSON.stringify({ id: 'em-2' }), { status: 200 })
    }) as unknown as typeof fetch
    vi.stubEnv('RESEND_API_KEY', 'env-key-not-real')
    expect(await sendResultsEmail('a@b.co', build(), ok)).toEqual({ ok: true, id: 'em-2' })
    expect(auth).toBe('Bearer env-key-not-real')
  })
})

describe('on claim, and again', () => {
  const base = (over: Partial<ClaimDeps> = {}) => {
    const sent: Array<{ to: string; text: string }> = []
    const deps: ClaimDeps = {
      user: { id: 'user-1', email: 'pat@example.com' }, now: NOW,
      getAccess: async () => 'none', listOwnInventories: async () => [],
      resolveCompany: async () => ({ id: 'co-1' }), insertInventory: async () => ({ id: 'inv-1' }),
      replaceFreeInventory: async () => ({ updated: 1 }), getPendingById: async () => null, latestPending: async () => null,
      deletePendingForEmail: async () => {}, upsertProfile: async () => {},
      readSavedRow: async () => saved(true), profileFullName: async () => 'Profile Name',
      sendResults: async (to, e) => { sent.push({ to, text: e.text }); return { ok: true, id: 'em' } },
      siteUrl: SITE, ...over,
    }
    return { deps, sent }
  }

  it('R11: a claim emails the SAVED row to the verified address, never the client’s figures or an address from the request', async () => {
    const { deps, sent } = base({ readSavedRow: async () => saved(true, { scope1_total: 999.5 }) })
    const r = await claimFreeCalc({ inventory: draft, fullName: 'Pat Lee', company: 'L4 Test Co', email: 'someone@else.com' }, deps)
    expect(r).toMatchObject({ status: 200, body: { ok: true, emailed: true } })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('pat@example.com')
    expect(sent[0].text).toContain('Scope 1: 999.50 tCO₂e')
    expect(sent[0].text.split('\n')[0]).toBe('Hello Pat Lee,')
  })

  it('R12: a failed email never undoes the save: 200, emailed false', async () => {
    for (const over of [
      { sendResults: async () => ({ ok: false as const, reason: 'resend_500' }) },
      { readSavedRow: async () => null },
      { readSavedRow: async () => { throw new Error('db') } },
    ]) {
      const { deps } = base(over)
      expect(await claimFreeCalc({ inventory: draft, fullName: 'Pat', company: 'L4 Test Co' }, deps)).toMatchObject({ status: 200, body: { ok: true, emailed: false } })
    }
    // A claim with no name in hand greets by the profile's name.
    const { deps, sent } = base()
    expect(await sendClaimEmail(deps, 'inv-1', null)).toBe(true)
    expect(sent[0].text.split('\n')[0]).toBe('Hello Profile Name,')
  })

  it('R13: "Email me my results again": own calculation only, to the session’s address, rate-limited', async () => {
    const again = (over: Record<string, unknown> = {}) => {
      const { deps, sent } = base(over as Partial<ClaimDeps>)
      return { deps: { ...deps, rateLimitOk: async () => (over.limited ? false : true) }, sent }
    }
    expect(await emailResultsAgain({}, again().deps)).toMatchObject({ status: 400, body: { message: RESULTS_AGAIN_MESSAGES.noId } })
    expect(await emailResultsAgain({ id: 'x' }, again({ limited: true }).deps)).toMatchObject({ status: 429, body: { message: RESULTS_AGAIN_MESSAGES.rateLimited } })
    // RLS returns nothing for another account's id.
    expect(await emailResultsAgain({ id: 'theirs' }, again({ readSavedRow: async () => null }).deps)).toMatchObject({ status: 404, body: { message: RESULTS_AGAIN_MESSAGES.notFound } })
    expect(await emailResultsAgain({ id: 'inv-1' }, again({ sendResults: async () => ({ ok: false, reason: 'network' }) }).deps)).toMatchObject({ status: 502, body: { message: RESULTS_AGAIN_MESSAGES.sendFailed } })
    const ok = again()
    expect(await emailResultsAgain({ id: 'inv-1', to: 'someone@else.com' }, ok.deps)).toEqual({ status: 200, body: { ok: true, message: "We've emailed your results to pat@example.com." } })
    expect(ok.sent[0].to).toBe('pat@example.com')
  })

  it('R14: the routes wire the real sender and read the row as the user', () => {
    const claim = read('app/api/ghg/free-calc/claim/route.ts')
    const email = read('app/api/ghg/free-calc/email/route.ts')
    for (const src of [claim, email]) {
      expect(src).toContain('sendResults: (to, email) => sendResultsEmail(to, email),')
      expect(src).toContain(".from('ghg_inventories').select(RESULTS_EMAIL_COLUMNS).eq('id', id).maybeSingle()")
      expect(src).toContain('const db = authed.supabase')
    }
    expect(email).toContain("bucket: 'results-email'")
    const page = read('app/dashboard/ghg/page.tsx')
    expect(page).toContain("fetch('/api/ghg/free-calc/email'")
    expect(page).toContain('data-email-results="again"')
    expect(page).toContain('{keptMessage}{keptEmailed && <> {keptEmailed}</>}')
  })
})

describe('L5 amendment', () => {
  it('R15: no engine grid code anywhere in the email', () => {
    const e = build()
    for (const code of ['US_AVG', '(NZ)', 'grid region NZ', 'US_', 'CAMX']) {
      expect(e.text).not.toContain(code)
      expect(e.html).not.toContain(code)
    }
  })

  it('R16: the market-based basis line names what the engine used, read from the saved rows', () => {
    // No residual mix applies to a US site with no eGRID subregion chosen, or to New Zealand: the engine prices
    // market-based at the location grid factor and labels the row "location-factor fallback".
    const m = model()
    const market = (saved().workings as Array<{ scope2_method?: string; source?: string }>).filter(r => r.scope2_method === 'market-based')
    expect(market.every(r => r.source === 'Electricity (S2 market-based, location-factor fallback)')).toBe(true)
    expect(m.marketBasis).toBe('No green power contracts or certificates were entered, so this uses the same grid factors as the location-based figure.')
    expect(build().text).toContain(`Scope 2, market-based: ${engine.s2_market.toFixed(2)} tCO₂e\n${m.marketBasis}`)
  })

  it('R17: a residual mix is named as one, with its citation; contractual instruments are said to count as zero', () => {
    const withMix = inventoryFromDraft({ company_name: 'Mix Co', reporting_year: 2025, locations: [
      { ...us(1), residual_region: 'CAMX', renewable_electricity_kwh: 4000 },
    ] } as never, 'Mix Co', NOW)
    const row = { ...inventoryRow(withMix, 'u', 'c', true, NOW), id: 'm' } as unknown as SavedInventoryRow
    const basis = resultsEmailModel({ row, fullName: null, siteUrl: SITE }).marketBasis!
    expect(basis).toBe('Electricity not covered by contracts you entered uses the WECC California residual mix. Electricity covered by contracts or certificates you entered counts as zero.')
  })

  it('R18: the send-limit refusal says "3 times an hour"', () => {
    expect(RESULTS_AGAIN_MESSAGES.rateLimited).toBe('Your results can be emailed 3 times an hour. Try again later.')
  })
})

describe('L5 amendment 2', () => {
  it('R19: by source has no market-based line; the market-based rows stay in the saved workings', () => {
    const t = build().text
    expect(t).not.toContain('market-based,')
    expect(t).not.toContain('uncovered')
    expect((saved().workings as Array<{ scope2_method?: string }>).some(r => r.scope2_method === 'market-based')).toBe(true)
  })

  it('R20: contracts entered, no residual mix: the grid sentence for what is not covered, and the zero sentence', () => {
    const inv2 = inventoryFromDraft({ company_name: 'C', reporting_year: 2025, locations: [{ ...us(1), renewable_electricity_kwh: 2000 }] } as never, 'C', NOW)
    const row = { ...inventoryRow(inv2, 'u', 'c', true, NOW), id: 'c' } as unknown as SavedInventoryRow
    expect(resultsEmailModel({ row, fullName: null, siteUrl: SITE }).marketBasis).toBe(
      'Electricity not covered by contracts you entered uses the same grid factors as the location-based figure. Electricity covered by contracts or certificates you entered counts as zero.')
  })

  it('R21: singular units after "kg CO\u2082e/", and "tCO\u2082e" in both parts, never "tCO2e"', () => {
    expect(perUnitFactor('5.31171 kg CO\u2082e/therms')).toBe('5.31171 kg CO\u2082e/therm')
    expect(perUnitFactor('0.2152 kg CO\u2082e/kWh')).toBe('0.2152 kg CO\u2082e/kWh')
    expect(perUnitFactor('2.1 kg CO\u2082e/US gallons')).toBe('2.1 kg CO\u2082e/US gallon')
    expect(perUnitFactor('1.9 kg CO\u2082e/m\u00b3')).toBe('1.9 kg CO\u2082e/m\u00b3')
    const e = build()
    expect(e.text).toContain('kg CO\u2082e/therm =')
    for (const part of [e.text, e.html]) { expect(part).not.toContain('tCO2e'); expect(part).not.toContain('/therms') }
    expect(e.html).toContain('tCO\u2082e')
  })

  it('R22: an edition already in the source name is not repeated; one that adds something is kept', () => {
    expect(editionAddsSomething('US EPA eGRID2023', '2023')).toBe(false)
    expect(editionAddsSomething('US EPA (2024) Emission Factors for Greenhouse Gas Inventories', 'US EPA 2024')).toBe(false)
    expect(editionAddsSomething('NZ MfE Measuring Emissions 2026 v2', '2025')).toBe(true)
    const t = build().text
    expect(t).toContain('United States, Electricity: US EPA eGRID2023\n')
    expect(t).not.toContain('edition 2023')
  })

  it('R23: the link is on the Site URL origin, from one constant, used by both routes', () => {
    expect(SITE_ORIGIN).toBe('https://themisiq.co')
    for (const f of ['app/api/ghg/free-calc/claim/route.ts', 'app/api/ghg/free-calc/email/route.ts']) {
      const src = read(f)
      expect(src).toContain('siteUrl: SITE_ORIGIN,')
      expect(src).not.toContain('www.themisiq.co')
      expect(src).not.toContain('NEXT_PUBLIC_SITE_URL')
    }
  })
})
