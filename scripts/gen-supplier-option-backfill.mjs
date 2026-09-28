#!/usr/bin/env node
// ── SUPPLIER RESPONSE VALUE BACKFILL: WRITE THE SQL ─────────────────────────────────────────────────
//
//   node scripts/gen-supplier-option-backfill.mjs
//
// Writes four files to db/sql/supplier-options/, each runnable on its own by pasting it whole into the
// Supabase SQL editor, in this order:
//
//   1_preflight.sql   read-only. How many rows each question will change.
//   2_backfill.sql    one transaction. The two UPDATEs.
//   3_verify.sql      read-only. MUST RETURN NO ROWS.
//   9_rollback.sql    one transaction, and only if 3 returns rows.
//
// ⚠️ NUMBERED 1, 2, 3, 9 SO THE ORDER IS THE FILENAME. The gap before the rollback is the point: it is
// not step 4 of a sequence, it is the thing you run when step 3 says the backfill was wrong.
// ⚠️ EVERY QUESTION ID IS WRITTEN OUT IN FULL, no bind parameters. The SQL editor has nowhere to put a
// $1, and a file that cannot be pasted as it stands is a file that gets edited by hand under pressure.
//
// Until 27 Sep 2026 lib/supply-chain/templates.ts stored an option's PROSE as the answer:
// supplier_responses.response held "Yes — board approved". Options now carry a stable `value`, and this
// emits the SQL that normalises existing rows onto it.
//
// ⚠️ GENERATED, NEVER TYPED. The map is 219 pairs; a hand-written copy would drift from the option list
// the first time a label was reworded, and a wrong pair silently rewrites a customer's answer into
// something no option matches. The generator reads templates.ts with the TypeScript parser, so the SQL is
// a function of the source and can be regenerated and diffed at any time.
//
// ⚠️ THE BACKFILL IS OPTIONAL, WHICH IS THE POINT. optionValue() accepts a value OR a legacy label, so the
// application reads both forms. Nothing breaks if this is never run, and nothing breaks while it is
// running — there is no window in which the code and the data disagree.
//
// ⚠️ FREE TEXT IS NOT TOUCHED. Only ids whose questions have options appear in the WHERE clause, so
// s3cat1_method, s3cat1_allocated and every textarea keep their contents.
//
// ⚠️ CHECKBOX ANSWERS ARE COMMA-JOINED, and only env_reporting is a checkbox. Its parts are mapped one at
// a time by the second statement, which is why that statement exists at all.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REL = 'lib/supply-chain/templates.ts'
const src = readFileSync(join(ROOT, REL), 'utf8')
const sf = ts.createSourceFile(REL, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const questions = []
const visit = (n) => {
  if (ts.isObjectLiteralExpression(n)) {
    const get = (k) => n.properties.find(p => p.name && p.name.getText() === k)
    const id = get('id'), type = get('type'), opts = get('options')
    if (id && type && opts && ts.isArrayLiteralExpression(opts.initializer)) {
      const options = opts.initializer.elements.map(el => {
        const g = (k) => el.properties.find(p => p.name && p.name.getText() === k)
        const legacy = g('legacyLabel')
        return {
          value: g('value').initializer.text,
          label: g('label').initializer.text,
          legacyLabel: legacy ? legacy.initializer.text : null,
        }
      })
      questions.push({ id: id.initializer.text, type: type.initializer.text, options })
    }
  }
  ts.forEachChild(n, visit)
}
visit(sf)

// Distinct by id: three ids appear in two templates with identical options.
const byId = new Map()
for (const q of questions) {
  if (!byId.has(q.id)) { byId.set(q.id, q); continue }
  const prev = byId.get(q.id)
  if (JSON.stringify(prev.options) !== JSON.stringify(q.options)) {
    console.error(`FATAL: ${q.id} appears twice with different options; the map would be ambiguous.`)
    process.exit(1)
  }
}
const qs = [...byId.values()]
const radios = qs.filter(q => q.type === 'radio')
const checkboxes = qs.filter(q => q.type === 'checkbox')
const q = (s) => `'${s.replace(/'/g, "''")}'`
const idList = qs.map(x => q(x.id)).join(', ')
// ⚠️ EVERY PROSE FORM AN ANSWER COULD BE STORED AS, NOT JUST THE CURRENT ONE. The labels were swept on
// 27 Sep 2026, and what is stored is whatever the wording was when the supplier answered. A map built from
// the current labels alone would look for prose nobody ever wrote and silently convert nothing — and a
// backfill that changes no rows is indistinguishable from one that had nothing to change.
const pairs = qs.flatMap(x => x.options.flatMap(o => {
  const forms = [...new Set([o.legacyLabel, o.label].filter(Boolean))]
  return forms.map(label => ({ id: x.id, label, value: o.value }))
}))

const rows = (list) => list.map(p => `    (${q(p.id)}, ${q(p.label)}, ${q(p.value)})`).join(',\n')

// ⚠️ THE ROLLBACK USES A DIFFERENT MAP, AND IT HAS TO. `pairs` holds every prose form an answer could be
// stored as, so two rows can share a value — correct for converting prose to a value, and WRONG in
// reverse: `set response = m.label where r.response = m.value` would join twice per row and restore an
// arbitrary one of the two. So the reverse map carries exactly one prose form per option, and it is the
// OLDEST one, because that is what was stored before any of this ran. The application reads either form,
// so a rolled-back row keeps working whichever way the code is standing.
const reverse = qs.flatMap(x => x.options.map(o => ({ id: x.id, label: o.legacyLabel ?? o.label, value: o.value })))
const reverseRadio = reverse.filter(p => radios.some(r => r.id === p.id))
const reverseBox = reverse.filter(p => checkboxes.some(c => c.id === p.id))
const radioPairs = pairs.filter(p => radios.some(r => r.id === p.id))
const boxPairs = pairs.filter(p => checkboxes.some(c => c.id === p.id))

const OUT_DIR = join(ROOT, 'db/sql/supplier-options')
const GENERATED = `-- Generated by scripts/gen-supplier-option-backfill.mjs from ${REL}. Do not edit by hand.
-- ${pairs.length} label forms across ${qs.length} questions (${radios.length} radio, ${checkboxes.length} checkbox).
-- More forms than options: an option whose wording has changed is listed under every wording it has had.`

const boxIdList = checkboxes.map(c => q(c.id)).join(', ')

/** The checkbox rewrite. `from` is the column matched against each stored part, `to` the one written. */
const checkboxRewriteFrom = (mapRows, from, to) => `with map(question_id, label, value) as (values
${mapRows}
), rewritten as (
  select r.id,
         string_agg(coalesce(m.${to}, p.part), ', ' order by p.ord) as response
    from supplier_responses r
    cross join lateral unnest(string_to_array(r.response, ',')) with ordinality as p(part, ord)
    left join map m on m.question_id = r.question_id and m.${from} = btrim(p.part)
   where r.question_id in (${boxIdList})
     and r.response is not null
   group by r.id
)
update supplier_responses r
   set response = w.response, updated_at = now()
  from rewritten w
 where r.id = w.id and r.response <> w.response;`

const checkboxRewrite = (from, to) => checkboxRewriteFrom(rows(boxPairs), from, to)
const checkboxRewriteReverse = () => checkboxRewriteFrom(rows(reverseBox), 'value', 'label')

const files = {
  '1_preflight.sql': `-- STEP 1 of 4, READ-ONLY: how many stored answers are still label prose, per question. Expect one row
-- per question with answers left to migrate, and NO ROWS AT ALL once 2_backfill.sql has run. Keep this
-- output: it is what 3_verify.sql is checked against.
${GENERATED}
--
-- ⚠️ JOINED ON BOTH COLUMNS. Matching the response alone would count a label stored against a different
--    question, and 'No' is an option of thirty of them.
-- ⚠️ A CHECKBOX ROW HOLDING SEVERAL LABELS IS NOT COUNTED HERE, because its response equals no single
--    label. Statement 2 of the backfill handles those, and 3_verify.sql is what confirms it did.
select r.question_id, count(*) as rows_to_change
  from supplier_responses r
  join (values
${rows(pairs)}
) as m(question_id, label, value)
    on m.question_id = r.question_id and m.label = r.response
 group by r.question_id
 order by 2 desc, 1;
`,

  '2_backfill.sql': `-- STEP 2 of 4, WRITES IN ONE TRANSACTION: rewrite every stored answer from the option's label to its
-- stable value. Expect two UPDATE row counts; the first should match the radio total from 1_preflight.sql.
-- Safe to run at any time and safe to re-run: the application reads labels and values alike, and a second
-- run matches nothing because no labels are left.
${GENERATED}
--
-- ⚠️ FREE TEXT IS NOT TOUCHED. Only ids whose questions have options appear below, so s3cat1_method,
--    s3cat1_allocated and every textarea keep their contents.
begin;

-- 1. Single-value answers (radio).
update supplier_responses r
   set response = m.value, updated_at = now()
  from (values
${rows(radioPairs)}
) as m(question_id, label, value)
 where r.question_id = m.question_id
   and r.response = m.label;

-- 2. Multi-value answers (checkbox), mapped part by part and rejoined in the stored order.
--    A part that matches no label is kept as it is: an off-list answer stays visible as itself.
${checkboxRewrite('label', 'value')}

commit;
`,

  '3_verify.sql': `-- STEP 3 of 4, READ-ONLY: every stored answer to an option question must now be a value, or a
-- comma-separated list of values. EXPECT NO ROWS. Any row means the backfill left prose behind — read it,
-- then run 9_rollback.sql if you want to put it back before investigating.
${GENERATED}
--
-- ⚠️ THE PATTERN IS THE SHAPE OF A VALUE, not a list of the values themselves: lower case, digits and
--    underscores, optionally comma-separated for a checkbox answer. An off-list answer typed by someone
--    holding a token will show up here too, which is correct — it is not a value either.
select question_id, response, count(*) as rows_left
  from supplier_responses
 where question_id in (${idList})
   and response is not null
   and response !~ '^[a-z0-9_]+(, ?[a-z0-9_]+)*$'
 group by 1, 2
 order by 3 desc;
`,

  '9_rollback.sql': `-- ROLLBACK, WRITES IN ONE TRANSACTION, and only if 3_verify.sql returned rows: the two statements of
-- 2_backfill.sql with label and value exchanged. Total, because every value came from exactly one label.
-- Expect the same two row counts the backfill reported. Revert the code commit as well, in either order:
-- the application reads both forms.
${GENERATED}
begin;

update supplier_responses r
   set response = m.label, updated_at = now()
  from (values
${rows(reverseRadio)}
) as m(question_id, label, value)
 where r.question_id = m.question_id
   and r.response = m.value;

${checkboxRewriteReverse()}

commit;
`,
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, name), body)
  console.log(`db/sql/supplier-options/${name}  ${body.split('\n').length} lines`)
}
console.log(`${pairs.length} pairs across ${qs.length} questions (${radios.length} radio, ${checkboxes.length} checkbox)`)
