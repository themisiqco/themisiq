// lib/s211/defaults.ts
// Small defaults for the S-211 builder. Pure.

/**
 * The reporting year to offer when starting a report: the next report due. A report is due by May 31, so
 * up to and including May 31 that is this year's; after it, next year's. On 30 September 2026: 2027.
 */
export const defaultReportingYear = (today: Date): number => {
  const m = today.getMonth() + 1, d = today.getDate()
  return m < 5 || (m === 5 && d <= 31) ? today.getFullYear() : today.getFullYear() + 1
}

/** A checklist tick with an exclusive option ("None"): ticking it clears the rest, ticking another clears it. */
export const toggleChecklist = (picked: readonly string[], option: string, checked: boolean, exclusive?: string): string[] => {
  if (!checked) return picked.filter(p => p !== option)
  if (exclusive && option === exclusive) return [exclusive]
  return [...picked.filter(p => p !== exclusive && p !== option), option]
}
