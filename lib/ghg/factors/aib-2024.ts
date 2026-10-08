// lib/ghg/factors/aib-2024.ts
//
// T3d: the one AIB 2024 value held in an edition file, the Netherlands, corrected by the rule applied to Italy 2025 (the
// PDF's Table 2 is the correct source; aib-2025.ts, footnote 6). The other 2024 values stay in lib/ghg/engine.ts
// RESIDUAL_EU, as held since FI8.
//
// Until T3d the Netherlands was held as 382.47 g CO2/kWh, which is the CO2 sheet's C27 (382.4653903671162) rounded. The
// Residual Mixes sheet, the column every other held 2024 value comes from, prints "NA" in Q27; Table 2 prints "NA" in every
// column for NL (p. 8); and p. 1 says "Also the Netherlands have full disclosure", where "the residual mix is zero"
// in AIB's words. So there is no residual mix: null, never 0, and the market-based row uses the location-based factor,
// with that treatment stated, as for Austria.

import type { AibValue } from './aib-2025'

export const AIB_2024_NL: AibValue = {
  value: null,
  printed: 'NA',
  cite: {
    document: 'AIB European Residual Mixes 2024, Version 1.1, 2025-08-11 (AIB-2024-residual-mix-results-30052025.xlsx; AIB-2024-residual-mix-final-results-v1.1-11082025.pdf)',
    table: 'Residual Mixes', row: 'NL', column: 'CO2 (gCO2/kWh)', cell: 'Residual Mixes!Q27', page: 'PDF Table 2, p. 8; full disclosure, p. 1',
    correction: 'Version 1.1, 2025-08-11 (the 2024 values were transcribed from the 30 May 2025 workbook; Q27 reads "NA" in it)',
  },
  note: 'Printed "NA" in Residual Mixes!Q27 and in Table 2 (p. 8): full disclosure (p. 1). The CO2 sheet\'s C27 (382.47) is not the residual mix and was held in error until T3d.',
}
