# IR 2025/2547 — Annex I §3 system boundaries (verbatim extract)

**Source:** Commission Implementing Regulation (EU) 2025/2547 of 10 December 2025,
laying down rules for the application of Regulation (EU) 2023/956 as regards the
methods for the calculation of emissions embedded in goods.

- OJ L, 2025/2547, 22.12.2025
- ELI: http://data.europa.eu/eli/reg_impl/2025/2547/oj
- Authentic OJ PDF, EN, 86 pages. In force.

**Purpose of this file.** ThemisIQ's boundary guidance must be transcribed §-by-§
from primary text with the § cited inline, never from memory or inference
(spec §11.15). This file is that primary text, held locally so it can be diffed
and verified rather than re-fetched. It is a verbatim extract, not a paraphrase.

**Scope of this extract.** §3.1 (cross-sectoral) plus §3.11–§3.18, covering the
two live sectors — iron & steel and aluminium. Deliberately omitted, because
those sectors are not built: §3.2–§3.5 (calcined clay, cement clinker, cement,
aluminous cement), §3.6 (hydrogen), §3.7–§3.10 (ammonia, nitric acid, urea,
mixed fertilisers), §3.19 (electricity). Retrieve them from the ELI above if
those sectors are ever added — do not reconstruct them from this file.

**Extraction note.** Transcribed from the authentic OJ PDF, pp. 18–26. Em-dashed
bullet lists in the original are rendered here as `—` bullets. Emphasis and
capitalisation follow the original.

---

## Article-level anchors (Chapter 2, p. 6)

These bind Annex I §3 and are quoted because the guidance copy needs to be able
to say *why* the boundary is what it is.

**Article 1(3) — definition.** 'system boundary' means the group of chemical or
physical processes included in the calculation of embedded emissions of goods
under the same aggregated goods category.

**Article 3(1).** In order to quantify and calculate specific embedded emissions
of goods, the processes within an installation that occur within the system
boundaries, defined per aggregated goods category in accordance with Annex I,
shall be taken into account.

**Article 3(2).** The system boundaries shall cover direct emissions, indirect
emissions for goods not listed in Annex II to Regulation (EU) 2023/956, and the
embedded emissions of any precursor.

**Recital (4).** In order to quantify and calculate the embedded emissions of
goods, system boundaries should be laid down. The system boundaries should be
aligned with those covered under the EU ETS.

> This recital is the answer to spec §11.15's open verification question:
> 2547 does implement the Reg. (EU) 2025/2083 Art. 7(7)(a) ETS-alignment
> requirement, and Annex I §3 is where the aligned boundaries live.

---

## 3.1. Cross-sectoral rules (p. 18)

Specific embedded emissions shall be calculated as the emissions of the
production process and, for complex goods, the embedded emissions of the
precursors to produce the functional unit of the good during the reporting
period.

The system boundaries are defined per aggregated goods categories and cover the
direct emissions, the indirect emissions from electricity consumption where
relevant under Regulation (EU) 2023/956, emitted by all processes directly or
indirectly linked to the production processes, and the embedded emissions of
precursors, independently of whether these precursors are produced in the
installation or acquired from a different installation. In addition to these
general rules, the specific details of each aggregated goods category are set
out in points 3.2 to 3.19. Any CBAM goods produced by means of a production
route not listed in points 3.2 to 3.19 is subject to the cross-sectoral rules
described in this point, and to the sector-specific rules if the production
route is a combination of the production routes listed in points 3.2 to 3.19.

**The purchase and maintenance of infrastructure and equipment are excluded from
the system boundaries.**

When the production process of complex goods listed in Annex II to Regulation
(EU) 2023/956 includes one or more precursors not listed in that Annex, the
indirect emissions of those precursors will be included in the calculation of
the embedded emissions of the complex goods. When the production process of
complex goods not listed in that Annex includes one or more precursors listed in
that Annex, the indirect emissions of these precursors will not be included in
the calculation of the embedded emissions of the complex goods.

