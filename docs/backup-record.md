# ThemisIQ — backup record and restore procedure

**First backup taken: 16 August 2026.** Before this date the database had no
backup of any kind.

⚠️ **This document contains no passwords.** Credentials live in the password
manager. See §1 for what to store there.

---

## 1. Credentials — password manager, not this file

Store as a single entry, "ThemisIQ Supabase database":

| Field | Value |
|---|---|
| Project ref | `lugnholqfstzefxrzjwe` |
| Host (pooler) | `aws-1-us-east-2.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| Username | `postgres.lugnholqfstzefxrzjwe` |
| Password | *(set 16 Aug 2026 — the value)* |
| Full connection string | *(assembled, with the password)* |

⚠️ **Supabase cannot show you this password again.** It is hashed on their
side; the dashboard displays `[YOUR-PASSWORD]` as a placeholder forever. If
it is lost, the only route is Project Settings → Database → Reset database
password. Losing it once cost the better part of a morning.

**The direct connection host** (`db.lugnholqfstzefxrzjwe.supabase.co`) is
IPv6-only and unreachable from this machine. Use the pooler above.

**Nothing in the application uses this password.** The Next.js app
authenticates with the Supabase API keys in its environment variables. This
credential exists solely for `psql` and `pg_dump`.

---

## 2. Where the backups are

| What | Where | Size |
|---|---|---|
| Complete database — schema + all rows, 19 Aug | `~/themisiq-backups/full_20260819.dump` | 1.0M |
| Same, verified identical copy | iCloud Drive → `themisiq-backups/` | 1.0M |
| Complete database — schema + all rows, 16 Aug | iCloud Drive → `themisiq-backups/full_20260816.dump` — **iCloud only**, see §3 | 828K |
| Schema only — 74 tables | `db/dumps/schema_public_20260819_0800.sql` (in git) | 8,512 lines |
| Schema only — 68 tables | `db/dumps/schema_public_20260816.sql` (in git) | 6,256 lines |
| `mr_*` reference data | `db/dumps/mr_reference_data_20260816.sql` (in git) | — |

**Integrity hashes of the full dumps**, SHA-256:

```
bb8ebcf48997d8a33536041e5ecc9d42785fc0476a1b90a138bdb83f029e04dd  full_20260819.dump
776b34cf6ed80b375eddd9bde947bdd87da2b76920727d215bdc142779e8cf13  full_20260816.dump
```

Verify any copy against the line for its date:

```
shasum -a 256 /path/to/full_YYYYMMDD.dump
```

⚠️ **The full dump contains customer data and must never enter the git
repo.** `~/themisiq-backups` is deliberately outside the working tree. The
files in `db/dumps/` were checked and carry no customer rows.

---

## 3. How to take a new backup

Requires `psql` / `pg_dump` (installed via `brew install libpq`).

Set the connection string for the session — **single quotes**, so the shell
does not interpret characters in the password:

```
export DBURL='postgresql://postgres.lugnholqfstzefxrzjwe:PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres'
```

Then clear it from history immediately:

```
history -c && history -w
```

Test:

```
psql "$DBURL" -c "select now();"
```

**Full backup** — the one that matters:

```
pg_dump "$DBURL" -Fc --no-owner -f ~/themisiq-backups/full_$(date +%Y%m%d).dump
```

⚠️ **`pg_dump -f` overwrites silently.** No warning, no prompt: if the target
filename already exists the previous dump is simply gone, and nothing in the
output says so. Always write the date with `$(date +%Y%m%d)` as above — never a
literal date — and check the target filename before running. This is how the
local copy of `full_20260816.dump` was lost on 19 August; it survives only in
iCloud, because that copy had already been made and hash-verified.

**Schema, for the repo:**

```
pg_dump "$DBURL" --schema-only --schema=public --no-owner \
  -f db/dumps/schema_public_$(date +%Y%m%d).sql
```

**Reference data, for the repo:**

```
pg_dump "$DBURL" --data-only --no-owner --table='public.mr_*' \
  -f db/dumps/mr_reference_data_$(date +%Y%m%d).sql
