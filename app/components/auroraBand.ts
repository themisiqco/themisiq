/**
 * The aurora photograph, and the crop the closing bands share.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE TWO CLOSING BANDS ALREADY DRIFTED ONCE, AS TWO GRADATION BANDS. The
 * homepage's closing band and ClosingBand in modulePage.tsx are the same design on ten pages, and
 * before this they were kept in step by both reading --gradation-band. That token is not the shared
 * thing any more; this is. A band that reaches for its own path or its own objectPosition is the
 * drift, and it is invisible: the picture still renders, just cropped differently from its twin on
 * the next page along.
 *
 * ⚠️ THE HERO IS DELIBERATELY NOT IN HERE. It uses the same file and a different crop — '100% 100%',
 * anchored to the warm bottom-right corner — because it is tall enough to show most of the frame.
 * The closing bands are a thin slice of the same picture and take '100% 75%', which is a measured
 * value, not a taste: at '100% 100%' the brightest curtain and the glow land exactly behind the
 * right-hand buttons and the outline button's label fails 4.5:1 from 1600px up. The measurements and
 * the rejected crops are in the CLOSING BAND block in app/styles/themisiq-tokens.css.
 */

/** The one path. Both bands and the homepage hero read it. */
export const AURORA_SRC = '/home/hero-aurora.jpg'

/**
 * The closing bands' crop. NOT the hero's — see above.
 * Paired with .tq-close-wash, which carries the contrast measurements for exactly this crop.
 */
export const AURORA_CLOSE_POSITION = '100% 75%'
