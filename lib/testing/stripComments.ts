/**
 * Blank out TypeScript and JSX comments, in place.
 *
 * ⚠️ IT REPLACES COMMENT SPANS WITH SPACES AND KEEPS EVERY NEWLINE, so the result is the same length as
 * the input and line and column numbers are unchanged. Every consumer of this reports `file:line` when it
 * finds something, so a stripper that deleted lines would renumber the answer.
 *
 * ⚠️ WHY A SPAN AND NOT A LINE, WHICH IS THE WHOLE POINT. Twenty-two test files in this repo strip
 * comments before matching, in four different shapes, and SIX of them agree on a LINE-granular
 * implementation — a Set of comment line numbers. That is consensus on the wrong thing rather than
 * evidence for it, because a line can be both:
 *
 *     try { body = await res.json() } catch { \/* a non-JSON body is still a failure below *\/ }
 *
 * Four lines of that shape exist in the tree (app/api/survey-invite/route.ts:58,
 * app/api/impact-invite/route.ts:51, app/verify/[token]/page.tsx:554,
 * app/verify-cbam/[token]/page.tsx:119). A line-granular stripper discards the whole line, so a guard
 * asserting "this route parses the body" passes on a file where it does not. THAT FAILURE IS INVISIBLE:
 * the test still passes, which is why it is worth a shared function rather than a seventh copy.
 *
 * ⚠️ AND THE PER-LINE FORM IS WORSE, WHICH IS WHAT PROMPTED THIS. Two guards tested each line on its own:
 *     t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')
 * That catches the FIRST line of a JSX comment and any continuation that happens to begin with `*`, and
 * misses a continuation beginning with prose. On 26 Sep 2026 that produced a wrong report and a wrong
 * edit in one session: app/climate-risk/page.tsx:153 was read as rendered copy and had a constant
 * interpolated into a comment, and two entries on a to-do list were classified from lines that were not
 * code. Nothing failed; the mistakes were found by a stripper that tracked state.
 *
 * ⚠️ STRING LITERALS ARE TRACKED, AND THAT IS A GUARD AGAINST A FUTURE CASE RATHER THAN A FIX FOR A
 * PRESENT ONE. No non-test file in the tree currently contains `\/*` or `*\/` inside a string literal — I
 * looked. It is handled anyway because the failure is total rather than local: a URL written
 * `'https://x\/*'` would open a block comment that never closes, and the rest of the file would be blanked
 * and read as empty by whatever guard called this. A test asserting "this claim appears in this file"
 * would then pass or fail for a reason nobody could see in the diff.
 *
 * ⚠️ WHAT IT DOES NOT TRACK: REGEX LITERALS, and that is safe rather than an omission. A `/` inside a
 * regex literal must be escaped as `\/`, so a well-formed regex cannot contain an unescaped `//` or `\/*`
 * — the scanner below looks one character ahead and sees the backslash. The repo's own regexes confirm it:
 * `.replace(/\/\/.*$\/, '')` in lib/pdf/palette.test.ts scans correctly. Implementing regex detection
 * would mean disambiguating it from division, which is genuinely ambiguous, for no gain here.
 *
 * ⚠️ AND IT IS NOT scripts/check-sql.py, DELIBERATELY. That strips SQL comments and tracks single-quoted
 * literals because it feeds a parser, where a mangled string is a syntax error rather than a missed match.
 * Different language, different escape rules, harder job. A SQL counterpart belongs in its own function
 * when something in lib/ needs one; nothing does today. See docs/backlog.md.
 */

type Ctx =
  | { k: 'code'; braces: number }      // braces: depth inside a ${…} interpolation, 0 at top level
  | { k: 'single' }
  | { k: 'double' }
  | { k: 'template' }

/**
 * Comments replaced by spaces, everything else byte-identical. Newlines are always preserved, including
 * those inside a block comment, so `split('\n')` on the result lines up with the original.
 */
export function stripTsComments(src: string): string {
  const out = src.split('')
  const stack: Ctx[] = [{ k: 'code', braces: 0 }]
  const top = () => stack[stack.length - 1]
  const blank = (i: number) => { if (out[i] !== '\n') out[i] = ' ' }

  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    const ctx = top()

    if (ctx.k === 'code') {
      if (c === '/' && n === '/') {                    // line comment, to the newline
        while (i < src.length && src[i] !== '\n') blank(i++)
        continue
      }
      if (c === '/' && n === '*') {                    // block comment, to the closer
        blank(i++); blank(i++)
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) blank(i++)
        if (i < src.length) { blank(i++); blank(i++) }
        continue
      }
      if (c === "'") { stack.push({ k: 'single' }); i++; continue }
      if (c === '"') { stack.push({ k: 'double' }); i++; continue }
      if (c === '`') { stack.push({ k: 'template' }); i++; continue }
      // Brace depth only matters inside an interpolation: `}` there returns to the template.
      if (ctx.braces > 0) {
        if (c === '{') ctx.braces++
        else if (c === '}') { ctx.braces--; if (ctx.braces === 0) stack.pop() }
      }
      i++
      continue
    }

    if (ctx.k === 'single' || ctx.k === 'double') {
      if (c === '\\') { i += 2; continue }
      const quote = ctx.k === 'single' ? "'" : '"'
      if (c === quote) { stack.pop(); i++; continue }
      // A newline cannot appear in a single- or double-quoted literal. Recovering here rather than
      // running to end of file means an unterminated quote costs one line, not the whole scan.
      if (c === '\n') { stack.pop(); i++; continue }
      i++
      continue
    }

    // template
    if (c === '\\') { i += 2; continue }
    if (c === '`') { stack.pop(); i++; continue }
    if (c === '$' && n === '{') { stack.push({ k: 'code', braces: 1 }); i += 2; continue }
    i++
  }

  return out.join('')
}

/**
 * The line numbers (1-based) that are ENTIRELY comment or blank once comments are gone. Provided for the
 * guards that only need to skip whole comment lines, so they get the correct answer without each keeping
 * its own scanner. Prefer stripTsComments where the guard matches within a line.
 */
export function commentOnlyLines(src: string): Set<number> {
  const stripped = stripTsComments(src).split('\n')
  const original = src.split('\n')
  const out = new Set<number>()
  stripped.forEach((line, i) => {
    if (line.trim() === '' && original[i].trim() !== '') out.add(i + 1)
  })
  return out
}
