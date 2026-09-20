// ── EVERY CATEGORY 3 SENTENCE, BUILT ONCE ────────────────────────────────────────────────────────
//
// The Cat 3 panel, its workings, the unpriced notice and (from Task 6) the CSV and factor_basis read
// these. None is typed anywhere else, which categoryMethods.test.ts M12 enforces by reading the page.
//
// ⚠️ THE CALCULATION DECIDES WHAT IS TRUE; THIS FILE DECIDES HOW TO SAY IT. lib/scope3/cat3Energy.ts
// emits codes with their data (Cat3Flag, Cat3Reason, Cat3Withheld) and lib/scope3/cat3Inputs.ts emits
// its own (Cat3Skipped, Cat3InputsReason). Every one of them is answered here, by name: a code with no
// sentence is a silent absence on screen, which is the defect the whole Scope 3 copy layer exists to
// stop. The switches below are exhaustive, so a new code fails tsc here.
//
// ⚠️ NO EM-DASHES (lib/scope3/scope3Copy.test.ts SC4), and every workbook fact is READ from
// lib/emissionFactors/defraEnergy.ts, so a regenerated artefact cannot leave a sentence behind.
//
// Built the way lib/scope3/cat15.ts and lib/scope3/notEntered.ts are, and worded the way
// lib/scope3/commutingCopy.ts words its rows, because a customer reading two categories should not
// meet two voices.

import { DEFRA_ENERGY_META } from '../emissionFactors/defraEnergy'
import { scope3MethodDescription } from './categoryMethods'
import type {
  Cat3Flag, Cat3LineKind, Cat3PricedLine, Cat3Reason, Cat3Result, Cat3Stream, Cat3Unpriced, Cat3Withheld,
} from './cat3Energy'
import type { Cat3InputsReason, Cat3InputsResult, Cat3Skipped } from './cat3Inputs'
import type { Cat3FingerprintChange } from './cat3Fingerprint'

const m = DEFRA_ENERGY_META
const g = m.guidance

/** A guidance quote's sheet and cell, e.g. "WTT- UK electricity A16". Throws if the artefact drops it. */
const cite = (key: string): string => {
  const q = g[key]
  if (!q) throw new Error(`cat3Copy: the artefact has no guidance quote "${key}"`)
  return `${q.sheet} ${q.cell}`
}

/**
 * One full stop at the end, whatever the text already ends with.
 *
 * ⚠️ A SPLICED NAME CAN END IN A STOP, AND ONE DID. A Buffalo electricity line read "… priced from US
 * EPA eGRID2023 · Grid factor for 2023 applied to 2025 inventory (latest vintage held).." — the note's
 * own stop, then the one this module appends. The note is gone (see cat3Inputs.publisherOf), but the
 * shape recurs for any publisher name ending in a stop, a bracket or a quote, and none of those is
 * ours to control: they come from EF_SOURCES and from whatever a future factor table cites. So the
 * punctuation is applied here, once, and cat3Copy.test.ts SC-style guards forbid a double stop in any
 * rendered sentence.
 */
const endSentence = (text: string): string => {
  const t = text.trimEnd()
  return /[.!?]$/.test(t) ? t : `${t}.`
}

const n2 = (x: number) => x.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/**
 * The category total in tonnes, at four places: the figure a customer quotes, and the card above it
 * rounds to two. Rounding both to two would make the panel's own arithmetic look wrong on a small
 * category.
 *
 * ⚠️ "mt CO2e", NOT "t CO2e", EVERYWHERE IN THIS MODULE. Both spellings were here: the panel's total
 * sentence said "t CO2e" and the override sentence beside it "mt CO2e", in adjacent clauses. The
 * product says mt: the workings card's own header (`${figureMt.toFixed(2)} mt CO₂e`), the CSV's
 * "Total Scope 3" row, its "mt CO2e" column heading, and the entered-figure sentences of Categories
 * 1, 2, 4, 15 and the flat six. Category 3 follows the surfaces around it rather than introducing a
 * second unit label two lines apart; whether "mt" is the right abbreviation for a tonne at all is a
 * platform-wide question and is not answered here.
 */
const n4 = (x: number) => x.toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
/** An activity figure as entered: enough places to show a small one, never scientific notation. */
const nAct = (x: number) => x.toLocaleString('en', { maximumFractionDigits: 4 })
/** A published factor, at the precision the workbook prints it. Never rounded to 2. */
const nFac = (x: number) => String(x)

// ── THE SENTENCES THAT DO NOT DEPEND ON A RECORD ─────────────────────────────────────────────────

export const CAT3_SOURCE_SENTENCE =
  `Priced from ${m.source} (${m.factor_set.toLowerCase()} v${m.file_version}, factor edition ${m.edition}): ` +
  `the ${m.sheets.filter(s => s !== 'Conversions').join(', ')} sheets, with unit conversions from its ` +
  `Conversions sheet.`

export const CAT3_DERIVED_SENTENCE =
  'Nothing in this category is entered here. Every figure is the fuel, electricity and purchased heat or ' +
  'steam already recorded for each location in the GHG inventory this Scope 3 record is bound to, with the ' +
  'coverage resolutions of that inventory already applied. To change what this category covers, change the ' +
  'energy in that inventory.'

export const CAT3_EXCLUDES_COMBUSTION_SENTENCE =
  'Every factor here is an upstream factor and excludes combustion, which is what this category may use: ' +
  'the burning of the fuel is already in your Scope 1, and the electricity you bought is already in your ' +
  'Scope 2. Nothing is counted twice.'

export const CAT3_SEPARATE_LINES_SENTENCE =
  `Electricity and purchased heat are reported as three separate lines each, as the workbook directs ` +
  `(${cite('electricity_separate_lines')} and ${cite('heat_distribution_to_scope3')}): the upstream ` +
  `emissions of generating what you used, the generation of what was lost in transmission and ` +
  `distribution, and the upstream emissions of that lost energy.`

