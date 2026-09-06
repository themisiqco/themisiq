import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A DECLARATION STATE THE ENGINE CAN EMIT AND A SURFACE CANNOT NAME RENDERS AS AN ORDINARY ROW.
//
// The declaration rows are the ones that say an inventory is INCOMPLETE — attested absent, never
// declared, excluded from totals, declared with no figure. Each surface renders them by matching the
// engine's string: a union type on the verifier page, and a chain of `=== 'value'` branches on both
// pages. A value that no branch matches falls through to the priced-row path and renders in the
// ordinary striped background with no badge, no amber, and no evidence sentence. The one row on the
// page that says a total is short becomes the least visible thing in the table.
//
// ⚠️ THIS HAS ALREADY HAPPENED TWICE, IN THE SAME UNION.
//   1. 'unpriceable' was emitted by the engine and shipped unnamed in the verifier union. Every
//      excluded location rendered as a dash in every column, in the ordinary background — the row
//      stating that the totals on the page omit a whole site, styled as if it were routine.
//   2. 'declared_unquantified' did exactly the same thing a week later, and was caught only because
//      someone went looking after the first one. It is the state where the operator has affirmatively
//      said a stream is present and supplied no figure: the most concerning of the four, and it was
//      rendering with no badge and no amber on both surfaces.
// Twice is a pattern, and the fix for a pattern is not a third careful reviewer. Both times the code
// type-checked, the whole suite was green, and the defect was visible only to someone opening the
// page and knowing what should have been there.
//
// Reads FILES FROM DISK, like the date, posture and link guards. The verifier page's union and the
// engine's literals are in different packages with no import between them; nothing in the type system
// connects a string the engine writes into an `any[]` row to a string a page compares it against.

const ROOT = process.cwd()

const ENGINE = 'lib/ghg/engine.ts'
const VERIFIER = 'app/verify/[token]/page.tsx'
const DASHBOARD = 'app/dashboard/ghg/page.tsx'

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// Block-aware, matching lib/sources.test.ts and the three date guards. Only the FIRST line of a
// `/* … */` or `{/* … */}` carries a marker, and the comments around these very branches quote the
// state names as prose — the verifier page's new branch is introduced by a seven-line JSX comment that
// names 'undeclared' in the middle of it. A line-based check would read the explanation as code.
// Bias preserved: a comment opened AFTER code on the same line does not make the line prose.
const commentLineNumbers = (src: string): Set<number> => {
  const out = new Set<number>()
  let inBlock = false
  src.split('\n').forEach((line, i) => {
    const n = i + 1
    const t = line.trimStart()
    if (inBlock) { out.add(n); if (line.includes('*/')) inBlock = false; return }
    if (t.startsWith('//') || t.startsWith('*')) { out.add(n); return }
    if (t.startsWith('/*') || t.startsWith('{/*')) { out.add(n); if (!line.includes('*/')) inBlock = true }
  })
  return out
}

const codeLines = (src: string): string[] => {
  const comments = commentLineNumbers(src)
  return src.split('\n').filter((_, i) => !comments.has(i + 1))
}

// ── THE THREE EXTRACTORS ─────────────────────────────────────────────────────────────────────────
// Exported so the prove-it-bites tests run the SAME matchers over planted source rather than a
// paraphrase of them. A guard whose extractor is never demonstrated to work is a guard nobody checked.

/** Every string literal the engine assigns to `declaration:` — what a surface may be handed. */
export const emittedByEngine = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const line of codeLines(src)) {
    for (const m of line.matchAll(/\bdeclaration:\s*'([a-z_]+)'/g)) out.add(m[1])
  }
  return out
}

/** Members of the `declaration?: 'a' | 'b' | …` union on the verifier page's WorkingRow. */
export const unionMembers = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const line of codeLines(src)) {
    if (!/\bdeclaration\?\s*:/.test(line)) continue
    for (const m of line.matchAll(/'([a-z_]+)'/g)) out.add(m[1])
  }
  return out
}

/**
 * Every value a surface compares against ANYWHERE — `w.declaration === 'x'` / `r.declaration === 'x'`,
 * including the background ternary. Broad on purpose: used for the DEAD-state direction, where any
 * surviving mention of a retired value is the thing worth flagging.
 */
export const branchedOn = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const line of codeLines(src)) {
    for (const m of line.matchAll(/\bdeclaration\s*===\s*'([a-z_]+)'/g)) out.add(m[1])
  }
  return out
}

