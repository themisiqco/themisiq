import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EF_SOURCES, FRAMEWORKS, buildWorkings, emptyLocation } from './ghg/engine'
import { SPEND_EF_SOURCES } from './emissionFactors/spend'
import { DEFRA_WASTE_META } from './emissionFactors/defraWaste'
import { GENERIC_SPEND_FACTOR } from './emissionFactors'
import { DEFRA_TRAVEL_META } from './emissionFactors/defraTravel'

// ── NO SURFACE MAY CLAIM A PUBLISHER'S FACTORS THAT NO FACTOR RECORD HOLDS ─────────────────────────
//
// The general form of categoryMethods.test.ts M5 ("DEFRA/Exiobase"). On 17 Sep 2026 /climate-ghg still
// advertised "IEA 2024 grid electricity factors" and "DEFRA 2024 travel and freight factors": neither
// exists. M5 could not see either, because it matched one phrase.
//
// ⚠️ WHY NOT THE BROAD RULE ("a publisher named under app/ must have factors in lib/"). Two reasons, both
// found by running it. (1) It CANNOT CATCH THIS DEFECT: DEFRA factors do exist, for fuels, grid, heat and
// waste, so "DEFRA travel factors" passes a publisher-only check. The falsehood was the year and the
// activity, not the name. (2) It is noisy: "EEA" is also the European Economic Area (privacy page), and
// IPCC, EPA and GHG Protocol are named for standards and GWPs, not only for factors.
//
// SO THREE NARROW RULES. The HELD side of each is derived from the factor records (EF_SOURCES, the waste
// artefact, the EXIOBASE source, the provenance records), so it moves when they do. The VOCABULARY is typed
// and closed: a publisher or activity word not listed below is invisible to all three rules.
//   R1 PUBLISHER + YEAR.  "DEFRA 2024", "IEA 2024": the pair must appear in a held citation.
//   R2 UNHELD PUBLISHER.  A known factor publisher that no held citation names at all, anywhere.
//   R3 PUBLISHER + UNSOURCED ACTIVITY. A publisher in the same clause as an activity whose factors have no
//      recorded source ("DEFRA ... travel"). The activity list shrinks automatically when a provenance
//      record is filled in.
//   R4 FRAMEWORK + GWP SET. A framework named beside a GWP set must be beside ITS set, per FRAMEWORKS.
//   R5 UNIVERSAL GWP CLAIM. "AR6 GWP values throughout" is false while any factor is applied as published.
// R4 and R5 were added the same day, after "AR4 for SB 253" was found on three pages three months after
// commit f83326a moved SB 253 to AR6. See the notes above each.
// What none of them catches: a year-less claim about a held publisher for an activity that IS sourced from
// someone else ("DEFRA grid factors" on a US page). That needs a structured record of which publisher
// prices which activity, which does not exist yet.

const ROOT = join(__dirname, '..')

// Factor publishers as they are written in prose. Aliases collapse to one key. GHG Protocol is deliberately
// absent: it is a standard, not a factor publisher.
const PUBLISHER_PATTERNS: [string, RegExp][] = [
  ['DEFRA/DESNZ', /DEFRA|DESNZ/g],
  ['EPA', /\bEPA\b/g],
  ['eGRID', /eGRID/g],
  ['ECCC', /\bECCC\b/g],
  ['EEA', /\bEEA\b/g],
  ['DCCEEW', /\bDCCEEW\b/g],
  ['MfE', /\bMfE\b/g],
  ['IPCC', /\bIPCC\b/g],
  ['AIB', /\bAIB\b/g],
  ['Green-e', /Green-e/g],
  ['EXIOBASE', /EXIOBASE|Exiobase/g],
  ['ecoinvent', /[Ee]coinvent/g],
  ['IEA', /\bIEA\b/g],
  ['USEEIO', /USEEIO/g],
  ['CEDA', /\bCEDA\b/g],
  ['Climatiq', /Climatiq/g],
]

type Mention = { publisher: string; index: number; end: number }

function mentions(text: string): Mention[] {
  const out: Mention[] = []
  for (const [publisher, re] of PUBLISHER_PATTERNS) {
    for (const m of text.matchAll(re)) out.push({ publisher, index: m.index!, end: m.index! + m[0].length })
  }
  return out.sort((a, b) => a.index - b.index)
}

/**
 * Every (publisher, year) a text claims: the first four-digit year within 30 characters after the name,
 * stopping at a clause separator or at the next publisher, so "ECCC, DEFRA, IPCC 2006" claims IPCC 2006
 * only, and "DEFRA/DESNZ (2026)" claims DEFRA/DESNZ 2026.
 */
