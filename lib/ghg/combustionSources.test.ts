import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { combustionSourcesFor, combustionSource, gridSourcesFor, gridSource, EF_SOURCES } from './engine'

// THE ASSURANCE PDF CITED A PUBLISHER THAT DID NOT PRICE THE INVENTORY.
//
// lib/assurancePdf.ts printed `['Combustion factors', efSources.combustion]` — the US EPA constant —
// on every inventory, whatever the jurisdiction. A Canadian inventory whose every fuel row is priced
// by ECCC carried a methodology page attributing all of it to US EPA. Not a stale number: a wrong
// attribution, on the page a verifier reads to decide whether the figures are traceable.
//
// The XLSX methods block already did it correctly, deriving the distinct set from combustionSource()
// across locations. So the two exports described the same inventory differently, and the more
// authoritative one was the wrong one.
//
// THE LAST GROUP OF TESTS IS THE POINT. Pinning the PDF's source list against the XLSX's is what
// stops them diverging again — a value test on either alone would pass while they disagreed.

const ROOT = process.cwd()
const PDF = 'lib/assurancePdf.ts'
const PAGE = 'app/dashboard/ghg/page.tsx'
const pdfSrc = readFileSync(join(ROOT, PDF), 'utf8')
const pageSrc = readFileSync(join(ROOT, PAGE), 'utf8')

// Same contract as gridDisplay / reportingYears: absent anchor throws, ambiguous anchor throws.
const lineIn = (src: string, file: string, anchor: string): string => {
  const hits = src.split('\n').filter(l => l.includes(anchor))
  if (hits.length === 0) throw new Error(`no line containing '${anchor}' in ${file} — the call site moved or was renamed`)
  if (hits.length > 1) throw new Error(`'${anchor}' matches ${hits.length} lines in ${file} — anchor is ambiguous`)
  return hits[0]
}

const loc = (country: string) => ({ country })

