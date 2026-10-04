import type { CSSProperties } from 'react'
// RELATIVE, not '@/...': tsconfig resolves the alias and vitest does not, and lib/freeCalcCta.test.ts renders this.
import { btnPrimary, btnOnDark } from './buttonStyles'
import { FREE_CALC_HREF, FREE_CALC_LABEL, FREE_CALC_SHORT_LABEL, FREE_CALC_SUBLINE } from '../../lib/pricingCopy'

/**
 * The free Scope 1 and Scope 2 calculator, as one call to action (free-calc-cta, Oct 2026).
 *
 * Until then the only links into the calculator were on /pricing and /calculate-emissions: the home page and
 * /climate-ghg offered the assessment and the price, and nothing that opened the free part of the product.
 * Every GHG surface now renders THIS, so the label, the sub-line and the href exist once (lib/pricingCopy.ts)
 * and lib/freeCalcCta.test.ts fails if a listed page stops rendering it.
 *
 * Variants:
 * - 'primary': the filled brand button, with the sub-line beneath it. The default.
 * - 'onDark':  the paper-filled button for a photograph (the home hero), sub-line in on-dark muted.
 * - 'short':   a small filled button with the short label, for cards and tight rows.
 * - 'link':    an inline text link with the full label and, unless turned off, the sub-line after it.
 *
 * ⚠️ THE FULL LABEL WRAPS ON A PHONE, ON PURPOSE. At 14px with 32px side padding it is wider than a 320px
 * screen, so the button carries maxWidth 100% and normal white-space instead of nowrap: a two-line button
 * beats a clipped one or a page that scrolls sideways.
 *
 * It is a plain <a> with no handlers, so it renders in server and client pages alike.
 */
type Variant = 'primary' | 'onDark' | 'short' | 'link'

export default function FreeCalcCta({ variant = 'primary', subLine = true, style }: {
  variant?: Variant
  subLine?: boolean
  style?: CSSProperties
}) {
  if (variant === 'short') {
    return (
      <a href={FREE_CALC_HREF} data-free-calc-cta="short" style={{
        fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, background: 'var(--color-brand)',
        color: 'var(--color-on-dark)', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap', ...style,
      }}>{FREE_CALC_SHORT_LABEL}</a>
    )
  }

  if (variant === 'link') {
    return (
      <span style={{ fontSize: 13, lineHeight: 1.6, ...style }}>
        <a href={FREE_CALC_HREF} data-free-calc-cta="link" style={{ color: 'var(--color-brand)', fontWeight: 600, textDecoration: 'none' }}>
          {FREE_CALC_LABEL} →
        </a>
        {subLine && <span style={{ color: 'var(--color-ink-muted)' }}> {FREE_CALC_SUBLINE}</span>}
      </span>
    )
  }

  const onDark = variant === 'onDark'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, maxWidth: '100%', ...style }}>
      <a href={FREE_CALC_HREF} data-free-calc-cta={variant} style={{
        ...(onDark ? btnOnDark : btnPrimary), fontWeight: 600, textDecoration: 'none',
        maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center', boxSizing: 'border-box',
      }}>{FREE_CALC_LABEL}</a>
      {subLine && (
        <span style={{ fontSize: 12, color: onDark ? 'var(--color-on-dark-muted)' : 'var(--color-ink-muted)' }}>{FREE_CALC_SUBLINE}</span>
      )}
    </span>
  )
}
