// lib/ghg/billReviewReading.ts
//
// BR1/BR2: how an inventory's bills are read (ghg_inventories.bill_review_reading, 20261011_bill_review_reading.sql),
// and the words for it. Pure. The value is BillReviewReading from lib/pricing.ts, the same 'ai' | 'human' the price uses.

import type { BillReviewReading } from '../pricing'

/** The stored value, or null when it is missing or anything else: null is never treated as 'ai'. */
export function readingOf(v: unknown): BillReviewReading | null {
  return v === 'ai' || v === 'human' ? v : null
}

/** The extract route's refusal for a human-read inventory (409). */
export const HUMAN_READ_REFUSAL = 'This inventory’s bills are read by a ThemisIQ specialist, so they are not sent to the AI.'
/** The extract route's refusal for a path stored before BR2, with no inventory in it (400). */
export const OLD_PATH_REFUSAL = 'Save the inventory, then upload the bill again.'

/** The note on a bill uploaded to a human-read inventory. Nothing reads it yet (BR4 and BR8 build the queue). */
export const HUMAN_READ_NOTE = 'Kept for a ThemisIQ specialist to read. It is not sent to the AI. Until it is read, type the figure into the box above.'
/** The note on a bill whose inventory's reading could not be confirmed: not sent, and said so. */
export const READING_UNKNOWN_NOTE = 'We couldn’t confirm how this inventory’s bills are read, so this one was not read. Type the figure into the box above.'

/** BR2: the upload saves the inventory first; when that save does not happen, nothing is uploaded, and it says so. */
export const UPLOAD_NEEDS_SAVED_INVENTORY = 'The inventory was not saved, so the file was not uploaded. Save the inventory, then upload the file again.'

/** Beside the assistant on a human-read inventory (BR2 ruling, decision 3). */
export const ASSISTANT_AI_NOTICE = 'What you type here is sent to the AI.'
