// lib/ghg/factorEditionRegistry.ts
//
// T3c diff 1: THE FACTOR EDITION REGISTRY AND selectEdition. Pure: no React, no Supabase, and nothing in the engine
// reads it yet (the engine diff wires it). Rulings: docs/review/factor-year-selection.md section 8 (8.1 to 8.7) and
// docs/review/design-derived-figures.md section 10 (R17 to R19).
//
// ONE ENTRY PER EDITION of every year-keyed dataset. `held` is true only where the values are in the code today; an
// edition in ~/themisiq-sources that is not loaded yet is `held: false` with `sourceFile` set (T3d loads it).
//
// DATES. Each publication or correction date is taken from the document itself where it prints one, and quoted in
// `source`; otherwise from the publisher's page named in `source`. A date may be a day ("2025-01-15") or, where the
// document prints only a month ("August 2025"), a month ("2025-08"), which is read as the LAST day of that month, so
// an edition is never treated as available earlier than it was. A year alone is not a date.
//   R20 (8 Oct 2026): where the publisher prints no publication date, `published.onOrBefore` records the EARLIEST date
// the edition is PROVEN to have been published, with its evidence, in this order: a date printed in the edition or its
// correction; the publisher's page; a dated publication from the same publisher that cites it; the date ThemisIQ first
// held it (git history). Never a guessed date. selectEdition treats it like a published date.
//   An entry with neither is NEVER selected (ruling of 1 Oct 2026); DATE_NEEDED lists them.
//
// THE RULES (selectEdition):
//   class (a), DESNZ (8.1, D1, D3): calendar year Y; April to March, the majority year (DESNZ's own approach); July
//     to June, the newest edition first published on or before the window's last day; any other year end, majority.
//   class (a), others: the majority calendar year, ties to the year the window ends. NGA counts its activity years,
//     1 July N to 30 June N+1 (8.2, confirmed 8.6).
//   class (b): an edition whose data year is the window's majority year (8.6), else the newest published on or before
//     the preparation date; a frozen selection is returned unchanged.
//   exempt (8.6, R17, R18): fixed defaults, never missing.
//   R19: a required edition not yet published prices with the newest published edition, provisionally, and says so.
//   D2: values come from the edition's latest correction; the correction the held values reflect is recorded.
// The steam estimate (R14) has no edition of its own: it uses whatever edition its gas factor used (R17).

import { reportingYearLabel } from './reportingYear'
import { dateInWords } from './dateWords'
import { EPA_EGRID_DETAILED_DATA_URL, EPA_EGRID_HISTORICAL_URL, EEA_GRID_INTENSITY_URL, EEA_GRID_INTENSITY_2024_URL, EPA_GHG_HUB_URL, GREENE_RESIDUAL_MIX_URL } from '../sources'

export type EditionClass = 'a' | 'b' | 'exempt'
export type DatasetRule = 'desnz' | 'majority' | 'nga_activity_year' | 'data_year' | 'exempt'
export type SelectionRule =
  | 'desnz_calendar' | 'desnz_april_march' | 'desnz_july_june' | 'desnz_majority_fallback'
  | 'majority' | 'nga_activity_year' | 'data_year_match' | 'data_year_newest' | 'frozen' | 'exempt'

export type DatasetId =
  | 'desnz_grid' | 'desnz_combustion' | 'desnz_steam' | 'desnz_mobile' | 'desnz_scope3_energy' | 'desnz_travel' | 'desnz_waste'
  | 'epa_hub_combustion' | 'epa_hub_steam' | 'epa_hub_mobile'
  | 'nga_grid' | 'nga_residual' | 'nga_combustion' | 'nga_mobile' | 'nga_scope3'
  | 'mfe_combustion' | 'mfe_mobile' | 'eccc_combustion'
  | 'egrid' | 'greene' | 'aib' | 'eea_grid' | 'eccc_grid' | 'mfe_grid' | 'mfe_td' | 'eccc_mobile' | 'eccc_ng_heat'
  | 'ipcc2006' | 'eu_mrr' | 'jec_wtt' | 'exiobase'

export interface DatasetMeta {
  /** The publisher as a sentence names it: "DESNZ", "US EPA". */
  publisher: string
  /** What the factors are for, in words: "grid electricity". */
  family: string
  class: EditionClass
  rule: DatasetRule
  /** The label of an edition year not in the registry: "DESNZ 2021". */
  short: string
  /** R18: registered now, selection wired in a later task; until then today's behaviour stands. */
  selectionWiredIn?: 'T3c' | 'T3e'
  note?: string
}

