import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TEMPLATES, optionsFor, optionValue, optionLabel, optionTone, type QuestionOption, type Tone } from './templates'
import { stripTsComments } from '../testing/stripComments'

// ─────────────────────────────────────────────────────────────────────────────
// THE OPTION IS A VALUE, A LABEL AND A TONE, AND EACH PART HAS ITS OWN FAILURE.
//
// Before 27 Sep 2026 an option was a bare string doing all three jobs: stored in supplier_responses,
// compared with === to know which radio was selected, matched exactly by the assurance map, prefix-matched
// for colour, and shown to the buyer. Rewording one silently orphaned every answer given to it, and the
// colour was wrong on the questions that matter most.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const ALL: { qid: string; opt: QuestionOption }[] = Object.values(TEMPLATES)
  .flatMap(t => t.sections).flatMap(s => s.questions)
  .flatMap(q => (q.options ?? []).map(opt => ({ qid: q.id, opt })))

/**
 * A qualified yes is not a yes: informal, ad hoc, occasional, not yet enforced or limited in scope is
 * 'watch', whatever the answer starts with.
 *
 * ⚠️ EVERY EXCEPTION IS NAMED WITH ITS REASON. The pattern is deliberately broad, so it catches answers
 * where the qualifier does NOT weaken the practice; those belong here rather than in a looser pattern,
 * because the next option added has to be argued about rather than absorbed.
 */
const QUALIFIER = /informal|ad hoc|occasional|not yet enforced|\bonly\b/i

/**
 * Every file that reads, writes or interprets a stored answer.
 *
 * ⚠️ lib/scope3/supplierAssurance.ts IS IN THE LIST AND IS NOT DETECTABLE. It never names the table — it
 * takes the answer as an argument — so the assertion below checks that every file which DOES name the
 * table is listed here, not the reverse. Adding an interpreter without adding it here is the gap, and
 * the prose guard that follows is what catches the consequence.
 */
const RESPONSE_READERS = [
  'app/api/campaigns/[id]/scope3-cat1/route.ts',
  'app/dashboard/supply-chain/portal/[id]/page.tsx',
  'app/dashboard/supply-chain/portal/[id]/supplier/[supplierId]/page.tsx',
  'app/supplier/[token]/page.tsx',
  'lib/scope3/supplierAssurance.ts',
]
const QUALIFIED_BUT_COMPLETE: Record<string, string> = {
  // An internal policy is a complete policy. Publication is a separate question (ms_statement asks it).
  'ms_policy|yes_internal_only': 'an internal policy is a complete policy',
  'ms_kpis|yes_internal_only': 'tracking internally is complete tracking; publishing is ms_statement',
  'cs_salient|yes_internal_only': 'identifying salient issues is the act; disclosure is cs_disclosure',
  // The question asks whether a mechanism EXISTS. Anonymity is a quality above the bar, not the bar.
  'eth_whistleblower|yes_named_reporting_only': 'a named channel is a complete mechanism',
  // Prioritising by spend or by risk is the method the standards themselves prescribe, not a shortfall.
  'proc_scope3cat1|yes_key_suppliers_only': 'the GHG Protocol prescribes prioritising key suppliers',
  'ms_dd_suppliers|yes_high_risk_suppliers_only': 'risk-based due diligence is what CS3D and the MSA ask for',
}

