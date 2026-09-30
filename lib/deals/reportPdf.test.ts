import { describe, it, expect, vi, beforeEach } from 'vitest'
import type jsPDF from 'jspdf'
import { buildDealReportModel, CHIP_LABELS, type DealReportModel } from './reportModel'
import { REPORT_FIXTURES, FIXTURE_GENERATED_AT, NOT_ASSESSED_DEAL, FX_DEAL } from './reportModel.fixtures'
import { JURISDICTIONS, SECTOR_RISKS, DEAL_CURRENCIES } from './assessment'
import { createLayout, MARGIN } from '../pdf/layout'

// Every doc.text call the generator makes, recorded on the instance it draws on. jsPDF defines
// `text` per instance rather than on a prototype, so it is wrapped where the document is created.
type Drawn = { text: string; page: number; y: number }
let drawn: Drawn[] = []
vi.mock('../pdf/layout', async importOriginal => {
  const real = await importOriginal<typeof import('../pdf/layout')>()
  return {
    ...real,
    createLayout: (...args: Parameters<typeof real.createLayout>) => {
      const l = real.createLayout(...args)
      const original = l.doc.text.bind(l.doc) as (...a: unknown[]) => jsPDF
      ;(l.doc as unknown as { text: (...a: unknown[]) => jsPDF }).text = (...a: unknown[]) => {
        const t = a[0]
        for (const s of Array.isArray(t) ? t : [t]) {
          drawn.push({ text: String(s), page: l.doc.getCurrentPageInfo().pageNumber, y: Number(a[2]) })
        }
        return original(...a)
      }
      return l
    },
  }
})

const { generateDealReportPDF, charisCanDraw, fallbackText, SUBSTITUTION_NOTE } = await import('./reportPdf')

beforeEach(() => { drawn = [] })

const model = (deal: typeof FX_DEAL) => buildDealReportModel(deal, FIXTURE_GENERATED_AT)
const canDraw = charisCanDraw(createLayout().doc)
const stringsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v]
    : Array.isArray(v) ? v.flatMap(stringsOf)
    : v && typeof v === 'object' ? Object.values(v).flatMap(stringsOf)
    : []

describe('the model only says what Charis can draw', () => {
  // ⚠️ A CHARACTER OUTSIDE THE SUBSET PRINTS AS NOTHING (lib/fonts/charis.ts). The PDF's fallback
  // would turn it into "?" instead, which is visible but still wrong in the report's OWN prose. So
  // every string the model can emit, for every jurisdiction, sector and currency it can be asked
  // about, must be drawable as written. Target names are plain ASCII here on purpose: typed text is
  // the fallback's job, tested below, and must not hide a gap in the report's own wording.
  it('across jurisdictions, sectors, currencies and missing fields', () => {
    const offences = new Map<string, string>()
    const base = { ...FX_DEAL, target_name: 'Target Co' }
    const sectors = [...Object.keys(SECTOR_RISKS), 'Other', null]
    for (const jurisdiction of [...JURISDICTIONS, null])
      for (const sector of sectors)
        for (const currency of [...DEAL_CURRENCIES, 'JPY'])
          for (const sized of [true, false]) {
            const m = model({
              ...base, jurisdiction, sector, currency,
              employee_count: sized ? base.employee_count : null,
              total_assets: sized ? base.total_assets : null,
              deal_value: sized ? base.deal_value : 0,
              location_count: sized ? base.location_count : 0,
            })
            for (const s of [...stringsOf(m), ...Object.values(CHIP_LABELS), SUBSTITUTION_NOTE])
              for (const ch of s)
                if (ch !== '\n' && !canDraw(ch.codePointAt(0)!))
                  offences.set(`U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} (${ch})`, s.slice(0, 80))
          }
    expect([...offences].map(([c, where]) => `${c} in "${where}"`)).toEqual([])
  })
})

