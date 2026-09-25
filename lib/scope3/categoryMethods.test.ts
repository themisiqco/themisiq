import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scope3MethodFor, scope3MethodDescription, provenanceGap, METHOD_TAKES_ENTERED_FIGURE, takesEnteredFigure, SCOPE3_CATEGORY_IDS, type Scope3Method } from './categoryMethods'
import { enteredFigureSentence, assistantScope3Basis } from './methodSummary'
import { defraCitation } from '../ghg/engine'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { methodologyHierarchyLines } from './methodSummary'
import { SCOPE3_DATA_SOURCE } from './dataSources'

const IDS = Array.from({ length: 15 }, (_, i) => `cat${i + 1}`)
const METHODS: Scope3Method[] = ['exiobase_spend', 'no_method', 'waste_factors', 'business_travel_factors', 'employee_commuting_factors', 'pcaf', 'end_of_life_factors', 'fuel_and_energy_upstream']

const VOCABULARY: Record<Scope3Method, RegExp[]> = {
  exiobase_spend:             [/EXIOBASE/i, /supplier-specific/i],
  // ⚠️ NO FACTOR WORD IS REQUIRED OF IT, BECAUSE IT APPLIES NONE. The other seven must each name their
  // own source vocabulary; this one must say that nothing is calculated, which M2 asserts in full.
  no_method:                  [/\bnot calculate\b/i],
  waste_factors:              [/DEFRA/i, /DESNZ/i, /\btonnes?\b/i, /treatment route/i, /activity data/i],
  end_of_life_factors:        [/DEFRA/i, /DESNZ/i, /\btonnes?\b/i, /treatment route/i],
  business_travel_factors:    [/DEFRA/i, /DESNZ/i, /distance/i, /\bflight/i, /\brail\b/i],
  employee_commuting_factors: [/DEFRA/i, /DESNZ/i, /distance/i, /\bflight/i, /\brail\b/i, /commut/i],
  pcaf:                       [/PCAF/i, /EVIC/i],
  // ⚠️ EIGHT TERMS MOVED OUT OF NEVER INTO THIS METHOD ON 20 SEP 2026, AND NOTHING ELSE CHANGED.
  // They were banned outright because the only category that used them (Cat 3) described a
  // calculation that did not exist. Category 3 now HAS that calculation, so the words are its
  // vocabulary rather than a forbidden claim. Because bannedFor() bans every OTHER method's
  // vocabulary, each of the eight is still barred everywhere else, flat_spend included: the guard
  // on the six flat categories is byte-for-byte the list it was, which M9b asserts directly.
  //   'activity-based' is the ninth, and it is NOT in the design's list. It has to move because
  // this method's description opens with the word and Cat 3's text embeds that description. The
  // alternative was to word the description around its own opening, which would be writing copy to
  // suit a guard.
  fuel_and_energy_upstream:   [/DEFRA/i, /DESNZ/i, /\bWTT\b/i, /well-to-tank/i, /T&D/i,
                               /transmission and distribution/i, /\bkWh\b/i, /life ?cycle/i,
                               /activity-based/i],
}
// Terms no Scope 3 method uses: an activity basis no category on these methods has.
const NEVER = [/tonne-km/i, /fuel volume/i]
const bannedFor = (m: Scope3Method): RegExp[] => {
  const own = new Set(VOCABULARY[m].map(String))
  const others = (Object.keys(VOCABULARY) as Scope3Method[])
    .filter(k => k !== m).flatMap(k => VOCABULARY[k]).filter(re => !own.has(String(re)))
  return [...new Map(others.map(re => [String(re), re])).values(), ...NEVER]
}

