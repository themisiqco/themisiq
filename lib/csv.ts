// ─────────────────────────────────────────────────────────────────────────────
// ONE CSV WRITER FOR EVERY EXPORT A CUSTOMER DOWNLOADS.
//
// ⚠️ FOUR OF THE EIGHT CSV EXPORTS JOINED CELLS WITH A BARE COMMA AND NO QUOTING, so any cell holding
// a comma spilled into the next column and every column after it shifted left. Live on 27 Sep 2026 in
// the supply chain risk register, the cyber gap assessment, the AI system inventory and the gender pay
// gap export. Not hypothetical: the affected cells include the company name, the supplier name,
// pay-band names, AI system names and purposes — all typed by the customer — and, in the register,
// ThemisIQ's own risk-factor sentences and its "Not available" explanation.
//
// Measured on the register's own row shape: a 10-column header, and a supplier row that parsed into
// FOURTEEN cells. Risk Score read "EUR 1" and Assessment Required read "High". The worst shape this
// defect could take — the file opens, every row has data, nothing errors, and the reader has no way to
// tell which rows moved.
//
// ⚠️ QUOTED ONLY WHERE RFC 4180 REQUIRES IT (a comma, a quote or a newline), which is what the Scope 3
// export already did correctly and locally. The two supplier portal exports quote every cell instead;
// both are valid and parse identically, and this is the one that keeps the committed Scope 3 surface
// snapshot byte-identical and leaves spacer rows genuinely empty rather than `""`.
//
// ⚠️ NO REGULAR EXPRESSIONS, AND THAT IS NOT A STYLE CHOICE. lib/testing/stripComments.ts tracks string
// literals but NOT regex literals, so a `/"/g` in a file opens a string in its model that never closes,
// and every comment after it is read as code. That is exactly how the em-dash ratchet came to hold a
// wrong count for app/dashboard/ghg/page.tsx: the hand-rolled `replace(/"/g, '""')` this file replaces
// was shifting the stripper's view of the whole page. Fixing the stripper is the ratchet commit's job;
// not planting another one is this file's.
//
// ⚠️ NOT papaparse's `unparse`, though papaparse IS already a dependency (app/dashboard/people reads
// uploaded CSVs with it). Pulling it into seven more page bundles to replace four lines is the wrong
// trade; it is used in lib/csv.test.ts instead, as an INDEPENDENT parser, so the round trip is proved
// by something other than the code under test.
// ─────────────────────────────────────────────────────────────────────────────

const QUOTE = '"'

/**
 * One cell. null and undefined become an empty cell, never the string "null".
 *
 * A number is stringified with no formatting: the exports that want thousands separators or fixed
 * decimals apply them before they get here, and a cell like "EUR 1,250,000" is then quoted because of
 * the separator.
 */
export function csvCell(v: unknown): string {
  const t = String(v ?? '')
  const needsQuoting = t.includes(',') || t.includes(QUOTE) || t.includes('\n') || t.includes('\r')
  return needsQuoting ? QUOTE + t.split(QUOTE).join(QUOTE + QUOTE) + QUOTE : t
}

/**
 * A whole CSV body. Rows may be ragged — the exports use `[]` and `['']` as spacers, and a spreadsheet
 * reads a short row as trailing empty cells.
 *
 * Rows are joined with LF, not CRLF. RFC 4180 says CRLF; every export in this repo has always written
 * LF and Excel, Numbers and Sheets all read it, so this keeps the existing bytes rather than changing
 * every file's line endings in a commit about quoting.
 */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\n')
}

/**
 * ⚠️ THE BYTE ORDER MARK IS FOR EXCEL ON WINDOWS, AND NOTHING ELSE NEEDS IT. Without it Excel decodes a
 * .csv as the system's legacy code page, so "Société Générale" opens as "SociÃ©tÃ© GÃ©nÃ©rale" — in the
 * supplier name, the company name and every pay-band label. Numbers, Sheets, LibreOffice and every
 * parser read UTF-8 regardless, and the three bytes are skipped as a BOM rather than shown.
 *
 * ⚠️ IT IS ADDED HERE AND NOT IN toCsv, SO THE TEXT STAYS THE TEXT. lib/scope3/scope3Surfaces.test.ts
 * snapshots the Scope 3 export's ROWS, and other guards read the body as a string; a BOM inside toCsv
 * would put an invisible character at the front of the first cell of everything that inspects it.
 *
 * ⚠️ AND IT DOES NOT BREAK THE FOUR CSV IMPORTERS. app/dashboard/people, app/dashboard/supply-chain,
 * the campaign portal and the materiality respondent import all call Papa.parse(file) with a File, and
 * the File API's decode step does BOM sniffing and drops it before papaparse sees a character.
 * papaparse strips one itself only for STRING input (papaparse.js:238), which is the path
 * lib/csv.test.ts exercises.
 */
export const CSV_BOM = '\ufeff'

/** The downloadable file: the BOM, the body, and the media type that names the encoding. */
export function csvBlob(rows: readonly (readonly unknown[])[]): Blob {
  return new Blob([CSV_BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
}