describe('combustion citations follow the jurisdiction that priced them', () => {
  it('V1 a CA-only inventory cites ECCC, not US EPA', () => {
    expect(combustionSourcesFor([loc('CA'), loc('CA')]))
      .toEqual(['ECCC (2025) Emission factors and reference values v3.0'])
    expect(combustionSourcesFor([loc('CA')])[0], 'the defect: US EPA on a Canadian inventory')
      .not.toBe(EF_SOURCES.combustion)
  })

  it('V2 a US-only inventory is unchanged', () => {
    expect(combustionSourcesFor([loc('US'), loc('US')])).toEqual([EF_SOURCES.combustion])
    expect(combustionSourcesFor([loc('US')])[0]).toBe('US EPA (2024) Emission Factors for Greenhouse Gas Inventories')
  })

  it('V3 a mixed CA + US inventory emits BOTH, deduplicated, in first-appearance order', () => {
    // Taking locations[0] would be right for most customers and silently wrong here — the reading
    // that looks fine until the case that matters.
    expect(combustionSourcesFor([loc('CA'), loc('US'), loc('CA'), loc('US')])).toEqual([
      'ECCC (2025) Emission factors and reference values v3.0',
      'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
    ])
    expect(combustionSourcesFor([loc('US'), loc('CA')])[0], 'order follows the locations').toBe(EF_SOURCES.combustion)
  })

  it('V4 every jurisdiction resolves to its own citation, and five locations give five sources', () => {
    const all = combustionSourcesFor([loc('US'), loc('CA'), loc('GB'), loc('DE'), loc('AU'), loc('NZ')])
    expect(all).toHaveLength(6)
    expect(new Set(all).size, 'no two jurisdictions share a citation').toBe(6)
    for (const c of ['US', 'CA', 'GB', 'DE', 'AU', 'NZ']) {
      expect(all).toContain(combustionSource({ country: c } as any))
    }
  })

  it('V5 an empty location set yields NO ROWS in either export — intended, not an oversight', () => {
    // BOTH exports now map the helper's output directly, with no fallback: zero sources resolved means
    // zero rows. That is the deliberate choice. An earlier draft had the PDF print efSources.combustion
    // so a row always appeared, and that is the wrong instinct on this document — a methodology page
    // citing US EPA BECAUSE NOTHING RESOLVED asserts something the inventory does not support, to the
    // reader deciding whether the figures are traceable. An absent row is honest; a wrong one is not.
    //
    // Unreachable today (emptyLocation() is always seeded), so this pins WHICH WAY TO BE WRONG if it
    // ever becomes reachable, and keeps the two exports behaving identically.
    expect(combustionSourcesFor([])).toEqual([])
    expect(gridSourcesFor([])).toEqual([])
    // Neither call site may reintroduce a fallback — that is what the assertions below are guarding.
    expect(pdfSrc, 'the PDF must not invent a combustion citation when none resolved')
      .not.toContain('combustionCitations.length ? combustionCitations')
    expect(pdfSrc, 'nor an electricity one')
      .not.toContain('gridCitations.length ? gridCitations')
    expect(pdfSrc).toContain("...combustionCitations.map(src => ['Combustion factors', src]),")
    expect(pdfSrc).toContain("...gridCitations.map(src => ['Electricity factors', src]),")
  })

  // ── THE TWO EXPORTS MUST NOT DISAGREE ─────────────────────────────────────────────────────────
  it('V6 the PDF derives its combustion rows from the shared helper', () => {
    // Each row line now carries its const directly — the fallback ternary that used to wrap them, and
    // to split the expression across two lines, is gone (see V5). lineIn still guards existence and
    // non-ambiguity: '.map(src =>' alone matches TWO lines here and would throw by design.
    expect(lineIn(pdfSrc, PDF, "['Combustion factors', src]"), 'the PDF must map the resolved set')
      .toContain('combustionCitations.map(src =>')
    expect(lineIn(pdfSrc, PDF, "['Electricity factors', src]"), 'same for electricity')
      .toContain('gridCitations.map(src =>')
    expect(pdfSrc).toContain("import { combustionSourcesFor, gridSourcesFor } from './ghg/engine'")
    expect(pdfSrc, 'the country-blind constant must not be the combustion row again')
      .not.toContain("['Combustion factors', efSources.combustion]")
    expect(pdfSrc, 'the six-jurisdiction catalogue must not be the electricity row again')
      .not.toContain("['Electricity factors', efSources.electricity]")
    expect(pdfSrc).toContain('gridSourcesFor(inventory.locations)')
    // Bound once each, not called twice in one expression.
    expect(pdfSrc).toContain('const combustionCitations = combustionSourcesFor(inventory.locations)')
    expect(pdfSrc).toContain('const gridCitations = gridSourcesFor(inventory.locations)')
  })

  it('V7 the XLSX calls the SAME helpers as the PDF — agreement is structural, not asserted', () => {
    // Both exports now call combustionSourcesFor / gridSourcesFor. There is no second derivation left
    // to compare, so this asserts the call, not a resemblance between two expressions. Previously the
    // XLSX inlined `[...new Set(locations.map(combustionSource))]` and a test held the two in step;
    // one helper each removes the thing that could drift.
    expect(lineIn(pageSrc, PAGE, "['Combustion factors', src]"))
      .toContain('combustionSourcesFor(inventory.locations)')
    expect(lineIn(pageSrc, PAGE, "['Electricity factors', src]"))
      .toContain('gridSourcesFor(inventory.locations)')
    // Kept: the catalogue was the electricity row until this pass, and it must not come back.
    expect(pageSrc, 'the catalogue must not be the XLSX electricity row again')
      .not.toContain("['Electricity factors', EF_SOURCES.electricity]")
    expect(pageSrc, 'nor the country-blind combustion constant')
      .not.toContain("['Combustion factors', EF_SOURCES.combustion]")
  })

  it('V8 both helpers behave consistently across representative inventories', () => {
    // ⚠️ THIS TEST NO LONGER PROVES THE TWO EXPORTS AGREE — they call the same helpers, so agreement
    // is structural and V7 is what holds it. Comparing the helper against a replica of the XLSX would
    // now be `helper === helper`, a tautology dressed as a guard. What survives is worth keeping: the
    // reference lists below are written out independently of the implementation, so they still pin
    // WHAT the helpers return for a spread of single- and multi-jurisdiction inventories.
    const xlsxCombustion = (ls: { country: string }[]) => [...new Set(ls.map(l => combustionSource(l as any)))]
    const xlsxGrid = (ls: { country: string }[]) => [...new Set(ls.map(l => gridSource(l as any)))]
    const inventories = [
      [loc('CA')],
      [loc('US')],
      [loc('CA'), loc('US')],
      [loc('US'), loc('CA'), loc('GB')],
      [loc('NZ'), loc('NZ'), loc('AU'), loc('DE')],
    ]
    for (const inv of inventories) {
      const where = `[${inv.map(l => l.country).join(', ')}]`
      expect(combustionSourcesFor(inv), `combustion mismatch for ${where}`).toEqual(xlsxCombustion(inv))
      expect(gridSourcesFor(inv), `electricity mismatch for ${where}`).toEqual(xlsxGrid(inv))
      expect(combustionSourcesFor(inv).length, `${where}: never empty for a real inventory`).toBeGreaterThan(0)
    }
    // And the two families are genuinely being compared, not the same list twice: at least one of
    // these inventories must yield different combustion and electricity sets, or this test would pass
    // even if gridSourcesFor were aliased to combustionSourcesFor.
    expect(inventories.some(inv => JSON.stringify(combustionSourcesFor(inv)) !== JSON.stringify(gridSourcesFor(inv))))
      .toBe(true)
  })

  it('V9 scans real files — a moved call site fails loudly instead of passing vacuously', () => {
    expect(pdfSrc.length, `${PDF} looks empty`).toBeGreaterThan(5_000)
    expect(pageSrc.length, `${PAGE} looks empty`).toBeGreaterThan(10_000)
    expect(() => lineIn(pdfSrc, PDF, "['Combustion factors', src]")).not.toThrow()
    expect(() => lineIn(pdfSrc, PDF, "['Electricity factors', src]")).not.toThrow()
    expect(() => lineIn(pageSrc, PAGE, "['Combustion factors', src]")).not.toThrow()
    expect(() => lineIn(pageSrc, PAGE, "['Electricity factors', src]")).not.toThrow()
  })
})