> Three separately actionable rules here:
> 1. A catch-all: an unlisted production route falls back to the cross-sectoral
>    rules, and to sector-specific rules where the route is a *combination* of
>    listed routes.
> 2. Infrastructure and equipment purchase/maintenance is excluded. This is the
>    plausible over-inclusion the recon flagged.
> 3. An asymmetric indirect-emissions rule at the Annex II boundary, in both
>    directions. Note this is about *indirect* emissions of precursors, not the
>    process boundary itself.

---

## 3.11. Sintered Ore (p. 22)

### 3.11.1. Special provisions

This aggregated goods category includes all kinds of iron ore pellet production
(for sale of pellets as well as for direct use in the same installation) and
sinter production. To the extent covered by CN code 2601 12 00, also iron ores
used as precursors for ferro-chromium (FeCr), ferro-manganese (FeMn) or
ferro-nickel (FeNi) may be covered.

### 3.11.2. System boundary

For sintered ore, direct emissions monitoring shall encompass:

— all processes emitting CO2 from process materials such as limestone and other
carbonates or carbonate ores;
— all processes emitting CO2 from all fuels including coke, waste gases such as
coke oven gas, blast furnace gas or converter gas; directly or indirectly linked
to the production process, and materials used for flue gas cleaning.

---

## 3.12. FeMn (Ferro-Manganese), FeCr (Ferro-Chromium) and FeNi (Ferro-Nickel) (p. 22)

### 3.12.1. Special provisions

This process covers only the production of the alloys identified under CN codes
7202 1, 7202 4 and 7202 6. Other iron materials with significant alloy content
such as spiegeleisen are not covered. NPI (nickel pig iron) is included if the
nickel content is greater than 10 %.

Where waste gases or other flue gases are emitted without abatement, CO
contained in the waste gas shall be considered as the molar equivalent of CO2
emissions.

### 3.12.2. System boundary

For FeMn, FeCr and FeNi, direct emissions monitoring shall encompass:

— all processes directly or indirectly linked to the production processes
emitting CO2 emissions caused by fuel inputs, irrespective of whether they are
used for energetic or non-energetic use;
— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from process inputs such as limestone and from flue gas
cleaning;
— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from the consumption of electrodes or electrode pastes;
— carbon remaining in the product or in slags or wastes is taken into account by
using a mass balance method in accordance with point B.3.2 of Annex II.

> §3.12 gives ONE boundary for all three categories, which is why our collapsed
> `ferroalloy` category is defensible for boundary purposes. Annex I Table 1
> nonetheless defines FeMn, FeCr and FeNi as three SEPARATE aggregated goods
> categories, and Annex IV requires different sector-specific parameters for
> each (mass % of Mn / Cr / Ni, each with carbon). See the watch item.
>
> Note also the 10 % nickel threshold splits NPI between this category (>10 %)
> and Pig Iron (<10 %) — see §3.13.1.

---

## 3.13. Pig Iron (p. 23)

### 3.13.1. Special provisions

This aggregated goods category includes non-alloyed pig iron from blast furnaces
as well as alloy-containing pig irons (e.g., spiegeleisen), irrespective of the
physical form (e.g. ingots, granules). NPI (nickel pig iron) is included if the
nickel content is lower than 10 %. In integrated steel plants, liquid pig iron
('hot metal') directly charged to the oxygen converter is the product which
separates the production process for pig iron from the production process of
crude steel. Where the installation does not sell or transfer pig iron to other
installations, a joint production process including crude steel can be
established making subject to the rules of Article 4.

### 3.13.2. System boundary

#### 3.13.2.1. Blast furnace route

For that production route, direct emissions monitoring shall encompass:

— all processes directly or indirectly linked to the production processes
emitting CO2 from fuels and reducing agents such as coke, coke dust, coal, fuel
oils, plastic wastes, natural gas, wood wastes, charcoal, as well as from waste
gases such as coke oven gas, blast furnace gas or converter gas;
— where biomass is used, the provisions of point B.3.3 of Annex II shall be
taken into account;
— all processes directly or indirectly linked to the production processes
emitting CO2 from process materials such as limestone, magnesite, and other
carbonates, carbonate ores; materials for flue gas cleaning;
— carbon remaining in the product or in slags or wastes is taken into account by
using a mass balance method in accordance with point B.3.2 of Annex II.

