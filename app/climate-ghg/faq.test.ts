import { describe, it, expect } from 'vitest'
import { FAQ_CONNECTED, FAQ_UPLOAD_ONLY, CONCIERGE_FAQ } from './faq'
import { UTILITY_CONNECT_ENABLED, BILL_REVIEW_SOURCE_USD, BILL_REVIEW_ONBOARDING_USD, BILL_REVIEW_INCLUDED_SOURCES, GHG_TIER_LABELS } from '../../lib/pricing'
import { BILL_REVIEW_DESCRIPTION, BILL_REVIEW_HUMAN_DESCRIPTION } from '../../lib/pricingCopy'

// Every string a customer reads from either array. `extra` is included because ModuleFaq renders it
// on the page, below the answer: it is not a margin note, it is copy.
const textOf = (items: readonly { a: string; extra?: string | readonly string[] }[]): string[] =>
  items.flatMap(i => [i.a, ...(i.extra == null ? [] : typeof i.extra === 'string' ? [i.extra] : [...i.extra])])

describe('Bill Review FAQ (formerly Concierge)', () => {
  // ⚠️ A PLACEHOLDER IN `extra` IS A PLACEHOLDER ON THE LIVE PAGE. The first draft of this set
  // carried bracketed notes to ourselves in that field, which renders. Two questions are held out
  // of the arrays entirely instead, in a comment in faq.ts.
  it('F1 neither version contains a bracketed placeholder', () => {
    for (const [name, items] of [['connected', FAQ_CONNECTED], ['upload-only', FAQ_UPLOAD_ONLY]] as const) {
      for (const s of textOf(items)) {
        expect(s, `${name}: a bracketed note would render to customers`).not.toContain('[')
      }
    }
  })

  // ⚠️ THE LIVE PAGE MUST NOT DESCRIBE A CONNECTION CHECKOUT CANNOT SELL. These are the phrases
  // FAQ_CONNECTED uses to assert a live connection. None may appear while the flag is false.
  // No connected price is published since Oct 2026 (pricing-2026-10).
  const PRESENT_TENSE_CONNECTION = [
    'connect the ones your utilities allow',
    'we connect to your account',
    'pull usage and billing data directly from the utility',
    'which sources will connect and which will be uploaded',
  ]

  it('F2 the upload-only version makes no present-tense connection claim', () => {
    for (const s of textOf(FAQ_UPLOAD_ONLY)) {
      for (const phrase of PRESENT_TENSE_CONNECTION) {
        expect(s.toLowerCase(), `this claims a connection that cannot be sold yet: ${phrase}`)
          .not.toContain(phrase.toLowerCase())
      }
    }
  })

  // The other half of the same rule: the full version must actually make those claims, or the
  // separation above is satisfied by two identical arrays and asserts nothing.
  it('F3 the connected version does make them, so the two versions are genuinely different', () => {
    const all = textOf(FAQ_CONNECTED).join(' ').toLowerCase()
    for (const phrase of PRESENT_TENSE_CONNECTION) {
      expect(all, `FAQ_CONNECTED should state: ${phrase}`).toContain(phrase.toLowerCase())
    }
  })

  it('F4 the upload-only version says connections are coming, rather than staying silent', () => {
    const all = textOf(FAQ_UPLOAD_ONLY).join(' ').toLowerCase()
    expect(all).toContain('coming soon')
  })

  it('F5 the flag picks the array, and today it picks the upload-only one', () => {
    expect(UTILITY_CONNECT_ENABLED).toBe(false)
    expect(CONCIERGE_FAQ).toBe(FAQ_UPLOAD_ONLY)
  })

  // ⚠️ THESE ANSWERS STATE WHAT A CUSTOMER IS CHARGED. A number typed into the copy would be a
  // second source of truth for a price, which is what lib/pricing.ts exists to prevent.
  it('F6 both versions take their prices from the Bill Review constants, and name no retired price', () => {
    for (const items of [FAQ_CONNECTED, FAQ_UPLOAD_ONLY]) {
      const all = textOf(items).join(' ')
      expect(all).toContain(`$${BILL_REVIEW_SOURCE_USD} a year`)
      for (const t of ['starter', 'professional', 'advisory'] as const) {
        expect(all).toContain(`$${(BILL_REVIEW_ONBOARDING_USD.ai[t] as number).toLocaleString('en-US')} ${GHG_TIER_LABELS[t]}`)
        expect(all).toContain(`$${(BILL_REVIEW_ONBOARDING_USD.human[t] as number).toLocaleString('en-US')}`)
        expect(all).toContain(String(BILL_REVIEW_INCLUDED_SOURCES[t]))
      }
      for (const stale of [/\$90(?!\d)/, /\$60(?!\d)/, /\$1,395/, /\$799/, /\$1,499/, /Concierge/]) expect(all, String(stale)).not.toMatch(stale)
    }
  })

  it('F8 the description is verbatim', () => {
    for (const items of [FAQ_CONNECTED, FAQ_UPLOAD_ONLY]) {
      expect(items[0].a).toBe(`${BILL_REVIEW_DESCRIPTION} ${BILL_REVIEW_HUMAN_DESCRIPTION}`)
    }
    expect(BILL_REVIEW_DESCRIPTION).toBe('Upload your bills and we read the figures for you. You check and approve each one, and our specialists spot-check the readings. Includes Verification Readiness: an organized evidence pack and source-document index, ready to hand to your verifier.')
    expect(BILL_REVIEW_HUMAN_DESCRIPTION).toBe('Prefer a person to read your bills? Choose human reading and a ThemisIQ specialist reads each one within 2 business days. Your bills are never sent to AI.')
  })

  it('F7 no em dash in either version', () => {
    for (const s of [...textOf(FAQ_CONNECTED), ...textOf(FAQ_UPLOAD_ONLY)]) {
      // The character as an escape, so this file carries no literal em dash of its own.
      expect(s).not.toContain('\u2014')
    }
  })
})
