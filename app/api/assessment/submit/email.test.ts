import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildLeadEmailHtml, buildNotifyHtml, urgentFirstSentence, EMAIL_MASTHEAD, MASTHEAD_FALLBACK, EMPTY_HEADLINE, SITE_URL, URGENCY_TEXT, URGENCY_BG, type PostedObligation } from '../../../../lib/assessmentEmail'
import { disclaimerParas } from '../../../../lib/disclaimer'
import * as B from '../../../../lib/brand'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

// WCAG 2 relative luminance and contrast, from the hex constants themselves.
const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const ob = (urgency: string, label: string, group = 'regulatory'): PostedObligation =>
  ({ name: `Entry ${urgency}`, jurisdiction: 'European Union', timing: 'Now', module: 'CBAM', urgency, urgency_label: label, group, obligationId: 'cbam' })
const lead = (obligations: PostedObligation[]) => buildLeadEmailHtml({ obligations, theirCompany: 'Acme Ltd', leadIdent: 'Jo Smith · Acme Ltd', date: '1 October 2026' })
const notify = (obligations: PostedObligation[]) => buildNotifyHtml({ obligations, profile: [{ q: 'Q', a: 'A' }], date: '1 October 2026', lead: { name: 'Jo', company: 'Acme', role: 'CFO', email: 'jo@acme.test' } })
const SOME = [ob('high', 'HIGH PRIORITY'), ob('monitor', 'CHECK YOUR GOODS'), ob('medium', 'ANNUAL', 'market')]

