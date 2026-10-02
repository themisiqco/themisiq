// app/dashboard/ghg/_components/FigureInput.test.tsx
//
// T10: a figure's three states on step 2: typed, from documents (with the switch to manual), and overridden.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FigureInput } from './FigureInput'
import { emptyLocation, type Location, type ExtractedProposal } from '@/lib/ghg/engine'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const prop: ExtractedProposal = { fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed' }
const withDoc = (o: Partial<Location> = {}): Location => ({ ...emptyLocation('L1', 'Site A'), natural_gas_amount: 100, ...o,
  source_docs: [{ id: 'a', file_name: 'a.pdf', document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: '/a.pdf', extracted: [prop] }] })
const draw = (loc: Location, by: typeof BY | null = BY) => renderToStaticMarkup(
  <FigureInput loc={loc} field="natural_gas_amount" onChange={() => {}} style={{}} by={by} onOverride={() => {}} onUseBills={() => {}} />)
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('FigureInput', () => {
  it('typed: an editable input and nothing else', () => {
    const h = draw({ ...emptyLocation('L1', 'Site A'), natural_gas_amount: 40 })
    expect(h).toMatch(/^<input id="figure-L1-natural_gas_amount" type="number"[^>]*value="40"/)
    expect(h).not.toContain('From ')
  })
  it('from documents: read-only, with the switch to manual', () => {
    const h = draw(withDoc())
    expect(h).toContain('readOnly=""')
    expect(text(h)).toContain('From 1 document')
    expect(h).toContain('>Enter this figure manually instead</button>')
  })
  it('plural documents read correctly', () => {
    const two: Location = { ...withDoc(), source_docs: [...withDoc().source_docs, { ...withDoc().source_docs[0], id: 'b' }] }
    expect(text(draw(two))).toContain('From 2 documents')
    const over = { ...two, manual_overrides: [{ field: 'natural_gas_amount', reason: 'r', at: '2026-10-02T12:00:00.000Z', by: BY }] }
    expect(text(draw(over))).toContain('instead of from 2 documents.')
  })

  it('the switch needs a signed-in user', () => {
    expect(draw(withDoc(), null)).toMatch(/<button disabled=""[^>]*>Enter this figure manually instead<\/button>/)
  })
  it('overridden: editable again, saying who, when and why, with the way back', () => {
    const h = draw(withDoc({ natural_gas_amount: 250, manual_overrides: [{ field: 'natural_gas_amount', reason: 'Bill covers two sites', at: '2026-10-02T12:00:00.000Z', by: BY }] }))
    expect(h).toMatch(/id="figure-L1-natural_gas_amount" type="number"[^>]*value="250"/)
    expect(h).not.toContain('readOnly')
    expect(text(h)).toContain('Entered manually by jo@acme.example on 2 October 2026 instead of from 1 document. Reason: Bill covers two sites')
    expect(h).toContain('>Use the bills instead</button>')
    expect(h).not.toContain('—')
  })
})