export const CAT3_LOCATION_BASED_SENTENCE =
  'These figures rest on your location-based Scope 2 total, not your market-based one. The GHG Protocol ' +
  'Scope 2 Guidance (section 1.10, p. 10) requires a company to disclose which of the two it used as the ' +
  'basis for this category, and this is that disclosure.'

/**
 * ⚠️ THE GWP SENTENCE IS THE SHARED ONE, NOT A CATEGORY 3 WORDING. Cats 5, 6, 7 and 12 all state their
 * publisher's basis through publisherGwpSentence (lib/scope3/gwpSentence.ts), which READS the bound GHG
 * inventory and says whether the two bases agree, differ, or whether the inventory records none. A
 * static Category 3 sentence saying "your inventory may be on another basis" would be the weakest of
 * those three statements, and this category is only ever calculated while an inventory IS bound, so the
 * comparison is always available. The page passes it in, as it does for the other four.
 */
export const CAT3_GWP_PUBLISHER = {
  gwp_basis: m.gwp_basis,
  // ⚠️ NOT m.gwp_basis_note, AND THE REASON IS ONE WORD IN IT. The artefact's own note reads "Stated by
  // the workbook's Introduction sheet (guidance.gwp_basis): …", where `guidance.gwp_basis` is the KEY of
  // the quote inside the JSON: a variable name, in a sentence a customer reads on the panel and in the
  // export. The fact is the artefact's; the citation a reader can check is the sheet and cell, which is
  // what the design's Q5 asks this line to carry and what the waste note gives. Both are read from the
  // record, nothing is typed. The artefact's note stays as the record's own prose.
  gwp_basis_note:
    `Stated by the workbook's Introduction sheet (${cite('gwp_basis')}): the CO2e figures use IPCC ` +
    `${m.gwp_basis} 100-year GWPs. The values are combined CO2e as published and are not re-based.`,
}

export const CAT3_STAND_IN_SENTENCE =
  `These are UK factors, and DEFRA no longer publishes overseas electricity, transmission and ` +
  `distribution or well-to-tank factors (${cite('overseas_factors_withdrawn')}, ` +
  `${cite('overseas_td_withdrawn')} and ${cite('overseas_wtt_withdrawn')}). Every line priced from them ` +
  `at a location outside the UK is flagged as a stand-in, fuels included.`

/**
 * ⚠️ SPLIT IN TWO ON 20 SEP 2026, BECAUSE ONE OF THEM WAS FALSE OF SOME INVENTORIES. The single sentence
 * said the Scope 1 side of the gas figure "is priced on the US EPA's higher heating values" and was
 * shown whenever ANY line used the gross CV factor. On an inventory whose only gas is at a UK location
 * that is simply untrue: UK gas is entered in kWh (engine.ts ngUnitOptions offers kWh alone for GB/UK)
 * and its Scope 1 side is priced by DEFRA, not the EPA. The disclosure exists to flag an assumption the
 * customer's own figures rest on; printed where no such assumption was made it is a false claim about
 * their inventory, and it teaches them to skip the next one.
 *
 * The first sentence is true of every gross CV line. The second is true exactly where a figure was
 * entered in therms or million Btu, which engine.ts offers only on the US path, and whose Scope 1 side
 * combustionSource therefore prices from the EPA.
 */
export const CAT3_GROSS_CV_SENTENCE =
  `Natural gas is priced on the workbook's gross calorific value factor: it asks for the same basis on ` +
  `both sides of an entry (${cite('cv_basis_match_scope1')}), and says organisations should typically ` +
  `use gross calorific values for each kWh of energy consumed (${cite('cv_gross_typical')}).`

export const CAT3_EPA_HHV_SENTENCE =
  `A gas figure entered in therms or million Btu is a US entry, and the Scope 1 side of it is priced on ` +
  `the US EPA's higher heating values. That an EPA higher heating value and a DEFRA gross calorific ` +
  `value are interchangeable is not stated by either publisher, so this line says where the two meet ` +
  `rather than assuming it away.`

/** The licence the factors are published under, and the acknowledgement it requires. */
export const CAT3_ATTRIBUTION = m.attribution_required
export const CAT3_LICENCE_LINE = `Licence: ${m.licence}, ${m.licence_url}`

// ── LABELS ───────────────────────────────────────────────────────────────────────────────────────

/** The streams as a customer names them, not as the engine keys them. */
export const CAT3_STREAM_LABEL: Readonly<Record<Cat3Stream, string>> = {
  natural_gas: 'natural gas',
  propane: 'propane',
  diesel_stationary: 'diesel (stationary)',
  fuel_oil_distillate: 'heating oil',
  fuel_oil_residual: 'heavy fuel oil',
  mobile_gasoline: 'petrol (mobile)',
  mobile_diesel: 'diesel (mobile)',
  electricity: 'electricity',
  purchased_steam: 'purchased heat and steam',
  refrigerants: 'refrigerants',
}

/** What each line IS, in the customer's words. The 3a/3b/3c letters are the Technical Guidance's. */
export const CAT3_LINE_LABEL: Readonly<Record<Cat3LineKind, string>> = {
  fuel_wtt: 'upstream of the fuel (well-to-tank)',
  electricity_generation_wtt: 'upstream of the fuels burned to generate it (well-to-tank)',
  electricity_td_loss: 'generation of the electricity lost in transmission and distribution',
  electricity_td_wtt: 'upstream of the fuels behind that lost electricity',
  steam_wtt: 'upstream of the fuels burned to produce it (well-to-tank)',
  steam_distribution_loss: 'production of the heat lost in distribution',
  steam_distribution_wtt: 'upstream of the fuels behind that lost heat',
}

