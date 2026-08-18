# Survey question context — 37 default strings

**What these are.** One to two sentences per sub-topic, shown beneath the
question, explaining what the topic means **in terms of this company's
effect on it**. Written for a respondent who has never read ESRS — a
warehouse manager, a finance analyst, a supplier's compliance contact.

⚠️ **These are ThemisIQ prose, not transcribed law.** They sit in the same
table as the verbatim Appendix A labels and must never be mistaken for
them. Same distinction as `short_name` and `question_framing`: house copy
beside legal text. Say so in the migration header.

**Voice — deliberate.** Each one points at *the company*, not at the
concept. "Whether the company's operations affect populations of plants
and animals nearby" rather than "the state of biodiversity". The second is
a definition; the first is a question someone can answer about their
employer. The Bay State questionnaire worked this way and it is why 26
people completed it.

**Customisable.** These are defaults. A bakery and a data centre mean
different things by "energy", and the question editor will let customers
rewrite any of them. Shipping a default means the editor starts from
something rather than a blank box.

---

## E1 Climate Change

**E1.1 Climate change mitigation**
Whether the company is reducing the greenhouse gases its operations
release. This covers energy use, transport, refrigerants and emissions
from suppliers.

> ✎ 18 Aug 2026 — "and how quickly" removed. The four-point priority scale
> has no way to express a rate, so a respondent who cannot judge pace
> answers "not enough visibility to assess" on a topic they could have
> answered about state. §6.1 then reads that abstention as the company
> having no visibility of its own impact. Ask about state, not pace —
> the same rule as the no-management-practice note below, reached by a
> different route.

**E1.2 Climate change adaptation**
Whether the company is prepared for the physical effects of a changing
climate — flooding, heat, drought, storms — at its sites and across the
places it depends on.

**E1.3 Energy**
How much energy the company uses, where it comes from, and whether it is
shifting toward lower-carbon sources.

---

## E2 Pollution

**E2.1 Pollution of air**
Whether the company's operations release substances into the air that
affect health or the environment locally — exhaust, dust, fumes, odour.

**E2.2 Pollution of water**
Whether the company's discharges affect the quality of rivers,
groundwater or the sea, including runoff and wastewater from its sites.

**E2.3 Pollution of soil**
Whether the company's activities contaminate land, through spills,
leaks, waste handling or the substances it applies to the ground.

**E2.4 Substances of concern**
Whether the company uses or handles chemicals known to be harmful to
people or the environment, and whether safer alternatives exist.

**E2.5 Microplastics**
Whether the company's products, packaging or processes release tiny
plastic particles that end up in the environment.

---

## E3 Water

**E3.1 Water use**
How much water the company takes, uses and discharges, and whether that
puts pressure on supplies in areas where water is already scarce.

---

## E4 Biodiversity and Ecosystems

**E4.1 Drivers of biodiversity change**
Whether the company's activities change habitats — clearing land,
altering waterways, introducing species that do not belong there.

**E4.2 State of species**
Whether the company's operations affect populations of plants and animals
nearby, including anything rare or protected.

**E4.3 Extent and condition of ecosystems**
Whether the natural areas around the company's sites and supply chain are
in better or worse condition because of what it does there.

**E4.4 Ecosystem services**
Whether the company depends on things nature provides for free — pollination,
clean water, stable soil, flood protection — and whether it is protecting or
eroding them.

---

## E5 Circular Economy and Resource Use

**E5.1 Resource inflows**
What materials the company brings in, whether they are recycled or
renewable, and whether it uses more than it needs.

**E5.2 Resource outflows**
Whether products are made to last, to be repaired and to be recycled at
the end of their life, rather than thrown away.

**E5.3 Waste**
How much waste the company produces, what happens to it, and whether the
amount is falling.

---

## S1 Own Workforce

