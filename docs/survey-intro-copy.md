# Survey respondent page — intro copy, varied by track

Three variants. `survey_get` already resolves the respondent's
`stakeholder_category`, so the track is known server-side and needs no new
payload field beyond a `track` or `intro_variant` key.

⚠️ The shared blocks below are identical in all three. Only the opening
paragraph and the practical tips vary. Everything from "Not enough
visibility" downward is the same copy in every variant, because §6.1's rule
has to read identically to every respondent.

---

## Variant A — INTERNAL
`own_workforce`, `workers_rep_own`

**{Company} would like your view**

{Company} is conducting a sustainability materiality assessment — working
out which topics matter most to the business and to the people its work
affects. That covers a wide range: from energy and waste to working
conditions, health and safety, and how the company treats the communities
around it. Some of it can be established from data. The rest depends on what
people inside the organisation see day to day, which is why you have been
asked.

Your answers are not shown individually. They are combined with everyone
else's, so what {Company} sees is where the people who know it collectively
think the priorities are.

**Answer from where you sit.** There is nothing to look up. You are not
expected to have a view on every topic — a warehouse manager and someone in
finance will see different parts of this company, and that difference is
useful information rather than a problem.

---

## Variant B — VALUE CHAIN
`value_chain_worker`, `workers_rep_value_chain`, `supplier`

**{Company} would like your view**

{Company} is conducting a sustainability materiality assessment across its
own business and the companies it buys from. It is a customer of the
organisation you work for. The assessment covers working conditions, health
and safety, environmental impact and how suppliers are treated — and part of
doing it properly means asking its suppliers directly rather than assuming.

Your answers go to {Company}, not to your employer, and are combined with
everyone else's before anyone sees them. No individual answer is shown on
its own.

**There is no right answer, and nothing here is a test of your employer.**
Saying a topic needs attention is what this survey is for.

> ✎ 16 Aug 2026 — a tip was removed here: *"Answer about your own workplace.
> Where a question asks about working conditions, health and safety or
> similar, it means the conditions you and your colleagues work in — not
> {Company}'s own offices."* It addressed an individual worker describing
> their own conditions, and S2 respondents are named representatives
> answering for an organisation. The per-question framing badge now carries
> the same instruction institutionally — *"in your organisation's
> workforce"* — on every question rather than once at the top.

---

## Variant C — EXTERNAL, NON-VALUE-CHAIN
`affected_community`, `consumer_end_user`, `customer`, `investor_lender`,
`regulator`, `civil_society`

**{Company} would like your view**

{Company} is conducting a sustainability materiality assessment — working
out which topics matter most to the business and to the people and places
its work affects. That covers environmental impact, working conditions in
its own operations and its suppliers', and its effect on surrounding
communities. It is seeking views from a range of people outside the
organisation, including those who see it from where you do.

Your answers are not shown individually. They are combined with everyone
else's, so what {Company} sees is where the people it asked collectively
think the priorities are.

**Answer from your own vantage point.** You are being asked precisely
because you see this company from outside it. There is nothing to look up,
and no expectation that you have a view on everything.

---

## Shared blocks — identical in all three variants

⚠️ Do not vary these by track. §6.1's abstention rule and the
save-and-return behaviour must read the same to everyone, or the counters
mean different things for different populations.

**One question per topic, {n} in all.** Around fifteen minutes.

> ⚠️ `{n}` is 31 or 25 depending on routing — read it from the payload,
> never hardcode it. A page that says 31 to someone shown 25 is a small
> lie that the respondent can check.

**"Not enough visibility to assess" is a real answer, not a blank.**
Nobody sees every part of an organisation. Choosing it records that the
visibility is not there — and a topic many people cannot assess tells
{Company} something worth knowing.

**Leaving a question unanswered is different again, and also fine.** You can
submit with questions unanswered.

**Your answers save as you go.** Close the page and come back to the same
link whenever you like.

---

## Notes

**Two words that are deliberately absent, in all three variants.**

*"ESG" and "environmental, social and governance"* — jargon that means
nothing to a warehouse worker. Every opening paragraph names actual topics
instead: energy, waste, working conditions, health and safety, communities.
That is more concrete, and it tells a respondent whether they have anything
to contribute before they read 31 questions to find out.

*"Journey"* — the audiences most likely to notice are exactly the ones this
survey most needs: a regulator, a workers' representative, an NGO. They read
it as a company saying nothing carefully. It also softens what is in fact a
formal assessment with a legal disclosure at the end, which is the opposite
of what the opening should do.

**⚠️ VARIANT B ADDRESSES AN ORGANISATION, NOT A WORKER.** Decided 16 Aug
2026: supplier workers are not surveyed directly. S2 evidence comes from a
named representative of a supplier organisation, answering institutionally
about their own workforce. Two changes followed — the closing clause of B's
first paragraph, and the removal of the workplace tip above. Reasoning, and
the matching correction to the S2 question framing, are in
`supabase/migrations/20260828_mr_esrs_subtopic_display_s2_framing_fix.sql`.

**Why "{Company} is a customer of the organisation you work for" in B.** A
supplier contact has no relationship with {Company} and may not know why
they are being asked. Saying it plainly is the difference between a survey
and a cold email.

**Why B says where the answers go.** Someone asked about health and safety
by their employer's customer will wonder who reads it. Not saying is worse
than saying, and the claim is true: responses belong to the round, and the
supplier organisation has no access.

⚠️ It is true of the schema. It is not true if the customer's own staff
forward results informally, and no software prevents that. The sentence
claims only what the system does.

**What is deliberately NOT said.** The divergence register — where
stakeholder views differ from the company's own assessment — is specified in
§6.4 and not built. It would be the most persuasive sentence in variant A,
and it is not available yet.

**{Company} appears repeatedly and may be NULL.** Fallback is "your
organisation", which reads badly in variant B ("your organisation is a
customer of the organisation you work for"). The round-creation screen
should require `company_name`; until it does, variant B needs its own
fallback — "the company that has asked for your view".
