// lib/ghg/fileHash.test.ts
//
// T15 (rule R6): the upload hash is SHA-256 of the file's bytes, hex, computed before upload, and a failure to
// hash never stops an upload.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from './fileHash'
import { stripTsComments } from '../testing/stripComments'

describe('sha256Hex', () => {
  it('is the hex SHA-256 of the bytes', async () => {
    // FIPS 180-2 test vector for "abc".
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('gives null, never a throw, when the file cannot be read', async () => {
    const unreadable = { arrayBuffer: () => Promise.reject(new Error('gone')) } as unknown as Blob
    await expect(sha256Hex(unreadable)).resolves.toBeNull()
  })
})

describe('the upload stores the hash, and never waits on it', () => {
  const page = stripTsComments(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8'))
  const upload = page.slice(page.indexOf('const handleFileUpload'), page.indexOf('const handleFileUpload') + 4000)

  it('hashes before the storage upload and stores sha256 only when there is one', () => {
    expect(upload).toContain('const sha256 = await sha256Hex(file)')
    expect(upload.indexOf('sha256Hex(file)')).toBeLessThan(upload.indexOf(".from('source-documents').upload(path, file)"))
    expect(upload).toContain('...(sha256 ? { sha256 } : {})')
    // No branch on a missing hash: the upload goes ahead either way.
    expect(upload).not.toMatch(/if \(!sha256\)/)
  })
})
