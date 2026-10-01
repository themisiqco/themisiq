import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  UK_TURNOVER_THRESHOLD_GBP, AU_REVENUE_THRESHOLD_AUD, ukTurnoverInScope, auRevenueInScope, assessTiming,
  UK_ASSESS_WHO, UK_ASSESS_CONTENT, AU_ASSESS_WHO, AU_ASSESS_CONTENT, UK_ASSESS_TIMING, AU_ASSESS_TIMING,
} from './assessSummary'
import { UK_MSA_S54_2, UK_REGS_2 } from './uk/requirements'
import { AU_MSA_S5_1, AU_MSA_S13_2, AU_MSA_S16_1 } from './au/requirements'
import { computeObligations, UNANSWERED, type RevenueAnswer } from '@/app/assess/page'

// Every single-select spelled out as UNANSWERED on purpose, as app/assess/obligations.test.ts does.
const UNANSWERED_ALL = {
  driver: UNANSWERED, revenue: UNANSWERED, employees: UNANSWERED, listing: UNANSWERED, ownership: UNANSWERED,
  ai_use: UNANSWERED, supply_chain: UNANSWERED,
} as const
const REVENUE_750M: RevenueAnswer = 5

describe('the thresholds are the law’s, at the boundary', () => {
  it('UK: £36 million, "not less than", so exactly £36 million is in scope', () => {
    expect(UK_REGS_2).toContain('£36 million')
    expect(UK_MSA_S54_2.paragraphs[1].text).toContain('not less than')
    expect(UK_TURNOVER_THRESHOLD_GBP).toBe(36_000_000)
    expect(ukTurnoverInScope(36_000_000)).toBe(true)
    expect(ukTurnoverInScope(35_999_999.99)).toBe(false)
    expect(ukTurnoverInScope(36_000_000.01)).toBe(true)
  })

  it('Australia: "at least $100 million", so exactly AUD 100 million is in scope', () => {
    expect(AU_MSA_S5_1.paragraphs[0].text).toContain('at least $100 million')
    expect(AU_REVENUE_THRESHOLD_AUD).toBe(100_000_000)
    expect(auRevenueInScope(100_000_000)).toBe(true)
    expect(auRevenueInScope(99_999_999.99)).toBe(false)
  })

  it('/assess calls these, and no longer compares the UK figure with >', () => {
    const page = readFileSync(join(process.cwd(), 'app/assess/page.tsx'), 'utf8')
    expect(page).toContain("ukTurnoverInScope(revIn('GBP'))")
    expect(page).toContain("auRevenueInScope(revIn('AUD'))")
    expect(page).not.toMatch(/revIn\('GBP'\)\s*>\s*36_000_000/)
  })
})

describe('the per-country wording', () => {
  it('UK: who is covered, and the statement of steps taken, or that none were', () => {
    expect(UK_ASSESS_WHO).toContain('a body corporate or partnership')
    expect(UK_ASSESS_WHO).toContain('supplies goods or services')
    expect(UK_ASSESS_WHO).toContain('not less than GBP 36,000,000')
    expect(UK_ASSESS_CONTENT).toBe('The Act requires, for each financial year, a statement of the steps the organisation has taken during the financial year to ensure that slavery and human trafficking is not taking place in any of its supply chains and in any part of its own business, or a statement that the organisation has taken no such steps. The six areas in s.54(5) are recommended, not required.')
  })

  it('Australia: the seven mandatory criteria, each as the Act words it', () => {
    expect(AU_ASSESS_WHO).toContain('at least AUD 100,000,000')
    expect(AU_ASSESS_CONTENT).toContain('the 7 mandatory criteria in s.16(1): (a) identify the reporting entity; (b) describe the structure, operations and supply chains of the reporting entity;')
    for (const p of AU_MSA_S16_1.paragraphs) expect(AU_ASSESS_CONTENT).toContain(`(${p.letter}) `)
    expect(AU_ASSESS_CONTENT).toMatch(/considers relevant\.$/)
  })

  it('timing: the UK six months is a recommendation, the Australian one is law', () => {
    expect(AU_MSA_S13_2.paragraphs[4].text).toContain('within 6 months after the end of the reporting period')
    expect(UK_ASSESS_TIMING).toContain('the Act sets no deadline')
    expect(assessTiming(true, false)).toBe(UK_ASSESS_TIMING)
    expect(assessTiming(false, true)).toBe(AU_ASSESS_TIMING)
    expect(assessTiming(true, true)).toBe(`${UK_ASSESS_TIMING} · ${AU_ASSESS_TIMING}`)
  })

  it('our sentences carry no em-dash, and no unverified review claim', () => {
    for (const s of [UK_ASSESS_WHO, UK_ASSESS_CONTENT, AU_ASSESS_WHO, AU_ASSESS_CONTENT, UK_ASSESS_TIMING, AU_ASSESS_TIMING]) {
      expect(s).not.toContain('—')
      expect(s).not.toMatch(/statutory review|December 2024|50,000,000/)
    }
  })
})

describe('/assess shows that wording', () => {
  const ms = (jurisdictions: string[]) => computeObligations({ ...UNANSWERED_ALL, jurisdictions, revenue: REVENUE_750M })
    .find(o => o.obligationId === 'modern-slavery')!

  it('UK only', () => {
    const o = ms(['uk'])
    expect(o.timing).toBe(UK_ASSESS_TIMING)
    expect(o.what).toContain(UK_ASSESS_WHO)
    expect(o.what).toContain(UK_ASSESS_CONTENT)
    expect(o.what).not.toContain('Australian Modern Slavery Act')
  })

  it('both, without the removed review sentence', () => {
    const o = ms(['uk', 'australia'])
    expect(o.jurisdiction).toBe('UK + Australia')
    expect(o.timing).toBe(assessTiming(true, true))
    expect(o.what).toContain(AU_ASSESS_CONTENT)
    expect(o.what).not.toMatch(/statutory review|December 2024|transparency statement is required/)
  })

  it('unanswered revenue still produces no entry', () => {
    expect(computeObligations({ ...UNANSWERED_ALL, jurisdictions: ['uk', 'australia'] })
      .find(o => o.obligationId === 'modern-slavery')).toBeUndefined()
  })
})
