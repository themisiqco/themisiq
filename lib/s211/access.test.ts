import { describe, it, expect } from 'vitest'
import { parsePreviewIds, isPreviewUser, S211_PREVIEW_ENV } from './access'

describe('the S-211 preview allow-list', () => {
  it('reads a comma-separated list, trimming and dropping blanks', () => {
    expect([...parsePreviewIds(' a , b,,c ')]).toEqual(['a', 'b', 'c'])
  })
  it('unset or empty lets nobody in', () => {
    for (const raw of [undefined, null, '', ' , ']) expect(isPreviewUser('a', raw), String(raw)).toBe(false)
  })
  it('lets in exactly the listed ids', () => {
    expect(isPreviewUser('a', 'a,b')).toBe(true)
    expect(isPreviewUser('c', 'a,b')).toBe(false)
    expect(isPreviewUser('A', 'a,b')).toBe(false)
    expect(isPreviewUser('', 'a,b')).toBe(false)
    expect(isPreviewUser(null, 'a,b')).toBe(false)
  })
  it('is a server-only variable', () => {
    expect(S211_PREVIEW_ENV).toBe('S211_PREVIEW_USER_IDS')
    expect(S211_PREVIEW_ENV.startsWith('NEXT_PUBLIC_')).toBe(false)
  })
})
