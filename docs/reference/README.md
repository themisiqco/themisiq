# docs/reference/

Source texts and extracted reference data. Nothing here is generated at build
time; every file is checked in and cited by something.

## drs2026.tsv

The 64 ESRS (2026) disclosure requirements: `topic_code <TAB> dr_code <TAB> title`.
No header row, no comment convention — it is consumed by a generator, so a
comment line would become a data row. That is why this file exists.

**Source.** Annex I to Commission Delegated Regulation C(2026) 5010 final,
adopted 3 July 2026. Extracted to `source/annex-i.txt` by
`scripts/extract-annex.sh`, which pins the source PDF to
sha256 `2319a0bb65c0acf0f818f012f5ac8127ee3bd4e397037846373d8ce69f00c377`
and refuses to run against any other document.

**At the time of extraction the act was still under Parliament/Council
scrutiny and had no OJ number.** When it is published, the OJ text becomes the
citable version and both the extraction and this comparison should be re-run.

## Verified 21 August 2026

All 64 rows were compared character for character against the **body headings**
in `source/annex-i.txt` — the lines of the form
`Disclosure Requirement <code> – <title>` at indent 3–6, not the contents
listing at indent 12.

- 63 exact, of which 3 (S1-2, S1-5, S1-6) matched only after the recorded
  curly-to-straight apostrophe normalisation.
- 1 corrected: E1-11, see below.
- 0 missing. Per-topic counts agree with the annex on all ten topics
  (E1 11 · E2 5 · E3 4 · E4 5 · E5 5 · S1 16 · S2 4 · S3 4 · S4 4 · G1 6 = 64).
- 11 body headings in the annex are NOT in this file — BP-1/2, GOV-1..4,
  SBM-1..3, IRO-1/2. Those are ESRS 2 General Disclosures, not topical, and
  out of this file's scope. No topical requirement is missing.

## E1-11 — THE ADOPTED ACT CONTRADICTS ITSELF, AND THIS FILE FOLLOWS THE BODY

`annex-i.txt:3465` — the **contents listing**, with dot leaders and page number:

    Disclosure Requirement E1-11 – Anticipated financial effects from material physical and transition
           risks and potential climate-related opportunities .................................................... 83

`annex-i.txt:4420` — the **body heading**:

    Disclosure Requirement E1-11 – Anticipated financial effects from material physical and
    transition risks and material climate-related opportunities

`potential` in the contents, `material` in the body. One word, in the adopted
instrument itself.

**This file carries `material`, from the body.** The body heading is the
requirement as enacted; the contents listing is navigational apparatus
generated over it. Where the two disagree the operative text governs.

⚠️ **IF YOU ARE CHECKING THIS ROW AND FOUND `potential`, YOU FOUND THE CONTENTS
PAGE.** That is the likelier of the two to surface in a search, it is what this
file said until 21 August 2026, and concluding from it that the TSV is wrong is
the specific mistake this section exists to prevent. Check line 4420, not 3465.

This is a divergence in the source, reported rather than adjudicated. If the
published OJ text resolves it the other way, this row changes and this note
should say so.
