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

  it('commentOnlyLines reports 1-based lines that are wholly comment', () => {
    const src = ['const a = 1', '// two', '/* three', '   four */', 'const b = 2 // trailing'].join('\n')
    expect([...commentOnlyLines(src)].sort((x, y) => x - y)).toEqual([2, 3, 4])
  })
})
