# docs/reference/

Source texts and extracted reference data. Nothing here is generated at build
time; every file is checked in and cited by something.

## source/ — the two halves of C(2026) 5010

Both PDFs are "Commission Delegated Regulation C(2026) 5010 final", adopted
3 July 2026, and their filenames differ by one word. **They are different
documents and both are needed.** Regenerate the text of both with
`scripts/extract-sources.sh`, which pins each PDF by sha256 and refuses to
extract anything at all if either fails to match.

### `csrd-delegated-act-2026-5010-annex_en.pdf` → `source/annex-i.txt`

**ANNEXES 1 to 2 — the ESRS standards text.** 186 pages, 1,735,300 bytes,
sha256 `2319a0bb65c0acf0f818f012f5ac8127ee3bd4e397037846373d8ce69f00c377`.
From `ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010-annex_en.pdf`.

ESRS 1, ESRS 2, E1–E5, S1–S4, G1, with their disclosure requirements and
application requirements — what a preparer reads to know *what* to disclose.
Source of `drs2026.tsv`.

⚠️ **It contains no application dates and no articles of its own.** All eleven
occurrences of "Article 2" in it are citations to *other* instruments — mostly
Reg. (EU) 2021/1119, the EU Climate Law. Two of them sit in a table beside an
ESRS E1 code and read `Article 2(1)`, which is the likeliest thing here to be
mistaken for this act's own Article 2. It is not.

### `csrd-delegated-act-2026-5010_en.pdf` → `source/main-act.txt`

**The enacting terms — the delegated regulation itself.** 187,843 bytes,
sha256 `bd3d6141263a9f9ed630fe1ef34816855e47b6f1b7d086b82ca6b3326f72fb39`,
extracted to 504 lines. From
`ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010_en.pdf`
— the same Commission path as the annex, differing only by the absence of
`-annex`.

Recitals plus Articles 1 to 3. This is the instrument that gives the annexes
legal effect and says *when* they apply.

- **Article 1** replaces Annexes I and II of Del. Reg. (EU) 2023/2772.
- **Article 2** — transitional provisions *"for financial years starting
  between 1 January and 31 December 2026"*. For those years an undertaking may
  apply either (a) 2023/2772 as last amended by Del. Reg. (EU) 2025/1416, or
  the new standards; or (b) 2023/2772 as so amended **with** the eight reliefs
  listed at Art. 2(1)(b)(i)–(viii). Art. 2(2) requires the undertaking to state
  which version it applied.
- **Article 3** — *"It shall apply to the financial years beginning on or after
  1 January 2027."*

**Added 21 August 2026, and it should have been here sooner.** Articles 2 and 3
are the provisions `lib/materiality.ts` `checkReportingPeriod` implements, and
until that date it cited them with the instrument absent from the repo — the
only thing on disk was the annex, which does not contain them. The rules turned
out to be right. That was not knowable at the time.

**This act does not state when the 2023 standards *first* applied.** It amends
2023/2772; it never gives that regulation's own application date. Anything
needing a lower bound for ESRS (2023) needs **Del. Reg. (EU) 2023/2772** itself
(OJ L, 2023/2772, 22.12.2023) — not in this repo. Likewise **Del. Reg. (EU)
2025/1416** (OJ L, 2025/1416, 10.11.2025), on postponing the date of
application for certain undertakings, which both limbs of Article 2(1) are
defined relative to. Neither is here.

⚠️ **Extraction artefact: footnote markers glue to the number before them.**
`pdftotext -layout` renders a superscript footnote reference as an ordinary
digit, so in `main-act.txt` you will find `2023/27723`, `2023/27722` and
`2025/14168` — those are `2023/2772` + footnote 3, `2023/2772` + footnote 2,
and `2025/1416` + footnote 8. **They are not regulation numbers.** Line 449 is
the one to watch, because `2025/14168` appears inside Article 2(1)(a), the
operative text. A search for a bare regulation number will miss these lines;
search for the stem.

## drs2026.tsv

The 64 ESRS (2026) disclosure requirements: `topic_code <TAB> dr_code <TAB> title`.
No header row, no comment convention — it is consumed by a generator, so a
comment line would become a data row. That is why this file exists.

**Source.** Annex I to Commission Delegated Regulation C(2026) 5010 final,
adopted 3 July 2026. Extracted to `source/annex-i.txt` by
`scripts/extract-sources.sh`, which pins the source PDF to
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
