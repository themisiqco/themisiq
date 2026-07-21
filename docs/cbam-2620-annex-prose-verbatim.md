# CBAM — IR (EU) 2025/2620, Annex prose (verbatim extraction)

Companion to **`cbam-2620-benchmarks-raw.csv`** / **`cbam-2620-benchmarks-raw.md`**, which captured the §5.3 *table* only. This file captures the *prose* that governs how a value is selected from that table.

## Provenance

| Field | Value |
|---|---|
| **Instrument** | Commission Implementing Regulation (EU) 2025/2620 of 16 December 2025 |
| **Subject** | Rules for the calculation of the free allocation adjustment to the number of CBAM certificates to be surrendered |
| **Publication** | Official Journal of the European Union, L series, 22.12.2025 |
| **CELEX** | 32025R2620 |
| **ELI** | `http://data.europa.eu/eli/reg_impl/2025/2620/oj` |
| **Retrieval method** | EUR-Lex HTML endpoint, `legal-content/EN/TXT/HTML/?uri=CELEX:32025R2620` — HTTP 200, **957 634 bytes**. No Cellar fallback required. |
| **Extraction date** | 2026-07-18 |
| **Extraction method** | HTML → text (tags stripped, block boundaries preserved, entities unescaped, whitespace collapsed). No normalisation of wording, spelling, spacing or punctuation. |

> **Byte-count delta.** `cbam-2620-benchmarks-raw.md` records 958 151 bytes for the same endpoint; this retrieval returned **957 634** — a 517-byte difference. EUR-Lex injects per-request markup (session tokens, timestamps), so a small delta is expected and is not in itself evidence of a substantive change. **It has not been verified that the §5.1–§5.3 text is byte-identical to the earlier retrieval.** If that matters, diff against a re-fetch.

## Scope — what was and was not captured

**Captured verbatim:**

- Annex point **1 (Definitions)** — full text, all four definitions.
- Annex point **2** — full text.
- Annex point **3.1** — full text (needed: it is where `BM*_g` is bound to Column A).
- Annex point **3.3(2)(a)–(d)** — the precursor benchmark-selection factor list only.
- Annex point **4** — full text (needed: it is where `BM_g` is bound to Column B, and it carries the selection-factor list).
- Annex points **5.1** and **5.2**, including **5.2.1, 5.2.2, 5.2.3 and 5.2.4** — full text.
- Annex point **5.3** preamble (indicator legend) and column headers.
- Footnote **(1)** to §5.1.
- Recital **(15)** (partial) — route-specificity rationale, quoted in Ambiguities only.

**NOT captured:**

- **Equations 1–6 themselves.** The OJ renders these as images; the text extraction yields only the placeholders `(Equation 1)` … `(Equation 6)`. **No equation is reproduced here.** Any equation logic must be read off the source images, not this file.
- Annex points **3.2** and **3.3(1)** — outside the request; §3.3(2) captured because it carries a selection-factor list.
- The **§5.3 value table** — already captured in `cbam-2620-benchmarks-raw.csv`; not duplicated.
- The **operative Articles** (1–3) preceding the Annex, and recitals other than the (15) fragment.
- **IR (EU) 2025/2621** and **IR (EU) 2025/2547** — both are referenced by §5.1 / §4 / §3.3 and **neither is extracted here**. See Ambiguity 2 and 3.

**Sub-point count correction.** The request anticipated §5.2.1–§5.2.3. The source has **four** sub-points: 5.2.1 Cement, 5.2.2 Fertilisers, 5.2.3 Iron and steel, **5.2.4 Aluminium**. All four are below.

---

## Annex structure (points 1–5)

Headings verbatim, in source order:

