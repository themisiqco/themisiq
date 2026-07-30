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

---

## Annex II and Annex III — outbound points cited by Annex I §3 (verbatim)

Annex I §3 does not stand alone. For the two live sectors its boundary text cites
four points of Annex II and, by way of an apparent drafting error, one point of
Annex III. Those points are reproduced here so that every citation carried by a
boundary rule resolves to primary text held in this repository rather than to a
paraphrase or to memory.

Scope of this section: 2547 Annex II points B.3.2, B.3.3, B.7 and F; 2547
Annex III point B. Not included: Annex II points A, C, D, E and G, and Annex III
points A and C, which are not cited by the live-sector boundary provisions.

**Instrument disambiguation.** Annex I §3 uses the bare phrase "Annex II" for two
different instruments. Where it says "Annex II to Regulation (EU) 2023/956" it
means the CBAM Regulation's direct-emissions-only list (the basis of our
`annex_ii_direct_only` flag). Where it says "Annex II" unqualified — as at
§3.12.2, §3.13.2, §3.14.2, §3.17.2.1 — it means IR 2025/2547's own Annex II,
reproduced below. Any citation recorded in code or guidance must name the
instrument, not just the point.

**Transcription note.** Prose is verbatim. Equations are rendered with `=` where
the OJ PDF text layer emits `¼`, and with flattened subscripts (`AD_k` for the
typeset subscript form). Decimal commas are preserved as published. No wording
has been altered, normalised or repaired.

### Annex II, point B.3.2 — Mass balance method (p. 36)

> B.3.2. Mass balance method
>
> The CO2 quantities relevant for each source stream shall be calculated based on
> the carbon content in each material, without distinguishing fuels and process
> materials. Carbon leaving the installation in products instead of being emitted
> is taken into account by output source streams, which have therefore negative
> activity data.
>
> The emissions corresponding to each source stream shall be calculated as
> follows:
>
> Em_k = f × AD_k × CC_k (Equation 12)
>
> Where:
>
> AD_k is the activity data [t] of material k; for outputs, AD_k is negative;
>
> f is the ratio of the molar masses of CO2 and C: f = 3,664 t CO2/t C; and
>
> CC_k is the carbon content of material k (dimensionless and positive).
>
> If the carbon content of a fuel k is calculated from an emission factor
> expressed in t CO2/TJ, the following equation shall be used:
>
> CC_k = EF_k × NCV_k / f (Equation 13)
>
> If the carbon content of a material or fuel k is calculated from an emission
> factor expressed in t CO2/t, the following equation shall be used:
>
> CC_k = EF_k / f (Equation 14)
>
> For mixed fuels, the zero-rated biomass fraction may be taken into account,
> provided that the criteria provided in point B.3.3 are met as follows:
>
> CC_k = CC_pre,k × (1 – BF_k) (Equation 15)
>
> Where:
>
> CC_pre,k is the preliminary carbon content of fuel k (i.e. emission factor
> assuming the total fuel is fossil) and
>
> BF_k is the zero rated biomass fraction of fuel k (dimensionless).
>
> For fossil fuels or materials and where the biomass fraction is not known, BF
> shall be set to the conservative value zero. Where biomass is used as input
> material or fuel, and output materials contain carbon, the overall mass balance
> shall treat the biomass fraction conservatively, meaning that the total mass of
> carbon corresponding to the zero-rated carbon fractions of the carbon contained
> in all relevant output materials is not lower than the total mass of zero-rated
> fractions of the carbon contained in input materials and fuels, except if the
> operator provides evidence of a lower biomass fraction in the output materials
> by a 'trace the atom' (stoichiometric) method or by carbon-14 analyses.

Cited by §3.12.2 (FeMn/FeCr/FeNi), §3.13.2.1 (blast furnace) and §3.13.2.2
(smelting reduction), each correctly as "point B.3.2 of Annex II". Cited by
§3.14.2, §3.15.2.1 and §3.15.2.2 as "point B.3.2 of **Annex III**" — see the
note under Annex III point B below.