export const DATASETS: Readonly<Record<DatasetId, DatasetMeta>> = {
  desnz_grid: { publisher: 'DESNZ', family: 'grid electricity', class: 'a', rule: 'desnz', short: 'DEFRA' },
  desnz_combustion: { publisher: 'DESNZ', family: 'fuel combustion', class: 'a', rule: 'desnz', short: 'DEFRA' },
  desnz_steam: { publisher: 'DESNZ', family: 'heat and steam', class: 'a', rule: 'desnz', short: 'DEFRA' },
  desnz_mobile: { publisher: 'DESNZ', family: 'vehicle fuel', class: 'a', rule: 'desnz', short: 'DEFRA', note: 'R17: the Fuels rows DESNZ states apply to vehicles (FI9).' },
  desnz_scope3_energy: { publisher: 'DESNZ', family: 'well-to-tank and transmission and distribution', class: 'a', rule: 'desnz', short: 'DEFRA', note: 'R17, R18: Category 3 energy, selected with the DESNZ rule beside the GHG factor.' },
  desnz_travel: { publisher: 'DESNZ', family: 'business travel', class: 'a', rule: 'desnz', short: 'DEFRA', selectionWiredIn: 'T3e', note: 'R18: registered now; selection wired in T3e, after T3d loads the older editions. T3e MUST LOAD DEFRA 2023, 2024 AND 2025 for this dataset before wiring selection (T3d 2026, Lisa, 8 Oct 2026): a year ending March 2026 needs DEFRA 2025, and reporting years 2024 and 2025 need 2023 and 2024 (their March and June year ends). Only 2026 is held.' },
  desnz_waste: { publisher: 'DESNZ', family: 'waste disposal', class: 'a', rule: 'desnz', short: 'DEFRA', selectionWiredIn: 'T3e', note: 'R18: registered now; selection wired in T3e, after T3d loads the older editions. T3e MUST LOAD DEFRA 2023, 2024 AND 2025 for this dataset before wiring selection (T3d 2026, Lisa, 8 Oct 2026): a year ending March 2026 needs DEFRA 2025, and reporting years 2024 and 2025 need 2023 and 2024 (their March and June year ends). Only 2026 is held.' },
  epa_hub_combustion: { publisher: 'US EPA', family: 'combustion', class: 'a', rule: 'majority', short: 'US EPA', note: 'H1 (8.5): Hub edition N is read as intended for activity year N; EPA does not state it.' },
  epa_hub_steam: { publisher: 'US EPA', family: 'steam and heat', class: 'a', rule: 'majority', short: 'US EPA' },
  epa_hub_mobile: { publisher: 'US EPA', family: 'vehicle fuel', class: 'a', rule: 'majority', short: 'US EPA', note: 'R17: Tables 2 to 5.' },
  nga_grid: { publisher: 'NGA', family: 'grid electricity', class: 'a', rule: 'nga_activity_year', short: 'DCCEEW NGA' },
  nga_residual: { publisher: 'NGA', family: 'residual mix', class: 'a', rule: 'nga_activity_year', short: 'DCCEEW NGA' },
  nga_combustion: { publisher: 'NGA', family: 'fuel combustion', class: 'a', rule: 'nga_activity_year', short: 'DCCEEW NGA' },
  nga_mobile: { publisher: 'NGA', family: 'vehicle fuel', class: 'a', rule: 'nga_activity_year', short: 'DCCEEW NGA', note: 'R17: Table 9 and the Table 8 non-road rows.' },
  nga_scope3: { publisher: 'NGA', family: 'Scope 3 energy', class: 'a', rule: 'nga_activity_year', short: 'DCCEEW NGA', note: 'R17, R18: Tables 1 and 6 (FI6).' },
  mfe_combustion: { publisher: 'MfE', family: 'fuel combustion', class: 'a', rule: 'majority', short: 'MfE' },
  mfe_mobile: { publisher: 'MfE', family: 'vehicle fuel', class: 'a', rule: 'majority', short: 'MfE', note: 'R17: Transport Fuel.' },
  eccc_combustion: { publisher: 'ECCC', family: 'fuel combustion', class: 'a', rule: 'majority', short: 'ECCC', note: '8.3: class (a), majority on the applicability year each table states.' },
  egrid: { publisher: 'eGRID', family: 'grid electricity', class: 'b', rule: 'data_year', short: 'eGRID' },
  greene: { publisher: 'Green-e', family: 'residual mix', class: 'b', rule: 'data_year', short: 'Green-e', note: '8.1 ruling 6: keyed by data year.' },
  aib: { publisher: 'AIB', family: 'residual mix', class: 'b', rule: 'data_year', short: 'AIB' },
  eea_grid: { publisher: 'EEA', family: 'grid electricity', class: 'b', rule: 'data_year', short: 'EEA' },
  eccc_grid: { publisher: 'ECCC', family: 'grid electricity', class: 'b', rule: 'data_year', short: 'ECCC',
    note: 'Keyed by DATA YEAR from v4.0 Tables 5.1 to 5.4 and their footnotes. ECCC says each table "must be used for" a later calendar year (5.1: 2023 and 2024; 5.2: 2025; 5.3: 2026; 5.4: 2027), a rule written for the offset system (v4.0 s 3.2); class (b) applies instead (ruling 8.1, C1).' },
  mfe_grid: { publisher: 'MfE', family: 'grid electricity', class: 'b', rule: 'data_year', short: 'MfE', note: '8.3: class (b), keyed by the year of the series row.' },
  mfe_td: { publisher: 'MfE', family: 'transmission and distribution losses', class: 'b', rule: 'data_year', short: 'MfE', note: '8.3: class (b), keyed by the year of the series row.' },
  eccc_mobile: { publisher: 'ECCC', family: 'vehicle fuel', class: 'b', rule: 'data_year', short: 'ECCC NIR', note: 'R17: NIR Table A6.1-15.' },
  eccc_ng_heat: { publisher: 'ECCC', family: 'natural gas heat content', class: 'b', rule: 'data_year', short: 'ECCC NIR', note: 'R17: NIR Table A4-2 (R12).' },
  ipcc2006: { publisher: 'IPCC', family: '2006 Guidelines defaults', class: 'exempt', rule: 'exempt', short: 'IPCC 2006', note: 'R17: stationary and mobile.' },
  eu_mrr: { publisher: 'EU', family: 'MRR Annex VI defaults', class: 'exempt', rule: 'exempt', short: 'EU MRR' },
  jec_wtt: { publisher: 'JEC', family: 'Well-to-Tank densities', class: 'exempt', rule: 'exempt', short: 'JEC WTT v5' },
  exiobase: { publisher: 'EXIOBASE', family: 'spend factors', class: 'exempt', rule: 'exempt', short: 'EXIOBASE', note: 'R18: a fixed model edition at 2019 prices; T3b discloses the price year.' },
}

export interface DatedSource {
  /** "yyyy-mm-dd", or "yyyy-mm" where the document prints only a month (read as that month's last day). Absent: not known. */
  date?: string
  /** Where the date is printed (document and page, sheet and cell) or the page URL it was read from. */
  source: string
  /** R20: no publication date printed; the earliest date the edition is proven to have been published by. */
  onOrBefore?: { date: string; evidence: OnOrBeforeEvidence }
  /** Set where a date is recorded but not yet verified verbatim. */
  unverified?: true
}
/** R20's order of evidence, strongest first. */
export const ON_OR_BEFORE_EVIDENCE = ['printed', 'publisher_page', 'cited_by_publisher', 'first_held'] as const
export type OnOrBeforeEvidence = typeof ON_OR_BEFORE_EVIDENCE[number]
export interface Correction {
  date: string; source: string; note: string
  /** False where the correction revised a different file of the edition, not the one the held values come from
   *  (DESNZ: the flat file). Such a correction never makes the held values stale. */
  affectsHeldValues?: false
}

export interface FactorEditionEntry {
  dataset: DatasetId
  /** The edition as the engine labels it: "DESNZ 2025", "eGRID2023". */
  label: string
  class: EditionClass
  /** Class (a): the year the edition is for (DESNZ 2025, NGA 2025: activity year 2025-26). */
  editionYear?: number
  /** Class (b): the year the data describe. */
  dataYear?: number
  /** NGA: the activity period edition N covers. */
  activityPeriod?: { start: string; end: string }
  published: DatedSource
  corrections: Correction[]
  held: boolean
  /** The correction date the held values reflect; absent where they reflect the original publication; 'unknown' where
   *  the record does not say which version was transcribed. */
  heldCorrection?: string
  /** The file in ~/themisiq-sources the values come from (held) or will come from (T3d). */
  sourceFile?: string
  note?: string
}

// ── THE FILES IN ~/themisiq-sources THE REGISTRY NAMES (the build machine has no copy; the test checks against this) ──
export const SOURCE_FILES: readonly string[] = [
  'defra/ghg-conversion-factors-2023-full-file-update.xlsx',
  'defra/ghg-conversion-factors-2024-full_set__for_advanced_users__v1_1.xlsx',
  'defra/ghg-conversion-factors-2025-full-set.xlsx',
  'defra/ghg-conversion-factors-2026-full-set.xlsx',
  'defra/ghg-conversion-factors-2026-flat-format-revised.xlsx',
  'epa/ghg-emission-factors-hub-2023.xlsx', 'epa/ghg-emission-factors-hub-2023.pdf',
  'epa/ghg-emission-factors-hub-2024.xlsx', 'epa/ghg-emission-factors-hub-2024.pdf',
  'epa/ghg-emission-factors-hub-2025.xlsx', 'epa/ghg-emission-factors-hub-2025.pdf',
  'nga/national-greenhouse-account-factors-2023.pdf', 'nga/national-greenhouse-account-factors-2024.pdf',
  'nga/national-greenhouse-account-factors-2025.pdf', 'nga/national-greenhouse-account-factors-2025.xlsx',
  'nga/national-greenhouse-accounts-factors-2026.pdf', 'nga/national-greenhouse-accounts-factors-2026.xlsx',
  'mfe/Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx',
  'mfe/Measuring_Emissions_Flat_EmissionFactors_2024.xlsx',
  'mfe/EmissionFactors_2025_v3.xlsx',
  'mfe/NZ_emission_factors_2026_v2.xlsx',
  'mfe/emission_factors_2026_v2.xlsx',
  'eccc/En84-294-2025-eng.pdf', 'eccc/En84-294-2026-eng.pdf',
  'eccc/2025NIR%20-%20Part%202.pdf', 'eccc/NIR-1990-2024-2026-edition.pdf',
  'eccc/NIR-1990-2024-2026-Annex7-Electricity-Intensity.xlsx', 'eccc/NIR-1990-2024-2026-Annex7-Electricity-Intensity.pdf',
  'aib/AIB-2023-residual-mix-final-results-v1.0.pdf', 'aib/AIB-2023-residual-mix-results.xlsx',
  'aib/AIB-2024-residual-mix-final-results-v1.1-11082025.pdf', 'aib/AIB-2024-residual-mix-results-30052025.xlsx',
  'aib/AIB-2025-residual-mix-final-results-26052026.pdf', 'aib/AIB-2025-residual-mix-results-25052026.xlsx',
  'eea/EEA-ghg-intensity-electricity-generation-country-level.csv',
  'eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv',
  'ipcc/V2_2_Ch2_Stationary_Combustion.pdf', 'ipcc/V2_3_Ch3_Mobile_Combustion.pdf',
  'eu/CELEX_02018R2066-20250527_EN_TXT.pdf', 'jrc/JRC119036_01.pdf',
]