describe('typed text the font cannot draw', () => {
  it('keeps accents the font has: the fixture names print exactly as typed', () => {
    expect(fallbackText('Société Générale Nord', canDraw)).toBe('Société Générale Nord')
    expect(fallbackText('Nestlé Ingredients SA', canDraw)).toBe('Nestlé Ingredients SA')
  })

  it('strips an accent the font lacks, and marks with "?" what has no plain form', () => {
    expect(fallbackText('Ștefan Holdings', canDraw)).toBe('Stefan Holdings')   // U+0218 decomposes to S
    expect(fallbackText('Łódź Logistics', canDraw)).toBe('?ódz Logistics')     // Ł has no base; ó is drawable
    expect(fallbackText('北京 Capital', canDraw)).toBe('?? Capital')
  })

  it('never drops a character: one in, one out', () => {
    for (const s of ['Ștefan', 'Łódź', '北京', 'Crème ≥ 5 ≠ 6', 'Ωmega ✓'])
      expect([...fallbackText(s, canDraw)].length).toBe([...s].length)
  })

  it('the fixture names reach the PDF as typed, with no substitution note', () => {
    for (const deal of [NOT_ASSESSED_DEAL, FX_DEAL]) {
      drawn = []
      generateDealReportPDF(model(deal))
      expect(drawn.map(d => d.text).join('')).toContain(deal.target_name)
      expect(drawn.some(d => d.text.includes('outside this document'))).toBe(false)
    }
  })

  it('a name it cannot draw is substituted visibly, and the cover says so', () => {
    generateDealReportPDF(model({ ...FX_DEAL, target_name: 'Łódź Logistics' }))
    const all = drawn.map(d => d.text).join('')
    expect(all).toContain('?ódz Logistics')
    expect(all).not.toContain('Łódź')
    const notePage = drawn.find(d => d.text.includes('outside'))?.page
    expect(notePage).toBe(1)
  })
})

