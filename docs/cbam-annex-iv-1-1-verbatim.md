# CBAM — IR (EU) 2025/2547, Annex IV point 1.1 + 1.1.1 (verbatim extraction)

Companion to `docs/cbam-annex-iv-verbatim.md` (which covers §1.2, the summary report). This file
covers **§1.1** — the 35-item template of the *full* operator's emissions report — and **§1.1.1**,
the declarant-specific addendum for imported electricity.

## Provenance

| Field | Value |
|---|---|
| **Instrument** | Commission Implementing Regulation (EU) 2025/2547 of 10 December 2025 |
| **Publication** | Official Journal of the European Union, L series, 22.12.2025 |
| **CELEX** | 32025R2547 |
| **Cellar work ID** | `cellar:128503d5-defb-11f0-8439-01aa75ed71a1` |
| **Retrieved from** | EUR-Lex HTML endpoint (`legal-content/EN/TXT/HTML/?uri=CELEX:32025R2547`), HTTP 200 |
| **Retrieval method actually used** | Raw HTML via `curl` (see note), NOT the markdown-conversion fetch path |
| **Byte count (full document)** | 1 365 835 bytes — identical to the §1.2 extraction's recorded size |
| **Annex IV byte range extracted** | ≈ 1 221 100 – 1 290 700 of the raw HTML |
| **Extraction date** | 2026-07-21 |