// ── DESNZ: five editions, the same dates for every DESNZ dataset ─────────────────────────────────────────────────
// None of the full sets prints a publication date (each prints only "Next publication date", Version and Year), so
// first publication is the GOV.UK page's first_published_at, as recorded in factor-year-selection.md section 4.1 (D1).
const GOVUK = (y: number) => `https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-${y}`
const DESNZ_EDITIONS: { year: number; published: string; corrections: Correction[]; sourceFile?: string; heldCorrection?: string }[] = [
  { year: 2022, published: '2022-06-22', corrections: [{ date: '2022-09-20', source: `${GOVUK(2022)} (change history)`, note: 'Flat file heading corrected.', affectsHeldValues: false }] },
  // T3d 2024: the held 2023 values are read from the v1.1 "update" file, so they reflect the 28 Jun 2023 update.
  { year: 2023, published: '2023-06-07', sourceFile: 'defra/ghg-conversion-factors-2023-full-file-update.xlsx', heldCorrection: '2023-06-28',
    corrections: [{ date: '2023-06-28', source: `${GOVUK(2023)} (change history); the file prints Introduction B6 "Version: 1.1"`, note: 'A small number of factors updated (Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5).' }] },
  // T3d: the held 2024 values are read from the v1.1 file, so they reflect the 30 Oct 2024 correction.
  { year: 2024, published: '2024-07-08', sourceFile: 'defra/ghg-conversion-factors-2024-full_set__for_advanced_users__v1_1.xlsx', heldCorrection: '2024-10-30',
    corrections: [{ date: '2024-10-30', source: `${GOVUK(2024)} (change history); the file prints Introduction B6 "Version: 1.1"`, note: 'Rounding error that reduced some diesel factors to zero corrected.' }] },
  { year: 2025, published: '2025-06-10', corrections: [], sourceFile: 'defra/ghg-conversion-factors-2025-full-set.xlsx' },
  { year: 2026, published: '2026-06-11', sourceFile: 'defra/ghg-conversion-factors-2026-full-set.xlsx',
    corrections: [{ date: '2026-07-31', source: `${GOVUK(2026)} (change history): "Updated the conversion factors 2026: flat file to correct a number of values that were initially reported as 0"; the flat file itself prints "Updated:" 10 Jul 2026 (Version 1.2)`,
      note: 'Flat file only: values with no data were reported as 0 rather than left blank. The full set "has not been revised"; its blanks were already correct, so the held full-set values are current.',
      affectsHeldValues: false }] },
]
const desnz = (dataset: DatasetId, heldYears: number[]): FactorEditionEntry[] => DESNZ_EDITIONS.map(e => ({
  // Labelled as the engine and stored factor_editions have always named them (DEFRA/DESNZ publishes as "DEFRA").
  dataset, label: `DEFRA ${e.year}`, class: 'a', editionYear: e.year,
  published: { date: e.published, source: `${GOVUK(e.year)}, first_published_at (factor-year-selection.md s 4.1)` },
  corrections: e.corrections, held: heldYears.includes(e.year),
  ...(heldYears.includes(e.year) && e.heldCorrection ? { heldCorrection: e.heldCorrection } : {}),
  ...(e.sourceFile ? { sourceFile: e.sourceFile } : {}),
}))

// ── US EPA GHG Emission Factors Hub: the only printed date is "Last Modified" (PDF p1) ────────────────────────────
const EPA_EDITIONS: { year: number; date: string; quote: string; note?: string }[] = [
  { year: 2023, date: '2023-09-12', quote: 'epa/ghg-emission-factors-hub-2023.pdf p1 "Last Modified: 12 September 2023"' },
  { year: 2024, date: '2024-06-05', quote: 'epa/ghg-emission-factors-hub-2024.pdf p1 "Last Modified: June 5, 2024"',
    note: 'The file notes updates "from the original release of the 2024 version"; the original release date is not printed.' },
  { year: 2025, date: '2025-01-15', quote: 'epa/ghg-emission-factors-hub-2025.pdf p1 "Last Modified: January 15, 2025"' },
]
const epa = (dataset: DatasetId, heldYears: number[], heldNote?: string, labelSuffix = ''): FactorEditionEntry[] => EPA_EDITIONS.map(e => ({
  dataset, label: `US EPA ${e.year}${labelSuffix}`, class: 'a', editionYear: e.year,
  published: { date: e.date, source: e.quote }, corrections: [], held: heldYears.includes(e.year),
  sourceFile: `epa/ghg-emission-factors-hub-${e.year}.xlsx`,
  ...(e.note || (heldNote && e.year === 2025) ? { note: [e.note, e.year === 2025 ? heldNote : undefined].filter(Boolean).join(' ') } : {}),
}))

// ── NGA: each edition prints only a month ("Canberra, August"); activity year 1 July N to 30 June N+1 (8.2) ───────
const NGA_EDITIONS: { year: number; date: string; quote: string; sourceFile: string }[] = [
  { year: 2023, date: '2023-08', quote: 'nga/national-greenhouse-account-factors-2023.pdf cover "August 2023"', sourceFile: 'nga/national-greenhouse-account-factors-2023.pdf' },
  { year: 2024, date: '2024-08', quote: 'nga/national-greenhouse-account-factors-2024.pdf p2 "DCCEEW 2024, ... Canberra, August."', sourceFile: 'nga/national-greenhouse-account-factors-2024.pdf' },
  { year: 2025, date: '2025-08', quote: 'nga/national-greenhouse-account-factors-2025.pdf p2 "DCCEEW 2025, ... Canberra, August."', sourceFile: 'nga/national-greenhouse-account-factors-2025.xlsx' },
  { year: 2026, date: '2026-08', quote: 'nga/national-greenhouse-accounts-factors-2026.pdf p2 "DCCEEW 2026, ... Canberra, August." (the file itself was created October 2026)', sourceFile: 'nga/national-greenhouse-accounts-factors-2026.xlsx' },
]
const nga = (dataset: DatasetId, heldYears: number[]): FactorEditionEntry[] => NGA_EDITIONS.map(e => ({
  dataset, label: `DCCEEW NGA ${e.year}`, class: 'a', editionYear: e.year,
  activityPeriod: { start: `${e.year}-07-01`, end: `${e.year + 1}-06-30` },
  published: { date: e.date, source: e.quote }, corrections: [], held: heldYears.includes(e.year), sourceFile: e.sourceFile,
}))

