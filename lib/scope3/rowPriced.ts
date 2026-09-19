// ── THE FIGURE OF A ROW-PRICED CATEGORY, FROM THAT CATEGORY'S OWN DATA ─────────────────────────────
//
// One dispatcher for every category whose figure is a sum of priced rows: Category 5's waste rows,
// Category 12's end-of-life materials, and (since 19 Sep 2026) Category 6's flight legs and rail journeys
// and Category 7's commuting and homeworking groups. It reads catData[catId] and nothing else, which is the whole point:
// the page's calcCat5() used to take no category id and read catData.cat5 directly, so a second category
// on the waste factors would have reported Category 5's figure and been "calculated" whenever Category 5
// was. rowPriced.test.ts gives the two categories different data and checks each result moves only with
// its own.

import { scope3MethodFor } from './categoryMethods'
import { evaluateWasteRows, type WasteRow } from './wasteRows'
import { evaluateEolMaterials, type EolMaterial } from './endOfLife'
import { evaluateBusinessTravel, type BusinessTravelData } from './businessTravel'
import { evaluateCommuting, type CommutingData } from './commuting'

export interface RowPricedData extends BusinessTravelData, CommutingData {
  wasteRows?: WasteRow[]
  eolMaterials?: EolMaterial[]
}

export interface RowPricedResult {
  mt: number
  /** Calculated only when at least one row or material is priced. An entered figure never makes it so. */
  calculated: boolean
}

/** The figure and calculated flag for a row-priced category; null for a category priced another way. */
export function rowPricedResult(
  catData: Readonly<Record<string, RowPricedData | undefined>>,
  catId: string,
): RowPricedResult | null {
  switch (scope3MethodFor(catId)) {
    case 'waste_factors': {
      const e = evaluateWasteRows(catData[catId]?.wasteRows)
      return { mt: e.mt, calculated: e.priced.length > 0 }
    }
    case 'end_of_life_factors': {
      const e = evaluateEolMaterials(catData[catId]?.eolMaterials)
      return { mt: e.mt, calculated: e.priced.length > 0 }
    }
    case 'business_travel_factors': {
      const e = evaluateBusinessTravel(catData[catId])
      return { mt: e.mt, calculated: e.calculated }
    }
    case 'employee_commuting_factors': {
      const e = evaluateCommuting(catData[catId])
      return { mt: e.mt, calculated: e.calculated }
    }
    default:
      return null
  }
}
