#!/usr/bin/env bash
#
# extract-annex.sh - regenerate docs/reference/source/annex-i.txt from the source PDF.
#
# =============================================================================
# THE SOURCE DOCUMENT
# =============================================================================
# Annex I to Commission Delegated Regulation C(2026) 5010 final, adopted
# 3 July 2026 - the ESRS standards text (ESRS 1, ESRS 2, E1-E5, S1-S4, G1).
#
# Downloaded from:
#   ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010-annex_en.pdf
#
# WARNING - NO OJ NUMBER. At the time of extraction the act was still under
# Parliament/Council scrutiny and had not been published in the Official
# Journal, so it has no OJ L reference to cite. The Commission's own PDF is
# the authority used here. When the act is published, the OJ text becomes the
# citable version and this pipeline should be re-run against it: a scrutiny
# text and a published text are not guaranteed identical, and the hash below
# is what will tell you whether they were.
#
# =============================================================================
# WHY THIS FILE EXISTS
# =============================================================================
# supabase/migrations/20260817_mr_esrs_disclosure_requirements.sql says of
# docs/reference/drs2026.tsv that "Re-deriving it is one command" - and that
# command is recorded nowhere in the repo. This script exists so the same
# cannot be said of annex-i.txt. An extraction whose pipeline is unrecorded is
# not reproducible, and a reference text that cannot be re-derived cannot be
# re-checked against its source.
#
# This records the pipeline for the TEXT only. Deriving drs2026.tsv from that
# text is a separate step and is still unrecorded.

set -euo pipefail

# Run from the repo root whatever directory the caller is in, so the relative
# paths below mean the same thing every time.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PDF='docs/reference/source/csrd-delegated-act-2026-5010-annex_en.pdf'
TXT='docs/reference/source/annex-i.txt'

# The PDF this pipeline was written against. A different document is a
# different extraction and must not silently produce annex-i.txt.
EXPECTED_SHA='2319a0bb65c0acf0f818f012f5ac8127ee3bd4e397037846373d8ce69f00c377'

# pdftotext's layout algorithm has changed between poppler releases. A
# different version may produce different line breaks, different column
# handling, and therefore different text - which matters here because the
# disclosure-requirement headings WRAP, and where they wrap decides how they
# are read back out.
EXPECTED_POPPLER='26.08.0'

# --- the extractor -----------------------------------------------------------
if ! command -v pdftotext >/dev/null 2>&1; then
  echo "ERROR: pdftotext not found. Install poppler (brew install poppler)." >&2
  exit 1
fi

# ⚠️ 2>&1 IS LOAD-BEARING. pdftotext writes its version banner to STDERR, not
# stdout; capturing stdout alone yields an empty string, which would compare
# unequal to any expected value and turn this check into a warning that always
# fires - or, if written the other way round, one that never does.
actual_poppler="$(pdftotext -v 2>&1 | head -1 | sed -E 's/.*version[[:space:]]+//')"

if [ "$actual_poppler" != "$EXPECTED_POPPLER" ]; then
  echo "WARNING: poppler version differs." >&2
  echo "  expected: $EXPECTED_POPPLER" >&2
  echo "  found:    ${actual_poppler:-<could not parse>}" >&2
  echo "  A different extractor may produce different text. Continuing, but do" >&2
  echo "  not treat the output as byte-identical to the recorded extraction." >&2
fi

# --- the source --------------------------------------------------------------
if [ ! -f "$PDF" ]; then
  echo "ERROR: source PDF not found at $PDF" >&2
  echo "  Download it from:" >&2
  echo "  ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010-annex_en.pdf" >&2
  exit 1
fi

# shasum on macOS, sha256sum on most Linux. Either is fine; both are checked so
# the script is not silently macOS-only.
if command -v shasum >/dev/null 2>&1; then
  actual_sha="$(shasum -a 256 "$PDF" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  actual_sha="$(sha256sum "$PDF" | awk '{print $1}')"
else
  echo "ERROR: neither shasum nor sha256sum found; cannot verify the source." >&2
  exit 1
fi

# REFUSAL, NOT A WARNING. Every downstream claim about this text - every
# citation, every disclosure-requirement title - rests on which document it
# came from. Extracting from an unverified PDF would produce a file that looks
# exactly like the real one.
if [ "$actual_sha" != "$EXPECTED_SHA" ]; then
  echo "ERROR: source PDF does not match the expected document." >&2
  echo "  expected sha256: $EXPECTED_SHA" >&2
  echo "  found    sha256: $actual_sha" >&2
  echo "  Refusing to extract. If the document has legitimately been replaced" >&2
  echo "  (for example by the published OJ text), update EXPECTED_SHA in this" >&2
  echo "  script in the same commit that replaces the PDF, and say why." >&2
  exit 1
fi

# --- extract -----------------------------------------------------------------
# -layout preserves the column and indentation structure. That is not cosmetic:
# the contents listing is indented 12 spaces and body headings 3-6, and telling
# them apart is how a body heading is distinguished from its contents entry.
echo "Extracting $PDF -> $TXT"
echo "  poppler:     $actual_poppler"
echo "  source sha:  $actual_sha"
pdftotext -layout "$PDF" "$TXT"

# The output's own hash, so a future run can be compared against this one
# without re-reading the file by eye.
if command -v shasum >/dev/null 2>&1; then
  out_sha="$(shasum -a 256 "$TXT" | awk '{print $1}')"
else
  out_sha="$(sha256sum "$TXT" | awk '{print $1}')"
fi
echo "  output sha:  $out_sha"
echo "Done. $(wc -l < "$TXT" | tr -d ' ') lines."
