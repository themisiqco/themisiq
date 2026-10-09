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
import { workingsSourceParts, type DocumentLine } from '../../../../lib/ghg/workingsCells'

type Contribution = NonNullable<Parameters<typeof workingsSourceParts>[0]['contributions']>[number]
export interface SourceCellRow {
  source: string; gwp_basis?: string
  entry_method?: string
  source_quotes?: string[]; source_file_paths?: string[]
  proration_note?: string; extrapolation_note?: string
  ch4_n2o_note?: string
  manual_override?: { reason: string; at: string; by: { email: string } }
  contributions?: Contribution[]
  [k: string]: unknown
}

const badge = { marginLeft: 6, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' as const }
const plain = { ...badge, color: 'var(--color-ink-muted)', background: '#efeeec' }
const small = { marginTop: 2, fontSize: 11, fontWeight: 400, color: 'var(--color-ink-muted)', lineHeight: 1.45 } as const
// The colours each badge has always had on this page. The words come from workingsSourceParts.
const BADGE_STYLE: Record<string, React.CSSProperties> = {
  'Bill-sourced': { ...badge, color: 'var(--color-brand)', background: 'color-mix(in srgb, var(--color-brand) 8%, transparent)' },
  'Entered by hand': { ...plain, color: '#0d0d0d' },
}

/**
 * T17: the parts are built by workingsSourceParts (lib/ghg/workingsCells.ts), the same function the assurance PDF prints
 * from (sourcePartsLines), so a row says the same sentences on both. This renders them, with quote links.
 */
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
  const p = workingsSourceParts(w as Parameters<typeof workingsSourceParts>[0], fileOf, quoteOf, yearText)
  const bills: (DocumentLine & { quote: string | null })[] = p.bills
  return (
    <>
      {/* The stored label, with any region named in words (displaySourceLabel, LBL-01). */}
      <span>{p.label}</span>
      {p.badges.map(b => <span key={b} style={BADGE_STYLE[b] ?? plain}>{b}</span>)}
      {bills.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ ...small, fontWeight: 600 }}>Bills behind this figure</div>
          {bills.map(l => (
            <div key={l.docId} style={{ ...small, color: l.counted ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}>
              {l.text}
              {l.quote && <span style={{ fontStyle: 'italic' }}> Read: {renderQuote(l.quote, l.docId)}</span>}
            </div>
          ))}
        </div>
      ) : p.legacyQuotes.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', fontWeight: 400, color: 'var(--color-ink-muted)' }}>From source: {p.legacyQuotes.map((q, qi) => (
          <span key={qi}>{qi > 0 && '; '}{renderQuote(q.quote, legacyDocIdOfPath(q.path))}</span>
        ))}</div>
      )}
      {p.notes.map((n, i) => <div key={`n${i}`} style={small}>{n}</div>)}
      {p.who.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {p.who.map((l, i) => <div key={i} style={small}>{l}</div>)}
        </div>
      )}
    </>
  )
}
