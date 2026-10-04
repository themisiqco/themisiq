import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FreeCalcCta from '../app/components/FreeCalcCta'
// Nav imports the browser Supabase client at module load; the header markup needs none of it.
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: () => new Promise(() => {}), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }))
import Nav from '../app/components/Nav'
import { FREE_CALC_HREF, FREE_CALC_LABEL, FREE_CALC_SHORT_LABEL, FREE_CALC_SUBLINE, FREE_CALC_HEADER_LABEL, FREE_CALC_HEADER_TAG, GHG_FREE_USE_SENTENCE } from './pricingCopy'

// THE FREE CALCULATOR ON EVERY GHG SURFACE (free-calc-cta, Oct 2026). Until then the home page and /climate-ghg
// had no link into it at all. Each surface listed here renders the shared CTA (or, for /calculate-emissions and
// the header, the shared href and label), so the call to action cannot quietly disappear from one of them.

const ROOT = join(__dirname, '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(FreeCalcCta, props))

describe('free calculator CTA', () => {
  it('FCC1: every variant links the shared href with the shared wording', () => {
    for (const variant of ['primary', 'onDark', 'link']) {
      const out = html({ variant })
      expect(out, variant).toContain(`href="${FREE_CALC_HREF}"`)
      expect(out, variant).toContain(FREE_CALC_LABEL)
      expect(out, variant).toContain(FREE_CALC_SUBLINE)
    }
    const short = html({ variant: 'short' })
    expect(short).toContain(`href="${FREE_CALC_HREF}"`)
    expect(short).toContain(FREE_CALC_SHORT_LABEL)
    expect(html({ subLine: false })).not.toContain(FREE_CALC_SUBLINE)
  })

  it('FCC2: the full label can wrap, so it is never cut off on a phone', () => {
    expect(html()).toContain('white-space:normal')
    expect(html()).toContain('max-width:100%')
  })

  it('FCC3: the wording stays inside the free-use line', () => {
    // Free is Scope 1 and Scope 2 in the browser with no account (GHG_FREE_USE_SENTENCE); nothing here may
    // promise saving, Scope 3 or downloads free, or retire-listed phrases from lib/freeClaims.test.ts.
    for (const s of [FREE_CALC_LABEL, FREE_CALC_SHORT_LABEL, FREE_CALC_SUBLINE]) {
      expect(s).not.toMatch(/save|scope 3|download|report|only pay|no cost/i)
    }
    expect(FREE_CALC_LABEL).toContain('Scope 1 and Scope 2')
    expect(GHG_FREE_USE_SENTENCE).toContain('in your browser, without an account')
  })

  it('FCC4: each listed page renders the shared CTA', () => {
    const pages: Array<[string, string[]]> = [
      ['app/page.tsx', ['<FreeCalcCta variant="onDark" />', '<FreeCalcCta variant="short" />']],
      ['app/climate-ghg/page.tsx', ['<FreeCalcCta />']],
      ['app/pricing/page.tsx', ['<FreeCalcCta variant="link"', 'href={FREE_CALC_HREF}']],
      ['app/calculate-emissions/page.tsx', ['TRY_URL: FREE_CALC_HREF']],
      // The second round: one link under the /frameworks table, the end of the GHG methodology section, the
      // footer under "Climate · GHG", the /assess result card, and the home pricing block.
      ['app/frameworks/page.tsx', ['<FreeCalcCta variant="link"']],
      ['app/methodology/page.tsx', ["method.module.startsWith('GHG Inventory') && <FreeCalcCta variant=\"link\" />"]],
      ['app/components/Footer.tsx', ['{ label: FREE_CALC_SHORT_LABEL, href: FREE_CALC_HREF }']],
      ['app/assess/page.tsx', ['ob.name === freeCalcUnder', '<FreeCalcCta />']],
      ['app/components/HomePricing.tsx', ['btn: `${FREE_CALC_LABEL} →`, href: FREE_CALC_HREF']],
    ]
    for (const [file, needles] of pages) {
      const src = read(file)
      for (const n of needles) expect(src, `${file}: ${n}`).toContain(n)
    }
    // The header's mobile menu (rendered only when opened, so read from source): same label, tag and name.
    const nav = read('app/components/Nav.tsx')
    expect(nav).toContain('{ href: FREE_CALC_HREF, label: FREE_CALC_HEADER_LABEL, sub: FREE_CALC_SUBLINE, tag: true }')
    expect(nav).toContain('aria-label={tag ? FREE_CALC_SHORT_LABEL : undefined}')
    expect(nav).toContain('{label}{tag && <FreeTag />}')
  })

  it('FCC8: the desktop header link reads "Emissions calculator" with a "Free" tag, and is named "Free emissions calculator"', () => {
    const out = renderToStaticMarkup(createElement(Nav))
    const link = out.match(/<a[^>]*data-free-calc-header[^>]*>[\s\S]*?<\/a>/)?.[0] ?? ''
    expect(link).toContain(`href="${FREE_CALC_HREF.replace('&', '&amp;')}"`)
    expect(link).toContain(`aria-label="${FREE_CALC_SHORT_LABEL}"`)
    expect(FREE_CALC_SHORT_LABEL).toBe('Free emissions calculator')
    expect(link).toContain(FREE_CALC_HEADER_LABEL)
    expect(FREE_CALC_HEADER_LABEL).toBe('Emissions calculator')
    // The tag is there to see, and hidden from assistive technology so the name is not read twice.
    expect(link).toMatch(new RegExp(`<span aria-hidden="true" data-free-tag="true"[^>]*>${FREE_CALC_HEADER_TAG}</span>`))
    // The header's other two calls to action are unchanged.
    expect(out).toContain('>Free assessment</a>')
    expect(out).toContain('>Build your platform →</a>')
  })

  it('FCC9: the home hero is the calculator and "See how it works"; no assessment button in either hero', () => {
    const home = read('app/page.tsx')
    const hero = home.slice(home.indexOf('<h1'), home.indexOf('── THE REQUEST ──'))
    expect(hero).toContain('<FreeCalcCta variant="onDark" />')
    expect(hero).toContain(`<a href="/methodology" style={{ ...btnOnDarkOutline, textDecoration: 'none' }}>See how it works</a>`)
    expect(hero).not.toContain('/assess')
    expect(hero).not.toContain('The assessment is free')
    const ghg = read('app/climate-ghg/page.tsx')
    const ghgHero = ghg.slice(ghg.indexOf('<FreeCalcCta />'), ghg.indexOf('</section>', ghg.indexOf('<FreeCalcCta />')))
    expect(ghgHero).toContain('From ${ghgFrom}/yr')
    expect(ghgHero).not.toContain('/assess')
    // The assessment is still on both pages, below the hero.
    expect(home.match(/href="\/assess"/g)?.length ?? 0).toBeGreaterThan(0)
    expect(ghg).toContain("primary={{ href: '/assess', label: 'Start the free assessment' }}")
  })

  it('FCC5: no listed surface types the calculator URL a second time', () => {
    for (const file of ['app/page.tsx', 'app/climate-ghg/page.tsx', 'app/pricing/page.tsx', 'app/calculate-emissions/page.tsx', 'app/components/Nav.tsx', 'app/components/FreeCalcCta.tsx',
      'app/frameworks/page.tsx', 'app/methodology/page.tsx', 'app/components/Footer.tsx', 'app/assess/page.tsx', 'app/components/HomePricing.tsx']) {
      expect(read(file), file).not.toMatch(/["'`]\/dashboard\/ghg["'`]/)
    }
  })

  it('FCC6: the href opens a blank calculator for everyone (?start=new, lib/ghg/entry.ts)', () => {
    expect(FREE_CALC_HREF).toBe('/dashboard/ghg?start=new')
  })

  it('FCC7: the footer link sits directly under "Climate · GHG"', () => {
    const footer = read('app/components/Footer.tsx')
    const at = footer.indexOf("{ label: 'Climate · GHG', href: '/climate-ghg' }")
    expect(at).toBeGreaterThan(-1)
    expect(footer.indexOf('{ label: FREE_CALC_SHORT_LABEL, href: FREE_CALC_HREF }')).toBeGreaterThan(at)
    expect(footer.indexOf("{ label: 'Climate · Risk'")).toBeGreaterThan(footer.indexOf('FREE_CALC_SHORT_LABEL, href'))
  })
})
