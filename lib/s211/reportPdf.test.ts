import { describe, it, expect, vi, beforeEach } from 'vitest'
import type jsPDF from 'jspdf'
import { createLayout, MARGIN } from '../pdf/layout'
import { charisCanDraw } from '../pdf/drawable'
import { buildS211ReportModel, REPORT_LABEL, PART_REFERENCE, PREPARED_WITH, REPORT_TITLE, type S211ReportModel } from './reportModel'
import { SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT, NOTHING_REPORT, type FixtureReport } from './reportModel.fixtures'
import { SECTIONS } from './builderContent'

// Every doc.text call, recorded on the instance it draws on, as lib/deals/reportPdf.test.ts does.
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
        for (const s of Array.isArray(t) ? t : [t]) drawn.push({ text: String(s), page: l.doc.getCurrentPageInfo().pageNumber, y: Number(a[2]) })
        return original(...a)
      }
      return l
    },
  }
})

const { generateS211ReportPDF } = await import('./reportPdf')
beforeEach(() => { drawn = [] })

const canDraw = charisCanDraw(createLayout().doc)
const stringsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(stringsOf) : v && typeof v === 'object' ? Object.values(v).flatMap(stringsOf) : []
const FIXTURES: [string, FixtureReport][] = [['single', SINGLE_REPORT], ['joint (b)(ii)', JOINT_REPORT], ['joint (b)(i)', JOINT_EACH_REPORT], ['nothing to report', NOTHING_REPORT]]

describe('every string is drawable in the embedded font', () => {
  it('the report\'s own words: headings, labels, references, cover rows and the fixtures\' output', () => {
    const offences: string[] = []
    const all = [
      ...FIXTURES.flatMap(([, r]) => stringsOf(buildS211ReportModel(r, { preparedWithThemisIq: true }))),
      ...stringsOf(REPORT_LABEL), ...stringsOf(PART_REFERENCE), ...SECTIONS.map(d => d.title), PREPARED_WITH, REPORT_TITLE,
      'Revised report', ...[1, 12, 123].map(n => `Page ${n} of ${n}`),
    ]
    for (const s of new Set(all)) for (const ch of s) {
      if (ch !== '\n' && !canDraw(ch.codePointAt(0)!)) offences.push(`U+${ch.codePointAt(0)!.toString(16).toUpperCase()} in "${s.slice(0, 60)}"`)
    }
    expect(offences).toEqual([])
  })

  it('typed text outside the font is substituted visibly and reported to the caller, never dropped', () => {
    const r = { ...SINGLE_REPORT, sections: { ...SINGLE_REPORT.sections, report_details: { ...SINGLE_REPORT.sections.report_details, legal_name: 'Łódź Trading Inc.' } } }
    const { substituted } = generateS211ReportPDF(buildS211ReportModel(r))
    expect(substituted).toEqual(['Ł', 'ź'])
    const all = drawn.map(d => d.text).join('')
    expect(all).toContain('?ódz Trading Inc.')
    expect(all).not.toContain('Ł')
  })
})

describe('generateS211ReportPDF', () => {
  it.each(FIXTURES)('%s: Letter, every part heading in order, and the legal name on the cover', (_, r) => {
    const m = buildS211ReportModel(r)
    const { doc, substituted } = generateS211ReportPDF(m)
    expect(substituted).toEqual([])
    expect(doc.internal.pageSize.getWidth()).toBe(612)
    expect(doc.internal.pageSize.getHeight()).toBe(792)
    const t = drawn.map(d => d.text)
    const at = m.parts.map(p => t.findIndex(x => p.title.startsWith(x) && x.length > 8))
    expect(at.every(i => i >= 0), `missing: ${m.parts.filter((_, i) => at[i] < 0).map(p => p.title)}`).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(drawn.filter(d => d.page === 1).map(d => d.text)).toContain(m.cover.legalName)
  })

  it.each(FIXTURES)('%s: page X of Y on every page; the running header on every page but the cover', (_, r) => {
    const m = buildS211ReportModel(r)
    const total = generateS211ReportPDF(m).doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
      const onPage = drawn.filter(d => d.page === p).map(d => d.text)
      expect(onPage, `page ${p}`).toContain(`Page ${p} of ${total}`)
      expect(onPage.some(x => x.startsWith(m.cover.legalName) && x.includes('Financial year')), `header on page ${p}`).toBe(p > 1)
    }
  })

  it('no ThemisIQ text anywhere by default; the credit prints on every page when switched on', () => {
    generateS211ReportPDF(buildS211ReportModel(SINGLE_REPORT))
    expect(drawn.some(d => d.text.includes('ThemisIQ'))).toBe(false)
    drawn = []
    const total = generateS211ReportPDF(buildS211ReportModel(SINGLE_REPORT, { preparedWithThemisIq: true })).doc.getNumberOfPages()
    expect(drawn.filter(d => d.text === PREPARED_WITH)).toHaveLength(total)
  })

  it('metadata: title, subject, author and language are set on the document', () => {
    const m = buildS211ReportModel(JOINT_REPORT)
    const raw = new TextDecoder('latin1').decode(generateS211ReportPDF(m).doc.output('arraybuffer'))
    expect(raw).toContain('/Lang (en-CA)')
    expect(raw).toContain('/Title (')
    expect(raw).toContain('/Subject (Annual report under section 11')
    expect(raw).toContain('/Author (Harrowgate Outdoor Equipment Inc.)')
  })

  it('(b)(i): one block per entity, each whole on its page, each labelled and binding its own entity', () => {
    const m = buildS211ReportModel(JOINT_EACH_REPORT)
    generateS211ReportPDF(m)
    const entities = JOINT_EACH_REPORT.sections.report_details!.joint_entities as string[]
    expect(drawn.filter(d => d.text === 'SIGNATURE')).toHaveLength(entities.length)
    const att = drawn.find(d => d.text === 'Attestation')!
    entities.forEach((e, i) => {
      const label = drawn.findIndex(d => d.text === `For ${e}`)
      expect(label, e).toBeGreaterThanOrEqual(0)
      const sig = drawn.findIndex((d, k) => k > label && d.text === 'SIGNATURE')
      const bind = drawn.findIndex((d, k) => k > sig && d.text === `I have the authority to bind ${e}`)
      expect(bind, e).toBeGreaterThan(sig)
      expect(drawn[sig].page, `${e}: block split`).toBe(drawn[label].page)
      expect(drawn[bind].page, `${e}: statement parted from its block`).toBe(drawn[label].page)
      if (i === 0) expect(drawn[label].page, 'attestation parted from the first block').toBe(att.page)
    })
  })

  it('(b)(ii) and (a): one block, and no per-entity label', () => {
    for (const r of [JOINT_REPORT, SINGLE_REPORT]) {
      drawn = []
      generateS211ReportPDF(buildS211ReportModel(r))
      expect(drawn.filter(d => d.text === 'SIGNATURE')).toHaveLength(1)
      expect(drawn.some(d => d.text.startsWith('For '))).toBe(false)
    }
  })

  it('the attestation and the signature block are on one page together', () => {
    for (const [, r] of FIXTURES) {
      drawn = []
      generateS211ReportPDF(buildS211ReportModel(r))
      const att = drawn.find(d => d.text === 'Attestation')!
      const sig = drawn.find(d => d.text === 'SIGNATURE')!
      const bind = drawn.find(d => d.text.startsWith('I have the authority to bind'))!
      expect(att.page).toBe(sig.page)
      expect(bind.page).toBe(sig.page)
    }
  })
})