// ── MfE: dates from the guide's download page (Lisa's reviewer), except where the workbook prints one ────────────
const MFE_PAGE = 'https://measuringemissionsguide.environment.govt.nz/files_download.html'
const MFE_EDITIONS: { year: number; label: string; published: DatedSource; corrections: Correction[]; sourceFile: string; heldCorrection?: string; note?: string }[] = [
  { year: 2023, label: 'MfE 2023', published: { date: '2023-08-01', source: `${MFE_PAGE} (2023.1)` }, corrections: [],
    sourceFile: 'mfe/Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx' },
  { year: 2024, label: 'MfE 2024', published: { date: '2024-07-29', source: `${MFE_PAGE} (2024.1)` }, corrections: [],
    sourceFile: 'mfe/Measuring_Emissions_Flat_EmissionFactors_2024.xlsx' },
  { year: 2025, label: 'MfE 2025 v3', published: { date: '2026-02-24', source: 'mfe/EmissionFactors_2025_v3.xlsx, README A11/B11 "Release date" "2026-02-24" (release 2025.3)' },
    corrections: [], sourceFile: 'mfe/EmissionFactors_2025_v3.xlsx',
    note: `The guide's download page (${MFE_PAGE}) lists 2025.3 as 1 February 2025; the workbook's printed release date is used.` },
  { year: 2026, label: 'MfE 2026 v2', published: { date: '2026-05-26', source: `${MFE_PAGE} (2026.1)` },
    corrections: [{ date: '2026-05-29', source: 'mfe/emission_factors_2026_v2.xlsx, README A10/B10 "Published date" "2026-05-29" (release 2026.2)', note: 'Release 2026.2: DOCf applied twice in non-municipal waste factors corrected.' }],
    heldCorrection: '2026-05-29', sourceFile: 'mfe/emission_factors_2026_v2.xlsx',
    note: 'MfE\'s untouched copy. Identical cell for cell to NZ_emission_factors_2026_v2.xlsx, the copy the values were transcribed from, which was re-saved locally on 2026-07-11.' },
]
const mfe = (dataset: DatasetId, heldYears: number[]): FactorEditionEntry[] => MFE_EDITIONS.map(e => ({
  dataset, label: e.label, class: 'a', editionYear: e.year, published: e.published, corrections: e.corrections,
  held: heldYears.includes(e.year), sourceFile: e.sourceFile,
  ...(heldYears.includes(e.year) && e.heldCorrection ? { heldCorrection: e.heldCorrection } : {}),
  ...(e.note ? { note: e.note } : {}),
}))
/** MfE class (b) series rows (grid, T&D): each row year is an entry, from the 2026 v2 workbook. */
const mfeRow = (dataset: DatasetId, dataYear: number, held: boolean, note?: string): FactorEditionEntry => ({
  dataset, label: `MfE 2026 v2 (${dataYear} row)`, class: 'b', dataYear,
  published: MFE_EDITIONS[3].published, corrections: MFE_EDITIONS[3].corrections, held,
  ...(held ? { heldCorrection: '2026-05-29' } : {}), sourceFile: 'mfe/emission_factors_2026_v2.xlsx', ...(note ? { note } : {}),
})

// ── ECCC Emission factors and reference values: revision history, v4.0 p iii ─────────────────────────────────────
const ECCC_V = {
  '1.1': { date: '2023-06-13', source: 'eccc/En84-294-2026-eng.pdf p iii, revision history "1.1 June 13, 2023"' },
  '2.0': { date: '2024-05-06', source: 'eccc/En84-294-2026-eng.pdf p iii, revision history "2.0 May 6, 2024"' },
  '3.0': { date: '2025-10-24', source: 'eccc/En84-294-2025-eng.pdf p iii, revision history "3.0 October 24, 2025"' },
  '4.0': { date: '2026-09-09', source: 'eccc/En84-294-2026-eng.pdf p iii, revision history "4.0 September 9, 2026"' },
} as const

const CLASS_B_NOT_SELECTED = 'Never selected until a publication date is recorded.'

