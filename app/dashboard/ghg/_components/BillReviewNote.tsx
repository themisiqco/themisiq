// app/dashboard/ghg/_components/BillReviewNote.tsx
//
// BR4: what a document with the Bill Review team says in the wizard's document list. The team's records reach the
// document list through BillReviewContext (the page fills it on load and when the page becomes visible again), so
// none of the document slots needs a new prop. All text here is shown to the customer: plain language, no em dash.

import { createContext, useContext } from 'react'
import type { SourceDoc } from '../../../../lib/ghg/engine'
import { isWaiting, type BillReviewRow } from '../../../../lib/billReview/billState'
import { withTeamLine, SUBMIT_FAILED_NOTE, correctionNotice } from '../../../../lib/billReview/waitingWords'

export type BillReviewState = { rows: Record<string, BillReviewRow>; submitFailed: Record<string, true> }
export const BillReviewContext = createContext<BillReviewState>({ rows: {}, submitFailed: {} })

/** The line a bill with the team shows instead of its stored note, or null when it is not with the team. */
export function billReviewLine(doc: SourceDoc, s: BillReviewState): string | null {
  if (doc.bill_review?.reading !== 'human') return null
  const row = s.rows[doc.file_path]
  if (!isWaiting(doc, row)) return null
  if (!row && s.submitFailed[doc.id]) return SUBMIT_FAILED_NOTE
  return row ? withTeamLine(row.expected_by) : null
}

/** A specialist's correction held back because the customer had acted on the reading it corrects (ruling 5). */
export function correctionLines(doc: SourceDoc): string[] {
  return (doc.bill_review?.correctionsPending ?? []).map(c => {
    const p = (doc.extracted ?? []).find(x => x.readBy?.readingId === c.supersedes)
    return correctionNotice(c, p?.status === 'rejected' ? 'rejected' : 'confirmed')
  })
}

const line = { marginTop: 4, marginLeft: 14, fontSize: 11, lineHeight: 1.5, color: '#555553' } as const

export function BillReviewDocNotes({ doc }: { doc: SourceDoc }) {
  const s = useContext(BillReviewContext)
  const waiting = billReviewLine(doc, s)
  const corrections = correctionLines(doc)
  if (!waiting && corrections.length === 0) return null
  return (
    <>
      {waiting && <div style={line}>{waiting}</div>}
      {corrections.map((c, i) => <div key={i} style={{ ...line, color: 'var(--color-state-warn)' }}>{c}</div>)}
    </>
  )
}