/** The GHG module's stream names, for the sentence that says which were not answered. */
const STREAM_IN_INVENTORY: Readonly<Record<string, string>> = {
  natural_gas: 'natural gas', propane: 'propane', diesel_stationary: 'diesel (stationary)',
  fuel_oil_distillate: 'heating oil', fuel_oil_residual: 'heavy fuel oil',
  mobile: 'vehicle or mobile equipment fuel', refrigerants: 'refrigerants',
  electricity: 'electricity', purchased_steam: 'purchased heat or steam',
}
const streamText = (s: string): string => STREAM_IN_INVENTORY[s] ?? s

/** "a, b and c" from a list, with no Oxford comma, as every other list in this module reads. */
const list = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

// ── FLAGS ON A LINE ──────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ THE STAND-IN SENTENCE NAMES THE PUBLISHER THAT PRICED THE SCOPE 1 OR 2 FIGURE BESIDE IT, because
 * that is the disagreement a verifier needs to see: the same kWh is in Scope 2 on an EPA factor and in
 * Category 3 on a DEFRA one. Condition 1 of the approved design, 20 Sep 2026.
 */
export function cat3FlagText(f: Cat3Flag): string {
  switch (f.code) {
    case 'uk_stand_in':
      return (
        `UK factor used as a stand-in${f.country ? ` at a location in ${f.country}` : ''}` +
        `${f.scope1_publisher ? `, whose Scope 1 and 2 figures are priced from ${f.scope1_publisher}` : ''}`
      )
    case 'country_unresolved':
      return 'the GHG inventory does not say which country this location is in, so the figure is treated as if it were outside the UK'
    case 'nz_mfe_3c':
      return `this line is the GHG inventory's own New Zealand figure (${f.source}), not a DEFRA one`
  }
}

/**
 * The flags on ONE line, as statements to be shown one after another.
 *
 * ⚠️ THE UNRESOLVED-COUNTRY PAIR IS ONE STATEMENT, NOT TWO. cat3Energy's standInFlags emits
 * country_unresolved AND uk_stand_in together for every row whose country the adapter could not
 * answer, and they are two halves of one fact: the country is unknown, therefore the UK factor is a
 * stand-in. Rendered as two clauses joined by "and" they read as fragments, and the reason arrives
 * after the consequence. A row can carry uk_stand_in WITHOUT country_unresolved (a known country that
 * is not the UK); it can never carry country_unresolved without uk_stand_in.
 */
export function cat3FlagStatements(flags: readonly Cat3Flag[]): string[] {
  const unresolved = flags.find(f => f.code === 'country_unresolved')
  const standIn = flags.find(f => f.code === 'uk_stand_in') as Extract<Cat3Flag, { code: 'uk_stand_in' }> | undefined
  const rest = flags.filter(f => f.code !== 'country_unresolved' && f.code !== 'uk_stand_in').map(cat3FlagText)
  if (unresolved && standIn) {
    return [
      'UK factor used as a stand-in, because the GHG inventory does not say which country this ' +
      'location is in and a location that might not be in the UK is not treated as if it were' +
      (standIn.scope1_publisher ? `; its Scope 1 and 2 figures are priced from ${standIn.scope1_publisher}` : ''),
      ...rest,
    ]
  }
  return flags.map(cat3FlagText)
}

// ── WHY A LINE, A ROW OR THE WHOLE CATEGORY HAS NO FIGURE ────────────────────────────────────────

/** A row the pricing module could not price. Lower case: it follows "not priced:" or a location. */
export function cat3ReasonText(r: Cat3Reason): string {
  switch (r.code) {
    case 'unit_not_published':
      return `the workbook publishes no upstream factor for ${CAT3_STREAM_LABEL[r.stream]} measured in ${r.unit}`
    case 'refrigerants_not_in_category':
      return 'refrigerants are a Scope 1 fugitive emission and are not part of this category'
    case 'market_based_row_not_used':
      return 'this is the market-based electricity row, and the location-based row is the basis for this category'
    case 'no_nz_td_figure':
      return `the GHG inventory holds no New Zealand transmission and distribution figure for ${r.location}, and a DEFRA one would not describe that grid`
    case 'activity_not_a_number':
      return `the figure recorded for it is not a number, in ${r.unit}`
  }
}

/** A workings row the adapter deliberately did not pass on. Same voice as cat3ReasonText. */
export function cat3SkippedText(s: Cat3Skipped): string {
  switch (s.code) {
    case 'location_excluded':
      return `${s.location} is excluded from the GHG inventory's own totals, so nothing at it is priced here either`
    case 'refrigerants_not_in_category':
      return `refrigerants at ${s.location} are a Scope 1 fugitive emission and are not part of this category`
    case 'market_based_row_not_used':
      return `the market-based electricity row at ${s.location} is not used: the location-based row is the basis for this category`
    case 'stream_not_recognised':
      return `a row at ${s.location} names a stream this category does not recognise (${s.stream || s.source || 'unnamed'})`
    case 'mobile_fuel_not_named':
      return `a vehicle fuel row at ${s.location} does not say which fuel it is ("${s.source}"), and petrol and diesel have different factors, so it is not priced`
    case 'activity_missing':
      return `a ${streamText(s.stream)} row at ${s.location} carries no figure`
    case 'scope2_not_priced':
      return `${streamText(s.stream)} at ${s.location} has no published factor in that country, so the GHG inventory could not price it and nothing upstream of it is priced here`
  }
}

/** Why the bound inventory cannot be read at all. A full sentence: it stands alone on screen. */
export function cat3InputsReasonText(r: Cat3InputsReason): string {
  switch (r.code) {
    case 'no_workings':
      return 'The GHG inventory this record is bound to has no saved workings, so there is no energy to price. Open that inventory and save it, then come back.'
    case 'workings_shape_unreadable':
      return `The GHG inventory this record is bound to was saved in an older form that does not carry the fields this category reads (${r.rows} ${r.rows === 1 ? 'row' : 'rows'}). Open that inventory and save it again, and the figures will be read from it. Nothing is assumed in the meantime.`
    case 'no_locations_data':
      return 'The GHG inventory this record is bound to has no saved locations, so neither the country of each figure nor which streams were answered can be read.'
  }
}