export const FACTOR_EDITION_REGISTRY: readonly FactorEditionEntry[] = [
  // DESNZ (class (a), DESNZ rule). Held: 2023 to 2026 for grid, combustion, steam, mobile and Scope 3 energy (T3d: the
  // 2023 to 2025 values are in lib/ghg/factors/desnz-{2023,2024,2025}.ts, mobile/defra{2023,2024,2025}.ts and
  // defraEnergy{2023,2024,2025}.json). Travel and waste stay at 2026 until T3e.
  ...desnz('desnz_grid', [2023, 2024, 2025, 2026]),
  ...desnz('desnz_combustion', [2023, 2024, 2025, 2026]),
  ...desnz('desnz_steam', [2023, 2024, 2025, 2026]),
  ...desnz('desnz_mobile', [2023, 2024, 2025, 2026]),
  ...desnz('desnz_scope3_energy', [2023, 2024, 2025, 2026]),
  ...desnz('desnz_travel', [2026]),
  ...desnz('desnz_waste', [2026]),
  // US EPA Hub (class (a), majority). Held 2023 and 2024 (T3d: lib/ghg/factors/epa-{2023,2024}.ts, mobile/epa{2023,2024}.ts)
  // and 2025.
  ...epa('epa_hub_combustion', [2023, 2024, 2025], 'Held values were read from the 2025 workbook. The engine labelled them "US EPA 2024" until T3c, which reads this registry and labels them US EPA 2025.'),
  ...epa('epa_hub_steam', [2023, 2024, 2025], undefined, ' Table 7'),   // labelled as the engine has always named the steam table
  ...epa('epa_hub_mobile', [2023, 2024, 2025]),
  // NGA (class (a), activity years). Held 2023 to 2026 (T3d: lib/ghg/factors/nga-{2023,2024,2026}.ts,
  // mobile/nga{2023,2024,2026}.ts, ngaScope3_2025.ts '2023', '2024' and '2026'; 2025 as before).
  ...nga('nga_grid', [2023, 2024, 2025, 2026]),
  ...nga('nga_residual', [2023, 2024, 2025, 2026]),
  ...nga('nga_combustion', [2023, 2024, 2025, 2026]),
  ...nga('nga_mobile', [2023, 2024, 2025, 2026]),
  ...nga('nga_scope3', [2023, 2024, 2025, 2026]),
  // MfE (class (a), majority). Held 2023 (T3d 2024: lib/ghg/factors/mfe-2023.ts, mobile/mfe2023.ts), 2024 and 2025 v3 (T3d: lib/ghg/factors/mfe-2024.ts and -2025.ts, mobile/mfe2024.ts and
  // -2025.ts) and 2026 v2.
  ...mfe('mfe_combustion', [2023, 2024, 2025, 2026]),
  ...mfe('mfe_mobile', [2023, 2024, 2025, 2026]),
  // ECCC combustion (class (a), majority on applicability year). v3.0 values are held; they are identical across the
  // 2023/24, 2025 and 2026 sets (engine.ts EF_CA header). v4.0 adds 2027.
  ...[2023, 2024, 2025, 2026].map((y): FactorEditionEntry => ({
    // Labelled as the engine and stored factor_editions name the table; the applicability set is the entry's year.
    dataset: 'eccc_combustion', label: 'ECCC 2025 v3.0', class: 'a', editionYear: y,
    published: { date: ECCC_V['3.0'].date, source: ECCC_V['3.0'].source }, corrections: [], held: true,
    sourceFile: 'eccc/En84-294-2025-eng.pdf' })),
  { dataset: 'eccc_combustion', label: 'ECCC 2026 v4.0', class: 'a', editionYear: 2027,
    published: { date: ECCC_V['4.0'].date, source: ECCC_V['4.0'].source }, corrections: [], held: false, sourceFile: 'eccc/En84-294-2026-eng.pdf' },

  // eGRID (class (b), data year N). Dates from the eGRID pages (factor-year-selection.md s 4.2 and the reviewer). No
  // document in ~/themisiq-sources shows an eGRID2024; EPA's page lists eGRID2023 revision 2 as the newest, so none is registered.
  { dataset: 'egrid', label: 'eGRID2021', class: 'b', dataYear: 2021,
    published: { date: '2023-01-30', source: `${EPA_EGRID_HISTORICAL_URL} ("released 1/30/2023")` }, corrections: [], held: false },
  { dataset: 'egrid', label: 'eGRID2022', class: 'b', dataYear: 2022,
    published: { date: '2024-01-30', source: `${EPA_EGRID_HISTORICAL_URL} ("released 1/30/2024")` }, corrections: [], held: false },
  { dataset: 'egrid', label: 'eGRID2023', class: 'b', dataYear: 2023,
    published: { date: '2025-01-15', source: `${EPA_EGRID_DETAILED_DATA_URL} (released 15 Jan 2025)` },
    corrections: [
      { date: '2025-01-17', source: EPA_EGRID_DETAILED_DATA_URL, note: 'Revision 1.' },
      { date: '2025-06-12', source: EPA_EGRID_DETAILED_DATA_URL, note: 'Revision 2.' },
    ], held: true, heldCorrection: '2025-06-12' },
  // Green-e (class (b), data year = edition - 2). Pages: resource-solutions.org/{edition}-residual-mix/ (s 4.6).
  ...[[2021, 2019], [2023, 2021], [2024, 2022]].map(([ed, dy]): FactorEditionEntry => ({
    dataset: 'greene', label: `Green-e ${ed} (${dy} data)`, class: 'b', dataYear: dy,
    published: { source: `https://resource-solutions.org/${ed}-residual-mix/` }, corrections: [], held: false,
    note: `Release date not recorded. ${CLASS_B_NOT_SELECTED}` })),
  { dataset: 'greene', label: 'Green-e 2025 (2023 data)', class: 'b', dataYear: 2023,
    published: { onOrBefore: { date: '2026-05-30', evidence: 'first_held' },
      source: 'git 6dd16c4 (2026-05-30, "GHG engine: AR6 routing, EU+US Scope 2 residual mix, subregion picker"), which first added these values to app/dashboard/ghg/page.tsx; page https://resource-solutions.org/2025-residual-mix/' },
    corrections: [], held: true,
    note: 'EF_SOURCES.residual_us says "publ. 2026-01-29, CRS". That text arrived in the same commit, 6dd16c4, with no page, document or quote behind it, so it is not used.' },

  // AIB (class (b), data year = the calendar year the results are for). Cover version lines.
  { dataset: 'aib', label: 'AIB 2023', class: 'b', dataYear: 2023,
    published: { date: '2024-05-30', source: 'aib/AIB-2023-residual-mix-final-results-v1.0.pdf p1 "Version 1.0, 2024-05-30"' },
    corrections: [], held: true, sourceFile: 'aib/AIB-2023-residual-mix-results.xlsx',
    note: 'T3d 2024: lib/ghg/factors/aib-2023.ts, Table 2 (pp. 7 to 8) governs at its printed two decimals. Austria prints "N/A" (the spreadsheet stores 0): held as null. The Netherlands is a printed figure in this edition.' },
  { dataset: 'aib', label: 'AIB 2024', class: 'b', dataYear: 2024,
    published: { onOrBefore: { date: '2025-08-11', evidence: 'printed' },
      source: 'aib/AIB-2024-residual-mix-final-results-v1.1-11082025.pdf p1 "Version 1.1, 2025-08-11" (Version 1.0 date not printed)' },
    corrections: [{ date: '2025-08-11', source: 'aib/AIB-2024-residual-mix-final-results-v1.1-11082025.pdf p1 "Version 1.1, 2025-08-11"', note: 'Small errors in Tables 6 and 7 and Figure 16 corrected.' }],
    held: true, heldCorrection: 'unknown', sourceFile: 'aib/AIB-2024-residual-mix-results-30052025.xlsx',
    note: 'EF_SOURCES.residual_eu records "publ. 2025-05-30" and the xlsx file name reads 30052025; neither is printed in the document. Which version the held values reflect is not recorded. T3d: the Netherlands is held as null ("NA" in Residual Mixes!Q27 and Table 2, p. 8; full disclosure, p. 1), not the CO2 sheet\'s 382.47 (lib/ghg/factors/aib-2024.ts).' },
  { dataset: 'aib', label: 'AIB 2025', class: 'b', dataYear: 2025,
    published: { date: '2026-05-26', source: 'aib/AIB-2025-residual-mix-final-results-26052026.pdf p1 "Version 1.0, 2026-05-26"' },
    corrections: [], held: true, sourceFile: 'aib/AIB-2025-residual-mix-results-25052026.xlsx',
    note: 'T3d: lib/ghg/factors/aib-2025.ts, Residual Mixes column Q. Italy: the CO2 sheet prints 427.78 and Table 2 420.2; Table 2 footnote 6 says its values are correct, so 420.2 is held. Austria and the Netherlands print "NA" (full disclosure): held as null.' },

  // EEA (class (b)). The CSV prints no publication date; its latest data year is 2023.
  { dataset: 'eea_grid', label: 'EEA 2023', class: 'b', dataYear: 2023,
    published: { date: '2024-10-25', source: `${EEA_GRID_INTENSITY_URL} ("Published" 25 Oct 2024)` },
    // T3d 2024, Lisa's ruling 1 (8 Oct 2026): data year 2023 as revised in the data year 2024 release, which is the final
    // inventory; the first release rested on the April 2024 submission and EEA's approximated 2023 estimates.
    corrections: [{ date: '2025-11-06', source: `${EEA_GRID_INTENSITY_2024_URL} ("Published 06 Nov 2025"); eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv, comma block, 2023 column`,
      note: 'Data year 2023 revised in the final inventory: every one of the 27 member states changed (Lisa, 8 Oct 2026: the correction affects values). The EU-27 row is not loaded.' }],
    held: true, heldCorrection: '2025-11-06', sourceFile: 'eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv',
    note: 'T3d 2024: the held values are the revised ones (lib/ghg/factors/eea-2023.ts), each citing the value it supersedes from eea/EEA-ghg-intensity-electricity-generation-country-level.csv (temporal coverage "1990, 2000, 2010, 2023"). The indicator page also showed "Modified" 27 Jun 2025 for that first release, without saying what changed.' },
  // T3d: data year 2024, from the export of the chart page (lib/ghg/factors/eea-2024.ts). The comma-separated block only.
  { dataset: 'eea_grid', label: 'EEA 2024', class: 'b', dataYear: 2024,
    published: { date: '2025-11-06', source: `${EEA_GRID_INTENSITY_2024_URL} ("Temporal coverage 1990-2024", "Published 06 Nov 2025")` },
    corrections: [{ date: '2026-07-10', source: `${EEA_GRID_INTENSITY_2024_URL} ("Modified 10 Jul 2026")`, note: 'Values revised (Lisa, 8 Oct 2026: the correction affects values).' }],
    held: true, heldCorrection: '2026-07-10', sourceFile: 'eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv',
    note: 'The held values are the corrected ones: the comma-separated block of the CSV export (35 values, 1990 to 2024, then the country); the semicolon-separated block, an earlier version with truncated rows, is ignored. Checked by Lisa against the live EEA chart on 8 Oct 2026: Romania 188, France 36 and Germany 291 for 2024 match. The "#N/A" row is EU-27 and is not loaded; its 1990, 2023 and 2024 values (501, 206, 183) reproduce the page\'s "63% less ... than in 1990 and 11% less than in 2023".' },

  // ECCC grid (class (b), DATA YEAR). Each table is dated by the version that first carried it (revision history).
  { dataset: 'eccc_grid', label: 'ECCC Table 5.1 (NIR 1990-2021)', class: 'b', dataYear: 2021,
    published: { ...ECCC_V['1.1'] }, corrections: [], held: true, sourceFile: 'eccc/En84-294-2025-eng.pdf',
    note: 'v4.0 Table 5.1, fn36 "NIR 1990-2021"; ECCC: "must be used for" calendar years 2023 and 2024. Held under its data year, GRID_EF key 2021 (re-keyed in T3c; values unchanged in v4.0).' },
  { dataset: 'eccc_grid', label: 'ECCC Table 5.2 (NIR 1990-2022)', class: 'b', dataYear: 2022,
    published: { ...ECCC_V['2.0'] }, corrections: [], held: true, sourceFile: 'eccc/En84-294-2025-eng.pdf',
    note: 'v4.0 Table 5.2, fn38 "NIR 1990-2022"; ECCC: calendar year 2025. Held under its data year, GRID_EF key 2022 (re-keyed in T3c; values unchanged in v4.0).' },
  { dataset: 'eccc_grid', label: 'ECCC Table 5.3 (NIR 1990-2023)', class: 'b', dataYear: 2023,
    published: { ...ECCC_V['3.0'] }, corrections: [], held: true, sourceFile: 'eccc/En84-294-2025-eng.pdf',
    note: 'v4.0 Table 5.3, fn40 "NIR 1990-2023"; ECCC: calendar year 2026. Held under its data year, GRID_EF key 2023 (re-keyed in T3c; values unchanged in v4.0). ' +
      'v4.0 (En84-294-2026-eng.pdf, 9 Sep 2026, after NIR 2026) still prints Table 5.3 unchanged, PEI 234 with footnote 41: "Due to the high level of imports from New Brunswick, Prince Edward Island takes New Brunswick\'s value." ' +
      'NIR 2026 Annex 7 (eccc/NIR-1990-2024-2026-Annex7-Electricity-Intensity.xlsx, "Consumption Intensity (g CO2 eq / kWh)", 2023) prints a different data-year-2023 consumption intensity for four provinces: ' +
      'AB 434 (Table 5.3: 438), SK 632 (631), NS 614 (581), and PEI 176 as PEI\'s own generation (234, New Brunswick\'s value). ECCC\'s v4.0 factor table did not adopt them, and the held values stay as v4.0 prints them (Lisa, 8 Oct 2026). ' +
      'Footnote "a" on Annex 7\'s 2024 column reads "Preliminary data."' },
  { dataset: 'eccc_grid', label: 'ECCC Table 5.4 (NIR 1990-2024)', class: 'b', dataYear: 2024,
    published: { ...ECCC_V['4.0'] }, corrections: [], held: true, sourceFile: 'eccc/En84-294-2026-eng.pdf',
    note: 'v4.0 Table 5.4, fn42 "NIR 1990-2024, Part 3, Tables A7-2 to A7-14"; ECCC: calendar year 2027. Table 5.4 omits the 5.1 to 5.3 footnote that PEI takes New Brunswick\'s value (PEI 265, NB 375). T3d: held under data year 2024, lib/ghg/factors/eccc-2026.ts.' },

  // MfE grid and T&D (class (b), series row year), from the 2026 v2 workbook.
  mfeRow('mfe_grid', 2023, true), mfeRow('mfe_grid', 2024, true), mfeRow('mfe_grid', 2025, true),
  // T3d 2024: the grid rows as printed (lib/ghg/factors/mfe-2026v2-grid.ts, ruling 2); the T&D 2023 row held.
  mfeRow('mfe_td', 2023, true), mfeRow('mfe_td', 2024, true),   // T3d: lib/ghg/factors/mfe-2026v2-td.ts
  mfeRow('mfe_td', 2025, true, 'MfE marks the 2025 T&D value as calculated from the latest observed T&D-to-purchased-electricity ratio, not observed (H1709:H1712).'),

  // ECCC NIR (class (b)): mobile (A6.1-15) and natural gas heat content (A4-2). The NIR prints only its year.
  ...(['eccc_mobile', 'eccc_ng_heat'] as const).flatMap((dataset): FactorEditionEntry[] => [
    { dataset, label: 'ECCC NIR 2025 (1990-2023)', class: 'b', dataYear: 2023,
      published: { onOrBefore: { date: '2025-10-24', evidence: 'cited_by_publisher' },
        source: 'eccc/En84-294-2025-eng.pdf p iii, revision history "3.0 October 24, 2025 ... alignment with the National Inventory Report 1990-2023"; Table 5.3 fn33 "ECCC. (2025). NIR 1990-2023, Part 3, Tables A13-2 to A13-14". The NIR prints only its year.' },
      corrections: [], held: true, sourceFile: 'eccc/2025NIR%20-%20Part%202.pdf',
      note: dataset === 'eccc_mobile' ? 'Table A6.1-15, p 253.' : 'Table A4-2, p 236.' },
    { dataset, label: 'ECCC NIR 2026 (1990-2024)', class: 'b', dataYear: 2024,
      published: { onOrBefore: { date: '2026-09-09', evidence: 'cited_by_publisher' },
        source: 'eccc/En84-294-2026-eng.pdf p iii, revision history "4.0 September 9, 2026 ... alignment with the National Inventory Report 1990-2024"; Table 5.4 fn42 "ECCC. (2026). NIR 1990-2024, Part 3, Tables A7-2 to A7-14". The NIR prints only its year.' },
      corrections: [], held: true, sourceFile: 'eccc/NIR-1990-2024-2026-edition.pdf',   // T3d: mobile/eccc2026.ts; factors/eccc-2026.ts
      note: dataset === 'eccc_mobile' ? 'Table A6.1-15, p 541.' : 'Table A4-2, p 521 (natural gas 38.52 TJ/GL).' },
  ]),

  // Exempt: fixed defaults, never missing.
  { dataset: 'ipcc2006', label: 'IPCC 2006', class: 'exempt', published: { source: '2006 IPCC Guidelines, Vol. 2 Ch. 2 and 3' }, corrections: [], held: true, sourceFile: 'ipcc/V2_3_Ch3_Mobile_Combustion.pdf' },
  { dataset: 'eu_mrr', label: 'EU MRR 2018/2066 Annex VI', class: 'exempt', published: { date: '2025-05-27', source: 'eu/CELEX_02018R2066-20250527_EN_TXT.pdf, consolidated text of 27.05.2025' }, corrections: [], held: true, sourceFile: 'eu/CELEX_02018R2066-20250527_EN_TXT.pdf' },
  { dataset: 'jec_wtt', label: 'JEC Well-to-Tank v5', class: 'exempt', published: { source: 'JRC119036, EUR 30269 EN, 2020' }, corrections: [], held: true, sourceFile: 'jrc/JRC119036_01.pdf' },
  { dataset: 'exiobase', label: 'EXIOBASE 3.8.2 (2019 prices)', class: 'exempt', published: { source: 'doi:10.5281/zenodo.5589597' }, corrections: [], held: true },
]

