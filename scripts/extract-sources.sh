#!/usr/bin/env bash
#
# extract-sources.sh - regenerate the extracted text of every pinned primary
# source in docs/reference/source/ from its PDF.
#
# Renamed from extract-annex.sh on 21 Aug 2026, when the enacting terms of
# C(2026) 5010 were added alongside its annexes. "annex" was no longer true of
# half of what this does, and a reader looking for how main-act.txt is produced
# would not have opened a file by the old name.
#
# =============================================================================
# THE TWO SOURCE DOCUMENTS ARE NOT THE SAME DOCUMENT
# =============================================================================
# This is the distinction a reader will get wrong, so it is stated first. Both
# files below are "C(2026) 5010 final", adopted 3 July 2026, and their
# filenames differ by one word.
#
#   csrd-delegated-act-2026-5010-annex_en.pdf  ->  annex-i.txt   (186 pp)
#     ANNEXES 1 to 2. The ESRS STANDARDS TEXT - ESRS 1, ESRS 2, E1-E5, S1-S4,
#     G1, their disclosure requirements and application requirements. This is
#     what a preparer reads to know WHAT to disclose. It contains no
#     application dates and no articles of its own; every "Article 2" in it is
#     a citation to some other instrument (mostly Reg. (EU) 2021/1119, the EU
#     Climate Law). Source of docs/reference/drs2026.tsv.
#
#   csrd-delegated-act-2026-5010_en.pdf        ->  main-act.txt  (10 pp)
#     THE ENACTING TERMS - the delegated regulation itself, recitals plus
#     Articles 1 to 3. This is the instrument that gives the annexes legal
#     effect and says WHEN they apply. Added to the repo 21 Aug 2026.
#
#       Article 1  replaces Annexes I and II of Del. Reg. (EU) 2023/2772 with
#                  the text set out in the annexes to this act.
#
#       Article 2  TRANSITIONAL PROVISIONS "for financial years starting
#                  between 1 January and 31 December 2026". For those years an
#                  undertaking may apply either (a) 2023/2772 as last amended
#                  by Del. Reg. (EU) 2025/1416, or the new standards; or
#                  (b) 2023/2772 as so amended WITH the eight reliefs listed
#                  at Art. 2(1)(b)(i)-(viii). Art. 2(2) requires the
#                  undertaking to STATE which version it applied.
#
#       Article 3  "It shall apply to the financial years beginning on or
#                  after 1 January 2027."
#
# =============================================================================
# ⚠️ WHY THE SECOND DOCUMENT HAD TO BE ADDED
# =============================================================================
# Articles 2 and 3 are the provisions lib/materiality.ts checkReportingPeriod
# implements. Its three rules - a stated ESRS version conflicting with the
# financial year's start - are Article 3's application date and Article 2's
# transitional window, and the 'explicit' / 'inferred' register it prints on
# the report's face is a claim about how firmly those articles state their
# limits.
#
# UNTIL 21 AUG 2026 IT CITED THEM WITHOUT THE INSTRUMENT BEING IN THE REPO. The
# only thing on disk was the annex, which does not contain them, and the only
# corroboration was ThemisIQ's own prose in docs/materiality-questionnaire-spec
# -v5..v12 - six copies of one uncited sentence. The rules turned out to be
# right. That was not knowable at the time, and a verifier reading the report
# could not have checked it.
#
# =============================================================================
# WHY THIS FILE EXISTS AT ALL
# =============================================================================
# supabase/migrations/20260817_mr_esrs_disclosure_requirements.sql says of
# docs/reference/drs2026.tsv that "Re-deriving it is one command" - and that
# command is recorded nowhere in the repo. This script exists so the same
# cannot be said of the extracted texts. An extraction whose pipeline is
# unrecorded is not reproducible, and a reference text that cannot be
# re-derived cannot be re-checked against its source.
#
# This records the pipeline for the TEXT only. Deriving drs2026.tsv from
# annex-i.txt is a separate step and is still unrecorded.
#
# ⚠️ NO OJ NUMBER, EITHER DOCUMENT. At the time of extraction the act
# was still under Parliament/Council scrutiny and unpublished in the Official
# Journal, so neither has an OJ L reference to cite - note that Article 3 still
# carries the unfilled placeholder "[O.P.: please insert the date = ...]". The
# Commission's own PDFs are the authority used here. When the act is published,
# the OJ text becomes the citable version and this pipeline should be re-run
# against it: a scrutiny text and a published text are not guaranteed
# identical, and the hashes below are what will tell you whether they were.

set -euo pipefail

# Run from the repo root whatever directory the caller is in, so the relative
# paths below mean the same thing every time.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# pdftotext's layout algorithm has changed between poppler releases. A
# different version may produce different line breaks, different column
# handling, and therefore different text - which matters here because the
# disclosure-requirement headings WRAP, and where they wrap decides how they
# are read back out.
EXPECTED_POPPLER='26.08.0'

# --- the documents -----------------------------------------------------------
# PDF | TXT | EXPECTED_SHA256 | WHAT IT IS | DOWNLOAD FILENAME
#
# A different document is a different extraction and must not silently produce
# one of these text files. To replace one legitimately - for example with the
# published OJ text - update its hash HERE, in the same commit that replaces
# the PDF, and say why.
DOCS=(
"docs/reference/source/csrd-delegated-act-2026-5010-annex_en.pdf|docs/reference/source/annex-i.txt|2319a0bb65c0acf0f818f012f5ac8127ee3bd4e397037846373d8ce69f00c377|ANNEXES 1 to 2 - the ESRS standards text|csrd-delegated-act-2026-5010-annex_en.pdf"
"docs/reference/source/csrd-delegated-act-2026-5010_en.pdf|docs/reference/source/main-act.txt|bd3d6141263a9f9ed630fe1ef34816855e47b6f1b7d086b82ca6b3326f72fb39|enacting terms - Articles 1 to 3|csrd-delegated-act-2026-5010_en.pdf"
)

