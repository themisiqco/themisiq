import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// /calculate-emissions carried "$4,900 USD" in five places for months after GHG was repriced, because
// each was typed into the copy rather than read from lib/pricing.ts. Every price on this page now comes
// from ghgFrom, billReviewFrom or GHG_PRICED_BANDS. A dollar figure typed into the source is the
// regression; SB 253's "$1 billion" revenue threshold is the one literal that is not a price.
const SRC = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
  .split('\n')
  .filter(line => !line.trim().startsWith('//'))
  .join('\n')

describe('/calculate-emissions prices', () => {
  it('CP1: no hard-coded dollar figure other than the SB 253 revenue threshold', () => {
    const literals = [...SRC.matchAll(/\$\d[\d,]*/g)].map(m => m[0]).filter(m => m !== '$1')
    expect(literals).toEqual([])
  })

  it('CP2: the retired $4,900 GHG price is gone', () => {
    expect(SRC).not.toContain('4,900')
  })
})