// ── T3d 2026: EDITIONS A RULE AWAITS THAT ARE NOT YET PUBLISHED, WITH THE PAGE CHECKED ─────────────────────────────
// selectEdition treats an edition year above the newest registered one as not yet published (R19). That is an inference
// from the registry; these records are the evidence for it: the publisher's page, checked on the date given, listed
// nothing newer. Selection does not read them (no rule changes); the test holds every awaited edition to a record, so
// "not yet published" is evidenced, not assumed. When an edition appears, register it above and delete its record here.
// ── THE RULE, IN THE WORDS EVERY SURFACE PRINTS (T3c diff 3) ────────────────────────────────────────────────────────
// The methodology page states these verbatim (a source test holds the page to them) and the assurance PDF's methods
// table prints them, so the public statement of the rule and the one in a verifier's package cannot drift apart.
/** Class (b): data year, else the newest when first prepared, frozen with its date (lib/ghg/factorSelection.ts). */
export const FACTOR_YEAR_RULE_CLASS_B = 'For data published some years after the period it describes (eGRID, Green-e, AIB, EEA, the ECCC grid intensities and the New Zealand grid and transmission loss series), we use the edition whose data year is the reporting year where one exists, and otherwise the newest edition published when the inventory was first prepared. That choice is saved with the inventory, with the date it was made, and kept on every later save; it is made again only if the reporting year or its year end changes.'
/** No substitution, and what happens instead (unpriced line, export blocked). */
export const FACTOR_YEAR_NO_SUBSTITUTION = "We never substitute another year's factors: where the edition a year needs is published but not loaded, the line is not counted and the inventory cannot be exported until it is."