#### 3.13.2.2. Smelting reduction

For this production route, direct emissions monitoring shall encompass:

— all processes directly or indirectly linked to the production processes
emitting CO2 from fuels and reducing agents such as coke, coke dust, coal, fuel
oils, plastic wastes, natural gas, wood wastes, charcoal, waste gases from the
process or converter gas;
— where biomass is used, the provisions of point B.3.3 of Annex II shall be
taken into account;
— all processes directly or indirectly linked to the production processes
emitting CO2 from process materials such as limestone, magnesite, and other
carbonates, carbonate ores; materials for flue gas cleaning;
— carbon remaining in the product or in slags or wastes is taken into account by
using a mass balance method in accordance with point B.3.2 of Annex II.

> The hot-metal sentence is a boundary-separation rule: liquid pig iron charged
> to the converter is the product that SEPARATES pig iron from crude steel.
> Two named routes here — blast furnace and smelting reduction.

---

## 3.14. DRI (Direct Reduced Iron) (pp. 23–24)

### 3.14.1. Special provisions

There is only one production route defined, although different technologies may
use different qualities of ores, which may require pelletisation or sintering,
and different reducing agents (natural gas, diverse fossil fuels or biomass,
hydrogen). Therefore, precursors sintered ore or hydrogen may be relevant. As
products, iron sponge, hot briquetted iron (HBI) or other forms of direct
reduced iron may be relevant, including DRI which is immediately fed to electric
arc furnaces or other downstream processes.

Where the installation does not sell or transfer DRI to other installations, a
joint production process including steel can be established making subject to
the rules of Article 4.

### 3.14.2. System boundary

For that production route, direct emissions monitoring shall encompass:

— all processes directly or indirectly linked to the production processes
emitting CO2 from fuels and reducing agents such as coal, natural gas, fuel
oils, waste gases from the process or converter gas, etc.;
— where biogas or other forms of biomass are used, the provisions of point B.3.3
of Annex II shall be taken into account;
— all processes directly or indirectly linked to the production processes
emitting CO2 from process materials such as limestone, magnesite, and other
carbonates, carbonate ores, materials for flue gas cleaning;
— carbon remaining in the product or in slags or wastes is taken into account by
using a mass balance method in accordance with point B.3.2 of **Annex III**.

> The final bullet cites Annex III where §3.13.2 and §3.12.2 cite Annex II for
> the same mass-balance rule (point B.3.2). B.3.2 is the mass balance method and
> it is in Annex II; Annex III point B is the complex-goods SEE calculation.
> This looks like an error in the published text. §3.15.2.1 and §3.15.2.2 make
> the same Annex III citation. Do NOT silently normalise it — record it and cite
> what the OJ actually says.

---

## 3.15. Crude steel (p. 24)

### 3.15.1. Special provisions

The system boundary shall cover all necessary activities and units for obtaining
crude steel:

— if the process starts from hot metal (liquid pig iron), the system boundary
shall include the basic oxygen converter, vacuum degassing, secondary
metallurgy, argon oxygen decarburisation / vacuum oxygen decarburisation,
continuous casting or ingot casting, where relevant hot-rolling or forging, and
all necessary auxiliary activities such as transfers, re-heating, and flue gas
cleaning;
— if the process uses an electric arc furnace, the system boundary shall include
all relevant activities and units such as the electric arc furnace itself,
secondary metallurgy, vacuum degassing, argon oxygen decarburisation / vacuum
oxygen decarburisation, continuous casting or ingot casting, where relevant
hot-rolling or forging, and all necessary auxiliary activities such as
transfers, heating of raw materials and equipment, re-heating, and flue gas
cleaning;
— **only primary hot-rolling and rough shaping by forging to obtain the
semi-finished products under CN codes 7207, 7218 and 7224 are included in this
aggregated goods category. All other rolling and forging processes are included
in the aggregated goods category 'iron or steel products'.**

### 3.15.2. System boundary

#### 3.15.2.1. Basic oxygen steelmaking