BASE_URL='ec.europa.eu/finance/docs/level-2-measures'

# --- the extractor -----------------------------------------------------------
if ! command -v pdftotext >/dev/null 2>&1; then
  echo "ERROR: pdftotext not found. Install poppler (brew install poppler)." >&2
  exit 1
fi

# ⚠️ 2>&1 IS LOAD-BEARING. pdftotext writes its version banner to
# STDERR, not stdout; capturing stdout alone yields an empty string, which
# would compare unequal to any expected value and turn this check into a
# warning that always fires - or, if written the other way round, one that
# never does.
actual_poppler="$(pdftotext -v 2>&1 | head -1 | sed -E 's/.*version[[:space:]]+//')"

if [ "$actual_poppler" != "$EXPECTED_POPPLER" ]; then
  echo "WARNING: poppler version differs." >&2
  echo "  expected: $EXPECTED_POPPLER" >&2
  echo "  found:    ${actual_poppler:-<could not parse>}" >&2
  echo "  A different extractor may produce different text. Continuing, but do" >&2
  echo "  not treat the output as byte-identical to the recorded extraction." >&2
fi

# --- the hasher --------------------------------------------------------------
# ⚠️ RESOLVED ONCE, UP HERE, NOT INSIDE THE HELPER. A bare `exit 1`
# inside a function called as $(sha256_of ...) exits only the command
# substitution's SUBSHELL - the caller carries on with an empty hash, which
# then compares unequal and reports a mismatch. "Missing checksum tool" would
# surface as "wrong document", naming a cause that never occurred.
if command -v shasum >/dev/null 2>&1; then
  SHA_TOOL='shasum -a 256'
elif command -v sha256sum >/dev/null 2>&1; then
  SHA_TOOL='sha256sum'
else
  echo "ERROR: neither shasum nor sha256sum found; cannot verify the sources." >&2
  exit 1
fi

sha256_of() { $SHA_TOOL "$1" | awk '{print $1}'; }

# --- pass 1: VERIFY EVERY DOCUMENT BEFORE EXTRACTING ANY ---------------------
# REFUSAL, NOT A WARNING. Every downstream claim about these texts - every
# citation, every disclosure-requirement title, every date checkReportingPeriod
# applies - rests on which document it came from. Extracting from an unverified
# PDF would produce a file that looks exactly like the real one.
#
# ⚠️ ALL-OR-NOTHING, AND THAT IS THE POINT OF DOING IT IN TWO PASSES.
# These two documents are halves of one act. Verifying inside the extraction
# loop would let a legitimately-replaced main act leave a new main-act.txt
# beside a stale annex-i.txt, with nothing on disk saying the pair no longer
# match.
verified_shas=()
failed=0

for entry in "${DOCS[@]}"; do
  IFS='|' read -r pdf txt expected_sha label filename <<< "$entry"

  if [ ! -f "$pdf" ]; then
    echo "ERROR: source PDF not found at $pdf" >&2
    echo "  ($label)" >&2
    echo "  Download it from:" >&2
    echo "  $BASE_URL/$filename" >&2
    failed=1
    continue
  fi

  actual_sha="$(sha256_of "$pdf")"
  if [ "$actual_sha" != "$expected_sha" ]; then
    echo "ERROR: $pdf does not match the expected document." >&2
    echo "  ($label)" >&2
    echo "  expected sha256: $expected_sha" >&2
    echo "  found    sha256: $actual_sha" >&2
    failed=1
    continue
  fi

  verified_shas+=("$actual_sha")
  echo "verified  $pdf"
  echo "          $label"
  echo "          sha256 $actual_sha"
done

if [ "$failed" -ne 0 ]; then
  echo "" >&2
  echo "Refusing to extract ANYTHING. Nothing was written." >&2
  echo "  These documents are two halves of one act and are regenerated" >&2
  echo "  together, so a partial source set does not produce a partial text" >&2
  echo "  set. If a document has legitimately been replaced (for example by" >&2
  echo "  the published OJ text), update its hash in the DOCS table in this" >&2
  echo "  script in the same commit that replaces the PDF, and say why." >&2
  exit 1
fi

# --- pass 2: extract ---------------------------------------------------------
# -layout preserves the column and indentation structure. That is not cosmetic:
# in the annex the contents listing is indented 12 spaces and body headings 3-6,
# and telling them apart is how a body heading is distinguished from its
# contents entry. In the main act it is what keeps Article 2(1)(b)'s nested
# (i)-(viii) list readable as a list.
echo ""
echo "poppler: $actual_poppler"
echo ""

i=0
for entry in "${DOCS[@]}"; do
  IFS='|' read -r pdf txt expected_sha label filename <<< "$entry"

  echo "Extracting $pdf -> $txt"
  echo "  document:    $label"
  echo "  source sha:  ${verified_shas[$i]}"
  pdftotext -layout "$pdf" "$txt"

  # The output's own hash, so a future run can be compared against this one
  # without re-reading the file by eye.
  echo "  output sha:  $(sha256_of "$txt")"
  echo "  lines:       $(wc -l < "$txt" | tr -d ' ')"
  echo ""
  i=$((i + 1))
done

echo "Done. ${#DOCS[@]} documents extracted."
