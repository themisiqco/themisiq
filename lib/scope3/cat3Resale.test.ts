import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cat3InputsFrom } from './cat3Inputs'
import { priceCat3 } from './cat3Energy'
import {
  cat3Basis, cat3CsvRows, CAT3_GWP_PUBLISHER,
  CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_EXPORT_NOTE, CAT3_3D_LINES_NOT_IN_TOTAL,
  cat3ThreeDWithheld, CAT3_3D_WITHHELD_CORE, CAT3_3D_WITHHELD_SHORT, CAT3_3D_NOT_IN_TOTAL_TAG,
  cat3Sentences, cat3WorkingsSummary, cat3WithheldText, type Cat3Surface,
  CAT3_3D_DESCRIPTION, CAT3_3D_APPLICABILITY, CAT3_3D_ACTIVITY_DATA, CAT3_3D_COOLING_NOTE,
} from './cat3Copy'
import { DEFRA_ENERGY_META } from '../emissionFactors/defraEnergy'
import { publisherGwpSentence } from './gwpSentence'
import { SCOPE3_FIXTURE_GHG } from './scope3SurfacesFixture'
import { RESULTS_TABLE_EMPTY, resultsTableAllUnpriced } from './formCopy'

// ── TASK 8: THE ACTIVITY D SCREENING QUESTION ────────────────────────────────────────────────────
//
// Category 3 is four activities. This build prices A, B and C; D is energy bought and sold on, and its
// inputs are a sales record, not a meter reading. The question is what stops the platform reporting
// A+B+C as if it were the category for a company that resells energy.

const PAGE = join(__dirname, '../../app/dashboard/scope3/page.tsx')
const page = () => readFileSync(PAGE, 'utf8')
const GWP = publisherGwpSentence(CAT3_GWP_PUBLISHER, true, 'AR6')
const worked = () => {
  const read = cat3InputsFrom(SCOPE3_FIXTURE_GHG.workings, SCOPE3_FIXTURE_GHG.locations)
  return { read, priced: priceCat3(read.inputs!) }
}

