/**
 * The embedded font, against the prose it has to set.
 *
 * ⚠️ THE FAILURE THIS SUITE EXISTS FOR IS INVISIBLE EVERYWHERE ELSE. A character outside the
 * subset renders as NOTHING in the generated PDF — not an error, not a warning, not a fallback
 * glyph, not a box. The document is produced, it opens, it looks finished, and a word is missing
 * from a sentence in a customer's board paper. tsc passes. The build passes. The console is clean.
 * The only reader who meets it is the verifier the document was written for.
 *
 * ⚠️ COVERAGE IS READ FROM THE FONT'S OWN cmap, NOT FROM A LIST OF RANGES.
 * charis.ts documents the subsetted ranges in its header but does not export them as data, and
 * copying them here would create the second copy that drifts — the failure this codebase has spent
 * the day closing. So this suite decodes the base64, parses the cmap table, and asks the actual
 * shipped bytes which code points they can render. That is the only authority that cannot be wrong:
 * it is what jsPDF will consult at render time.
 *
 * A consequence worth knowing: regenerate the subset with different ranges and these tests follow
 * automatically. Nothing here needs updating to match.
 *
 * ⚠️ THIS SUITE MUST BE EXTENDED WHEN PROSE MOVES SOMEWHERE NEW. Exported constants of
 * boardReport.ts and register.ts are walked WHOLESALE through a namespace import, so a new exported
 * constant is covered the moment it is added — that part is automatic. What is NOT covered is prose
 * that lives anywhere else: a string inlined in a component, copy fetched from the database, a
 * label built at render time. Add a walk for it here in the same change that introduces it. The
 * alternative to extending this suite is a silent gap in a document a customer sends to a verifier.
 *
 * Not tested here, deliberately: anything about how the glyphs LOOK, and any byte count that a
 * legitimate regeneration would change. Structure, not size.
 */

import { describe, it, expect } from 'vitest'
import type jsPDF from 'jspdf'
import {
  CHARIS_FAMILY, CHARIS_FACES,
  CHARIS_REGULAR_B64, CHARIS_BOLD_B64, CHARIS_ITALIC_B64,
  registerCharis,
} from './charis'
import * as boardReport from '../materiality/boardReport'
import * as register from '../materiality/register'

// ── reading the font ─────────────────────────────────────────────────────────────────────────────

const view = (b64: string): DataView => {
  const bytes = Buffer.from(b64, 'base64')
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

const tagAt = (dv: DataView, off: number) =>
  String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3))

/** Offset of a table in the sfnt directory. Throws rather than returning a wrong answer. */
function tableOffset(dv: DataView, want: string): number {
  const numTables = dv.getUint16(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (tagAt(dv, rec) === want) return dv.getUint32(rec + 8)
  }
  throw new Error(`This font has no ${want} table.`)
}

/** The best cmap subtable available: a segmented format 12, else a format 4. */
function cmapSubtable(dv: DataView, cmapOff: number): number {
  const n = dv.getUint16(cmapOff + 2)
  let best = -1
  let bestScore = -1
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8
    const platform = dv.getUint16(rec)
    const encoding = dv.getUint16(rec + 2)
    const off = cmapOff + dv.getUint32(rec + 4)
    const format = dv.getUint16(off)
    const score = format === 12 ? 3
      : format === 4 && platform === 3 && encoding === 1 ? 2
      : format === 4 ? 1
      : -1
    if (score > bestScore) { bestScore = score; best = off }
  }
  // ⚠️ LOUDLY, not silently. An unreadable cmap must not read as "nothing is covered", which would
  // fail every prose test with a misleading reason.
  if (best < 0 || bestScore < 0) throw new Error('This font has no cmap subtable this test can read.')
  return best
}