describe('layout wherever the content falls', () => {
  // Filler lines in section 2 walk every later heading down the page a line at a time, so some count
  // puts each of them at the foot of a page. Swept, not sampled.
  const withFiller = (n: number): S211ReportModel => {
    const s2 = SINGLE_REPORT.sections.structure_activities_supply_chains!
    const filler = Array.from({ length: n }, (_, i) => `Filler line ${i + 1}.`).join('\n\n')
    return buildS211ReportModel({ ...SINGLE_REPORT, sections: { ...SINGLE_REPORT.sections, structure_activities_supply_chains: { ...s2, structure_description: `${s2.structure_description}${n ? `\n\n${filler}` : ''}` } } })
  }
  const headingTexts = (m: S211ReportModel) => new Set([
    ...m.parts.map(p => p.title),
    ...m.parts.flatMap(p => p.blocks.flatMap(b => (b.kind === 'subheading' ? [b.text] : b.kind === 'table' ? [b.title] : []))),
  ])

  it('no heading is left alone at the foot of a page: what follows it is on its page', () => {
    for (let extra = 0; extra <= 36; extra++) {
      drawn = []
      const m = withFiller(extra)
      generateS211ReportPDF(m)
      const heads = headingTexts(m)
      drawn.forEach((d, i) => {
        // A heading may wrap to two lines: the check is on its LAST line, against what follows.
        if (![...heads].some(h => h === d.text || (h.endsWith(d.text) && d.text.length > 3))) return
        const next = drawn.slice(i + 1).find(x => !/^Page \d+ of \d+$/.test(x.text) && !x.text.startsWith(m.cover.legalName))
        if (next && ![...heads].some(h => h.startsWith(next.text) && next.text.length > 3)) {
          expect(next.page, `"${d.text}" parted from "${next.text.slice(0, 40)}" (extra ${extra})`).toBe(d.page)
        }
      })
    }
  }, 60_000)

  it('nothing but the header and footer is drawn outside the margins', () => {
    for (const extra of [0, 7, 13, 21, 29]) {
      drawn = []
      const m = withFiller(extra)
      const doc = generateS211ReportPDF(m).doc
      const bottom = doc.internal.pageSize.getHeight() - MARGIN.bottom
      const stray = drawn.filter(d => !/^Page \d+ of \d+$/.test(d.text) && !d.text.startsWith(m.cover.legalName.slice(0, 20)) && (d.y > bottom + 4))
      expect(stray.map(d => `p${d.page} y=${d.y.toFixed(1)} "${d.text.slice(0, 40)}"`), `extra ${extra}`).toEqual([])
    }
  }, 60_000)
})

describe('file size', () => {
  it('a long report, every text field at its maximum and long tables, stays far under 100 MB', () => {
    const long = (n: number) => 'We assessed our suppliers and recorded what we found. '.repeat(Math.ceil(n / 55)).slice(0, n)
    const sections = structuredClone(SINGLE_REPORT.sections)
    for (const d of SECTIONS) {
      const c = (sections[d.key] ??= {})
      for (const f of d.fields) if (f.type === 'textarea' && f.maxChars) c[f.key] = long(f.maxChars)
    }
    sections.risks!.risk_areas = Array.from({ length: 60 }, (_, i) => ({ area: `Risk area ${i + 1}`, why: long(200), worker_groups: 'Migrant workers', action: long(200) }))
    sections.effectiveness!.indicators = Array.from({ length: 40 }, (_, i) => ({ indicator: `Indicator ${i + 1}`, this_year: '10', last_year: '8' }))
    const { doc } = generateS211ReportPDF(buildS211ReportModel({ ...SINGLE_REPORT, sections }))
    const bytes = doc.output('arraybuffer').byteLength
    expect(doc.getNumberOfPages()).toBeGreaterThan(20)
    expect(bytes).toBeLessThan(2 * 1024 * 1024)   // 100 MB is the limit; this is fifty times under it
  }, 30_000)
})