For that production route, direct emissions monitoring shall encompass:

— all processes directly or indirectly linked to the production processes
emitting CO2 from fuels such as coal, natural gas, fuel oils, waste gases such
as blast furnace gas, coke oven gas or converter gas;
— all processes directly or indirectly linked to the production processes
emitting CO2 from process materials such as limestone, magnesite, and other
carbonates, carbonate ores; materials for flue gas cleaning;
— carbon entering the process in scrap, alloys, graphite etc. and carbon
remaining in the product or in slags or wastes is taken into account by using a
mass balance method in accordance with point B.3.2 of Annex III.

#### 3.15.2.2. Electric arc furnace

For that production route, direct emissions monitoring shall take into account:

— all processes directly or indirectly linked to the production processes
emitting CO2 from fuels such as coal, natural gas, fuel oils, as well as from
waste gases such as blast furnace gas, coke oven gas or converter gas;
— all processes directly or indirectly linked to the production processes
emitting CO2 from the consumption of electrodes and electrode pastes;
— all processes directly or indirectly linked to the production processes
emitting CO2 from process materials such as limestone, magnesite, and other
carbonates, carbonate ores; materials for flue gas cleaning;
— carbon entering the process, e.g. in the form of scrap, alloys and graphite,
and carbon remaining in the product or in slags or wastes is taken into account
by using a mass balance method in accordance with point B.3.2 of Annex III.

> This is the §3.15.1 fork the spec's §11.15 identified. The rolling ACTIVITY
> splits by OUTPUT CN code: primary hot-rolling and rough forging are inside the
> crude-steel boundary when they yield 7207, 7218 or 7224, and inside the
> products boundary otherwise. `cbam_cn_map` encodes the CN-code side of this
> correctly; nothing encodes the activity side.
>
> Note the regulation names two routes — basic oxygen steelmaking and electric
> arc furnace — where our seed has three (`bof`, `eaf_dri`, `eaf_scrap`). The
> EAF split is ours, driven by the IR 2025/2620 benchmark distinction between
> DRI-based and scrap-based EAF, not by §3.15. Worth stating in the guidance so
> a user is not confused by the mismatch.

---

## 3.16. Iron or steel products (p. 25)

### 3.16.1. Special provisions

None.

### 3.16.2. System boundary

For iron or steel products, direct emissions monitoring shall take into account:

— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from combustion of fuels and process emissions from flue
gas treatment, including **re-heating, re-melting, casting, hot rolling, cold
rolling, forging, annealing, coating, galvanizing, wire drawing, pickling** and
excluding the following processes: **plating, cutting, welding and finishing** of
iron or steel products.

> A single sentence carrying both an 11-item include-list and a 4-item
> exclude-list. This is the most directly usable guidance text in all of §3.

---

## 3.17. Unwrought aluminium (p. 25)

### 3.17.1. Special provisions

This aggregated goods category includes non-alloyed as well as alloyed
aluminium, in physical form typical for unwrought metals, such as ingots, slabs,
billets or granules. In integrated aluminium plants, liquid aluminium directly
charged to the production of aluminium products is included, too.

### 3.17.2. System boundary

#### 3.17.2.1. Primary (electrolytic) smelting

For that production route, direct emissions monitoring shall take into account:

— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from the consumption of electrodes or electrode pastes;
— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from any fuels used (e.g. for drying and pre-heating of
raw materials, heating of electrolysis cells, heating required for casting);
— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from any flue gas treatment, from soda ash or limestone
if relevant;
— perfluorocarbon emissions caused by anode effects monitored in accordance
with point B.7 of Annex II.

#### 3.17.2.2. Secondary melting (recycling)

Secondary melting (recycling) of aluminium uses aluminium scrap as main input.
**However, where unwrought aluminium from other sources is added, it is treated
like a precursor.**

For that production route, direct emissions monitoring shall take into account:

— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from any fuels used for drying and pre-heating of raw
materials, used in melting furnaces, in pre-treatment of scrap such as
de-coating and de-oiling, and combustion of the related residues, and fuels
required for casting of ingots, billets or slabs;
— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from any fuels used in associated activities such as
treatment of skimmings and slag recovery;
— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from any flue gas treatment, from soda ash or limestone
if relevant.

