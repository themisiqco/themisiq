// lib/billReview/switchWords.ts
//
// BR8 (Q1): what a lead reads before changing an inventory's reading, on the customer's request. The design's switch
// sentences, said to ThemisIQ staff (the customer reads BR6's "Since {date}" line afterwards). Plain language, no em dash.

import type { BillReviewReading } from '../pricing'

const bills = (n: number) => (n === 1 ? '1 bill was' : `${n} bills were`)

export function switchSentence(to: BillReviewReading, readByAi: number): string {
  return to === 'human'
    ? `From now on, bills uploaded to this inventory will be read by a ThemisIQ specialist and will not be sent to the AI. Bills already uploaded keep their reading: ${bills(readByAi)} already read by the AI.`
    : 'From now on, bills uploaded to this inventory will be read by the AI, and the customer confirms each one. Bills already read by our team keep their reading, and bills still with our team stay with our team.'
}