describe('Category 3 activity D screening', () => {
  it('RS1 the wording quotes the operative text, and does not widen past it', () => {
    // Quoted from ~/themisiq-sources/ghg-protocol/Scope3_Calculation_Guidance_0[1].pdf, printed pages
    // from each page's own footer, read with pdftotext -layout on 20 Sep 2026.
    expect(CAT3_3D_DESCRIPTION).toBe(
      'Generation (upstream activities and combustion) of electricity, steam, heating, and cooling that ' +
      'is purchased by the reporting company and sold to end users')
    expect(CAT3_3D_APPLICABILITY).toBe('Applicable to utility companies and energy retailers')
    expect(CAT3_3D_ACTIVITY_DATA).toBe(
      'Quantities and specific source (e.g., generation unit) of electricity purchased and re-sold')
    // The question asks the activity: bought AND sold on. Not "do you sell energy", which would collect
    // yeses from companies whose Category 3 is complete without activity D.
    expect(CAT3_3D_QUESTION).toBe(
      'Does your company buy electricity, steam, heating or cooling and sell it on to end users?')
    expect(CAT3_3D_QUESTION).toMatch(/buy .* and sell it on to end users/)
    // The help carries the source and its pages, so a verifier can check the screening itself.
    for (const cite of ['table 3.1, p. 39', 'p. 47', 'formula 3.4 (p. 48)']) expect(CAT3_3D_HELP).toContain(cite)
    expect(CAT3_3D_HELP).toContain(CAT3_3D_DESCRIPTION)
    // ⚠️ THE FOOTNOTE IS REPORTED AND NOT ASKED. It widens who counts as a retailer; the activity is
    // unchanged, and an export meter is not the activity data p. 47 needs.
    expect(CAT3_3D_EXPORT_NOTE).toContain('include any company selling excess power to the grid')
    expect(CAT3_3D_EXPORT_NOTE).toContain('does not screen for it')
    expect(CAT3_3D_QUESTION.toLowerCase()).not.toContain('export')
    expect(CAT3_3D_QUESTION.toLowerCase()).not.toContain('excess')
    for (const t of [CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_EXPORT_NOTE, cat3ThreeDWithheld('panel')]) {
      expect(t, 'no em-dash in customer text').not.toContain('—')
    }
  })

  it('RS1b cooling is in the question, and the one place it is not collected says so', () => {
    // ⚠️ THE QUESTION LISTS COOLING AND THE PLATFORM HAS NO COOLING STREAM. That is right for a question
    // that SCREENS rather than prices: honouring a yes needs no cooling factor, and narrowing the list
    // would under-screen a district-cooling reseller. What it cannot do is leave the asymmetry unsaid.
    expect(CAT3_3D_QUESTION).toContain('cooling')
    expect(CAT3_3D_COOLING_NOTE).toContain('ThemisIQ collects no purchased cooling anywhere')
    expect(CAT3_3D_COOLING_NOTE).toContain('The refrigerants question in the GHG module is a different thing')

    // ⚠️ THE WORKBOOK'S OWN WORDS ARE CHECKED WHERE THE WORKBOOK CAN BE READ:
    // lib/emissionFactors/defraEnergy.test.ts E9 reads Heat and steam A28 and A29 and asserts this
    // sentence against them. It lives there because that file already carries an XLSX reader, and
    // because the claim is about the workbook rather than about Category 3.
    //
    // Here: the artefact's metadata does NOT carry a cooling quote, which is why the sentence cites
    // the sheet directly. If cooling is ever added to the artefact, read it from there instead.
    expect(Object.keys(DEFRA_ENERGY_META.guidance), 'cooling is not in the artefact')
      .not.toContain('cooling')

    // The sentence says what those two cells say, and cites where they are.
    expect(CAT3_3D_COOLING_NOTE).toContain('Heat and steam A28 and A29')
    expect(CAT3_3D_COOLING_NOTE).toContain('publishes no cooling factor')
    expect(CAT3_3D_COOLING_NOTE).toContain('the energy the cooling machines consume')
  })

  it('RS2 a yes withholds with the reason, and the lines stay as recorded and not in the total', () => {
    const { read, priced } = worked()
    // The basis, which is the export's methodology note and the saved factor_basis line: the SHORT form,
    // because the full reason is already in the file twice.
    expect(cat3Basis(priced, read, null, true)).toEqual({ basis: 'Not priced', detail: CAT3_3D_WITHHELD_SHORT })
    // The export: the full reason on the Basis row, the question on the activity D row, the lines' own
    // status said out loud, and the lines still there.
    const rows = cat3CsvRows(priced, read, null, GWP, true)
    expect(rows[0]).toEqual(['Basis', 'Not priced', cat3ThreeDWithheld('export')])
    const answer = rows.find(r => r[0] === 'Energy bought and sold on (activity D)')!
    expect(answer[1]).toBe('Yes')
    expect(answer[2]).toBe(`${CAT3_3D_QUESTION} Answered yes, so this category is not calculated: see its Basis row above.`)
    expect(rows).toContainEqual(['Lines below', 'Recorded, not in the total', CAT3_3D_LINES_NOT_IN_TOTAL])
    expect(rows.filter(r => r[0].startsWith('UK site') || r[0].startsWith('US site'))).toHaveLength(9)
    // The reason names what it costs the customer, rather than only refusing.
    expect(CAT3_3D_WITHHELD_CORE).toContain('activity D of Category 3')
    expect(cat3ThreeDWithheld('panel')).toContain('would understate the category')
    expect(cat3ThreeDWithheld('panel')).toContain('Enter your own Category 3 figure as known emissions')
  })

  it('RS2b every surface that renders the reason is listed here with the variant it uses', () => {
    // ⚠️ "shown below" WAS TRUE ON ONE SURFACE OF FOUR. The panel shows the lines under the notice; the
    // Relevance step does not (the question is two steps earlier); the Results step does not; the
    // export's methodology note is the last section of the file. A shared sentence that is true in one
    // place and false in three is worse than four sentences, because it is trusted for being shared.
    //
    // THE TABLE IS THE TEST. Every place the page renders cat3ThreeDWithheld, with the variant it
    // passes: a new surface has to be added here, and only the Calculate panel may say "below".
    const SURFACES: [Cat3Surface, string, string][] = [
      ['panel', "{cat3ThreeDWithheld('panel')}", 'the Category 3 panel on the Calculate step, above its workings card'],
      ['relevance', "{cat3ThreeDWithheld('relevance')}", 'the Relevance step, under the activity D question'],
      ['results', "unpricedReason(c.id, 'results')", "the Results step's amber excluded box"],
      ['export', "unpricedReason(c.id, 'export')", "the export's Excluded from total line"],
      ['record', "unpricedReason(c.id, 'record')", 'the saved coverage entry, read by another system'],
    ]
    const src = page()
    for (const [where, rendered, place] of SURFACES) {
      expect(src, `${where} is rendered at ${place}`).toContain(rendered)
      expect(cat3ThreeDWithheld(where), `${where} carries the one reason`).toContain(CAT3_3D_WITHHELD_CORE)
      if (where !== 'panel') {
        expect(cat3ThreeDWithheld(where), `${where} points at ${place} and cannot say "below"`).not.toContain('below')
      }
    }
    // The type has no surface this table does not list.
    const listed: Cat3Surface[] = SURFACES.map(([w]) => w)
    const all: Cat3Surface[] = ['panel', 'relevance', 'results', 'export', 'record']
    expect(listed.sort()).toEqual([...all].sort())
    // Each pointer names something a reader can go to.
    expect(cat3ThreeDWithheld('panel')).toContain('are shown below')
    expect(cat3ThreeDWithheld('relevance')).toContain('on the Category 3 panel in the Calculate step')
    expect(cat3ThreeDWithheld('results')).toContain('on the Category 3 panel in the Calculate step')
    expect(cat3ThreeDWithheld('export')).toContain("in this file's Cat 3 rows")
    expect(cat3ThreeDWithheld('record')).toContain('recorded on this record')
    // The stored record is not addressed as "you": it is read by another system.
    expect(cat3ThreeDWithheld('record')).toContain('its Scope 3 total')
    // ⚠️ AND NONE OF THEM SHOUTS. "are NOT in your Scope 3 total" was the old wording; the amber box
    // carries the emphasis. (CAT3_RECORDED_NOT_USED keeps its capital, with Category 15's.)
    for (const where of all) expect(cat3ThreeDWithheld(where), where).not.toContain(' NOT ')
    expect(CAT3_3D_LINES_NOT_IN_TOTAL).not.toContain(' NOT ')
  })

  it('RS2b2 no Category 3 sentence points at something that is not there when it renders', () => {
    // ⚠️ THE SAME DEFECT, FOUND BY LOOKING FOR IT. 'nothing_priced' ended "The rows below say why, one
    // by one" and rendered in the panel's amber box, on the Results step and in the export's excluded
    // line. On the first two there are no rows below: the workings card is hidden while the category is
    // withheld, which is exactly when that sentence shows.
    const nothingPriced = cat3WithheldText({ code: 'nothing_priced' })
    expect(nothingPriced).not.toContain('below')
    expect(nothingPriced).toContain('recorded with the Category 3 rows in your export')
    expect(page(), 'the card is hidden while the category is withheld, which is why')
      .toContain("{cat3Priced && cat3Priced.status !== 'withheld' && (")

    // The rest of the Category 3 copy that points anywhere, each checked where it renders:
    //   CAT3_3D_LINES_NOT_IN_TOTAL   "recorded here"      the panel, under the card; and the export's
    //                                                     'Lines below' row, above the line rows
    //   the activity D row, answer yes  "see its Basis row above"   the Basis row is row 0 of the block
    //   the 'Lines below' CSV label                        the priced line rows follow it
    //   cat3StaleNotice              "on this page"       the panel only
    // Asserted where a position is claimed:
    const { read, priced } = worked()
    const rows = cat3CsvRows(priced, read, null, GWP, true)
    const basisAt = rows.findIndex(r => r[0] === 'Basis')
    const answerAt = rows.findIndex(r => r[0] === 'Energy bought and sold on (activity D)')
    expect(rows[answerAt][2], 'the answer row points up at the Basis row').toContain('see its Basis row above')
    expect(basisAt).toBeLessThan(answerAt)
    const linesLabelAt = rows.findIndex(r => r[0] === 'Lines below')
    const firstLineAt = rows.findIndex(r => r[0].startsWith('UK site'))
    expect(linesLabelAt, 'the lines really are below their label').toBeLessThan(firstLineAt)
    // And nothing in the module points at a step by number, which would rot the moment a step moves.
    const copy = readFileSync(join(__dirname, 'cat3Copy.ts'), 'utf8')
    const strings = [...copy.matchAll(/'([^'\n]{25,})'/g)].map(m => m[1])
    for (const text of strings) expect(text, text).not.toMatch(/\bstep [1-5]\b/i)
  })

  it('RS2c the card never shows the figure without its status, and the export repeats the reason no more than twice', () => {
    const { read, priced } = worked()
    // ⚠️ THE CARD. Its header is the bold figure, then the summary; a screenshot of it alone used to read
    // as a confident Category 3 total. Both the header's summary and the "in all" sentence now carry the
    // status, and the page passes the same tag to the card's own status chip.
    // ⚠️ ONCE IN THE HEADER, NOT TWICE. The chip carries the status against the figure; the summary is
    // the count and the source, unchanged. Both carried it for one draft and the header read the tag
    // twice in one line.
    expect(cat3WorkingsSummary(priced)).not.toContain(CAT3_3D_NOT_IN_TOTAL_TAG)
    expect(cat3WorkingsSummary(priced)).toBe(
      '9 lines at 2 locations, priced from the DEFRA/DESNZ 2026 upstream energy factors on the bound GHG inventory')
    const withheldSentences = cat3Sentences(priced, read, GWP, true)
    expect(withheldSentences).toContain(`19,572.33 kg CO2e in all, which is 19.5723 mt CO2e, ${CAT3_3D_NOT_IN_TOTAL_TAG}.`)
    // Every sentence naming the total figure carries the tag: none of them states it bare.
    for (const line of withheldSentences.filter(x => /in all/.test(x))) {
      expect(line, line).toContain(CAT3_3D_NOT_IN_TOTAL_TAG)
    }
    expect(cat3Sentences(priced, read, GWP)).toContain('19,572.33 kg CO2e in all, which is 19.5723 mt CO2e.')
    const src = page()
    expect(src).toContain('status={cat3ExcludedFor3d ? CAT3_3D_NOT_IN_TOTAL_TAG : undefined}')
    expect(src).toContain('summary={cat3WorkingsSummary(cat3Priced)}')
    expect(src).toContain('sentences={cat3Sentences(cat3Priced, cat3Read, cat3GwpSentence, cat3ExcludedFor3d)}')

    // ⚠️ TWICE IN THE FILE, NOT FOUR TIMES: the header's excluded line and this category's Basis row.
    // The rows this builder produces carry it once; the excluded line is written by the page.
    const rows = cat3CsvRows(priced, read, null, GWP, true)
    const full = rows.filter(r => r.some(cell => cell.includes(CAT3_3D_WITHHELD_CORE)))
    expect(full, 'one full copy among the Category 3 rows').toHaveLength(1)
    expect(full[0][0]).toBe('Basis')
    // The methodology note and factor_basis carry the short form, which is not the full reason.
    expect(CAT3_3D_WITHHELD_SHORT).not.toContain(CAT3_3D_WITHHELD_CORE)
    expect(CAT3_3D_WITHHELD_SHORT.length).toBeLessThan(CAT3_3D_WITHHELD_CORE.length)
    expect(cat3Basis(priced, read, null, true).detail).toBe(CAT3_3D_WITHHELD_SHORT)
  })

  it('RS3 a no prices exactly as before, and the file records that it was asked', () => {
    const { read, priced } = worked()
    expect(cat3Basis(priced, read, null, false)).toEqual(cat3Basis(priced, read, null))
    const rows = cat3CsvRows(priced, read, null, GWP, false)
    expect(rows[0][1]).toContain('upstream energy factors per line')
    const answer = rows.find(r => r[0] === 'Energy bought and sold on (activity D)')!
    expect(answer[1]).toBe('No')
    expect(answer[2]).toContain('this category covers activities A, B and C only')
    // Every other row is what it was without the answer, so answering no changes no figure.
    const without = cat3CsvRows(priced, read, null, GWP)
    expect(rows.filter(r => r[0] !== 'Energy bought and sold on (activity D)'))
      .toEqual(without.filter(r => r[0] !== 'Energy bought and sold on (activity D)'))
  })

  it('RS4 an unanswered record prices as before, and the file says it was not answered', () => {
    // ⚠️ ABSENCE IS NOT A YES. Every record saved before this task carries no answer, and withholding on
    // an absent answer would empty the Category 3 figure out of all of them.
    const { read, priced } = worked()
    expect(cat3Basis(priced, read, null, undefined)).toEqual(cat3Basis(priced, read, null))
    const answer = cat3CsvRows(priced, read, null, GWP, undefined)
      .find(r => r[0] === 'Energy bought and sold on (activity D)')!
    expect(answer[1]).toBe('Not answered')
    expect(answer[2]).toContain(CAT3_3D_QUESTION)
    expect(answer[2]).toContain('table 3.1, p. 39')
    // The page's own gate reads === true, never truthiness, so undefined cannot withhold.
    expect(page()).toContain("const cat3SellsEnergyOn: boolean | undefined = catData['cat3']?.sells_energy_on")
    expect(page()).toContain("const cat3ExcludedFor3d = cat3SellsEnergyOn === true && !catData['cat3']?.emissions_override")
  })

  it('RS5 an entered figure survives the answer: the withholding is of our estimate, not of theirs', () => {
    const { read, priced } = worked()
    const withFigure = cat3Basis(priced, read, 40, true)
    expect(withFigure.basis).toBe('Entered figure')
    expect(withFigure.detail).toContain('40.00 mt CO2e entered directly')
    expect(withFigure.detail).not.toContain(CAT3_3D_WITHHELD_CORE)
    expect(page(), 'the page holds the same rule').toContain('!catData[\'cat3\']?.emissions_override')
  })

  it('RS6 the three surfaces carry the reason, and the category is left out of the total rather than zeroed', () => {
    const src = page()
    // Panel, on its own surface's wording.
    expect(src).toContain("{cat3ThreeDWithheld('panel')}")
    expect(src).toContain('{CAT3_3D_LINES_NOT_IN_TOTAL}')
    // CSV and factor_basis, through categoryBasis.
    expect(src).toContain('cat3Basis(cat3Priced, cat3Read, d?.emissions_override, cat3ExcludedFor3d)')
    // Task 9 appended the retired spend, so the call is pinned by its first five arguments.
    expect(src).toContain('cat3CsvRows(cat3Priced, cat3Read, c3.emissions_override, cat3GwpSentence, cat3SellsEnergyOn')
    // Coverage entry: the reason reaches it only through couldNotPriceCatIds, and it does.
    expect(src).toContain("if (c.id === 'cat3') return cat3ExcludedFor3d || cat3Priced?.withheld?.code === 'nothing_priced'")
    expect(src).toContain("if (id === 'cat3') return cat3ExcludedFor3d ? cat3ThreeDWithheld(where) : (cat3NoticeText || NO_REASON)")
    // ⚠️ EXCLUDED, NOT COUNTED AS ZERO. totalScope3 filters unpricedCatIds out of the sum; it does not
    // add a zero for them. This is the line that makes that true, unchanged since before this task.
    expect(src).toContain("const totalScope3 = CATEGORIES.filter(c => statusOf(c.id).inTotal && !unpricedCatIds.has(c.id))")
    expect(src).toContain("if (c.id === 'cat3') return cat3ExcludedFor3d || (!catData[c.id]?.emissions_override && cat3Mt() === null)")
  })

  it('RS8 the Results table tells an empty inventory from one whose categories are all left out', () => {
    // ⚠️ "No data entered yet. Go back to Step 3 to enter your data." WAS UNTRUE OF A WHOLE STATE. With
    // Category 3 the only relevant category and activity D answered yes, the table is empty because the
    // figure is deliberately excluded: the data is there, priced, and listed with its reason in the
    // amber box directly above the table.
    expect(RESULTS_TABLE_EMPTY).toBe('No data entered yet. Go back to Step 3 to enter your data.')
    expect(resultsTableAllUnpriced(1)).toBe(
      'The one category you marked relevant is left out of the total, for the reason given above.')
    expect(resultsTableAllUnpriced(3)).toBe(
      'All 3 categories you marked relevant are left out of the total, for the reasons given above.')
    // It must not send them back to Step 3, which is the thing the old message got wrong.
    expect(resultsTableAllUnpriced(1)).not.toMatch(/Go back/)
    // ⚠️ AND IT MAKES NO CLAIM ABOUT COMPLETENESS. It is shown for every unpriced state, and several of
    // them ARE missing something: Category 3 withheld for unanswered streams is missing answers, an
    // unreadable bound inventory is missing readable workings, a Category 1 spend that did not price may
    // be incomplete. The per-category reasons above the table say which; this line must not summarise.
    for (const n of [1, 2, 9]) {
      const text = resultsTableAllUnpriced(n)
      for (const claim of ['nothing is missing', 'the data is there', 'complete', 'all your data',
        'everything is entered', 'no data is missing']) {
        expect(text.toLowerCase(), `claims completeness: ${claim}`).not.toContain(claim)
      }
      // If it ever names the step, it names it as the rest of the page does.
      if (/step \d/i.test(text)) expect(text).toMatch(/Step \d/)
    }
    // ⚠️ NOT A CATEGORY 3 MESSAGE. It is keyed on there being unpriced categories at all, so a Cat 1
    // spend the factor route could not price, a Cat 15 assessment that failed, or a Cat 3 inventory that
    // cannot be read reach the same true sentence rather than the same false one.
    const src = page()
    expect(src).toContain('{unpricedCats.length > 0 ? resultsTableAllUnpriced(unpricedCats.length) : RESULTS_TABLE_EMPTY}')
    expect(src).not.toContain('>No data entered yet. Go back to Step 3 to enter your data.<')
    expect(resultsTableAllUnpriced(2)).not.toMatch(/Category 3|activity D/)
  })

  it('RS7 the question and its sentences are read from cat3Copy.ts, not typed into the page', () => {
    const src = page()
    for (const name of ['CAT3_3D_QUESTION', 'CAT3_3D_HELP', 'CAT3_3D_EXPORT_NOTE'])
      expect(src, name).toContain(`{${name}}`)
    for (const sentence of [CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_EXPORT_NOTE, CAT3_3D_WITHHELD_CORE,
      CAT3_3D_WITHHELD_SHORT, CAT3_3D_NOT_IN_TOTAL_TAG, CAT3_3D_LINES_NOT_IN_TOTAL])
      expect(src.includes(sentence), 'a cat3Copy sentence is duplicated in the page').toBe(false)
    // Stored in cat_data.cat3, as the design's Q6 decided for the fingerprint: no migration.
    expect(src).toContain("updateCat('cat3', 'sells_energy_on', on ? undefined : value)")
    expect(src).toContain('sells_energy_on?: boolean')
  })
})