⚠️ S1 and S2 carry the SAME context strings. The framing field
("in your own workforce" / "in your organisation's workforce") is what
tells the respondent whose workforce is meant. Duplicating the context
keeps the pair genuinely comparable — a difference in wording between them
would show up in the aggregate as a difference in answers.

**S1.1 / S2.1 Working conditions and social protection**
Whether people are paid enough to live on, work reasonable hours, have
secure contracts, and are covered if they fall ill or lose their job.

**S1.2 / S2.2 Social dialogue and collective bargaining**
Whether workers can organise, be represented, and have a real say in
decisions that affect them.

**S1.3 / S2.3 Health and safety**
Whether people are kept safe at work — injuries, near misses, exposure to
harmful substances, and whether concerns get acted on.

**S1.4 / S2.4 Training and skills development**
Whether people get the training they need to do their jobs well and to
progress.

**S1.5 / S2.5 Diversity and equal treatment**
Whether people are treated fairly regardless of who they are — in pay,
promotion, hiring — and whether harassment and discrimination are dealt
with.

**S1.6 Other labour rights**
Whether basic rights are respected across the workforce: no child or
forced labour, privacy respected, and decent living conditions where the
company provides them.

**S2.6 Other labour rights**
Whether basic rights are respected across the workforce: no child or
forced labour, privacy respected, and decent living conditions —
including water and sanitation — where the company provides them.

> ⚠️ **The one pair that differs, and only on this.** The annex's own
> footnote confines water and sanitation to S2, which the verbatim labels
> already reflect. S1.6 must never gain it.
>
> ✎ 18 Aug 2026 — S2.6 was previously specified here in prose ("its
> context string should say so") without the text, so the string was
> authored in the migration and flagged as unsigned-off. Final wording
> above. The em-dashes are deliberate: between them, "where the company
> provides them" governs housing, water and sanitation together. Appended
> at the end it governed only housing, leaving water and sanitation asked
> unconditionally of a respondent who provides none of the three.

---

## S3 Affected Communities

**S3.1 Communities' economic, social and cultural rights**
Whether the company's operations affect the people who live nearby — their
land, their housing, their access to water, their way of life.

**S3.2 Communities' civil and political rights**
Whether people can speak up about the company's activities without fear,
including anyone campaigning against them.

**S3.3 Rights of indigenous peoples**
Whether the company operates on or near indigenous lands, and whether
those communities were properly consulted and consented.

---

## S4 Consumers and End-users

**S4.1 Information-related impacts**
Whether customers get honest, clear information about products, and
whether their personal data is handled properly.

**S4.2 Personal safety**
Whether products are safe to use, and whether particular care is taken
where children or vulnerable people use them.

**S4.3 Social inclusion**
Whether products and services are accessible and affordable to the people
who need them, and whether marketing is responsible.

---

## G1 Business Conduct

**G1.1 Corporate culture**
Whether the company does business honestly — no bribery or corruption,
people can raise concerns safely, and animals are treated properly where
relevant.

**G1.2 Political influence**
Whether the company's lobbying and political activity is transparent and
proportionate.

**G1.3 Management of supplier relationships**
Whether suppliers are treated fairly — paid on time, given reasonable
terms, not squeezed in ways that push problems down the chain.

---

## Notes on wording choices

**"Whether the company…" throughout.** Every string starts by pointing at
the company, so the respondent is answering about their employer or their
customer rather than rating a concept.

**Plain words over standard vocabulary.** "Paid enough to live on" rather
than "adequate wages". "No child or forced labour" rather than "labour-
related human rights". The verbatim ESRS label is still on the row, in
`label`; this field is the translation.

**No jargon left in.** "Ecosystem services" is the one that needed the
most work — it means nothing to most people, so the string names the
examples instead of defining the term.

**Length.** All are one or two sentences. Longer and people stop reading
them, which is worse than not having them.

**S2.6 is the only S1/S2 pair that differs**, because the annex confines
water and sanitation to S2. Everything else is identical by design.