/**
 * Why there is no figure although the inventory was read.
 *
 * ⚠️ THE UNDECLARED SENTENCE NAMES THE STREAMS AND WHERE THEY ARE. A figure of zero would assert that a
 * stream nobody answered emits nothing; withholding is right, and a customer told only "something is
 * missing" cannot act. The per location detail comes from cat3Inputs.undeclared_detail (Task 3).
 */
export function cat3WithheldText(w: Cat3Withheld, detail: Cat3InputsResult['undeclared_detail'] = []): string {
  switch (w.code) {
    case 'undeclared_streams': {
      // ⚠️ SEMICOLONS BETWEEN THE LOCATIONS, because each location's own list already uses "and", and
      // "Office: propane and mobile fuel and Depot: mobile fuel" is unreadable at the second "and".
      const byLocation = new Map<string, string[]>()
      for (const d of detail) {
        if (!w.streams.includes(d.stream)) continue
        byLocation.set(d.location, [...(byLocation.get(d.location) ?? []), streamText(d.stream)])
      }
      const where = [...byLocation.entries()].map(([loc, streams]) => `${loc}: ${list(streams)}`)
      const named = where.length > 0 ? where.join('; ') : list(w.streams.map(streamText))
      // ⚠️ "NOT ANSWERED", NOT "NOT DECLARED". Two states withhold the figure: a stream nobody said
      // yes or no to, and a stream declared present with no amount given (engine.ts:3146-3158, mirrored
      // in cat3Inputs.ts). One sentence covers both, and the remedy below covers both too.
      return (
        `This category is not calculated, because the GHG inventory has not answered these, either with ` +
        `an amount or by confirming there is none: ${named}. A figure of zero would say they emit ` +
        `nothing, which nobody has told us. Answer them in the GHG module and this category calculates ` +
        `itself.`
      )
    }
    case 'nothing_priced':
      return 'This category is not calculated: the GHG inventory holds energy at these locations, and none of it could be priced. The rows below say why, one by one.'
  }
}

/** A zero that is an answer rather than an absence. */
export function cat3ZeroText(): string {
  return (
    'This category is zero. Every location in the GHG inventory has answered every stream, and none of ' +
    'them holds any fuel, electricity or purchased heat, so there is no upstream energy to price. That ' +
    'is a calculated zero, not a blank.'
  )
}

// ── ONE PRICED LINE ──────────────────────────────────────────────────────────────────────────────

/**
 * One line, as the panel and (from Task 6) the CSV show it: what was entered, the conversion if one
 * applied, the factor with the cell it came from, the result, and any flags.
 *
 * ⚠️ THE ARITHMETIC IS SHOWN, NOT SUMMARISED. A verifier reproduces the number from this sentence alone:
 * entered figure, conversion, published factor, cell, product. The GHG module's workings card sets that
 * expectation and a customer moving between the two should not find less here.
 */
export function cat3LineText(l: Cat3PricedLine): string {
  const head = `${l.location}, ${CAT3_STREAM_LABEL[l.stream]}, ${CAT3_LINE_LABEL[l.line]}`
  const entered = `${nAct(l.activity_as_entered)} ${l.unit_as_entered}`
  // ⚠️ "converted to X at N", NOT "N X per Y". The unit as stored is plural ('therms', 'gallons'), so
  // "per therms" is what the other phrasing produces, on the line a verifier reads most closely.
  const conv = l.conversion
    ? ` converted to ${l.conversion.to} at ${nFac(l.conversion.factor)} ` +
      `(${l.conversion.source === 'defra' ? l.conversion.cite : `an exact identity, ${l.conversion.cite}`})` +
      ` = ${nAct(l.activity_priced)} ${l.unit_priced}`
    : ''
  const priced = l.factor
    ? `${conv}, x ${nFac(l.factor.kg_co2e)} kg CO2e per ${l.factor.unit} (${l.factor.sheet} ${l.factor.cell})`
    : conv
  // ⚠️ ONE SENTENCE EACH, NOT A LIST JOINED BY "and". Two flags on a line are two separate statements
  // about it, and "X and the inventory does not say which country this is" reads as one broken one.
  const statements = cat3FlagStatements(l.flags)
  const flags = statements.length > 0
    ? ` ${statements.map(t => endSentence(`${t.charAt(0).toUpperCase()}${t.slice(1)}`)).join(' ')}`
    : ''
  return `${head}: ${entered}${priced} = ${n2(l.kg_co2e)} kg CO2e.${flags}`
}

/** One row that was not priced, in the same voice. */
export function cat3UnpricedText(u: Cat3Unpriced): string {
  return endSentence(`${u.location}, ${CAT3_STREAM_LABEL[u.stream]}: not priced, ${cat3ReasonText(u.reason)}`)
}

// ── THE WORKINGS CARD ────────────────────────────────────────────────────────────────────────────

/** The one line beside the figure: how many lines were priced, at how many locations, from what. */
export function cat3WorkingsSummary(r: Cat3Result): string {
  const locations = new Set(r.lines.map(l => l.location)).size
  return (
    `${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'} at ${locations} ` +
    `${locations === 1 ? 'location' : 'locations'}, priced from the DEFRA/DESNZ ${m.year} upstream energy ` +
    `factors on the bound GHG inventory`
  )
}

/**
 * Everything the workings card shows: the method, then every priced line, then everything that was not
 * priced and why. `gwpSentence` is the record's own publisher GWP sentence, as Cats 5, 6 and 7 pass one.
 */
