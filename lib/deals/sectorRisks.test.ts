// lib/deals/sectorRisks.test.ts
//
// Guards the jurisdictional conditioning of SECTOR_RISKS findings.
//
// WHY THIS FILE EXISTS. A finding's `detail` used to weld a MECHANISM true of the sector anywhere to
// an INSTRUMENT ASSERTION true only given a nexus, so a US-only Technology target read "Conformity
// assessment applies from {date}" under the EU AI Act and a Canadian retailer read that its goods
// "fall under the EU Deforestation Regulation". 942 tests passed throughout: nothing covered
// SECTOR_RISKS at all, and there was no test to break when 18 of the 35 findings were rewritten.
//
// The hardest defect to see is the one in test 2 — a CORRECT framework label above a paragraph that
// asserts an EU instrument. Review reads the badge and moves on.

import { describe, it, expect } from 'vitest'
import { SECTOR_RISKS, sectorRisks } from './assessment'
import { AI_ACT_HIGH_RISK_STANDALONE, AI_ACT_HIGH_RISK_EMBEDDED, AI_ACT_CITATION } from '../aiAct'
import { CS3D_APPLIES_FROM, CS3D_CITATION } from '../cs3d'

// Exactly the values app/dashboard/deals/page.tsx offers. A jurisdiction the form cannot produce
// would test nothing.
const JURISDICTIONS = ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']

const ALL = Object.entries(SECTOR_RISKS).flatMap(([sector, rs]) => rs.map(r => ({ sector, ...r })))
const find = (sector: string, jurisdiction: string | null, risk: string) => {
  const hit = sectorRisks(sector, jurisdiction).find(r => r.risk === risk)
  if (!hit) throw new Error(`sectorRisks dropped "${risk}" for ${sector} / ${jurisdiction}`)
  return hit
}

describe('SECTOR_RISKS — the template itself', () => {
  it('has 35 findings across 12 sectors', () => {
    expect(ALL).toHaveLength(35)
    expect(Object.keys(SECTOR_RISKS)).toHaveLength(12)
  })

  // establishedIn is compared against the deal's stored jurisdiction with ===, so a value the form
  // never writes can never match and the finding would be permanently conditional — silently.
  it('every establishedIn names jurisdictions the deal form can actually produce', () => {
    for (const f of ALL) {
      if (!f.conditional) continue
      expect(f.conditional.establishedIn.length).toBeGreaterThan(0)
      for (const j of f.conditional.establishedIn) expect(JURISDICTIONS).toContain(j)
    }
  })
})

// ─── 1. Resolution by jurisdiction ──────────────────────────────────────────────
//
// PINNED EXPECTATIONS, WRITTEN OUT INDEPENDENTLY OF THE DATA. The generated block below reads
// `establishedIn` off each finding and checks the resolver agrees with it — which verifies the
// RESOLVER but not the VALUES: change 'European Union' to 'UK' on a finding and both sides of that
// assertion move together, so it passes. (Confirmed by breaking it.) These entries are a second
// source of truth, so a wrong jurisdiction on a finding fails here.
const PINNED: { risk: string; sector: string; established: string[]; conditional: string[] }[] = [
  { risk: 'Carbon border adjustment exposure', sector: 'Industrials & Manufacturing',
    established: ['European Union'], conditional: ['USA', 'UK', 'Canada', 'Australia', 'Global', 'Other'] },
  { risk: 'AI governance exposure', sector: 'Technology',
    established: ['European Union'], conditional: ['USA', 'UK', 'Canada', 'Global'] },
  { risk: 'Deforestation exposure', sector: 'Consumer & Retail',
    established: ['European Union'], conditional: ['USA', 'Canada', 'UK', 'Global'] },
  // Two jurisdictions, not one — EU EPBD and UK MEES are separate regimes in one finding.
  { risk: 'Energy efficiency compliance', sector: 'Real Estate',
    established: ['European Union', 'UK'], conditional: ['USA', 'Canada', 'Australia', 'Global'] },
  // The only non-EU nexus in the set: the UK and Australian Modern Slavery Acts.
  { risk: 'Labour rights in supply chain', sector: 'Consumer & Retail',
    established: ['UK', 'Australia'], conditional: ['European Union', 'USA', 'Canada', 'Global'] },
]

describe('pinned jurisdictional expectations', () => {
  for (const p of PINNED) {
    it(`${p.sector} — ${p.risk}`, () => {
      for (const j of p.established) expect(find(p.sector, j, p.risk).scope).toBe('established')
      for (const j of p.conditional) expect(find(p.sector, j, p.risk).scope).toBe('conditional')
    })
  }
})

