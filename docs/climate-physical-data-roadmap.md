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

> **This table is the CCKP-only assessment and is now superseded in three places.** `water` and
> `flood` moved under Aqueduct; `wildfire` moved to the ETH Zurich FWI set; and **`drought` no
> longer uses `cdd` — it uses `spei12`**, for the reasons in *CCKP — heat and drought retrieved*.
> The current position for all eight hazards is the *Hazard sourcing status* table below. This
> table is kept as the record of what CCKP alone was expected to close.

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

## CCKP — heat and drought retrieved

**Retrieved 11 August 2026, via the CCKP API rather than the download wizard.** 20 populated
JSON files, ~2 MB total, held at `~/climate-data/cckp/` outside the repo.

### The API

Base: `https://cckpapi.worldbank.org/api/v1/`

The format string, **returned by the API itself in its error message**:

```
{collection}_{type}_{variable}_{product}_{aggregation}_{period}_
{percentile}_{scenario}_{model}_{model-calculation}_{grid}_
{statistic}/{geo}?_format=json
```

**11 parameters are required. Supplying 10 returns a parameter mismatch error** rather than
failing silently — which is the helpful behaviour, and is how the format string above was
obtained in the first place.

> Note for whoever automates this: the string above carries **12** placeholders before `/{geo}`,
> against the 11 the API reports as required. One is evidently optional or folded into another.
> Worth resolving before scripting rather than at the point of a failed call.

**The wizard UI produces a valid URL, but a global multi-variable query returns zero bytes.**
The query has to be split. **32 single-combination calls succeeded where one combined call did
not** — a silent empty response from a well-formed URL, which is exactly the failure mode that
costs an afternoon if it is not written down.

### What was taken

| Parameter | Value |
|---|---|
| collection | `cmip6-x0.25` |
| type | `climatology` |
| aggregation | `annual` |
| percentile | `median` — 50th of the multi-model ensemble |
| geo | `global_countries_subnationals` |
| variables | `hi35` (days with heat index above 35 °C) · `spei12` (annual SPEI drought index) |
| scenarios | `historical`, `ssp126`, `ssp245`, `ssp585` |
| periods | `1995-2014` baseline · `2040-2059` · `2060-2079` · `2080-2099` |

**The 12 empty responses are the data's structure, not failures.** `historical` carries only
the baseline period; the SSPs carry only future periods. Per variable that is 1 + (3 × 3) = 10
populated of 16 attempted; across two variables, **20 populated of 32** — which is the file
count above.

**Note the percentile choice.** CCKP ships the ensemble already reduced to a median, where the
ETH wildfire archive ships the models. That difference is the whole of the wildfire caveat
below.

### Drought — `spei12` replaces `cdd`

The index mapping in *Decisions §3* named `cdd`, maximum consecutive dry days. **That is
superseded.**

SPEI is the standard meteorological drought index and **accounts for evaporative demand as well
as precipitation**. Under warming a region can receive the same rainfall and still be in
drought because it is hotter — which `cdd` cannot see, since it counts only days without rain.

It is also **an index a verifier will recognise**, where "maximum consecutive dry days" needs
explaining every time it appears.

**CONSEQUENCE — SPEI needs its own banding rule.** It is **signed, roughly −3 to +3, negative
meaning drier**. That is a different shape from a day count: `hi35` and `fwixd` both band from
a count with a natural floor at zero and a monotone direction, whereas SPEI is centred, runs
both ways, and its useful range sits on the negative side. The 0–3 ordinal cannot be derived
from it by the same rule. **Recorded as open.**

### Two join problems

**1 · Identifiers do not join.** CCKP uses `AFG`, `AFG.111`. Aqueduct uses GADM `gid_1` in the
form `AFG.11_1`. The two do not join without a mapping — same underlying GADM geography, two
serialisations of it.

**2 · Period windows do not align across sources.**

| Source | Window |
|---|---|
| CCKP | **20 years** — `2040-2059` |
| Aqueduct | **30 years, centred differently** — its `2050` is 2035–2065 |
| ETH wildfire | **Annual** — would be averaged to whatever window we choose |