describe('generateDealReportPDF: smoke', () => {
  const HEADINGS = (m: DealReportModel) => [
    m.applicable.title, m.market.title, m.nearThreshold.title, m.sizeTests.title, m.risks.title,
    m.cost.title, m.dataRoom.title, m.fx.title, m.notice.title,
  ]

  it.each(REPORT_FIXTURES)('$name: builds, names the target, and prints every section in order', ({ deal }) => {
    const m = model(deal)
    const doc = generateDealReportPDF(m)
    const pages = doc.getNumberOfPages()
    expect(pages).toBeGreaterThanOrEqual(3)
    expect(pages).toBeLessThanOrEqual(10)
    expect(doc.internal.pageSize.getWidth()).toBe(612)   // Letter
    expect(doc.internal.pageSize.getHeight()).toBe(792)

    const texts = drawn.map(d => d.text)
    expect(texts.join('')).toContain(deal.target_name)
    expect(texts).toContain(m.cover.title)

    // Every heading, once, in the screen's order.
    const at = HEADINGS(m).map(h => texts.indexOf(h))
    expect(at.every(i => i >= 0), `missing heading: ${HEADINGS(m).filter((_, i) => at[i] < 0)}`).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it.each(REPORT_FIXTURES)('$name: a footer on every page, with the reference, the date and page X of Y', ({ deal }) => {
    const m = model(deal)
    const pages = generateDealReportPDF(m).getNumberOfPages()
    for (let p = 1; p <= pages; p++) {
      const onPage = drawn.filter(d => d.page === p).map(d => d.text)
      expect(onPage, `page ${p}`).toContain(`Page ${p} of ${pages}`)
      const footer = onPage.join(' ')
      expect(footer).toContain(`Reference ${m.reference}`)
      expect(footer).toContain(`Generated ${m.reportDate}`)
      expect(footer).toContain('www.themisiq.co')
    }
  })

  it.each(REPORT_FIXTURES)('$name: no heading is left alone at the foot of a page', ({ deal }) => {
    const m = model(deal)
    generateDealReportPDF(m)
    for (const h of HEADINGS(m)) {
      const i = drawn.findIndex(d => d.text === h)
      expect(drawn[i + 1].page, `"${h}" is followed on another page`).toBe(drawn[i].page)
    }
  })

  it.each(REPORT_FIXTURES)('$name: every amber panel is whole on one page', ({ deal }) => {
    const m = model(deal)
    generateDealReportPDF(m)
    const panels = [
      m.applicable.s211Panel, m.applicable.partialPanel, m.nearThreshold.kind === 'not-assessed' ? m.nearThreshold.notAssessedPanel : null,
      ...m.sizeTests.panels, m.risks.unresolvedPanel,
    ].filter(p => p !== null)
    expect(panels.length).toBeGreaterThan(0)
    for (const p of panels) {
      const i = drawn.findIndex(d => d.text === p.title)
      expect(i, `panel "${p.title}" not drawn`).toBeGreaterThanOrEqual(0)
      // The line carrying the body's last word is on the title's page.
      const lastWord = (typeof p.body.at(-1) === 'string' ? p.body.at(-1) as string : (p.body.at(-1) as { strong: string }).strong).trim().split(/\s+/).at(-1)!
      const end = drawn.findIndex((d, k) => k > i && d.text.trimEnd().endsWith(lastWord))
      expect(end, `panel "${p.title}" body not found`).toBeGreaterThan(i)
      expect(drawn[end].page, `panel "${p.title}" splits across pages`).toBe(drawn[i].page)
    }
  })

  it.each(REPORT_FIXTURES)('$name: nothing but the footer is drawn below the bottom margin', ({ deal }) => {
    // The other half of "whole on one page": a panel or card drawn without first checking the room
    // left does not split, it runs off the foot of the page into the footer. Text is drawn by its top
    // edge, so a top at or past the margin is text in the footer band.
    const m = model(deal)
    const doc = generateDealReportPDF(m)
    const bottom = doc.internal.pageSize.getHeight() - MARGIN.bottom
    const isFooter = (d: Drawn) => /^Page \d+ of \d+$/.test(d.text) || (d.y > bottom && m.footer.line.includes(d.text.trim()))
    const below = drawn.filter(d => !isFooter(d) && d.y >= bottom)
    expect(below.map(d => `p${d.page} y=${d.y.toFixed(1)} "${d.text.slice(0, 50)}"`)).toEqual([])
  })

  it('the closing note never starts a page on its own, wherever the notice ends', () => {
    // Swept rather than sampled: extra one-line notice paragraphs walk the notice's end down the
    // page line by line, so some count lands it at the foot. Without the reservation in
    // generateDealReportPDF, that count sends the note over alone.
    const base = model(FX_DEAL)
    // One filler paragraph moves the end by a line plus its spacing (~17.6pt), so 40 steps cover a
    // whole Letter page of content and must cross its foot at least once.
    for (let extra = 0; extra <= 40; extra++) {
      drawn = []
      const m = { ...base, notice: { ...base.notice, paras: [...base.notice.paras, ...Array.from({ length: extra }, (_, i) => `Filler line ${i + 1}.`)] } }
      generateDealReportPDF(m)
      const note = drawn.findIndex(d => d.text.startsWith('This assessment reflects'))
      expect(note, `note not drawn (extra ${extra})`).toBeGreaterThan(0)
      expect(drawn[note].page, `note alone on page ${drawn[note].page} with ${extra} extra lines`).toBe(drawn[note - 1].page)
    }
  }, 20_000)

  it('draws the claims finding: every market line, its source as plain text, and the fallback', () => {
    const m = model(FX_DEAL)
    generateDealReportPDF(m)
    const all = drawn.map(d => d.text).join(' ')
    const c = m.risks.claims!
    expect(all).toContain(c.title)
    for (const ln of c.lines) {
      expect(all).toContain(`${ln.market}: ${ln.law}`)
      expect(all).toContain(`Maximum penalty: ${ln.maxPenalty}`)
    }
    // A URL is wrapped by character where it is wider than the line, so compare with spaces removed.
    expect(all.replace(/\s/g, '')).toContain(c.lines[0].source.replace(/\s/g, ''))
    expect(all).toContain(c.fallback!.slice(0, 40))
  })

  it('a deal with nothing included draws no "Included obligation" table', () => {
    const m = model({ ...FX_DEAL, jurisdiction: 'USA', revenue: 100_000_000, employee_count: 250 })
    expect(m.cost.included.rows).toEqual([])
    generateDealReportPDF(m)
    const texts = drawn.map(d => d.text)
    expect(texts).not.toContain(m.cost.included.columns[0])
    expect(texts).toContain(m.cost.themisIq.figure)
  })

  it('the claims finding keeps its header with the first market, and never splits a market, wherever it lands', () => {
    // Filler risk rows walk the finding down the page a row at a time, so some count puts its header,
    // and some count each market block, at the foot of a page.
    const base = model(FX_DEAL)
    const c = base.risks.claims!
    const filler = { severity: 'medium' as const, risk: 'Filler', detail: 'One line of detail.', condition: null, cs3dLine: null, framework: 'GHG Protocol' }
    for (let extra = 0; extra <= 28; extra++) {
      drawn = []
      generateDealReportPDF({ ...base, risks: { ...base.risks, rows: [...base.risks.rows, ...Array(extra).fill(filler)] } })
      const title = drawn.findIndex(d => d.text === c.title)
      const first = drawn.findIndex((d, k) => k > title && d.text.startsWith(`${c.lines[0].market}:`))
      expect(drawn[first].page, `header parted from its first market (extra ${extra})`).toBe(drawn[title].page)
      for (const ln of c.lines) {
        const start = drawn.findIndex((d, k) => k > title && d.text.startsWith(`${ln.market}:`))
        const end = drawn.findIndex((d, k) => k > start && d.text.startsWith('Source:'))
        expect(drawn[end].page, `${ln.market} split across pages (extra ${extra})`).toBe(drawn[start].page)
      }
    }
    // 29 PDFs: about a second alone, but it passed 20s under the full parallel suite. A coarser step
    // would be faster and could skip the one position where a block splits, which is what it is for.
  }, 90_000)

  it('the upsell and the toolbar never reach the PDF', () => {
    generateDealReportPDF(model(FX_DEAL))
    const all = drawn.map(d => d.text).join(' ')
    for (const s of ['That was your free target', 'See Deals pricing', 'Your targets', 'Edit this deal', 'Save as PDF'])
      expect(all).not.toContain(s)
  })
})