/** A line priced on the workbook's gross calorific value natural gas row. */
const isGrossCv = (l: Cat3PricedLine): boolean => l.factor?.key === 'natural_gas_kwh_gross_cv'
/**
 * The two units whose Scope 1 side is EPA-priced. engine.ts ngUnitOptions offers therms and MMBtu on
 * the US path alone (CA gets mcf and m3, GB/UK and NZ kWh, AU and the EU m3), and combustionSource
 * prices a US location from the EPA, so the unit as entered is what decides this.
 */
const EPA_HHV_UNITS = ['therms', 'mmbtu']

export function cat3MethodSentences(r: Cat3Result, gwpSentence: string): string[] {
  const out: string[] = [
    CAT3_SOURCE_SENTENCE,
    CAT3_ATTRIBUTION,
    CAT3_LICENCE_LINE,
    CAT3_DERIVED_SENTENCE,
    CAT3_EXCLUDES_COMBUSTION_SENTENCE,
    CAT3_SEPARATE_LINES_SENTENCE,
    CAT3_LOCATION_BASED_SENTENCE,
    gwpSentence,
    CAT3_STAND_IN_SENTENCE,
  ]
  // Only where a gross CV factor actually priced something: a sentence about a conversion nobody's
  // figures went through is noise, and noise is what stops the rest being read.
  if (r.lines.some(isGrossCv)) out.push(CAT3_GROSS_CV_SENTENCE)
  // And the EPA half only where a US entry made the two bases meet. See the note above the sentences.
  if (r.lines.some(l => isGrossCv(l) && EPA_HHV_UNITS.includes(l.unit_as_entered.trim().toLowerCase()))) {
    out.push(CAT3_EPA_HHV_SENTENCE)
  }
  return out
}

/** The workings card: the method, then the figure, then every line and everything not priced. */
export function cat3Sentences(r: Cat3Result, inputs: Cat3InputsResult, gwpSentence: string): string[] {
  const out: string[] = cat3MethodSentences(r, gwpSentence)
  if (r.status === 'priced') {
    out.push(`${n2(r.kg_co2e)} kg CO2e in all, which is ${n4(r.kg_co2e / 1000)} mt CO2e.`)
    for (const l of r.lines) out.push(cat3LineText(l))
  }
  if (r.status === 'zero') out.push(cat3ZeroText())
  if (r.withheld) out.push(cat3WithheldText(r.withheld, inputs.undeclared_detail))
  for (const u of r.unpriced) out.push(cat3UnpricedText(u))
  for (const s of inputs.skipped) {
    const t = cat3SkippedText(s)
    out.push(endSentence(`${t.charAt(0).toUpperCase()}${t.slice(1)}`))
  }
  return out
}

// ── ACTIVITY D: ENERGY BOUGHT AND SOLD ON ──────────────────────────────────────────────────────────
//
// Category 3 is four activities, not one. This build prices A (upstream of fuels), B (upstream of
// purchased electricity and heat) and C (transmission and distribution losses). The fourth, D, is
// energy the company BUYS AND SELLS ON, and it is the one activity whose inputs are not in a GHG
// inventory at all: the Technical Guidance asks for "Quantities and specific source (e.g., generation
// unit) of electricity purchased and re-sold" (p. 47), which is a sales record, not a meter reading.
//
// ⚠️ SO THE PLATFORM ASKS INSTEAD OF ASSUMING. Every quote below is from
// ~/themisiq-sources/ghg-protocol/Scope3_Calculation_Guidance_0[1].pdf, read with pdftotext -layout;
// the page numbers are the printed ones in each page's own footer.

/** Table 3.1, p. 39, activity D, its description column, verbatim. */
export const CAT3_3D_DESCRIPTION =
  'Generation (upstream activities and combustion) of electricity, steam, heating, and cooling that is ' +
  'purchased by the reporting company and sold to end users'
/** Table 3.1, p. 39, activity D, its applicability column, verbatim. */
export const CAT3_3D_APPLICABILITY = 'Applicable to utility companies and energy retailers'
/** p. 47, the activity data this build would need and does not hold, verbatim. */
export const CAT3_3D_ACTIVITY_DATA =
  'Quantities and specific source (e.g., generation unit) of electricity purchased and re-sold'

/**
 * The screening question, worded to the activity's own words and no wider.
 *
 * ⚠️ "BUY AND SELL ON", NOT "SELL ENERGY". The activity is energy PURCHASED by the reporting company
 * and sold to end users. A company that generates and sells its own power is not doing activity D with
 * that power, and a question that asked "do you sell energy" would collect yeses from companies whose
 * Category 3 is complete without it, and withhold a correct figure from them.
 */
export const CAT3_3D_QUESTION =
  'Does your company buy electricity, steam, heating or cooling and sell it on to end users?'

/** Under the question: what it is for, in the Guidance's words, with its pages. */
export const CAT3_3D_HELP =
  `The GHG Protocol's Technical Guidance for Calculating Scope 3 Emissions calls this activity D of ` +
  `Category 3: "${CAT3_3D_DESCRIPTION}" (table 3.1, p. 39), "${CAT3_3D_APPLICABILITY}". Answer yes only ` +
  `if you resell energy you bought. ThemisIQ cannot calculate it: the Guidance prices it from "` +
  `${CAT3_3D_ACTIVITY_DATA}" (p. 47) through formula 3.4 (p. 48), and a GHG inventory records the ` +
  `energy you consumed, not what you bought for resale.`

