// lib/ghg/dateWords.ts
//
// DATES AS A CUSTOMER READS THEM (T10c ruling): "14 March 2025", never "2025-03-14", wherever a date is
// shown. Pure, with no imports, so the engine, the workings cells and the components can all use it without
// an import cycle. A stored value that is not a real yyyy-mm-dd date is returned as stored: it is evidence of
// what was read, and rewording it would hide that it could not be read.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A calendar date in words, "1 October 2024", in local time. */
export function dateInWords(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** A stored yyyy-mm-dd date in words; anything else is returned unchanged. */
export function isoDateInWords(s: string | null | undefined): string {
  if (!s) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return s
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return s
  return dateInWords(dt)
}
