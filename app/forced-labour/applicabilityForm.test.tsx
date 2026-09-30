// app/forced-labour/applicabilityForm.test.tsx
// The applicability form's layout (30 Sep 2026): segmented answers, formatted amounts, one currency, the
// folded size step. What the test engines receive must not change.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import {
  evaluateApplicability, parseAmountInput, formatAmount, withCurrency, formCurrency, currenciesDiffer, isListed, noCanadaConnection,
  formToReportPatch, type ApplicabilityForm,
} from '@/lib/s211/applicability'
import { FX_AS_OF } from '@/lib/fx'
import { longDate } from '@/lib/s211/reportModel'
import { ApplicabilityQuestions } from '@/app/dashboard/forced-labour/_components/Applicability'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const draw = (form: ApplicabilityForm) => renderToStaticMarkup(<ApplicabilityQuestions form={form} onChange={() => {}} />)
const text = (h: string) => h.replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&ldquo;|&rdquo;/g, '"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('amounts: shown with separators, stored and tested as plain numbers', () => {
  it('typing with or without separators stores digits only', () => {
    expect(parseAmountInput('25,000,000')).toBe('25000000')
    expect(parseAmountInput('25 000 000 $')).toBe('25000000')
    expect(parseAmountInput('1,234.5.6')).toBe('1234.56')
    expect(parseAmountInput('')).toBe('')
  })
  it('the field shows thousands separators', () => {
    expect(formatAmount('25000000')).toBe('25,000,000')
    expect(formatAmount('250')).toBe('250')
    expect(formatAmount('1234.5')).toBe('1,234.5')
    expect(formatAmount('00042')).toBe('42')
    expect(formatAmount(undefined)).toBe('')
  })
  it('the engines receive the same numbers as before', () => {
    const typed = { place_of_business_in_canada: 'yes', recent_fy_assets: parseAmountInput('25,000,000'), recent_fy_revenue: parseAmountInput('45,000,000'), recent_fy_avg_employees: '100' }
    const plain = { place_of_business_in_canada: 'yes', recent_fy_assets: '25000000', recent_fy_revenue: '45000000', recent_fy_avg_employees: '100' }
    expect(evaluateApplicability(typed)).toEqual(evaluateApplicability(plain))
    expect(evaluateApplicability(typed).entity.outcome).toBe('entity')
    expect(formToReportPatch(typed)).toMatchObject({ recent_fy_assets: 25e6, recent_fy_revenue: 45e6 })
  })
})

describe('one currency for the whole form', () => {
  it('defaults to CAD, and choosing one applies it to both years, the keys the engine reads', () => {
    expect(formCurrency({})).toBe('CAD')
    const f = withCurrency({ recent_fy_assets: '15000000', prior_fy_assets: '15000000' }, 'USD')
    expect(f).toMatchObject({ recent_fy_currency: 'USD', prior_fy_currency: 'USD' })
    const r = evaluateApplicability({ ...f, place_of_business_in_canada: 'yes' })
    for (const y of r.entity.years) expect(y.limbs[0].note).toContain('Converted from USD')
  })
  it('two saved years in different currencies are noticed', () => {
    expect(currenciesDiffer({ recent_fy_currency: 'USD', prior_fy_currency: 'CAD' })).toBe(true)
    expect(currenciesDiffer({ recent_fy_currency: 'USD', prior_fy_currency: 'USD' })).toBe(false)
  })
  it('the currency list is lib/fx.ts\'s, CAD first, and the rate date is named', () => {
    const h = draw({})
    expect(h).toMatch(/<select id="fl-currency"[^>]*><option value="CAD"[^>]*>CAD<\/option>/)
    expect(text(h)).toContain(`converted to Canadian dollars at the ECB reference rates of ${longDate(FX_AS_OF)}, the rates this module uses`)
  })
})