**On the retrieval method.** The markdown-conversion fetch path **could not reach Annex IV**: it
truncated the converted document at ≈ 156 000 characters, inside **Annex II** ("A.5. Monitoring
plan"), which is well before Annex IV near the end of a 1.36 MB file. Two such fetches this session
returned empty, and a third returned only the truncated head. Annex IV was therefore retrieved the
same way the original §1.2 extraction was done — by pulling the **raw HTML** and slicing the Annex
IV **byte range** directly (the raw file matched the recorded 1 365 835 bytes exactly), then
stripping tags. This is a retrieval-mechanism note only; the text below is the source's, verbatim.

**Subscript handling.** Every "CO₂" in the source is encoded `CO<span class="oj-sub">2</span>` — a
typographic subscript, not the literal string "CO2" and not "CO 2". It is rendered **CO₂** below.
This is the same canonical-form decision flagged in the §1.2 file (Ambiguity 1) and is repeated in
this file's Ambiguities section. It occurs in items 6, 15(a) and 16(d).

---

## Scope statement — what was and was not captured

**Captured (verbatim, below):**
- §1.1, the heading and **all 35 numbered items** (`1.`–`35.`), with every lettered sub-part
  `(a)…` and every dashed sub-item `—`.
- §1.1.1, the addendum heading, its lead-in sentence, and **all 3 items** `(1)`–`(3)`.

**NOT captured here (out of scope for this file):**
- §1.2 (the 16-item summary report) — already in `docs/cbam-annex-iv-verbatim.md`.
- §2 ("Sector-specific parameters…") — a table by aggregated goods category; **not extracted**.
  §1.1 item 35 points into it ("in accordance with point 2 of this Annex"), but point 2's content
  is not reproduced here. If a denominator or unit for the "share" quantities is defined anywhere in
  Annex IV, §2 is the remaining unread candidate.
- The 56 base64 equation JPEGs in the earlier annexes — not part of Annex IV.

**Nothing in the §1.1 / §1.1.1 range required OCR** — every element is machine-readable text.

---

## 1. §1.1 — Template of the full operator's emissions report (verbatim, all 35 items)

> **1.1.   Template containing the minimum elements to be contained in the operator's emissions report as compared to the summary emissions report**
>
> **1.** Identification of the operator and the installation:
> &nbsp;&nbsp;**(a)** name of the operator;
> &nbsp;&nbsp;**(b)** corporate or activity registration number of the operator;
> &nbsp;&nbsp;**(c)** full address in English;
> &nbsp;&nbsp;**(d)** the installation under verification, identified by the following data:
> &nbsp;&nbsp;&nbsp;&nbsp;— name of the installation;
> &nbsp;&nbsp;&nbsp;&nbsp;— unique installation identifier in the CBAM Registry;
> &nbsp;&nbsp;&nbsp;&nbsp;— applicable United Nations Code for Trade and Transport Location (UN/LOCODE) of the location;
> &nbsp;&nbsp;&nbsp;&nbsp;— full address in English transcript;
> &nbsp;&nbsp;&nbsp;&nbsp;— and geographical coordinates of the installation's main emission source.
>
> **2.** Summary of the installation's monitoring plan, containing at least the following information:
> &nbsp;&nbsp;**(a)** list of all CBAM production processes and routes carried out at the installation;
> &nbsp;&nbsp;**(b)** list of non-CBAM production processes carried out at the installation;
> &nbsp;&nbsp;**(c)** list of the five most important (by mass) goods produced per production process, identified by CN code;
> &nbsp;&nbsp;**(d)** list of the five most important (by energy content provided) fuels used at the installation;
> &nbsp;&nbsp;**(e)** list of the five most important (by emissions) materials used at the installation leading to process emissions;
> &nbsp;&nbsp;**(f)** if continuous emissions measurement is used at the installation, the relevant greenhouse gases and the five biggest emissions sources, to which it is applied;
> &nbsp;&nbsp;**(g)** whether any zero-rated fuels are used and how the operator demonstrates the applicability of zero-rating of the fuels;
> &nbsp;&nbsp;**(h)** whether measurable heat is imported from or exported to other installations, and an identification of those installations.
>
> **3.** For indirect emissions, whether electricity is consumed from different sources and in which quantities. If the sources include other installations, the name and country of origin of the suppliers.
>
> **4.** For indirect emissions, where electricity is produced inside the installation, whether electricity is:
> &nbsp;&nbsp;**(a)** produced by co-generation;
> &nbsp;&nbsp;**(b)** produced by separate generation;
> &nbsp;&nbsp;**(c)** produced from fossil or renewable sources;
> &nbsp;&nbsp;**(d)** exported from the system boundaries of a production process.
>
> **5.** Whether waste gases are produced and used in the installation, or imported from or exported to other installations, and an identification of those installations.
>
> **6.** Whether CO₂ transfer applies, and the identity and contact data of a responsible person of the receiving installations or transport infrastructure or entities to which it is transferred.
>
> **7.** The total direct emissions of the installation during the reporting period.
>
> **8.** If applicable, for new installations, time period (in months) used for the monitoring of emissions.
>
> **9.** Where an installation produces goods listed in Annex I to Regulation (EU) 2023/956 but not in Annex II to that Regulation, the total quantity of electricity consumed in the installation.
>
> **10.** Where an installation produces goods listed in Annex I to Regulation (EU) 2023/956 but not in Annex II of that Regulation, the quantity of electricity consumed in the installation for the production of these goods.
>
> **11.** Where an installation produces goods listed in Annex I to Regulation (EU) 2023/956 but not in Annex II to that Regulation, the identification of the installations from which the electricity is obtained.
>
> **12.** Where relevant, if the installation consumes electricity from different sources, the quantity of electricity consumed per source, the country of origin of the electricity per source, the emission factor per source, and the emission factor calculated for the purpose of determining embedded indirect emissions pursuant to Article 9.
>
> **13.** Total goods produced at the installation and per production process, and the quantity produced.
>
> **14.** If relevant, non-CBAM goods produced per production process and the quantity produced.
>
> **15.** For each of the goods:
> &nbsp;&nbsp;**(a)** the specific direct embedded emissions of each of the goods, expressed in tonnes of CO₂ per functional unit;
> &nbsp;&nbsp;**(b)** the specific direct embedded emissions of each of the compositions of the goods, where applicable;
> &nbsp;&nbsp;**(c)** information on the data quality and methods used, in particular if the embedded emissions have been completely determined based on monitoring, or whether any of the default values made available in accordance with Annex IV of Regulation (EU) 2023/956 have been used;
> &nbsp;&nbsp;**(d)** the share of embedded emissions for which default values were used;
> &nbsp;&nbsp;**(e)** for goods that are not listed in Annex II to Regulation (EU) 2023/956:
> &nbsp;&nbsp;&nbsp;&nbsp;— the share of indirect emissions determined on the basis of actual values in accordance with Article 9 of this Regulation;
> &nbsp;&nbsp;&nbsp;&nbsp;— the share of indirect emissions determined on the basis of default values in accordance with Article 9 of this Regulation;
> &nbsp;&nbsp;&nbsp;&nbsp;— for the share of indirect emissions determined on the basis of actual values, confirmation that the criteria for the use of actual values laid down in point 6 of Annex IV to Regulation (EU) 2023/956 are met, and confirmation that the related elements of evidence laid down in point D.4.3 of Annex II were submitted to the verifier;
> &nbsp;&nbsp;&nbsp;&nbsp;— the specific indirect emissions calculated pursuant to Article 9 of this Regulation for each good produced;
> &nbsp;&nbsp;**(f)** for electricity imported into the customs territory of the Union:
> &nbsp;&nbsp;&nbsp;&nbsp;— confirmation, where relevant, that the criterion for the use of actual values laid down in point 5(b) of Annex IV to Regulation (EU) 2023/956, related to the direct connection between the installation producing electricity and the Union transmission system, is met, and a confirmation that the related elements of evidence laid down in point D.2.4 of Annex II were submitted to the verifier;
> &nbsp;&nbsp;&nbsp;&nbsp;— confirmation that the criterion for the use of actual values laid down in point 5(c) of Annex IV to Regulation (EU) 2023/956 is met, and a confirmation that the related elements of evidence laid down in point D.2.4 of Annex II were submitted to the verifier;
> &nbsp;&nbsp;&nbsp;&nbsp;— an indication that the relevant declarant-specific addenda containing the elements laid down in point 1.1.1 of this Annex were sent to the verifier;
> &nbsp;&nbsp;&nbsp;&nbsp;— the emission factor for the imported electricity determined on the basis of actual emissions.
>
> **16.** Total emissions of the installation, including:
> &nbsp;&nbsp;**(a)** activity data per production process and calculation factors for each source stream used;
> &nbsp;&nbsp;**(b)** emissions of each emission source monitored using a measurement-based methodology;
> &nbsp;&nbsp;**(c)** emissions determined by other methods;
> &nbsp;&nbsp;**(d)** quantities of CO₂ received from other installations or exported to other installations, for the purpose of geological storage or as input to products in which the CO₂ is permanently chemically bound;
> &nbsp;&nbsp;**(e)** information about data gaps and estimates used.
>
> **17.** A balance of imported, produced, consumed, and exported measurable heat, waste gases and electricity per production process.
>
> **18.** The quantity of each type of precursor, produced at the installation and used by that installation, excluding precursors produced in the production process in accordance with Article 4(9).
>
> **19.** The quantity of each type of precursor, produced at the installation and used in each production process, excluding precursors produced in the production process in accordance with Article 4(9).
>
> **20.** The quantity of each type of precursor, produced outside the installation, and used by the installation.
>
> **21.** The quantity of each type of precursors, produced outside the installation, and used in each production process.
>
> **22.** Data on each type of precursor that was used by the installation, and for which default values were used, excluding precursors produced in the production process in accordance with Article 4(9):
> &nbsp;&nbsp;**(a)** CN code;
> &nbsp;&nbsp;**(b)** name of the good;
> &nbsp;&nbsp;**(c)** country of origin, where it is known and where the precursor was produced outside the installation;
> &nbsp;&nbsp;**(d)** the applicable default value.
>
> **23.** Data on each type of precursor that was used by the installation, and for which actual values were used, excluding precursors produced in the production process in accordance with Article 4(9):
> &nbsp;&nbsp;**(a)** CN code;
> &nbsp;&nbsp;**(b)** name of the good;
> &nbsp;&nbsp;**(c)** country of origin, where the precursor was produced outside the installation;
> &nbsp;&nbsp;**(d)** reporting period, and indication of whether it was determined using the default reporting period or the actual time of production;
> &nbsp;&nbsp;**(e)** specific embedded (direct and, if applicable, indirect) emissions.
>
> **24.** Where an installation producing complex goods receives, from another installation, precursors under a given CN code produced during different reporting periods, the specific embedded emissions (direct and, if applicable, indirect) to be used for that precursor in accordance with Article 14(1).
>
> **25.** Where the production process of a complex good used a precursor under a given CN code obtained from multiple installations, the specific embedded (direct and, if applicable, indirect) emissions to be used for that precursor, and an indication whether they were determined by using the default method laid down in Article 14(2) or by calculating the embedded emissions of the precursor obtained from a specific installation or subset of installations in accordance with Article 14(3).
>
> **26.** Where relevant, the quantity of electricity used in each production process.
>
> **27.** The quantity of precursors produced at the installation and used in each production process, excluding precursors produced in the production process, in accordance with Article 4.
>
> **28.** Information on the operator and the installation of origin of the precursor: name of the operator; name of the installation; unique installation identifier in the CBAM Registry, if applicable; applicable reporting period.
>
> **29.** Information on how the attributed direct and indirect emissions of each production process were calculated.
>
> **30.** The activity level and attributed emissions of each production process.
>
> **31.** A list of all relevant goods produced measured in the functional unit for each CN code, including precursors not covered by separate production processes than the complex goods in accordance with Article 4.
>
> **32.** Information on the electricity emissions factor if actual values are used, where appropriate.
>
> **33.** Information on the electricity emissions factor in the power purchase agreement, where appropriate.
>
> **34.** Quantity of goods per production route, as follows:
> &nbsp;&nbsp;**(a)** quantities of each good, measured in the functional unit for each CN code;
> &nbsp;&nbsp;**(b)** where the functional unit pursuant to Article 4 is different from the tonnes of goods per CN code, quantities of goods expressed in functional unit produced in the reporting period per production process.
>
> **35.** The values for the sector-specific parameters required for each good in accordance with point 2 of this Annex.

---

## 2. §1.1.1 — Declarant-specific addendum (verbatim, all 3 items)

> **1.1.1.   Declarant-specific addendum to the operator's emissions report for electricity imported into the customs territory of the Union**
>
> The addendum to the operator's emissions report created for each authorised CBAM declarant in accordance with Article 8(4) shall contain the following:
>
> **(1)** the EORI number of the authorised CBAM declarant to whom the declarant-specific addendum refers;
>
> **(2)** an indication that the criteria for the use of actual values laid down in point 5, first subparagraph, points (a) and (d) of Annex IV to Regulation (EU) 2023/956, as well as, where relevant, laid down in point 5 first subparagraph, point (b) of Annex IV to that Regulation in relation to the lack of physical network congestion, are met, and a confirmation that the related elements of evidence laid down in point D.2.4 of Annex II were submitted to the verifier;
>
> **(3)** the quantity of electricity imported by that authorised CBAM declarant from the relevant installation for which the criteria laid down in point 5 of Annex IV to Regulation (EU) 2023/956 are met.

---

## 3. Correspondence to §1.2 — stated or unmistakable only

Per the established finding (`docs/cbam-annex-iv-verbatim.md` §3(b)) that the two lists are
**independently numbered and reworded**, this is a comparison, not a filter. Only correspondences
that are unmistakable are asserted; everything else is marked *no clear counterpart* or *unclear*.
Where a correspondence exists, wording still frequently differs — differences are noted, not reconciled.

| §1.1 item | §1.2 counterpart | Basis / caveat |
|---|---|---|
| **1** | **(1) + (2)** | Unmistakable but **structurally split**: §1.1 folds operator (a–c) and installation (as dash-list 1(d)) into one item; §1.2 promotes the installation to its own item (2)(a)–(e). See wording divergence on the address, below. |
| **2** | *no single counterpart* | Full-report monitoring-plan summary. Fragments overlap: 2(a) cf §1.2 (3); 2(g) cf §1.2 (8); 2(h) cf §1.2 (7) — but item 2 as a whole has no §1.2 item. |
| **3** | *unclear* | Indirect-electricity **consumption sourcing**; §1.2 has no clean match (§1.2 (11) concerns electricity *produced* on site, not consumed). |
| **4** | **(11)** | Unmistakable — identical sub-parts (a)–(d). |
| **5** | **(9)** | Clear; §1.1 adds "and an identification of those installations." |
| **6** | **(10)** | **Related but reworded** — §1.1: "CO₂ **transfer** … identity and contact data of a responsible person"; §1.2: "CO₂ **capture** is used, and an identification of the installation or transport infrastructure." Do not treat as identical. |
| **7** | **(5)** | Related; §1.2 adds "and total direct emissions per production process." |
| **8** | *no counterpart* | New-installation monitoring period; full-report only. |
| **9, 10, 11** | *partial / unclear* | Non-Annex-II electricity detail. §1.2 (6) covers non-Annex-II **indirect emissions**; §1.1 9–11 cover **electricity quantities and sources** — a different quantity. Not asserted as a clean match. |
| **12** | *unclear* | Per-source electricity emission-factor detail; closest is §1.2 (4)(d)/(6) but not a match. |
| **13, 14** | *no counterpart* | Full-report goods totals; §1.2 has none. |
| **15** | **(4)** | Unmistakable overall ("For each of the goods"), **but sub-parts diverge substantively** — see §4. |
| **16, 17** | *no counterpart* | Full-report emissions breakdown / heat-gas-electricity balance. |
| **18, 19, 20, 21** | *no counterpart* | Precursor quantities (produced-in/out, per-installation/per-process). §1.2 does not enumerate these. |
| **22** | **(12)** | Unmistakable; §1.1 "each **type of** precursor that was used by the installation" vs §1.2 "each precursor used." |
| **23** | **(13)** | Unmistakable; **23(d) differs** — §1.1: "indication of whether it was determined using the default reporting period or the actual time of production"; §1.2 (13)(d): "indication of the year during which the precursor was used for the production of a complex good." |
| **24** | **(14)** | Unmistakable (Article 14(1)). |
| **25** | **(15)** | Corresponds, **but divergent wording** — the exact divergence flagged as Ambiguity 5 in the §1.2 file, now confirmed from source: see §4. |
| **26, 27** | *unclear / no counterpart* | Per-process electricity / precursor quantities. Note 27's citation oddity in §4. |
| **28** | **(16)** | Unmistakable — **word-for-word identical**. |
| **29, 30, 31** | *no counterpart* | Attributed-emissions method, activity levels, goods list in functional units. |
| **32, 33** | *no counterpart* | Electricity emission factor (actual values; PPA). |
| **34** | *unclear* | Quantity of goods per production route; closest is §1.2 (3) but that lists processes, not quantities. |
| **35** | *no counterpart* | Sector-specific parameters (points into §2, not extracted). §1.2 carries no equivalent. |

**Bearing on the earlier §1.2 (4)(b) question.** §1.1 item **15(d)** is **word-for-word identical**
to §1.2 (4)(b) — "the share of embedded emissions for which default values were used" — and §1.1
**also states no denominator and no unit** for that share. So the fuller §1.1 wording does **not**
resolve the earlier open questions (denominator; direct-only vs both legs; %/fraction/mass). What
§1.1 *does* add as nearby context: 15(a) specifies the *direct embedded emissions* are "expressed in
tonnes of CO₂ per functional unit" (a unit §1.2 (4)(a) omits), and 15(c) frames default values as
those "made available in accordance with Annex IV of Regulation (EU) 2023/956." Neither defines the
*share's* denominator or expression. The remaining unread candidate is **§2** (sector-specific
parameters), not extracted here.