describe('supplier questionnaire options', () => {
  it('every option has a slug value, a label and a tone', () => {
    expect(ALL.length).toBe(222)
    for (const { qid, opt } of ALL) {
      expect(opt.value, `${qid}: ${opt.label}`).toMatch(/^[a-z0-9_]+$/)
      expect(opt.label.trim(), `${qid}: ${opt.value}`).toBe(opt.label)
      expect(opt.label.length, `${qid}: ${opt.value}`).toBeGreaterThan(0)
      expect(['good', 'watch', 'bad', 'neutral'], `${qid}: ${opt.value}`).toContain(opt.tone)
      // ⚠️ NO COMMA IN A VALUE, EVER. Checkbox answers are stored comma-joined and split on read; a comma
      // inside a value would shred a multi-select answer into parts that match nothing.
      expect(opt.value).not.toContain(',')
    }
  })

  it('a value is the slug of the label the option FIRST carried, so relabelling cannot move it', () => {
    // ⚠️ THE INVARIANT BEHIND "VALUES STAY BYTE-IDENTICAL". A value is stored in supplier_responses and
    // matched by lib/scope3/supplierAssurance.ts; changing one orphans data. Expressing it as a rule
    // rather than a pinned list means a NEW option is covered too: its value must be the slug of its own
    // label, and once it has a legacyLabel the value is frozen against that instead.
    const slug = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    for (const { qid, opt } of ALL) {
      expect(opt.value, `${qid}: ${opt.label}`).toBe(slug(opt.legacyLabel ?? opt.label))
    }
    // And the sweep did change wording: if this reaches zero, every legacyLabel is redundant.
    expect(ALL.filter(({ opt }) => opt.legacyLabel).length, 'options whose wording has changed').toBe(104)
  })

  it('a checkbox label may not contain a comma, because the answer is comma-joined', () => {
    // ⚠️ THE ONE PLACE PUNCTUATION IS A DATA FORMAT. A multi-select answer is stored as one
    // comma-separated string and split on read; a comma inside a label would shred it. Values carry no
    // comma either (asserted above), so this guards the LABEL against the sweep's own convention.
    for (const q of Object.values(TEMPLATES).flatMap(t => t.sections).flatMap(s => s.questions)) {
      if (q.type !== 'checkbox') continue
      for (const opt of q.options ?? []) {
        expect(opt.label, `${q.id}: a checkbox label may not contain a comma`).not.toContain(',')
        expect(opt.legacyLabel ?? '', `${q.id}: nor may its legacy label`).not.toContain(',')
      }
    }
  })

  it('values are unique within a question, so no answer is ambiguous', () => {
    for (const q of Object.values(TEMPLATES).flatMap(t => t.sections).flatMap(s => s.questions)) {
      const vs = (q.options ?? []).map(o => o.value)
      expect(new Set(vs).size, `${q.id} has two options with the same value`).toBe(vs.length)
      const ls = (q.options ?? []).map(o => o.label)
      expect(new Set(ls).size, `${q.id} has two options with the same label`).toBe(ls.length)
    }
  })

  it('a label round-trips to its value and back', () => {
    for (const { qid, opt } of ALL) {
      expect(optionValue(qid, opt.value), `${qid}: value in, value out`).toBe(opt.value)
      // ⚠️ THE LEGACY PATH. Rows written before the migration hold the label; this is what lets the
      // backfill be optional rather than a cutover, and it must keep working while any such row exists.
      expect(optionValue(qid, opt.label), `${qid}: label in, value out`).toBe(opt.value)
      if (opt.legacyLabel) {
        // The prose a pre-sweep row holds still resolves, and reads back as the CURRENT label.
        expect(optionValue(qid, opt.legacyLabel), `${qid}: legacy label in, value out`).toBe(opt.value)
        expect(optionLabel(qid, opt.legacyLabel), `${qid}: a historic row reads with today's wording`)
          .toBe(opt.label)
        expect(optionTone(qid, opt.legacyLabel), `${qid}: and is toned`).toBe(opt.tone)
      }
      expect(optionLabel(qid, opt.value), `${qid}: value in, label out`).toBe(opt.label)
      expect(optionLabel(qid, opt.label), `${qid}: label in, label out`).toBe(opt.label)
      expect(optionTone(qid, opt.label), `${qid}: a legacy row is toned too`).toBe(opt.tone)
    }
  })

  it('an answer that names no option is passed through and toned neutral', () => {
    // portal_save_response validates nothing and is granted to anon, so any string can arrive.
    expect(optionValue('env_policy', 'something else')).toBe('something else')
    expect(optionLabel('env_policy', 'something else')).toBe('something else')
    expect(optionTone('env_policy', 'something else'), 'never coloured as though we understood it')
      .toBe('neutral')
    expect(optionsFor('s3cat1_method'), 'a free-text question has no options').toEqual([])
    expect(optionTone('s3cat1_method', 'by revenue share')).toBe('neutral')
  })

  it('⚠️ "Yes, unresolved" stays red, on every question where it can be given', () => {
    // THE DEFECT THIS WHOLE CHANGE EXISTS FOR. Measured live on 27 Sep 2026: the viewer prefix-matched
    // prose with the positive list first, so 'yes' matched and an UNRESOLVED CHILD LABOUR INCIDENT
    // rendered green. The tone is now the option's own, and it must stay 'bad' whatever the label says.
    const unresolved = ALL.filter(({ opt }) => /unresolved|ongoing/i.test(opt.label))
    expect(unresolved.length, 'the unresolved and ongoing options have been reworded away').toBe(5)
    for (const { qid, opt } of unresolved) {
      expect(opt.tone, `${qid}: "${opt.label}" must be bad`).toBe('bad')
    }
    // And the good answers on those same questions are not red.
    for (const [qid, value] of [['eth_sanctions', 'no'], ['ms_forced', 'no_confirmed_through_assessment'],
                                ['cs_remediation', 'no_harm_identified'], ['lab_child', 'no_incidents']] as const) {
      expect(optionTone(qid, value), `${qid}: ${value} is the good answer`).toBe('good')
    }
  })

  it('a qualified yes is not a yes, unless the qualifier is named as harmless', () => {
    const offenders: string[] = []
    for (const { qid, opt } of ALL) {
      if (!QUALIFIER.test(opt.label)) continue
      if (opt.tone !== 'good') continue
      const key = `${qid}|${opt.value}`
      if (QUALIFIED_BUT_COMPLETE[key]) continue
      offenders.push(`${key} — "${opt.label}"`)
    }
    expect(offenders, 'a qualified answer is toned good with no reason recorded').toEqual([])
    // And every allow-list entry still matches a live option, so the list cannot go stale.
    for (const key of Object.keys(QUALIFIED_BUT_COMPLETE)) {
      const [qid, value] = key.split('|')
      const opt = optionsFor(qid).find(o => o.value === value)
      expect(opt, `${key} is allow-listed but no longer exists`).toBeDefined()
      expect(opt!.tone, `${key} is allow-listed but is no longer good`).toBe('good')
      expect(QUALIFIED_BUT_COMPLETE[key].length, `${key} needs a reason`).toBeGreaterThan(10)
    }
  })

  it('neutral is only for an answer that carries no signal', () => {
    const neutral = ALL.filter(({ opt }) => opt.tone === 'neutral').map(({ qid, opt }) => `${qid}|${opt.value}`)
    expect(neutral.sort(), 'the neutral set is a decision, so it is written down').toEqual([
      'env_reporting|other',
      'eth_gdpr|not_applicable',
      'ms_statement|no_below_threshold',
      's3_boundary|equity_share',
      's3_boundary|financial_control',
      's3_boundary|operational_control',
    ])
  })

  it('the committed backfill SQL is what the generator produces from these options', () => {
    // ⚠️ THE SQL IS A FUNCTION OF THIS FILE, and this is what keeps it so. A label reworded without
    // regenerating leaves a pair in db/sql that no longer matches any stored answer, so the backfill
    // silently skips those rows — and a skipped row is indistinguishable from an already-migrated one.
    const dir = join(ROOT, 'db/sql/supplier-options')
    expect(readdirSync(dir).filter(f => f.endsWith('.sql')).sort(),
      'four files, numbered so the order is the filename')
      .toEqual(['1_preflight.sql', '2_backfill.sql', '3_verify.sql', '9_rollback.sql'])
    // ⚠️ THE SQL SAYS WHAT TO DO; THE RUN RECORD SAYS WHAT WAS DONE. Asserted present because a generated
    // file cannot carry execution history — the generator would overwrite it on the next run.
    expect(readdirSync(dir)).toContain('RUN-RECORD.md')
    const read = (f: string) => readFileSync(join(dir, f), 'utf8')
    const q = (x: string) => `'${x.replace(/'/g, "''")}'`

    // ⚠️ EVERY PROSE FORM AN ANSWER COULD BE STORED AS, in the two files that convert prose to a value.
    // The labels were swept on 27 Sep 2026; what is stored is whatever the wording was at the time.
    for (const f of ['1_preflight.sql', '2_backfill.sql']) {
      const sql = read(f)
      const wanted = f === '1_preflight.sql' ? ALL : ALL.filter(({ qid }) => qid !== 'env_reporting')
      for (const { qid, opt } of wanted) {
        for (const form of new Set([opt.label, opt.legacyLabel].filter(Boolean) as string[])) {
          expect(sql, `${f}: ${qid} / ${form} is missing`).toContain(`(${q(qid)}, ${q(form)}, ${q(opt.value)})`)
        }
      }
    }
    // ⚠️ THE ROLLBACK CARRIES ONE FORM PER OPTION, AND IT IS THE OLDEST. Two rows sharing a value would
    // make `set response = m.label where r.response = m.value` join twice and restore an arbitrary one.
    const rollback = read('9_rollback.sql')
    for (const { qid, opt } of ALL.filter(({ qid }) => qid !== 'env_reporting')) {
      const oldest = opt.legacyLabel ?? opt.label
      expect(rollback, `9_rollback.sql: ${qid} / ${oldest} is missing`)
        .toContain(`(${q(qid)}, ${q(oldest)}, ${q(opt.value)})`)
      if (opt.legacyLabel) {
        expect(rollback, `9_rollback.sql must not also carry the current label for ${qid}`)
          .not.toContain(`(${q(qid)}, ${q(opt.label)}, ${q(opt.value)})`)
      }
    }
    expect(read('1_preflight.sql'), 'the header counts label forms, not options')
      .toContain('323 label forms across 56 questions')

    // ⚠️ EACH FILE RUNS AS PASTED: no bind parameters, and every question id written out.
    for (const f of ['1_preflight.sql', '2_backfill.sql', '3_verify.sql', '9_rollback.sql']) {
      expect(read(f), `${f} has a bind parameter the SQL editor cannot fill`).not.toMatch(/\$\d/)
      expect(read(f).split('\n')[0], `${f} must open with a one-line header`).toMatch(/^-- /)
    }
    expect(read('3_verify.sql'), 'the verify query lists the ids itself').toContain(q('env_policy'))

    // The two writing files are one transaction each; the two read-only ones are not transactions.
    for (const f of ['2_backfill.sql', '9_rollback.sql']) {
      expect((read(f).match(/^begin;$/gm) ?? []).length, `${f} is one transaction`).toBe(1)
      expect((read(f).match(/^commit;$/gm) ?? []).length, `${f} commits once`).toBe(1)
      expect((read(f).match(/^update supplier_responses r$/gm) ?? []).length, `${f} has both updates`).toBe(2)
    }
    for (const f of ['1_preflight.sql', '3_verify.sql']) {
      expect(read(f), `${f} must not write`).not.toMatch(/\b(begin|commit|update|insert|delete)\b/i)
    }
    // And the rollback is the backfill's exact reverse: label matched, value written, and vice versa.
    expect(read('2_backfill.sql')).toContain('and r.response = m.label;')
    expect(read('9_rollback.sql')).toContain('and r.response = m.value;')
  })

  it('the files that read a stored answer are these, and no more', () => {
    // ⚠️ THE LIST IS ASSERTED, NOT ASSUMED. A sixth surface that starts reading supplier_responses has to
    // be added here, which is the moment to check it goes through the helpers rather than matching prose.
    const touches = walk('app').concat(walk('lib'))
      .filter(f => !f.includes('.test.'))
      .filter(f => {
        const src = stripTsComments(readFileSync(join(ROOT, f), 'utf8'))
        return /supplier_responses|portal_save_response/.test(src)
      })
    const unlisted = touches.filter(f => !RESPONSE_READERS.includes(f))
    expect(unlisted, 'a file reads supplier_responses and is not listed in RESPONSE_READERS').toEqual([])
    expect(RESPONSE_READERS).toContain('lib/scope3/supplierAssurance.ts')
  })

  it('no reader of a stored answer holds option prose, bar the frozen assurance labels', () => {
    // ⚠️ THE GUARD THAT KEEPS ONE DEFINITION. The viewer held two lists of answer prose and the assurance
    // map held four strings; both are keyed on values now, and a third copy must not appear.
    //
    // ⚠️ SCOPED TO THE READERS, BECAUSE A LABEL SCAN OVER THE TREE IS MEANINGLESS. Option labels include
    // '100%', 'No', 'Other', 'CDP' and 'In progress', which occur in a hundred unrelated places — a
    // first draft of this test reported 105 findings, every one of them a false positive.
    // ⚠️ DISTINCTIVE LABELS ONLY. '100%' is a CSS width, 'Other' is an EXIOBASE sector key and
    // 'In progress' is a campaign status — all three occur in these very files for unrelated reasons. A
    // label is recognisable as a questionnaire answer when it is long or carries the option dash; the four
    // legacy assurance labels all qualify, which is what this guard exists to pin.
    const found = new Set<string>()
    const labels = [...new Set(ALL.flatMap(({ opt }) => [opt.label, opt.legacyLabel].filter(Boolean) as string[]))]
      .filter(l => l.includes('—') || l.length >= 14)
    for (const rel of RESPONSE_READERS) {
      const src = stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))
      for (const label of labels) {
        if (src.includes(`'${label}'`) || src.includes(`"${label}"`)) found.add(`${rel}|${label}`)
      }
    }
    // lib/scope3/supplierAssurance.ts is the ONE exception, permanently: LEGACY_STATE_BY_ANSWER holds the
    // four labels that snapshots written before 27 Sep 2026 still carry, and a snapshot is never rewritten.
    expect([...found].sort()).toEqual([
      'lib/scope3/supplierAssurance.ts|No measurement',
      'lib/scope3/supplierAssurance.ts|No — internal only',
      'lib/scope3/supplierAssurance.ts|Yes — limited assurance',
      'lib/scope3/supplierAssurance.ts|Yes — reasonable assurance',
      // ⚠️ A COINCIDENCE, NOT OPTION PROSE. assuranceLabel()'s own word for the not_applicable STATE is
      // 'Not applicable', and eth_gdpr happens to offer an option worded the same way. Listed rather than
      // filtered out, so the day it stops being a coincidence somebody has to look.
      'lib/scope3/supplierAssurance.ts|Not applicable',
    ].sort())
  })

  it('every reader that shows an answer to a person shows the label', () => {
    for (const rel of ['app/dashboard/supply-chain/portal/[id]/supplier/[supplierId]/page.tsx',
                       'app/dashboard/supply-chain/portal/[id]/page.tsx',
                       'app/api/campaigns/[id]/scope3-cat1/route.ts']) {
      const src = stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))
      expect(src, `${rel} must resolve a stored answer to its label`).toMatch(/optionLabel\(/)
    }
    // And the portal writes the value, not the label.
    const portal = stripTsComments(readFileSync(join(ROOT, 'app/supplier/[token]/page.tsx'), 'utf8'))
    expect(portal).toMatch(/saveResponse\(q\.id, opt\.value\)/)
    expect(portal, 'the portal must not save a label').not.toMatch(/saveResponse\(q\.id, opt\)/)
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(e.name)) out.push(rel)
  }
  return out
}
