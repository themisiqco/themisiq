// app/dashboard/ghg/runthroughUx.test.ts
//
// T10c: the run-through UX fixes that live in the page component, pinned at source because the page's
// closures are not exported (the same approach as the other page source tests).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BILL_REVIEW_FAQ, CONFIRM_HELP_ID } from '../../climate-ghg/faq'
import { stripTsComments } from '../../../lib/testing/stripComments'

const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
const CODE = stripTsComments(PAGE)

describe('the GHG wizard after the run-through (T10c)', () => {
  it('a bill confirmed with no figure shows "Needs attention", not the green Confirmed', () => {
    expect(PAGE).toContain("const NEEDS_ATTENTION_BADGE = 'Needs attention'")
    expect(PAGE).toContain('{proposalNeedsAttention(p) ? NEEDS_ATTENTION_BADGE : PROPOSAL_BADGE[p.status]}')
    expect(PAGE).toContain("proposalNeedsAttention(p) ? null : <span style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56' }}>✓ Confirmed</span>")
  })

  it('the main Confirm is hidden while the month-only date confirmation is open', () => {
    expect(PAGE).toContain(') : periodEditing?.key === `${doc.id}:${pi}` && periodEditing.confirm ? null : (')
  })

  it('the message under a disabled Confirm links to the help entry, in a new tab', () => {
    expect(PAGE).toContain('href={`/climate-ghg#${CONFIRM_HELP_ID}`} target="_blank" rel="noopener noreferrer"')
    expect(PAGE).toContain("Why can&apos;t I confirm this bill?</a>")
  })

  it('the help entry is on the GHG module page, with its anchor and the ruled text', () => {
    expect(BILL_REVIEW_FAQ).toHaveLength(1)
    expect(BILL_REVIEW_FAQ[0].id).toBe(CONFIRM_HELP_ID)
    expect(BILL_REVIEW_FAQ[0].q).toBe("Why can't I confirm this bill?")
    expect(BILL_REVIEW_FAQ[0].a.startsWith("Before a bill counts towards your emissions, we need two things from it")).toBe(true)
    expect(BILL_REVIEW_FAQ[0].a.endsWith('so nothing incomplete goes to your customer, lender or verifier.')).toBe(true)
    expect(BILL_REVIEW_FAQ[0].a).not.toContain('—')
    const ghgPage = readFileSync(join(process.cwd(), 'app/climate-ghg/page.tsx'), 'utf8')
    expect(ghgPage).toContain('<ModuleFaq items={[...FAQ, ...BILL_REVIEW_FAQ, ...CONCIERGE_FAQ]} />')
    const faqComponent = readFileSync(join(process.cwd(), 'app/components/modulePage.tsx'), 'utf8')
    expect(faqComponent).toContain('<div key={q.q} id={q.id}')
  })

  it('an unsupported unit for a country does not read as the customer\'s mistake', () => {
    // FI1: the location-level sentence is gone. One unpriced line shows the engine's message, which says what
    // is not counted and what to enter instead, and the panel trailer says the rest is calculated and nothing
    // is lost. Neither tells the customer they made a mistake.
    expect(CODE).not.toMatch(/unpriceableMessage\(|unpriceablePanelMessage\(/)
    expect(PAGE).toContain("\"Everything else at this location is calculated and included in your totals. Nothing you've entered is lost.\"")
  })

  it('wording: dates in words on the review line, the electricity and gas hint, and totals in t CO2e', () => {
    expect(PAGE).toContain("{p.periodStart ? isoDateInWords(p.periodStart) : '?'} to {p.periodEnd ? isoDateInWords(p.periodEnd) : '?'}")
    expect(PAGE).toContain('· delivered {isoDateInWords(deliveryDateOf(docType, p))}')
    expect(PAGE).not.toContain('Sum of all 12 monthly bills')
    // T3b: the hint names the window's dates (windowWords, from periodWords).
    expect((PAGE.match(/hint=\{`Sum of the bills covering \$\{windowWords\.period\}`\}/g) ?? []).length).toBe(2)
    expect(CODE).not.toMatch(/\bmt\b(?! Scope)/)
    expect(CODE).not.toMatch(/ mt Scope|>mt<|mtCO|mt\/\$M/)
    expect(PAGE).toContain('t CO₂e Scope 1')
    expect(PAGE).toContain('${unitLabel(loc.natural_gas_unit)}')
  })
})