### Annex II, point B.3.3 — Criteria for zero-rating of biomass emissions (pp. 36–37)

> B.3.3. Criteria for zero-rating of biomass emissions
>
> 1. Where biomass is used as a fuel for combustion, it shall fulfil the criteria
> of this point. Where the biomass used for combustion does not comply with these
> criteria, its carbon content shall be considered as fossil carbon.
>
> 2. The biomass shall comply with the sustainability and the greenhouse gas
> emissions saving criteria laid down in Article 29(2) to (7) and (10) of
> Directive (EU) 2018/2001.
>
> 3. By way of derogation from point 2, biomass contained in or produced from
> waste and residues, other than agricultural, aquaculture, fisheries and forestry
> residues shall fulfil only the criteria laid down in Article 29(10) of Directive
> (EU) 2018/2001. This point shall also apply to waste and residues that are first
> processed into a product before being further processed into fuels.
>
> 4. Electricity, heating and cooling produced from municipal solid waste shall
> not be subject to the criteria laid down in Article 29(10) of Directive
> (EU) 2018/2001.
>
> 5. The criteria laid down Article 29(2) to (7) and (10) of Directive
> (EU) 2018/2001 shall apply irrespective of the geographical origin of the
> biomass.
>
> 6. The compliance with the criteria laid down in paragraphs Article 29(2) to (7)
> and (10) of Directive (EU) 2018/2001 shall be assessed in accordance with
> Article 30 and Article 31(1) of that Directive. The criteria may be considered
> complied with if the operator provides evidence of the purchase of a quantity of
> biofuel, bioliquid or biogas connected to the cancellation of the respective
> quantity in the Union Database set up pursuant to Article 31a or a proof of
> sustainability by a recognised voluntary scheme.

Cited by §3.13.2.1, §3.13.2.2 and §3.14.2, each as "point B.3.3 of Annex II".
The zero-rating is conditional and evidence-bearing: absent the Article 29
evidence, biomass carbon is fossil carbon. A boundary rule that presents biomass
as zero-rated without the condition would misstate the regulation.

### Annex II, point B.7 — Requirements for determining perfluorocarbon emissions (pp. 45–48)

> B.7. Requirements for determining perfluorocarbon emissions
>
> Monitoring shall cover emissions of perfluorocarbons (PFCs) resulting from anode
> effects including fugitive emissions of perfluorocarbons. Emissions not related
> to anode effects shall be determined based on estimation methods in accordance
> with industry best practice, in particular guidelines provided by the
> International Aluminium Institute.
>
> PFC emissions shall be calculated from the emissions measurable in a duct or
> stack ('point source emissions') as well as fugitive emissions using the
> collection efficiency of the duct:
>
> PFC emissions (total) = PFC emissions (duct) / collection efficiency (Equation 20)
>
> The collection efficiency shall be measured when the installation-specific
> emission factors are determined.
>
> The emissions of CF4 and C2F6 emitted through a duct or stack shall be
> calculated by using one of the following methods:
>
> — method A where the anode effect minutes per cell-day are recorded;
>
> — method B where the anode effect overvoltage is recorded.

#### B.7.1 — Calculation Method A, Slope Method

