import { describe, it, expect } from 'vitest'
import { inflateSync } from 'node:zlib'
import { THEMISIQ_WORDMARK_PNG_B64, WORDMARK_WIDTH_PX, WORDMARK_HEIGHT_PX } from './logo'

/**
 * The wordmark raster in lib/pdf/logo.ts is placed on the cover of every generated report by
 * lib/pdf/layout.ts and lib/materiality/boardReportPdf.ts — documents a customer sends to a
 * verifier. Two of its properties are load-bearing, neither is expressible in the type system,
 * and both failed silently once.
 *
 * ⚠️ THE DEFECT THIS WOULD HAVE CAUGHT, WHICH SHIPPED. The 8 Sep 2026 logo swap embedded a PNG
 * whose alpha channel was present but FULLY OPAQUE — a white background baked into the raster.
 * jsPDF is correct to emit no /SMask when there is nothing to mask, so the mark rendered as a
 * pure white 148x44pt panel on the #f8f7f5 cover. The header of lib/pdf/logo.ts warned about
 * exactly this, in prose, directly above the constant: "RGBA MATTERS: the mark has a transparent
 * background... Flattening it onto white would show as a pale rectangle on the #f8f7f5 cover."
 * The warning was read, the file was edited beneath it, and the opaque PNG went in anyway.
 * A comment cannot fail a build. That is the whole argument for this file.
 *
 * ⚠️ IT ASSERTS ON THE DECODED CONSTANT, NEVER ON logo/themisiq-logo.png. The source PNG is a
 * handoff artefact that is re-exported by hand; the base64 here is what actually reaches a
 * document. They are supposed to match and are not guaranteed to — checking the file on disk
 * would prove a property of something no customer ever receives, and would pass while the
 * embedded bytes were stale.
 *
 * ⚠️ WHAT THIS FILE CANNOT PROVE. It reads the raster's own properties. It does not verify that
 * addImage is called with one dimension derived from the other (a stretched mark still has a
 * correct alpha channel and correct IHDR), that the mark is placed inside the page margins, or
 * that it is the right artwork at all — a transparent 1692x504 PNG of anything would pass.
 * lib/materiality/boardReport.test.ts has the matching limit from the other side: it proves the
 * document builds, not that what is on it looks right.
 */

/** The 8-byte PNG signature. Anything else and every offset below is meaningless. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const raster = () => Buffer.from(THEMISIQ_WORDMARK_PNG_B64, 'base64')

/** IHDR is fixed-position: it must be the first chunk, so these offsets are not a guess. */
function header(png: Buffer) {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colourType: png[25], // 0 grey, 2 RGB, 3 palette, 4 grey+A, 6 RGBA
    interlace: png[28],
  }
}

/** Concatenated IDAT payloads, inflated. */
function pixelData(png: Buffer): Buffer {
  const parts: Buffer[] = []
  let off = 8
  while (off < png.length - 8) {
    const len = png.readUInt32BE(off)
    const type = png.toString('latin1', off + 4, off + 8)
    if (type === 'IDAT') parts.push(png.subarray(off + 8, off + 8 + len))
    if (type === 'IEND') break
    off += 12 + len
  }
  return inflateSync(Buffer.concat(parts))
}

/**
 * The alpha byte of every pixel, with PNG scanline filters reversed.
 *
 * ⚠️ THE UNFILTERING IS NOT OPTIONAL AND CANNOT BE SKIPPED. Inflated IDAT bytes are not pixel
 * values: each scanline carries a filter byte and is encoded as a delta against its left
 * neighbour and the row above. Reading every 4th byte of the inflated stream would produce
 * numbers that look like alpha, are not, and would happen to contain a zero on almost any image —
 * so the transparency assertion below would pass for an opaque raster. That is the specific way
 * this test could rot into a test that always passes.
 *
 * Assumes 8-bit RGBA, non-interlaced. The format guard below is what makes that safe.
 */