export interface NotYetPublished { dataset: DatasetId[]; edition: string; checked: { date: string; source: string; found: string } }
export const NOT_YET_PUBLISHED: readonly NotYetPublished[] = [
  { dataset: ['epa_hub_combustion', 'epa_hub_steam', 'epa_hub_mobile'], edition: 'US EPA 2026',
    checked: { date: '2026-10-08', source: EPA_GHG_HUB_URL, found: 'The Hub page lists the 2025 edition (January 2025) as current; no 2026 edition is listed (Lisa, 8 Oct 2026).' } },
  { dataset: ['egrid'], edition: 'eGRID2024',
    checked: { date: '2026-10-08', source: EPA_EGRID_DETAILED_DATA_URL, found: 'The detailed-data page lists eGRID2023 revision 2 as the newest; no eGRID2024 is listed (Lisa, 8 Oct 2026).' } },
  { dataset: ['greene'], edition: 'Green-e 2026',
    checked: { date: '2026-10-08', source: GREENE_RESIDUAL_MIX_URL, found: 'The newest residual mix listed is the 2025 edition (2023 data); no 2026 edition is listed (Lisa, 8 Oct 2026).' } },
]

/** Every entry whose publication date is still needed, by label. A held one among them is never selected until dated. */
export const DATE_NEEDED: readonly string[] = FACTOR_EDITION_REGISTRY
  .filter(e => e.class !== 'exempt' && !pubDate(e))
  .map(e => `${e.dataset}: ${e.label}`)
  .filter((v, i, a) => a.indexOf(v) === i)

// ── SELECTION ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Window { start: Date; end: Date }

