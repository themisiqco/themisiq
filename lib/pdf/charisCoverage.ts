/**
 * Which characters the embedded Charis subset can draw, as a plain list of ranges, so a page can warn
 * about typed text BEFORE a PDF is built, without loading jsPDF and 170 KB of font into the browser.
 *
 * ⚠️ THE LIST MUST MATCH THE FONT, AND A TEST HOLDS IT THERE. charisCoverage.test.ts compares
 * charisCovers() with the cmap jsPDF reads out of the embedded bytes (charisCanDraw, lib/pdf/drawable.ts)
 * for every code point in the Basic Multilingual Plane. Regenerate the subset (lib/fonts/charis.ts) and
 * that test fails until this list is changed to match.
 *
 * The ranges are the pyftsubset --unicodes list in lib/fonts/charis.ts, less what the font does not
 * actually map inside them.
 */

export const CHARIS_RANGES: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e], // Basic Latin, printable
  [0x00a0, 0x00ff], // Latin-1 Supplement
  [0x2010, 0x2015], // hyphens and dashes
  [0x2018, 0x201f], // quotation marks
  [0x2020, 0x2022], // dagger, double dagger, bullet
  [0x2026, 0x2026], // ellipsis
  [0x2030, 0x2030], // per mille
  [0x2039, 0x203a], // single angle quotation marks
  [0x20ac, 0x20ac], // euro
  [0x2192, 0x2192], // rightwards arrow
]

export const charisCovers = (cp: number): boolean => CHARIS_RANGES.some(([a, b]) => cp >= a && cp <= b)

/** "U+0141" */
export const codePointLabel = (ch: string): string => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
