import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripTsComments } from './testing/stripComments'

// ─────────────────────────────────────────────────────────────────────────────
// THE EM-DASH RATCHET.
//
// ⚠️ WHY A RATCHET AND NOT A BAN. The copy rule is that no em dash appears in customer-facing text, and
// on 27 Sep 2026 the tree had 1,084 of them in rendered strings across 86 files. A test that simply
// forbade them would have been red on a clean checkout, which is how a test gets deleted. So this asserts
// the SHAPE of the remaining work instead:
//
//   · a file NOT listed in SWEEP_BUDGET must have ZERO. The five groups already swept are locked here, and
//     any new em dash in clean copy fails.
//   · a listed file must have AT MOST its recorded number. Gaining one fails.
//   · a listed file that has FEWER than recorded also fails, with a message to lower the number — so
//     progress is written down rather than silently absorbed, and the budget only ever ratchets down.
//   · a listed file that reaches ZERO must be REMOVED from the list, which fails until someone does it.
//
// THE NUMBERS ARE A TO-DO LIST, NOT A TARGET. Every sweep commit lowers one, and the file is finished when
// SWEEP_BUDGET is empty.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..')
const DASH = '—'

/**
 * A string literal that OPENS with an em dash is a QUOTED BULLET, not our punctuation.
 *
 * ⚠️ THIS IS THE ONE PERMANENT EXEMPTION THAT IS SHAPE-BASED RATHER THAN LOCATION-BASED, and it earns it.
 * lib/cbam/boundaries.ts reproduces Annex II to Regulation (EU) 2023/956 verbatim, and the Regulation's own
 * text uses an em dash to open each listed process: "— all processes emitting CO2 from process materials…".
 * Changing it would misquote the instrument. 37 of that file's 54 are these; the other 17 are our own prose
 * and are in the budget below.
 */
const QUOTED_BULLET = new RegExp(`['"\`]\\s*${DASH}`, 'g')

/**
 * Publisher citation strings, exempt by LOCATION because the whole object is one kind of thing.
 *
 * ⚠️ SCOPED TO THE OBJECT, NOT THE FILE, WHICH IS THE POINT. lib/ghg/engine.ts has 87 rendered em dashes
 * and only 10 are inside EF_SOURCES. The other 77 include eGRID subregion labels, framework chip titles,
 * validation warnings, unit-conversion notes and — worth its own fix — 14 uses of the em dash as an
 * EMPTY-VALUE GLYPH in exported workings rows, which is the "Not provided" case already settled on the
 * Deals pipeline export. Exempting the file would have hidden all of that.
 */
const EF_SOURCES_OBJECT = { file: 'lib/ghg/engine.ts', declaration: /const EF_SOURCES\s*=\s*\{/ }

/** The brace-matched line range of a declaration, so the exemption follows the object if it moves. */
function objectRange(src: string, declaration: RegExp): [number, number] | null {
  const m = declaration.exec(src)
  if (!m) return null
  const open = src.indexOf('{', m.index)
  let depth = 0
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') {
      depth--
      if (depth === 0) {
        const line = (s: string) => s.split('\n').length
        return [line(src.slice(0, open)), line(src.slice(0, j))]
      }
    }
  }
  return null
}

/** Em dashes in RENDERED copy: comments stripped, permanent exemptions removed. */
export function renderedDashes(file: string): number {
  const src = stripTsComments(readFileSync(join(ROOT, file), 'utf8'))
  const lines = src.split('\n')
  const ef = file === EF_SOURCES_OBJECT.file ? objectRange(src, EF_SOURCES_OBJECT.declaration) : null
  let n = 0
  lines.forEach((line, i) => {
    const count = (line.match(new RegExp(DASH, 'g')) ?? []).length
    if (!count) return
    if (ef && i + 1 >= ef[0] && i + 1 <= ef[1]) return
    n += Math.max(0, count - (line.match(QUOTED_BULLET) ?? []).length)
  })
  return n
}

/**
 * ⚠️ PENDING A DECISION, NOT EXEMPT. These are excluded from the sweep because the decision to change them
 * has not been taken, NOT because an em dash is acceptable in them.
 *
 * THE LEGAL PAGES carry document version numbers (TIQ-PRV-001 · v2.2 and its siblings), so a punctuation
 * edit raises the question of whether the version moves and whether docs/policy-snapshots needs a matching
 * entry. That is a legal-record judgement, not a copy one.
 *
 * THE EMAIL TEMPLATES in app/api/* are the same templates CLAUDE.md records as the deliberately unmigrated
 * brand gradient, so they are already a known exception awaiting one decision rather than many.
 *
 * Counts are NOT asserted for these: the point is that nobody has looked yet, and pinning a number would
 * imply someone had.
 */
const PENDING_DECISION = [
  'app/privacy/page.tsx',
  'app/terms/page.tsx',
  'app/refund-policy/page.tsx',
] as const
const PENDING_DECISION_PREFIX = 'app/api/'   // every email template