function yearClaims(text: string): string[] {
  const ms = mentions(text)
  const out: string[] = []
  ms.forEach((m, i) => {
    const next = ms.slice(i + 1).find(n => n.index >= m.end && n.publisher !== m.publisher)
    let gap = text.slice(m.end, Math.min(m.end + 30, next ? next.index : Infinity))
    const stop = gap.search(/[,;·\n]|\.\s/)
    if (stop >= 0) gap = gap.slice(0, stop)
    // A year after a month name is a DATE ("until June 2026"), not an edition year. Found when the
    // corrected methodology paragraph put "IPCC AR4 values until June 2026" in one clause.
    const y = gap.match(/(?<!\d)(?<!(?:January|February|March|April|May|June|July|August|September|October|November|December)\s)((?:19|20)\d{2})(?!\d)/)
    if (y) out.push(`${m.publisher} ${y[1]}`)
  })
  // Unique: "DEFRA/DESNZ (2026)" is two mentions of one publisher and one claim.
  return [...new Set(out)]
}

// ── THE RECORDS ─────────────────────────────────────────────────────────────────────────────────────
// Every citation a factor in lib/ is priced under. The one spend source named is the one with a factor
// file (the resolver imports only the EXIOBASE files); the others in SPEND_EF_SOURCES are catalogue
// entries with nothing behind them, and naming them would let a surface claim factors that are not held.
const exio = SPEND_EF_SOURCES.exiobase_38
const HELD_CITATIONS: string[] = [
  ...Object.values(EF_SOURCES),
  DEFRA_WASTE_META.source,
  DEFRA_TRAVEL_META.source, // Cats 6 and 7; the same citation string as the waste artefact
  `${exio.dataset} ${exio.version} ${exio.published}`,
]
const HELD_YEAR_CLAIMS = new Set(HELD_CITATIONS.flatMap(yearClaims))
// ⚠️ ecoinvent counts as held: AIB's residual-mix citation names it as an input. A claim of "ecoinvent
// factors" would therefore pass R2, though no ecoinvent factor is applied directly.
const HELD_PUBLISHERS = new Set(HELD_CITATIONS.flatMap(c => mentions(c).map(m => m.publisher)))

// Activities with no sourced factor behind them, so a publisher named beside one claims factors nobody holds.
//   ⚠️ "travel", "flight" and "commut" LEFT THE LIST ON 19 SEP 2026. They were keyed to
// EMISSION_FACTORS_PROVENANCE, which described the fixed travel and commuting values; those values are gone,
// and Cats 6 and 7 now price from the DEFRA/DESNZ 2026 artefact, which HELD_CITATIONS carries.
//   "hotel" STAYS, AND ON ITS OWN TERMS: no hotel factor is applied anywhere (Cat 6 excludes hotel stays while
// the licence of the published hotel factors is unconfirmed), so "DEFRA hotel factors" would be a false
// claim. It is not keyed to any provenance record because there is no factor to record one for; if hotels
// are ever priced, remove it here in the same change.
//   The transport words stay keyed to GENERIC_SPEND_FACTOR, which still prices Cat 9 with no source.
const UNPRICED_ACTIVITY_WORDS: RegExp[] = [/\bhotel/i]
const UNSOURCED_ACTIVITY_WORDS: RegExp[] = [
  ...UNPRICED_ACTIVITY_WORDS,
  ...(GENERIC_SPEND_FACTOR.source === null ? [/\bfreight/i, /\blogistic/i, /\bshipping/i] : []),
]

/** A line's clauses: split after . ; or · followed by whitespace. */
const clausesOf = (line: string): string[] => line.split(/(?<=[.;·])\s+/)

