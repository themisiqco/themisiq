// lib/ghg/gridRegionWords.ts
//
// T3d 2024: the grid region names, in a module with no imports, so the engine can name a region in a customer-facing
// message (edition_missing for a region with no value) without importing lib/ghg/gridRegionNames.ts, which imports the
// engine. gridRegionNames.ts reads these same tables: one set of names, two readers.
//
// T17: the eGRID subregion list (US_SUBREGIONS, the wizard's picker) and the country words (COUNTRY_WORDS) moved here
// from lib/ghg/engine.ts and lib/ghg/series.ts, unchanged, so gridRegionNames.ts imports nothing that loads the engine
// and the verifier page and the PDF can name a region. The engine and series.ts import or re-export them from here.

export const GRID_REGION_CA: Record<string, string> = {
  ON: 'Ontario', QC: 'Quebec', BC: 'British Columbia', AB: 'Alberta', SK: 'Saskatchewan', MB: 'Manitoba',
  NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NL: 'Newfoundland and Labrador',
  YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut',
}
export const GRID_REGION_US: Record<string, string> = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland',
  ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina',
  ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada',
  NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont',
  WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
}
export const GRID_REGION_AU: Record<string, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania',
  WA: 'Western Australia (South West Interconnected System)', NT: 'Northern Territory (Darwin-Katherine Interconnected System)',
}
export const GRID_REGION_AVERAGES: Record<string, string> = {
  US_AVG: 'United States national average', EU_AVG: 'EU-27 average', AU_AVG: 'Australia national average',
  UK: 'United Kingdom', NZ: 'New Zealand',
}

// eGRID subregions for the US market-based residual-mix picker (item 5). Code -> readable label.
// Users select their exact subregion via EPA Power Profiler (ZIP lookup) rather than inferring from state,
// because several states span multiple subregions (e.g. TX = ERCT + SPP; NY = NYCW/NYLI/NYUP).
export const US_SUBREGIONS: Array<[string, string]> = [
  ['AKGD', 'AKGD — ASCC Alaska Grid'], ['AKMS', 'AKMS — ASCC Miscellaneous'],
  ['AZNM', 'AZNM — WECC Southwest'], ['CAMX', 'CAMX — WECC California'],
  ['ERCT', 'ERCT — ERCOT All'], ['FRCC', 'FRCC — FRCC All'],
  ['HIMS', 'HIMS — HICC Miscellaneous'], ['HIOA', 'HIOA — HICC Oahu'],
  ['MROE', 'MROE — MRO East'], ['MROW', 'MROW — MRO West'],
  ['NEWE', 'NEWE — NPCC New England'], ['NWPP', 'NWPP — WECC Northwest'],
  ['NYCW', 'NYCW — NPCC NYC/Westchester'], ['NYLI', 'NYLI — NPCC Long Island'],
  ['NYUP', 'NYUP — NPCC Upstate NY'], ['PRMS', 'PRMS — Puerto Rico Miscellaneous'],
  ['RFCE', 'RFCE — RFC East'], ['RFCM', 'RFCM — RFC Michigan'],
  ['RFCW', 'RFCW — RFC West'], ['RMPA', 'RMPA — WECC Rockies'],
  ['SPNO', 'SPNO — SPP North'], ['SPSO', 'SPSO — SPP South'],
  ['SRMV', 'SRMV — SERC Mississippi Valley'], ['SRMW', 'SRMW — SERC Midwest'],
  ['SRSO', 'SRSO — SERC South'], ['SRTV', 'SRTV — SERC Tennessee Valley'],
  ['SRVC', 'SRVC — SERC Virginia/Carolina'],
]

// Country names as a customer reads them in a sentence. Moved from lib/ghg/series.ts.
export const COUNTRY_WORDS: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "the UK", UK: "the UK", AU: "Australia", NZ: "New Zealand",
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia",
  DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France", DE: "Germany", EL: "Greece",
  HU: "Hungary", IE: "Ireland", IT: "Italy", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg",
  MT: "Malta", NL: "the Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia",
  SI: "Slovenia", ES: "Spain", SE: "Sweden",
};
