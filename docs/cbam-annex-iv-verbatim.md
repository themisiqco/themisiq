# CBAM — IR (EU) 2025/2547, Annex IV (verbatim extraction)

## Provenance

| Field | Value |
|---|---|
| **Instrument** | Commission Implementing Regulation (EU) 2025/2547 of 10 December 2025 |
| **Publication** | Official Journal of the European Union, L series, 22.12.2025 |
| **CELEX** | 32025R2547 |
| **Cellar work ID** | `cellar:128503d5-defb-11f0-8439-01aa75ed71a1` |
| **Retrieved from** | EUR-Lex HTML endpoint (`legal-content/EN/TXT/HTML/?uri=CELEX:32025R2547`), HTTP 200, 1 365 835 bytes |
| **Extraction date** | 2026-07-18 |

**On the Cellar route.** `http://publications.europa.eu/resource/celex/32025R2547` returned **HTTP 400**, but usefully so: it *resolved the work ID* and rejected only the content-type negotiation, with the body `None of the requests returned successfully a redirection. The following exception was thrown: [Invalid content type CONTENT_STREAM for WORK ['cellar:128503d5-defb-11f0-8439-01aa75ed71a1'] without language]`. Existence of the document is therefore confirmed by two independent endpoints. The EUR-Lex HTML endpoint was **not** WAF-blocked on this retrieval.

**No imaged content was skipped.** The document embeds **56 base64 JPEGs** (the equations, which live in the earlier annexes). Within the Annex IV byte range of the raw HTML there are **0 `<img>` tags**. Every element of Annex IV is machine-readable text; nothing required OCR and nothing was omitted.

**Fidelity note.** Section §1.2 below is reproduced verbatim, including the source's own inconsistencies. It has **not** been normalised. See [Ambiguities](#ambiguities--unresolved-flags).

---

## 1. Structure of Annex IV

> **ANNEX IV**
> **Template of the operator's emissions report**

Subdivision headings, worded exactly as the source words them:

| Ref | Exact heading | Numbering style |
|---|---|---|
| **1.** | `OUTLINE OF THE OPERATOR'S EMISSIONS REPORT` | — (container) |
| **1.1.** | `Template containing the minimum elements to be contained in the operator's emissions report as compared to the summary emissions report` | bare `1.`–`35.` |
| **1.1.1.** | `Declarant-specific addendum to the operator's emissions report for electricity imported into the customs territory of the Union` | `(1)`–`(3)` |
| **1.2.** | `Operator's summary emissions report` | `(1)`–`(16)` |
| **2.** | `SECTOR-SPECIFIC PARAMETERS TO BE INCLUDED IN THE EMISSIONS REPORT` | table by aggregated goods category |

**Numbering styles differ per subdivision and must be preserved.** §1.1 uses bare numerals `1.` through `35.` (35 items — not 16). §1.1.1 uses parenthesised `(1)`–`(3)`. §1.2 uses parenthesised `(1)`–`(16)`. Collapsing these into one scheme loses the source's own distinction between the three lists.

---

## 2. §1.2 — Operator's summary emissions report (verbatim, all 16 items)

