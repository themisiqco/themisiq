# CBAM — IR (EU) 2025/2547, Annex IV point 2 (verbatim extraction)

Third and final companion covering Annex IV. `docs/cbam-annex-iv-verbatim.md` covers §1.2,
`docs/cbam-annex-iv-1-1-verbatim.md` covers §1.1 + §1.1.1, and this file covers **§2**, "Sector-
specific parameters to be included in the emissions report" — the last unread part of Annex IV.

## Provenance

| Field | Value |
|---|---|
| **Instrument** | Commission Implementing Regulation (EU) 2025/2547 of 10 December 2025 |
| **Publication** | Official Journal of the European Union, L series, 22.12.2025 |
| **CELEX** | 32025R2547 |
| **Cellar work ID** | `cellar:128503d5-defb-11f0-8439-01aa75ed71a1` |
| **Retrieved from** | EUR-Lex HTML endpoint (`legal-content/EN/TXT/HTML/?uri=CELEX:32025R2547`), HTTP 200 |
| **Retrieval method actually used** | Raw HTML via `curl`, then **byte-range** slice of Annex IV §2 (NOT the markdown-conversion fetch path, which truncates at ≈156 000 chars, inside Annex II) |
| **Byte count (full document)** | 1 365 835 bytes — identical to the §1.1 and §1.2 extractions' recorded size |
| **Annex IV §2 byte range extracted** | ≈ 1 327 500 – 1 362 441 of the raw HTML (heading at byte 1 327 541; bounded above by "ANNEX V" at byte 1 362 441) |
| **Extraction date** | 2026-07-21 |

**Retrieval note.** `curl` returned the file at exactly 1 365 835 bytes. §2 sits immediately after
§1.2 item (16) and immediately before Annex V. **A byte-offset caution learned here and worth
recording:** slicing must be done on the raw *bytes*, not on the decoded string — the em-dash `—`,
subscripts, and curly quotes are multi-byte, so a character-offset slice drifts relative to `grep
-abo` byte offsets. The first slice attempt landed mid-table for exactly this reason; the byte-based
slice below is correct.

**Sub/superscript handling.** The source encodes chemistry with `<span class="oj-sub">` and `<span
class="oj-super">`. Rendered here as Unicode: `NH₄⁺`, `NO₃⁻`, `CO₂`. This is the same canonical-form
decision flagged in the §1.2 file (Ambiguity 1); see this file's Ambiguities section.

---

## Scope statement — what was and was not captured

**Captured (verbatim, below):**
- §2, the heading `2.   SECTOR-SPECIFIC PARAMETERS TO BE INCLUDED IN THE EMISSIONS REPORT`.
- The **complete two-column table**: header row (`Aggregated goods category` | `Reporting
  requirement`) and **all 19 aggregated-goods-category rows**, with every dashed sub-requirement,
  every nested sub-bullet, and every `N.a.` cell, un-normalised.

**Confirmed absent (not omitted — genuinely not in the source range):**
- No lead-in / explanatory sentence between the heading and the table. §2 is the heading followed
  directly by the table; there is no prose paragraph.
- No footnotes or endnotes attached to the table (no note-reference markers in the byte range).

**Out of scope for this file:** §1.1, §1.1.1, §1.2 (the other two files). With this file, **all of
Annex IV is now extracted.**

---

## 1. §2 — Sector-specific parameters (verbatim, full table)

> **2.   SECTOR-SPECIFIC PARAMETERS TO BE INCLUDED IN THE EMISSIONS REPORT**
>
> | Aggregated goods category | Reporting requirement |
> |---|---|
> | Calcined clay | — N.a. |
> | Cement clinker | — N.a. |
> | Cement | — Mass ratio of tonnes cement clinker consumed per produced tonne of cement (clinker to cement ratio expressed in per cent). |
> | Aluminous cement | — N.a. |
> | Hydrogen | — N.a. |
> | Urea | — Purity (mass % urea contained, % N contained). <br> — Content of N |
> | Nitric acid | — Concentration (mass %). <br> — Content of N |
> | Ammonia | — Concentration, if hydrous solution. <br> — Content of N |
> | Mixed fertilisers | — Information required anyway under Regulation (EU) 2019/1009: <br> &nbsp;&nbsp;— content of N as ammonium (NH₄⁺); <br> &nbsp;&nbsp;— content of N as nitrate (NO₃⁻); <br> &nbsp;&nbsp;— content of N as urea; <br> &nbsp;&nbsp;— content of N in other (organic) forms. <br> — Content of N total |
> | Sintered Ore | — N.a. |
> | Pig Iron | — The main reducing agent used. <br> — Mass % of Mn, Cr, Ni, total of other alloy elements. |
> | FeMn Ferro-Manganese | — Mass % of Mn and carbon. |
> | FeCr – Ferro-Chromium | — Mass % of Cr and carbon. |
> | FeNi – Ferro-Nickel | — Mass % of and carbon. |
> | DRI (Direct Reduced Iron) | — The main reducing agent used. <br> — Mass % of Mn, Cr, Ni, total of other alloy elements. |
> | Crude steel | — The main reducing agent of the precursor, if known. <br> — Mass % of Mn, Cr, Ni, total of other alloy elements. <br> — Tonnes scrap used for producing 1 t crude steel. <br> — % of scrap that is pre-consumer scrap. |
> | Iron or steel products | — The main reducing agent used in precursor production, if known. <br> — Mass % of Mn, Cr, Ni, total of other alloy elements. <br> — Tonnes scrap used for producing 1 t of the product. <br> — % of scrap that is pre-consumer scrap. |
> | Unwrought aluminium | — Tonnes scrap used for producing 1 t of the product. <br> — % of scrap that is pre-consumer scrap. <br> — If the total content of elements other than aluminium exceeds 1 %, the total percentage of such elements. |
> | Aluminium products | — Tonnes scrap used for producing 1 t of the product. <br> — % of scrap that is pre-consumer scrap. <br> — If the total content of elements other than aluminium exceeds 1 %, the total percentage of such elements. |