---

## 4. Ambiguities & source artefacts — flagged, not resolved

Recorded as flags. Each is a real property of the source or the extraction. None is normalised.

1. **CO₂ subscript rendering.** Source encodes `CO<span class="oj-sub">2</span>` (items 6, 15(a),
   16(d)). Rendered **CO₂** above. Same canonical-form choice as the §1.2 file's Ambiguity 1 — three
   forms (`CO 2`, `CO2`, `CO₂`) exist and are not interchangeable for a verifier cross-checking the OJ.

2. **Item 1(d), "full address in English transcript."** The dash-item reads, in the raw HTML,
   "full address in English **transcript**;" — the trailing word "transcript" is present in the
   source. Its §1.2 counterpart (2)(d) reads only "full address in English." Retained verbatim; not
   deleted as a presumed typo.

3. **"Annex II *of* that Regulation" vs "*to* that Regulation."** Items 9 and 11 read "Annex II
   **to** that Regulation"; item **10** reads "Annex II **of** that Regulation." Same three-item
   cluster, inconsistent preposition in the source. Preserved.

4. **"each type of precursor" vs "each type of precursor**s**."** Items 18, 19, 20 read "each type of
   precursor" (singular); item **21** reads "each type of precursor**s**" (plural). Source
   inconsistency; retained.

