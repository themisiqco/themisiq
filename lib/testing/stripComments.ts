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
/**
 * ⚠️ REGEX LITERALS ARE TRACKED, AND THE COST OF NOT TRACKING THEM WAS THREE WRONG NUMBERS. A regex may
 * contain a quote — `replace(/"/g, '""')` is the ordinary way to escape a CSV cell — and without this the
 * scanner read that `"` as the start of a string literal that never closed, so every comment after it in
 * the file was counted as code. The em-dash ratchet carried inflated budgets for
 * app/dashboard/ghg/page.tsx and app/dashboard/supply-chain/portal/[id]/page.tsx, and a budget of 34 for
 * app/dashboard/scope3/page.tsx whose true figure was ZERO — which scope3Copy.test.ts, which parses with
 * TypeScript instead, had been asserting all along. Two guards disagreed for weeks and the parser was
 * right.
 *
 * ⚠️ A `/` IS ONLY A REGEX WHERE AN EXPRESSION MAY START, and in .tsx the exceptions matter more than the
 * rule. `</div>` and `{...} />` are everywhere, so `<` and `}` are NOT treated as places a regex may
 * begin; `>` is only such a place when it closes an arrow (`=>`), which is how `x => /re/.test(x)` works.
 * Getting this wrong in the permissive direction would swallow whole JSX subtrees.
 *
 * ⚠️ AND A MISREAD COSTS ONE CHARACTER, NOT THE FILE. A regex literal cannot span a line, so the scan
 * gives up at a newline and the `/` is then treated as ordinary punctuation — the same recovery the
 * unterminated-quote branch uses, and the reason a heuristic is safe here at all.
 */
const REGEX_MAY_START_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', ';', '+', '-', '*', '%', '^', '~'])
const REGEX_MAY_START_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'case', 'new', 'delete', 'void', 'do', 'else', 'yield',
  'await', 'throw',
])

/** The end of the regex literal beginning at `i`, flags included, or null if that is not what this is. */
function regexEnd(src: string, i: number): number | null {
  let j = i + 1
  let inClass = false
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') { j += 2; continue }
    if (c === '\n') return null          // a regex literal cannot span a line: this was division
    if (c === '[') { inClass = true; j++; continue }
    if (c === ']') { inClass = false; j++; continue }
    if (c === '/' && !inClass) {
      j++
      while (j < src.length && /[a-z]/i.test(src[j])) j++
      return j
    }
    j++
  }
  return null
}

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
      if (c === '/') {
        // Everything before i is final in `out`, and comments there are already spaces, so walking back
        // over whitespace lands on the last significant character without re-scanning for comments.
        let b = i - 1
        while (b >= 0 && (out[b] === ' ' || out[b] === '\n' || out[b] === '\t' || out[b] === '\r')) b--
        const prev = b >= 0 ? out[b] : undefined
        let word = ''
        if (prev !== undefined && /[A-Za-z_$]/.test(prev)) {
          let w = b
          while (w >= 0 && /[A-Za-z0-9_$]/.test(out[w])) w--
          word = out.slice(w + 1, b + 1).join('')
        }
        const mayStart = prev === undefined
          || REGEX_MAY_START_AFTER.has(prev)
          || (prev === '>' && b >= 1 && out[b - 1] === '=')
          || REGEX_MAY_START_AFTER_WORD.has(word)
        if (mayStart) {
          const end = regexEnd(src, i)
          if (end !== null) { i = end; continue }
        }
        i++
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
