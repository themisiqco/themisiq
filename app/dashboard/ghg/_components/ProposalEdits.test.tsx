// app/dashboard/ghg/_components/ProposalEdits.test.tsx
//
// T9: the dates and unit controls on a proposal, and what the review says about where they came from.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PeriodEditor, UnitEditor, ProposalNotes, unitEditable } from './ProposalEdits'
import { BILLING_MONTH_CONFIRM_MESSAGE, type ExtractedProposal } from '@/lib/ghg/engine'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o,
})
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const noop = () => {}

describe('dates editor', () => {
  it('the month-only step explains itself and confirms', () => {
    const html = renderToStaticMarkup(<PeriodEditor p={prop({ periodOrigin: 'billing_month' })} confirm message={BILLING_MONTH_CONFIRM_MESSAGE} by={BY} onSave={noop} onCancel={noop} />)
    expect(text(html)).toContain('This bill only shows the month, so we set the dates to the first and last day of it. Check them against the bill, correct them if needed, then confirm.')
    expect(text(html)).toContain('Billing period from')
    expect(html).toContain('>Confirm these dates</button>')
    expect(html).toContain('value="2025-01-01"')
  })
  it('editing outside acceptance saves the dates only; an unreadable date starts empty', () => {
    const html = renderToStaticMarkup(<PeriodEditor p={prop({ periodStart: 'Mar 2025' })} confirm={false} message={null} by={BY} onSave={noop} onCancel={noop} />)
    expect(html).toContain('>Save dates</button>')
    expect(html).toMatch(/aria-label="Billing period start"[^>]*value=""/)
  })
  it('without a signed-in user it cannot save', () => {
    const html = renderToStaticMarkup(<PeriodEditor p={prop({})} confirm={false} message={null} by={null} onSave={noop} onCancel={noop} />)
    expect(html).toMatch(/<button disabled=""[^>]*>Save dates<\/button>/)
  })
})

describe('unit editor', () => {
  it('offers the units the conversion handles, written for people', () => {
    const t = text(renderToStaticMarkup(<UnitEditor p={prop({})} by={BY} onSave={noop} onCancel={noop} />))
    expect(t).toContain('Unit on the bill')
    for (const u of ['Mcf', 'therms', 'MMBtu', 'm³', 'kWh', 'Ccf', 'GJ']) expect(t).toContain(u)
    expect(t).toContain('Save unit')
  })
  it('starts on the bill\'s own unit as read, normalised: "MJ" selects MJ', () => {
    const html = renderToStaticMarkup(<UnitEditor p={prop({ rawUnit: 'MJ', value: null, unit: null })} by={BY} onSave={noop} onCancel={noop} />)
    expect(html).toMatch(/<option value="mj" selected="">MJ<\/option>/)
  })
  it('is offered only where more than one unit is possible', () => {
    expect(unitEditable(prop({}))).toBe(true)
    expect(unitEditable(prop({ fuelType: 'electricity', unit: 'kwh', rawUnit: 'kwh' }))).toBe(true)
  })
})