describe('conditional findings resolve by jurisdiction', () => {
  for (const f of ALL.filter(f => f.conditional)) {
    it(`${f.sector} — ${f.risk}`, () => {
      const { establishedIn } = f.conditional!

      // Established wherever the instrument binds directly.
      for (const j of establishedIn) {
        expect(find(f.sector, j, f.risk).scope).toBe('established')
      }

      // Conditional everywhere else. 'Global' is in this list ON PURPOSE: "Global / multiple
      // regions" is not confirmation of EU establishment, and treating it as one would reinstate
      // the assertion for exactly the targets least likely to be checked. Same reasoning as
      // csrdNonEuAbstention(), which abstains on 'Global' rather than resolving it.
      for (const j of ['Global', 'USA', 'Other']) {
        if (establishedIn.includes(j)) continue
        expect(find(f.sector, j, f.risk).scope).toBe('conditional')
      }
    })
  }

  it('an unset jurisdiction is not a match — nothing established means nothing asserted', () => {
    for (const f of ALL.filter(f => f.conditional)) {
      expect(find(f.sector, null, f.risk).scope).toBe('conditional')
      expect(find(f.sector, '', f.risk).scope).toBe('conditional')
    }
  })

  it('findings with no conditional are established in every jurisdiction', () => {
    for (const f of ALL.filter(f => !f.conditional)) {
      for (const j of JURISDICTIONS) expect(find(f.sector, j, f.risk).scope).toBe('established')
    }
  })
})

// ─── 2. No un-conditioned instrument assertion in `detail` ──────────────────────
//
// HOW THIS DETECTS. A PATTERN LIST of jurisdiction-bound instrument names, matched against `detail`.
// A structural rule was tried first and rejected: "no token from this finding's own `framework`
// string may appear in its `detail`" needs no maintained list, but it over-fires on universal
// tokens — 'Stranded asset risk' legitimately says "Requires IFRS S2 climate scenario analysis"
// under an 'IFRS S2 / TCFD' label — and it under-fires on the exact case that motivated the test:
// 'Fleet decarbonisation liability' asserted "EU FuelEU Maritime" under an 'SB 253 / CSRD' label,
// naming an instrument that is not one of its own tokens. So the list it is.
//
// ⚠️ WHAT THE LIST MISSES, stated so nobody reads a green run as proof of absence:
//   1. Any instrument not on it. A new finding citing Japan's SSBJ or California SB 261 passes.
//   2. Paraphrase. "must comply with the Regulation", "the Directive requires", "reporting is
//      mandatory from 2027" — all assert without naming, all pass.
//   3. Assertion vs mention. This flags NAMES, not claims. A correctly hedged sentence needs an
//      allowlist entry (see HEDGED below), and an unhedged one that avoids the name slips through.
//   4. Renamed or re-cited instruments — a future "CBAM II" is a new string.
// It is a net under the known class, not a proof.
const JURISDICTIONAL_INSTRUMENTS = [
  'EU Deforestation Regulation', 'EUDR',
  'Carbon Border Adjustment', 'CBAM',
  'EU ETS', 'FuelEU',
  'REACH',
  'EU Taxonomy',
  'SFDR', 'Article 8/9',
  'ESRS',
  'CSRD', 'CS3D',
  'MEES', 'Energy Performance of Buildings',
  'AI Act',
  'ECB',
  'CRREM',
  'SB 253', 'SB 261', 'SECR',
  'Modern Slavery Act', 'S-211',
  'UK SDR',
]

// Mentions that are correct WITHOUT a conditional, each with the reason. An entry here is a
// deliberate, reviewed exception — the point is that adding one is an act, not a silence.
const HEDGED: Record<string, string> = {
  'Conflict minerals and HRDD':
    'Names CS3D only inside "though a binding due-diligence duty such as CS3D MAY require equivalent ' +
    'steps" — conditional in the sentence itself, and the finding is about voluntary OECD guidance ' +
    'rather than about CS3D. No nexus would make it more or less true.',
}