describe('the assessment emails: no retired gradient, no black panels', () => {
  for (const [name, html] of [['visitor', lead(SOME)], ['alert', notify(SOME)]] as const) {
    it(name, () => {
      expect(html).not.toMatch(/linear-gradient|#7425e3|#1fb1ff|#64fe3e/i)
      expect(html).not.toMatch(/#0d0d0d|#111\b|#111111|rgba\(255,\s*255,\s*255/i)
      // Only lib/brand.ts colours, plus three documented literals:
      //   URGENCY_TEXT.critical and .high, the darker pill-text variants no token holds (lib/assessmentEmail.ts);
      //   MASTHEAD_FALLBACK #014782, sampled from the masthead image and used ONLY as the fill behind it, so
      //   the alt text reads on dark blue when images are blocked. Not a brand colour; used nowhere else.
      const allowed = new Set([...Object.values(B).flatMap(v => (typeof v === 'string' ? [v] : Object.values(v as object).flatMap(w => (typeof w === 'string' ? [w] : Object.values(w as object))))), URGENCY_TEXT.critical, URGENCY_TEXT.high, MASTHEAD_FALLBACK].map(s => String(s).toUpperCase()))
      const used = [...new Set(html.match(/#[0-9a-f]{6}\b/gi) ?? [])].map(s => s.toUpperCase())
      expect(used.filter(h => !allowed.has(h))).toEqual([])
    })
  }
})

describe('every text/background pair clears 4.5:1', () => {
  const pairs: [string, string, string][] = [
    ['INK on PAPER', B.INK, B.PAPER], ['INK_2 on PAPER', B.INK_2, B.PAPER], ['INK_MUTED on PAPER', B.INK_MUTED, B.PAPER], ['BRAND on PAPER', B.BRAND, B.PAPER],
    ['INK on GROUND', B.INK, B.GROUND], ['INK_2 on GROUND', B.INK_2, B.GROUND], ['INK_MUTED on GROUND', B.INK_MUTED, B.GROUND], ['BRAND on GROUND', B.BRAND, B.GROUND],
    ['INK on BAND', B.INK, B.BAND], ['INK_2 on BAND', B.INK_2, B.BAND],
    ['ON_DARK on BRAND (step circles, primary button)', B.ON_DARK, B.BRAND],
    ['ON_DARK on MASTHEAD_FALLBACK (alt text when images are blocked)', B.ON_DARK, MASTHEAD_FALLBACK],
    ['summary pill: STATE_ERROR on red wash', B.STATE_ERROR, B.ACCENT.red.wash],
    ['INK_MUTED on neutral wash (table head, monitor pill)', B.INK_MUTED, B.ACCENT.neutral.wash], ['INK on neutral wash', B.INK, B.ACCENT.neutral.wash],
    ...(['critical', 'high', 'medium', 'monitor'] as const).map(u => [`row pill ${u}`, URGENCY_TEXT[u], URGENCY_BG[u]] as [string, string, string]),
  ]
  for (const [name, fg, bg] of pairs) it(`${name}: ${ratio(fg, bg).toFixed(2)}`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5))

  it('INK_MUTED is NOT used on BAND, where it is 4.46:1', () => {
    expect(ratio(B.INK_MUTED, B.BAND)).toBeLessThan(4.5)
    // Text that sets its own background (the pills) sits on that background, not on BAND, and is
    // measured above; everything else in the panel is on BAND.
    const band = lead(SOME).split(`background:${B.BAND};`)[1].split('</td></tr>')[0]
      .replace(/<span style="[^"]*background:[^"]*">[^<]*<\/span>/g, '')
    expect(band).not.toContain(`color:${B.INK_MUTED}`)
  })
})

describe('the visitor email', () => {
  it('the masthead: one hosted image at the top of both emails, 600 x 120 from a 1200 x 240 file, on the fallback fill', () => {
    expect(EMAIL_MASTHEAD.src).toBe(`${SITE_URL}/images/email/masthead.jpg`)
    for (const html of [lead(SOME), notify(SOME)]) {
      expect(html).toContain(`<td bgcolor="${MASTHEAD_FALLBACK}"`)
      expect(html).toContain(`<img src="${EMAIL_MASTHEAD.src}" width="600" height="120" alt="ThemisIQ" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:${B.ON_DARK};font-size:20px;font-weight:bold;`)
      expect(html).not.toContain('themisiq-logo.png')
    }
    // JPEG SOF0/SOF2 marker carries height then width; progressive is SOF2 (0xFFC2).
    const jpg = readFileSync(join(REPO_ROOT, 'public/images/email/masthead.jpg'))
    const sof = jpg.indexOf(Buffer.from([0xff, 0xc2]))
    expect(sof, 'a progressive JPEG').toBeGreaterThan(0)
    expect([jpg.readUInt16BE(sof + 7), jpg.readUInt16BE(sof + 5)]).toEqual([EMAIL_MASTHEAD.width * 2, EMAIL_MASTHEAD.height * 2])
    expect(jpg.length).toBeLessThan(40_000)
    expect(existsSync(join(REPO_ROOT, 'scripts/build-email-masthead.py')), 'the build script is committed').toBe(true)
  })

  it('both emails are full documents that declare utf-8', () => {
    for (const html of [lead(SOME), notify(SOME)]) {
      expect(html.startsWith('<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8">')).toBe(true)
    }
  })

  it('the empty state: a plain sentence, no counts, no pills, no obligations heading; next steps and footer stay', () => {
    const html = lead([])
    expect(html).toContain(`>${EMPTY_HEADLINE}</div>`)
    expect(EMPTY_HEADLINE).toBe('Your answers did not match any of the obligations this assessment checks for.')
    expect(html).not.toMatch(/We identified|0 obligations|require immediate action|immediate<\/span>|high priority<\/span>|monitor<\/span>|Your compliance obligations/)
    expect(html).toContain('Recommended next steps')
    // Its own next steps: nothing in them points at "the obligations above".
    expect(html).toContain('>Check again when things change</div>')
    expect(html).toContain('Thresholds and dates move, and a change in your size, markets or customers can bring a rule into scope. Run the assessment again when any of those change.')
    expect(html).toContain('>Set up your account</div>')
    expect(html).toContain('Create an account and get your reporting ready before a customer, investor or lender asks.')
    expect(html).toContain('>Book a free 30-minute consultation</div>')
    expect(html).toContain('An advisor will review your answers with you and suggest where to start.')
    expect(html).not.toMatch(/obligations? above|Start with what|Start with the ones marked/)
    expect(html).toContain('>Create your account</a>')
    expect(html).toContain('>Book a free consultation</a>')
    expect(html).toContain('You received this because you completed')
    // One tagline, the masthead's: the footer no longer carries the old line.
    expect(html).toContain('>Collect once, comply everywhere.</div>')
    expect(html).not.toContain('Compliance Intelligence for Sustainable Business')
    expect(html).toContain('Important Notice')
    // And a non-empty result is unchanged, including the original three steps.
    const full = lead(SOME)
    expect(full).toContain('We identified <span style="font-style:italic;">3 obligations</span>')
    expect(full).not.toContain(EMPTY_HEADLINE)
    expect(full).toContain('>Start with what\u2019s most urgent</div>')
    expect(full).toContain('Each obligation above shows its timing and what it requires.')
    expect(full).toContain('Create an account and start work on the obligations above, at your own pace.')
    expect(full).toContain('An advisor will review your obligations with you, help you prioritise by risk and effort, and suggest where to start.')
    expect(full).not.toMatch(/Check again when things change|get your reporting ready|review your answers with you/)
  })

  it('the Important Notice text is lib/disclaimer.ts word for word', () => {
    const html = lead(SOME)
    for (const p of disclaimerParas('screening')) expect(html).toContain(`>${p}</p>`)
    expect(html).toContain(`color:${B.INK_2};letter-spacing:0.06em;text-transform:uppercase;line-height:1.6;margin:0 0 6px;">Important Notice`)
  })

  it('the next steps, and the one conditional sentence from the summary counts', () => {
    const html = lead(SOME)
    expect(html).toContain('Start with what’s most urgent')
    expect(html).toContain('Each obligation above shows its timing and what it requires. Some have fixed dates, others apply now or arise when a customer or investor asks. Start with the ones marked HIGH PRIORITY.')
    expect(html).toContain('Create an account and start work on the obligations above, at your own pace.')
    expect(html).toContain('An advisor will review your obligations with you, help you prioritise by risk and effort, and suggest where to start.')
    expect(html).toContain('>Create your account</a>')
    expect(html).toContain('>Book a free consultation</a>')
    expect(html).not.toMatch(/named ThemisIQ advisor|tell you exactly|Sign Up Today|in days/)
    expect(urgentFirstSentence(1, 3)).toBe(' Start with the ones marked IMMEDIATE ACTION.')
    expect(urgentFirstSentence(0, 3)).toBe(' Start with the ones marked HIGH PRIORITY.')
    expect(urgentFirstSentence(0, 0)).toBe('')
    expect(lead([ob('monitor', 'MONITOR')])).toContain('or investor asks.</div>')
  })

  it('no em dash, and not the word "chase", in either email', () => {
    for (const html of [lead(SOME), notify(SOME)]) {
      const visible = html.replace(/<!--[\s\S]*?-->/g, '')
      expect(visible).not.toContain('—')
      expect(visible).not.toMatch(/\bchase\b/i)
    }
  })
})