```
1.      DEFINITIONS
2.      CALCULATION OF THE FREE ALLOCATION ADJUSTMENT
3.      CALCULATION OF SPECIFIC EMBEDDED FREE ALLOCATION (SEFA) OF A GOOD USING ACTUAL DATA
3.1.    Production process
3.2.    SEFA of a simple good
3.3.    SEFA of a complex good
4.      CALCULATION OF SPECIFIC EMBEDDED FREE ALLOCATION (SEFA) OF A GOOD USING DEFAULT VALUES
5.      CBAM BENCHMARKS
5.1.    Rules for selecting the appropriate CBAM benchmark value when using default values
5.2.    Rules for selecting the appropriate CBAM benchmark value when using actual data
5.2.1.  Cement
5.2.2.  Fertilisers
5.2.3.  Iron and steel
5.2.4.  Aluminium
5.3.    CBAM benchmark values
```

> **The §5.1 / §5.2 split is by data path, not by sector.** §5.1 governs the **default-values** path; §5.2 governs the **actual-data** path. This is load-bearing and is the single most important structural fact in this file.

---

## Verbatim text

### Point 1 — DEFINITIONS

> **1. DEFINITIONS**
>
> For the purpose of this Annex, the following definitions shall apply:
>
> (1) ‘aggregated goods categories’ means aggregated goods categories pursuant to Table 1 of point 2 of Annex I to Implementing Regulation (EU) 2025/2547;
>
> (2) ‘reporting period’ means the period corresponding to the calendar year during which the good or, where applicable, the precursor was produced and to be used as reference for the determination of embedded emissions;
>
> (3) ‘precursor’ means any input material into a production process included in the list of goods set out in Annex I to Regulation (EU) 2023/956;
>
> (4) ‘production route’ means a specific technology used in a production process to produce goods.

### Point 2 — CALCULATION OF THE FREE ALLOCATION ADJUSTMENT

> **2. CALCULATION OF THE FREE ALLOCATION ADJUSTMENT**
>
> For each good g other than electricity listed in the CBAM declaration pursuant to Article 6 of Regulation (EU) 2023/956, the free allocation adjustment pursuant to Article 31 of that Regulation shall be calculated using the following equation:
>
> (Equation 1)
>
> Where:
>
> FAA g — is the free allocation adjustment of good g ;
>
> SEFA g , y — is the specific embedded free allocation of good g in year y expressed as t CO 2 e / tonne of good g;
>
> M g — is the mass of good g imported during the year to which the CBAM declaration applies;
>
> y — is the reporting period identified in accordance with Article 7 of Implementing Regulation (EU) 2025/2547.

### Point 3.1 — Production process (binds `BM*_g` to Column A)

> **3. CALCULATION OF SPECIFIC EMBEDDED FREE ALLOCATION (SEFA) OF A GOOD USING ACTUAL DATA**
>
> **3.1. Production process**
>
> For a single production process, the process-level specific free allocation shall be calculated using the following equation:
>
> (Equation 2)
>
> Where:
>
> SFA Procg,y — is the process-level specific free allocation in year y calculated for the production process which yields good g , expressed as t CO 2 e / tonne of good g;
>
> y — is the reporting period related to the production of good g ;
>
> CBAM y — is the CBAM factor referred to in Article 10a(1a) of Directive 2003/87/EC for the year y (dimensionless);
>
> CSCF y — is the cross-sectoral correction factor for year y determined by the Commission pursuant to Article 14(6) of Delegated Regulation (EU) 2019/331 and published in accordance with Article 10a(5) of Directive 2003/87/EC (dimensionless);
>
> **BM g \* — is the process-related CBAM benchmark for the production process which yields good g , expressed as t CO 2 e / tonne of g produced, as set out in point 5, Column A, of this Annex.**

### Point 3.3(2) — precursor selection factors (Column B)

> (2) where the [value] for the precursor i is not provided by the producer , the default reporting period of the precursor is used in accordance with Article 13 of Implementing Regulation (EU) 2025/2547 and [it] is determined by selecting the appropriate BM g value from **point 5, Column B**, of this Annex, taking into account the following factors:
>
> (a) the country of origin of precursor i ;
>
> (b) the CN code for precursor i ;
>
> (c) if applicable, further parameters defining the precursor i , as specified in Annex to Implementing Regulation (EU) 2025/2547;
>
> (d) if applicable, the [default] production route specified for the country of origin of precursor i as specified in Annex to Implementing Regulation (EU) 2025/2547.