> The following equations for determining PFC emissions shall be used:
>
> CF4 emissions [t] = AEM × (SEF_CF4 / 1 000) × PrAl (Equation 21)
>
> C2F6 emissions [t] = CF4 emissions × F_C2F6 (Equation 22)
>
> Where:
>
> AEM is the anode effect minutes/cell-day;
>
> SEF_CF4 is the slope emission factor expressed in (kg CF4/t Al produced)/(anode
> effect minutes/cell-day)]. Where different cell-types are used, different SEF
> may be applied as appropriate;
>
> PrAl is the production of primary aluminium [t] during the reporting period; and
>
> F_C2F6 is the weight fraction of C2F6 [t C2F6/t CF4].
>
> The anode effect minutes per cell-day expresses the frequency of anode effects
> (number anode effects/cell-day) multiplied by the average duration of anode
> effects (anode effect minutes/occurrence):
>
> AEM = frequency × average duration (Equation 23)
>
> Emission factor: The emission factor for CF4 (slope emission factor, SEF_CF4)
> expresses the amount [kg] of CF4 emitted per tonne of aluminium produced per
> anode effect minute per cell-day. The emission factor (weight fraction F_C2F6)
> of C2F6 expresses the amount [kg] of C2F6 emitted proportionate to the amount
> [kg] of CF4 emitted.
>
> Minimum requirement: Technology-specific emission factors from Table 2 of this
> point are used.
>
> Recommended improvement: Installation-specific emission factors for CF4 and
> C2F6 are established through continuous or intermittent field measurements. For
> the determination of those emission factors industry best practice shall be
> applied, in particular the most recent guidelines provided by the International
> Aluminium Institute. The emission factor shall also take into account emissions
> related to non-anode effects. Each emission factor shall be determined with a
> maximum uncertainty of ± 15 %. The emission factors shall be determined at least
> every three years or earlier where necessary due to relevant changes at the
> installation. Relevant changes shall include a change in the distribution of
> anode effect duration, or a change in the control algorithm affecting the mix of
> the types of anode effects or the nature of the anode effect termination routine.

Table 2 — Technology-specific emission factors related to activity data for the
slope method:

| Technology | SEF_CF4 [(kg CF4/t Al)/(AE-Mins/cell-day)] | F_C2F6 [t C2F6/t CF4] |
|---|---|---|
| Legacy Point Feed Pre Bake (PFPB L) | 0,122 | 0,097 |
| Modern Point Feed Pre Bake (PFPB M) | 0,104 | 0,057 |
| Modern Point-Fed Prebake without fully automated anode effect intervention strategies for PFC emissions (PFPB MW) | — (1) | — (1) |
| Centre Worked Prebake (CWPB) | 0,143 | 0,121 |
| Side Worked Prebake (SWPB) | 0,233 | 0,280 |
| Vertical Stud Søderberg (VSS) | 0,058 | 0,086 |
| Horizontal Stud Søderberg (HSS) | 0,165 | 0,077 |

> (1) The installation operator has to determine the factor by own measurements.
> If this is technically not feasible or involves unreasonable costs, the values
> for CWPB methodology shall be used.

#### B.7.2 — Calculation Method B, Overvoltage Method

> For the overvoltage method, the following equations shall be used:
>
> CF4 emissions [t] = OVC × (AEO/CE) × PrAl × 0,001 (Equation 24)
>
> C2F6 emissions [t] = CF4 emissions × F_C2F6 (Equation 25)
>
> Where:
>
> OVC is the overvoltage coefficient ('emission factor') expressed in kg CF4 per
> tonne of aluminium produced per mV overvoltage;
>
> AEO is the anode effect overvoltage per cell [mV] determined as the integral of
> (time × voltage above the target voltage) divided by the time (duration) of data
> collection;
>
> CE is the average current efficiency of aluminium production [%];
>
> PrAl is the annual production of primary aluminium [t]; and
>
> F_C2F6 is the weight fraction of C2F6 [t C2F6/t CF4].
>
> the term AEO/CE (Anode effect overvoltage / current efficiency) expresses the
> time-integrated average anode effect overvoltage [mV overvoltage] per average
> current efficiency [%].
>
> Minimum requirement: Technology-specific emission factors from Table 3 of this
> Annex shall be used.
>
> Recommended improvement: Installation-specific emission factors are used for
> CF4 [(kg CF4/t Al)/(mV)] and C2F6 [t C2F6/t CF4] established through continuous
> or intermittent field measurements. For the determination of those emission
> factors industry best practice shall be applied, in particular the most recent
> guidelines provided by the International Aluminium Institute. The emission
> factors shall be determined with a maximum uncertainty of ± 15 % each. The
> emission factors shall be determined at least every three years or earlier where
> necessary due to relevant changes at the installation. Relevant changes shall
> include a change in the distribution of anode effect duration, or a change in
> the control algorithm affecting the mix of the types of anode effects or the
> nature of the anode effect termination routine