/** Every code point the font can actually render. Glyph 0 is .notdef and does not count. */
function coverageOf(b64: string): Set<number> {
  const dv = view(b64)
  const off = cmapSubtable(dv, tableOffset(dv, 'cmap'))
  const format = dv.getUint16(off)
  const covered = new Set<number>()

  if (format === 12) {
    const nGroups = dv.getUint32(off + 12)
    for (let i = 0; i < nGroups; i++) {
      const g = off + 16 + i * 12
      const start = dv.getUint32(g)
      const end = dv.getUint32(g + 4)
      const startGid = dv.getUint32(g + 8)
      for (let c = start; c <= end; c++) if (startGid + (c - start) !== 0) covered.add(c)
    }
    return covered
  }

  const segCount = dv.getUint16(off + 6) / 2
  const endBase = off + 14
  const startBase = endBase + segCount * 2 + 2
  const deltaBase = startBase + segCount * 2
  const rangeBase = deltaBase + segCount * 2

  for (let i = 0; i < segCount; i++) {
    const end = dv.getUint16(endBase + i * 2)
    const start = dv.getUint16(startBase + i * 2)
    if (start > end) continue
    const delta = dv.getInt16(deltaBase + i * 2)
    const rangeOffset = dv.getUint16(rangeBase + i * 2)

    for (let c = start; c <= end; c++) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff
      } else {
        const gi = rangeBase + i * 2 + rangeOffset + (c - start) * 2
        if (gi + 1 >= dv.byteLength) continue
        glyph = dv.getUint16(gi)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) covered.add(c)
    }
  }
  return covered
}

const REGULAR = coverageOf(CHARIS_REGULAR_B64)
const BOLD = coverageOf(CHARIS_BOLD_B64)
const ITALIC = coverageOf(CHARIS_ITALIC_B64)

// ── walking the prose ────────────────────────────────────────────────────────────────────────────

/** Layout, not glyphs. jsPDF handles these itself and no font needs to carry them. */
const STRUCTURAL = new Set(['\n', '\r', '\t'])

type Offender = string

/**
 * Every character of every string reachable from `value`, checked against `covered`.
 * The path is carried down so a failure names the constant it came from — "a character is missing"
 * would send the reader hunting through 674 lines.
 */
function offendersIn(value: unknown, covered: Set<number>, path: string,
                     out: Offender[] = []): Offender[] {
  if (typeof value === 'string') {
    for (const ch of value) {
      if (STRUCTURAL.has(ch)) continue
      const cp = ch.codePointAt(0) as number
      if (!covered.has(cp)) {
        const hex = cp.toString(16).toUpperCase().padStart(4, '0')
        out.push(`${path}: "${ch}" (U+${hex})`)
      }
    }
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => offendersIn(v, covered, `${path}[${i}]`, out))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      offendersIn(v, covered, `${path}.${k}`, out)
    }
    return out
  }
  return out
}

/** Namespace exports, minus the functions and classes. New constants are picked up for free. */
const proseOf = (mod: Record<string, unknown>) =>
  Object.entries(mod).filter(([, v]) => typeof v !== 'function')

/** Deduplicated, so one stray character in a long paragraph reports once and not forty times. */
const unique = (xs: Offender[]) => [...new Set(xs)]


describe('the cmap parser reads the shipped font, not an empty set', () => {
  // ⚠️ FIRST, because everything below depends on it. If the parser were broken and returned an
  // empty set, every prose test would fail at once and name the wrong cause.
  it.each([
    ['A', 0x0041], ['z', 0x007a], ['0', 0x0030], [' ', 0x0020],
    ['—', 0x2014], ['’', 0x2019], ['§', 0x00a7], ['¶', 0x00b6],
    ['→', 0x2192], ['×', 0x00d7], ['€', 0x20ac], ['£', 0x00a3],
  ])('the regular face can set %s', (_ch, cp) => {
    expect(REGULAR.has(cp as number)).toBe(true)
  })

  it('coverage is a real subset — large enough to be a font, small enough to be a subset', () => {
    expect(REGULAR.size).toBeGreaterThan(100)
    // Not a byte count: this is a structural claim that the subsetting happened at all. The full
    // family carries thousands of glyphs.
    expect(REGULAR.size).toBeLessThan(2000)
  })

  it('all three faces cover the same characters', () => {
    // A face that lost a character in regeneration would set it in one weight and drop it in
    // another — a document where a word vanishes only where it was emphasised.
    const missingFromBold = [...REGULAR].filter(c => !BOLD.has(c))
    const missingFromItalic = [...REGULAR].filter(c => !ITALIC.has(c))
    expect(missingFromBold.map(c => 'U+' + c.toString(16).toUpperCase())).toEqual([])
    expect(missingFromItalic.map(c => 'U+' + c.toString(16).toUpperCase())).toEqual([])
  })
})