*(Square brackets in (d) are the OJ's own. Bracketed insertions in the lead-in — `[value]`, `[it]` — mark where the source text runs through an inline equation image that the extraction could not render; the surrounding words are verbatim.)*

### Point 4 — SEFA USING DEFAULT VALUES (binds `BM_g` to Column B)

> **4. CALCULATION OF SPECIFIC EMBEDDED FREE ALLOCATION (SEFA) OF A GOOD USING DEFAULT VALUES**
>
> Where default values are used, the SEFA is calculated using the following equation:
>
> (Equation 6)
>
> Where:
>
> CBAM y — is the CBAM factor referred to in Article 10a(1a) of Directive 2003/87/EC for the year y (dimensionless);
>
> CSCF y — is the cross-sectoral correction factor for the reporting period y determined by the Commission pursuant to Article 14(6) of Delegated Regulation (EU) 2019/331 and published in accordance with Article 10a(5) of Directive 2003/87/EC (dimensionless);
>
> **BM g — is the default CBAM benchmark set out in point 5, Column B, of this Annex;**
>
> y — is the reporting period as identified in accordance with Article 7 of Implementing Regulation (EU) 2025/2547.
>
> For the purpose of selecting the appropriate value for BM g the following parameters shall be taken into account:
>
> (a) the country of origin of good g ;
>
> (b) the CN code for good g ;
>
> (c) if applicable, further parameters defining the good g , as specified in Annex to Implementing Regulation (EU) 2025/2547;
>
> (d) if applicable, the [default] production route specified for the country of origin as specified in **Annex I to Implementing Regulation (EU) 2025/2547**.

### Point 5.1 — Selection when using DEFAULT VALUES

> **5. CBAM BENCHMARKS**
>
> **5.1. Rules for selecting the appropriate CBAM benchmark value when using default values**
>
> Where default values are used to determine SEFA of a final good or of a precursor, the same production route shall be used as indicated in **Annex I to Commission Implementing Regulation (EU) 2025/2621** ( 1 ) for the country of origin of that good or precursor.
>
> Where different alloy grades for steel are given in the table for the same CN code, the highest benchmark value given for the relevant production year is used.

**Footnote (1), verbatim:**

> ( 1 ) Commission Implementing Regulation (EU) 2025/2621 of 16 December 2025 laying down rules for the application of Regulation (EU) 2023/956 of the European Parliament and the Council as regards the establishment of default values (**not yet published in the Official Journal**).

### Point 5.2 — Selection when using ACTUAL DATA

> **5.2. Rules for selecting the appropriate CBAM benchmark value when using actual data**
>
> **5.2.1. Cement**
>
> ‘White cement clinker’ means cement clinker for use as main binding component in the formulation of materials such as joint filers, ceramic tile adhesives, insulation, and anchorage mortars, industrial floor mortars, ready mixed plaster, repair mortars, and water- tight coatings with maximum average contents of 0,4 mass-% Fe 2 O 3 , 0,003 mass-% Cr 2 O 3 and 0,03 mass-% Mn 2 O 3 .
>
> ‘Grey cement clinker’ means other cement clinker than white cement clinker.
>
> In the case of other hydraulic cements (CN 2523 90 00 ) containing a mixture of white clinker and of grey clinker and/or calcined clay, the CBAM benchmark shall be calculated as a weighted average that reflects the composition.
>
> **5.2.2. Fertilisers**
>
> No specific rules apply.
>
> **5.2.3. Iron and steel**
>
> ‘Carbon steel’ means steel other than stainless steel, high alloy or low alloy steel.
>
> ‘Stainless steel’ means alloy steels containing, by weight, 1,2 % or less of carbon and 10,5 % or more of chromium, with or without other elements.
>
> ‘High alloy steel’ means steel containing 8 % [or more metallic alloying elements or where high surface quality and processability is required].
>
> ‘Low alloy steel’ means alloy steel other than high-alloy steel.
>
> **5.2.4. Aluminium**
>
> No specific rules apply.

*(`joint filers`, `water- tight`, `high-alloy` vs `high alloy`, and the `CO 2` / `Fe 2 O 3` subscript spacing are all as published. Not normalised.)*

### Point 5.3 — preamble (indicator legend)

> **5.3. CBAM benchmark values**
>
> Where more than one benchmark value is given for a specific CN code, the meaning of the indicators is as follows:
>
> (1) Value is to be used for production years 2026-27
> (2) Value is to be used for production years 2028-30
> (A) grey clinker / cement
> (B) white clinker / cement
> (C) Carbon Steel based on BF/BOF
> (D) Carbon Steel based on DRI/EAF
> (E) Carbon Steel based on Scrap/EAF
> (F) Low alloy Steel based on BF/BOF
> (G) Low alloy Steel based on DRI/EAF
> (H) Low alloy Steel based on scrap/EAF
> (J) High alloy Steel (based on EAF)
> (K) primary Aluminium
> (L) secondary Aluminium

Table column headers, verbatim: `CN code` · `CN Description` · `Column A` `BMg* [tCO 2 e/t]` · `Column B` `BMg [tCO 2 e/t]`.

---

## Answers to the five questions, from the text

### 1. The highest-value rule — trigger conditions

**Full sentence, and it is a single free-standing sentence:**

> Where different alloy grades for steel are given in the table for the same CN code, the highest benchmark value given for the relevant production year is used.

**Surrounding context:** it is the **second and final paragraph of §5.1** — the *default-values* branch. It is immediately preceded by the 2621 route provision and is followed directly by the §5.2 heading.

**What the text establishes:**

- The stated trigger is **"different alloy grades for steel … for the same CN code."** Nothing more.
- It is **not** conditioned on the production route being unknown. No such wording appears.
- It **does not appear in §5.2**. §5.2.3 contains grade definitions only and states no tie-break rule.

**What the text does NOT establish — see Ambiguity 1:** whether the rule reaches the actual-data path, and how it interacts with the route provision that precedes it.

### 2. Selection precedence

**Not addressed in §5.1 or §5.2.** Neither point contains a precedence ordering.

The selection factors are in **§4** (for a good, default path) and **§3.3(2)** (for a precursor, default path), both lists being (a) country of origin, (b) CN code, (c) further parameters, (d) `[default]` production route.

The source's own framing is **"the following parameters shall be taken into account"** — *taken into account*, not *applied in the following order*. The lettering (a)–(d) is enumeration; the text does not state it is precedence.

**Reporting year is not in the (a)–(d) list at all.** It enters separately: `y` is defined in §4 as "the reporting period as identified in accordance with Article 7 of Implementing Regulation (EU) 2025/2547", and the year dimension surfaces in the table via the §5.3 `(1)`/`(2)` indicators. **Steel grade is likewise not in the (a)–(d) list** — it enters only via §5.1's highest-value sentence and the §5.2.3 definitions.

So: of the four dimensions asked about, **CN code and production route are in the operative factor list; reporting year and steel grade are not.** No ordering is given for any of them.

### 3. Column A vs Column B — is the selection language in §5.1/§5.2?

**No. Neither §5.1 nor §5.2 names Column A or Column B anywhere.**

The binding is in the calculation points, and it is explicit:

- **§3.1:** "BM g \* … as set out in point 5, **Column A**, of this Annex." (actual data, Equation 2)
- **§4:** "BM g is the default CBAM benchmark set out in point 5, **Column B**, of this Annex." (default values, Equation 6)
- **§3.3(2):** precursor default → "point 5, **Column B**".

**This confirms the seeded interpretation.** `cbam_benchmarks.bm_column` splits A = `BM*_g` = actual path = Eq 2 = §3.1, B = `BM_g` = default path = Eq 6 = §4. That mapping now rests on operative text, not on commentary. §5.1/§5.2's headings ("when using default values" / "when using actual data") corroborate it by aligning the same two paths, but they do so **without naming the columns** — the column binding comes from §3.1 and §4 alone.

### 4. The 2621 Annex I route reference

**Full provision, verbatim:**

> Where default values are used to determine SEFA of a final good or of a precursor, the same production route shall be used as indicated in Annex I to Commission Implementing Regulation (EU) 2025/2621 ( 1 ) for the country of origin of that good or precursor.

**Column B only.** The provision opens "Where default values are used", sits in §5.1 (the default branch), and §5.2 contains no counterpart. On the actual-data path, no route-selection provision exists anywhere in §5.

**Country-determined, not customer-declared.** The route is "indicated in Annex I … **for the country of origin**", and §4(d)/§3.3(2)(d) call it "the **[default]** production route **specified for the country of origin**". No provision allows a declarant to assert a route on the default path. (Note this is the *default* path only — whether an operator's actual route governs on the actual-data path is not stated in §5; see Ambiguity 1.)

**But the instrument cited is internally inconsistent — see Ambiguity 2.**

### 5. Steel grade definitions

Reproduced in full under §5.2.3 above. **Four** definitions, not three: Carbon steel, **Stainless steel**, High alloy steel, Low alloy steel. See Ambiguities 4–6 for what they leave open.

---

## Ambiguities — flagged, unresolved

None of these is resolved here, and none should be resolved silently in lookup code.

### 1. The highest-value rule sits only in the default branch — reach and interaction both unclear

Two distinct open questions:

**(a) Does it reach the actual-data path?** The sentence is in §5.1. §5.2 has no equivalent. Read strictly by placement, a Column A lookup that hits multiple grades for one CN code has **no stated tie-break**. Whether that is deliberate (actual data implies the operator knows their grade) or a drafting gap is not stated. Note the parallel: §5.2.1 *does* give Column A a composition rule for mixed-clinker cement, which shows the drafters did supply actual-path selection rules where they wanted them — but that is an inference about intent, not text.

**(b) How does it interact with the route provision two lines above it?** The §5.3 indicators encode **route and grade jointly**, not separately: `(C)` is Carbon+BF/BOF, `(F)` is Low alloy+BF/BOF, `(J)` is High alloy+EAF. So fixing the route via 2621 to, say, BF/BOF still leaves `(C)` and `(F)` both live, and does not reach `(J)` at all. The natural reading is that the route provision resolves the route axis and the highest-value rule then resolves the residual grade axis — **but the text never says this**, and it never says what happens when the 2621 route excludes a grade that is nonetheless tabulated for that CN code. A lookup that applies "highest value across all indicators" and one that applies "highest value within the 2621 route" will return different numbers on rows like `7205 21 00` Column B. **Both are defensible on the text as written.**

### 2. The route table is cited as two different instruments

The source cites **two different regulations** for the production-route table:

| Location | Citation |
|---|---|
| §5.1 | "**Annex I** to Commission Implementing Regulation (EU) **2025/2621**" |
| §4(d) | "**Annex I** to Implementing Regulation (EU) **2025/2547**" |
| §3.3(2)(d) | "**Annex** to Implementing Regulation (EU) **2025/2547**" |

All three purport to identify the `[default]` production route for the country of origin. 2547 and 2621 are different instruments (2547 of 10 December 2025; 2621 of 16 December 2025, on default values). §3.3(2)(d) additionally drops the "I" from "Annex I".

**This is unresolved in the source and cannot be resolved from 2620 alone.** A lookup implementation must not pick one silently. Resolving it requires reading both instruments' annexes to see which actually contains a country→route table.

### 3. 2621 was unpublished at the time of publication

Footnote (1) states 2025/2621 was "**not yet published in the Official Journal**" when 2620 was published. §5.1 makes a Column B lookup depend on an annex that had no OJ text at that date. Whether 2621 has since been published, and whether its Annex I matches what §5.1 assumes, is **not verified here** — 2621 was not fetched.

### 4. ‘High alloy steel’ is unresolved drafting, and it drives indicator (J)

> ‘High alloy steel’ means steel containing 8 % [or more metallic alloying elements or where high surface quality and processability is required].

The square brackets are the OJ's own, not an extraction artefact. "8 %" carries no stated basis (by weight? of what?), and the bracketed alternative limb — "or where high surface quality and processability is required" — is a **qualitative, non-measurable** criterion sitting in the same definition as a numeric threshold. Because `(J)` is the high-alloy indicator, this bracketed text sits directly on a value-selection decision, and `(J)` values are frequently the highest on a row — so under the §5.1 highest-value rule it can be the selected value.

### 5. ‘Stainless steel’ is defined but has no indicator

§5.2.3 defines stainless steel, and ‘Carbon steel’ is defined **by exclusion from it**. But the §5.3 legend has **no stainless indicator** — `(C)`–`(H)`, `(J)` cover only carbon, low alloy and high alloy. What benchmark applies to a good that is stainless by the §5.2.3 definition is **not stated**. (Whether stainless is intended to fall inside "high alloy" is not said; the two definitions are independent and could overlap.)

### 6. ‘Alloy steel’ is used but never defined — the definitions are partly circular

- ‘Carbon steel’ = "steel other than stainless steel, high alloy or low alloy steel" — defined by exclusion from the other three.
- ‘Low alloy steel’ = "**alloy steel** other than high-alloy steel" — depends on ‘alloy steel’.
- ‘**Alloy steel**’ is **not defined anywhere in the Annex.**

So low alloy depends on an undefined term, and carbon depends on low alloy. The chain does not close on the text of 2620.

### 7. Reporting year vs "production year" — two different terms

§5.3 indicators say "Value is to be used for **production years** 2026-27 / 2028-30". §5.1's tie-break says "the highest benchmark value given for the relevant **production year**". But §1(2) defines ‘**reporting period**’ (calendar year the good was produced), and §4 defines `y` as "the **reporting period**". "Production year" is **not** a defined term in the Annex. Whether "production year" and "reporting period" are the same thing is not stated — they plausibly are, but the drafters used the defined term in one place and an undefined one in another.

### 8. "Taken into account" is not an ordering

Flagged again because it is easy to over-read: §4 and §3.3(2) say the parameters "shall be **taken into account**". Neither states a precedence, a tie-break, or what to do when the factors underdetermine a single row (which they do whenever route and grade both remain open). Enumerating (a)–(d) is not the same as ranking them.

### 9. Recital (15) explains route-specificity but is not operative

For context only — recitals do not bind:

> EU ETS benchmarks are not fully aligned with CN codes or the aggregated goods categories defined in Implementing Regulation (EU) 2025/2547. In particular, some EU ETS benchmarks depend on certain production routes. For ensuring that under the CBAM the respective goods are treated equally as under the EU ETS, production-route specific values were determined for primary and secondary aluminium as well as for crude steel based on blast furnace, direct reduced iron (DRI) and electric arc furnace (EAF) routes.

Note it describes route-specific values for "**crude steel**", while the §5.3 table carries route indicators on a far wider range of steel CN codes than crude steel. The recital does not explain that extension.

---

## Consequences for `cbam_benchmarks` (stated, not applied)

No schema or seed change is made by this file. Recording what the prose confirms and what it leaves open:

- **Confirmed.** The `bm_column` A/B split matches §3.1 (Column A, actual, Eq 2) and §4 (Column B, default, Eq 6). The seeded interpretation holds against operative text.
- **Confirmed.** `period_band` 1 / 2 = production years 2026-27 / 2028-30, per the §5.3 legend verbatim.
- **Confirmed.** Route is country-determined on the default path, not declarant-asserted — so a Column B lookup needs a country→route input, which the current table does not carry and 2620 does not supply.
- **Open.** The highest-value tie-break cannot be implemented unambiguously until Ambiguity 1(b) is resolved — "highest across the CN code" and "highest within the 2621 route" are both readable and give different answers.
- **Open.** Which instrument holds the route table (Ambiguity 2) blocks the country→route join entirely.
- **Open.** No tie-break exists for Column A (Ambiguity 1(a)).
- **Unaffected.** The `7224 10 00` heading gap noted in `cbam-2620-benchmarks-raw.md` is a CN-code resolution issue and is untouched by §5.1/§5.2.