5. **Article 4 citation divergence across the precursor items.** The "excluding precursors produced
   in the production process" carve-out cites **Article 4(9)** in items 18, 19, 22, 23 — but item
   **27** cites bare **"Article 4"** (and inserts a comma: "…in the production process, in accordance
   with Article 4."). Not harmonised.

6. **§1.1 item 25 vs §1.2 (15) — the divergence flagged as §1.2 Ambiguity 5, now confirmed from
   source.** §1.1 **25** reads "a precursor **under a given CN code** obtained from multiple
   installations … default method laid down in **Article 14(2)** … in accordance with **Article
   14(3)**." §1.2 **(15)** reads "a **type of** precursor obtained from multiple installations … the
   default method laid down in **Article 14**" (general). The narrower §1.1 wording and the broader
   §1.2 wording are both in the source; not reconciled in either direction.

7. **§1.1 item 15 carries no free-allocation / benchmark sub-parts; §1.2 (4) does.** §1.2 (4) ends
   with **(e)** "The specific embedded free allocation of each of the goods produced" and **(f)**
   "Confirmation of the use of the applicable CBAM benchmarks…". §1.1 item 15 has **no equivalent**
   sub-part, and no other §1.1 item (scanning all 35) explicitly names embedded free allocation or
   CBAM benchmarks. Conversely §1.1 15(b) (emissions "of each of the compositions of the goods") and
   15(c) (data-quality/methods) have **no** §1.2 (4) counterpart. So the summary report's item (4)
   and the full report's item 15 are **not** a sub-set relation. Flagged as a substantive asymmetry;
   not resolved (a definition may live in an un-extracted article or in §2).

8. **§1.1 15(e) third dash cites "point D.4.3 of Annex II"; the §1.2 (4)(c) counterpart omits the
   evidence clause entirely.** §1.1 15(e) dash 3 ends "…are met, **and confirmation that the related
   elements of evidence laid down in point D.4.3 of Annex II were submitted to the verifier**;". The
   corresponding §1.2 (4)(c) dash 3 (as recorded in the §1.2 file) ends at "…are met;" with no such
   evidence clause and no `D.4.3` reference. The two lists differ here in substance, not just
   numbering. Note also `D.4.3` (item 15(e)) vs `D.2.4` (item 15(f) and §1.1.1(2)) — different Annex
   II evidence points; both present as written.

9. **§1.1 15(f) has four dashes; §1.2 (4)(d) has three.** §1.1 15(f) includes an extra dash — "an
   indication that the relevant declarant-specific addenda containing the elements laid down in point
   1.1.1 of this Annex were sent to the verifier" — absent from §1.2 (4)(d); and §1.1 15(f) dash 1
   includes the "D.2.4 … submitted to the verifier" evidence clause that the §1.2 (4)(d) dash 1
   omits. Divergence preserved, not reconciled.

10. **Leading/'&nbsp;' spacing artefacts.** As with the §1.2 extraction, the raw HTML carries
    incidental whitespace inside list cells. Item text has been trimmed for readability here; no
    words were added or removed. If byte-exact fidelity is later required, re-derive from the raw
    HTML byte range recorded in the provenance table.

---

## 5. No external template exists

Unchanged from the §1.2 file's finding: **Annex IV *is* the template.** §1.1's own heading binds
only the "**minimum elements to be contained**," and Article 10(1) binds operators to information
"**containing at least**" these items. Field ordering, cardinality, encoding and serialisation
beyond these minimum elements are implementation decisions, not obligations traceable to this
instrument, and must not be presented to a verifier as such.