describe('notes under a proposal', () => {
  it('a confirmed month-only bill whose days were never confirmed (legacy)', () => {
    expect(text(renderToStaticMarkup(<ProposalNotes p={prop({ periodConfidence: 'medium' })} />))).toContain('Dates estimated from the billing month')
  })
  it('changes, with who, when and the original reading', () => {
    const p = prop({
      rawUnit: 'mcf', asRead: { periodStart: '2025-01-01', periodEnd: '2025-01-31', unit: 'therms' },
      corrections: [{ fields: ['unit'], at: '2026-10-02T12:00:00.000Z', by: BY }],
    })
    const t = text(renderToStaticMarkup(<ProposalNotes p={p} />))
    expect(t).toContain('Changed by jo@acme.example on 2 October 2026: unit.')
    expect(t).toContain('Read from the bill: 1 January 2025 to 31 January 2025, therms.')
  })
  it('dates confirmed unchanged', () => {
    const p = prop({ periodOrigin: 'customer_confirmed', periodConfirmedAt: '2026-10-02T12:00:00.000Z', periodConfirmedBy: BY })
    expect(text(renderToStaticMarkup(<ProposalNotes p={p} />))).toContain('Dates confirmed by jo@acme.example on 2 October 2026.')
  })
  it('a rejected bill says who rejected it and when; an undo says so too', () => {
    const rejected = prop({ status: 'rejected', statusLog: [{ action: 'rejected', at: '2026-10-02T12:00:00.000Z', by: BY, statusBefore: 'confirmed' }] })
    expect(text(renderToStaticMarkup(<ProposalNotes p={rejected} />))).toContain('Rejected by jo@acme.example on 2 October 2026.')
    const undone = prop({ status: 'confirmed', statusLog: [...rejected.statusLog!, { action: 'undone', at: '2026-10-03T12:00:00.000Z', by: { userId: 'u-2', email: 'sam@acme.example' }, statusBefore: 'rejected' }] })
    const t = text(renderToStaticMarkup(<ProposalNotes p={undone} />))
    expect(t).toContain('Rejection undone by sam@acme.example on 3 October 2026.')
    expect(t).not.toContain('Rejected by')
  })

  it('a plain printed bill says nothing extra; nothing here has an em dash', () => {
    expect(renderToStaticMarkup(<ProposalNotes p={prop({ periodConfidence: 'high' })} />)).toBe('')
    const all = renderToStaticMarkup(<>
      <PeriodEditor p={prop({})} confirm message={BILLING_MONTH_CONFIRM_MESSAGE} by={BY} onSave={noop} onCancel={noop} />
      <UnitEditor p={prop({})} by={BY} onSave={noop} onCancel={noop} />
    </>)
    expect(all).not.toContain('—')
  })
})

describe('T18: notes for Confirm, Edit figure and Flag for review', () => {
  const AT = '2026-10-02T12:00:00.000Z'
  const reading = { value: 112, unit: 'therms', rawValue: 120, rawUnit: 'therms', periodStart: '2025-01-01', periodEnd: '2025-01-31', sourceQuote: 'q' }
  it('a confirmed reading says who confirmed it and when; an unconfirmed one does not', () => {
    const p = prop({ status: 'confirmed', confirmations: [{ at: AT, by: BY, reading }] })
    expect(text(renderToStaticMarkup(<ProposalNotes p={p} />))).toContain('Confirmed by jo@acme.example on 2 October 2026.')
    expect(renderToStaticMarkup(<ProposalNotes p={{ ...p, status: 'extracted' }} />)).not.toContain('Confirmed by')
  })
  it('an edited figure says what changed and shows the figure as printed on the bill', () => {
    const p = prop({ status: 'confirmed', value: 112, rawUnit: 'therms', unit: 'therms',
      asRead: { periodStart: '2025-01-01', periodEnd: '2025-01-31', unit: 'therms', value: 120, rawValue: 120 },
      corrections: [{ fields: ['value'], at: AT, by: BY }], confirmations: [{ at: AT, by: BY, reading }] })
    const t = text(renderToStaticMarkup(<ProposalNotes p={p} />))
    expect(t).toContain('Changed by jo@acme.example on 2 October 2026: figure.')
    expect(t).toContain('Read from the bill: 1 January 2025 to 31 January 2025, 120 therms.')
    expect(t).not.toContain('—')
  })
  it('several fields in one change are listed in order', () => {
    const p = prop({ asRead: { periodStart: '2025-01-01', periodEnd: '2025-01-31', unit: 'mcf' }, corrections: [{ fields: ['value', 'period', 'unit'], at: AT, by: BY }] })
    expect(text(renderToStaticMarkup(<ProposalNotes p={p} />))).toContain('Changed by jo@acme.example on 2 October 2026: billing dates, unit and figure.')
  })
  it('a flagged reading says who flagged it and when', () => {
    const p = prop({ status: 'needs_manual_review', statusLog: [{ action: 'flagged', at: AT, by: BY, statusBefore: 'extracted' }] })
    expect(text(renderToStaticMarkup(<ProposalNotes p={p} />))).toContain('Flagged for review by jo@acme.example on 2 October 2026.')
  })
})