describe('every character of the board paper’s prose can be rendered', () => {
  it.each(proseOf(boardReport as unknown as Record<string, unknown>))(
    'boardReport.%s', (name, value) => {
      const offenders = unique(offendersIn(value, REGULAR, `boardReport.${name}`))
      // ⚠️ The message names the character, its code point and the constant. Anything less sends
      // the reader hunting.
      expect(offenders).toEqual([])
    })

  it('the walk actually visited something — an empty walk proves nothing', () => {
    const seen = proseOf(boardReport as unknown as Record<string, unknown>)
    expect(seen.length).toBeGreaterThan(15)
  })

  it('and it reaches nested strings, not only top-level ones', () => {
    // PROVISIONS is an array of objects of strings; WHY_THIS_MATTERS likewise. If the walker
    // stopped at the top level these would pass vacuously.
    const found = offendersIn({ probe: 'x≤y' }, REGULAR, 'probe')
    expect(found).toEqual(['probe.probe: "≤" (U+2264)'])
  })
})


describe('every character of the register’s prose can be rendered', () => {
  // The board paper renders the register's own statements verbatim in section 7, so its prose has
  // to survive the same subset.
  it.each(proseOf(register as unknown as Record<string, unknown>))(
    'register.%s', (name, value) => {
      const offenders = unique(offendersIn(value, REGULAR, `register.${name}`))
      expect(offenders).toEqual([])
    })
})


describe('the embedded base64 is structurally sound', () => {
  const FACES: [string, string][] = [
    ['regular', CHARIS_REGULAR_B64],
    ['bold', CHARIS_BOLD_B64],
    ['italic', CHARIS_ITALIC_B64],
  ]

  it.each(FACES)('%s uses only the base64 alphabet', (_n, b64) => {
    expect(b64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  })

  it.each(FACES)('%s is a whole number of base64 quanta', (_n, b64) => {
    expect(b64.length % 4).toBe(0)
  })

  it.each(FACES)('%s decodes to a TrueType sfnt', (_n, b64) => {
    // ⚠️ 00 01 00 00 is the sfnt version. A truncated or re-wrapped paste fails HERE rather than
    // when a customer opens a PDF.
    const bytes = Buffer.from(b64, 'base64')
    expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00])
  })

  it.each(FACES)('%s carries the tables a renderer needs', (_n, b64) => {
    const dv = view(b64)
    for (const t of ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp']) {
      expect(() => tableOffset(dv, t)).not.toThrow()
    }
  })

  it.each(FACES)('%s is not wrapped across lines', (_n, b64) => {
    expect(b64).not.toMatch(/\s/)
  })
})


describe('registerCharis puts all three styles on the document', () => {
  const stub = () => {
    const vfs: Record<string, string> = {}
    const fonts: { file: string; family: string; style: string }[] = []
    const doc = {
      addFileToVFS: (file: string, data: string) => { vfs[file] = data },
      addFont: (file: string, family: string, style: string) => { fonts.push({ file, family, style }) },
    }
    return { doc: doc as unknown as jsPDF, vfs, fonts }
  }

  it('registers three faces under one family', () => {
    const { doc, fonts } = stub()
    registerCharis(doc)
    expect(fonts).toHaveLength(3)
    expect(new Set(fonts.map(f => f.family))).toEqual(new Set([CHARIS_FAMILY]))
  })

  it('registers exactly normal, bold and italic', () => {
    const { doc, fonts } = stub()
    registerCharis(doc)
    expect(new Set(fonts.map(f => f.style))).toEqual(new Set(['normal', 'bold', 'italic']))
  })

  it('writes each face into the document’s virtual file system first', () => {
    const { doc, vfs, fonts } = stub()
    registerCharis(doc)
    // Every registered font must name a file that was actually written, or setFont resolves to
    // a face with no bytes behind it.
    for (const f of fonts) expect(Object.keys(vfs)).toContain(f.file)
    expect(Object.keys(vfs)).toHaveLength(3)
  })

  it('the payload written is the payload exported', () => {
    const { doc, vfs } = stub()
    registerCharis(doc)
    for (const face of CHARIS_FACES) expect(vfs[face.file]).toBe(face.base64)
  })

  it('the filenames are distinct, so no face overwrites another', () => {
    expect(new Set(CHARIS_FACES.map(f => f.file)).size).toBe(CHARIS_FACES.length)
  })

  it('is safe to call twice on one document', () => {
    const { doc, vfs } = stub()
    registerCharis(doc)
    registerCharis(doc)
    expect(Object.keys(vfs)).toHaveLength(3)
  })
})