describe('no un-conditioned instrument assertion in `detail`', () => {
  for (const f of ALL) {
    it(`${f.sector} — ${f.risk}`, () => {
      if (f.conditional) return          // the assertion has a home; test 3 checks it is the right one
      if (HEDGED[f.risk]) return
      const named = JURISDICTIONAL_INSTRUMENTS.filter(n => f.detail.includes(n))
      expect(named, `"${f.risk}" names ${named.join(', ')} in its detail with no conditional to `
        + 'condition it. Move the assertion into conditional.consequence, or add a HEDGED entry '
        + 'saying why the mention is correct unconditioned.').toEqual([])
    })
  }

  it('every HEDGED entry still refers to a real finding', () => {
    for (const risk of Object.keys(HEDGED)) {
      expect(ALL.map(f => f.risk)).toContain(risk)
    }
  })
})

// ─── 3. Reassembly ──────────────────────────────────────────────────────────────
//
// The paragraph an in-nexus reader sees must be BYTE-IDENTICAL to the one that shipped before the
// split. Taken from `git show HEAD:lib/deals/assessment.ts` — not retyped. This is what proves the
// conditioning moved text rather than rewrote it, and it is the check that would catch a
// `consequence` quietly losing a citation or a date.
const PREVIOUS_DETAIL: Record<string, string> = {
  'High Scope 1 emissions exposure': 'Energy companies typically carry 60-80% of portfolio Scope 1 emissions, requiring full consolidation into the buyer\'s GHG inventory under prevailing emissions-accounting standards.',
  'Stranded asset risk': 'Fossil fuel assets face material impairment risk under 1.5°C transition scenarios. Requires IFRS S2 climate scenario analysis.',
  'Physical climate risk exposure': 'Energy infrastructure faces acute and chronic physical climate risk. Requires asset-level climate risk assessment.',
  'Financed emissions (Scope 3 Cat.15)': 'Financed emissions typically represent 95%+ of a financial institution\'s carbon footprint. PCAF methodology required.',
  'SFDR portfolio alignment': 'EU financial products must disclose sustainability characteristics. Article 8/9 classification impacts fund marketability.',
  'Physical risk in loan book': 'Mortgage and commercial real estate portfolios face material physical climate risk under ECB guidelines.',
  'Embodied carbon in portfolio': 'Building portfolios face stranding risk under EU carbon reduction pathways. CRREM analysis required.',
  'Energy efficiency compliance': 'EU Energy Performance of Buildings Directive and UK MEES require minimum EPC ratings. Non-compliant assets face rental prohibition.',
  'Physical flood and heat risk': 'Real estate assets face material physical climate risk. Asset-level flood mapping and heat stress analysis required.',
  'Data centre energy intensity': 'Data centre operations carry significant Scope 2 exposure. PPA and renewable energy coverage assessment needed.',
  'AI governance exposure': `Technology products may contain high-risk AI systems. Conformity assessment applies from ${AI_ACT_HIGH_RISK_STANDALONE} for stand-alone systems, and from ${AI_ACT_HIGH_RISK_EMBEDDED} where the AI is built into a product already covered by EU product-safety law (${AI_ACT_CITATION}).`,
  'Supply chain minerals risk': `Hardware products may rely on conflict minerals. CS3D due diligence obligations apply to in-scope companies from ${CS3D_APPLIES_FROM} (${CS3D_CITATION}).`,
  'Cold chain emissions': 'Pharmaceutical cold chain carries significant Scope 3 Cat.4 emissions from refrigerant leakage and transport.',
  'Pharmaceutical waste': 'Pharmaceutical manufacturing generates hazardous waste requiring environmental liability assessment.',
  'Clinical trial supply chain': 'Clinical trial operations in emerging markets carry human rights and labour standards risk.',
  'Scope 1 process emissions': 'Industrial manufacturing typically carries significant Scope 1 process emissions requiring full GHG inventory.',
  'Carbon border adjustment exposure': 'EU Carbon Border Adjustment Mechanism covers iron and steel, cement, aluminium, fertilisers, hydrogen and electricity. The definitive period began 1 January 2026, with a 50-tonne annual net-mass exemption for all but electricity and hydrogen (Regulation (EU) 2023/956 as amended by (EU) 2025/2083).',
  'Chemical and hazardous materials': 'Industrial operations may carry significant environmental liability from chemical usage and historical contamination.',
  'Scope 3 Cat.1 supplier emissions': 'Consumer goods companies typically carry 70-90% of emissions in Scope 3 Cat.1. Supplier engagement programme needed.',
  'Deforestation exposure': 'Consumer goods with exposure to cattle, soy, palm oil, cocoa, coffee, wood or rubber fall under the EU Deforestation Regulation, applying to large and medium operators from 30 December 2026 and to micro and small enterprises from 30 June 2027 (Regulation (EU) 2023/1115 as amended by (EU) 2025/2650).',
  'Labour rights in supply chain': 'Consumer goods supply chains carry significant forced labour and child labour risk in sourcing countries.',
  'Land use change emissions': 'Agricultural operations may carry significant land use change (LUC) emissions requiring scope 3 Cat.11 assessment.',
  'Deforestation and biodiversity': 'Agricultural supply chains face EU Deforestation Regulation and emerging TNFD nature-related disclosure requirements.',
  'Water risk': 'Agricultural operations in water-stressed regions face material operational and regulatory risk.',
  'Fleet decarbonisation liability': 'Transport fleet carries significant Scope 1 emissions. EU FuelEU Maritime and ETS expansion add compliance cost.',
  'Aviation and shipping ETS exposure': 'EU ETS now covers aviation and maritime. Carbon cost exposure requires detailed fleet assessment.',
  'Infrastructure physical risk': 'Transport infrastructure faces physical climate risk from flooding, extreme heat and storm events.',
  'Scope 1 extraction emissions': 'Mining operations carry significant Scope 1 methane and process emissions requiring full GHG inventory.',
  'Tailings and environmental liability': 'Mining operations carry material environmental liability from tailings management and historical contamination.',
  'Embodied carbon in products': 'Cement and steel production carry significant process emissions. EU Taxonomy alignment assessment required.',
  'EU CBAM exposure': 'Construction materials (cement, steel, aluminium) face EU Carbon Border Adjustment Mechanism from 2026.',
  'Site biodiversity and land use': 'Construction projects face emerging biodiversity disclosure requirements under TNFD and CSRD ESRS E4.',
  'Scope 2 and business travel emissions': 'Professional services firms carry Scope 2 and Scope 3 Cat.6 business travel emissions.',
  'Client portfolio ESG exposure': 'Advisory and consulting firms may carry reputational and legal exposure from ESG advice provided to clients.',
}

