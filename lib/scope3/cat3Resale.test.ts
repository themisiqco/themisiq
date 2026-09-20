import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cat3InputsFrom } from './cat3Inputs'
import { priceCat3 } from './cat3Energy'
import {
  cat3Basis, cat3CsvRows, CAT3_GWP_PUBLISHER,
  CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_EXPORT_NOTE, CAT3_3D_WITHHELD, CAT3_3D_LINES_NOT_IN_TOTAL,
  CAT3_3D_DESCRIPTION, CAT3_3D_APPLICABILITY, CAT3_3D_ACTIVITY_DATA, CAT3_3D_COOLING_NOTE,
} from './cat3Copy'
import { DEFRA_ENERGY_META } from '../emissionFactors/defraEnergy'
import { publisherGwpSentence } from './gwpSentence'
import { SCOPE3_FIXTURE_GHG } from './scope3SurfacesFixture'

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
    for (const t of [CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_EXPORT_NOTE, CAT3_3D_WITHHELD]) {
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

  it('RS2 a yes withholds the category with the reason, and the lines stay as recorded and not in the total', () => {
    const { read, priced } = worked()
    // The basis, which is the CSV's Method cell and the saved factor_basis line.
    const basis = cat3Basis(priced, read, null, true)
    expect(basis).toEqual({ basis: 'Not priced', detail: CAT3_3D_WITHHELD })
    // The export: the answer in its own row, the lines' status said out loud, and the lines still there.
    const rows = cat3CsvRows(priced, read, null, GWP, true)
    expect(rows[0]).toEqual(['Basis', 'Not priced', CAT3_3D_WITHHELD])
    expect(rows).toContainEqual(['Energy bought and sold on (activity D)', 'Yes', CAT3_3D_WITHHELD])
    expect(rows).toContainEqual(['Lines below', 'Recorded, not in the total', CAT3_3D_LINES_NOT_IN_TOTAL])
    expect(rows.filter(r => r[0].startsWith('UK site') || r[0].startsWith('US site'))).toHaveLength(9)
    // The reason names what it costs the customer, rather than only refusing.
    expect(CAT3_3D_WITHHELD).toContain('are NOT in your Scope 3 total')
    expect(CAT3_3D_WITHHELD).toContain('would understate the category')
    expect(CAT3_3D_WITHHELD).toContain('Enter your own Category 3 figure as known emissions')
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
    expect(withFigure.detail).not.toContain(CAT3_3D_WITHHELD)
    expect(page(), 'the page holds the same rule').toContain('!catData[\'cat3\']?.emissions_override')
  })

  it('RS6 the three surfaces carry the reason, and the category is left out of the total rather than zeroed', () => {
    const src = page()
    // Panel.
    expect(src).toContain('{CAT3_3D_WITHHELD}')
    expect(src).toContain('{CAT3_3D_LINES_NOT_IN_TOTAL}')
    // CSV and factor_basis, through categoryBasis.
    expect(src).toContain('cat3Basis(cat3Priced, cat3Read, d?.emissions_override, cat3ExcludedFor3d)')
    // Task 9 appended the retired spend, so the call is pinned by its first five arguments.
    expect(src).toContain('cat3CsvRows(cat3Priced, cat3Read, c3.emissions_override, cat3GwpSentence, cat3SellsEnergyOn')
    // Coverage entry: the reason reaches it only through couldNotPriceCatIds, and it does.
    expect(src).toContain("if (c.id === 'cat3') return cat3ExcludedFor3d || cat3Priced?.withheld?.code === 'nothing_priced'")
    expect(src).toContain("if (id === 'cat3') return cat3ExcludedFor3d ? CAT3_3D_WITHHELD : (cat3NoFigure || NO_REASON)")
    // ⚠️ EXCLUDED, NOT COUNTED AS ZERO. totalScope3 filters unpricedCatIds out of the sum; it does not
    // add a zero for them. This is the line that makes that true, unchanged since before this task.
    expect(src).toContain("const totalScope3 = CATEGORIES.filter(c => statusOf(c.id).inTotal && !unpricedCatIds.has(c.id))")
    expect(src).toContain("if (c.id === 'cat3') return cat3ExcludedFor3d || (!catData[c.id]?.emissions_override && cat3Mt() === null)")
  })

  it('RS7 the question and its sentences are read from cat3Copy.ts, not typed into the page', () => {
    const src = page()
    for (const name of ['CAT3_3D_QUESTION', 'CAT3_3D_HELP', 'CAT3_3D_EXPORT_NOTE', 'CAT3_3D_WITHHELD'])
      expect(src, name).toContain(`{${name}}`)
    for (const sentence of [CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_EXPORT_NOTE, CAT3_3D_WITHHELD])
      expect(src.includes(sentence), 'a cat3Copy sentence is duplicated in the page').toBe(false)
    // Stored in cat_data.cat3, as the design's Q6 decided for the fingerprint: no migration.
    expect(src).toContain("updateCat('cat3', 'sells_energy_on', on ? undefined : value)")
    expect(src).toContain('sells_energy_on?: boolean')
  })
})
