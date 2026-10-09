// T3e: the DEFRA travel and waste editions a December 2026 window selects, prepared 8 Oct 2026: DEFRA 2026 for both.
// What every Scope 3 travel and waste test written before T3e priced on, now passed explicitly, as pricing requires.
import { selectionFor } from '../ghg/engine'
import { travelWasteEditionsFor } from '../scope3/defraEditions'
import type { TravelWasteEditions } from '../scope3/defraEditionTypes'

export const TW_2026: TravelWasteEditions = travelWasteEditionsFor(selectionFor(2026, 12, { preparedOn: new Date(2026, 9, 8) }))
/** The editions any reporting year and year end selects, prepared 8 Oct 2026. */
export const twFor = (year: number, month = 12): TravelWasteEditions => travelWasteEditionsFor(selectionFor(year, month, { preparedOn: new Date(2026, 9, 8) }))
