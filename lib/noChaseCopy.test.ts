import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

// ─────────────────────────────────────────────────────────────────────────────
// THE WORD "CHASE" IS RULED OUT OF ALL COPY (Lisa, Oct 2026): "chase", "chases", "chased", "chasing".
//
// Read with the TypeScript parser, as lib/emDashCopy.test.ts reads em dashes: only what a customer can see
// is text, so string literals, template pieces and JSX text are checked and comments never are. A comment
// may say "chase"; a variable may be named `chase`; neither reaches a screen.
//
// Test files are not copy and are not read (lib/emDashCopy.test.ts skips them the same way). Two tests
// check rendered emails for the word themselves: app/api/assessment/submit/email.test.ts and
// lib/lead1L10.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..')
const WORD = /\bchas(e|es|ed|ing)\b/i

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(e.name)) out.push(rel)
  }
  return out
}

const sourceFiles = (): string[] =>
  [...walk('app'), ...walk('lib')]
    .map(f => relative('.', f))
    .filter(f => !f.includes('.test.'))
    .sort()

/** Every customer-facing piece of a file that carries the word, as "file:line: text". */
function hits(rel: string): string[] {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true,
    rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    let text: string | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    else if (ts.isJsxText(n)) text = n.text
    if (text !== null && WORD.test(text)) {
      out.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${text.trim()}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

describe('no "chase" in copy', () => {
  it('reads files, so the check is not vacuous', () => {
    expect(sourceFiles().length).toBeGreaterThan(100)
  })

  it('the pattern matches the word and its forms, and not words that contain it', () => {
    for (const w of ['chase', 'Chases', 'chased', 'CHASING']) expect(WORD.test(w), w).toBe(true)
    for (const w of ['purchase', 'purchased', 'chaser', 'steeplechase']) expect(WORD.test(w), w).toBe(false)
  })

  it('no string literal, template piece or JSX text in app/ or lib/ carries it', () => {
    expect(sourceFiles().flatMap(hits)).toEqual([])
  })
})
