import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { scope3MethodDescription, type Scope3Method } from './categoryMethods'
import { methodologyHierarchyLines } from './methodSummary'
import { SPEND_EF_SOURCES, type SpendFactorSource } from '../emissionFactors/spend'
import { KNOWN_EMISSIONS_PLACEHOLDER, NO_ESTIMATE_PLACEHOLDER } from './formCopy'

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
  'lib/scope3/dataSources.ts',       // the fifteen "Where to find it" texts
  'lib/scope3/formCopy.ts',           // the shared labels and placeholders beside the fields
  'lib/scope3/businessTravelCopy.ts',
  'lib/scope3/commutingCopy.ts',      // ⚠️ RENDERED SINCE 19 SEP 2026 AND NEVER LISTED HERE until 20 Sep
  'lib/scope3/cat3Copy.ts',           // every Category 3 sentence
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
    const methods: Scope3Method[] = ['exiobase_spend', 'no_method', 'waste_factors', 'end_of_life_factors', 'business_travel_factors', 'employee_commuting_factors', 'pcaf', 'fuel_and_energy_upstream']
    for (const m of methods) expect(scope3MethodDescription(m), m).not.toContain('—')
    for (const line of methodologyHierarchyLines()) expect(line.slice(0, 60)).toBe(line.slice(0, 60)) // readable failure below
    expect(methodologyHierarchyLines().filter(l => l.includes('—'))).toEqual([])
  })

  it('SC4 ⚠️ no em-dash in the lib/ strings the Scope 3 page renders', () => {
    const found = LIB_SOURCES.flatMap(rel => { const sf = parse(rel); return dashed(textPieces(sf, sf, rel)) })
    expect(found).toEqual([])
  })

  it('SC8 \u26a0\ufe0f neither confidence label calls a flat-priced category spend', () => {
    // ⚠️ TWO LABELS NAMED A PURCHASE THAT NEVER HAPPENED. The confidence pill read "Flat spend" and the
    // Results summary badge "{n} spend-based", of a group that includes Categories 9, 10, 11, 13 and 14,
    // where the spending is a customer's, a tenant's or a franchisee's. Both are read straight off the
    // page source: confidenceConfig is a closure inside the component and the badge is JSX text.
    const page = read('app/dashboard/scope3/page.tsx')
    const config = page.slice(page.indexOf('const confidenceConfig = {'))
    const block = config.slice(0, config.indexOf('\n  }'))
    // ⚠️ THE FLAT ENTRY ONLY. 'EXIOBASE spend' is the label of Categories 1, 2 and 4, which ARE priced
    // from spend, so a blanket ban on the word across the block would be wrong.
    const low = block.split('\n').find(l => /^\s*low:/.test(l))
    expect(low, 'the flat group\'s confidence pill').toBeTruthy()
    expect(low!, 'the flat group\'s confidence pill').not.toMatch(/spend/i)
    // ⚠️ 'Not calculated' SINCE 25 SEP 2026. 'Flat factor' was true while GENERIC_SPEND_FACTOR was applied
    // to Categories 8, 9, 10, 11, 13 and 14; the factor is deleted and every path to 'low' is now a
    // category that was not calculated, so the label says that. The ban on the word "spend" above still
    // holds and for the original reason.
    expect(low!).toContain("label: 'Not calculated'")
    expect(low!, 'no factor is applied, so none may be named').not.toMatch(/factor/i)
    // The key is what getConfidence returns and the code dispatches on; it is deliberately untouched.
    expect(low!).toMatch(/^\s*low: \{/)
    const badge = page.split('\n').find(l => l.includes('{lowCount}'))
    expect(badge, 'the Results badge for the flat group').toBeTruthy()
    expect(badge!, 'the Results badge').not.toMatch(/spend/i)
    expect(badge!).toContain('{lowCount} not calculated')
    expect(badge!, 'the badge must not name a factor either').not.toMatch(/factor/i)
  })

  it('SC7 \u26a0\ufe0f the known-emissions placeholder does not call the figure spend', () => {
    // ⚠️ IT ARGUED WITH THE PARAGRAPH ABOVE IT. The placeholder read "Leave blank to use the spend-based
    // estimate" on the EXIOBASE panel and "Leave blank to use spend-based" on the generic one, while the
    // "Where to find it" text for Cats 9, 10, 11, 13 and 14 now says there is no spend of the company's
    // behind the figure at all. Two literals in two panels is also how the two spellings arose.
    expect(KNOWN_EMISSIONS_PLACEHOLDER).not.toMatch(/spend/i)
    expect(KNOWN_EMISSIONS_PLACEHOLDER).toBe('Leave blank to use the estimate')
    // ⚠️ TWO CONSTANTS SINCE 25 SEP 2026, AND THE SECOND EXISTS BECAUSE THE FIRST BECAME FALSE. 'Leave
    // blank to use the estimate' is true on the EXIOBASE panel and on Category 3's, where blank does fall
    // back to a computed figure. On the panel for Categories 8, 9, 10, 11, 13 and 14 there is no estimate to
    // fall back to: the flat factor is deleted and blank produces nothing. Telling that customer a figure
    // would appear is the defect this test was written to prevent, one wording later.
    const page = read('app/dashboard/scope3/page.tsx')
    expect(page.match(/placeholder=\{KNOWN_EMISSIONS_PLACEHOLDER\}/g) ?? [], 'EXIOBASE and Category 3').toHaveLength(2)
    expect(page.match(/placeholder=\{NO_ESTIMATE_PLACEHOLDER\}/g) ?? [], 'the six with no method').toHaveLength(1)
    expect(NO_ESTIMATE_PLACEHOLDER, 'it must not promise an estimate').not.toMatch(/estimate/i)
    expect(NO_ESTIMATE_PLACEHOLDER).not.toMatch(/spend/i)
    expect(page).not.toMatch(/Leave blank to use (the )?spend/)
  })

  it('SC6 ⚠️ no em-dash in the spend-source fields that customer sentences splice in', () => {
    // ⚠️ A RECORD CAN CARRY AN EM-DASH ONTO THE PAGE WITHOUT ONE APPEARING IN A PAGE LITERAL. dataset,
    // version, publisher, licence, classification and unit_conversion are read into
    // scope3MethodDescription('exiobase_spend') (lib/scope3/categoryMethods.ts), the spend panel's
    // workings summary and the spend route's disclosure sentences, so SC1 and SC4 never see them.
    // SPEND_EF_SOURCES.useeio_us.dataset read "USEEIO — US Environmentally-Extended Input-Output model"
    // until 20 Sep 2026; only exiobase_38 has a live consumer, so nothing had rendered it yet.
    //
    // ⚠️ THE FIELDS, NOT THE FILE. `note` is a provenance note for maintainers with no consumer anywhere,
    // and two of them contain an em-dash; scanning lib/emissionFactors/spend.ts whole would fail on text
    // no customer can reach and would push the next author to reword an internal record to satisfy a
    // customer-copy guard.
    const RENDERED: (keyof SpendFactorSource)[] =
      ['publisher', 'dataset', 'version', 'licence', 'classification', 'unit_conversion']
    const dashed: string[] = []
    for (const [id, src] of Object.entries(SPEND_EF_SOURCES)) {
      for (const field of RENDERED) {
        const v = src[field]
        if (typeof v === 'string' && v.includes('\u2014')) dashed.push(`SPEND_EF_SOURCES.${id}.${field}: ${v}`)
      }
    }
    expect(dashed).toEqual([])
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
        // NumberField (the Cat 7 rows) renders a number input and takes its placeholder as a prop, so its
        // call sites are numeric inputs for this check too.
        const tag = n.tagName.getText(sf)
        if ((type && ts.isStringLiteral(type) && type.text === 'number') || tag === 'NumberField') {
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
    // 27 since 20 Sep 2026: Category 3's known-emissions override. Its Annual spend field went at the
    // same time, but that input is ONE element in the source rendered for each flat category, so the
    // count moved by one and not by two.
    // ⚠️ 26 SINCE 25 SEP 2026, for the same reason in reverse: the Annual spend field was removed from the
    // panel shared by Categories 8, 9, 10, 11, 13 and 14, because nothing reads a spend for them now. One
    // element in the source, so the count drops by one and not by six.
    expect(numeric.length).toBe(26)
    const bare = numeric.filter(x => x.placeholder !== null && /^\s*[\d.,\s]+\s*$/.test(x.placeholder))
    expect(bare).toEqual([])
  })
})