**Mapping all three onto `mr_horizons` is an open decision.** No window is shared by any two
sources, so any alignment involves either re-averaging what can be re-averaged (only the ETH
set) or accepting that a single reported horizon means three slightly different spans.

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

---

## Wildfire — ETH Zurich Fire Weather Index (CMIP6)

Recorded as **sourced**. This supersedes the earlier candidate — the roadmap previously named
the Copernicus Fire Weather Index, which was never examined.

### Source

Quilcaille, Y., Batibeniz, F., Ribeiro, A.F.S., Padrón, R.S., and Seneviratne, S.I.
*"Fire weather index data under historical and SSP projections in CMIP6 from 1850 to 2100."*
ETH Zurich Research Collection, 2022. <https://doi.org/10.3929/ethz-b-000583391>

**Licence: CC BY 4.0** — commercial use permitted with attribution. Same terms as CCKP and
Aqueduct. Published in *Earth System Science Data*.

### Variable taken — `fwixd`

**Number of days with extreme fire weather**, computed using daily **average** relative
humidity.

**The dataset also offers a daily-minimum-RH variant, which yields higher fire danger.**
Average is the more conservative choice, and that is **a methodology decision to disclose, not
a default** — a reader comparing our wildfire scores against another tool's may be comparing
against the minimum-RH variant.

**Two other variables were available and not taken:** length of the fire season, and seasonal
average FWI.

The reason is the same one that governs every hazard on this scale: **a day count bands to a
0–3 ordinal without inventing a rule**, in the same shape as CCKP's `hi35`. An index mean does
not — turning a seasonal average FWI into an ordinal would require a threshold rule we would
have authored ourselves, on a quantity with no natural break points.

### What the archive contains

**1,486 files, 1.2 GB**, named `fwixd_ann_<MODEL>_<scenario>_<variant>_g025.nc`

- **36 CMIP6 models**
- Up to **5 ensemble members** each (`r1i1p1f1` … `r5i1p1f1`)
- Scenarios: `historical`, `ssp126`, `ssp245`, `ssp370`, `ssp585`
- **Annual**, already aggregated from daily
- Regridded to **0.25°** — the same resolution as CCKP

**This covers the ThemisIQ trio exactly.** `ssp126`, `ssp245` and `ssp585` are all present, so
**no scenario substitution is needed** — unlike Aqueduct, whose middle case is SSP3-7.0 against
our SSP2-4.5.

**A 36-model ensemble is a stronger basis than Aqueduct's five-model median** — at the cost of
doing the ensemble reduction ourselves. Aqueduct ships a reduced figure; this ships the models.

### The limitation that must travel with it

**FWI measures fire WEATHER, not fire.**

It captures meteorological conditions favourable to ignition and spread in a **generalised fuel
type — mature pine stands** — and says nothing about fuel load, land cover or ignition sources.
**A region can have extreme fire weather and little to burn.**

**This belongs in the source note, not only in this document.** A wildfire score derived from
`fwixd` is a statement about conditions, and a reader who takes it as a statement about
expected fire has been misled by an omission we could have prevented at the cell.

---

## Reference archives — storage

**Held outside the repo.**

- CCKP: `~/climate-data/cckp/` — 20 JSON files, ~2 MB
- Aqueduct: `~/climate-data/aqueduct/`
- Wildfire: `~/climate-data/wildfire/` — 1,486 files, 1.2 GB

**Reference archives of this size must never enter git.** The wildfire set alone is 1.2 GB
across 1,486 files. The CCKP set is small enough to be tempting; it lives with the others
anyway, because a retrieval archive is a retrieval archive whatever it weighs. What belongs in the repo is the derived ordinal, its source note and its
provenance — not the source archive.

---

## Hazard sourcing status

The current position across all sources. This supersedes the CCKP-only table in *Decisions §3*.

**Two statuses, and the difference matters.** *Sourced* means the licence, the variable and the
version are settled. **Retrieved** means the data is in hand and in a form the transcription can
read. A hazard can be sourced and still be weeks of work away.

