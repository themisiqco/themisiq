/**
 * Stakeholder-survey evidence — the shared renderers.
 *
 * ⚠️ EXTRACTED FROM app/dashboard/materiality/survey/[id]/results/page.tsx, VERBATIM, so there is
 * ONE renderer of a distribution and ONE renderer of the five counters. The results screen and the
 * preparer's determination form now draw the same evidence from the same code.
 *
 * The reason is not tidiness. The GHG module already paid for the alternative: a second, hand-rolled
 * derivation of the workings rows in renderStep4 drifted from the engine's own, and CLAUDE.md now
 * carries the rule as an invariant — "app/dashboard/ghg/page.tsx RENDERS buildWorkings() output;
 * never re-derive workings rows in the component. There is ONE renderer." Evidence a preparer scores
 * against is exactly as load-bearing, and a second renderer here would drift the same way: the
 * results screen and the worksheet would show the same survey differently, and both would look right.
 *
 * ⚠️ WHAT IS SHARED IS THE RENDERER, NOT THE LAYOUT. The results screen lays these out as a
 * reference table; the determination form lays them out beside a judgement, per sub-topic. The
 * composition differs because the context does. The bar, the counters, the band labels and the
 * median convention do not.
 *
 * ⚠️ NO MEAN. ANYWHERE. Spec v10/v11 §6.2.5 — the screening scale is ordinal. A single marker on a
 * line is how a mean gets back in through the picture even when none is computed, which is why the
 * distribution is three bands with printed counts and never a position.
 */

'use client'

import type { CSSProperties } from 'react'

export const EV_BLUE = '#0C447C'
export const EV_AMBER = 'var(--color-module-climate)'
export const EV_AMBER_BG = '#FEF3E2'
export const EV_BRAND = 'var(--color-brand)'
export const EV_INK = '#0d0d0d'
export const EV_MID = '#555553'
export const EV_MUTE = 'var(--color-ink-muted)'
export const EV_LINE = '#e8e7e4'
export const EV_PAPER = '#f8f7f5'

const BRAND = EV_BRAND
const BLUE = EV_BLUE
const AMBER = EV_AMBER
const INK = EV_INK
const MID = EV_MID
const MUTE = EV_MUTE
const LINE = EV_LINE
const PAPER = EV_PAPER

/**
 * ⚠️ THE BAND LABELS ARE THE RESPONDENT'S OWN WORDS, ABBREVIATED ONLY FOR THE LEGEND.
 * The full §5.1 text is printed once at the head of section 4, because a reader looking at a
 * top_box of 1.00 has to be able to find out what "3" actually said. Paraphrasing it into
 * "high priority" would restate the question as importance-in-the-abstract, which is precisely
 * what the maturity framing was chosen to avoid.
 */
export const BANDS = [
  { v: '1' as const, short: 'Sufficient',        bg: '#dbe8f4', fg: BLUE,
    full: 'Existing programs are sufficient; continuous improvement is appropriate' },
  { v: '2' as const, short: 'Improvements help', bg: '#fae3c0', fg: '#8a5510',
    full: 'Existing programs are sufficient, but improvements would strengthen performance or reduce risk' },
  { v: '3' as const, short: 'Significant focus', bg: BRAND,    fg: '#fff',
    full: 'Existing programs need significant strategic focus to close gaps, reduce risk or capture opportunity' },
]


export type Dist = { '1': number; '2': number; '3': number }
export type TopBox = { share: number | null; numerator: number; denominator: number }
export type Overall = {
  n_asked: number; n_answered: number; n_abstained: number; n_skipped: number; n_not_asked?: number
  distribution: Dist; top_box: TopBox
  median_low: number | null; median_high: number | null
  modal_share: number | null; polarised: boolean
}

export const pct = (x: number | null | undefined) =>
  x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`

/** The median as an INTERVAL. Never interpolated — the median of {1,3} is [1,3], not 2. */
export const medianText = (o: Overall) =>
  o.median_low === null || o.median_high === null ? '—'
    : o.median_low === o.median_high ? String(o.median_low)
    : `${o.median_low}–${o.median_high}`


/**
 * The distribution, as three bands — never as a single position on a line. A single marker is how a
 * mean gets back in through the picture even when no mean is computed, and it would erase exactly
 * the shape (5 at "1", 3 at "3") that the disagreement register exists to surface.
 * The counts are printed beside the bar as well as inside it, so a narrow band is never lost.
 */
export function DistBar({ d, height = 22 }: { d: Dist; height?: number }) {
  const total = d['1'] + d['2'] + d['3']
  if (total === 0) return <div style={{ fontSize: 11.5, color: MUTE }}>No scored answers</div>
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 5, overflow: 'hidden', border: `0.5px solid ${LINE}` }}>
        {BANDS.map(b => {
          const n = d[b.v]
          if (n === 0) return null
          return (
            <div key={b.v} title={`${n} × ${b.full}`}
                 style={{ flex: n, background: b.bg, color: b.fg, fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(n / total) > 0.12 ? n : ''}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10.5, color: MUTE, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {BANDS.map(b => `${b.v}: ${d[b.v]}`).join('   ')}
      </div>
    </div>
  )
}


/**
 * The five counters, always together, with abstentions at the SAME visual weight as answers (§6.1).
 *
 * ⚠️ EQUAL WEIGHT IS ENFORCED BY THE LAYOUT, NOT BY GOODWILL. Every counter is the same block, the
 * same size and the same type — so "could not judge" cannot quietly become a footnote to
 * "answered" as this file is edited. The amber only ever marks a NON-ZERO abstention count; it
 * changes the colour, never the prominence.
 *
 * ⚠️ AND IT WRAPS RATHER THAN OVERFLOWS. These were once one right-aligned line of five
 * `white-space: nowrap` spans in a fixed 300px column, which is a run that cannot break: on a
 * laptop the numbers ran off the right edge of the card on every row of the table. auto-fit /
 * minmax reflows to three-up, then two-up, and the labels stay as the phrases they are — the whole
 * point of "0 could not judge" is that it reads as a sentence rather than a code.
 */
export function Counters({ o }: { o: Overall }) {
  const items: { k: string; v: number | null | undefined; alert?: boolean }[] = [
    { k: 'asked', v: o.n_asked },
    { k: 'answered', v: o.n_answered },
    { k: 'could not judge', v: o.n_abstained, alert: true },
    { k: 'skipped', v: o.n_skipped },
    { k: 'not asked', v: o.n_not_asked },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
                  gap: 8, marginTop: 10 }}>
      {items.filter(i => i.v !== null && i.v !== undefined).map(i => (
        <div key={i.k} style={{ background: PAPER, border: `0.5px solid ${LINE}`, borderRadius: 8,
                                padding: '7px 10px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2,
                        fontVariantNumeric: 'tabular-nums',
                        color: i.alert && (i.v as number) > 0 ? AMBER : INK }}>{i.v}</div>
          <div style={{ fontSize: 10, color: MUTE, marginTop: 2, lineHeight: 1.35 }}>{i.k}</div>
        </div>
      ))}
    </div>
  )
}

