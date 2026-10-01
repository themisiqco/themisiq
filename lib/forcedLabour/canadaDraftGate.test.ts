import { describe, it, expect } from 'vitest'
import { exportGate } from '../s211/exportCheck'
import { SINGLE_REPORT, allComplete } from '../s211/reportModel.fixtures'
import { DRAFT_KEY, OFFERED_KEY } from './drafts'

// Stage D1b follow-up: Canada's export is refused while an answer started from another country's report is saved
// unconfirmed. A Canada-only report never holds one, so its gate is unchanged.

describe('Canada’s export gate and drafts', () => {
  it('a finished Canada-only report is still ready', () => {
    expect(exportGate(allComplete(SINGLE_REPORT)).ready).toBe(true)
  })
  it('a saved draft blocks, naming the section and the field', () => {
    const s = allComplete(SINGLE_REPORT)
    s.training = { status: 'complete', content: { ...s.training!.content, [DRAFT_KEY]: { training_description: 'uk' } } }
    const g = exportGate(s)
    expect(g.ready).toBe(false)
    expect(g.blockers).toEqual([{ section: 'training', missing: ['What the training covers, and how it is reviewed'],
      message: '7. Training provided to employees: an answer started from another country’s report is not confirmed. Edit each, or confirm that it covers forced labour and child labour.' }])
  })
  it('an offered draft (never stored) does not', () => {
    const s = allComplete(SINGLE_REPORT)
    s.training = { status: 'complete', content: { ...s.training!.content, [OFFERED_KEY]: { training_description: 'uk' } } }
    expect(exportGate(s).ready).toBe(true)
  })
})