/**
 * ⚠️ THE FOOTNOTE IS NOT IN THE QUESTION, AND HERE IS WHY IT IS NAMED ANYWAY. Table 3.1's applicability
 * column carries "* Energy retailers include any company selling excess power to the grid" (p. 39),
 * which widens WHO counts as a retailer. The ACTIVITY is unchanged: energy purchased and sold on. A
 * company exporting its own generation has no purchased-for-resale quantity for formula 3.4 to
 * multiply, and an export meter is not the activity data p. 47 asks for. Widening the question to
 * "do you export power" would withhold the whole category from every site with solar panels, on an
 * activity this build could not price for them either. So the question stays at the operative text and
 * the customer is told, plainly, what is not being screened.
 */
/**
 * ⚠️ COOLING IS IN THE QUESTION AND IN NOTHING ELSE THIS PLATFORM DOES, so the asymmetry is named.
 * The question quotes the Guidance's own list (electricity, steam, heating and cooling) because it
 * SCREENS rather than prices: honouring a yes needs no cooling factor. But a customer who reads
 * "cooling" here and then looks for somewhere to enter purchased cooling will not find one, and the
 * nearest thing they will find is the GHG module's refrigerants question, which is a different
 * emission entirely. Saying so is cheaper than letting them put district cooling in the refrigerants
 * box.
 *
 * ⚠️ THE QUOTE IS FROM THE WORKBOOK, NOT FROM THE ARTEFACT. DEFRA_ENERGY_META.guidance carries nine
 * quotes and this is not one of them, so cat3Resale.test.ts reads Heat and steam A28 and A29 out of
 * data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx and checks this sentence
 * against them. A regenerated artefact cannot silently orphan it, because the test does not read the
 * artefact at all.
 */
export const CAT3_3D_COOLING_NOTE =
  'Cooling is in the question because the Guidance lists it. ThemisIQ collects no purchased cooling ' +
  'anywhere: the workbook publishes no cooling factor and says to work the emissions out from the ' +
  'energy the cooling machines consume (Heat and steam A28 and A29). Where those machines are yours, ' +
  'that energy is already in your electricity or fuel figures; where you buy cooling from a district ' +
  'system, it is the supplier\'s energy, and this platform does not collect it. The refrigerants ' +
  'question in the GHG module is a different thing: gas that leaks from equipment you own.'

export const CAT3_3D_EXPORT_NOTE =
  'A footnote to that table adds that energy retailers "include any company selling excess power to ' +
  'the grid" (p. 39). This question does not ask about exporting your own generation, and ThemisIQ ' +
  'does not screen for it: the activity is energy you bought and sold on, and an export meter is not ' +
  'the record the calculation needs. If you export power, check whether activity D applies to you.'

/**
 * Why the category is not calculated once the answer is yes, shown on the panel, in the export and in
 * the coverage entry, in one wording.
 *
 * ⚠️ IT SAYS WHAT IS LOST, BECAUSE SOMETHING IS. The A, B and C figures ThemisIQ computed are correct
 * and they stay on screen; what they are not is a Category 3 total for a company that resells energy.
 * Table 3.2 of the same Guidance (p. 40) works the example: the utility's resold electricity is 94.5 t
 * CO2e against 0.5 t for the power it consumed itself. A category figure missing that is not a
 * conservative estimate, it is the wrong order of magnitude.
 */
export const CAT3_3D_WITHHELD =
  'This category is not calculated, because you have told us you buy energy and sell it on to end ' +
  'users. That is activity D of Category 3 in the GHG Protocol\'s Technical Guidance (table 3.1, ' +
  'p. 39), and it is priced from the quantities and source of the power you bought for resale (p. 47, ' +
  'formula 3.4 on p. 48), which is not in the GHG inventory this record reads. The upstream figures ' +
  'for the energy you consumed are shown below and are NOT in your Scope 3 total: a Category 3 figure ' +
  'that left resale out would understate the category, for a reseller usually by most of it. Enter ' +
  'your own Category 3 figure as known emissions if you have calculated one.'

/** On the workings card while the answer is yes: the lines are real, and they are not the category. */
export const CAT3_3D_LINES_NOT_IN_TOTAL =
  'These lines are the upstream emissions of the energy this company consumed. They are recorded here ' +
  'and are not in the Scope 3 total, because activity D of this category is not calculated.'

// ── THE SAVED FIGURE AGAINST THE INVENTORY AS IT STANDS ─────────────────────────────────────────

/**
 * What the staleness notice can say, and what it must not.
 *
 * ⚠️ IT NAMES THE ROWS AND NOT THE FIGURES. lib/scope3/cat3Fingerprint.ts stores a hash per (location,
 * stream), so a comparison knows WHICH rows changed, appeared or went; it stores no activity value, so
 * it cannot say what a figure was before or what it is now. The sentence says exactly that much.
 *
 * ⚠️ AND IT IS SHOWN ONLY WHEN A COMPARISON HAPPENED. A record with no stored fingerprint, or one whose
 * stored shape this version cannot read, produces no notice at all: "we cannot tell" is not "it changed",
 * and a notice that appears on every old record teaches people to close it without reading.
 */
export function cat3StaleNotice(change: Cat3FingerprintChange): string {
  const name = (r: { location: string; stream: string }) =>
    `${r.location} (${CAT3_STREAM_LABEL[r.stream as Cat3Stream] ?? r.stream})`
  const parts = [
    change.changed.length > 0 && `changed at ${list(change.changed.map(name))}`,
    change.added.length > 0 && `now also holds ${list(change.added.map(name))}`,
    change.removed.length > 0 && `no longer holds ${list(change.removed.map(name))}`,
  ].filter((x): x is string => typeof x === 'string')
  // ⚠️ A RENAME LOOKS EXACTLY LIKE A MOVE, AND THIS SENTENCE IS WHY IT IS NOT OVERCLAIMED. A row is
  // identified by its location NAME (the GHG module's workings rows carry no location id), so renaming
  // a site with the same meters on it reads here as one row leaving and another arriving. That shape
  // is indistinguishable from an actual move, so the notice names the possibility rather than asserting
  // the data went anywhere. It is added only when both lists are non-empty, which is the only shape a
  // rename can produce.
  const rename = change.added.length > 0 && change.removed.length > 0
    ? ' A location renamed in the GHG module reads the same way, as one row leaving and another ' +
      'arriving, because a row is identified here by its location name.'
    : ''
  return (
    `The GHG inventory this record is bound to has changed since this Category 3 figure was saved: it ` +
    `${list(parts)}. The figure on this page is calculated from the inventory as it stands now; the one ` +
    `stored in your saved record is the older one. Save again to store the current figure. What changed ` +
    `in each row is not recorded here, only that it did.${rename}`
  )
}

