import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scope3MethodFor, scope3MethodDescription, provenanceGap, METHOD_TAKES_ENTERED_FIGURE, takesEnteredFigure, type Scope3Method } from './categoryMethods'
import { enteredFigureSentence } from './methodSummary'
import { GENERIC_SPEND_FACTOR } from '../emissionFactors'
import { defraCitation } from '../ghg/engine'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { methodologyHierarchyLines } from './methodSummary'

const IDS = Array.from({ length: 15 }, (_, i) => `cat${i + 1}`)
const METHODS: Scope3Method[] = ['exiobase_spend', 'flat_spend', 'waste_factors', 'travel_factors', 'commuting_factors', 'pcaf']

describe('Scope 3 category methods', () => {
  it('M1 the split is exactly: Cats 1/2/4 EXIOBASE, Cat 5/6/7 activity factors, Cat 15 PCAF, the other eight flat', () => {
    // Cats 2 and 4 moved onto EXIOBASE on 17 Sep 2026: they are purchases, so a spend figure has something
    // to multiply. The seven left on flat_spend are a decision, not a backlog — see METHOD_BY_CATEGORY.
    expect(IDS.map(id => [id, scope3MethodFor(id)])).toEqual([
      ['cat1', 'exiobase_spend'], ['cat2', 'exiobase_spend'], ['cat3', 'flat_spend'], ['cat4', 'exiobase_spend'],
      ['cat5', 'waste_factors'], ['cat6', 'travel_factors'], ['cat7', 'commuting_factors'],
      ['cat8', 'flat_spend'], ['cat9', 'flat_spend'], ['cat10', 'flat_spend'], ['cat11', 'flat_spend'],
      ['cat12', 'flat_spend'], ['cat13', 'flat_spend'], ['cat14', 'flat_spend'], ['cat15', 'pcaf'],
    ])
    // EIGHT, not seven: the generic ten were 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, and two left.
    expect(IDS.filter(id => scope3MethodFor(id) === 'flat_spend')).toHaveLength(8)
    expect(IDS.filter(id => scope3MethodFor(id) === 'exiobase_spend')).toEqual(['cat1', 'cat2', 'cat4'])
  })

  it('M2 descriptions are derived: the flat factor and the gap come from the factor record', () => {
    expect(scope3MethodDescription('flat_spend')).toBe(
      `Spend-based, at a flat ${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e per unit of the inventory's ` +
      `currency, the same whatever was bought. This factor is recorded with no published source, no year and no region.`,
    )
    expect(scope3MethodDescription('waste_factors')).toContain(`published for that pair in ${defraCitation(2026)} (full set v1, Waste disposal sheet, AR5 GWPs)`)
    // The OGL v3.0 attribution, verbatim, closes the description the methodology page and the CSV carry.
    expect(scope3MethodDescription('waste_factors').endsWith(` ${DEFRA_WASTE_META.attribution_required}`)).toBe(true)
    expect(scope3MethodDescription('exiobase_spend')).toMatch(/^Spend-based, priced from EXIOBASE 3 version 3\.8\.2 \(EXIOBASE consortium, licensed CC BY-SA 4\.0\)/)
  })

  it('M3 the provenance gap shrinks as fields are recorded', () => {
    expect(provenanceGap({ source: null, year: null, region: null })).toBe('no published source, no year and no region')
    expect(provenanceGap({ source: 'X', year: null, region: null })).toBe('no year and no region')
    expect(provenanceGap({ source: 'X', year: 2024, region: null })).toBe('no region')
    expect(provenanceGap({ source: 'X', year: 2024, region: 'GB' })).toBeNull()
  })

  it('M4 only the waste description names DEFRA, and it names it by the engine\'s citation', () => {
    // Cat 5 prices from DEFRA/DESNZ factors since 17 Sep 2026. Every other method still has none.
    for (const m of METHODS.filter(x => x !== 'waste_factors')) expect(scope3MethodDescription(m), m).not.toMatch(/DEFRA/i)
    expect(scope3MethodDescription('waste_factors')).toContain(defraCitation(2026))
  })

  it('M5 ⚠️ no source file under app/ claims DEFRA and Exiobase together', () => {
    // The false "DEFRA/Exiobase" claim lived in five places. This scans for any sentence pairing the
    // two, so a sixth copy — or a revert of one of these — fails here rather than reaching a customer.
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path)
      }
    }
    walk(join(__dirname, '../../app'))
    const offences = files.flatMap(f =>
      readFileSync(f, 'utf8').split('\n')
        .map((line, i) => ({ line, i }))
        // Comment lines are skipped: the fix is recorded beside each former copy, and that record has to
        // be able to quote what the copy said. Strings and JSX text are what a customer reads.
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
        .filter(({ line }) => /DEFRA[^.\n]{0,40}Exiobase|Exiobase[^.\n]{0,40}DEFRA/i.test(line))
        .map(({ i }) => `${f}:${i + 1}`))
    expect(offences).toEqual([])
  })

  it('M6 ⚠️ the OGL attribution reaches the Cat 5 surfaces from the artefact, never typed out', () => {
    // Workings card and CSV (cat5Sentences) and the caution box above the rows read the field; the CSV's
    // methodology note and the methodology page read scope3MethodDescription, pinned in M2. A typed copy
    // anywhere under app/ could drift from the wording the licence prescribes, so none is allowed.
    const page = readFileSync(join(__dirname, '../../app/dashboard/scope3/page.tsx'), 'utf8')
    expect(page.match(/DEFRA_WASTE_META\.attribution_required/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // ⚠️ BEHAVIOURAL, NOT A SOURCE STRING, SINCE THE HIERARCHY WAS DERIVED. This asserted that the
    // methodology page's source CONTAINED scope3MethodDescription('waste_factors'). The page now renders
    // methodologyHierarchyLines(), which calls it once per method group, so the literal is gone while the
    // attribution still arrives. Checking the rendered line is stronger: it fails if the waste line stops
    // carrying the licence wording, whichever function builds it.
    const methodology = readFileSync(join(__dirname, '../../app/methodology/page.tsx'), 'utf8')
    expect(methodology).toContain('content: methodologyHierarchyLines()')
    const wasteLine = methodologyHierarchyLines().find(l => l.includes(DEFRA_WASTE_META.sheet))
    expect(wasteLine).toContain(DEFRA_WASTE_META.attribution_required)
    const typed: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && /public sector information/i.test(readFileSync(path, 'utf8'))) typed.push(path)
      }
    }
    walk(join(__dirname, '../../app'))
    expect(typed).toEqual([])
  })

  it('M7 ⚠️ no category whose method takes no entered figure is ever calculated or labelled on a stored override', () => {
    // The rule behind 18 Sep 2026: a stored emissions_override made Cat 5 (and 6, and 7) "calculated" and
    // "Primary data" while their calculators ignored the figure. The page now asks takesEnteredFigure,
    // which reads the same record the methodology page publishes.
    const noEnteredFigure = METHODS.filter(m => !METHOD_TAKES_ENTERED_FIGURE[m])
    expect(noEnteredFigure.sort()).toEqual(['commuting_factors', 'travel_factors', 'waste_factors'])
    for (const id of IDS) {
      expect(takesEnteredFigure(id), id).toBe(METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(id)])
      if (noEnteredFigure.includes(scope3MethodFor(id))) expect(takesEnteredFigure(id), id).toBe(false)
    }
    expect(IDS.filter(id => !takesEnteredFigure(id))).toEqual(['cat5', 'cat6', 'cat7'])
    // Both of the page's override checks go through takesEnteredFigure, and none goes around it.
    const page = readFileSync(join(__dirname, '../../app/dashboard/scope3/page.tsx'), 'utf8')
    expect(page).toContain('if (d.emissions_override && takesEnteredFigure(id)) return true')
    expect(page).toContain("if ((d.emissions_override && takesEnteredFigure(id)) || d.has_supplier_data) return 'high'")
    expect(page).not.toMatch(/if \(d\.emissions_override\) return true/)
    expect(page).not.toMatch(/if \(d\.emissions_override \|\| d\.has_supplier_data\)/)
  })

  it('M8 the entered-figure sentence names every category exactly once, from the method map', () => {
    const text = enteredFigureSentence()
    const [takesPart, notPart] = text.split(/(?<=estimate\.) /)
    const nums = (t: string) => (t.match(/\d+/g) ?? []).map(Number)
    const takes = nums(takesPart), not = nums(notPart ?? '')
    expect([...takes, ...not].sort((a, b) => a - b)).toEqual(IDS.map((_, i) => i + 1))
    for (const n of takes) expect(METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(`cat${n}`)], `cat${n}`).toBe(true)
    for (const n of not) expect(METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(`cat${n}`)], `cat${n}`).toBe(false)
    expect(not).toContain(5)
    expect(text).not.toMatch(/Where a figure is entered directly, it is used instead of any estimate/)
  })
})