describe('Scope 3 category methods', () => {
  it('M1 the split is exactly: Cats 1/2/4 EXIOBASE, Cat 3 upstream energy, Cat 5/6/7/12 activity factors, Cat 15 PCAF, the other six flat', () => {
    // Cats 2 and 4 moved onto EXIOBASE on 17 Sep 2026: they are purchases, so a spend figure has something
    // to multiply. Cat 3 joined fuel_and_energy_upstream on 20 Sep 2026, priced from the bound GHG
    // inventory's own energy rather than from anything entered on its own panel. The six left on
    // flat_spend are a decision, not a backlog — see METHOD_BY_CATEGORY.
    expect(IDS.map(id => [id, scope3MethodFor(id)])).toEqual([
      ['cat1', 'exiobase_spend'], ['cat2', 'exiobase_spend'], ['cat3', 'fuel_and_energy_upstream'], ['cat4', 'exiobase_spend'],
      ['cat5', 'waste_factors'], ['cat6', 'business_travel_factors'], ['cat7', 'employee_commuting_factors'],
      ['cat8', 'no_method'], ['cat9', 'no_method'], ['cat10', 'no_method'], ['cat11', 'no_method'],
      ['cat12', 'end_of_life_factors'], ['cat13', 'no_method'], ['cat14', 'no_method'], ['cat15', 'pcaf'],
    ])
    // SIX: the generic ten were 2, 3, 4, 8, 9, 10, 11, 12, 13, 14; Cats 2 and 4 left for EXIOBASE on
    // 17 Sep 2026, Cat 12 for the DEFRA end-of-life factors on 18 Sep 2026, and Cat 3 on 20 Sep 2026.
    // ⚠️ ON 25 SEP 2026 THE REMAINING SIX STOPPED BEING CALCULATED RATHER THAN CHANGING METHOD. They are
    // now ASSIGNED 'no_method' in the map, not defaulted into it: the `?? 'flat_spend'` in scope3MethodFor
    // is gone and METHOD_BY_CATEGORY is a Record over Scope3CategoryId, so a sixteenth category fails tsc
    // until someone decides.
    expect(IDS.filter(id => scope3MethodFor(id) === 'no_method')).toEqual(['cat8', 'cat9', 'cat10', 'cat11', 'cat13', 'cat14'])
    expect(IDS.filter(id => scope3MethodFor(id) === 'exiobase_spend')).toEqual(['cat1', 'cat2', 'cat4'])
    // ⚠️ ONE CATEGORY, AND THE ASSIGNMENT CAME WITH ITS PANEL AND ITS CALCULATOR. M11 is what holds that
    // together: it fails if this list grows without the surfaces that describe what was priced.
    expect(IDS.filter(id => scope3MethodFor(id) === 'fuel_and_energy_upstream')).toEqual(['cat3'])
  })

  it('M2 descriptions are derived: the flat factor and the gap come from the factor record', () => {
    // ⚠️ IT NAMES NO FACTOR, NO NUMBER AND NO PROVENANCE GAP, because none is applied. This sentence is the
    // CSV's Method cell and the saved factor_basis for six categories, so it has to say that nothing was
    // calculated rather than describe a weak calculation. It also states what IS accepted.
    expect(scope3MethodDescription('no_method')).toBe(
      'Not calculated by ThemisIQ: no emission factor is applied and no estimate is produced. A figure ' +
      'entered directly is used as given, and is reported as primary data.',
    )
    // ⚠️ A NOUN PHRASE, LIKE EVERY OTHER DESCRIPTION. methodologyHierarchyLines renders one description
    // under a heading that names all six categories on this method, so a sentence about "this category"
    // read as a singular claim about six.
    expect(scope3MethodDescription('no_method'), 'no singular claim under a plural heading')
      .not.toMatch(/this category/i)
    expect(scope3MethodDescription('no_method'), 'no factor may be named').not.toMatch(/\bfactor of\b|\bkg CO2e per\b/)
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

  it('M4 every description that names DEFRA does so by the engine\'s own citation, and no other does', () => {
    // Cat 5 prices from DEFRA/DESNZ factors since 17 Sep 2026, Cat 12 from the same sheet since 18 Sep
    // 2026, Cat 6 from the business travel sheets and Cat 7 from the land travel and homeworking sheets
    // since 19 Sep 2026, and Cat 3 from the upstream energy sheets since 20 Sep 2026. Every other method
    // still has none.
    //   Category 3's citation comes from its artefact's metadata (DEFRA_ENERGY_META.source), which the
    // generator copied from the workbook; this is what holds it to the same string as the other four,
    // since a second wording of one publication is the defect defraCitation exists to prevent.
    const defra: Scope3Method[] = ['waste_factors', 'end_of_life_factors', 'business_travel_factors', 'employee_commuting_factors', 'fuel_and_energy_upstream']
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
    //
    // ⚠️ WATCH CATEGORY 3'S ROW WHEN TASK 5 ASSIGNS IT. Today Cat 3 is priced by flat_spend, so its
    // superseded text trips on kWh, well-to-tank, T&D and fuel volume together. Once the category moves
    // to fuel_and_energy_upstream, the first three become its own vocabulary and only 'fuel volume' still
    // trips: the words were never the defect, the missing calculation was. The second assertion below —
    // the text must be GONE — is what carries this row from then on.
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

  it('M9b ⚠️ moving eight terms out of NEVER did not loosen the guard on any other method', () => {
    // The change on 20 Sep 2026 was a MOVE, not a removal: DEFRA, DESNZ, WTT, well-to-tank, T&D,
    // transmission and distribution, kWh, life cycle and activity-based left NEVER and became
    // fuel_and_energy_upstream's vocabulary. Because bannedFor() bans every other method's vocabulary,
    // the ban list every other method faces is unchanged as a set. This asserts that rather than trusting
    // it, because the failure mode is silent: a term that stops being banned anywhere bans nothing, and
    // the text that would then slip through is the one this guard exists for.
    const MOVED = ['/DEFRA/i', '/DESNZ/i', '/\\bWTT\\b/i', '/well-to-tank/i', '/T&D/i',
                   '/transmission and distribution/i', '/\\bkWh\\b/i', '/life ?cycle/i', '/activity-based/i']
    const sources = (m: Scope3Method) => new Set(bannedFor(m).map(String))

    // The six flat categories, which is where a spend text could most easily borrow a DEFRA word.
    const flat = sources('no_method')
    for (const re of MOVED) expect(flat.has(re), `no_method must still bar ${re}`).toBe(true)
    // Every pattern that was banned for flat_spend before the move is still banned for it. This is the
    // list as it stood on 19 Sep 2026, typed out, so the comparison does not read the same table twice.
    const FLAT_BANNED_BEFORE = [
      '/EXIOBASE/i', '/supplier-specific/i', '/DEFRA/i', '/DESNZ/i', '/\\btonnes?\\b/i', '/treatment route/i',
      '/activity data/i', '/distance/i', '/\\bflight/i', '/\\brail\\b/i', '/commut/i', '/PCAF/i', '/EVIC/i',
      '/well-to-tank/i', '/\\bWTT\\b/i', '/T&D/i', '/transmission and distribution/i', '/tonne-km/i',
      '/\\bkWh\\b/i', '/fuel volume/i', '/life ?cycle/i', '/activity-based/i',
    ]
    expect([...flat].sort()).toEqual([...new Set(FLAT_BANNED_BEFORE)].sort())

    // And no OTHER method lost a term either: each of the nine is still barred everywhere it is not
    // this method's own vocabulary.
    for (const m of METHODS) {
      if (m === 'fuel_and_energy_upstream') continue
      const banned = sources(m)
      for (const re of MOVED) {
        if (VOCABULARY[m].map(String).includes(re)) continue // its own word, e.g. DEFRA for waste
        expect(banned.has(re), `${m} must still bar ${re}`).toBe(true)
      }
    }
    // The new method may use all nine, and may not use any other method's vocabulary.
    const own = sources('fuel_and_energy_upstream')
    for (const re of MOVED) expect(own.has(re), `fuel_and_energy_upstream may use ${re}`).toBe(false)
    expect(own.has('/EXIOBASE/i')).toBe(true)
    expect(own.has('/\\btonnes?\\b/i')).toBe(true)
  })

  it('M11 ⚠️ the energy method cannot be assigned to a category without its calculator, its panel and its basis', () => {
    // ⚠️ THIS IS THE GUARD THAT MAKES "DEFINED AND UNASSIGNED" SAFE. The method map is what the
    // calculator dispatches on AND what every description of a figure reads, so the moment a category is
    // assigned, four things have to be true at once or the product states a method it does not run. Three
    // of them are in page.tsx, which is why they are read from its source, as M7's override checks are.
    const page = readFileSync(join(__dirname, '../../app/dashboard/scope3/page.tsx'), 'utf8')
    const assigned = IDS.filter(id => scope3MethodFor(id) === 'fuel_and_energy_upstream')

    // (1) THE CONFIDENCE BRANCH, which must exist before any figure does. Without it a DEFRA-priced
    // Category 3 falls through getConfidence's final `return 'low'` and is labelled "Flat factor" on the
    // pill and in the CSV: Q8 of ~/themisiq-sources/findings/cat3-design.md.
    const branch = "if (scope3MethodFor(id) === 'fuel_and_energy_upstream' && isCalculated(id)) return 'medium'"
    expect(page).toContain(branch)
    const conf = page.slice(page.indexOf('const getConfidence ='))
    expect(conf.indexOf(branch), 'the branch must precede the final return').toBeLessThan(conf.indexOf("return 'low'\n  }"))

    // (2) WAS "THE FIGURE IS NEVER SPEND", ASSERTING THAT THIS METHOD'S ARM DOES NOT CALL
    // calcGenericSpend. Deleted on 25 Sep 2026: calcGenericSpend and GENERIC_SPEND_FACTOR are gone, so the
    // assertion could no longer fail, and a green expectation about a deleted function reads as coverage
    // it is not providing. lib/scope3/cat3Copy.test.ts C3C-15 covers the whole page with
    // `matchAll(/calcGenericSpend\(/g)` at length 0, which is stronger than one arm and cannot rot the
    // same way.

    if (assigned.length === 0) {
      // The state this task ships in. The two dispatch arms say, in code, that nothing prices yet: an
      // entered figure only, and never calculated from a saved annual_spend.
      expect(page).toContain("case 'fuel_and_energy_upstream': return catData[id]?.emissions_override || 0")
      expect(page).toContain("case 'fuel_and_energy_upstream': return false")
      return
    }

    // From here down: a category HAS been assigned, so the interim arms must be gone and the surfaces
    // that describe the figure must exist. Each expectation names what to build, because this test is
    // the thing a future session will read first.
    expect(page, 'assigned: getCatEmissions must price from the bound inventory, not return only an entered figure (Task 5)')
      .not.toContain("case 'fuel_and_energy_upstream': return catData[id]?.emissions_override || 0")
    expect(page, 'assigned: isCalculated must test the priced result, not return false (Task 5)')
      .not.toContain("case 'fuel_and_energy_upstream': return false")
    // (3) THE BASIS BRANCH (Task 6). categoryBasis has an if-chain per method and falls through to
    // "No data. No activity data was entered", which would be the CSV's Method cell and the saved
    // factor_basis column for a priced category.
    expect(page, 'assigned: categoryBasis needs a branch for this method (Task 6)')
      .toContain("if (method === 'fuel_and_energy_upstream')")
    // (4) THE PANEL (Task 5). The generic spend panel renders for every id NOT in one exclusion list, so
    // an assigned category left out of that list still shows an Annual spend field that nothing reads.
    const list = page.match(/!\[([^\]]*)\]\.includes\(cat\.id\)/)
    expect(list, 'the generic spend panel\'s exclusion list must still be readable here').toBeTruthy()
    for (const id of assigned) {
      expect(list![1], `assigned: ${id} must leave the generic spend panel for its own (Task 5)`).toContain(`'${id}'`)
      // And its "Where to find it" text must describe THIS method, which M9 enforces through the method
      // map; named here too because the rewrite and the assignment are one change, not two.
      expect(SCOPE3_DATA_SOURCE[id], `assigned: ${id}'s dataSource must be rewritten for this method (Task 5)`)
        .toContain(scope3MethodDescription('fuel_and_energy_upstream'))
    }
  })

  // ⚠️ M10 WAS DELETED ON 25 SEP 2026, AND HALF OF IT SURVIVES BELOW AS ITS OWN TEST.
  //
  // M10 asserted that the three surfaces stating the flat factor said one thing: the description, the
  // assistant's clause and the panel's basis detail all had to carry FLAT_FACTOR_SAMENESS and the 0.5
  // figure. GENERIC_SPEND_FACTOR and FLAT_FACTOR_SAMENESS are both gone, so that half has no subject.
  // Adjusting it would have meant pinning three surfaces to a claim the product no longer makes, which is
  // worse than having no test: a green assertion about a deleted calculation reads as coverage.
  //
  // ⚠️ ITS SECOND HALF WAS A DIFFERENT TEST WEARING THE SAME NAME, and that one is still live. It banned
  // the phrase "whatever was bought" from every non-test file under app/ and lib/, because it was FALSE for
  // five of the six categories: they price what a customer, tenant or franchisee did, so the company buys
  // nothing for the factor to be indifferent to. Deleting M10 wholesale would have taken that ban with it,
  // and the phrase is exactly the kind of thing that walks back in when a description is rewritten.
  // Removing the factor does not make the sentence true, so the ban outlives the method it was written for.
  it('M10a ⚠️ the superseded "whatever was bought" claim is gone from every customer-facing file', () => {
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

  it('M10b ⚠️ every one of the fifteen categories is named in the map, so none can be defaulted', () => {
    // ⚠️ THIS IS THE GATE THAT REPLACED THE FALLBACK. scope3MethodFor returned `?? 'flat_spend'` until
    // 25 Sep 2026, so a category absent from METHOD_BY_CATEGORY silently acquired a calculation: 0.5 kg
    // CO2e per unit of currency, unsourced, summed into the inventory total. The map is now a Record over
    // Scope3CategoryId, so tsc refuses an incomplete one; this asserts the union itself is the fifteen, and
    // that every one resolves to a method the METHODS list above knows about.
    expect([...SCOPE3_CATEGORY_IDS]).toEqual(IDS)
    for (const id of SCOPE3_CATEGORY_IDS) {
      expect(METHODS, `${id} resolves to a method this file does not know`).toContain(scope3MethodFor(id))
    }
  })

  it('M12 ⚠️ an unknown category id is reported as a bug, not answered as a decision', () => {
    // ⚠️ WHY THIS NEEDS A TEST AT ALL. scope3MethodFor returns 'no_method' for an id the map does not name,
    // and 'no_method' IS A MEANINGFUL PRODUCT STATE: the category reads "Not calculated" on the pill, is
    // counted in the not-calculated badge, joins unpricedCatIds, and writes `unpriced: true` with a reason
    // into scope3_coverage, which get_verifier_scope3 discloses to an external verifier. So returning it
    // quietly would render a typo to a customer, and disclose it to a verifier, as ThemisIQ's deliberate
    // statement that it does not calculate that category. The value returned is still the safest one there
    // is; what this pins is that the condition is ANNOUNCED.
    //
    // ⚠️ console.error IS SPIED ON BECAUSE THIS REPO HAS NO LOGGER. There is no lib/logger module and no
    // existing console-mock convention in the suite, so there is nothing to mock; vi.spyOn is the whole of
    // it. If a logger is ever introduced, this is one of the call sites to move.
    //
    // ⚠️ NODE_ENV IS RESTORED IN A finally, NOT AFTER THE ASSERTIONS. A failed expectation would otherwise
    // leave NODE_ENV='production' set for every test that follows in this file, and they would pass or fail
    // for a reason unrelated to what they assert. Same for the spy.
    const original = process.env.NODE_ENV
    const env = process.env as Record<string, string | undefined>
    const setEnv = (v: string | undefined) => { if (v === undefined) delete env.NODE_ENV; else env.NODE_ENV = v }

    // 1. A KNOWN ID RETURNS ITS DECLARED METHOD, and logs nothing. Asserted first so the two cases below
    // cannot pass by the function being broken for every input.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(scope3MethodFor('cat11')).toBe('no_method')
      expect(scope3MethodFor('cat1')).toBe('exiobase_spend')
      expect(scope3MethodFor('cat5')).toBe('waste_factors')
      expect(quiet, 'a known id must not log').not.toHaveBeenCalled()
    } finally {
      quiet.mockRestore()
    }

    // 2. OUTSIDE PRODUCTION IT THROWS, so a bad id fails a test run or a dev session rather than reaching a
    // customer. 'test', 'development' and unset are all checked: the guard is `!== 'production'`, and
    // writing it the other way round would have let a dev session through.
    for (const mode of ['test', 'development', undefined]) {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        setEnv(mode)
        expect(() => scope3MethodFor('cat16'), `NODE_ENV=${String(mode)} must throw`).toThrow(/not one of the fifteen/)
        expect(spy, 'and it logs before throwing').toHaveBeenCalled()
      } finally {
        spy.mockRestore()
        setEnv(original)
      }
    }

    // 3. IN PRODUCTION IT LOGS AND CARRIES ON. With no error boundary anywhere in this repo, a throw would
    // white-screen the whole Scope 3 page rather than degrade one row; the log is what tells us. The message
    // has to name the id, or the log cannot be acted on.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      setEnv('production')
      expect(scope3MethodFor('cat16')).toBe('no_method')
      expect(spy).toHaveBeenCalledTimes(1)
      const logged = String(spy.mock.calls[0][0])
      expect(logged, 'the log must name the offending id').toContain('"cat16"')
      expect(logged, 'and say it is a bug rather than a decision').toContain('That is a bug, not a decision')
    } finally {
      spy.mockRestore()
      setEnv(original)
    }

    expect(process.env.NODE_ENV, 'NODE_ENV is restored').toBe(original)
  })
})
