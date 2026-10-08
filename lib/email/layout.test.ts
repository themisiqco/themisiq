import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emailShell, EMAIL_POSTAL_ADDRESS, EMAIL_MASTHEAD_IMAGE, EMAIL_MASTHEAD_FALLBACK } from './layout'
import { SITE_ORIGIN } from '../siteOrigin'
import { buildResultsEmail, resultsEmailText, resultsEmailModel } from '../ghg/resultsEmail'
import { inventoryFromDraft, inventoryRow } from '../ghg/freeCalc'

// The shared email shell (Oct 2026) and the results email on it.
const NOW = new Date('2026-10-05T12:00:00Z')
const SITE = 'https://www.themisiq.co'
const inv = inventoryFromDraft({ company_name: 'Northwind Fabrication', reporting_year: 2025, locations: [
  { id: '1', name: 'Chicago plant', country: 'US', state: 'IL', grid_region: 'US_IL', has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'therms', electricity_kwh: 85000 },
  { id: '2', name: 'Toronto office', country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 40000 },
] } as never, 'x', NOW)
const row = { ...inventoryRow(inv, 'u', 'c', true, NOW), id: '3f9c2a7e-5b1d-4c8e-9a60-2d7b1e4f8c13' } as never
const email = () => buildResultsEmail({ row, fullName: 'Pat Lee', siteUrl: SITE })

// The plain text exactly as it was before the shell (captured from the code at 13f09df, 5 Oct 2026).
// Re-captured at T3c diff 2 (8 Oct 2026), for engine changes only: the US citation reads 2025, and Toronto's 2025 grid
// needs ECCC Table 5.4 (prepared after 9 Sep 2026), not held until T3d, so it is listed as not calculated.
const GOLDEN_TEXT = readFileSync(join(__dirname, '__fixtures__', 'results-email-sample.txt'), 'utf8')

describe('the email shell', () => {
  it('E1: the masthead image is hosted at SITE_ORIGIN, sized, with alt text "ThemisIQ" on a fill that keeps it readable', () => {
    const html = emailShell({ title: 't', contentHtml: '<p>x</p>' })
    expect(EMAIL_MASTHEAD_IMAGE.src).toBe(`${SITE_ORIGIN}/images/email/masthead.jpg`)
    expect(html).toContain(`<img src="${SITE_ORIGIN}/images/email/masthead.jpg" width="600" height="120" alt="ThemisIQ"`)
    expect(html).toContain(`bgcolor="${EMAIL_MASTHEAD_FALLBACK}"`)
    expect(html).toMatch(/alt="ThemisIQ" style="display:block;[^"]*color:#EAEDEE;font-size:20px;font-weight:bold;/)
  })

  it('E2: table layout at 600px, light-only colour scheme, an Outlook font fallback, no web fonts, no em dash', () => {
    const html = emailShell({ title: 't', preheader: 'p', contentHtml: '<p>x</p>', footerLines: ['Reason.'] })
    expect(html).toContain('<table role="presentation" width="600"')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('<meta name="color-scheme" content="light only">')
    expect(html).toContain('<!--[if mso]>')
    expect(html).not.toMatch(/@font-face|fonts\.googleapis|<link/i)
    expect(html).not.toContain('—')
    expect(html).toContain(`${EMAIL_POSTAL_ADDRESS} Reason.`)
  })
})

describe('the results email on the shell', () => {
  it('E3: the HTML has the masthead with its alt text, and the footer with the postal address', () => {
    const { html } = email()
    expect(html).toContain('alt="ThemisIQ"')
    expect(html).toContain('/images/email/masthead.jpg')
    expect(html).toContain('ThemisIQ, 11 Oak Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada. Questions: hello@themisiq.co. You received this because you asked for your results on themisiq.co.')
  })

  it('E4: the plain text is unchanged', () => {
    expect(email().text).toBe(GOLDEN_TEXT)
    expect(resultsEmailText(resultsEmailModel({ row, fullName: 'Pat Lee', siteUrl: SITE }))).toBe(GOLDEN_TEXT)
  })
})
