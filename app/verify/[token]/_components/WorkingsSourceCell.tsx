// app/verify/[token]/_components/WorkingsSourceCell.tsx
//
// T11: THE SOURCE CELL OF ONE WORKINGS ROW ON THE VERIFIER PAGE. What the figure is, how it was entered, and, for a
// figure built from bills, every bill behind it: those that counted, then those that did not, each with its reason in
// words (workingsDocumentLines). Then who did what to it, and when (workingsWhoWhenLines). Rendered from the stored row
// only: nothing here imports the engine or recalculates anything.
//
// A row saved before per-bill contributions existed keeps the "From source" quote list it always had.
// "Read by AI" and "Read by {specialist}" are not shown here: that is BR9, and nothing records it yet.
//
// All text is read by a verifier: plain language, no em dash, no internal key.

import type { ReactNode } from 'react'
import { workingsDocumentLines, workingsSourceCell, workingsWhoWhenLines, type DocumentLine } from '../../../../lib/ghg/workingsCells'

type Contribution = Parameters<typeof workingsDocumentLines>[0]['contributions'] extends (infer C)[] | undefined ? C : never
export interface SourceCellRow {
  source: string; gwp_basis?: string
  entry_method?: string
  source_quotes?: string[]; source_file_paths?: string[]
  proration_note?: string; extrapolation_note?: string
  ch4_n2o_note?: string
  manual_override?: { reason: string; at: string; by: { email: string } }
  contributions?: (Contribution & { proposalIndex?: number })[]
  [k: string]: unknown
}

const badge = { marginLeft: 6, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' as const }
const plain = { ...badge, color: 'var(--color-ink-muted)', background: '#efeeec' }
const small = { marginTop: 2, fontSize: 11, fontWeight: 400, color: 'var(--color-ink-muted)', lineHeight: 1.45 } as const

export function WorkingsSourceCell({ w, fileOf, quoteOf, yearText, renderQuote, legacyDocIdOfPath }: {
  w: SourceCellRow
  /** A document's file name from its id, from the projected locations_data. */
  fileOf: (docId: string) => string
  /** The quote read off one reading of a document, where the projected locations_data still holds it. */
  quoteOf: (docId: string, proposalIndex: number | undefined) => string | null
  /** The reporting year in words, from reportingYearLabel. */
  yearText: string
  renderQuote: (quote: string, docId: string | undefined) => ReactNode
  /** Rows saved before contributions: the document behind a quote's storage path, for its link. */
  legacyDocIdOfPath: (path: string | undefined) => string | undefined
}) {
  const lines: DocumentLine[] = workingsDocumentLines(w as Parameters<typeof workingsDocumentLines>[0], fileOf, yearText)
  const indexOf = new Map((w.contributions ?? []).map(c => [c.docId, c.proposalIndex]))
  // Each bill's confirmation is on its own bill line above, so it is not repeated among these.
  const who = workingsWhoWhenLines(w as Parameters<typeof workingsWhoWhenLines>[0], fileOf, { billLines: lines.length > 0 })
  return (
    <>
      <span>{workingsSourceCell(w)}</span>
      {w.entry_method === 'concierge' && (
        <span style={{ ...badge, color: 'var(--color-brand)', background: 'color-mix(in srgb, var(--color-brand) 8%, transparent)' }}>Bill-sourced</span>
      )}
      {w.entry_method === 'concierge-prorated' && <span style={plain}>Bill-sourced, prorated</span>}
      {w.entry_method === 'concierge-extrapolated' && <span style={plain}>Estimated</span>}
      {/* T11: a figure entered by hand instead of from its bills. The reason, who and when are in the lines below. */}
      {w.manual_override && <span style={{ ...plain, color: '#0d0d0d' }}>Entered by hand</span>}
      {lines.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ ...small, fontWeight: 600 }}>Bills behind this figure</div>
          {lines.map(l => {
            const quote = quoteOf(l.docId, indexOf.get(l.docId))
            return (
              <div key={l.docId} style={{ ...small, color: l.counted ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}>
                {l.text}
                {quote && <span style={{ fontStyle: 'italic' }}> Read: {renderQuote(quote, l.docId)}</span>}
              </div>
            )
          })}
        </div>
      ) : w.source_quotes && w.source_quotes.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', fontWeight: 400, color: 'var(--color-ink-muted)' }}>From source: {w.source_quotes.map((q, qi) => (
          <span key={qi}>{qi > 0 && '; '}{renderQuote(q, legacyDocIdOfPath(w.source_file_paths?.[qi]))}</span>
        ))}</div>
      )}
      {w.proration_note && <div style={small}>Prorated by billing days: {w.proration_note}</div>}
      {w.extrapolation_note && <div style={small}>Estimated, {w.extrapolation_note}</div>}
      {/* FI9: methane and nitrous oxide a US road line could not count (no miles entered). */}
      {w.ch4_n2o_note && <div style={small}>{w.ch4_n2o_note}</div>}
      {who.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {who.map((l, i) => <div key={i} style={small}>{l}</div>)}
        </div>
      )}
    </>
  )
}