// ── THE BASIS: THE CSV'S METHOD CELL, AND THE SAVED factor_basis COLUMN ──────────────────────────

/** How many lines rest on a UK factor away from the UK, and where. Empty when none do. */
function standInSummary(r: Cat3Result): string {
  const standIns = r.lines.filter(l => l.flags.some(f => f.code === 'uk_stand_in'))
  if (standIns.length === 0) return ''
  const countries = [...new Set(standIns.map(l => {
    const f = l.flags.find(x => x.code === 'uk_stand_in') as Extract<Cat3Flag, { code: 'uk_stand_in' }>
    return f.country ?? 'a location whose country is not recorded'
  }))]
  return ` ${standIns.length} of ${r.lines.length} ${standIns.length === 1 ? 'line rests' : 'lines rest'} ` +
    `on a UK factor away from the UK (${list(countries)}), which the line says on its face.`
}

/** The New Zealand lines the GHG inventory priced itself, named because they are not DEFRA figures. */
function nzSummary(r: Cat3Result): string {
  const nz = r.lines.filter(l => l.flags.some(f => f.code === 'nz_mfe_3c'))
  return nz.length === 0 ? ''
    : ` ${nz.length} transmission and distribution ${nz.length === 1 ? 'line is' : 'lines are'} the GHG ` +
      `inventory's own New Zealand ${nz.length === 1 ? 'figure' : 'figures'} rather than a DEFRA one.`
}

/**
 * Everything read and not priced, so the basis states its own gaps.
 *
 * ⚠️ TWO CLAUSES, BECAUSE THEY ARE TWO DIFFERENT STATEMENTS. A market-based electricity row and a
 * refrigerant row are set aside BY THE METHOD, and reading "Not priced: the market-based row is not
 * used" invites the reader to count them as missing emissions. A stream with no factor, a location the
 * GHG inventory excluded or a fuel row that names no fuel IS a gap in the figure, and belongs under a
 * heading that says so.
 */
const DELIBERATE: readonly Cat3Skipped['code'][] = ['market_based_row_not_used', 'refrigerants_not_in_category']
function notPricedSummary(r: Cat3Result, inputs: Cat3InputsResult): string {
  const gaps = [
    ...r.unpriced.map(u => `${u.location}, ${CAT3_STREAM_LABEL[u.stream]}, ${cat3ReasonText(u.reason)}`),
    ...inputs.skipped.filter(s => !DELIBERATE.includes(s.code)).map(cat3SkippedText),
  ]
  const byDesign = inputs.skipped.filter(s => DELIBERATE.includes(s.code)).map(cat3SkippedText)
  return `${gaps.length ? ` Not priced: ${gaps.join('; ')}.` : ''}` +
    `${byDesign.length ? ` Not used, by method: ${byDesign.join('; ')}.` : ''}`
}

/**
 * The METHODOLOGY NOTE's basis and detail for Category 3, which is also the saved factor_basis line.
 *
 * ⚠️ IT DESCRIBES WHAT PRICED THIS RECORD'S FIGURE, NOT WHAT THE METHOD CAN DO. Five states, and each
 * says a different thing: an entered figure (no factor was applied, and the derived figure it replaced
 * is named); a priced figure (the source, how many lines, the stand-ins and the gaps); a calculated
 * zero (an answer, not an absence); a withheld one (the reason that withheld it, verbatim); and an
 * inventory that could not be read at all.
 *
 * ⚠️ THE OVERRIDE BRANCH NAMES THE FIGURE IT SUPERSEDES, as Category 15's does for its holdings: a
 * verifier comparing the export with the panel would otherwise see a number the panel can also compute
 * and no statement of which one is in the total.
 */
export function cat3Basis(
  r: Cat3Result | null, inputs: Cat3InputsResult, override: number | null | undefined,
  sellsEnergyOn?: boolean,
): { basis: string; detail: string } {
  if (override) {
    const derived = r && r.status !== 'withheld'
      ? ` The energy in the bound GHG inventory gives ${n4(r.kg_co2e / 1000)} mt CO2e; the entered figure is used instead.`
      : ''
    return {
      basis: 'Entered figure',
      detail: `${n2(override)} mt CO2e entered directly; no emission factor was applied.${derived}`,
    }
  }
  // ⚠️ AFTER THE ENTERED FIGURE, BEFORE EVERYTHING ELSE. A customer who resells energy and has
  // calculated their own Category 3 total keeps it: the override is their figure, and it may well
  // include activity D. Without one, the answer decides the category whatever the lines say.
  if (sellsEnergyOn) return { basis: 'Not priced', detail: CAT3_3D_WITHHELD }
  const noFigure = cat3NoFigureText(r, inputs)
  if (!r || noFigure) return { basis: 'Not priced', detail: noFigure ?? 'It was not priced, and no reason was recorded.' }
  if (r.status === 'zero') {
    return {
      basis: `${m.source}, upstream energy factors, on the bound GHG inventory`,
      detail: `${cat3ZeroText()}${notPricedSummary(r, inputs)}`,
    }
  }
  const locations = new Set(r.lines.map(l => l.location)).size
  return {
    basis: `${m.source}, upstream energy factors per line, on the bound GHG inventory`,
    detail:
      `${scope3MethodDescription('fuel_and_energy_upstream')} ${r.lines.length} ` +
      `${r.lines.length === 1 ? 'line' : 'lines'} priced at ${locations} ` +
      `${locations === 1 ? 'location' : 'locations'}, ${n2(r.kg_co2e)} kg CO2e in all.` +
      `${standInSummary(r)}${nzSummary(r)}${notPricedSummary(r, inputs)}`,
  }
}