| Hazard | Source | Status |
|---|---|---|
| **heat** | CCKP `hi35` (median of ensemble) | **RETRIEVED** |
| **drought** | CCKP `spei12` (median of ensemble) + Aqueduct `drr` (3.0, baseline only) | **RETRIEVED** |
| **water** | Aqueduct `bws` (4.0, full futures) | **sourced** |
| **wildfire** | ETH Zurich `fwixd` (CMIP6, 36 models, full trio) | **sourced, not yet usable** |
| **flood** | Aqueduct `rfr` (3.0, baseline only) | **partial** |
| **coastal** | — | **GAP** — raster only |
| **cyclone** | — | **GAP** — candidate: CLIMADA (ETH Zurich, open source) |
| **permafrost** | — | **GAP** — candidate: ESA Permafrost CCI |

**Two retrieved, two sourced, one partial, three gaps** — against two sourced, one proxy and
five gaps at the start of this work.

**Wildfire is sourced but not retrieved in usable form.** The ETH archive is raw per-model
CMIP6 — 36 models, up to 5 members each — and needs the ensemble reduction doing before it can
be banded. CCKP has already done that reduction and ships the 50th percentile. That is the
single largest difference in effort between the sources, and it is invisible from the licence
or the variable name.

**Three licences, all CC BY 4.0**, all permitting commercial use with attribution: World Bank
CCKP, WRI Aqueduct, ETH Zurich. Attribution copy must name each and, for CCKP, must not imply
World Bank endorsement.

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
2. **Sources for the three remaining gap hazards** — coastal, cyclone, permafrost. Candidates
   named but not decided: CLIMADA (cyclone), ESA Permafrost CCI (permafrost). Coastal has no
   candidate short of aggregating the Aqueduct Floods rasters and deciding what a depth map
   means for a province. *Water closed under Aqueduct 4.0; flood partially closed; wildfire
   closed under the ETH Zurich FWI set.*
3. **Ensemble reduction for wildfire** — 36 models with up to 5 members each are shipped
   unreduced. Which statistic (median, mean, a percentile) and across which members is a
   methodology decision the other two sources made for us before delivery. CCKP's choice — the
   50th percentile of the multi-model ensemble — is the obvious precedent to match.
4. **A banding rule for SPEI.** It is signed and centred, roughly −3 to +3 with negative
   meaning drier, so the rule that bands a day count does not transfer. Open.
5. **Joining CCKP and Aqueduct identifiers** — `AFG.111` against GADM `gid_1` `AFG.11_1`. Same
   geography, two serialisations, no join without a mapping.
6. **Mapping three different period windows onto `mr_horizons`** — CCKP's 20-year spans,
   Aqueduct's 30-year spans centred differently, and the ETH set's annual values. Only the
   annual data can be re-averaged to fit; the other two are as published.
7. **Which Aqueduct scenario stands in for the ThemisIQ middle case** — SSP3-7.0 substituted
   and disclosed (recommended), interpolated, or water stress run on two scenarios only.
   *Note the ETH Zurich set ships `ssp370` as well, so a future decision to align the middle
   case across sources has data on both sides.*
8. **Whether ThemisIQ sectors map onto Aqueduct's `ind` / `irr` / `dom` weightings**, making
   the geography sector-specific.
9. **Calibration of the 0–3 ordinal from a continuous index.** *Partly settled for water
   stress:* Aqueduct's band edges are absolute percentage thresholds, and the decision above
   keeps the 0–3 scale with the Aqueduct label carried in `source_note`. Still open for the
   CCKP-sourced hazards, and still open in general as to whether band edges should be
   **absolute** or **relative to the global distribution** — an absolute threshold and a
   percentile threshold answer different questions and will disagree most in the regions where
   the data is thinnest.
10. **Whether subnational units replace AR6 regions or sit alongside them.**

---

## Out of scope — the sensitivity table

**`mr_industry_hazards` is unaffected by everything above.** It stays expert judgement.

It is the **intersection** — how a hazard reaches a sector — that no vendor supplies, and that
CCKP by construction cannot: CCKP describes climate, not what a sector does with it. The
rubric in methodology §4.1a governs it, and the disclosure is the control rather than the
sourcing.

**63 of 104 cells are still empty.** That is a separate piece of work with a separate method,
and no amount of hazard data closes it.
