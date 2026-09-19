import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { scope3MethodDescription, type Scope3Method } from './categoryMethods'
import { methodologyHierarchyLines } from './methodSummary'

// ── SCOPE 3 CUSTOMER TEXT: NO EM-DASHES, AND NO PLACEHOLDER THAT READS AS AN ENTERED VALUE ─────────────
//
// Read with the TypeScript parser, not by line, so only what a customer can see is checked: string
// literals, template text and JSX text. Comments (including multi-line JSX comments, which a line scan
// cannot tell from text) are not part of any of those.
//
// ⚠️ ONE EXEMPTION, AND ONLY AS A WHOLE LITERAL: a string that is exactly "—" is the empty-cell marker (the
// CSV's "—" and the same marker on screen for "no value"). A template piece such as `${a} — ${b}` is prose
// and is NOT exempt, even though its text trims to a dash.

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const parse = (rel: string) => ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

interface Piece { where: string; text: string; wholeLiteral: boolean }

function textPieces(node: ts.Node, sf: ts.SourceFile, rel: string): Piece[] {
  const out: Piece[] = []
  const visit = (n: ts.Node) => {
    let text: string | null = null
    let whole = false
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { text = n.text; whole = true }
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    else if (ts.isJsxText(n)) text = n.text
    if (text !== null) out.push({ where: `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, text, wholeLiteral: whole })
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

const dashed = (pieces: Piece[]) =>
  pieces.filter(p => p.text.includes('—') && !(p.wholeLiteral && p.text === '—')).map(p => `${p.where}: ${p.text.trim().slice(0, 80)}`)

/** The methodology page's Scope 3 module only: the object literal whose `module` names Scope 3. */
function methodologyScope3(): Piece[] {
  const rel = 'app/methodology/page.tsx'
  const sf = parse(rel)
  const found: ts.Node[] = []
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n) && n.properties.some(p =>
      ts.isPropertyAssignment(p) && p.name.getText(sf) === 'module' && ts.isStringLiteral(p.initializer) && p.initializer.text.startsWith('Scope 3'))) found.push(n)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  expect(found, 'the Scope 3 module on the methodology page').toHaveLength(1)
  return textPieces(found[0], sf, rel)
}

// Every file whose strings are rendered on the Scope 3 page as customer copy, beside the page itself.
const LIB_SOURCES = [
  'lib/scope3/categoryScope.ts',       // why a row is outside a category: the pickers and the CSV
  'lib/scope3/cat15.ts',
  'lib/scope3/businessTravelCopy.ts',
  'lib/scope3/notEntered.ts',
  'lib/emissionFactors/productOptions.ts', // the EXIOBASE product-type note after a picker option
  'lib/emissionFactors/spendResolver.server.ts', // the secondary-material explanation the route returns
]

describe('Scope 3 customer text', () => {
  it('SC1 ⚠️ no em-dash in any string on the Scope 3 page, except the whole-literal "—" empty-cell marker', () => {
    const rel = 'app/dashboard/scope3/page.tsx'
    const sf = parse(rel)
    const pieces = textPieces(sf, sf, rel)
    expect(pieces.length).toBeGreaterThan(500)
    expect(dashed(pieces)).toEqual([])
    // The marker is still there, and still exempt: the CSV's empty cells and the on-screen "no value".
    expect(pieces.filter(p => p.wholeLiteral && p.text === '—').length).toBeGreaterThanOrEqual(3)
  })

  it('SC2 ⚠️ no em-dash in the methodology page\'s Scope 3 module, including its heading and section titles', () => {
    const pieces = methodologyScope3()
    expect(pieces.map(p => p.text)).toContain('Scope 3: Full Value Chain')
    expect(pieces.map(p => p.text)).toContain('Category 15: Financed emissions')
    expect(dashed(pieces)).toEqual([])
  })

  it('SC3 ⚠️ no em-dash in any Scope 3 method description or hierarchy line', () => {
    const methods: Scope3Method[] = ['exiobase_spend', 'flat_spend', 'waste_factors', 'end_of_life_factors', 'business_travel_factors', 'commuting_factors', 'pcaf']
    for (const m of methods) expect(scope3MethodDescription(m), m).not.toContain('—')
    for (const line of methodologyHierarchyLines()) expect(line.slice(0, 60)).toBe(line.slice(0, 60)) // readable failure below
    expect(methodologyHierarchyLines().filter(l => l.includes('—'))).toEqual([])
  })

  it('SC4 ⚠️ no em-dash in the lib/ strings the Scope 3 page renders', () => {
    const found = LIB_SOURCES.flatMap(rel => { const sf = parse(rel); return dashed(textPieces(sf, sf, rel)) })
    expect(found).toEqual([])
  })

  it('SC5 ⚠️ no numeric input on the Scope 3 page has a placeholder that could be read as an entered value', () => {
    // A tester read Cat 6's grey "1" as entered. Every placeholder on a number input must carry words
    // ("e.g. 2", "15 km if left blank"), never a bare number, which is indistinguishable from a value.
    const rel = 'app/dashboard/scope3/page.tsx'
    const sf = parse(rel)
    const numeric: { where: string; placeholder: string | null }[] = []
    const visit = (n: ts.Node) => {
      if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute)
        const get = (name: string) => attrs.find(a => a.name.getText(sf) === name)?.initializer
        const type = get('type')
        if (type && ts.isStringLiteral(type) && type.text === 'number') {
          const ph = get('placeholder')
          numeric.push({
            where: `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`,
            placeholder: ph && ts.isStringLiteral(ph) ? ph.text : ph ? ph.getText(sf) : null,
          })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    expect(numeric.length).toBe(19)
    const bare = numeric.filter(x => x.placeholder !== null && /^\s*[\d.,\s]+\s*$/.test(x.placeholder))
    expect(bare).toEqual([])
  })
})
