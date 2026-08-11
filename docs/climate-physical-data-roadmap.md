# Physical hazard data — source, granularity and roadmap

**Decisions recorded 11 August 2026. No code changes follow yet.**

This file records what was decided about the data behind physical-risk scoring, and what
was left open. It is a decision record, not a specification: nothing here has been built,
and the numbers described in "The problem" are what the paid product is running on today.

---

## The problem

`mr_region_hazards` holds **65 rows**. Every one carries provenance `starter`, and every
`source_ref` reads *"pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct
baseline"*. That sentence has been true for long enough to be worth stating plainly: the
transcription has not happened, and the Climate Risk module is a paid product running on
values that say so about themselves.

**Coverage is 65 of a possible 160** — 20 regions × 8 hazards, 41%.

- No hazard covers more than **17 of 20** regions.
- `cold` covers **2**.

A missing cell is not silent — the 14 July fix made it render as *not assessed* rather than
vanish — so the gaps are disclosed. They are still gaps.

### The geography is coarser than the product implies

Regions are **IPCC AR6 WGI reference-region polygons**, not country borders. `WNA` spans
California to the Rockies plus south-western Canada and north-western Mexico. A hazard score
attributed to it is a statement about that whole area.

**25 of AR6's ~45 land regions are absent entirely**, including **all of South America**. A
target in Brazil, Argentina, Chile, Colombia or Peru cannot be screened at all.

---

## Decisions

### 1 · Source — World Bank Climate Change Knowledge Portal

**Licence: CC BY 4.0.** It explicitly permits commercial use with attribution. The one
binding condition beyond attribution is that the work **must not imply World Bank
endorsement** — so attribution copy names the source and says nothing more.

**What it is:** downscaled CMIP6 at **0.25°**, covering **1950–2100**, drawing on **~30
models** across **5 SSPs**, exposing **70+ precomputed indices** defined per ETCCDI.

**How it is obtained:** available on the **AWS Registry of Open Data** — no account, no
egress charge — and published both as global gridded data and pre-aggregated to national,
subnational, watershed and EEZ boundaries.

That last point is what makes the granularity decision below possible without building an
aggregation pipeline.

### 2 · Granularity — both

**Grid for site-level. Subnational for jurisdiction-level screening.** CCKP publishes both,
so this is a choice about which to read when, not about which to acquire.

### 3 · Index mapping — CCKP covers two of eight hazards cleanly

| Hazard | CCKP index | Status |
|---|---|---|
| **heat** | `hi35` — heat index days above 35 °C | **DIRECT** |
| **drought** | `cdd` — maximum consecutive dry days | **DIRECT** |
| **flood** | `rx1day` / `r50mm` | **PROXY** — pluvial only. River flood needs catchment, topography and defences |
| **water** | — | **GAP** — supply against demand is not a climate index. Candidate: WRI Aqueduct |
| **coastal** | — | **GAP** — needs elevation and defences |
| **wildfire** | — | **GAP** — candidate: Copernicus Fire Weather Index |
| **cyclone** | — | **GAP** |
| **permafrost** | — | **GAP** |

**Two direct, one proxy, five gaps.** A single-source transcription is not available for this
taxonomy, and choosing CCKP does not change that — it closes two hazards properly and puts a
labelled proxy under a third.

> **This table is the CCKP-only assessment and is now partly superseded.** `water` and `flood`
> moved after the Aqueduct work below. The current position for all eight hazards is the status
> table at the end of *Water and flood — WRI Aqueduct 4.0*. This table is kept as the record of
> what CCKP alone could close.

### 4 · Provenance must be per-hazard, not per-table

This follows directly from the table above, and it is the decision with the widest reach.

After transcription, `heat` and `drought` would be `primary_source` against a named CCKP
index; `flood` would be `primary_source` against a **proxy** index and must say so; the five
gap hazards would remain `starter` or become `expert_judgment`. A single provenance statement
covering `mr_region_hazards` as a whole could not be true of all eight.

**Consequence for the report.** `summariseProvenance` already counts per row and publishes
distinct `source_ref` values under *Data provenance*, so the mechanism exists. What changes is
that the mix within one table becomes meaningful, and a reader comparing two assessments will
see different provenance profiles depending on which hazards their sector is sensitive to.

---

## Water and flood — WRI Aqueduct 4.0

This follows from the gap list above: `water` was recorded there as *"supply against demand is
not a climate index — candidate: WRI Aqueduct"*. The candidate has now been examined, and what
follows is what the download actually contains rather than what the product page describes.

