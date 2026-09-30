import { describe, it, expect } from 'vitest'
import { createLayout } from './layout'
import { charisCanDraw } from './drawable'
import { charisCovers, codePointLabel } from './charisCoverage'

describe('the Charis coverage list matches the embedded font', () => {
  it('for every code point in the Basic Multilingual Plane', () => {
    const canDraw = charisCanDraw(createLayout().doc)
    const disagree: string[] = []
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue
      if (charisCovers(cp) !== canDraw(cp)) disagree.push(`${codePointLabel(String.fromCodePoint(cp))} list=${charisCovers(cp)} font=${canDraw(cp)}`)
    }
    expect(disagree).toEqual([])
  })

  it('Latin-1 accents are covered; Latin Extended-A is not', () => {
    for (const ch of 'éèàçôüñÉÇ') expect(charisCovers(ch.codePointAt(0)!), ch).toBe(true)
    for (const ch of 'ŁłŚśźżčřğış') expect(charisCovers(ch.codePointAt(0)!), ch).toBe(false)
    expect(codePointLabel('Ł')).toBe('U+0141')
  })
})
