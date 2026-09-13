#!/usr/bin/env bash
#
# This script has never been run. age is not installed on this machine and no age identity has been
# generated, so it would fail at the encryption step. The private key must be created and stored in a
# password manager first. Before anything this produces is relied on as a backup, a decrypt and a
# pg_restore into a scratch project must be carried out and seen to work.
#
# Take an encrypted, verified, off-machine backup of the ThemisIQ database.
#
# Usage:
#   export DBURL='postgresql://...'            # the pooler string, see docs/backup-record.md
#   export THEMISIQ_BACKUP_PUBKEY='age1...'    # age recipient, public half only
#   export THEMISIQ_BACKUP_DEST="$HOME/Library/CloudStorage/OneDrive-themisiqco/themisiq-backups"
#   scripts/backup.sh
#
# What it leaves behind, per run:
#   full_<stamp>.dump.age      the encrypted dump, locally and at the destination
#   full_<stamp>.dump.sha256   the hash of the PLAINTEXT dump, locally and at the destination
# The plaintext dump itself is deleted after encryption and never leaves this machine.
#
# Two hashes, two jobs, and confusing them is the easiest mistake here.
#   The .sha256 file holds the hash of the plaintext. It cannot verify the .age, and it is not
#   meant to. Its only use is after a future decrypt: hash the recovered dump and compare, which
#   proves the restore produced the bytes pg_dump wrote.
#   Transfer integrity is a separate check. The script hashes the .age at the source and again at
#   the destination and compares those two. That is step 4.
#
# The private key is now the thing that matters most. This script encrypts to a public key and
# never sees the private half. If the age identity is lost, every backup it has ever written is
# permanently unreadable, and nothing here will tell you that until the day you need one. Keep the
# identity in the password manager beside the database password, and prove a decrypt and a restore
# into a scratch project before relying on any of this. See docs/backup-record.md section 6, which
# records that no restore has ever been tested.

set -euo pipefail