// The ONE finding whose text changed on purpose. 'Conflict minerals and HRDD' read "require OECD Due
// Diligence Guidance compliance", stating voluntary guidance as a legal obligation — a different
// defect from the jurisdictional ones, which no nexus would have cured, so it was corrected rather
// than conditioned. Excluded by name so the exclusion is visible rather than a missing key.
const REWRITTEN_ON_PURPOSE = ['Conflict minerals and HRDD']

// WHERE A CLEAN SPLIT WAS NOT POSSIBLE. In these ten the instrument was the SUBJECT of the mechanism
// sentence — "EU Carbon Border Adjustment Mechanism covers iron and steel…", "…fall under the EU
// Deforestation Regulation" — so the assertion could not be lifted off the end; the sentence had to
// be rewritten around the mechanism. This test found all ten on its first run, which is the reason
// it exists: the claim "byte-identical for an in-nexus target" holds for 8 of the 18 conditional
// findings, not 18, and that would otherwise have gone into the code comments as fact.
//
// These are checked differently: every citation, regulation number and year in the original must
// survive into the reassembled pair, so a rewrite cannot quietly drop a legal reference.
const REWRITTEN_MECHANISM: Record<string, string> = {
  'SFDR portfolio alignment': 'Original opened on the obligation ("EU financial products must disclose"); the mechanism had to be written fresh.',
  'Physical risk in loan book': 'Original ended "under ECB guidelines" as a qualifier on the risk, not as a separable clause.',
  'Embodied carbon in portfolio': 'Original said the stranding risk arose "under EU carbon reduction pathways" — the instrument WAS the mechanism.',
  'Energy efficiency compliance': 'Original was entirely the obligation; there was no mechanism sentence to keep.',
  'Carbon border adjustment exposure': 'Original opened "EU Carbon Border Adjustment Mechanism covers…" — the instrument was the grammatical subject.',
  'Deforestation exposure': 'Mechanism and assertion shared one clause: goods "fall under the EU Deforestation Regulation".',
  'Deforestation and biodiversity': 'Original said supply chains "face EU Deforestation Regulation and emerging TNFD…" in one predicate.',
  'Aviation and shipping ETS exposure': 'Original opened "EU ETS now covers aviation and maritime."',
  'EU CBAM exposure': 'Original was a single clause: materials "face EU Carbon Border Adjustment Mechanism from 2026".',
  'Site biodiversity and land use': 'Original named TNFD and CSRD ESRS E4 in one list; only the second is conditional.',
}

