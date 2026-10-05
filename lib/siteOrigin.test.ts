import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { SITE_ORIGIN } from './siteOrigin'

// The canonical host (Lisa, 5 Oct 2026): https://www.themisiq.co, from ONE constant. A second literal would drift the
// day the host changes, which is how the results email came to link to the apex while Supabase sent www.
const ROOT = join(__dirname, '..')
const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : files(p)
  return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
})

describe('the site origin', () => {
  it('SO1: is https://www.themisiq.co', () => {
    expect(SITE_ORIGIN).toBe('https://www.themisiq.co')
  })

  it('SO2: no code in app/ or lib/ writes the origin itself: no apex URL, and the www URL only in lib/siteOrigin.ts', () => {
    const offenders: string[] = []
    for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'lib'))]) {
      const rel = relative(ROOT, f)
      const src = readFileSync(f, 'utf8')
      if (rel !== 'lib/siteOrigin.ts' && /https?:\/\/themisiq\.co\b/.test(src)) offenders.push(`${rel}: apex URL`)
      if (rel !== 'lib/siteOrigin.ts' && /https:\/\/www\.themisiq\.co/.test(src)) offenders.push(`${rel}: www URL`)
    }
    expect(offenders).toEqual([])
  })
})