Table 3 — Technology-specific emission factors related to overvoltage activity
data:

| Technology | EF for CF4 [(kg CF4/t Al)/mV] | EF for C2F6 [t C2F6/t CF4] |
|---|---|---|
| Centre Worked Prebake (CWPB) | 1,16 | 0,121 |
| Side Worked Prebake (SWPB) | 3,65 | 0,252 |

#### B.7.3 — Determination of CO2e emissions

> CO2e emissions shall be calculated from CF4 and C2F6 emissions as follows, using
> the global warming potentials listed in point G of this Annex.
>
> PFC emissions [t CO2e] = CF4 emissions [t] × GWP_CF4 + C2F6 emissions [t] ×
> GWP_C2F6 (Equation 26)

GWPs from Annex II point G, Table 6: CF4 = 6 630 t CO2e/t CF4;
C2F6 = 11 100 t CO2e/t C2F6. (N2O = 265 t CO2e/t N2O, not applicable to the live
sectors.)

Cited by §3.17.2.1 (primary electrolytic smelting) as "point B.7 of Annex II",
in verbatim body text rather than commentary. Note that Table 3 covers only two
technologies where Table 2 covers seven, so the choice of method A or B is not
neutral for a Søderberg installation.

### Annex II, point F — Monitoring of activity levels (pp. 60–61)

> F. MONITORING OF ACTIVITY LEVELS
>
> The activity level of a production process shall be calculated as the total mass
> of the goods leaving the production process during the reporting period measured
> in functional units and in tonnes of goods. Where production processes are
> defined such that also the production of precursors is included, double counting
> shall be avoided by counting only the final products of the production process.
>
> Only goods which can be sold or directly used as precursor in another production
> process shall be taken into account. Off-spec products, by-products, waste, and
> scrap produced in a production process, irrespective of whether they are
> returned to production processes, delivered to other installations, or disposed
> of, shall not be included in the determination of the activity level. They shall
> therefore be assigned zero embedded emissions when entering another production
> process.
>
> For determining activity levels, the metering requirements laid down in point
> B.4 apply.

This is the source of scrap zero-rating, and it is not a boundary rule. Zero
embedded emissions follow *therefore* — as a consequence of scrap being excluded
from the activity level of the process that produced it, not as a freestanding
grant. Any guidance stating "scrap is zero-rated" without that mechanism
overstates its own basis, and would not survive a verifier asking where the rule
comes from.

Relevant to `secondary_remelt`, whose boundary text at §3.17.2.2 is silent on
scrap carbon.

### Annex III, point B — Calculation of specific embedded emissions of complex goods (pp. 71–73)

