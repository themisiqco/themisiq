# Run record: supplier option values

Execution history for the four SQL files beside this note. The files describe what to do; this says what
was actually done, and it is the only record of that.

## 27 September 2026 — nothing needed converting

`1_preflight.sql` returned **no rows**, and `3_verify.sql` returned **no rows**, both against production.

- `2_backfill.sql` was **not run**.
- `9_rollback.sql` was **not run**.

Every stored answer to an option question already matched the value shape, so there was no label prose to
convert. That is the expected result for a `supplier_responses` table whose rows were all written by the
new code, or one that holds no answers to option questions yet.

⚠️ **The two queries cannot tell those two cases apart.** Both return no rows whether every answer is
already a value or there are no answers at all. If that distinction matters later, this settles it:

```sql
select count(*) as option_answers
  from supplier_responses
 where question_id in (
   -- the same id list 3_verify.sql carries
   select question_id from supplier_responses
 );
-- or, more simply, the whole table:
select count(*) as all_responses, count(distinct campaign_supplier_id) as suppliers
  from supplier_responses;
```

## 27 September 2026, later the same day — the four files were regenerated

The option **labels** were swept to the comma convention (`Yes — board approved` became
`Yes, board approved`) while every **value** stayed byte-identical. The four SQL files were regenerated
from `lib/supply-chain/templates.ts`, and they grew: the map now carries **323 label forms** rather than
219, because an option whose wording has changed is listed under every wording it has had. What is stored
is whatever the label said when the supplier answered, so a map built from the current labels alone would
look for prose nobody ever wrote.

⚠️ **The preflight and verify results recorded above were produced by the PREVIOUS generation of these
files**, the one with 219 pairs. They remain valid as findings — there was no label prose in
`supplier_responses` then, and adding more label forms to look for cannot create rows that are not there —
but they are not an execution record for the files now on disk. Re-run `1_preflight.sql` before
`2_backfill.sql` if you ever run it.

The rollback also changed shape: it carries one prose form per option, the **oldest**, because two rows
sharing a value would make `set response = m.label where r.response = m.value` join twice and restore an
arbitrary one of them.

The backfill remains correct and runnable as it stands: `optionValue()` accepts a label or a value, so it
can be run at any future point — for instance if an older deployment writes label prose again, or if rows
are restored from a backup taken before 27 September 2026.
