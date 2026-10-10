// lib/staff/serverOnly.test.ts
//
// BR3: lib/staff is server only. Two proofs: lib/staff/access.ts opens with import 'server-only' (Next fails the build
// when a client component imports it), and no client component reaches lib/staff through any chain of imports.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

const ROOT = process.cwd()
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}
const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*['"]use client['"]/.test(src)
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
  if (!base) return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}
const importsOf = (file: string) => [...readFileSync(file, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)]
  .map(m => m[1] ?? m[2] ?? m[3]).map(s => resolveImport(file, s)).filter((x): x is string => !!x)

describe('lib/staff is server only', () => {
  it('lib/staff/access.ts opens with import \'server-only\'', () => {
    expect(readFileSync(join(ROOT, 'lib/staff/access.ts'), 'utf8').split('\n')[0]).toBe("import 'server-only'")
  })
  it('no client component reaches lib/staff, through any chain of imports', () => {
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
    const clients = files.filter(f => isClient(readFileSync(f, 'utf8')))
    expect(clients.length, 'not vacuous: the wizard is a client component').toBeGreaterThan(10)
    expect(clients.map(f => relative(ROOT, f))).toContain('app/dashboard/ghg/page.tsx')
    const STAFF = join(ROOT, 'lib/staff') + '/'
    const reached: string[] = []
    for (const c of clients) {
      const seen = new Set<string>([c]); const stack = [c]
      while (stack.length) {
        const f = stack.pop()!
        for (const i of importsOf(f)) {
          if (i.startsWith(STAFF)) reached.push(`${relative(ROOT, c)} -> ${relative(ROOT, i)}`)
          if (!seen.has(i)) { seen.add(i); stack.push(i) }
        }
      }
    }
    expect(reached).toEqual([])
  })
  it('the walk bites: a client file importing lib/staff would be found', () => {
    expect(isClient("'use client'\nimport x from 'y'")).toBe(true)
    expect(isClient("// comment\n'use client'\n")).toBe(true)
    expect(resolveImport(join(ROOT, 'app/x.tsx'), '@/lib/staff/access')).toBe(join(ROOT, 'lib/staff/access.ts'))
    expect(resolveImport(join(ROOT, 'lib/ghg/x.ts'), '../staff/access')).toBe(join(ROOT, 'lib/staff/access.ts'))
  })
})