> B. CALCULATION OF SPECIFIC EMBEDDED EMISSIONS OF COMPLEX GOODS
>
> In accordance with Annex IV to Regulation (EU) 2023/956, the specific embedded
> emissions SEE_g of complex goods g shall be calculated as follows:
>
> SEE_g = (AttrEm_g + EEInpMat) / AL_g (Equation 59)
>
> EEInpMat = Σ(i=1..n) M_i × SEE_i (Equation 60)
>
> Where:
>
> SEE_g are the specific direct or indirect embedded emissions of (complex) goods
> g expressed in t CO2e per functional unit;
>
> AttrEm_g are the attributed direct or indirect emissions of the production
> process yielding goods g determined in accordance with point A.3 of this Annex
> for the reporting period, expressed in t CO2e;
>
> AL_g is the activity level of the production process yielding goods g for the
> reporting period determined in accordance with point F of Annex II, expressed in
> functional units;
>
> EEInpMat are the embedded direct or indirect emissions of all precursors
> consumed during the reporting period, expressed in t CO2e;
>
> M_i is the mass of precursor i used in the production process yielding g during
> the reporting period, expressed in functional units of precursor i, and
>
> SEE_i are the specific direct or indirect embedded emissions of precursor i
> expressed in t CO2e per functional unit of precursor i.
>
> In this calculation, only precursors not covered by the same production process
> as goods g are taken into account. Where the same precursor is obtained from
> different production processes, the precursor from each installation shall be
> treated separately.
>
> If a precursor i originates in the Union or in one of the countries or
> territories exempted pursuant to point 1 of Annex III to Regulation
> (EU) 2023/956 the specific direct or indirect embedded emissions of that
> precursor shall be counted as zero.
>
> Where a precursor i itself has precursors, those precursors are first taken into
> account using the same calculation method in order to calculate the embedded
> emissions of the precursor i before they are used for calculating the embedded
> emissions of goods g. This method is used recursively to all precursors which
> are complex goods.
>
> The parameter M_i refers to the total mass of precursor required to produce the
> amount AL_g. It also includes quantities of the precursor which do not end up in
> the complex goods but may be spilt, cut off, combusted, chemically modified,
> etc. in the production process and leave the process as by-products, scrap,
> residues, wastes, or emissions.
>
> In order to provide data which can be used independently of activity levels, the
> specific mass consumption m_i for each precursor i shall be determined and
> included in the communication pursuant to Annex IV:
>
> m_i = M_i / AL_g (Equation 61)
>
> Thereby the specific embedded emissions of complex goods g may be expressed as:
>
> SEE_g = ae_g + Σ(i=1..n)(m_i × SEE_i) (Equation 62)
>
> Where:
>
> ae_g are the specific attributed direct or indirect emissions of the production
> process yielding goods g, expressed in t CO2e per tonne of g, being equivalent
> to specific embedded emissions without precursors' embedded emissions:
>
> ae_g = AttrEm_g / AL_g (Equation 63)
>
> m_i is the specific mass consumption of precursor i used in the production
> process yielding one functional unit of goods g, expressed in functional unit of
> precursor i per functional unit of goods g (i.e. dimensionless); and
>
> SEE_i are the specific direct or indirect embedded emissions of precursor i
> expressed in t CO2e per functional unit of precursor i.

Equations 64, 65 and 66, covering clinker-content and nitrogen-content
functional units, are omitted: cement and fertilisers are unbuilt. Retrieve from
the ELI if those sectors are added.

Two points of contact with our implementation. First, Equation 60 is the SEFA
recursion — "used recursively to all precursors which are complex goods" is the
regulation's own statement of the rule our SEFA engine implements. Second, M_i
explicitly includes precursor mass that never reaches the finished good, which is
a live risk for any intake UI that asks operators for material *in the product*
rather than material *consumed by the process*.

#### Note: Annex III has no point B.3.2

Annex III is structured as three points only:

- A — Principles for attributing data to production processes (A.1, A.2 with
  A.2.1–A.2.3, A.3)
- B — Calculation of specific embedded emissions of complex goods (no numbered
  sub-points)
- C — Harmonised efficiency reference values for separate production of
  electricity and heat

There is no B.3, and therefore no B.3.2. The mass balance method exists only at
Annex II point B.3.2, reproduced above.

Three system-boundary provisions nonetheless cite it to Annex III:

- §3.14.2 (DRI)
- §3.15.2.1 (crude steel — basic oxygen steelmaking)
- §3.15.2.2 (crude steel — electric arc furnace)

while three parallel provisions cite the same rule correctly to Annex II
(§3.12.2, §3.13.2.1, §3.13.2.2). Recorded as published. Not repaired, and not
silently normalised in code: any guidance entry deriving from these three
sections must reproduce the citation as the OJ prints it and carry a note that
the operative text is at Annex II point B.3.2.
