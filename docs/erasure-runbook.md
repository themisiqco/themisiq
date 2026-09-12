# Account erasure — runbook

**Audience:** whoever is handling a deletion request, working alone.
**Tool:** `scripts/erase-account.mjs` · **Record:** `public.erasure_log`

Nothing here is reversible once step 7 commits. Steps 1–6 change nothing and can
be repeated as often as you like. If anything in this document does not match
what the script prints, **stop and trust the script** — it is the authority, and
this file is a description of it.

---

## 0. Before you start

You need, in one terminal:

```
export DBURL='postgresql://…'          # the connection string from docs/backup-record.md
```

The password is read from `~/.pgpass`, not from the command line. You will see
this on every run:

> `DeprecationWarning: pgpass support is deprecated and will be removed in pg@9.0.`

**That warning is expected and means nothing is wrong.** It fires only because
`~/.pgpass` supplied the password successfully. It cannot be turned off without
changing how the password is read — see the note at the end of this file.

The script needs a database role that can see every row. On Supabase that is the
`postgres` role in the connection string above, **not** a pooled application
role. If you use the wrong one the script stops at the RLS pre-flight (§10) —
it will not run anyway and produce a wrong answer.

---

## 1. Where requests arrive, and the clock

Requests come to **privacy@themisiq.co**.

**The deadline is 30 days from the date of the request**, not from the date you
start. This is what the trust page promises: *"When you ask us to delete your
account, all compliance data is permanently deleted within 30 days."* Write the
request date down now — you need it in step 7 and it goes in the permanent
record.

Reply to the customer when you receive the request to confirm you have it. Do
not wait until the work is done.

---

## 2. Find the user id

The script takes a uuid, never an email. In the Supabase SQL editor:

```sql
select id, email, created_at, last_sign_in_at
  from auth.users
 where lower(email) = lower('customer@example.com');
```

Expect exactly one row. **If you get none, stop** — the person may have signed
up with a different address; ask them before going further. If you get more than
one, stop and work out which is which; do not guess.

Copy the `id`. Everything below uses it as `<UUID>`.

---

## 3. Take a fresh dump first

Not optional. This is the only route back if something is wrong.

```
pg_dump "$DBURL" -Fc --no-owner -f ~/themisiq-backups/full_$(date +%Y%m%d).dump
```

⚠️ **`pg_dump -f` overwrites silently.** If a file with today's date is already
there it is gone without a warning. Check the folder first, and never type a
literal date in place of `$(date +%Y%m%d)`.

Confirm the file exists and is not zero bytes before continuing.

---

## 4. Dry run

```
node scripts/erase-account.mjs --user <UUID>
```

This writes nothing. It opens a transaction, counts, and rolls back.

**Read it in this order:**

| Section | What you are checking |
|---|---|
| header | `subject` is the right uuid; the `tls` line says `sslmode=…` |
| `Coverage check` | ends `PASS — all N table(s) classified, none twice.` |
| `RLS pre-flight` | ends `PASS` |
| `Rows that would be deleted` | a table list with counts |
| `audit_log` | pass (a) and pass (b) counts |
| `Storage` | file counts for `source-documents` and `cbam-source-documents` |
| `Summary` | total rows and files |
| final line | `Nothing was changed.` |

**Does the total look like this customer?** An account that used the GHG module
for a year should have hundreds of rows and some files. If you see 0 rows
everywhere for a customer you know was active, **stop** — that is the symptom the
RLS pre-flight exists to catch, and it means the run is looking at a filtered
view of the database, not that the account is empty.

Two warnings are normal and are not errors:

- `organizations row(s) referenced by this account and NOT deleted` — that table
  has no owner column, so it cannot be attributed to one customer. Expected.
- `ghg_inventories row(s) have a NULL user_id` — rows belonging to nobody
  identifiable. They are counted, not deleted, and are not this customer's.

---

## 5. Export — only if they asked for their data

Skip this entire step unless the customer asked for a copy. If they did:

```
node scripts/erase-account.mjs --user <UUID> --export ~/erasure-<UUID>
```

Writes one JSON file per table, plus every storage file under
`~/erasure-<UUID>/storage/<bucket>/…`. It writes nothing to the database.

Then:

1. Zip the folder and send it to the customer **at the address the request came
   from**, never to an address supplied inside the request body.
2. Confirm they have it.
3. **Delete the folder and the zip from your machine.** It is a complete,
   unencrypted copy of a customer's account sitting in your home directory; it is
   the most exposed that data has ever been. Do not leave it there overnight.

`--export` and `--execute` cannot be combined; the script refuses. Export first,
check it, then erase.

---

## 6. Second dry run

If you exported, run §4 again before erasing. It costs nothing and confirms the
account still looks the way it did.

---

## 7. Execute

Four flags are required. The script refuses without any of them.

```
node scripts/erase-account.mjs \
  --user <UUID> \
  --execute \
  --confirm customer@example.com \
  --requested-at 2026-09-01 \
  --performed-by "Dima Kovalenko"
```

| Flag | What it is for |
|---|---|
| `--confirm` | Must match `auth.users.email` for that uuid, or the script stops. This is the guard against erasing the wrong account. |
| `--requested-at` | The date from step 1. Goes in the permanent record. |
| `--performed-by` | Your name. Goes in the permanent record. |

