import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scope3MethodFor, scope3MethodDescription, provenanceGap, METHOD_TAKES_ENTERED_FIGURE, takesEnteredFigure, FLAT_FACTOR_SAMENESS, type Scope3Method } from './categoryMethods'
import { enteredFigureSentence, assistantScope3Basis } from './methodSummary'
import { GENERIC_SPEND_FACTOR } from '../emissionFactors'
import { defraCitation } from '../ghg/engine'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { methodologyHierarchyLines } from './methodSummary'
import { SCOPE3_DATA_SOURCE } from './dataSources'

const IDS = Array.from({ length: 15 }, (_, i) => `cat${i + 1}`)
const METHODS: Scope3Method[] = ['exiobase_spend', 'flat_spend', 'waste_factors', 'business_travel_factors', 'employee_commuting_factors', 'pcaf', 'end_of_life_factors']

describe('Scope 3 category methods', () => {
  it('M1 the split is exactly: Cats 1/2/4 EXIOBASE, Cat 5/6/7/12 activity factors, Cat 15 PCAF, the other seven flat', () => {
    // Cats 2 and 4 moved onto EXIOBASE on 17 Sep 2026: they are purchases, so a spend figure has something
    // to multiply. The seven left on flat_spend are a decision, not a backlog — see METHOD_BY_CATEGORY.
    expect(IDS.map(id => [id, scope3MethodFor(id)])).toEqual([
      ['cat1', 'exiobase_spend'], ['cat2', 'exiobase_spend'], ['cat3', 'flat_spend'], ['cat4', 'exiobase_spend'],
      ['cat5', 'waste_factors'], ['cat6', 'business_travel_factors'], ['cat7', 'employee_commuting_factors'],
      ['cat8', 'flat_spend'], ['cat9', 'flat_spend'], ['cat10', 'flat_spend'], ['cat11', 'flat_spend'],
      ['cat12', 'end_of_life_factors'], ['cat13', 'flat_spend'], ['cat14', 'flat_spend'], ['cat15', 'pcaf'],
    ])
    // SEVEN: the generic ten were 2, 3, 4, 8, 9, 10, 11, 12, 13, 14; Cats 2 and 4 left for EXIOBASE on
    // 17 Sep 2026, and Cat 12 for the DEFRA end-of-life factors on 18 Sep 2026.
    expect(IDS.filter(id => scope3MethodFor(id) === 'flat_spend')).toEqual(['cat3', 'cat8', 'cat9', 'cat10', 'cat11', 'cat13', 'cat14'])
    expect(IDS.filter(id => scope3MethodFor(id) === 'exiobase_spend')).toEqual(['cat1', 'cat2', 'cat4'])
  })

  it('M2 descriptions are derived: the flat factor and the gap come from the factor record', () => {
    expect(scope3MethodDescription('flat_spend')).toBe(
      `A flat ${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e per unit of the inventory's currency ` +
      `entered, ${FLAT_FACTOR_SAMENESS}. This factor is recorded with no published source, no year and no region.`,
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

  it('M4 only the two waste descriptions and business travel name DEFRA, each by the engine\'s citation', () => {
    // Cat 5 prices from DEFRA/DESNZ factors since 17 Sep 2026, Cat 12 from the same sheet since 18 Sep
    // 2026, and Cat 6 from the business travel sheets since 19 Sep 2026. Every other method still has none.
    // Cat 7 from the land travel and homeworking sheets since 19 Sep 2026.
    const defra: Scope3Method[] = ['waste_factors', 'end_of_life_factors', 'business_travel_factors', 'employee_commuting_factors']
    for (const m of METHODS.filter(x => !defra.includes(x))) expect(scope3MethodDescription(m), m).not.toMatch(/DEFRA/i)
    for (const m of defra) expect(scope3MethodDescription(m), m).toContain(defraCitation(2026))
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
    expect(noEnteredFigure.sort()).toEqual(['business_travel_factors', 'employee_commuting_factors', 'end_of_life_factors', 'waste_factors'])
    for (const id of IDS) {
      expect(takesEnteredFigure(id), id).toBe(METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(id)])
      if (noEnteredFigure.includes(scope3MethodFor(id))) expect(takesEnteredFigure(id), id).toBe(false)
    }
    expect(IDS.filter(id => !takesEnteredFigure(id))).toEqual(['cat5', 'cat6', 'cat7', 'cat12'])
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

  it('M9 ⚠️ no category\'s "Where to find it" text names a method the map does not assign to it', () => {
    // ⚠️ SEVEN OF THE FIFTEEN DESCRIBED A CALCULATION THAT DOES NOT HAPPEN. Cat 3 told the customer to
    // bring Scope 1 and 2 consumption in kWh with well-to-tank and T&D factors applied; Cat 4 named
    // tonne-km and mode/distance; Cats 8, 10, 11, 13 and 14 said "Activity-based; spend-based is not
    // appropriate here" of a category priced from spend alone; Cat 9 named modelled tonne-km. The words
    // under "Where to find it" are a claim about method, so they are guarded like one.
    //
    // KEYED TO THE METHOD MAP, NOT TO A LIST OF IDS, and with no exemptions: each method declares the
    // vocabulary it is entitled to, and a category may not use any term belonging to another method, or
    // any term in NEVER, which no method uses at all. A category that changes method changes ban list on
    // the same day.
    const VOCABULARY: Record<Scope3Method, RegExp[]> = {
      exiobase_spend:             [/EXIOBASE/i, /supplier-specific/i],
      flat_spend:                 [/\bflat\b/i],
      waste_factors:              [/DEFRA/i, /DESNZ/i, /\btonnes?\b/i, /treatment route/i, /activity data/i],
      end_of_life_factors:        [/DEFRA/i, /DESNZ/i, /\btonnes?\b/i, /treatment route/i],
      business_travel_factors:    [/DEFRA/i, /DESNZ/i, /distance/i, /\bflight/i, /\brail\b/i],
      employee_commuting_factors: [/DEFRA/i, /DESNZ/i, /distance/i, /\bflight/i, /\brail\b/i, /commut/i],
      pcaf:                       [/PCAF/i, /EVIC/i],
    }
    // Terms no Scope 3 method uses: they named the Cat 3 calculation that never existed, or an activity
    // basis no category on these methods has.
    const NEVER = [/well-to-tank/i, /\bWTT\b/i, /T&D/i, /transmission and distribution/i, /tonne-km/i,
                   /\bkWh\b/i, /fuel volume/i, /life ?cycle/i, /activity-based/i]
    const bannedFor = (m: Scope3Method): RegExp[] => {
      const own = new Set(VOCABULARY[m].map(String))
      const others = (Object.keys(VOCABULARY) as Scope3Method[])
        .filter(k => k !== m).flatMap(k => VOCABULARY[k]).filter(re => !own.has(String(re)))
      return [...new Map(others.map(re => [String(re), re])).values(), ...NEVER]
    }

    const EMBEDS_ITS_METHOD = ['cat3', 'cat4', 'cat8', 'cat9', 'cat10', 'cat11', 'cat13', 'cat14']
    for (const id of IDS) {
      const method = scope3MethodFor(id)
      const text = SCOPE3_DATA_SOURCE[id]
      expect(text, `${id}: every category needs a dataSource in lib/scope3/dataSources.ts`).toBeTruthy()
      for (const re of bannedFor(method)) expect(text, `${id} (${method}) names ${re}`).not.toMatch(re)
      // A rewritten text carries its method description rather than restating it, so the factor, the
      // edition and the provenance gap cannot drift from the methodology page and the CSV.
      //
      // ⚠️ THE LIST IS WHAT HAS BEEN REWRITTEN, NOT AN EXEMPTION FROM THE BAN LIST ABOVE, which every one
      // of the fifteen passes. Cats 1 and 2 describe their method in their own words ("Spend-based
      // estimation is permitted for this category"), which is accurate but not derived; they embed
      // nothing yet. Cats 5, 6, 7, 12 and 15 name their own inputs and make no method claim to derive.
      if (EMBEDS_ITS_METHOD.includes(id)) {
        expect(text, `${id} must embed its method description`).toContain(scope3MethodDescription(method))
      }
    }

    // ⚠️ THE EIGHT SUPERSEDED TEXTS, KEPT SO THE GUARD IS TESTED AND THE DEFECT IS ON THE RECORD. Each
    // must still trip at least one banned term for the method its category is priced by.
    const SUPERSEDED: [string, string][] = [
      ['cat3', 'Your Scope 1 & 2 energy consumption data (kWh, fuel volumes), with well-to-tank and T&D-loss factors applied. Source the consumption from utility bills / the GHG module.'],
      ['cat4', 'Logistics/freight invoices, shipment records (tonne-km or mode/distance). Spend-based estimation is permitted for this category.'],
      ['cat8', 'Lease agreements + energy use of leased assets (floor area or metered kWh). Activity-based; spend-based is not appropriate here.'],
      ['cat9', 'Distribution/logistics records or modelled tonne-km of sold-product movement. Spend-based estimation is permitted for this category.'],
      ['cat10', 'Production volumes of intermediate goods + processing energy assumptions. Activity-based; spend-based is not appropriate here.'],
      ['cat11', 'Units sold + expected lifetime energy/fuel use per unit. Activity-based; spend-based is not appropriate here.'],
      ['cat13', "Your leased-out asset portfolio + tenants' energy use (floor area or metered). Activity-based; spend-based is not appropriate here."],
      ['cat14', 'Franchisee energy/activity data, or estimates from number and type of franchise outlets. Activity-based; spend-based is not appropriate here.'],
    ]
    for (const [id, old] of SUPERSEDED) {
      const tripped = bannedFor(scope3MethodFor(id)).filter(re => re.test(old))
      expect(tripped.length, `${id}: the superseded text must fail this guard`).toBeGreaterThan(0)
      expect(SCOPE3_DATA_SOURCE[id], `${id}: the superseded text must be gone`).not.toBe(old)
    }

    // And the page renders the map rather than literals of its own.
    const page = readFileSync(join(__dirname, '../../app/dashboard/scope3/page.tsx'), 'utf8')
    for (const id of IDS) expect(page, id).toContain(`dataSource: SCOPE3_DATA_SOURCE.${id}`)
  })

  it('M10 ⚠️ the three surfaces that state the flat factor say one thing, not three', () => {
    // ⚠️ "THE SAME WHATEVER WAS BOUGHT" WAS FALSE FOR FIVE OF THE SEVEN FLAT CATEGORIES. Categories 9,
    // 10, 11, 13 and 14 price what a customer, tenant or franchisee did: the company buys nothing, so
    // there is no purchase for the factor to be indifferent to. The claim that IS true of the factor is
    // FLAT_FACTOR_SAMENESS, and all three surfaces now carry it.
    expect(scope3MethodDescription('flat_spend')).toContain(FLAT_FACTOR_SAMENESS)
    // The assistant's clause cannot embed the description (a lowercase fragment joined by semicolons, and
    // the description is two sentences), so it embeds the clause and is checked here instead.
    const assistant = assistantScope3Basis()
    expect(assistant).toContain(FLAT_FACTOR_SAMENESS)
    expect(assistant).toContain(`${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e per unit of the inventory's currency`)
    // The panel and CSV basis detail embeds the description itself.
    const page = readFileSync(join(__dirname, '../../app/dashboard/scope3/page.tsx'), 'utf8')
    expect(page).toContain("detail: `Figure entered: ${amountText(d.annual_spend)} ${currency}. ${scope3MethodDescription('flat_spend')}`")
    // ⚠️ AND THE SUPERSEDED PHRASE IS GONE FROM EVERY CUSTOMER-FACING FILE, not just from these three.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
          const stripped = readFileSync(path, 'utf8')
            .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
          if (/whatever was bought/i.test(stripped)) offenders.push(path)
        }
      }
    }
    for (const d of ['app', 'lib']) walk(join(__dirname, '../..', d))
    expect(offenders).toEqual([])
  })
})
