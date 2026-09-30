/**
 * Typed text and the embedded typeface: can Charis draw it, and what to draw when it cannot.
 *
 * Moved here from lib/deals/reportPdf.ts on 30 Sep 2026 so the S-211 report (lib/s211/reportPdf.ts) can
 * share it without importing the Deals report. lib/deals/reportPdf.ts re-exports both names, so its
 * callers and tests are unchanged.
 *
 * Charis is embedded as a subset, and a character outside it prints as NOTHING (lib/fonts/charis.ts).
 * A report's own prose is tested to stay inside the subset; what a user typed cannot be. So every typed
 * string drawn passes through fallbackText: a character the font cannot draw loses its accent if that
 * makes it drawable, and becomes "?" if not. Nothing is dropped.
 */

import type jsPDF from 'jspdf'
import { CHARIS_FAMILY } from '../fonts/charis'

type FaceStyle = 'normal' | 'bold' | 'italic'
const FACES: FaceStyle[] = ['normal', 'bold', 'italic']

/**
 * Can every embedded face draw this code point? Read from the cmap jsPDF itself parsed out of the
 * embedded bytes, so it is the same answer the renderer will act on. All three faces, because a
 * string may be set in any of them.
 */
export const charisCanDraw = (doc: jsPDF): ((cp: number) => boolean) => {
  const maps = FACES.map(style => {
    const font = (doc as unknown as { internal: { getFont: (f: string, s: string) => { metadata?: { cmap?: { unicode?: { codeMap?: Record<number, number | undefined> } } } } } })
      .internal.getFont(CHARIS_FAMILY, style)
    const codeMap = font.metadata?.cmap?.unicode?.codeMap
    if (!codeMap) throw new Error(`Charis ${style} is not registered on this document, so its coverage cannot be read.`)
    return codeMap
  })
  return (cp: number) => maps.every(m => !!m[cp])
}

// fallbackText lives in lib/pdf/fallbackText.ts, which imports no font, so a browser page can use it
// without loading Charis. Re-exported here for the PDF renderers.
export { fallbackText } from './fallbackText'