function alphaChannel(png: Buffer, width: number, height: number): Uint8Array {
  const bpp = 4
  const stride = width * bpp
  const raw = pixelData(png)
  const alpha = new Uint8Array(width * height)
  let prev = Buffer.alloc(stride)
  let p = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const line = Buffer.from(raw.subarray(p, p + stride))
    p += stride

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0 // left
      const b = prev[i] // above
      const c = i >= bpp ? prev[i - bpp] : 0 // above-left
      switch (filter) {
        case 0: break // None
        case 1: line[i] = (line[i] + a) & 0xff; break // Sub
        case 2: line[i] = (line[i] + b) & 0xff; break // Up
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break // Average
        case 4: { // Paeth
          const est = a + b - c
          const da = Math.abs(est - a), db = Math.abs(est - b), dc = Math.abs(est - c)
          line[i] = (line[i] + (da <= db && da <= dc ? a : db <= dc ? b : c)) & 0xff
          break
        }
        default:
          throw new Error(`unknown PNG scanline filter ${filter} on row ${y}`)
      }
    }

    for (let x = 0; x < width; x++) alpha[y * width + x] = line[x * bpp + 3]
    prev = line
  }
  return alpha
}

describe('the wordmark raster embedded in lib/pdf/logo.ts', () => {
  it('decodes to a PNG', () => {
    // Guards everything below: a truncated or corrupted base64 would otherwise make each
    // assertion read arbitrary offsets and report a confusing failure instead of this one.
    const png = raster()
    expect(png.length).toBeGreaterThan(1000)
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE)
  })

  it('is 8-bit RGBA and non-interlaced, so the alpha check below is meaningful', () => {
    // Not housekeeping. A palette PNG (colour type 3) carries transparency in a tRNS chunk and
    // has no alpha byte per pixel, and an interlaced PNG stores rows in seven passes — under
    // either, alphaChannel() would decode nonsense while still returning numbers. The
    // transparency assertion would then be testing noise.
    const { bitDepth, colourType, interlace } = header(raster())
    expect(bitDepth, 'wordmark must be 8 bits per channel').toBe(8)
    expect(colourType, 'wordmark must be RGBA (colour type 6), not palette or plain RGB').toBe(6)
    expect(interlace, 'wordmark must not be interlaced').toBe(0)
  })

  it('declares dimensions that match the raster it ships', () => {
    // WORDMARK_ASPECT is derived from these two constants, and every call site places the mark by
    // setting one dimension and deriving the other from it. A re-export at different bounds with
    // the constants left alone puts the mark at the wrong height on every cover — stretched, with
    // no build error and nothing in the output to read as wrong except the shape of the logo.
    const { width, height } = header(raster())
    expect(width, 'WORDMARK_WIDTH_PX disagrees with the embedded raster').toBe(WORDMARK_WIDTH_PX)
    expect(height, 'WORDMARK_HEIGHT_PX disagrees with the embedded raster').toBe(WORDMARK_HEIGHT_PX)
  })

  it('has a transparent background, not a white one', () => {
    // THE ONE THAT SHIPPED BROKEN. alpha.min must be 0: the mark sits on the cover's own paper
    // colour, and a fully opaque raster is a white rectangle on #f8f7f5. jsPDF emits no /SMask
    // when no pixel is transparent, so this is also the property that decides whether the
    // generated PDF carries a soft mask at all.
    const { width, height } = header(raster())
    const alpha = alphaChannel(raster(), width, height)

    let min = 255
    let max = 0
    let transparent = 0
    for (const a of alpha) {
      if (a < min) min = a
      if (a > max) max = a
      if (a < 255) transparent++
    }

    expect(min, 'no fully transparent pixel: the wordmark was exported with a baked-in background')
      .toBe(0)
    expect(max, 'no fully opaque pixel: the wordmark appears to be blank').toBe(255)
    // A mark that is mostly ink would be a filled block. The real lockup is ~80% background.
    expect(transparent / alpha.length,
      'implausibly little transparency for a wordmark on a clear ground').toBeGreaterThan(0.5)
  })
})