### The file

**`Aqueduct40_rankings_download_Y2023M07D05.xlsx`** — four sheets:

`country_baseline` · `country_future` · `province_baseline` · `province_future`

WRI aggregates from **HydroBASINS Level 6** to **GADM v3.6 level 0 and level 1**, weighted by
**gross water demand rather than area**. That weighting matters: a province's score reflects
where water is actually used within it, not its geometric centre.

**Licence: CC BY 4.0**, commercial use permitted with attribution — the same terms as CCKP.

**Citation:** Kuzma, S., et al. 2023. *"Aqueduct 4.0: Updated decision-relevant global water
risk indicators."* Technical Note. WRI. <https://doi.org/10.46830/writn.23.00061>

### Indicator coverage — uneven

Confirmed against the **data dictionary**, not inferred from our own export.

| Sheet | Indicators |
|---|---|
| `province_baseline` | `bws` water stress (**Aqueduct 4.0**) · `rfr` riverine flood risk (**3.0**) · `drr` drought risk (**3.0**) |
| `province_future` | **`bws` only** — 161,730 rows |

**Two of the three are from the superseded 3.0 and carry no projections.** Only water stress
has been rebuilt for 4.0 and only water stress has futures.

**The source note must therefore state the Aqueduct version per hazard.** A single "Aqueduct
4.0" attribution across water, flood and drought would be wrong for two of the three — and this
is the same argument as *Provenance must be per-hazard, not per-table*, arriving from a second
direction.

**There is no coastal flood indicator in the rankings product.** Coastal exists only as
**Aqueduct Floods inundation-depth GeoTIFF rasters**, one per return period (`rp0002` through
`rp1000`). Using them needs spatial aggregation *and* a methodology decision about what a depth
map means for a province — a 1-in-100-year depth at one point is not a province-level score.
**Coastal is not sourced. It remains a named gap.**

### Scenarios — the middle does not align

Aqueduct names its pathways:

| Aqueduct | Pathway |
|---|---|
| `opt` | SSP1 RCP 2.6 |
| `bau` | SSP3 RCP 7.0 |
| `pes` | SSP5 RCP 8.5 |

**The ends align with the ThemisIQ trio. The middle does not.** Ours is SSP2-4.5; theirs is
SSP3-7.0 — a hotter and more fragmented world, not the same central case.

Three options, recorded:

1. **Substitute SSP3-7.0 for the middle on water stress only, and disclose it.**
2. **Interpolate** between `opt` and `bau` — which invents a number Aqueduct did not publish.
3. **Run water stress on two scenarios** rather than three.

**Recommendation is (1). Decision open.**

**Horizons are 30-year windows, not years.** `2030` = 2015–2045 · `2050` = 2035–2065 ·
`2080` = 2065–2095. A report must not imply otherwise — a figure labelled "2050" is a
three-decade average centred on it.

### Scale — Aqueduct is 0–4, ours is 0–3

Aqueduct bands water stress as:

| Band | Withdrawal as share of supply |
|---|---|
| Low | < 10% |
| Low–Medium | 10–20% |
| Medium–High | 20–40% |
| High | 40–80% |
| Extremely High | > 80% |

**DECISION: keep the 0–3 ordinal and carry Aqueduct's band label in `source_note`**, so a
report can print *"water stress 3 (Aqueduct: Extremely High, >80%)"*.

Two reasons. Collapsing four intervals into three loses the distinction **at the top of the
scale**, which is precisely where a diligence reader needs it — *High* and *Extremely High* are
not the same finding. And adopting a 0–4 scale would mean re-scoring 65 region rows and 41
sensitivity cells against a new top band, which this option avoids entirely.

Note this also settles part of an open question below: Aqueduct's band edges are **absolute
percentage thresholds**, not percentiles of a global distribution.

### Weights — six variants of every score

Every score is published six ways: `tot` total gross withdrawal · `dom` domestic · `ind`
industrial · `irr` irrigation · `liv` livestock · and one unweighted.

**WRI weights the GEOGRAPHY by sector water demand. `mr_industry_hazards` weights the HAZARD by
sector dependence.** These are adjacent and easy to conflate, and they are not the same
operation: one asks *which parts of this province drive its water score*, the other asks *how
much does this sector care about water at all*.

**Whether to map ThemisIQ sectors onto `ind` / `irr` / `dom` is open.** Doing so would make the
geography sector-specific, which is a larger change than swapping a data source.