/**
 * The remaining sweep, file by file, with the count each one still carries.
 *
 * LOWER A NUMBER WHEN YOU SWEEP A FILE. Remove the line when it reaches zero.
 */
const SWEEP_BUDGET: Record<string, number> = {
  'app/assess/page.tsx': 50,
  'app/calculate-emissions/page.tsx': 3,
  'app/cbam/preview/page.tsx': 16,
  'app/cbam/readiness/page.tsx': 4,
  'app/dashboard/ai-governance/page.tsx': 21,
  'app/dashboard/cbam/disclosures/page.tsx': 14,
  'app/dashboard/cbam/report/exportXlsx.ts': 10,
  'app/dashboard/cbam/report/page.tsx': 11,
  'app/dashboard/cbam/setup/page.tsx': 81,
  'app/dashboard/climate-risk/page.tsx': 33,
  'app/dashboard/climate-risk/report/page.tsx': 16,
  'app/dashboard/cyber/page.tsx': 6,
  'app/dashboard/deals/report/page.tsx': 2,
  'app/dashboard/ghg/page.tsx': 151,
  'app/dashboard/ghg/trends/page.tsx': 8,
  'app/dashboard/materiality/assessment/AssessmentForm.tsx': 12,
  'app/dashboard/materiality/assessment/new/page.tsx': 3,
  'app/dashboard/materiality/report/page.tsx': 26,
  'app/dashboard/materiality/survey/[id]/page.tsx': 4,
  'app/dashboard/materiality/survey/[id]/respondents/import/page.tsx': 12,
  'app/dashboard/materiality/survey/[id]/respondents/page.tsx': 7,
  'app/dashboard/materiality/survey/[id]/respondents/template/route.ts': 1,
  'app/dashboard/materiality/survey/[id]/results/page.tsx': 21,
  'app/dashboard/materiality/survey/[id]/scope/page.tsx': 4,
  'app/dashboard/materiality/survey/page.tsx': 8,
  'app/dashboard/materiality/worksheet/[id]/determinations/page.tsx': 10,
  'app/dashboard/materiality/worksheet/[id]/determine/page.tsx': 11,
  'app/dashboard/materiality/worksheet/[id]/iro-1/page.tsx': 2,
  'app/dashboard/materiality/worksheet/[id]/page.tsx': 17,
  'app/dashboard/materiality/worksheet/[id]/register/page.tsx': 1,
  'app/dashboard/materiality/worksheet/page.tsx': 3,
  'app/dashboard/page.tsx': 1,
  'app/dashboard/people/page.tsx': 12,
  'app/dashboard/reports/page.tsx': 1,
  'app/dashboard/sbti/page.tsx': 11,
  'app/dashboard/scope3/page.tsx': 34,
  'app/dashboard/stakeholder/[id]/report/page.tsx': 4,
  'app/dashboard/supply-chain/page.tsx': 63,
  'app/dashboard/supply-chain/portal/[id]/page.tsx': 2,
  'app/dashboard/supply-chain/portal/[id]/supplier/[supplierId]/page.tsx': 4,
  'app/dashboard/supply-chain/portal/page.tsx': 1,
  'app/deals/[token]/page.tsx': 6,
  'app/forgot-password/page.tsx': 1,
  'app/impact/[token]/page.tsx': 11,
  'app/order/page.tsx': 1,
  'app/pricing/page.tsx': 23,
  'app/reset-password/page.tsx': 1,
  'app/signup/page.tsx': 1,
  'app/supplier/[token]/page.tsx': 1,
  'app/survey/[token]/page.tsx': 11,
  'app/verify-cbam/[token]/page.tsx': 19,
  'app/verify/[token]/page.tsx': 14,
  'lib/assurancePdf.ts': 3,
  'lib/auditTrailNotice.ts': 3,
  'lib/cbam/boundaries.ts': 17,
  'lib/cbam/cn.ts': 1,
  'lib/cbam/readiness.ts': 20,
  'lib/cbam/report/build.ts': 7,
  'lib/cbam/sefa.ts': 3,
  'lib/cbam/sefaCompute.ts': 1,
  'lib/emissionFactors/spend.ts': 1,
  'lib/emissionFactors/spendAdjustment.ts': 1,
  'lib/flag/estimate.ts': 7,
  'lib/ghg/comparability.ts': 1,
  'lib/ghg/conciergeDocTypes.ts': 2,
  'lib/ghg/engine.ts': 62,
  'lib/ghg/factorEditions.ts': 2,
  'lib/ghg/loadSeries.ts': 1,
  'lib/ghg/series.ts': 3,
  'lib/ifrsS2.ts': 1,
  'lib/materiality.ts': 7,
  'lib/materiality/boardReport.ts': 17,
  'lib/materiality/boardReportPdf.ts': 6,
  'lib/materiality/impactContext.ts': 5,
  'lib/materiality/iro1.ts': 6,
  'lib/materiality/register.ts': 5,
  'lib/materiality/respondentImport.ts': 9,
  'lib/materiality/severity.ts': 1,
  'lib/materiality/severityScale.ts': 6,
  'lib/materiality/versionAgreement.ts': 3,
  'lib/nis2.ts': 3,
  'lib/obligations.ts': 23,
  'lib/order/invoice.ts': 3,
  'lib/pricing.ts': 3,
  'lib/sb253.ts': 3,
  'lib/sbti.ts': 9,
  'lib/scope3/supplierAssurance.ts': 3,
  'lib/supply-chain/templates.ts': 107,
}