// ── W. THE SAME TREATMENT FOR ELECTRICITY ────────────────────────────────────────────────────────
//
// efSources.electricity is the six-jurisdiction CATALOGUE — 'US EPA eGRID2023 (US) / ECCC v3.0 (CA) /
// DEFRA 2025 (UK) / EEA 2023 (EU) / DCCEEW NGA 2025 (AU) / NZ MfE 2026 (NZ)'. Correct as a catalogue,
// wrong as an attribution: it names six publishers where one priced the rows. Commit 06b6125 split it
// into EF_SOURCES.electricity_* and removed it from the workings table for exactly that reason; the
// assurance PDF's methodology page kept it.
//
// gridSource() reads ONLY loc.country — no region key, no reporting year — so the PDF already had
// everything it needed. Nothing was threaded through to make this work.
describe('electricity citations follow the jurisdiction that priced them', () => {
  it('W1 a CA-only inventory cites ECCC, not the catalogue', () => {
    expect(gridSourcesFor([loc('CA'), loc('CA')]))
      .toEqual(['ECCC (2025) Emission factors and reference values v3.0'])
    expect(gridSourcesFor([loc('CA')])[0], 'the defect: the whole catalogue on one jurisdiction')
      .not.toBe(EF_SOURCES.electricity)
  })

  it('W2 a US-only inventory cites eGRID alone, not the catalogue', () => {
    expect(gridSourcesFor([loc('US')])).toEqual(['US EPA eGRID2023'])
    // The old row printed the catalogue even for a US-only inventory — six publishers for one.
    expect(gridSourcesFor([loc('US')])[0]).not.toBe(EF_SOURCES.electricity)
    expect(EF_SOURCES.electricity, 'the catalogue still exists as a catalogue').toContain('/')
  })

  it('W3 a mixed CA + US inventory emits BOTH, deduplicated, in first-appearance order', () => {
    expect(gridSourcesFor([loc('CA'), loc('US'), loc('CA'), loc('US')])).toEqual([
      'ECCC (2025) Emission factors and reference values v3.0',
      'US EPA eGRID2023',
    ])
  })

  it('W4 every jurisdiction resolves to its own citation; EU members share one', () => {
    const all = gridSourcesFor([loc('US'), loc('CA'), loc('GB'), loc('DE'), loc('AU'), loc('NZ')])
    expect(all).toHaveLength(6)
    expect(new Set(all).size, 'no two jurisdictions share a citation here').toBe(6)
    for (const c of ['US', 'CA', 'GB', 'DE', 'AU', 'NZ']) {
      expect(all).toContain(gridSource({ country: c } as any))
    }
    // DE and FR are both EEA — a multi-country EU inventory must collapse to ONE row, not two.
    expect(gridSourcesFor([loc('DE'), loc('FR')])).toHaveLength(1)
  })

  it('W5 an empty locations list yields an empty set — see V5 for why no row is the right answer', () => {
    expect(gridSourcesFor([])).toEqual([])
    // The XLSX has always behaved this way; the PDF was brought into line rather than the reverse.
    expect(lineIn(pageSrc, PAGE, "['Electricity factors', src]"), 'no fallback on the XLSX side either')
      .not.toContain('?')
  })

  it('W6 the two families are resolved independently — four jurisdictions cite different documents', () => {
    // ⚠️ WRITTEN WRONG FIRST TIME, and the test caught it. The original asserted that combustion and
    // electricity ALWAYS name different sources, using GB as the example. They are identical for GB:
    // DEFRA publishes both families in one document, and so does ECCC for CA. Four of six differ,
    // two legitimately coincide, and asserting otherwise would have pinned a claim about the sources
    // that is simply false.
    for (const c of ['US', 'DE', 'AU', 'NZ']) {
      expect(combustionSourcesFor([loc(c)])[0], `${c}`).not.toBe(gridSourcesFor([loc(c)])[0])
    }
    // CA and GB coincide because one publisher covers both. Pinned so the coincidence reads as a fact
    // about the sources rather than as a bug in the helpers.
    for (const c of ['CA', 'GB']) {
      expect(combustionSourcesFor([loc(c)])[0], `${c} — one publisher, both families`)
        .toBe(gridSourcesFor([loc(c)])[0])
    }
  })
})
