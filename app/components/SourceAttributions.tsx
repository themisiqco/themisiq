import type { SourceAttribution } from '../../lib/ghg/defraPublication'

/**
 * The licence attributions for the figures on a surface, one line per publisher: the required wording
 * verbatim, then the licence, linked, which OGL v3.0 asks for "where possible".
 *
 * ONE RENDERER for the GHG wizard's workings and the verifier page, so the two cannot print the
 * attribution differently. Renders nothing when no recorded licence applies; see sourceAttributionsFor
 * for why that is the absence of a record, not a finding that none is owed.
 */
export default function SourceAttributions({ attributions, style }: { attributions: readonly SourceAttribution[]; style?: React.CSSProperties }) {
  if (attributions.length === 0) return null
  return (
    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.5, ...style }}>
      {attributions.map(a => (
        <p key={a.publisher} style={{ margin: 0 }}>
          {a.publisher}: {a.attribution}{' '}
          <a href={a.licence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{a.licence}</a>
        </p>
      ))}
    </div>
  )
}