/**
 * ⚠️ A HAND-ROLLED WALK, NOT globSync. `globSync` exists in node:fs at runtime and is NOT in the types
 * this repo compiles against, so the first version of this file passed vitest and then failed
 * `tsc --noEmit` with "Module 'node:fs' has no exported member 'globSync'". A green test run is not a
 * green build; npm run build is the authority.
 */
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
    .filter(f => !f.startsWith(PENDING_DECISION_PREFIX))
    .filter(f => !(PENDING_DECISION as readonly string[]).includes(f))
    .sort()

describe('no em dash reaches customer-facing copy, and the remaining budget only shrinks', () => {
  it('every file NOT in the budget has zero, so swept copy cannot regress', () => {
    const offenders = sourceFiles()
      .filter(f => !(f in SWEEP_BUDGET))
      .map(f => [f, renderedDashes(f)] as const)
      .filter(([, n]) => n > 0)
      .map(([f, n]) => `${f}: ${n}`)
    expect(offenders, offenders.length === 0 ? '' :
      `em dash in rendered copy in a file with no budget:\n  ${offenders.join('\n  ')}\n\n` +
      'Either remove it (the four patterns: label+qualifier → colon; mid-sentence aside → comma or two ' +
      'sentences; parenthetical pair → brackets; read-back or explanation → colon), or add the file to ' +
      'SWEEP_BUDGET with its count if it is a new surface that has not been swept yet.').toEqual([])
  })

  it('no budgeted file has gained one', () => {
    const grown = Object.entries(SWEEP_BUDGET)
      .map(([f, budget]) => [f, budget, renderedDashes(f)] as const)
      .filter(([, budget, actual]) => actual > budget)
      .map(([f, budget, actual]) => `${f}: budget ${budget}, found ${actual}`)
    expect(grown, grown.length === 0 ? '' :
      `em dashes ADDED to a file that was already over budget:\n  ${grown.join('\n  ')}`).toEqual([])
  })

  it('a swept file has its budget lowered, or is removed when it reaches zero', () => {
    // ⚠️ THE HALF THAT MAKES IT A RATCHET. Without this, sweeping a file leaves a budget nobody lowers, and
    // the number stops meaning anything — the same drift every stale count in this repo has suffered.
    const stale = Object.entries(SWEEP_BUDGET)
      .map(([f, budget]) => [f, budget, renderedDashes(f)] as const)
      .filter(([, budget, actual]) => actual < budget)
      .map(([f, budget, actual]) => actual === 0
        ? `${f}: now ZERO — delete this line from SWEEP_BUDGET`
        : `${f}: budget ${budget}, now ${actual} — lower it to ${actual}`)
    expect(stale, stale.length === 0 ? '' :
      `the budget is out of date, which is progress that has not been written down:\n  ${stale.join('\n  ')}`)
      .toEqual([])
  })

  it('the pending-decision files are named, not silently skipped', () => {
    // Asserted so the exemption cannot quietly widen: a fourth legal page added to the list has to be a
    // deliberate edit here, with the reason above it.
    expect([...PENDING_DECISION]).toEqual([
      'app/privacy/page.tsx',
      'app/terms/page.tsx',
      'app/refund-policy/page.tsx',
    ])
    expect(PENDING_DECISION_PREFIX).toBe('app/api/')
    // And they do still carry em dashes, so the exemption is live rather than vestigial. If this fails
    // because one is clean, delete it from PENDING_DECISION.
    for (const f of PENDING_DECISION) {
      expect(renderedDashes(f), `${f} is clean — remove it from PENDING_DECISION`).toBeGreaterThan(0)
    }
  })

  it('the permanent exemptions are real: both still match something', () => {
    // A shape-based exemption that matches nothing is a rule nobody is relying on, and it would hide the
    // day the quoted text was reworded. Both are asserted to be load-bearing.
    const boundaries = stripTsComments(readFileSync(join(ROOT, 'lib/cbam/boundaries.ts'), 'utf8'))
    expect((boundaries.match(QUOTED_BULLET) ?? []).length,
      'Annex II bullet quotations have gone from lib/cbam/boundaries.ts').toBeGreaterThan(0)
    const engine = stripTsComments(readFileSync(join(ROOT, EF_SOURCES_OBJECT.file), 'utf8'))
    expect(objectRange(engine, EF_SOURCES_OBJECT.declaration),
      'EF_SOURCES is no longer a brace-matchable object literal').not.toBeNull()
  })
})