/**
 * Values that have an actual RENDER BRANCH, in the two forms the two surfaces use:
 *   verifier  `{w.declaration === 'x' && (`      → badge + evidence sentence
 *   dashboard `if (r.declaration === 'x') {`     → early-return row
 *
 * ⚠️ NARROWER THAN branchedOn, AND THE DIFFERENCE IS LOAD-BEARING — found by mutation, not by design.
 * The first draft used branchedOn here. Deleting the verifier's entire badge-and-sentence block while
 * leaving the amber background condition intact left the guard GREEN: the background line contains
 * `=== 'declared_unquantified'` too, so a state could have colour and no label and pass. That is a
 * real half-fix and close to the shape of the original defect — a row that looks handled and tells the
 * reader nothing. The background ternary is excluded by its trailing `?` and `||`; only `&& (` and
 * `) {` count.
 */
export const renderBranchedOn = (src: string): Set<string> => {
  const out = new Set<string>()
  for (const line of codeLines(src)) {
    for (const m of line.matchAll(/\bdeclaration\s*===\s*'([a-z_]+)'\s*(?:&&|\)\s*\{)/g)) out.add(m[1])
  }
  return out
}

// A state that DELIBERATELY renders through the ordinary path, with the reason. Empty today, and it
// should stay that way: every declaration row exists to say something is missing, and a row saying
// something is missing has no business looking like a row that is fine. This exists so that the next
// person with a genuine exception adds one line here with a justification, instead of deleting the
// test — which is the failure mode that ends guards. Same role as EXCLUDED_FILES in lib/sources.test.ts.
const RENDERED_GENERICALLY = new Set<string>([])

const fix = (missing: string[], where: string, how: string) =>
  `\n\nMISSING FROM ${where}:\n` + missing.map(m => `  '${m}'`).join('\n') + `\n\nTO FIX: ${how}\n`