/** A date as a comparable yyyy-mm-dd string; a month-only date is its last day. */
export function effectiveDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const m = /^(\d{4})-(\d{2})$/.exec(d)
  if (!m) throw new Error(`Not a registry date: ${d}`)
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  return `${d}-${String(last).padStart(2, '0')}`
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "15 January 2025", or "August 2025" for a month-only date. */
export function registryDateInWords(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return day ? dateInWords(new Date(y, m - 1, day)) : `${MONTHS[m - 1]} ${y}`
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayNo = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000

/** Days of an inclusive window in each calendar year (or, with `nga`, each NGA activity year: 1 July N to 30 June N+1). */
export function daysByYear(win: Window, nga = false): Map<number, number> {
  const out = new Map<number, number>()
  for (let n = dayNo(win.start); n <= dayNo(win.end); n++) {
    const d = new Date(n * 86_400_000)
    const y = nga ? (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1) : d.getUTCFullYear()
    out.set(y, (out.get(y) ?? 0) + 1)
  }
  return out
}
/** The year holding most of the window; a tie goes to the year the window ends in. */
export function majorityYear(win: Window, nga = false): { year: number; days: number; total: number } {
  const counts = daysByYear(win, nga)
  const endYear = nga ? (win.end.getMonth() >= 6 ? win.end.getFullYear() : win.end.getFullYear() - 1) : win.end.getFullYear()
  let best = endYear
  for (const [y, n] of counts) if (n > (counts.get(best) ?? 0)) best = y
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  return { year: best, days: counts.get(best) ?? 0, total }
}

export interface EditionChoice {
  edition: FactorEditionEntry
  rule: SelectionRule
  basis: string
  /** D2: the latest correction published on or before the preparation date, if any. */
  correction: Correction | null
  /** True where the held values reflect that correction (or there is none). */
  correctionHeld: boolean
  /** Class (b): the preparation date the selection was made on. */
  selected_on?: string
}
export interface FrozenSelection { dataset: DatasetId; label: string; data_year?: number; rule: SelectionRule; selected_on: string }
export type SelectEditionResult =
  | EditionChoice
  | { provisional: EditionChoice & { awaited: number } }
  | { missing: { dataset: DatasetId; edition: string; rule: SelectionRule; basis: string; reason: 'not_held' | 'no_date' | 'nothing_published' } }

/** The date selection uses: the published date, or R20's on-or-before date. */
export function pubDate(e: FactorEditionEntry): string | undefined { return e.published.date ?? e.published.onOrBefore?.date }
/** "published 15 January 2025", or "published on or before 11 August 2025" (R20). */
const publishedWords = (e: FactorEditionEntry) =>
  e.published.date ? `published ${registryDateInWords(e.published.date)}` : `published on or before ${registryDateInWords(pubDate(e)!)}`
const usable = (e: FactorEditionEntry, by: string) => !!pubDate(e) && effectiveDate(pubDate(e)!) <= by

function corrected(e: FactorEditionEntry, preparedOn: string): { correction: Correction | null; correctionHeld: boolean; words: string } {
  // A correction to a different file of the edition (affectsHeldValues: false) never applies to the held values.
  const c = e.corrections.filter(x => x.date <= preparedOn && x.affectsHeldValues !== false).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null
  if (!c) return { correction: null, correctionHeld: true, words: '' }
  if (e.heldCorrection === 'unknown') return { correction: c, correctionHeld: false,
    words: ` Whether the values held reflect the correction of ${registryDateInWords(c.date)} is not recorded.` }
  const held = e.heldCorrection === c.date
  return { correction: c, correctionHeld: held,
    words: held ? ` Values as corrected on ${registryDateInWords(c.date)}.` : ` A correction of ${registryDateInWords(c.date)} is not reflected in the values held.` }
}

/**
 * The edition the rules require for `dataset` over `window`, prepared on `preparedOn` (yyyy-mm-dd). Class (b) returns
 * `frozen` unchanged when given. `registry` is for tests; callers use the module's.
 */
export function selectEdition(
  dataset: DatasetId, window: Window, reportingYear: number, preparedOn: string, frozen?: FrozenSelection,
  registry: readonly FactorEditionEntry[] = FACTOR_EDITION_REGISTRY,
): SelectEditionResult {
  const meta = DATASETS[dataset]
  const entries = registry.filter(e => e.dataset === dataset)
  const inText = reportingYearLabel(window).inText
  const endWords = dateInWords(window.end)
  const missing = (edition: string, rule: SelectionRule, reason: 'not_held' | 'no_date' | 'nothing_published', basis: string): SelectEditionResult =>
    ({ missing: { dataset, edition, rule, reason, basis } })
  const notLoaded = (label: string) =>
    `${label} ${meta.family} factors are needed for ${inText} and are not loaded, so this line is not counted. Export is blocked until they are loaded.`
  const noDate = (label: string) =>
    `${label} ${meta.family} factors are needed for ${inText}, but no publication date is recorded for them, so this line is not counted. Export is blocked until the date is recorded.`
  const choose = (e: FactorEditionEntry, rule: SelectionRule, basis: string, extra: Partial<EditionChoice> = {}): EditionChoice => {
    const c = corrected(e, preparedOn)
    return { edition: e, rule, basis: basis + c.words, correction: c.correction, correctionHeld: c.correctionHeld, ...extra }
  }

  // ── exempt: a fixed default, never missing.
  if (meta.class === 'exempt') {
    const e = entries[0]
    return choose(e, 'exempt', `${e.label}: a fixed default with no annual edition, used for every reporting year.`)
  }

  // ── class (b): data year, else newest on or before the preparation date; frozen as given.
  if (meta.class === 'b') {
    if (frozen) {
      const e = entries.find(x => x.label === frozen.label)
      if (!e) return missing(frozen.label, 'frozen', 'not_held', notLoaded(frozen.label))
      return choose(e, 'frozen', `${e.label}: selected on ${dateInWords(new Date(frozen.selected_on + 'T00:00:00'))}, when this inventory was first prepared, and kept.`, { selected_on: frozen.selected_on })
    }
    const m = majorityYear(window)
    const where = m.total === m.days && reportingYearLabel(window).inText.startsWith('reporting year')
      ? `reporting year ${m.year}` : `${inText}, which falls mostly in ${m.year}`
    const match = entries.filter(e => e.dataYear === m.year && usable(e, preparedOn)).sort((a, b) => effectiveDate(pubDate(a)!).localeCompare(effectiveDate(pubDate(b)!))).at(-1)
    if (match) {
      const basis = `${match.label}: data year ${m.year} matches ${where}.`
      return match.held ? choose(match, 'data_year_match', basis, { selected_on: preparedOn }) : missing(match.label, 'data_year_match', 'not_held', notLoaded(match.label))
    }
    const newest = entries.filter(e => usable(e, preparedOn))
      .sort((a, b) => effectiveDate(pubDate(a)!).localeCompare(effectiveDate(pubDate(b)!)) || (a.dataYear ?? 0) - (b.dataYear ?? 0)).at(-1)
    if (!newest) return missing(`${meta.short} ${m.year}`, 'data_year_newest', 'nothing_published',
      `No ${meta.publisher} ${meta.family} edition with a recorded publication date on or before ${dateInWords(new Date(preparedOn + 'T00:00:00'))} is registered, so this line is not counted. Export is blocked until one is.`)
    const revs = newest.corrections.filter(c => c.date <= preparedOn).at(-1)
    const rev = !revs ? '' : /^Revision \d+\.$/.test(revs.note)
      ? `, ${revs.note.replace(/\.$/, '').toLowerCase()} of ${registryDateInWords(revs.date)}` : `, corrected on ${registryDateInWords(revs.date)}`
    const basis = `${newest.label} (${publishedWords(newest)}${rev}): the newest edition when this inventory was first prepared on ${dateInWords(new Date(preparedOn + 'T00:00:00'))}; no ${m.year} data year was published.`
    return newest.held ? choose(newest, 'data_year_newest', basis, { selected_on: preparedOn }) : missing(newest.label, 'data_year_newest', 'not_held', notLoaded(newest.label))
  }

  // ── class (a): find the required edition year, then resolve it (R19 where it is not yet published).
  let year: number
  let rule: SelectionRule
  let basis: string
  const endMonth = window.end.getMonth() + 1
  const calendar = window.start.getMonth() === 0 && window.start.getDate() === 1 && endMonth === 12
  if (meta.rule === 'desnz' && calendar) {
    year = window.end.getFullYear(); rule = 'desnz_calendar'
    basis = `DESNZ ${year} factors for ${inText}, following DESNZ guidance for calendar years.`
  } else if (meta.rule === 'desnz' && endMonth === 3) {
    year = majorityYear(window).year; rule = 'desnz_april_march'
    basis = `DESNZ ${year} factors for ${inText}, following DESNZ guidance for April to March years.`
  } else if (meta.rule === 'desnz' && endMonth === 6) {
    // The newest edition first published on or before the window's last day (8.1, D1).
    const end = iso(window.end)
    const by = end <= preparedOn ? end : preparedOn
    const e = entries.filter(x => usable(x, by)).sort((a, b) => (a.editionYear ?? 0) - (b.editionYear ?? 0)).at(-1)
    if (!e) return missing(`DESNZ ${window.end.getFullYear()}`, 'desnz_july_june', 'nothing_published',
      `No DESNZ ${meta.family} edition published by ${endWords} is registered, so this line is not counted. Export is blocked until one is.`)
    const b = `${e.label} factors (${publishedWords(e)}), the newest published by ${endWords}, following DESNZ guidance for July to June years.`
    if (!e.held) return missing(e.label, 'desnz_july_june', 'not_held', notLoaded(e.label))
    if (end > preparedOn) {
      // The window has not ended: a newer edition may still be published by its last day (R19).
      const awaited = window.end.getFullYear()
      const c = choose(e, 'desnz_july_june', r19(awaited, meta, e.label))
      return { provisional: { ...c, awaited } }
    }
    return choose(e, 'desnz_july_june', b)
  } else if (meta.rule === 'nga_activity_year') {
    const m = majorityYear(window, true)
    year = m.year; rule = 'nga_activity_year'
    basis = `NGA ${year} factors: the ${year}-${String(year + 1).slice(-2)} activity year (1 July ${year} to 30 June ${year + 1}) contains ${m.days} of the ${m.total} days in ${inText}.`
  } else {
    const m = majorityYear(window)
    year = m.year; rule = meta.rule === 'desnz' ? 'desnz_majority_fallback' : 'majority'
    basis = `${meta.short} ${year} factors: ${year} contains ${m.days} of the ${m.total} days in ${inText}.` +
      (meta.rule === 'desnz' ? ' DESNZ gives no guidance for this year end, so the majority rule applies.' : '')
  }

  const req = entries.find(e => e.editionYear === year)
  const newestRegistered = Math.max(...entries.map(e => e.editionYear ?? -Infinity))
  const notYetPublished = req ? (!!pubDate(req) && !usable(req, preparedOn)) : year > newestRegistered
  if (req && !pubDate(req)) return missing(req.label, rule, 'no_date', noDate(req.label))
  if (req && !notYetPublished) return req.held ? choose(req, rule, basis) : missing(req.label, rule, 'not_held', notLoaded(req.label))
  if (!req && !notYetPublished) {
    const label = `${meta.short} ${year}`
    return missing(label, rule, 'not_held', notLoaded(label))
  }
  // R19: the required edition is not yet published. Price with the newest published edition, provisionally.
  const newest = entries.filter(e => usable(e, preparedOn)).sort((a, b) => (a.editionYear ?? 0) - (b.editionYear ?? 0)).at(-1)
  if (!newest) return missing(`${meta.short} ${year}`, rule, 'nothing_published',
    `No ${meta.publisher} ${meta.family} edition is published, so this line is not counted. Export is blocked until one is.`)
  if (!newest.held) return missing(newest.label, rule, 'not_held', notLoaded(newest.label))
  const c = choose(newest, rule, r19(year, meta, newest.label))
  return { provisional: { ...c, awaited: year } }
}

/** R19's sentence, exactly. */
export function r19(year: number, meta: Pick<DatasetMeta, 'publisher' | 'family'>, editionLabel: string): string {
  return `The ${year} ${meta.publisher} ${meta.family} factors have not been published yet, so the ${editionLabel} factors are used. ` +
    `This line will be re-priced when the ${year} factors are loaded.`
}