// ── R4: FRAMEWORK + GWP SET, NEAREST NEIGHBOUR ─────────────────────────────────────────────────────
//
// Each framework mention is paired with the NEAREST GWP set mention, and that set must be the one FRAMEWORKS
// applies. Whole-clause pairing (any set in the clause) would flag a true mixed statement, "AR6 for CDP, AR4
// for SB 253", on its CDP half.
//   ⚠️ NEAREST IN THE SAME SEGMENT FIRST, THEN IN THE CLAUSE. Pure character distance was tried and got the
// mixed statement wrong the other way: in "AR5 for CDP, AR6 for ESRS E1" the AR6 two characters after CDP is
// nearer than the AR5 that CDP belongs to. So the clause is cut into segments at commas, parentheses and
// dashes, and a framework takes the nearest set in its own segment; only a segment with no set falls back to
// the clause ("SB 253, which is reported on IPCC AR4 values" still pairs SB 253 with AR4). Ties go to the
// set AFTER the framework.
//
// ⚠️ EXEMPT: a clause containing "until", which marks the set as history. That is what lets the methodology
// page, /calculate-emissions and the GHG assistant say SB 253 WAS AR4. The cost is real: a false
// present-tense claim sharing a clause with "until" passes.
//   NARROWED ON 17 SEP 2026. The exemption also covered "previously", "formerly", "alternate", "selectable"
// and "available". None matched any clause under app/ once the false "selectable alternate" GWP claim was
// removed, and each was a hole: "AR4 remains available for SB 253" passed. Add a word back only for a
// clause that needs it, and name that clause here.
//
// The aliases are typed. Every FRAMEWORKS id must have one, so a new framework cannot be invisible here.
const FRAMEWORK_ALIASES: Record<string, RegExp> = {
  sb253: /SB(?:\s|&nbsp;)?253|\bCARB\b/g,
  cdp: /\bCDP\b/g,
  esrs: /\bESRS\b/g,
  gri: /\bGRI\b/g,
  ecovadis: /EcoVadis/g,
  ifrs: /IFRS(?:\s|&nbsp;)?S2/g,
}
const AR_SET = /\bAR[456]\b/
const AR_SET_G = /\bAR([456])\b/g
const HISTORY = /\buntil\b/i

function frameworkGwpMismatches(clause: string): string[] {
  if (HISTORY.test(clause)) return []
  const sets = [...clause.matchAll(AR_SET_G)].map(m => ({ set: `AR${m[1]}`, index: m.index!, end: m.index! + m[0].length }))
  if (sets.length === 0) return []
  // Segment boundaries: the index of every separator, plus both ends.
  const cuts = [-1, ...[...clause.matchAll(/[,()—]|&mdash;/g)].map(m => m.index!), clause.length]
  const segmentOf = (i: number) => cuts.findIndex((c, k) => k > 0 && i < c)
  const out: string[] = []
  for (const fw of FRAMEWORKS) {
    for (const m of clause.matchAll(FRAMEWORK_ALIASES[fw.id])) {
      const start = m.index!, end = start + m[0].length
      const dist = (s: { index: number; end: number }) => s.index >= end ? s.index - end : start - s.end
      const inSegment = sets.filter(s => segmentOf(s.index) === segmentOf(start))
      const pool = inSegment.length > 0 ? inSegment : sets
      const nearest = pool.reduce((a, b) => dist(b) < dist(a) || (dist(b) === dist(a) && b.index >= end) ? b : a)
      if (nearest.set !== fw.gwp) out.push(`${fw.name} beside ${nearest.set}, applies ${fw.gwp}`)
    }
  }
  return [...new Set(out)]
}

// ── R5: UNIVERSAL GWP CLAIM ────────────────────────────────────────────────────────────────────────
// A GWP set, a GWP word and a universal word in one clause. The GWP word is required: without it the rule
// flagged "IPCC AR6 regions and impact-drivers ... public frameworks throughout" on two climate-risk pages,
// which is about regions, not GWPs. The premise is derived from the engine, not asserted: a UK gas row
// priced at AR6 is stamped with some other basis because DEFRA publishes the gases already combined.
const GWP_WORD = /\bGWPs?\b|global warming potential/i
const UNIVERSAL = /\bthroughout\b|\bevery (?:emission )?factor|\ball (?:emission )?factors\b/i
const ANY_AS_PUBLISHED = buildWorkings(
  [{ ...emptyLocation('uk', 'UK'), country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' }],
  'AR6', 2026,
).some(r => r.scope === 1 && r.result_tco2e != null && r.gwp_basis !== 'AR6')

/** Non-comment lines of every .ts/.tsx source file under app/, with their locations. */
function appLines(): { where: string; line: string }[] {
  const out: { where: string; line: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        // Comment lines are skipped, as in M5: a correction has to be able to quote the claim it removed.
        if (!/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) out.push({ where: `${path.slice(ROOT.length + 1)}:${i + 1}`, line })
      })
    }
  }
  walk(join(ROOT, 'app'))
  return out
}