describe('every declaration state the engine emits is named by both surfaces', () => {
  const engineStates = emittedByEngine(read(ENGINE))
  const verifierSrc = read(VERIFIER)
  const dashboardSrc = read(DASHBOARD)

  it('the extractors found something — a broken regex would pass every test below vacuously', () => {
    // Without this, a regex that silently matched nothing would make the whole file green forever, in
    // exactly the "an empty result is a result" way this repo has been bitten by elsewhere.
    //
    // ⚠️ ASSERTS NON-EMPTY, NOT A COUNT. An earlier draft required >= 4 on each extractor, and the
    // first time it was exercised — one state removed from the verifier union — it failed ALONGSIDE the
    // coverage test, announcing "no union members found … the extractor is broken". The extractor had
    // worked perfectly; the count was simply coupled to how many states happened to exist that day. An
    // error message that guesses at a cause it has not checked will eventually name the wrong one, and
    // this one did so on its first outing. One defect must produce one failure, and that failure must
    // say the true thing. Coverage is the next three tests' job; this one only proves the tools work.
    expect(engineStates.size, `no 'declaration:' literals found in ${ENGINE} — the extractor matched nothing`).toBeGreaterThan(0)
    expect(unionMembers(verifierSrc).size, `no 'declaration?:' union found in ${VERIFIER} — the extractor matched nothing`).toBeGreaterThan(0)
    expect(renderBranchedOn(verifierSrc).size, `no 'declaration === … && (' render branches found in ${VERIFIER} — the extractor matched nothing`).toBeGreaterThan(0)
    expect(renderBranchedOn(dashboardSrc).size, `no 'declaration === … ) {' render branches found in ${DASHBOARD} — the extractor matched nothing`).toBeGreaterThan(0)
    // The four the engine emits today, pinned BY NAME rather than by count — a name cannot go stale
    // quietly the way `>= 4` can. Adding a fifth state does not touch this list; the coverage tests
    // below pick it up on their own. Removing one is meant to fail here, and the message says so.
    for (const s of ['attested_absent', 'undeclared', 'unpriceable', 'declared_unquantified']) {
      expect(engineStates.has(s), `${ENGINE} no longer emits '${s}'. If that removal is intended, drop it from this list AND from both surfaces — see the dead-state test below.`).toBe(true)
    }
  })

  it('the verifier page UNION names every state the engine can emit', () => {
    const named = unionMembers(verifierSrc)
    const missing = [...engineStates].filter(s => !named.has(s)).sort()
    expect(missing, missing.length === 0 ? '' :
      `THE VERIFIER PAGE CANNOT NAME A STATE THE ENGINE EMITS.` +
      fix(missing, `the declaration union in ${VERIFIER}`,
        `add each value to the 'declaration?:' union on WorkingRow, AND give it a render branch\n` +
        `(the next test checks that separately — the union alone only silences TypeScript).\n\n` +
        `WHY THIS TEST EXISTS: this has shipped twice. 'unpriceable' was emitted and unnamed, so every\n` +
        `excluded location rendered as an ordinary striped row with a dash in every column. Then\n` +
        `'declared_unquantified' did the same. Both type-checked. Both passed the whole suite. The row\n` +
        `that tells a verifier the totals are incomplete became the least visible row on the page.`),
    ).toEqual([])
  })

  it('the verifier page has a RENDER BRANCH for every state the engine can emit', () => {
    // The union and the branches are separate failures. Adding to the union satisfies the compiler and
    // changes nothing on the page: the row still falls through to the priced-row path. That is exactly
    // how a half-fix would look, so it is checked on its own.
    const branched = renderBranchedOn(verifierSrc)
    const missing = [...engineStates].filter(s => !branched.has(s) && !RENDERED_GENERICALLY.has(s)).sort()
    expect(missing, missing.length === 0 ? '' :
      `THE VERIFIER PAGE HAS NO RENDER BRANCH FOR A STATE THE ENGINE EMITS.` +
      fix(missing, `the 'w.declaration === …' branches in ${VERIFIER}`,
        `give each state a badge and an evidence sentence, and add it to the amber background\n` +
        `condition. Model them on the four that exist — each says what the row IS AS EVIDENCE, in a\n` +
        `verifier's terms, not the operator's. Put a new branch NEXT TO the one it is most likely to be\n` +
        `confused with, and make the badge share no word with it.\n\n` +
        `If the state genuinely should render as an ordinary row, add it to RENDERED_GENERICALLY in\n` +
        `this file WITH A REASON — do not delete this test.`),
    ).toEqual([])
  })

  it('the dashboard has a RENDER BRANCH for every state the engine can emit', () => {
    const branched = renderBranchedOn(dashboardSrc)
    const missing = [...engineStates].filter(s => !branched.has(s) && !RENDERED_GENERICALLY.has(s)).sort()
    expect(missing, missing.length === 0 ? '' :
      `THE OPERATOR DASHBOARD HAS NO RENDER BRANCH FOR A STATE THE ENGINE EMITS.` +
      fix(missing, `the 'r.declaration === …' branches in ${DASHBOARD}`,
        `add an early-return row before the 'undeclared' branch: amber (#FEF3E2 / var(--color-module-climate)), r.note in\n` +
        `the note cell, '—' in the result cell. This surface has no badges, so the engine's own note\n` +
        `does that work — which is what keeps the two pages saying the same thing about the same row.\n\n` +
        `WITHOUT A BRANCH the row falls through to the normal fuel row. It does not crash and the note\n` +
        `still renders, which is worse than a crash: it looks fine, sitting unhighlighted among priced\n` +
        `rows, and nothing on screen says an operator needs to act.`),
    ).toEqual([])
  })

  // ── THE REVERSE DIRECTION ────────────────────────────────────────────────────────────────────────
  //
  // FAILS, and deliberately in its own `it()` rather than folded into the tests above. The two
  // directions are not the same defect and must not share a verdict:
  //   forward  — a surface cannot name a state the engine emits → a verifier is shown an unlabelled
  //              row about an incomplete inventory. Real harm, and it has happened twice.
  //   reverse  — a surface names a state the engine can no longer emit → dead code. Renders to nobody.
  //              Costs nothing today; misleads the next reader, who will take the branch as evidence
  //              the state still exists and reason about a state that is gone.
  // It fails rather than warns because a console warning in a green run is not read by anyone, and
  // removing a state is a deliberate act that should carry its render branches out with it in the same
  // commit. It is SEPARATE so that someone mid-rename who hits only this half can skip this one test
  // for one commit without disabling the load-bearing three — which is how a guard that cries wolf at
  // the wrong moment normally gets deleted outright.
  it('neither surface names a state the engine can no longer emit', () => {
    const stale: string[] = []
    for (const [label, src] of [[VERIFIER, verifierSrc], [DASHBOARD, dashboardSrc]] as const) {
      for (const s of branchedOn(src)) if (!engineStates.has(s)) stale.push(`${label} — branch on '${s}'`)
    }
    for (const s of unionMembers(verifierSrc)) if (!engineStates.has(s)) stale.push(`${VERIFIER} — union member '${s}'`)

    expect(stale, stale.length === 0 ? '' :
      `DEAD DECLARATION STATE — a surface handles something the engine no longer emits:\n\n${stale.join('\n')}\n\n` +
      `THIS IS NOT A CORRECTNESS BUG. Nothing renders wrong; the branch is simply unreachable. It is\n` +
      `flagged because the next person to read that branch will take it as evidence the state still\n` +
      `exists and reason about an inventory state that is gone.\n\n` +
      `TO FIX: delete the branch (and the union member), or restore the engine state if the removal was\n` +
      `the mistake. If you are mid-rename and the forward tests are green, this one test may be skipped\n` +
      `for that commit — do NOT skip the three above.\n`,
    ).toEqual([])
  })

  // ── PROOF THAT EACH EXTRACTOR BITES ──────────────────────────────────────────────────────────────
  //
  // A green scan is equally consistent with a matcher that catches nothing. lib/sb253.test.ts went
  // green for months while blind to the one spelling that mattered.
  it('the extractors find planted values, and the coverage check catches a gap', () => {
    expect([...emittedByEngine(`  rows.push({ declaration: 'fifth_state', result_tco2e: null })`)]).toEqual(['fifth_state'])
    expect([...unionMembers(`  declaration?: 'attested_absent' | 'fifth_state'`)].sort()).toEqual(['attested_absent', 'fifth_state'])
    expect([...renderBranchedOn(`      {w.declaration === 'fifth_state' && (`)]).toEqual(['fifth_state'])
    expect([...renderBranchedOn(`      if (r.declaration === 'fifth_state') {`)]).toEqual(['fifth_state'])
    // The background ternary names the state but is NOT a render branch — the distinction mutation found.
    const bg = `                    background: w.declaration === 'fifth_state' ? '#FEF3E2'`
    expect([...branchedOn(bg)], 'the broad matcher should still see it').toEqual(['fifth_state'])
    expect([...renderBranchedOn(bg)], 'amber alone must NOT count as handling the state').toEqual([])

    // The whole point, in miniature: an engine that emits a value the union omits.
    const engine = `  rows.push({ declaration: 'undeclared' })\n  rows.push({ declaration: 'fifth_state' })`
    const union = unionMembers(`  declaration?: 'attested_absent' | 'undeclared' | 'unpriceable'`)
    const gap = [...emittedByEngine(engine)].filter(s => !union.has(s))
    expect(gap, 'the coverage check did not notice a state missing from the union').toEqual(['fifth_state'])
  })

  it('does NOT fire on prose that quotes the state names — the crying-wolf check', () => {
    // The comments around these branches quote the names constantly; the verifier page's own new branch
    // is introduced by a JSX comment naming 'undeclared'. A guard that flagged its own documentation
    // would be deleted, and the real regression would walk in behind it.
    const jsxBlock = [
      "          {/* PLACED IMMEDIATELY AFTER 'undeclared', because these two are the pair a reader",
      "              must never confuse. Before this, declaration: 'unpriceable' rendered generically",
      "              and w.declaration === 'unpriceable' had no branch at all. */}",
    ].join('\n')
    expect(emittedByEngine(jsxBlock), 'a JSX comment was read as an engine emission').toEqual(new Set())
    expect(branchedOn(jsxBlock), 'a JSX comment was read as a render branch').toEqual(new Set())

    const lineComment = "  // rows.push({ declaration: 'retired_state' }) — removed in the Aug 2026 pass"
    expect(emittedByEngine(lineComment), 'a line comment was read as an engine emission').toEqual(new Set())

    // …and the same text outside a comment must still be caught, or the skip is too broad.
    expect([...emittedByEngine(`  rows.push({ declaration: 'retired_state' })`)]).toEqual(['retired_state'])
  })

  it('a comment opened after code on the same line does not hide the code before it', () => {
    // The deliberate bias, shared with the other guards: that line still contains code.
    expect([...emittedByEngine(`  rows.push({ declaration: 'fifth_state' }) // added Aug 2026`)]).toEqual(['fifth_state'])
  })
})
