import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { stripTsComments } from './testing/stripComments'

const ROOT = join(__dirname, '..')
import {
  ASSESSMENT_IP_BUCKET, ASSESSMENT_IP_LIMIT, ASSESSMENT_IP_WINDOW_MS,
  ASSESSMENT_EMAIL_BUCKET, ASSESSMENT_EMAIL_LIMIT, ASSESSMENT_EMAIL_WINDOW_MS,
  HONEYPOT_FIELD, isHoneypotTripped, recipientKey,
} from './assessmentSubmitGuard'

// ⚠️ WHAT THESE PROTECT. /api/assessment/submit sent two Resend emails per call with no session, no
// rate limit and no bot check — the only unauthenticated email sender in the app. The route handler
// cannot be exercised here (no request harness, and it builds a Resend client at module scope), so the
// decisions live in a module of their own and are checked directly. Same shape as
// lib/useEntitlement.test.ts, and for the same reason.

describe('the assessment honeypot drops a bot without telling it why', () => {
  it('a field a human left alone does not trip', () => {
    // All four are "untouched" as far as a reader is concerned. '' is what an untouched React input
    // posts; whitespace is what some autofillers leave; undefined is a body that omits the key, which
    // is what every submission from before this field existed looks like.
    for (const v of ['', '   ', '\t\n', undefined, null]) {
      expect(isHoneypotTripped(v), `${JSON.stringify(v)} must not trip`).toBe(false)
    }
  })

  it('any real content trips it', () => {
    for (const v of ['http://spam.example', 'x', ' a ', 'themisiq.co']) {
      expect(isHoneypotTripped(v), `${JSON.stringify(v)} must trip`).toBe(true)
    }
  })

  it('a NON-STRING value trips it, because nothing legitimate puts one there', () => {
    // The field renders as a text input, so a person can only ever produce a string. A number, an
    // object or an array means the body was constructed by something other than the form.
    for (const v of [1, 0, true, false, {}, [], { url: 'x' }]) {
      expect(isHoneypotTripped(v), `${JSON.stringify(v)} must trip`).toBe(true)
    }
  })

  it('the field name is boring, because a revealing one tells a bot to skip it', () => {
    expect(HONEYPOT_FIELD).toBe('website')
    for (const tell of ['honey', 'trap', 'bot', 'spam', 'ignore', 'do_not', 'hidden']) {
      expect(HONEYPOT_FIELD.toLowerCase()).not.toContain(tell)
    }
    // ⚠️ 'hp' IS WHAT /api/order/quote-request USED, AND IT FAILS THIS TEST. It is an obvious honeypot
    // name, which is the one property a honeypot's name must not have. Both routes now read the
    // constant above.
    expect(HONEYPOT_FIELD).not.toBe('hp')
  })

  it('the predicate is the ONLY honeypot check in the app, so the weaker one cannot come back', () => {
    // The inline check this replaced was `contact?.hp && String(contact.hp).trim()`. Asserting its
    // absence is what stops it being reintroduced beside the shared one, which is how the two drifted
    // apart in the first place: one of them was written before this module existed.
    const routes = [
      'app/api/order/quote-request/route.ts',
      'app/api/assessment/submit/route.ts',
    ]
    for (const r of routes) {
      // ⚠️ COMMENTS STRIPPED FIRST, AND THIS TEST FAILED WITHOUT IT. Each route's comment EXPLAINS the
      // weaker check it replaced, quoting `String(contact.hp)` verbatim — so a raw substring match
      // fires on the documentation and calls a fixed route broken. stripTsComments exists for exactly
      // this: it blanks comment spans while preserving offsets.
      const src = stripTsComments(readFileSync(join(ROOT, r), 'utf8'))
      expect(src, `${r} must call the shared predicate`).toContain('isHoneypotTripped(')
      expect(src, `${r} must not re-implement the check inline`).not.toMatch(/String\(contact\.hp\)/)
      expect(src, `${r} must not hard-code the field name`).not.toMatch(/contact\?\.\s*hp\b/)
    }
  })
})

describe('the per-recipient key cannot be sidestepped by casing or spacing', () => {
  it('folds case and trims', () => {
    // ⚠️ WITHOUT THIS THE DAILY LIMIT IS TRIVIAL TO EVADE: 'Foo@x.com', 'foo@x.com' and ' foo@x.com '
    // are one mailbox, and three buckets would make three sends into nine.
    const keys = ['foo@x.com', 'FOO@x.com', 'Foo@X.Com', '  foo@x.com  ', '\tfoo@x.com\n']
      .map(recipientKey)
    expect(new Set(keys).size, 'every spelling must resolve to one key').toBe(1)
    expect(keys[0]).toBe('foo@x.com')
  })

  it('does NOT fold dots or plus-addresses, because those are provider-specific', () => {
    // Gmail treats a+b@ and a@ as one mailbox; most hosts do not. Folding them here would merge
    // addresses that really are different elsewhere, and silently stop mailing one of them.
    expect(recipientKey('a+b@x.com')).not.toBe(recipientKey('a@x.com'))
    expect(recipientKey('a.b@x.com')).not.toBe(recipientKey('ab@x.com'))
  })
})

describe('the limits sit where a genuine visitor never reaches them', () => {
  // /assess is a three-question form producing one obligation map: run once, or twice after a typo.
  // These are asserted so a change to either is a deliberate edit with a diff, not a drifting number.
  it('per IP: 5 an hour', () => {
    expect(ASSESSMENT_IP_LIMIT).toBe(5)
    expect(ASSESSMENT_IP_WINDOW_MS).toBe(60 * 60 * 1000)
  })

  it('per recipient: 3 a day', () => {
    expect(ASSESSMENT_EMAIL_LIMIT).toBe(3)
    expect(ASSESSMENT_EMAIL_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('TWO BUCKETS, because the two windows cannot share one call', () => {
    // checkAndRecordRateLimit takes a single windowMs for both axes, so an hourly IP limit and a daily
    // per-recipient limit need two calls with two buckets. Distinct names keep their counts apart; a
    // shared bucket would make each limit count the other's rows.
    expect(ASSESSMENT_IP_BUCKET).not.toBe(ASSESSMENT_EMAIL_BUCKET)
    expect(ASSESSMENT_IP_WINDOW_MS).not.toBe(ASSESSMENT_EMAIL_WINDOW_MS)
  })

  it('the windows are ordered as intended: the recipient window is the longer one', () => {
    expect(ASSESSMENT_EMAIL_WINDOW_MS).toBeGreaterThan(ASSESSMENT_IP_WINDOW_MS)
  })
})