say()  { printf '  %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die()  { printf '\nFAILED: %s\n\n' "$*" >&2; exit 1; }

filesize() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1"; }
sha256of() { shasum -a 256 "$1" | awk '{print $1}'; }

STAMP="$(date +%Y%m%d_%H%M)"
LOCAL_DIR="$HOME/themisiq-backups"
BASE="full_${STAMP}"
DUMP="${LOCAL_DIR}/${BASE}.dump"
PLAIN_SHA="${LOCAL_DIR}/${BASE}.dump.sha256"
ENC="${LOCAL_DIR}/${BASE}.dump.age"
RETAIN_DAYS=30

# Resolved from the script's own location, not the working directory, because under cron the
# working directory is undefined.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORD="${REPO_ROOT}/docs/backup-record.md"

step "Preflight"

# The connection string is never printed, here or anywhere below.
[ -n "${DBURL:-}" ]                   || die "DBURL is not set. Export the pooler connection string first; see docs/backup-record.md section 3."
[ -n "${THEMISIQ_BACKUP_PUBKEY:-}" ]  || die "THEMISIQ_BACKUP_PUBKEY is not set. It holds the age recipient (the public half, age1...). Without it this script would write an unencrypted dump to a cloud folder, so it refuses instead."
[ -n "${THEMISIQ_BACKUP_DEST:-}" ]    || die "THEMISIQ_BACKUP_DEST is not set. It is the OneDrive folder the encrypted backup is copied to."

command -v pg_dump >/dev/null || die "pg_dump not found. brew install libpq, then add it to PATH."
command -v shasum  >/dev/null || die "shasum not found."
command -v age     >/dev/null || die "age not found. brew install age. Do not substitute another tool without changing the decrypt instructions in docs/backup-record.md to match."

[ -d "$THEMISIQ_BACKUP_DEST" ] || die "THEMISIQ_BACKUP_DEST does not exist or is not a directory: ${THEMISIQ_BACKUP_DEST}"
mkdir -p "$LOCAL_DIR"

# Never overwrite. pg_dump -f truncates an existing target silently, which is how the local copy of
# full_20260816.dump was lost on 19 August 2026. The timestamp makes a collision unlikely; this
# makes it impossible.
for existing in "$DUMP" "$PLAIN_SHA" "$ENC"; do
  [ -e "$existing" ] && die "Target already exists, refusing to overwrite: ${existing}"
done

say "stamp                 ${STAMP}"
say "local directory       ${LOCAL_DIR}"
say "destination           ${THEMISIQ_BACKUP_DEST}"
say "retention             ${RETAIN_DAYS} days"
say "record                ${RECORD}"

step "1. Dump"
pg_dump "$DBURL" -Fc --no-owner -f "$DUMP"
[ -s "$DUMP" ] || die "pg_dump produced an empty file: ${DUMP}"
DUMP_BYTES="$(filesize "$DUMP")"
say "wrote                 $(basename "$DUMP")"
say "size                  ${DUMP_BYTES} bytes"

step "2. Hash the plaintext"
PLAIN_HASH="$(sha256of "$DUMP")"
# Written with a bare filename rather than a full path so `shasum -c` works from whichever
# directory a future copy of the file ends up in.
( cd "$LOCAL_DIR" && shasum -a 256 "$(basename "$DUMP")" > "$(basename "$PLAIN_SHA")" )
say "sha256 (plaintext)    ${PLAIN_HASH}"
say "wrote                 $(basename "$PLAIN_SHA")"

step "3. Encrypt"
age -r "$THEMISIQ_BACKUP_PUBKEY" -o "$ENC" "$DUMP"
[ -s "$ENC" ] || die "age produced an empty file: ${ENC}. The plaintext dump has been left in place at ${DUMP}."
ENC_BYTES="$(filesize "$ENC")"
ENC_HASH="$(sha256of "$ENC")"
say "wrote                 $(basename "$ENC")"
say "size                  ${ENC_BYTES} bytes"
say "sha256 (ciphertext)   ${ENC_HASH}"

# This script cannot verify that the ciphertext decrypts, because it holds only the public key.
# A test decrypt needs the identity and is a manual step.
say "note                  not verified as decryptable: that needs the private key and is manual"

rm -f "$DUMP"
say "removed plaintext     $(basename "$DUMP")"

step "4. Copy to the destination and verify"
cp "$ENC" "$THEMISIQ_BACKUP_DEST/"
cp "$PLAIN_SHA" "$THEMISIQ_BACKUP_DEST/"
DEST_ENC="${THEMISIQ_BACKUP_DEST}/$(basename "$ENC")"
DEST_SHA="${THEMISIQ_BACKUP_DEST}/$(basename "$PLAIN_SHA")"
[ -f "$DEST_ENC" ] || die "Copy did not appear at the destination: ${DEST_ENC}"
[ -f "$DEST_SHA" ] || die "Copy did not appear at the destination: ${DEST_SHA}"

# Re-hash the ciphertext at the destination and compare against the source. This is the transfer
# check, and it is why the ciphertext hash exists at all; the .sha256 file holds the plaintext hash
# and would never match here.
DEST_HASH="$(sha256of "$DEST_ENC")"
say "source     ${ENC_HASH}"
say "destination ${DEST_HASH}"
[ "$ENC_HASH" = "$DEST_HASH" ] || die "Hash mismatch after copy. Source ${ENC_HASH}, destination ${DEST_HASH}. The destination copy is not trustworthy; do not delete the local one."
say "match                 yes"

# What this check does and does not prove. It proves the bytes reached the local OneDrive sync
# folder intact. It does not prove OneDrive has finished uploading them to Microsoft: that happens
# asynchronously and nothing here can observe it. Check the sync status in Finder before treating
# this as an off-machine copy.
say "scope                 verified into the sync folder; upload to Microsoft is asynchronous and unverified"

step "5. Retention (older than ${RETAIN_DAYS} days)"
# Refuses to leave zero backups. The dump above runs first and set -e aborts on failure, so there
# is always a fresh one by the time this runs, but that ordering is easy to lose in a later edit
# and this is cheaper than discovering it the hard way.
sweep() {
  local dir="$1" label="$2" deleted=0 remaining
  [ -d "$dir" ] || { say "${label}: directory absent, skipped"; return 0; }

  remaining="$(find "$dir" -maxdepth 1 -type f -name '*.age' ! -mtime "+${RETAIN_DAYS}" | wc -l | tr -d ' ')"
  if [ "$remaining" -eq 0 ]; then
    say "${label}: REFUSING to sweep — it would leave no .age backup in this location"
    return 0
  fi

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    rm -f "$f"
    say "${label}: deleted $(basename "$f")"
    deleted=$((deleted + 1))
  done < <(find "$dir" -maxdepth 1 -type f \( -name '*.age' -o -name '*.sha256' \) -mtime "+${RETAIN_DAYS}")

  [ "$deleted" -eq 0 ] && say "${label}: nothing older than ${RETAIN_DAYS} days"
  return 0
}
sweep "$LOCAL_DIR" "local"
sweep "$THEMISIQ_BACKUP_DEST" "destination"

# A delete inside a OneDrive sync folder is a delete, not an erasure. Business OneDrive keeps
# removed items in a recycle bin, and then a second-stage bin, for months. Against a 30-day
# deletion commitment that gap has to be closed by hand.
say "note                  OneDrive keeps deleted files in its recycle bin; empty it to complete the deletion"

# Only .age and .sha256 are swept. Any plaintext .dump in these directories predates this script
# and is left alone deliberately, because deleting a file this script did not create is not a
# decision it should make on its own.
STRAY="$(find "$LOCAL_DIR" "$THEMISIQ_BACKUP_DEST" -maxdepth 1 -type f -name '*.dump' 2>/dev/null | wc -l | tr -d ' ')"
[ "$STRAY" -gt 0 ] && say "note                  ${STRAY} unencrypted .dump file(s) present from before this script; not swept, review by hand"

step "6. Record"
# Appended under a heading this script owns, rather than into the hand-maintained table in
# section 7. A script inserting rows into a table a person also edits produces conflicts nobody
# wants to resolve at backup time.
if [ ! -f "$RECORD" ]; then
  say "record file not found, skipping: ${RECORD}"
else
  if ! grep -q '^## Automated backup log$' "$RECORD"; then
    {
      printf '\n---\n\n## Automated backup log\n\n'
      printf 'Appended by `scripts/backup.sh`. One row per run. The hash is of the PLAINTEXT dump,\n'
      printf 'for verifying a future decrypt; it is not the hash of the .age file.\n\n'
      printf '| Date | File | Plaintext size | SHA-256 (plaintext) | Local | Destination |\n'
      printf '|---|---|---|---|---|---|\n'
    } >> "$RECORD"
    say "created the Automated backup log section"
  fi
  printf '| %s | `%s` | %s bytes | `%s` | `%s` | `%s` |\n' \
    "$(date +%Y-%m-%d\ %H:%M)" "$(basename "$ENC")" "$DUMP_BYTES" "$PLAIN_HASH" "$LOCAL_DIR" "$THEMISIQ_BACKUP_DEST" \
    >> "$RECORD"
  say "appended a row to    $(basename "$RECORD")"
  # docs/backup-record.md is tracked in git, so this leaves the working tree modified. Commit it,
  # or the log exists only on this machine.
  say "note                  that file is tracked in git; commit it or the log stays local"
fi

step "Done"
say "encrypted backup      $(basename "$ENC")"
say "local                 ${LOCAL_DIR}"
say "destination           ${THEMISIQ_BACKUP_DEST}"
say "plaintext removed     yes"
say "restore needs         the age private key, then pg_restore; see docs/backup-record.md section 4"
