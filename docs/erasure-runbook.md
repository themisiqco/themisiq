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
role. If you use the wrong one the script stops at the RLS pre-flight (§11) —
it will not run anyway and produce a wrong answer.

---

## 1. Where requests arrive, and the clock

Requests come to **privacy@themisiq.co**, and two kinds arrive there. This runbook
is the deletion procedure; a request for a **copy** of someone's data is a different,
much shorter job — go to §14 and do not run anything else in this file.

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

⚠️ **This dump will contain the data you are about to erase.** It is your route back
today and a copy of the customer's account for as long as it exists. It is covered
by the 30-day rule in §10 — note the filename now.

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

**If it stops with an error, nothing has been erased.** Read §11, fix the cause,
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

**b. The confirmation email.** §13.

A third obligation runs on a longer clock and is easy to forget precisely because
it is not due today — the backups. See §10.

---

## 10. Backups — the 30-day clock

The trust page promises compliance data is **permanently deleted within 30 days**.
That promise is only true if the backups holding it are gone within 30 days too. A
`pg_dump` taken before the erasure contains every row the script deleted; the
database being clean does not make the dump clean.

**The rule: no backup containing erased data is kept longer than 30 days from the
request date.** The simplest way to keep that true without tracking individual
requests is to keep no dump longer than 30 days at all — then the promise holds for
every customer automatically, including ones who have not asked yet.

**Local dumps.** Everything in `~/themisiq-backups`, not only today's. Delete
anything older than 30 days:

```
ls -lt ~/themisiq-backups
```

⚠️ **Deleting the local file is not enough.** These dumps are copied to iCloud Drive
(`themisiq-backups/`) — `docs/backup-record.md` records a case where the local copy
was lost and *only* the iCloud copy survived. Delete both, and empty the iCloud
trash; a file in Recently Deleted is still a file.

**Supabase's own backups.** After the Free → Pro upgrade, Supabase takes automated
backups and keeps a point-in-time-recovery window of its own. **These fall under the
same rule.** Check the retention setting in the Supabase dashboard and confirm
nothing older than 30 days is retained — do not assume the default is within the
promise. If the configured window is longer than 30 days, either shorten it or the
trust page's wording has to change; those are the only two honest options.

This section is the one part of the procedure with no same-day deadline, which is
exactly why it is the part that gets skipped. Put a reminder 30 days out on the day
you run the erasure.

---

## 11. The two conditions that stop the script

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

## 12. What is NOT erased, and why

Say this to the customer. Do not imply the erasure is more complete than it is.

| Where | What remains | Why |
|---|---|---|
| **Stripe** | Customer, subscription, invoices, payment records | Legal and tax retention. The trust page states 7 years. ThemisIQ never stored card numbers. |
| **Resend** | Delivered-message logs: recipient address, subject, body of every email we sent them | Held by the email provider; we cannot delete their server-side logs. |
| **Vercel** | Request logs | Rotate out on Vercel's own schedule. |
| **Anthropic** | Document text and questions sent by the concierge extractor and the GHG assistant | No retention control exists in the product. |
| **Database backups** | Every row that was just deleted | Present in `~/themisiq-backups` dumps and in Supabase's own backups until they are deleted. **Not indefinite — they are covered by the 30-day rule in §10, and that section is what makes the trust page's "within 30 days" true.** Not restored except in a disaster. |

The customer's **platform data** — inventories, entries, documents, suppliers,
assessments, verifier grants, the audit trail and their uploaded files — is what
the script erases, and that is what "deleted" means in the confirmation below.

---

## 13. Confirmation email

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

## 14. Access requests — a copy, not a deletion

The trust page's **Access** right: *"Email privacy@themisiq.co to request a copy of
all data ThemisIQ holds about you. We provide it within 30 days."*

This is the export mode on its own. **Nothing is deleted.**

Find the user id exactly as in §2, then:

```
node scripts/erase-account.mjs --user <UUID> --export ~/access-<UUID>
```

**No `--execute`, and no `--confirm`.** Without `--execute` the script opens a
transaction, reads, writes the files, and rolls back — it changes nothing in the
database. The two flags cannot be combined anyway; the script refuses.

Then, exactly as in §5:

1. Zip the folder and send it **to the address the request came from**, never to an
   address supplied inside the request body.
2. Confirm they have it.
3. **Delete the folder and the zip from your machine**, including the iCloud copy if
   one synced. It is a complete unencrypted copy of a customer's account, and the
   request is answered — there is no reason for it to still exist.

The clock is 30 days from the request date, the same as a deletion.

**What you do not do here:** no `pg_dump` (§3 — nothing is being changed), no second
dry run, and **not the §13 confirmation email** — that template says the data was
deleted, which here it was not. Send the covering note below instead.

### Covering note

Goes in the body of the email the files are attached to. It accompanies the export;
it does not stand in for it, so keep it to this.

> Hello <name>,
>
> Attached is a copy of the data ThemisIQ holds about you. It contains one JSON file
> per database table holding your data, plus any documents you uploaded to the
> platform.
>
> This is everything we hold about you in the platform. Billing records — invoices
> and payment history — are held by our payment processor, Stripe, and are available
> from them.
>
> If anything is unclear, reply to this email.
>
> <your name>
> ThemisIQ · privacy@themisiq.co

Say *per database table*, not the table names: the filenames are already in the zip,
and a list of them in the email is schema detail the reader has no use for.

**What the export does and does not contain** is the same table as §12: it is what
the database holds, plus their uploaded files. It is not their Stripe invoices or
the emails we have sent them. If they ask for billing history, that is Stripe's
customer portal, not this script.

An access request from someone who then asks for deletion is two requests. Answer
the access one first, in full, and only then start at §1 — once the account is
erased the export is no longer possible.

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