**Cell-fidelity note.** The `<br>`/`&nbsp;` above are layout aids only — each `—` is one dashed
sub-requirement in the source's nested cell table, and the indented dashes under "Mixed fertilisers"
are a genuinely nested sub-list. No word, punctuation mark, or `N.a.` was added, dropped, or
reworded. Where byte-exact fidelity is later required, re-derive from the byte range in the
provenance table.

---

## 2. Iron & steel rows — isolated, exact (for schema cross-check)

The five iron-&-steel-relevant aggregated categories and their exact reporting requirements:

> **Sintered Ore** — — N.a.
>
> **Pig Iron**
> &nbsp;&nbsp;— The main reducing agent used.
> &nbsp;&nbsp;— Mass % of Mn, Cr, Ni, total of other alloy elements.
>
> **FeMn Ferro-Manganese**
> &nbsp;&nbsp;— Mass % of Mn and carbon.
>
> **FeCr – Ferro-Chromium**
> &nbsp;&nbsp;— Mass % of Cr and carbon.
>
> **FeNi – Ferro-Nickel**
> &nbsp;&nbsp;— Mass % of and carbon.
>
> **DRI (Direct Reduced Iron)**
> &nbsp;&nbsp;— The main reducing agent used.
> &nbsp;&nbsp;— Mass % of Mn, Cr, Ni, total of other alloy elements.
>
> **Crude steel**
> &nbsp;&nbsp;— The main reducing agent of the precursor, if known.
> &nbsp;&nbsp;— Mass % of Mn, Cr, Ni, total of other alloy elements.
> &nbsp;&nbsp;— Tonnes scrap used for producing 1 t crude steel.
> &nbsp;&nbsp;— % of scrap that is pre-consumer scrap.
>
> **Iron or steel products**
> &nbsp;&nbsp;— The main reducing agent used in precursor production, if known.
> &nbsp;&nbsp;— Mass % of Mn, Cr, Ni, total of other alloy elements.
> &nbsp;&nbsp;— Tonnes scrap used for producing 1 t of the product.
> &nbsp;&nbsp;— % of scrap that is pre-consumer scrap.

**Non-authoritative bearing on our schema** (observation only — not a regulatory claim):
- "The main reducing agent used" is the source parameter behind the DRI/EAF-vs-BF/BOF distinction
  our `route_code` split encodes (`20260718_cbam_route_split_eaf.sql`).
- "Mass % of Mn, Cr, Ni, total of other alloy elements" is the source parameter behind
  `steel_grade` (carbon / low_alloy / high_alloy) (`20260718_cbam_process_steel_grade.sql`).
- "Tonnes scrap used for producing 1 t crude steel" and "% of scrap that is pre-consumer scrap" are
  the source parameters behind `cbam_charge_mix` — including the pre-consumer-scrap distinction that
  migration's header anticipated as a future precursor.
  These mappings are ours; §2 does not name our columns and the correspondence should be verified,
  not assumed.

---

## 3. Does §2 define the "share of embedded emissions for which default values were used"?

**No. §2 is silent on it — which closes the question as unresolvable from Annex IV.**

§2 is exclusively a table of **sector-specific physical and chemical parameters** (reducing agent,
alloy mass %, scrap ratios, clinker-to-cement ratio, nitrogen content, purity/concentration). The
words "share," "default value," "embedded emissions," "denominator," "percentage of emissions," and
any unit for the §1.1 15(d) / §1.2 (4)(b) share **do not appear anywhere in §2**. It neither defines
a denominator (total embedded emissions of the good vs precursor-only), nor a unit (%, fraction, or
mass of CO₂e), nor any scoping (direct-only vs both legs) for that quantity.