// ── THE EXPORT ───────────────────────────────────────────────────────────────────────────────────

/**
 * Category 3's rows for the CSV, without the leading "Cat 3" cell, which the page adds: the same
 * [label, input as entered, note] triple Cats 5, 6, 7, 12 and 15 write.
 *
 * ⚠️ ONE ROW PER PRICED LINE, because that is the unit a verifier checks: an activity figure, a
 * published factor, the cell it came from and the product of the two. A category total with no lines
 * under it cannot be re-derived from the file, which is what the design's Q4 asks for.
 */
export function cat3CsvRows(
  r: Cat3Result | null, inputs: Cat3InputsResult, override: number | null | undefined, gwpSentence: string,
  sellsEnergyOn?: boolean,
): [string, string, string][] {
  const out: [string, string, string][] = []
  const basis = cat3Basis(r, inputs, override, sellsEnergyOn)
  out.push(['Basis', basis.basis, basis.detail])
  // ⚠️ THE ANSWER IS IN THE FILE WHATEVER IT IS. A verifier reading a Category 3 figure needs to know
  // the reseller question was asked and what was said, not only when the answer withheld the figure:
  // an unanswered screening question is a different record from one answered no.
  out.push(['Energy bought and sold on (activity D)',
    sellsEnergyOn === undefined ? 'Not answered' : sellsEnergyOn ? 'Yes' : 'No',
    sellsEnergyOn === undefined ? `${CAT3_3D_QUESTION} ${CAT3_3D_HELP}`
      : sellsEnergyOn ? CAT3_3D_WITHHELD
      : `${CAT3_3D_QUESTION} Answered no, so this category covers activities A, B and C only, which is complete for a company that does not resell energy.`])
  if (sellsEnergyOn && r) out.push(['Lines below', 'Recorded, not in the total', CAT3_3D_LINES_NOT_IN_TOTAL])
  if (!r) return out

  for (const l of r.lines) {
    // ⚠️ THE 3c LINE NAMES ITS OWN SOURCE. A New Zealand transmission line is the GHG engine's own
    // figure on the New Zealand factor, not a DEFRA product, and the label must not let it read as one.
    const nz = l.flags.find(f => f.code === 'nz_mfe_3c') as Extract<Cat3Flag, { code: 'nz_mfe_3c' }> | undefined
    const label = `${l.location}, ${CAT3_STREAM_LABEL[l.stream]}, ${CAT3_LINE_LABEL[l.line]}`
    const entered = `${nAct(l.activity_as_entered)} ${l.unit_as_entered}`
    const arithmetic = nz
      ? `${n2(l.kg_co2e)} kg CO2e, taken from the GHG inventory's own New Zealand transmission and ` +
        `distribution figure (${nz.source}). No DEFRA factor was applied to this line.`
      : `${l.conversion ? `Converted to ${l.conversion.to} at ${nFac(l.conversion.factor)} ` +
          `(${l.conversion.source === 'defra' ? l.conversion.cite : `an exact identity, ${l.conversion.cite}`})` +
          ` = ${nAct(l.activity_priced)} ${l.unit_priced}. ` : ''}` +
        `${nAct(l.activity_priced)} ${l.unit_priced} x ${nFac(l.factor!.kg_co2e)} kg CO2e per ` +
        `${l.factor!.unit} (${l.factor!.sheet} ${l.factor!.cell}) = ${n2(l.kg_co2e)} kg CO2e.`
    const flags = cat3FlagStatements(l.flags.filter(f => f.code !== 'nz_mfe_3c'))
    out.push([label, entered,
      `${arithmetic}${flags.length ? ` ${flags.map(t => endSentence(`${t.charAt(0).toUpperCase()}${t.slice(1)}`)).join(' ')}` : ''}`])
  }
  if (r.status === 'priced' && r.lines.length === 0) out.push(['Lines', '', 'None priced.'])
  for (const u of r.unpriced) {
    const why = cat3ReasonText(u.reason)
    out.push([`${u.location}, ${CAT3_STREAM_LABEL[u.stream]}`, 'Not priced', endSentence(`${why.charAt(0).toUpperCase()}${why.slice(1)}`)])
  }
  for (const s of inputs.skipped) {
    const t = cat3SkippedText(s)
    out.push(['Row not used', '', endSentence(`${t.charAt(0).toUpperCase()}${t.slice(1)}`)])
  }
  out.push(['GWP basis', m.gwp_basis, gwpSentence])
  // ⚠️ THE GWP SENTENCE HAS ITS OWN ROW ABOVE, so it comes out of the disclosure list here: printed
  // twice in one export it reads as two different statements that happen to match, and a verifier
  // checking whether the bases agree should find one answer, not two copies of one.
  for (const d of cat3MethodSentences(r, gwpSentence)) if (d !== gwpSentence) out.push(['Disclosure', d, ''])
  return out
}

/**
 * What the category's own notice says when there is no figure: the reason the inventory could not be
 * read, or the reason a figure was withheld. null when there IS a figure (including a calculated zero).
 */
export function cat3NoFigureText(r: Cat3Result | null, inputs: Cat3InputsResult): string | null {
  if (inputs.reason) return cat3InputsReasonText(inputs.reason)
  if (!r) return null
  if (r.withheld) return cat3WithheldText(r.withheld, inputs.undeclared_detail)
  return null
}