describe('publisher claims under app/', () => {
  it('P0b every framework has an alias for R4', () => {
    expect(FRAMEWORKS.map(f => f.id).filter(id => !FRAMEWORK_ALIASES[id])).toEqual([])
  })

  it('P0 the extractor reads the cases it exists for', () => {
    expect(yearClaims('IEA 2024 grid electricity factors. DEFRA 2024 travel and freight factors.')).toEqual(['IEA 2024', 'DEFRA/DESNZ 2024'])
    expect(yearClaims('UK DEFRA/DESNZ (2026) GHG Conversion Factors')).toEqual(['DEFRA/DESNZ 2026'])
    expect(yearClaims('ECCC, DEFRA, IPCC 2006')).toEqual(['IPCC 2006'])
    expect(yearClaims('IPCC AR6 · IEA 2024 factors')).toEqual(['IEA 2024'])
    expect(yearClaims('US EPA eGRID2023')).toEqual(['eGRID 2023'])
    expect(yearClaims('NZ MfE Measuring Emissions 2026 v2')).toEqual(['MfE 2026'])
    expect(yearClaims('reported on IPCC AR4 values until June 2026')).toEqual([])
    expect(HELD_PUBLISHERS.has('IEA')).toBe(false)
    expect(HELD_YEAR_CLAIMS.has('DEFRA/DESNZ 2026')).toBe(true)
    expect(HELD_YEAR_CLAIMS.has('DEFRA/DESNZ 2025'), 'GRID_EF.UK 2025, via the electricity catalogue').toBe(true)
  })

  it('P1 ⚠️ a publisher named with a year must match a held citation', () => {
    const offences = appLines().flatMap(({ where, line }) =>
      yearClaims(line).filter(c => !HELD_YEAR_CLAIMS.has(c)).map(c => `${where}: "${c}"`))
    expect(offences).toEqual([])
  })

  it('P2 ⚠️ a factor publisher no held citation names must not be named at all', () => {
    const offences = appLines().flatMap(({ where, line }) =>
      mentions(line).filter(m => !HELD_PUBLISHERS.has(m.publisher)).map(m => `${where}: ${m.publisher}`))
    expect(offences).toEqual([])
  })

  it('P3 ⚠️ a publisher must not share a clause with an activity whose factors have no recorded source', () => {
    const offences = appLines().flatMap(({ where, line }) =>
      clausesOf(line)
        .filter(clause => mentions(clause).length > 0 && UNSOURCED_ACTIVITY_WORDS.some(w => w.test(clause)))
        .map(clause => `${where}: ${clause.trim().slice(0, 120)}`))
    expect(offences).toEqual([])
  })

  it('P4a the GWP pairing reads the cases it exists for', () => {
    const held = (c: string) => frameworkGwpMismatches(c)
    expect(held('IPCC AR6 global warming potentials (AR4 for SB 253)')).toEqual(['SB 253 beside AR4, applies AR6'])
    expect(held('IPCC AR6 emission factors (AR4 on CARB export)')).toEqual(['SB 253 beside AR4, applies AR6'])
    expect(held('The one exception is California SB 253, which is reported on IPCC AR4 values')).toEqual(['SB 253 beside AR4, applies AR6'])
    // Nearest-neighbour: a true mixed statement pairs each framework with the set next to it.
    expect(held('AR5 for CDP, AR6 for ESRS E1')).toEqual(['CDP beside AR5, applies AR6'])
    expect(held('AR6 GWP values across CDP, ESRS E1, GRI 305, EcoVadis and IFRS S2')).toEqual([])
    // A historical statement is not a claim about what is applied now.
    expect(held('SB 253 was reported on IPCC AR4 values until June 2026')).toEqual([])
    // An "alternate" or "available" claim is: nothing is selectable, so it is flagged like any other.
    expect(held('AR4 and AR5 remain available as selectable alternates for SB 253')).toEqual(['SB 253 beside AR5, applies AR6'])
  })

  it('P4 ⚠️ a framework named beside a GWP set must be beside the set FRAMEWORKS applies to it', () => {
    const offences = appLines().flatMap(({ where, line }) =>
      clausesOf(line).flatMap(frameworkGwpMismatches).map(m => `${where}: ${m}`))
    expect(offences).toEqual([])
  })

  it('P5 ⚠️ no GWP set may be claimed for every factor while any factor is applied as published', () => {
    expect(ANY_AS_PUBLISHED, 'the premise: some factors keep their publisher\'s GWP basis').toBe(true)
    const offences = appLines().flatMap(({ where, line }) =>
      clausesOf(line)
        .filter(c => AR_SET.test(c) && GWP_WORD.test(c) && UNIVERSAL.test(c))
        .map(c => `${where}: ${c.trim().slice(0, 120)}`))
    expect(offences).toEqual([])
  })
})