// Legal references that must survive any rewrite: regulation numbers, full dates, bare years,
// tonnage thresholds.
const references = (s: string): string[] => [
  ...(s.match(/\(EU\)\s\d{4}\/\d+/g) ?? []),
  ...(s.match(/\d{1,2}\s\w+\s\d{4}/g) ?? []),
  ...(s.match(/\b(?:19|20)\d{2}\b/g) ?? []),
  ...(s.match(/\d+-tonne/g) ?? []),
]

describe('reassembly — an in-nexus reader sees the paragraph that shipped before', () => {
  it('covers every finding except the one deliberately rewritten', () => {
    const covered = Object.keys(PREVIOUS_DETAIL).length + REWRITTEN_ON_PURPOSE.length
    expect(covered).toBe(ALL.length)
  })

  it('every REWRITTEN_MECHANISM entry names a real finding that has a conditional', () => {
    for (const risk of Object.keys(REWRITTEN_MECHANISM)) {
      const f = ALL.find(f => f.risk === risk)
      expect(f, `REWRITTEN_MECHANISM names "${risk}", which is not a finding`).toBeDefined()
      expect(f!.conditional, `"${risk}" was rewritten but carries no conditional`).toBeDefined()
    }
  })

  for (const f of ALL.filter(f => !REWRITTEN_ON_PURPOSE.includes(f.risk))) {
    it(`${f.sector} — ${f.risk}`, () => {
      const before = PREVIOUS_DETAIL[f.risk]
      expect(before, `no pre-change detail recorded for "${f.risk}"`).toBeDefined()
      const reassembled = f.conditional?.consequence
        ? `${f.detail} ${f.conditional.consequence}`
        : f.detail

      if (REWRITTEN_MECHANISM[f.risk]) {
        // Rewritten by necessity — hold the legal references instead of the wording.
        for (const ref of references(before)) {
          expect(reassembled, `"${f.risk}" lost the reference ${ref} in the rewrite`).toContain(ref)
        }
      } else {
        expect(reassembled).toBe(before)
      }

      // Either way, the resolver must produce the reassembled pair for a reader inside the nexus.
      const jurisdiction = f.conditional ? f.conditional.establishedIn[0] : 'European Union'
      expect(find(f.sector, jurisdiction, f.risk).detail).toBe(reassembled)
    })
  }

  it('the rewritten finding no longer states voluntary guidance as an obligation', () => {
    const f = ALL.find(f => f.risk === 'Conflict minerals and HRDD')!
    expect(f.detail).not.toContain('require OECD Due Diligence Guidance compliance')
    expect(f.detail).toContain('voluntary guidance')
  })
})

// ─── 4. The counts partition ────────────────────────────────────────────────────
//
// Nothing may be dropped or duplicated by conditioning. The severity tiles and the XLSX severity
// columns count `established` only, so a finding lost between the two arms would vanish from every
// count on every surface without appearing anywhere as a discrepancy.
describe('established + conditional partitions the sector template', () => {
  for (const jurisdiction of JURISDICTIONS) {
    it(`${jurisdiction}`, () => {
      for (const [sector, template] of Object.entries(SECTOR_RISKS)) {
        const resolved = sectorRisks(sector, jurisdiction)
        const established = resolved.filter(r => r.scope === 'established')
        const conditional = resolved.filter(r => r.scope === 'conditional')

        expect(resolved).toHaveLength(template.length)
        expect(established.length + conditional.length).toBe(template.length)
        // Order preserved, and every finding present exactly once.
        expect(resolved.map(r => r.risk)).toEqual(template.map(r => r.risk))
      }
    })
  }

  it('an unknown or unset sector resolves to nothing, never to a partial template', () => {
    expect(sectorRisks('Other', 'USA')).toEqual([])
    expect(sectorRisks('', 'USA')).toEqual([])
    expect(sectorRisks(null, 'USA')).toEqual([])
    expect(sectorRisks(undefined, 'USA')).toEqual([])
  })

  // Only the conditional arm carries a condition, and it is never empty. The union makes the first
  // half unrepresentable at compile time; this catches a blank string at run time.
  it('every conditional finding carries a non-empty condition sentence', () => {
    for (const jurisdiction of JURISDICTIONS) {
      for (const sector of Object.keys(SECTOR_RISKS)) {
        for (const r of sectorRisks(sector, jurisdiction)) {
          if (r.scope !== 'conditional') continue
          expect(r.condition.length).toBeGreaterThan(40)
          expect(r.condition).toContain('is not established here')
        }
      }
    }
  })
})