> **1.2.  Operator's summary emissions report**
>
> The following information contained in the operator's emissions report shall also be contained in the operator's summary emissions report:
>
> **(1)** Identification of the operator and the installation:
> &nbsp;&nbsp;**(a)** name of the operator;
> &nbsp;&nbsp;**(b)** corporate or activity registration number of the operator;
> &nbsp;&nbsp;**(c)** full address in English.
>
> **(2)** The installation under verification, identified by the following data:
> &nbsp;&nbsp;**(a)** name of the installation;
> &nbsp;&nbsp;**(b)** unique installation identifier in the CBAM Registry;
> &nbsp;&nbsp;**(c)** applicable United Nations Code for Trade and Transport Location (UN/LOCODE) of the location;
> &nbsp;&nbsp;**(d)** full address in English;
> &nbsp;&nbsp;**(e)** and geographical coordinates of the installation's main emission source.
>
> **(3)** A list of all CBAM production processes and routes carried out at the installation with a specification of goods per production process.
>
> **(4)** For each of the goods:
> &nbsp;&nbsp;**(a)** the specific direct embedded emissions of each of the goods;
> &nbsp;&nbsp;**(b)** the share of embedded emissions for which default values were used;
> &nbsp;&nbsp;**(c)** for goods that are not listed in Annex II to Regulation (EU) 2023/956:
> &nbsp;&nbsp;&nbsp;&nbsp;— The share of indirect emissions determined on the basis of actual values in accordance with Article 9 of this Regulation;
> &nbsp;&nbsp;&nbsp;&nbsp;— The share of indirect emissions determined on the basis of default values in accordance with Article 9 of this Regulation;
> &nbsp;&nbsp;&nbsp;&nbsp;— For the share of indirect emissions determined on the basis of actual values, confirmation that the criteria for the use of actual values laid down in point 6 of Annex IV to Regulation (EU) 2023/956 are met;
> &nbsp;&nbsp;&nbsp;&nbsp;— The specific indirect emissions calculated pursuant to Article 9 of this Regulation for each good produced;
> &nbsp;&nbsp;**(d)** for electricity imported into the customs territory of the Union:
> &nbsp;&nbsp;&nbsp;&nbsp;— confirmation, where relevant, that the criterion for the use of actual values laid down in point 5(b) of Annex IV to Regulation (EU) 2023/956, related to the direct connection between the installation producing electricity and the Union transmission system, is met;
> &nbsp;&nbsp;&nbsp;&nbsp;— confirmation that the criterion for the use of actual values laid down in point 5(c) of Annex IV to Regulation (EU) 2023/956 is met, and a confirmation that the related elements of evidence laid down in point D.2.4 of Annex II were submitted to the verifier;
> &nbsp;&nbsp;&nbsp;&nbsp;— the emission factor for the imported electricity determined on the basis of actual emissions;
> &nbsp;&nbsp;**(e)** The specific embedded free allocation of each of the goods produced;
> &nbsp;&nbsp;**(f)** Confirmation of the use of the applicable CBAM benchmarks and the methods used for determining the specific embedded free allocation.
>
> **(5)** The total direct emissions of the installation during the reporting period and total direct emissions per production process.
>
> **(6)** If the installation produces goods which are not listed in Annex II to Regulation (EU) 2023/956, the indirect emissions of the installation during the reporting period.
>
> **(7)** Whether measurable heat is imported from or exported to other installations.
>
> **(8)** Whether any zero-rated fuels are used and how the operator demonstrates the applicability of zero-rating of the fuels.
>
> **(9)** Whether waste gases are produced and used in the installation, or imported from or exported to other installations.
>
> **(10)** Whether CO₂ capture is used, and an identification of the installation or transport infrastructure to which it is transferred.
>
> **(11)** For indirect emissions, where electricity is produced inside the installation, whether electricity is:
> &nbsp;&nbsp;**(a)** produced by co-generation;
> &nbsp;&nbsp;**(b)** produced by separate generation;
> &nbsp;&nbsp;**(c)** produced from fossil or renewable sources;
> &nbsp;&nbsp;**(d)** exported from the system boundaries of a production process.
>
> **(12)** Data on each precursor used, and for which default values were used, excluding precursors produced in the production process in accordance with Article 4(9):
> &nbsp;&nbsp;**(a)** CN code;
> &nbsp;&nbsp;**(b)** name of the good;
> &nbsp;&nbsp;**(c)** country of origin, where it is known and where the precursor was produced outside the installation;
> &nbsp;&nbsp;**(d)** the applicable default value.
>
> **(13)** Data on each precursor used, and for which actual values were used, excluding precursors produced in the production process in accordance with Article 4(9):
> &nbsp;&nbsp;**(a)** CN code;
> &nbsp;&nbsp;**(b)** name of the good;
> &nbsp;&nbsp;**(c)** country of origin, where the precursor was produced outside the installation;
> &nbsp;&nbsp;**(d)** reporting period, and indication of the year during which the precursor was used for the production of a complex good;
> &nbsp;&nbsp;**(e)** specific embedded (direct and, if applicable, indirect) emissions.
>
> **(14)** Where an installation producing complex goods receives, from another installation, precursors under a given CN code produced during different reporting periods, the specific embedded emissions (direct and, if applicable, indirect) to be used for that precursor in accordance with Article 14(1).
>
> **(15)** Where the production process of a complex good used a type of precursor obtained from multiple installations, the specific embedded (direct and, if applicable, indirect) emissions to be used for that precursor, and an indication whether they were determined by using the default method laid down in Article 14 or by calculating the embedded emissions of the precursor obtained from a specific installation or subset of installations in accordance with that Article.
>
> **(16)** Information on the operator and the installation of origin of the precursor: name of the operator; name of the installation; unique installation identifier in the CBAM Registry, if applicable; applicable reporting period.

---

## 3. Structural corrections

Three findings that contradict plausible-but-wrong readings of Annex IV. Each was verified against the raw HTML, not inferred.

### (a) §1.1 is NOT a two-column comparison table

Its heading — "…as compared to the summary emissions report" — invites the assumption that §1.1 is a table with per-report columns and tick-marks. **It is not.** The Annex IV range of the raw HTML contains **179 `<table>` elements**, but every one is a **single-row layout wrapper** (2–5 `<td>`), which is EUR-Lex's standard rendering for numbered lists: one cell for the item number, one for the text. There is no data table and **no per-item column indicating which items belong to which report**.

The full/summary comparison is expressed **solely by §1.2 restating its own items**. Any flattening of §1.1 to plain text loses nothing.

### (b) §1.2's items do NOT map 1:1 onto §1.1's numbering

The two lists are **independently numbered and independently worded**, with different sub-part structure and, in places, different substance. Worked example: §1.1 folds the installation into item `1(d)` as a dash-list; §1.2 promotes it to its own item `(2)` with lettered sub-parts `(a)`–`(e)`.

> **Consequence for implementation:** a typed structure for the summary report must be built **from §1.2's own list**. It must **not** be modelled as a filter, subset selector, or projection over §1.1's item numbers — that relation does not exist in the source.