```

A warning about circular foreign keys on `mr_esrs_subtopics` is expected and
harmless — it is the self-referencing `parent_code` column, deliberately
added so a third taxonomy level can exist without a migration. Every
`parent_code` is currently null.

Then copy off the machine and verify:

```
cp ~/themisiq-backups/full_YYYYMMDD.dump ~/Library/Mobile\ Documents/com~apple~CloudDocs/themisiq-backups/
shasum -a 256 ~/themisiq-backups/full_YYYYMMDD.dump ~/Library/Mobile\ Documents/com~apple~CloudDocs/themisiq-backups/full_YYYYMMDD.dump
```

Both hashes must match.

---

## 4. How to restore

⚠️ **Never practise on production.** Create a scratch Supabase project,
restore into that, and confirm the result before trusting the procedure.

**Full restore into an empty database:**

```
pg_restore -d "CONNECTION_STRING_OF_TARGET" --no-owner --clean --if-exists \
  ~/themisiq-backups/full_YYYYMMDD.dump
```

**Inspect without restoring** — lists everything in the dump:

```
pg_restore -l ~/themisiq-backups/full_YYYYMMDD.dump | less
```

**Restore a single table:**

```
pg_restore -d "TARGET" --no-owner --data-only --table=mr_esrs_subtopics \
  ~/themisiq-backups/full_YYYYMMDD.dump
```

**Restore schema only:**

```
pg_restore -d "TARGET" --no-owner --schema-only \
  ~/themisiq-backups/full_YYYYMMDD.dump
```

---

## 5. ⚠️ What this backup does NOT cover

The dump is the `public` schema. These live elsewhere and are lost with the
project:

- **Auth users** — the `auth` schema. Every account, every password hash.
- **Storage bucket contents** — uploaded source documents, bills, evidence
  files. Bucket *configuration* is captured in migrations
  (`20260723`, `20260804`); the *files* are not.
- **Edge function code and secrets.**
- **Project settings** — API keys, RLS toggles at project level, auth
  providers, email templates.

A full disaster recovery therefore needs this dump *plus* a re-created
project, *plus* the storage files, *plus* re-registered users.

---

## 6. What is still missing, and why it matters

**Point-in-time recovery.** Supabase Free has none. Everything here is a
manual snapshot taken at one moment. PITR is continuous, and with a
September launch it is the difference between a bad night and a fatal one.
Upgrading to Pro is the single highest-value item on this list.

**Schema as migrations.** Sixteen tables have no `CREATE TABLE` in
`supabase/migrations/` — they are hand-created drift, including
`ghg_inventories`, `companies`, `materiality_assessments` and
`scope3_inventories`. A replay from git fails on the first file, which
triggers on `ghg_inventories`. The schema dump in §2 records their
structure, but it is not replayable as a migration.

⚠️ **Two seed files in `db/` are corrupted** —
`02_mr_industry_opportunities_seed.sql` and
`03_mr_industry_transition_drivers.sql`, with an identical garbling
signature suggesting a bad write. The values survive in the dumps; the files
do not.

**Automation.** These are one-off commands. A scheduled dump is the next
improvement.

**A tested restore.** A backup that has never been restored is a hypothesis.
Worth proving into a scratch project before launch.

---

## 7. Backup log

| Date | What | Verified | Notes |
|---|---|---|---|
| 2026-07-14 | `db/snapshot_20260714.json` — `mr_*` values only, no schema | — | Predates the provenance columns. Row counts confirmed unchanged as of 16 Aug. |
| 2026-08-16 | Full dump + schema + reference data | SHA-256 matched across both copies | First real backup. Five methodology matrices verified at 65 / 41 / 130 / 65 / 52 rows, matching July. |
| 2026-08-19 | Refreshed full dump + schema dump | SHA-256 matched across two locations, both generations | 74 tables, up from 68. The 16 Aug dump renamed to `full_20260816.dump` and re-verified against its recorded hash. |

*Add a row every time. A backup nobody recorded is a backup nobody will
find.*
