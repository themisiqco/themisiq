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
import type {
  Cat3Flag, Cat3LineKind, Cat3PricedLine, Cat3Reason, Cat3Result, Cat3Stream, Cat3Unpriced, Cat3Withheld,
} from './cat3Energy'
import type { Cat3InputsReason, Cat3InputsResult, Cat3Skipped } from './cat3Inputs'

const m = DEFRA_ENERGY_META
const g = m.guidance

/** A guidance quote's sheet and cell, e.g. "WTT- UK electricity A16". Throws if the artefact drops it. */
const cite = (key: string): string => {
  const q = g[key]
  if (!q) throw new Error(`cat3Copy: the artefact has no guidance quote "${key}"`)
  return `${q.sheet} ${q.cell}`
}

const n2 = (x: number) => x.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** The category total in tonnes, at four places: the figure a customer quotes, and the card above it
 *  rounds to two. Rounding both to two would make the panel's own arithmetic look wrong on a small
 *  category. */
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

export const CAT3_GWP_SENTENCE =
  `The factors are on an ${m.gwp_basis} basis: their publisher combined the gases using IPCC ` +
  `${m.gwp_basis} 100 year global warming potentials (${cite('gwp_basis')}). Your GHG inventory may be on ` +
  `another basis, and this line says so rather than assuming the two agree.`

export const CAT3_STAND_IN_SENTENCE =
  `These are UK factors, and DEFRA no longer publishes overseas electricity, transmission and ` +
  `distribution or well-to-tank factors (${cite('overseas_factors_withdrawn')}, ` +
  `${cite('overseas_td_withdrawn')} and ${cite('overseas_wtt_withdrawn')}). Every line priced from them ` +
  `at a location outside the UK is flagged as a stand-in, fuels included.`

export const CAT3_CV_BASIS_SENTENCE =
  `A natural gas figure in therms, million Btu or kWh is priced on the gross calorific value factor, ` +
  `because the workbook asks for the same basis on both sides of the entry (${cite('cv_basis_match_scope1')}, ` +
  `${cite('cv_gross_typical')}) and the Scope 1 side of that figure is priced on the US EPA's higher ` +
  `heating values. That those two bases are interchangeable is not stated by either publisher, and this ` +
  `sentence is here instead of the assumption.`

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
    ? ` ${statements.map(t => `${t.charAt(0).toUpperCase()}${t.slice(1)}`).join('. ')}.`
    : ''
  return `${head}: ${entered}${priced} = ${n2(l.kg_co2e)} kg CO2e.${flags}`
}

/** One row that was not priced, in the same voice. */
export function cat3UnpricedText(u: Cat3Unpriced): string {
  return `${u.location}, ${CAT3_STREAM_LABEL[u.stream]}: not priced, ${cat3ReasonText(u.reason)}.`
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
export function cat3Sentences(r: Cat3Result, inputs: Cat3InputsResult): string[] {
  const out: string[] = [
    CAT3_SOURCE_SENTENCE,
    CAT3_ATTRIBUTION,
    CAT3_LICENCE_LINE,
    CAT3_DERIVED_SENTENCE,
    CAT3_EXCLUDES_COMBUSTION_SENTENCE,
    CAT3_SEPARATE_LINES_SENTENCE,
    CAT3_LOCATION_BASED_SENTENCE,
    CAT3_GWP_SENTENCE,
    CAT3_STAND_IN_SENTENCE,
  ]
  // Only where a gross CV factor actually priced something: a sentence about a conversion nobody's
  // figures went through is noise, and noise is what stops the rest being read.
  if (r.lines.some(l => l.factor?.key === 'natural_gas_kwh_gross_cv')) out.push(CAT3_CV_BASIS_SENTENCE)
  if (r.status === 'priced') {
    out.push(`${n2(r.kg_co2e)} kg CO2e in all, which is ${n4(r.kg_co2e / 1000)} t CO2e.`)
    for (const l of r.lines) out.push(cat3LineText(l))
  }
  if (r.status === 'zero') out.push(cat3ZeroText())
  if (r.withheld) out.push(cat3WithheldText(r.withheld, inputs.undeclared_detail))
  for (const u of r.unpriced) out.push(cat3UnpricedText(u))
  for (const s of inputs.skipped) out.push(`${cat3SkippedText(s).charAt(0).toUpperCase()}${cat3SkippedText(s).slice(1)}.`)
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
