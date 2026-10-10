// lib/ghg/uploadPath.test.ts
//
// BR2: one builder for the wizard, one parser for the extract route.

import { describe, it, expect } from 'vitest'
import { buildUploadPath, parseUploadPath, pathSegment } from './uploadPath'

const U = '11111111-1111-4111-8111-111111111111'
const I = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('the BR2 upload path', () => {
  it('{userId}/{inventoryId}/{year}/{location}/{timestamp}_{file}', () => {
    expect(buildUploadPath(U, I, 2025, 'Head Office', 1760000000000, 'Jan bill (final).pdf'))
      .toBe(`${U}/${I}/2025/Head_Office/1760000000000_Jan_bill__final_.pdf`)
  })
  it('a "/" in a location or file name never adds a segment; an empty or all-symbol name has a stand-in', () => {
    const p = buildUploadPath(U, I, 2025, 'A/B', 1, 'x/y.pdf')
    expect(p.split('/')).toHaveLength(5)
    expect(pathSegment('', 'location')).toBe('location')
    expect(pathSegment('***', 'location')).toBe('location')
  })
  it('parses back to the user and inventory it was built with, whatever the names', () => {
    for (const loc of ['Leeds', 'A/B', '', 'Site #4, East']) expect(parseUploadPath(buildUploadPath(U, I, 2025, loc, 1, 'f.pdf'))).toEqual({ userId: U, inventoryId: I })
  })
  it('an old-format path, or anything else, is not a BR2 path', () => {
    for (const p of [`${U}/2025/Leeds/1_f.pdf`, `${U}/${I}/Leeds/1_f.pdf`, `${U}/not-a-uuid/2025/Leeds/1_f.pdf`, `${U}/${I}/2025/Leeds/x/1_f.pdf`,
      `${U}//2025/Leeds/1_f.pdf`, '', null, undefined]) expect(parseUploadPath(p as string), String(p)).toBeNull()
  })
})
