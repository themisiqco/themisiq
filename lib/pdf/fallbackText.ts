/**
 * What a PDF prints for typed text its typeface cannot draw. Imports no font, so the check page can show
 * the same substitution the PDF will make (with lib/pdf/charisCoverage.ts as `canDraw`) without loading
 * jsPDF or Charis. The renderers pass the cmap-derived test from lib/pdf/drawable.ts instead.
 */

/**
 * The drawable form of `s`. A character the font can draw is kept as typed, accents and all: "é" is
 * in the subset and prints as "é". One it cannot draw is decomposed (NFD) and its combining marks
 * removed, so "ș" prints as "s"; if the base is still undrawable, as with "Ł" or "北", it prints "?".
 * A character is never simply removed.
 */
export const fallbackText = (s: string, canDraw: (cp: number) => boolean): string => {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (ch === '\n' || canDraw(cp)) { out += ch; continue }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    out += base && [...base].every(c => canDraw(c.codePointAt(0)!)) ? base : '?'
  }
  return out
}