> The 'treated like a precursor' rule needs a `cbam_precursor_inputs` row.
> Precursor intake is unbuilt, so an aluminium re-melter has no way to record it
> today — spec §11.15 track C.
>
> Note the scrap input itself is NOT zero-rated by §3.17.2.2; the section is
> silent on scrap carbon. Zero-rating of scrap comes from Annex II point F
> (off-spec products, by-products, waste and scrap are assigned zero embedded
> emissions when entering another production process), not from the boundary.
> Our `cbam_production_routes.boundary_note` for `secondary_remelt` currently
> says "scrap zero-rated, re-melt direct energy only" — accurate in effect, but
> it attributes the zero-rating to the wrong provision.

---

## 3.18. Aluminium products (p. 26)

### 3.18.1. Special provisions

None.

### 3.18.2. System boundary

For aluminium products, direct emissions monitoring shall take into account:

— all processes directly or indirectly linked to the production processes
emitting CO2 emissions from combustion of fuels and process emissions from flue
gas treatment, excluding the following processes: **cutting, welding and
finishing** of aluminium products.

> The asymmetry the recon predicted is confirmed. Steel products (§3.16.2)
> exclude FOUR processes — plating, cutting, welding, finishing. Aluminium
> products exclude THREE — cutting, welding, finishing. **Plating is excluded
> for steel and NOT excluded for aluminium.** And §3.18.2 carries no
> include-list at all, where §3.16.2 names eleven processes.
>
> This is the single highest-value fact in the extract: the steel and aluminium
> answers genuinely differ, and a user who reasons by analogy from one to the
> other will get plating wrong.

---

## Annex IV §2 — sector-specific parameters for the live categories (pp. 84–85)

Not boundary text, but recorded here because the recon found our
`cbam_process_parameters` table is missing carbon mass % and is not
category-aware. Verbatim, for the live-sector categories only:

| Aggregated goods category | Reporting requirement |
| --- | --- |
| Sintered Ore | N.a. |
| Pig Iron | The main reducing agent used. Mass % of Mn, Cr, Ni, total of other alloy elements. |
| FeMn Ferro-Manganese | Mass % of Mn and carbon. |
| FeCr – Ferro-Chromium | Mass % of Cr and carbon. |
| FeNi – Ferro-Nickel | Mass % of and carbon. |
| DRI (Direct Reduced Iron) | The main reducing agent used. Mass % of Mn, Cr, Ni, total of other alloy elements. |
| Crude steel | The main reducing agent of the precursor, if known. Mass % of Mn, Cr, Ni, total of other alloy elements. Tonnes scrap used for producing 1 t crude steel. % of scrap that is pre-consumer scrap. |
| Iron or steel products | The main reducing agent used in precursor production, if known. Mass % of Mn, Cr, Ni, total of other alloy elements. Tonnes scrap used for producing 1 t of the product. % of scrap that is pre-consumer scrap. |
| Unwrought aluminium | Tonnes scrap used for producing 1 t of the product. % of scrap that is pre-consumer scrap. If the total content of elements other than aluminium exceeds 1 %, the total percentage of such elements. |
| Aluminium products | Tonnes scrap used for producing 1 t of the product. % of scrap that is pre-consumer scrap. If the total content of elements other than aluminium exceeds 1 %, the total percentage of such elements. |

> Two things to carry forward:
>
> 1. **"Mass % of and carbon"** under FeNi is reproduced verbatim. The published
>    text appears to be missing "Ni" — compare the FeMn and FeCr rows. Treat as
>    an apparent drafting error in the OJ; do not silently repair it in a
>    citation.
> 2. The three ferroalloy categories each require **carbon** mass %, which we do
>    not store at all, and each requires a DIFFERENT alloy element. A collapsed
>    `ferroalloy` category cannot express "Mn and carbon" vs "Cr and carbon" vs
>    "Ni and carbon". This is where the taxonomy divergence becomes a real
>    constraint — not in benchmark or default-value lookup, both of which are
>    CN-keyed.