§2 was the last unread candidate in Annex IV. Therefore the three open questions from the earlier
§1.2 (4)(b) analysis — **denominator, leg-scope, and expression of the default-value share** — are
**not answerable from Annex IV**. Any resolution would have to come from the operative articles
(e.g. Articles 3–9, 14) or another annex, none of which is claimed here.

---

## 4. Does §2 impose required data fields beyond §1.1 and §1.2?

**Yes.** §2 requires per-category parameters that appear as named fields in **neither** the §1.1
35-item list nor the §1.2 16-item list. For iron & steel these include, at minimum:

- the **main reducing agent** (Pig Iron, DRI, Crude steel, Iron or steel products);
- **Mass % of Mn, Cr, Ni, total of other alloy elements** (all steel-tree categories);
- **Tonnes scrap used per 1 t** of crude steel / product, and **% of scrap that is pre-consumer
  scrap** (Crude steel, Iron or steel products);
- (other sectors) clinker-to-cement ratio, nitrogen content / purity / concentration, etc.

These are pulled into the report only through a **pointer**, not by being enumerated in the item
lists:

- **§1.1 item 35** is the hook — "The values for the sector-specific parameters required for each
  good **in accordance with point 2 of this Annex**." So the full operator's report incorporates §2
  by reference.
- **§1.2 (the summary report) contains no equivalent pointer to §2.** No §1.2 item references "point
  2" or "sector-specific parameters." On the face of the text, the sector-specific parameters are a
  **full-report** requirement (via item 35) that is **not** restated as a summary-report requirement.
  Flagged as an observation, not resolved (see Ambiguity 6).

So an operator must report the §2 parameters (in the full report) even though they are not spelled
out in either numbered list — item 35 is the only place the obligation surfaces in the lists.

---

## 5. Ambiguities & source artefacts — flagged, not resolved

Recorded as flags. None normalised.

1. **CO₂ / NH₄⁺ / NO₃⁻ sub- and superscript rendering.** Source encodes these with `<span
   class="oj-sub">` and `<span class="oj-super">` (e.g. `NH<sub>4</sub><super>+</super>`). Rendered
   as Unicode `NH₄⁺`, `NO₃⁻`. The nitrate superscript is a dash glyph "–" in the source (rendered
   here as the minus sign "⁻"). Canonical form must be chosen deliberately if these strings are
   stored for verbatim display.

2. **"FeNi – Ferro-Nickel: Mass % of and carbon."** The requirement cell reads, verbatim, "Mass %
   **of and** carbon." — an element name (almost certainly "Ni") is **missing** between "of" and
   "and". Compare the parallel rows "Mass % of **Mn** and carbon" (FeMn) and "Mass % of **Cr** and
   carbon" (FeCr). This is a defect **in the source**, not the extraction. Retained verbatim; **not**
   corrected to "Ni".

3. **Inconsistent dash in the ferro-alloy category names.** "FeMn Ferro-Manganese" (no separator)
   vs "FeCr **–** Ferro-Chromium" and "FeNi **–** Ferro-Nickel" (en-dash separator). Same three-row
   cluster, inconsistent punctuation in the source. Preserved.

4. **Inconsistent capitalisation of category names.** "Sintered Ore", "Pig Iron" (title case) vs
   "Crude steel", "Iron or steel products", "Mixed fertilisers", "Calcined clay" (sentence case).
   As in the source; not normalised.

5. **"N.a." as an explicit value.** Several categories (Calcined clay, Cement clinker, Aluminous
   cement, Hydrogen, Sintered Ore) carry a single requirement of "— N.a." This is an explicit
   "not applicable" entry in the source, **not** a missing/empty cell — do not coerce it to null or
   drop the row.

6. **Sector-specific parameters are reachable from §1.1 (item 35) but from no §1.2 item.** The full
   report incorporates §2 by reference via item 35; the summary report (§1.2) has no pointer to
   point 2. Whether the §2 parameters are intended to be part of the summary report is **not stated**
   in the text. Flagged; not resolved.

7. **"tonnes" vs "t" and "per cent" vs "%" — inconsistent within §2.** "Tonnes scrap used for
   producing 1 **t** crude steel"; "clinker to cement ratio expressed in **per cent**" while other
   cells use "**%**" ("mass %", "1 %"). Unit expression is not uniform across the table. Preserved
   as written; not harmonised.

8. **No lead-in prose and no footnotes.** Unlike a reader might expect, §2 has no introductory
   sentence and no table footnotes. Recorded so a future reader does not assume something was
   dropped in extraction.

---

## 6. Annex IV is now fully extracted

With §1.1, §1.1.1, §1.2 and §2 captured across the three companion files, **all of Annex IV of IR
(EU) 2025/2547 is now in the repo verbatim.** The earlier finding stands: Annex IV **is** the
template — "minimum elements … containing at least" — and it references no external form, XSD, or
schema. Structural choices beyond these minimum elements are implementation decisions, not
obligations traceable to this instrument, and must not be presented to a verifier as such.