describe('segmented answers', () => {
  it('connection questions offer Yes and No; goods questions Yes, No and Not sure: the dropdowns\' values exactly', () => {
    const h = draw({})
    for (const k of ['listed_in_canada', 'place_of_business_in_canada', 'does_business_in_canada', 'has_assets_in_canada']) {
      expect([...h.matchAll(new RegExp(`name="${k}" value="([a-z-]+)"`, 'g'))].map(m => m[1])).toEqual(['yes', 'no'])
    }
    for (const k of ['producesGoods', 'sellsGoods', 'distributesGoods', 'importsGoods', 'controlsEntityWithGoodsActivity']) {
      expect([...h.matchAll(new RegExp(`name="${k}" value="([a-z-]+)"`, 'g'))].map(m => m[1])).toEqual(['yes', 'no', 'not-sure'])
    }
  })
  it('nothing selected is not answered; a saved answer shows as selected', () => {
    expect(draw({})).not.toMatch(/checked=""/)
    expect(draw({ sellsGoods: 'not-sure' })).toContain('name="sellsGoods" checked="" value="not-sure"')
    expect(draw({ sellsGoods: 'not-sure' }).match(/checked=""/g)).toHaveLength(1)
  })
  it('each group is a labelled radio group, and choosing the selected answer again clears it', () => {
    const h = draw({})
    expect(h).toContain('<legend>Listed on a stock exchange in Canada</legend>')
    expect(h).toContain('role="radiogroup" aria-label="Does it import into Canada goods produced outside Canada?"')
    expect(read('app/dashboard/forced-labour/_components/Applicability.tsx')).toContain("onClick={() => { if (value === o.value) onChange('') }}")
  })
  it('the buttons wrap on a phone rather than overflow', () => {
    const css = read('app/dashboard/forced-labour/_components/Applicability.tsx')
    expect(css).toMatch(/\.fl-seg \{ display: flex; flex-wrap: wrap;/)
    expect(css).toMatch(/\.fl-q \{ display: flex; flex-wrap: wrap;/)
    expect(css).toContain('minmax(min(100%, 260px), 1fr)')
  })
})

describe('three steps, and the size step folded for a listed entity', () => {
  it('three numbered steps with a heading and a line each', () => {
    const t = text(draw({}))
    const at = ['1 Your connection to Canada', '2 Your size', '3 What you do with goods'].map(s => t.indexOf(s))
    expect(at.every(i => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it('amount fields: text with a numeric keyboard, no spinner, each year labelled', () => {
    const h = draw({})
    expect(h).toMatch(/id="fl-recent-assets" type="text" inputMode="decimal"/)
    expect(h).not.toContain('type="number"')
    expect(text(h)).toContain('Most recent financial year')
    expect(text(h)).toContain('The financial year before it')
  })
  it('listed in Canada: step 2 folds, with the Act\'s reason, and entered figures still reach the test', () => {
    const f = { listed_in_canada: 'yes', recent_fy_revenue: '45000000' }
    expect(isListed(f)).toBe(true)
    const t = text(draw(f))
    expect(t).toContain('Size does not matter for an entity listed on a stock exchange in Canada. Section 2 of the Act makes it an entity if it \u201Cis listed on a stock exchange in Canada\u201D')
    expect(t).not.toContain('Currency of your financial statements')
    const r = evaluateApplicability(f)
    expect(r.entity.years[0].limbs.find(l => l.measure === 'revenue')!.value).toBe(45e6)
  })
  it('no connection to Canada: a note, and step 2 stays open', () => {
    const f = { listed_in_canada: 'no', place_of_business_in_canada: 'no', does_business_in_canada: 'no', has_assets_in_canada: 'no' }
    expect(noCanadaConnection(f)).toBe(true)
    const t = text(draw(f))
    expect(t).toContain('The size conditions only matter for an entity with a connection to Canada. Section 2 of the Act applies them to one that \u201Chas a place of business in Canada, does business in Canada or has assets in Canada\u201D')
    expect(t).toContain('Currency of your financial statements')
    expect(noCanadaConnection({ ...f, has_assets_in_canada: '' })).toBe(false)
  })
})

describe('the check page', () => {
  const src = read('app/forced-labour/canada/check/page.tsx')
  it('the heading, and the Act named in the intro', () => {
    expect(src).toContain('Does Canada&rsquo;s forced labour reporting law apply to you?')
    expect(src).toContain('A free check against the {CANADA.law} ({CANADA.shortName}). Answer the questions that decide whether it')
    expect(src).not.toContain('turns on')
    expect(src).toContain("margin: '0 0 2rem'")
  })
  it('the result sits beside the steps on a wide screen and after them on a phone', () => {
    expect(src).toContain('<div className="fl-check">')
    expect(src).toContain('<aside className="fl-side"')
    expect(read('app/dashboard/forced-labour/_components/Applicability.tsx')).toContain('@media (min-width: 980px)')
  })
  it('house style', () => {
    const all = src + read('app/dashboard/forced-labour/_components/Applicability.tsx') + read('lib/s211/applicability.ts')
    expect(all).not.toContain('—')
    expect(all).not.toMatch(new RegExp(`\\b${'ch'}${'ase'}\\b`, 'i'))
  })
})