### (c) Annex IV never says the summary is communicated to the declarant

The phrase "summary emissions report" occurs **exactly 3 times in the whole regulation**, all inside Annex IV, and none of the three describes a recipient. The operative transmission rule lives in **Article 10**, outside the annex, and its addressee is the **verifier** — not the declarant. Declarant access derives only from **recital 17**, and it is **permissive, not mandatory** (see §4).

> The summary is therefore most accurately typed as **the disclosable subset of the operator's emissions report**, not as "the declarant communication." The practical payload may coincide; the framing does not, and the distinction is load-bearing if a verifier asks which obligation the structure implements.

---

## 4. Transmission rules (verbatim)

These sit **outside** Annex IV. Article 10 is the binding hook; the annex itself imposes no transmission duty.

> **Article 10 — Operator's emissions report**
>
> **1.** Where the embedded emissions are calculated based on actual emissions, the operators shall prepare an emissions report ('operator's emissions report') and a summary thereof containing at least the information listed in the templates in points 1.1 and 1.2 of Annex IV. Where the embedded emissions of electricity are calculated based on actual emissions, operators shall, in addition, prepare a declarant-specific addendum to the operator's emissions report containing the information listed in point 1.1.1 of that Annex.
>
> **2.** Where operators are registered in the CBAM registry pursuant to Article 10 of Regulation (EU) 2023/956, they shall transmit the operator's emissions report, its summary and, if applicable, the declarant-specific addendum to the verifier via the CBAM registry.
>
> **3.** Where the operators are not registered in the CBAM registry, they shall transmit the operator's emissions report, its summary and, if applicable, the declarant-specific addendum to the verifier by means other than via the CBAM registry.
>
> **4.** The operator's emissions report shall be submitted in English.

Declarant disclosure — **recital 17**, permissive:

> **(17)** Due to the commercially sensitive nature of some data elements contained in the operator's emissions report, operators should prepare a summary version of that report to be included in the verification report and to be made accessible to authorised CBAM declarants. Where operators are registered in the CBAM Registry in accordance with Article 10 of Regulation (EU) 2023/956, the operators should be able to choose to disclose to the authorised CBAM declarant only the summary version of the operator's emissions report and, where applicable, the relevant declarant-specific addendum to the operator's emissions report.

**The CBAM Registry plays two distinct roles — do not conflate them:**

| Role | Where | What it means |
|---|---|---|
| **Data field** | Annex IV §1.2 items `(2)(b)` and `(16)` | "unique installation identifier in the CBAM Registry" — an identifier to be reported |
| **Transmission mechanism** | Article 10(2)–(3) only | Registered operators transmit *via* the Registry; unregistered operators "by means other than via the CBAM registry" |

---

## 5. Ambiguities — unresolved flags

Recorded as flags, deliberately **not** resolved. Each is a real property of the source or of the extraction pipeline, and each is a decision point for any downstream typed structure.

1. **CO₂ subscript rendering.** The source uses a typographic subscript. The text-extraction pipeline emitted it as `CO 2` (with a space); it is rendered `CO₂` in §2 above. If the typed structure stores these strings for verbatim display, the canonical form must be chosen deliberately — three candidate forms exist (`CO 2`, `CO2`, `CO₂`) and they are not interchangeable for a verifier cross-checking against the OJ.

2. **Inconsistent capitalisation in item (4) — in the source, not the extraction.** Sub-parts `(a)`–`(d)` begin lowercase; `(e)` and `(f)` begin uppercase ("The specific…", "Confirmation of…"). Within `(4)(c)` the dash-items begin uppercase; within `(4)(d)` they begin lowercase. Preserved as-is. **Do not normalise** if verbatim fidelity is required.

3. **Item (2)(e) begins with "and".** — "and geographical coordinates of the installation's main emission source." This is an artefact of §1.1's dash-list being renumbered into lettered sub-parts in §1.2. Present in the source; retained.

4. **Leading double spaces in items (7), (9) and (10).** Present in the raw extracted text. Almost certainly a typesetting artefact rather than meaningful, but **not** normalised here.

5. **§1.2 item (15) vs §1.1 item 25 — wording divergence.** §1.2 `(15)` reads "a **type of** precursor obtained from multiple installations" and cites "**Article 14**" generally; the corresponding §1.1 item `25.` reads "a precursor **under a given CN code**" and cites "**Article 14(2)**". The divergence is in the source. It has **not** been reconciled, and it should not be silently harmonised in either direction — the narrower §1.1 wording and the broader §1.2 wording may carry different scope.

---

## 6. No external template exists

**Annex IV *is* the template.** It references **no** external form, no Commission-published document, no XSD, and no schema file. It specifies **minimum elements only** — its own heading for §1.1 is "Template containing the **minimum elements** to be contained in…", and Article 10(1) binds operators to information "**containing at least** the information listed in the templates in points 1.1 and 1.2 of Annex IV."

Any structural choices beyond those minimum elements — field ordering, cardinality, encoding, serialisation — are implementation decisions, not requirements traceable to this instrument. They should not be presented to a verifier as regulatory obligations.
