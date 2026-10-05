import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CLEARED_ENV, KEPT_ENV } from './clearedEnv'

// Guard (Oct 2026): every environment variable app/ or lib/ reads is either cleared before each test file
// (vitest.setup.ts) or deliberately kept, so a new secret cannot make a test pass locally and fail on Vercel.
const ROOT = join(__dirname, '..', '..')
const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : files(p)
  return /\.(ts|tsx|mts|js|mjs)$/.test(n) ? [p] : []
})

/** The names a source file reads: process.env.NAME, process.env['NAME'], and process.env[CONST] with const CONST = 'NAME'. */
export function envNamesRead(src: string): { names: string[]; unresolved: string[] } {
  const names = new Set<string>()
  const unresolved: string[] = []
  for (const m of src.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1])
  for (const m of src.matchAll(/process\.env\[\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g)) names.add(m[2])
  for (const m of src.matchAll(/process\.env\[\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\]/g)) {
    const c = new RegExp(`const\\s+${m[1]}\\s*=\\s*(['"\`])([A-Za-z_][A-Za-z0-9_]*)\\1`).exec(src)
    if (c) names.add(c[2])
    else unresolved.push(m[1])
  }
  return { names: [...names], unresolved }
}

describe('the test environment', () => {
  it('ENV1: every process.env name read in app/ or lib/ is cleared before each test file, or listed as kept', () => {
    const known = new Set<string>([...CLEARED_ENV, ...KEPT_ENV])
    const missing: string[] = []
    const unresolved: string[] = []
    for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'lib'))]) {
      const rel = relative(ROOT, f)
      if (rel === 'lib/testing/clearedEnv.test.ts') continue
      const r = envNamesRead(readFileSync(f, 'utf8'))
      for (const n of r.names) if (!known.has(n)) missing.push(`${rel}: ${n}`)
      for (const u of r.unresolved) unresolved.push(`${rel}: process.env[${u}]`)
    }
    expect(missing, 'add each to CLEARED_ENV (or, with a reason, KEPT_ENV) in lib/testing/clearedEnv.ts').toEqual([])
    expect(unresolved, 'read env vars by a literal name, or through a const holding one').toEqual([])
  })

  it('ENV2: the scanner sees all three ways of reading a name', () => {
    expect(envNamesRead("process.env.A_KEY; process.env['B_KEY']; const C = 'C_KEY'; process.env[C]").names.sort()).toEqual(['A_KEY', 'B_KEY', 'C_KEY'])
    expect(envNamesRead('process.env[someVar]').unresolved).toEqual(['someVar'])
  })

  it('ENV3: the setup file is wired, and the cleared names are absent inside a test', () => {
    expect(readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')).toContain("setupFiles: ['./vitest.setup.ts']")
    for (const n of CLEARED_ENV) expect(process.env[n], n).toBeUndefined()
  })
})