What happens, in order: one database transaction does every delete, sweeps
`audit_log`, deletes the auth user, runs a **residual check** that re-counts
every table holding a user-id column — plus `audit_log`'s stored JSON — for any
row still naming this user, and writes the `erasure_log` row. Any failure rolls the whole thing back and nothing is erased. Only after
the commit does it remove the storage files, then list them again to confirm
zero remain.

**If it stops with an error, nothing has been erased.** Read §10, fix the cause,
run it again. Re-running after a partial failure is safe and expected — the
script resumes and finishes the job.

Expect to see, near the end:

```
  PASS — no row in any owner column, and none in audit_log's jsonb, still names the subject.
  COMMITTED. erasure_log id …
```

Write down the `erasure_log` id.

---

## 8. Verify

```
node scripts/erase-account.mjs --user <UUID>
```

The account is gone, so this now reports a **resume**:

```
  ⚠ RESUMING — auth.users row is already gone. 1 prior erasure_log row(s).
```

followed by zero rows and zero files everywhere. That is the result you want.
Seeing `RESUMING` here is confirmation that step 7 worked, not a warning.

If it reports rows still present, the erasure did not finish. Run step 7 again.

---

## 9. The two things the script cannot do

Both are manual and both must be done on the same day.

**a. The `/assess` lead emails.** `app/api/assessment/submit/route.ts` writes to
no database table at all. If this person ever filled in the compliance
assessment, their name, company, role and answers exist only as two emails — one
to them, one to the monitor inbox. Search **Resend** and the **monitor inbox**
for their address and delete what you find. Nothing in the script can reach
these.

**b. The confirmation email.** §11.

---

## 10. The two conditions that stop the script

These are the only two stops that mean "a person has to make a decision". Both
happen before anything is touched.

### Coverage check — an unclassified table

```
Coverage check FAILED — N table(s) in public are in NO category.
```

**What it means:** somebody added a table to the database and nobody has decided
whether it holds customer data. The script will not guess: guessing wrong means
either deleting reference data everyone shares, or leaving a customer's rows
behind while reporting success.

**What to do:** this is a developer change, not an operations one. Send the
table name to whoever added it. Each one must be given a delete rule, listed as
handled elsewhere, or declared reference data **by exact name** in the script.
Do not proceed until the check passes.

### RLS pre-flight — the connection cannot see every row

```
RLS pre-flight FAILED — N of M table(s) in scope would be FILTERED for <role>.
```

**What it means:** row-level security is hiding rows from the role you connected
as. This is the dangerous one, because RLS does not raise an error — it returns
an empty result. Left unchecked, the run would find nothing, delete nothing,
pass its own residual check, and write a record saying the erasure succeeded.

**What to do:** you are connected with the wrong role. Use the `postgres`
connection string from `docs/backup-record.md`, not a pooled application role.
The error message names each affected table and its owner.

---

## 11. What is NOT erased, and why

Say this to the customer. Do not imply the erasure is more complete than it is.

| Where | What remains | Why |
|---|---|---|
| **Stripe** | Customer, subscription, invoices, payment records | Legal and tax retention. The trust page states 7 years. ThemisIQ never stored card numbers. |
| **Resend** | Delivered-message logs: recipient address, subject, body of every email we sent them | Held by the email provider; we cannot delete their server-side logs. |
| **Vercel** | Request logs | Rotate out on Vercel's own schedule. |
| **Anthropic** | Document text and questions sent by the concierge extractor and the GHG assistant | No retention control exists in the product. |
| **Database backups** | Every row that was just deleted | Present in `~/themisiq-backups` dumps and the Supabase PITR window until those rotate out. Not restored except in a disaster. |

The customer's **platform data** — inventories, entries, documents, suppliers,
assessments, verifier grants, the audit trail and their uploaded files — is what
the script erases, and that is what "deleted" means in the confirmation below.

---

## 12. Confirmation email

Send from **privacy@themisiq.co**, to the address the request came from.

> Subject: Your ThemisIQ data has been deleted
>
> Hello <name>,
>
> Your ThemisIQ account and its data were permanently deleted on <completion
> date>.
>
> This covered your account and sign-in, your GHG inventories and emissions
> entries, any CBAM, materiality, supply-chain and target-setting records, every
> document you uploaded, any verifier access links you had issued, and the audit
> trail for all of it. None of this is recoverable.
>
> Two things remain, and I want to be clear about both:
>
> Our payment processor, Stripe, retains billing records — invoices and payment
> history — for approximately seven years, as required for legal and tax
> purposes. ThemisIQ has never stored your card details. Emails we previously
> sent you also remain in our email provider's delivery logs.
>
> Deleted data may also persist in encrypted database backups for a short period
> until those backups rotate out of retention. They are not accessed except in a
> disaster recovery.
>
> If you have any questions about this, reply to this email.
>
> <your name>
> ThemisIQ · privacy@themisiq.co

Fill in `<completion date>` from step 7 — the date you ran it, not the date of
the request.

---

## Appendix — the pgpass warning

It cannot be suppressed without changing how the password is read.

`pg` emits it through `util.deprecate` at the moment `~/.pgpass` returns a
password (`node_modules/pg/lib/client.js:299-318`). The only ways to stop it are:

1. Supply the password some other way — an async `password` function, or putting
   it in `DBURL`. Both change how the password is read, and putting a production
   password in a shell variable is worse practice than `~/.pgpass` with mode
   `0600`.
2. `process.noDeprecation = true` or `node --no-deprecation`, which silences
   **every** deprecation warning in the process, including ones about real
   problems.

Neither is worth it for a cosmetic line in a procedure run a few times a year.
Leave it, and know what it means.
