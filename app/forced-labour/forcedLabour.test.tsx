// app/forced-labour/forcedLabour.test.tsx
// Stage 5b: the marketing page, the free check, the module on every surface, the /assess rule and the
// hand-off of the check's answers into the first report.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../components/Nav', () => ({ default: () => null }))
vi.mock('@/app/components/Footer', () => ({ default: () => null }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import * as R from '@/lib/s211/requirements'
import { S211_THRESHOLDS } from '@/lib/s211/entity'
import { evidenceClaim, EVIDENCE_BY_MODULE } from '@/lib/modulePages'
import { OBLIGATIONS } from '@/lib/obligations'
import { evaluateApplicability, formToReportPatch, formToActivities, parseApplicabilityDraft } from '@/lib/s211/applicability'
import { cleanReportPatch } from '@/lib/s211/reportPatch'
import { computeObligations, UNANSWERED } from '../assess/page'
import { COUNTRIES, MODULE_SUBTITLE, CANADA_CHECK } from '@/lib/forcedLabour/countries'

const { default: Page, metadata } = await import('./page')
const { default: CanadaPage, metadata: canadaMeta } = await import('./canada/page')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const decode = (h: string) => h.replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const rawOverview = renderToStaticMarkup(<Page />)
const html = decode(rawOverview)
const canada = decode(renderToStaticMarkup(<CanadaPage />))
const inOrder = (text: string, order: string[]) => {
  const at = order.map(s => text.indexOf(s))
  expect(at.every(i => i >= 0), `missing: ${order.filter((_, i) => at[i] < 0)}`).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
}

describe('the country list (lib/forcedLabour/countries.ts)', () => {
  it('only Canada is available; the others are not, and carry no page', () => {
    expect(COUNTRIES.map(c => [c.key, c.status, c.href])).toEqual([
      ['canada', 'available', '/forced-labour/canada'], ['australia', 'not-yet', null], ['uk', 'not-yet', null],
    ])
    expect(COUNTRIES.filter(c => c.status !== 'available').every(c => c.href === null)).toBe(true)
  })

  it('on the overview, a country not yet available is plain text: never a link, never an order button, never a date', () => {
    for (const c of COUNTRIES.filter(c => c.status !== 'available')) {
      const li = new RegExp(`<li data-country="${c.key}"[^>]*>(.*?)</li>`).exec(rawOverview)?.[1]
      expect(li, c.key).toBeDefined()
      expect(li, c.key).not.toMatch(/<a |href=|\/order|\bOrder\b/)
      expect(decode(li!)).toContain(`${c.name} ${c.law} Not yet available`)
      expect(decode(li!)).not.toMatch(/\b20\d\d\b(?! )|\bin (Q[1-4]|early|late|spring|summer|fall|autumn|winter)\b/i)
    }
    const ca = /<li data-country="canada"[^>]*>(.*?)<\/li>/.exec(rawOverview)![1]
    expect(ca).toContain('href="/forced-labour/canada"')
    expect(decode(ca)).toContain('Available')
  })

  it('no other country is offered for sale or given a date anywhere on the module\'s pages or cards', () => {
    const surfaces = [html, canada, read('app/dashboard/page.tsx'), read('app/components/HomePricing.tsx'), read('app/pricing/page.tsx'), read('app/order/page.tsx')]
    for (const t of surfaces) {
      expect(t).not.toMatch(/(Australia|United Kingdom|UK)[^.]{0,40}(available now|order|\$1,499|coming in|from 20)/i)
    }
  })

  it('the builder\'s Start form lists every country, with only the available ones selectable', () => {
    const list = read('app/dashboard/forced-labour/page.tsx')
    expect(list).toContain("disabled={c.status !== 'available'}")
    expect(list).toContain('value="canada"')
  })
})

describe('/forced-labour, the module overview', () => {
  it('hero, the country list straight after it, then the general sections, pricing, FAQ and closing band', () => {
    inOrder(html, ['Forced Labour Reporting module', 'country by country', 'Check if Canada’s Act applies (free)', 'Order the module, $1,499/yr',
      'Choose your country', 'How it works', 'How you stand behind it', 'One flat annual price.', 'Questions people ask first',
      'Not sure whether Canada’s Act applies to you?'])
    expect(html).toContain('A growing number of countries require companies to report on the risk of forced labour and child labour in their supply chains.')
  })

  it('metadata with a canonical', () => {
    expect(metadata.alternates).toEqual({ canonical: '/forced-labour' })
  })

  it('the pricing card says what the price includes today', () => {
    expect(html).toContain('$1,499 /yr, includes the Canada report')
  })

  it('a general FAQ only: what it does, how countries are added, the term ending, screening not advice', () => {
    for (const q of ['What does the module do?', 'Which countries does it cover, and how are more added?', 'What happens when our term ends?', 'Is the applicability result legal advice?'])
      expect(html, q).toContain(q)
    for (const canadaOnly of ['When is the report due?', 'We only sell or distribute goods', 'Can one report cover several companies?', 'May 31', 'Public Safety Canada’s questionnaire'])
      expect(html, canadaOnly).not.toContain(canadaOnly)
    expect(html).toContain('download the PDF of any report that is complete')
  })

  it('the evidence claim is country-neutral and fits a narrative report', () => {
    expect(EVIDENCE_BY_MODULE['forced-labour']).toBe('sources')
    expect(evidenceClaim('forced-labour')).toBe('Every sentence the report says about your organization comes from your own answers. Every quotation of the law or its official guidance is transcribed word for word from the source, with the date it was read.')
    expect(html).toContain(evidenceClaim('forced-labour'))
  })
})

describe('/forced-labour/canada', () => {
  it('breadcrumb, hero with the Act, then what the Act asks, what the module covers, the chip, the FAQ and the closing band', () => {
    inOrder(canada, ['Forced Labour Reporting / Canada', 'Fighting Against Forced Labour and Child Labour in Supply Chains Act (S-211)',
      'Check if Canada’s Act applies (free)', 'How people arrive here', 'What the Act asks', 'What the module covers for Canada', 'Canada S-211',
      'Questions people ask first', 'Not sure whether Canada’s Act applies to you?'])
    expect(canadaMeta.alternates).toEqual({ canonical: '/forced-labour/canada' })
    expect(String(canadaMeta.title)).toContain('Canada S-211')
  })

  it('the Canadian facts, each from a verified constant', () => {
    expect(canada).toContain(`CAD ${S211_THRESHOLDS.assetsCad / 1e6} million in assets, CAD ${S211_THRESHOLDS.revenueCad / 1e6} million in revenue, and an average of ${S211_THRESHOLDS.averageEmployees} employees`)
    expect(canada).toContain('On or before May 31 each year')
    expect(R.S211_ACT_SECTION_11_1).toContain('on or before May 31 of each year')
    expect(canada).toContain(R.S211_GUIDANCE_FORMAT)
    expect(canada).toContain('make the report available to the public, including by publishing it in a prominent place on its website')
    expect(R.S211_ACT_SECTION_13_1).toContain('make the report available to the public, including by publishing it in a prominent place on its website')
    expect(canada).toContain(R.S211_GUIDANCE_SELL_DISTRIBUTE_ONLY)
    expect(canada).toContain(R.S211_GUIDANCE_JOINT_REPORT[2])
    expect(canada).toContain('its structure, activities and supply chains')
    expect(canada).toContain('Public Safety Canada’s questionnaire')
    expect(canada).toContain('$1,499/yr, includes the Canada report')
  })

  it('the Canadian FAQ', () => {
    for (const q of ['Who has to report?', 'When is the report due?', 'What does the report contain?', 'Does the module file the report for us?',
      'We only sell or distribute goods. Do we have to report?', 'Can one report cover several companies?', 'Is the result of the check legal advice?'])
      expect(canada, q).toContain(q)
  })
})

describe('house style on both pages and the check', () => {
  it('no em-dash, no "chase", no "best value", no invented percentage', () => {
    const src = read('app/forced-labour/page.tsx') + read('app/forced-labour/canada/page.tsx') + read('app/forced-labour/canada/check/page.tsx') + read('lib/forcedLabour/countries.ts')
    for (const t of [html, canada]) {
      expect(t).not.toContain('—')
      expect(t).not.toMatch(/best value|best-value/i)
      expect(t.replace(/−10%|−20%/g, '')).not.toMatch(/\d+%/)
      expect(t).not.toContain('&rsquo;')
    }
    expect(src).not.toMatch(new RegExp(`\\b${'ch'}${'ase'}\\b`, 'i'))
  })
})

describe('the module on every surface', () => {
  it('the subtitle, with the Canada S-211 chip kept', () => {
    const sub = MODULE_SUBTITLE
    expect(sub).toBe('Supply chain reports, country by country. Available now: Canada (S-211).')
    for (const f of ['app/dashboard/page.tsx', 'app/components/Nav.tsx', 'app/page.tsx', 'app/components/HomePricing.tsx', 'app/pricing/page.tsx'])
      expect(read(f), f).toContain(sub)
    expect(read('app/dashboard/page.tsx')).toContain("frameworks: ['Canada S-211'],")
    expect(read('app/page.tsx')).toContain("chips: ['Canada S-211'] }")
    expect(read('app/order/page.tsx')).toContain("'forced-labour': 'Forced Labour Reporting (includes the Canada report)'")
  })

  it('dashboard card, owned on purchase: the entitlement key maps to the card, which opens the builder', () => {
    const d = read('app/dashboard/page.tsx')
    expect(d).toContain("id: 'forced_labour'")
    expect(d).toContain("href: '/dashboard/forced-labour'")
    expect(d).toContain("'forced-labour': ['forced_labour'],")
    expect(d).toContain('const KEY_TO_CARD_IDS: Record<ModuleKey, string[]>')
  })

  it('nav, footer, sitemap and homepage go to the overview; the sitemap lists the Canada page and its check', () => {
    expect(read('app/components/Nav.tsx')).toContain("href: '/forced-labour', label: 'Forced Labour Reporting'")
    expect(read('app/components/Footer.tsx')).toContain("{ label: 'Forced Labour Reporting', href: '/forced-labour' }")
    expect(read('app/page.tsx')).toContain("href: '/forced-labour',")
    const sm = read('app/sitemap.ts')
    for (const r of ["'/forced-labour',", "'/forced-labour/canada',", "'/forced-labour/canada/check',"]) expect(sm).toContain(r)
    expect(sm).not.toContain("'/forced-labour/check'")
    const pricing = read('app/pricing/page.tsx')
    expect(pricing).toMatch(/VALID_MODULE_IDS: ModuleId\[\] = \['ghg', 'cbam', 'risk', 'impact', .*'forced-labour'\]/)
  })

  it('Canada-specific links go to the Canada page or its check', () => {
    expect(read('app/frameworks/page.tsx')).toContain("covers: [{ href: '/forced-labour/canada', label: 'Prepare the report' }, { href: '/deals', label: 'Test a deal target' }]")
    expect(read('app/dashboard/deals/page.tsx')).toContain('href="/forced-labour/canada"')
    expect(read('app/supply-chain/page.tsx')).toContain('href="/forced-labour/canada"')
    expect(read('app/assess/page.tsx')).toContain('/forced-labour/canada/check')
    for (const f of ['app/components/HomePricing.tsx', 'app/pricing/page.tsx']) expect(read(f), f).toContain("'/forced-labour/canada/check'")
  })
})

describe('the free check', () => {
  it('uses the builder\'s engines: the same answers give the same result as a report\'s home', () => {
    const form = { listed_in_canada: 'no', place_of_business_in_canada: 'yes', recent_fy_assets: '25000000', recent_fy_revenue: '45000000', recent_fy_avg_employees: '100', recent_fy_currency: 'CAD', producesGoods: 'yes' }
    const r = evaluateApplicability(form)
    expect(r.entity.outcome).toBe('entity')
    expect(r.obligation.outcome).toBe('must-report')
    expect(r.unanswered).toBe(4)
    expect(read('app/forced-labour/canada/check/page.tsx')).toContain('<ApplicabilityQuestions form={form} onChange={set} />')
    expect(read('app/dashboard/forced-labour/[id]/page.tsx')).toContain('<ApplicabilityQuestions form={form} onChange={set} />')
  })

  it('stores nothing on a server: no API call, only this browser\'s draft', () => {
    const src = read('app/forced-labour/canada/check/page.tsx')
    expect(src).not.toMatch(/s211Api|fetch\(|\.from\(|\.rpc\(/)
    expect(src).toContain('saveDraft(DRAFT_KEYS.forcedLabourCheck')
  })

  it('the answers carry into the first report: the draft becomes a valid report patch and section 1\'s goods answers', () => {
    const draft = parseApplicabilityDraft({ listed_in_canada: 'yes', recent_fy_revenue: '45000000', recent_fy_currency: 'usd', sellsGoods: 'yes', junk: 'x', recent_fy_assets: 12 })!
    expect(draft).toEqual({ listed_in_canada: 'yes', recent_fy_revenue: '45000000', recent_fy_currency: 'usd', sellsGoods: 'yes' })
    const patch = cleanReportPatch(formToReportPatch(draft))
    expect(patch.ok).toBe(true)
    if (patch.ok) expect(patch.patch).toMatchObject({ listed_in_canada: true, recent_fy_revenue: 45e6, recent_fy_currency: 'USD', place_of_business_in_canada: null })
    expect(formToActivities(draft)).toMatchObject({ sellsGoods: 'yes', producesGoods: '' })
    expect(parseApplicabilityDraft({ listed_in_canada: '' })).toBeNull()
    const list = read('app/dashboard/forced-labour/page.tsx')
    expect(list).toContain('readDraft(DRAFT_KEYS.forcedLabourCheck, parseApplicabilityDraft)')
    expect(list).toContain('clearDraft(DRAFT_KEYS.forcedLabourCheck)')
  })

  it('is linked from the hero and from the builder\'s preview state', () => {
    expect(html).toContain('Check if Canada\u2019s Act applies (free)')
    expect(read('app/forced-labour/page.tsx')).toContain('href={CANADA_CHECK}')
    expect(read('app/forced-labour/canada/page.tsx')).toContain('href={CANADA_CHECK}')
    expect(read('app/dashboard/forced-labour/page.tsx')).toContain('href={CANADA_CHECK}')
    expect(CANADA_CHECK).toBe('/forced-labour/canada/check')
  })
})

describe('/assess and lib/obligations.ts', () => {
  const base = { driver: UNANSWERED, revenue: UNANSWERED, employees: UNANSWERED, listing: UNANSWERED, ownership: UNANSWERED, ai_use: UNANSWERED, supply_chain: UNANSWERED } as const
  const s211 = (a: object) => computeObligations({ ...base, ...a } as never).find(o => o.obligationId === 'canada-s211')

  it('the obligation points to Forced Labour Reporting', () => {
    expect(OBLIGATIONS['canada-s211'].modules).toEqual(['forced-labour'])
  })
  it('Canada, revenue over the line and 250 or more employees: likely in scope', () => {
    const o = s211({ jurisdictions: ['canada'], revenue: 1, employees: '250_499' })!
    expect(o.urgency_label).toBe('LIKELY IN SCOPE')
    expect(o.module).toBe('Forced Labour Reporting')
    expect(o.what).toContain(`CAD ${S211_THRESHOLDS.revenueCad / 1e6} million in revenue`)
  })
  it('the revenue band that straddles CAD 40 million settles nothing, and says what would', () => {
    expect(s211({ jurisdictions: ['canada'], revenue: 0, employees: '250_499' })!.urgency_label).toBe('CHECK YOUR FIGURES')
    expect(s211({ jurisdictions: ['canada'], revenue: 5, employees: 'under50' })!.urgency_label).toBe('CHECK YOUR FIGURES')
  })
  it('nothing for a company not in Canada', () => {
    expect(s211({ jurisdictions: ['uk'], revenue: 5, employees: '250_499' })).toBeUndefined()
  })
})
