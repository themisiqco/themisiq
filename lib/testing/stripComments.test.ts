import { describe, it, expect } from 'vitest'
import { stripTsComments, commentOnlyLines } from './stripComments'

/**
 * ⚠️ THE FIRST FOUR CASES ARE THE FAILURES THAT CAUSED THIS FILE TO EXIST, taken from the tree rather
 * than invented: a JSX comment continuation line beginning with prose, a line that is both code and
 * comment, and a comment marker inside a string. Each one produced a real wrong answer on 26 Sep 2026.
 */
describe('stripTsComments removes spans, not lines', () => {
  it('blanks a JSX comment continuation line that begins with prose', () => {
    // ⚠️ THE EXACT SHAPE THAT COST A WRONG REPORT AND A WRONG EDIT. app/climate-risk/page.tsx:153 is a
    // continuation line inside a multi-line JSX comment and begins with "is score the ten topics". Both
    // per-line forms in this repo read it as code, because it starts with neither // nor *.
    const src = [
      '{/* ⚠️ "screening", NOT "materiality". What this module does',
      '    is score the ten topics from industry baselines; what it',
      '    does not do is the stakeholder engagement. */}',
      '<p>is score the ten topics from industry baselines</p>',
    ].join('\n')
    const got = stripTsComments(src).split('\n')
    expect(got[1].trim(), 'the continuation line must be blank').toBe('')
    expect(got[3]).toContain('is score the ten topics')
    expect(got).toHaveLength(4)
  })

  it('keeps the code on a line that is BOTH code and comment', () => {
    // ⚠️ THE ARGUMENT FOR SPANS OVER LINES. Four lines of this shape are in the tree; a line-granular
    // stripper discards res.json() and the catch with it, so a guard asserting the body is parsed passes
    // on a file where it is not.
    const src = "try { body = await res.json() } catch { /* a non-JSON body is still a failure */ }"
    const got = stripTsComments(src)
    expect(got).toContain('res.json()')
    expect(got).toContain('catch')
    expect(got).not.toContain('non-JSON body')
    expect(got).toHaveLength(src.length)
  })

  it('does not treat a comment marker inside a string as a comment', () => {
    // A guard against a future case, not a present one: no non-test file in the tree holds a marker in a
    // string today. The failure would be total rather than local, which is why it is handled.
    const src = [
      "const u = 'https://example.com/*'",
      "const claim = 'this must still be found'",
    ].join('\n')
    const got = stripTsComments(src)
    expect(got, 'an unterminated block comment would blank the rest of the file')
      .toContain('this must still be found')
    expect(got.split('\n')[0]).toContain('https://example.com/*')
  })

  it('handles a marker inside a template literal, and code inside its interpolation', () => {
    const src = 'const s = `a//b ${x /* gone */ + 1} c`'
    const got = stripTsComments(src)
    expect(got, 'the // inside the template is string content').toContain('a//b')
    expect(got, 'a comment inside ${} is still a comment').not.toContain('gone')
    expect(got).toContain('+ 1')
  })

  it('blanks line and block comments, and preserves every newline', () => {
    const src = ['const a = 1 // one', '/* two', '   still two */', 'const b = 2'].join('\n')
    const got = stripTsComments(src)
    expect(got.split('\n')).toHaveLength(4)
    expect(got).toHaveLength(src.length)
    expect(got).toContain('const a = 1')
    expect(got).toContain('const b = 2')
    for (const gone of ['one', 'two', 'still']) expect(got).not.toContain(gone)
  })

  it('respects escapes, so an escaped quote does not end a string', () => {
    const src = String.raw`const s = 'it\'s /* not a comment */ fine'` + '\nconst keep = 1'
    const got = stripTsComments(src)
    expect(got).toContain('not a comment')
    expect(got).toContain('const keep = 1')
  })

  it('recovers from an unterminated quote at the newline rather than eating the file', () => {
    const src = ["const broken = 'oops", 'const keep = 1'].join('\n')
    expect(stripTsComments(src)).toContain('const keep = 1')
  })

  it('leaves a regex literal alone, because / inside one is always escaped', () => {
    // Not tracked as its own state, deliberately — see the note in stripComments.ts. This is the repo's
    // own regex, from lib/pdf/palette.test.ts.
    const src = String.raw`const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')` + '\nconst keep = 1'
    const got = stripTsComments(src)
    expect(got).toContain('const keep = 1')
    expect(got).toContain('replace(')
  })

  it('a QUOTE inside a regex does not open a string, which is what inflated three budgets', () => {
    // ⚠️ THE EXACT SHAPE THAT WENT WRONG. `replace(/"/g, '""')` is the ordinary way to escape a CSV cell.
    // Read without regex tracking, that `"` opened a string literal that never closed, so every comment
    // after it in the file was treated as code — and the em-dash ratchet counted their em dashes as
    // rendered copy. app/dashboard/scope3/page.tsx carried a budget of 34 whose true figure was zero.
    const src = [
      `const cell = (v) => \`"\${String(v).replace(/"/g, '""')}"\``,
      '// a comment with an em dash — it must be blanked',
      'const after = 2',
    ].join('\n')
    const got = stripTsComments(src)
    expect(got.split('\n')[1].trim(), 'the comment after the regex').toBe('')
    expect(got).not.toContain('em dash')
    expect(got).toContain('const after = 2')
    expect(got).toContain("replace(/\"/g")
  })

  it('a regex is only read where an expression may start, so .tsx survives', () => {
    // `</div>` and `{...} />` are the two shapes a permissive rule would swallow whole.
    const jsx = [
      'const el = <div className={cx}>',
      '  <Icon name={n} />',
      '  {/* a comment with an em dash — blanked */}',
      '</div>',
      'const after = 3',
    ].join('\n')
    const got = stripTsComments(jsx)
    expect(got).toContain('</div>')
    expect(got).toContain('<Icon name={n} />')
    expect(got).not.toContain('em dash')
    expect(got).toContain('const after = 3')
    // An arrow's `>` IS such a place, which is how a regex predicate parses.
    const arrow = "const t = (x) => /^a—b$/.test(x)\n// trailing em dash — blanked"
    const out = stripTsComments(arrow)
    expect(out).toContain('/^a—b$/.test(x)')
    expect(out.split('\n')[1].trim()).toBe('')
    // Division is not a regex: the dash in the comment after it is still blanked.
    const div = 'const r = (a + b) / c / d\n// an em dash — blanked'
    expect(stripTsComments(div).split('\n')[1].trim()).toBe('')
  })

  it('commentOnlyLines reports 1-based lines that are wholly comment', () => {
    const src = ['const a = 1', '// two', '/* three', '   four */', 'const b = 2 // trailing'].join('\n')
    expect([...commentOnlyLines(src)].sort((x, y) => x - y)).toEqual([2, 3, 4])
  })
})