### WRI's three stated cautions

These must travel into the methodology rather than being dropped at the border.

1. **The indicators cannot be measured directly and have not been validated.**
2. **Interbasin transfers are not modelled** — water moved between basins by infrastructure is
   invisible to the model, so a basin supplied from elsewhere reads as more stressed than it is.
3. **Future demand holds livestock constant from 2014**, and bases irrigation on **crop extent
   projections ending 2050** — so the 2080 horizon extrapolates beyond its own demand inputs.

### Hazard sourcing status after this work

| Hazard | Source | Status |
|---|---|---|
| **heat** | CCKP `hi35` | **sourced** |
| **drought** | CCKP `cdd` + Aqueduct `drr` (3.0, baseline only) | **sourced** |
| **water** | Aqueduct `bws` (4.0, full futures) | **sourced** |
| **flood** | Aqueduct `rfr` (3.0, baseline only) | **partial** |
| **coastal** | — | **GAP** — raster only |
| **wildfire** | — | **GAP** — candidate: Copernicus Fire Weather Index |
| **cyclone** | — | **GAP** — candidate: CLIMADA (ETH Zurich, open source) |
| **permafrost** | — | **GAP** — candidate: ESA Permafrost CCI |

**Three sourced, one partial, four gaps** — against two sourced, one proxy and five gaps before
this work.

---

## Deals module — progressive refinement

Physical screening in Deals sharpens as the buyer learns more about the target. Two levels,
and **the report must distinguish them**.

**Screen level.** Jurisdiction only, as today. Physical risk read at **subnational** scale
and labelled as such.

**Site level.** The buyer adds sites with coordinates as they learn them. The assessment
sharpens, and the report **names which sites drove which hazard**.

> A "high heat" derived from a country average and a "high heat" derived from thirty pinned
> sites are different claims. The report must not present them identically.

### Multiple sites — maximum scores, distribution reports

**The MAXIMUM drives the score.** Never understate in diligence.

**The DISTRIBUTION drives the reporting.** *"4 of 30 sites high, concentrated in Andalusia"*
is actionable where *"high"* is not.

These are two outputs from one calculation, not a choice between them.

### Two different notions of place

**Deals collects `location_count` as a bare integer and knows nothing about where.** It drives
GHG tier pricing and consultant-range scaling; it carries no geography.

**Climate Risk has a full Location model** — AR6 region selection, multi-select, with an asset
profile modifying hazard exposure.

**These would need reconciling.** They are not the same field at different resolutions; they
are two different questions that happen to share a word.

---

## What remains open

1. **Site input mechanism** — whether a map picker or coordinate entry.
2. **Sources for the four remaining gap hazards** — coastal, wildfire, cyclone, permafrost.
   Candidates named but not decided: Copernicus Fire Weather Index (wildfire), CLIMADA
   (cyclone), ESA Permafrost CCI (permafrost). Coastal has no candidate short of aggregating
   the Aqueduct Floods rasters and deciding what a depth map means for a province.
   *Water closed under Aqueduct 4.0; flood partially closed.*
3. **Which Aqueduct scenario stands in for the ThemisIQ middle case** — SSP3-7.0 substituted
   and disclosed (recommended), interpolated, or water stress run on two scenarios only.
4. **Whether ThemisIQ sectors map onto Aqueduct's `ind` / `irr` / `dom` weightings**, making
   the geography sector-specific.
5. **Calibration of the 0–3 ordinal from a continuous index.** *Partly settled for water
   stress:* Aqueduct's band edges are absolute percentage thresholds, and the decision above
   keeps the 0–3 scale with the Aqueduct label carried in `source_note`. Still open for the
   CCKP-sourced hazards, and still open in general as to whether band edges should be
   **absolute** or **relative to the global distribution** — an absolute threshold and a
   percentile threshold answer different questions and will disagree most in the regions where
   the data is thinnest.
6. **Whether subnational units replace AR6 regions or sit alongside them.**

---

## Out of scope — the sensitivity table

**`mr_industry_hazards` is unaffected by everything above.** It stays expert judgement.

It is the **intersection** — how a hazard reaches a sector — that no vendor supplies, and that
CCKP by construction cannot: CCKP describes climate, not what a sector does with it. The
rubric in methodology §4.1a governs it, and the disclosure is the control rather than the
sourcing.

**63 of 104 cells are still empty.** That is a separate piece of work with a separate method,
and no amount of hazard data closes it.
