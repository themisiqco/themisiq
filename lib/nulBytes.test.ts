import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// ── NO NUL BYTE IN ANY SOURCE FILE ────────────────────────────────────────────────────────────────
//
// On 19 Sep 2026 lib/emissionFactors/defraTravel.ts was found to carry a literal NUL character, used as a
// Map-key separator inside a template string. The code ran, but git treats a file containing a NUL byte as
// binary, so its diff showed as "Binary files differ" rather than as text a reviewer could read. A NUL in
// source is always writable as the escape \u0000 (or \x00), which means the same thing and keeps the file
// text. This fails if one comes back, naming the file and the byte offset.
//
// ⚠️ "TRACKED" IS APPROXIMATED FROM .gitignore, not asked of git: the test walks the five source folders
// and skips what .gitignore excludes beneath them (app/concierge-test/, supabase/.temp/, *venv*/,
// __pycache__/, .env*), plus node_modules and .next. Binary reference files (the .xlsx workbooks under
// data/reference/) are not in the extension list, so they are never read.
//
// Fast: the whole set is ~535 files and ~13 MB, read once, in tens of milliseconds.

const ROOT = join(__dirname, '..')
const FOLDERS = ['app', 'lib', 'scripts', 'supabase', 'data']
const EXTENSIONS = ['.ts', '.tsx', '.js', '.py', '.json', '.sql', '.md']
const SKIP_DIRS = new Set(['node_modules', '.next', '__pycache__', '.temp'])
const SKIP_PATHS = ['app/concierge-test'] // .gitignore: app/concierge-test/

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const rel = relative(ROOT, path)
      if (statSync(path).isDirectory()) {
        if (SKIP_DIRS.has(name) || /venv/.test(name) || SKIP_PATHS.includes(rel)) continue
        walk(path)
      } else if (EXTENSIONS.some(e => name.endsWith(e)) && !name.startsWith('.env')) {
        out.push(path)
      }
    }
  }
  for (const f of FOLDERS) walk(join(ROOT, f))
  return out
}

/** Every file holding a NUL byte, with the offset of its first one. */
export function nulOffenders(paths: readonly string[], read: (p: string) => Buffer = p => readFileSync(p)): string[] {
  return paths.flatMap(p => {
    const at = read(p).indexOf(0)
    return at >= 0 ? [`${relative(ROOT, p)}: NUL byte at offset ${at}`] : []
  })
}

describe('source files are text', () => {
  it('N1 ⚠️ no source file under app/, lib/, scripts/, supabase/ or data/ contains a NUL byte', () => {
    const files = sourceFiles()
    // Not vacuous: a moved folder or a broken walk would otherwise pass with nothing scanned.
    expect(files.length).toBeGreaterThan(400)
    expect(files.some(f => f.endsWith(join('lib', 'emissionFactors', 'defraTravel.ts')))).toBe(true)
    expect(nulOffenders(files), 'write the character as the escape \\u0000 instead').toEqual([])
  })

  it('N2 the check itself finds a NUL and reports where it is', () => {
    const fake = new Map([
      [join(ROOT, 'lib/a.ts'), Buffer.from('const k = `a\u0000b`')],
      [join(ROOT, 'lib/b.ts'), Buffer.from('const k = `a\\u0000b`')], // the escape, as text: no NUL byte
    ])
    expect(nulOffenders([...fake.keys()], p => fake.get(p)!)).toEqual(['lib/a.ts: NUL byte at offset 12'])
  })
})
