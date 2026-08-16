--
-- PostgreSQL database dump
--

\restrict WuqfIU0fVvHDOX8aeLScwdNbFM3cxaC9f3eytSpYVaTZpbfi1U8Xxqc6TALJRf4

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: mr_asset_modifiers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_asset_modifiers (asset_profile, hazard, modifier) FROM stdin;
coastal	coastal	1.5
coastal	cyclone	1.3
coastal	flood	1.2
inland	heat	1.2
inland	drought	1.2
inland	wildfire	1.2
inland	coastal	0.3
water	water	1.5
water	drought	1.4
distributed	coastal	0.6
distributed	flood	0.8
distributed	heat	0.8
distributed	drought	0.8
distributed	water	0.8
distributed	wildfire	0.8
distributed	cyclone	0.8
distributed	cold	0.8
\.


--
-- Data for Name: mr_esrs_topics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_esrs_topics (code, label, category, sort_order, created_at) FROM stdin;
E1	Climate change	env	1	2026-05-27 03:09:17.287836+00
E2	Pollution	env	2	2026-05-27 03:09:17.287836+00
E3	Water & marine resources	env	3	2026-05-27 03:09:17.287836+00
E4	Biodiversity & ecosystems	env	4	2026-05-27 03:09:17.287836+00
E5	Resource use & circular economy	env	5	2026-05-27 03:09:17.287836+00
S1	Own workforce	soc	6	2026-05-27 03:09:17.287836+00
S2	Workers in the value chain	soc	7	2026-05-27 03:09:17.287836+00
S3	Affected communities	soc	8	2026-05-27 03:09:17.287836+00
S4	Consumers & end-users	soc	9	2026-05-27 03:09:17.287836+00
G1	Business conduct	gov	10	2026-05-27 03:09:17.287836+00
\.


--
-- Data for Name: mr_esrs_disclosure_requirements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_esrs_disclosure_requirements (dr_code, standard_version, topic_code, title, datapoints, sort_order, created_at) FROM stdin;
E1-1	esrs_2026	E1	Transition plan for climate change mitigation	\N	1	2026-08-15 21:47:39.918315+00
E1-2	esrs_2026	E1	Identification of climate-related risks and scenario analysis	\N	2	2026-08-15 21:47:39.918315+00
E1-3	esrs_2026	E1	Resilience in relation to climate change	\N	3	2026-08-15 21:47:39.918315+00
E1-4	esrs_2026	E1	Policies related to climate change mitigation and adaptation	\N	4	2026-08-15 21:47:39.918315+00
E1-5	esrs_2026	E1	Actions and resources in relation to climate change mitigation and adaptation	\N	5	2026-08-15 21:47:39.918315+00
E1-6	esrs_2026	E1	Targets related to climate change	\N	6	2026-08-15 21:47:39.918315+00
E1-7	esrs_2026	E1	Energy consumption and mix	\N	7	2026-08-15 21:47:39.918315+00
E1-8	esrs_2026	E1	Gross scope 1, 2, 3 GHG emissions	\N	8	2026-08-15 21:47:39.918315+00
E1-9	esrs_2026	E1	GHG removals and GHG mitigation projects financed through carbon credits	\N	9	2026-08-15 21:47:39.918315+00
E1-10	esrs_2026	E1	Internal carbon pricing	\N	10	2026-08-15 21:47:39.918315+00
E1-11	esrs_2026	E1	Anticipated financial effects from material physical and transition risks and potential climate-related opportunities	\N	11	2026-08-15 21:47:39.918315+00
E2-1	esrs_2026	E2	Policies related to pollution	\N	1	2026-08-15 21:47:39.918315+00
E2-2	esrs_2026	E2	Actions and resources related to pollution	\N	2	2026-08-15 21:47:39.918315+00
E2-3	esrs_2026	E2	Targets related to pollution	\N	3	2026-08-15 21:47:39.918315+00
E2-4	esrs_2026	E2	Pollution of air, water and soil	\N	4	2026-08-15 21:47:39.918315+00
E2-5	esrs_2026	E2	Substances of concern and substances of very high concern	\N	5	2026-08-15 21:47:39.918315+00
E3-1	esrs_2026	E3	Policies related to water	\N	1	2026-08-15 21:47:39.918315+00
E3-2	esrs_2026	E3	Actions and resources related to water	\N	2	2026-08-15 21:47:39.918315+00
E3-3	esrs_2026	E3	Targets related to water	\N	3	2026-08-15 21:47:39.918315+00
E3-4	esrs_2026	E3	Water metrics	\N	4	2026-08-15 21:47:39.918315+00
E4-1	esrs_2026	E4	Biodiversity and ecosystems transition plan	\N	1	2026-08-15 21:47:39.918315+00
E4-2	esrs_2026	E4	Policies related to biodiversity and ecosystems	\N	2	2026-08-15 21:47:39.918315+00
E4-3	esrs_2026	E4	Actions and resources related to biodiversity and ecosystems	\N	3	2026-08-15 21:47:39.918315+00
E4-4	esrs_2026	E4	Targets related to biodiversity and ecosystems	\N	4	2026-08-15 21:47:39.918315+00
E4-5	esrs_2026	E4	Metrics related to biodiversity and ecosystems change	\N	5	2026-08-15 21:47:39.918315+00
E5-1	esrs_2026	E5	Policies related to resource use and circular economy	\N	1	2026-08-15 21:47:39.918315+00
E5-2	esrs_2026	E5	Actions and resources related to resource use and circular economy	\N	2	2026-08-15 21:47:39.918315+00
E5-3	esrs_2026	E5	Targets related to resource use and circular economy	\N	3	2026-08-15 21:47:39.918315+00
E5-4	esrs_2026	E5	Resource inflows	\N	4	2026-08-15 21:47:39.918315+00
E5-5	esrs_2026	E5	Resource outflows	\N	5	2026-08-15 21:47:39.918315+00
S1-1	esrs_2026	S1	Policies related to own workforce	\N	1	2026-08-15 21:47:39.918315+00
S1-2	esrs_2026	S1	Engagement with own workforce and workers' representatives, existence of channels for own workforce to raise concerns or needs and approaches to remedy	\N	2	2026-08-15 21:47:39.918315+00
S1-3	esrs_2026	S1	Actions and resources related to own workforce	\N	3	2026-08-15 21:47:39.918315+00
S1-4	esrs_2026	S1	Targets related to own workforce	\N	4	2026-08-15 21:47:39.918315+00
S1-5	esrs_2026	S1	Characteristics of the undertaking's employees	\N	5	2026-08-15 21:47:39.918315+00
S1-6	esrs_2026	S1	Characteristics of non-employees in the undertaking's own workforce	\N	6	2026-08-15 21:47:39.918315+00
S1-7	esrs_2026	S1	Collective bargaining coverage and social dialogue	\N	7	2026-08-15 21:47:39.918315+00
S1-8	esrs_2026	S1	Gender diversity in top management	\N	8	2026-08-15 21:47:39.918315+00
S1-9	esrs_2026	S1	Adequate wages	\N	9	2026-08-15 21:47:39.918315+00
S1-10	esrs_2026	S1	Social protection	\N	10	2026-08-15 21:47:39.918315+00
S1-11	esrs_2026	S1	Persons with disabilities	\N	11	2026-08-15 21:47:39.918315+00
S1-12	esrs_2026	S1	Training and skills development metrics	\N	12	2026-08-15 21:47:39.918315+00
S1-13	esrs_2026	S1	Health and safety metrics	\N	13	2026-08-15 21:47:39.918315+00
S1-14	esrs_2026	S1	Work-life balance metrics	\N	14	2026-08-15 21:47:39.918315+00
S1-15	esrs_2026	S1	Remuneration metrics	\N	15	2026-08-15 21:47:39.918315+00
S1-16	esrs_2026	S1	Incidents of discrimination and other human rights incidents	\N	16	2026-08-15 21:47:39.918315+00
S2-1	esrs_2026	S2	Policies related to workers in the value chain	\N	1	2026-08-15 21:47:39.918315+00
S2-2	esrs_2026	S2	Engagement with workers in the value chain, existence of channels for workers in the value chain to raise concerns or needs and approaches to remedy	\N	2	2026-08-15 21:47:39.918315+00
S2-3	esrs_2026	S2	Actions and resources related to workers in the value chain	\N	3	2026-08-15 21:47:39.918315+00
S2-4	esrs_2026	S2	Targets related to workers in the value chain	\N	4	2026-08-15 21:47:39.918315+00
S3-1	esrs_2026	S3	Policies related to affected communities	\N	1	2026-08-15 21:47:39.918315+00
S3-2	esrs_2026	S3	Engagement with affected communities, existence of channels for affected communities to raise concerns or needs and approaches to remedy	\N	2	2026-08-15 21:47:39.918315+00
S3-3	esrs_2026	S3	Actions and resources related to affected communities	\N	3	2026-08-15 21:47:39.918315+00
S3-4	esrs_2026	S3	Targets related to affected communities	\N	4	2026-08-15 21:47:39.918315+00
S4-1	esrs_2026	S4	Policies related to consumers and end-users	\N	1	2026-08-15 21:47:39.918315+00
S4-2	esrs_2026	S4	Engagement with consumers and end-users, existence of channels for consumers and end-users to raise concerns or needs and approaches to remedy	\N	2	2026-08-15 21:47:39.918315+00
S4-3	esrs_2026	S4	Actions and resources related to consumers and end-users	\N	3	2026-08-15 21:47:39.918315+00
S4-4	esrs_2026	S4	Targets related to consumers and end-users	\N	4	2026-08-15 21:47:39.918315+00
G1-1	esrs_2026	G1	Policies related to business conduct	\N	1	2026-08-15 21:47:39.918315+00
G1-2	esrs_2026	G1	Actions related to business conduct	\N	2	2026-08-15 21:47:39.918315+00
G1-3	esrs_2026	G1	Targets related to business conduct	\N	3	2026-08-15 21:47:39.918315+00
G1-4	esrs_2026	G1	Metrics related to corruption or bribery	\N	4	2026-08-15 21:47:39.918315+00
G1-5	esrs_2026	G1	Metrics related to political influence, including lobbying activities	\N	5	2026-08-15 21:47:39.918315+00
G1-6	esrs_2026	G1	Metrics related to payment practices	\N	6	2026-08-15 21:47:39.918315+00
E1-1	esrs_2023	E1	Transition plan for climate change mitigation	Plan compatibility with limiting warming to 1.5°C; decarbonisation levers (disclosed only where a plan exists)	1	2026-08-15 21:47:39.918315+00
E1-2	esrs_2023	E1	Policies	Climate change mitigation and adaptation policies	2	2026-08-15 21:47:39.918315+00
E1-3	esrs_2023	E1	Actions and resources	Key actions, expected GHG reductions, CapEx/OpEx allocated	3	2026-08-15 21:47:39.918315+00
E1-4	esrs_2023	E1	Targets	GHG reduction targets, base year, milestone/target years, absolute and intensity	4	2026-08-15 21:47:39.918315+00
E1-5	esrs_2023	E1	Energy consumption and mix	Total energy consumption (MWh); fossil / nuclear / renewable split; energy intensity per net revenue	5	2026-08-15 21:47:39.918315+00
E1-6	esrs_2023	E1	Gross Scopes 1, 2, 3 and total GHG emissions	Scope 1; Scope 2 (location- and market-based); Scope 3 by category; total GHG; intensity per net revenue	6	2026-08-15 21:47:39.918315+00
E1-7	esrs_2023	E1	GHG removals and carbon credits	Removals (tCO₂e); carbon credits cancelled or planned	7	2026-08-15 21:47:39.918315+00
E1-8	esrs_2023	E1	Internal carbon pricing	Schemes applied, prices used, scope of emissions covered	8	2026-08-15 21:47:39.918315+00
E1-9	esrs_2023	E1	Anticipated financial effects	Monetary exposure from material physical and transition risks; climate-related opportunities	9	2026-08-15 21:47:39.918315+00
E2-1	esrs_2023	E2	Policies	Policies to prevent and control pollution of air, water and soil	1	2026-08-15 21:47:39.918315+00
E2-2	esrs_2023	E2	Actions and resources	Actions taken and resources allocated	2	2026-08-15 21:47:39.918315+00
E2-3	esrs_2023	E2	Targets	Pollution-reduction targets	3	2026-08-15 21:47:39.918315+00
E2-4	esrs_2023	E2	Pollution of air, water and soil	Emissions of pollutants to air, water, soil (tonnes), by pollutant	4	2026-08-15 21:47:39.918315+00
E2-5	esrs_2023	E2	Substances of concern	Production/use of substances of concern and of very high concern (tonnes)	5	2026-08-15 21:47:39.918315+00
E2-6	esrs_2023	E2	Anticipated financial effects	Monetary exposure from pollution-related risks and opportunities	6	2026-08-15 21:47:39.918315+00
E3-1	esrs_2023	E3	Policies	Water and marine-resources policies	1	2026-08-15 21:47:39.918315+00
E3-2	esrs_2023	E3	Actions and resources	Actions taken and resources allocated	2	2026-08-15 21:47:39.918315+00
E3-3	esrs_2023	E3	Targets	Water-related targets	3	2026-08-15 21:47:39.918315+00
E3-4	esrs_2023	E3	Water consumption	Total water consumption (m³); consumption in water-stressed areas; water intensity per net revenue	4	2026-08-15 21:47:39.918315+00
E3-5	esrs_2023	E3	Anticipated financial effects	Monetary exposure from water-related risks and opportunities	5	2026-08-15 21:47:39.918315+00
E4-1	esrs_2023	E4	Transition plan and resilience	Biodiversity transition plan; resilience of the strategy	1	2026-08-15 21:47:39.918315+00
E4-2	esrs_2023	E4	Policies	Biodiversity and ecosystems policies	2	2026-08-15 21:47:39.918315+00
E4-3	esrs_2023	E4	Actions and resources	Actions taken and resources allocated	3	2026-08-15 21:47:39.918315+00
E4-4	esrs_2023	E4	Targets	Biodiversity and ecosystems targets	4	2026-08-15 21:47:39.918315+00
E4-5	esrs_2023	E4	Impact metrics	Land-use change; state of species and ecosystems	5	2026-08-15 21:47:39.918315+00
E4-6	esrs_2023	E4	Anticipated financial effects	Monetary exposure from biodiversity-related risks and opportunities	6	2026-08-15 21:47:39.918315+00
E5-1	esrs_2023	E5	Policies	Resource-use and circular-economy policies	1	2026-08-15 21:47:39.918315+00
E5-2	esrs_2023	E5	Actions and resources	Actions taken and resources allocated	2	2026-08-15 21:47:39.918315+00
E5-3	esrs_2023	E5	Targets	Resource-use and circular-economy targets	3	2026-08-15 21:47:39.918315+00
E5-4	esrs_2023	E5	Resource inflows	Materials used (tonnes); share of recycled / renewable inputs	4	2026-08-15 21:47:39.918315+00
E5-5	esrs_2023	E5	Resource outflows	Products, materials and waste (tonnes); recyclable content; hazardous / non-hazardous waste	5	2026-08-15 21:47:39.918315+00
E5-6	esrs_2023	E5	Anticipated financial effects	Monetary exposure from resource-related risks and opportunities	6	2026-08-15 21:47:39.918315+00
S1-1	esrs_2023	S1	Policies	Own-workforce policies	1	2026-08-15 21:47:39.918315+00
S1-3	esrs_2023	S1	Channels to raise concerns	Grievance channels and remediation for own workforce	2	2026-08-15 21:47:39.918315+00
S1-4	esrs_2023	S1	Actions	Actions on material impacts and their effectiveness	3	2026-08-15 21:47:39.918315+00
S1-5	esrs_2023	S1	Targets	Workforce-related targets	4	2026-08-15 21:47:39.918315+00
S1-6	esrs_2023	S1	Characteristics of employees	Headcount by gender, country and contract type; turnover	5	2026-08-15 21:47:39.918315+00
S1-14	esrs_2023	S1	Health and safety	Coverage; recordable work-related injuries, fatalities, and ill-health	6	2026-08-15 21:47:39.918315+00
S1-16	esrs_2023	S1	Remuneration (pay gap)	Gender pay gap (%); total-remuneration ratio (highest-paid to median)	7	2026-08-15 21:47:39.918315+00
S1-17	esrs_2023	S1	Incidents and complaints	Discrimination / harassment incidents; severe human-rights incidents	8	2026-08-15 21:47:39.918315+00
S2-1	esrs_2023	S2	Policies	Value-chain-worker policies	1	2026-08-15 21:47:39.918315+00
S2-2	esrs_2023	S2	Engagement	Processes to engage value-chain workers on impacts	2	2026-08-15 21:47:39.918315+00
S2-3	esrs_2023	S2	Channels to raise concerns	Grievance channels and remediation	3	2026-08-15 21:47:39.918315+00
S2-4	esrs_2023	S2	Actions	Actions on material impacts and their effectiveness	4	2026-08-15 21:47:39.918315+00
S2-5	esrs_2023	S2	Targets	Value-chain-worker targets	5	2026-08-15 21:47:39.918315+00
S3-1	esrs_2023	S3	Policies	Affected-communities policies	1	2026-08-15 21:47:39.918315+00
S3-2	esrs_2023	S3	Engagement	Processes to engage affected communities on impacts	2	2026-08-15 21:47:39.918315+00
S3-3	esrs_2023	S3	Channels to raise concerns	Grievance channels and remediation	3	2026-08-15 21:47:39.918315+00
S3-4	esrs_2023	S3	Actions	Actions on material impacts and their effectiveness	4	2026-08-15 21:47:39.918315+00
S3-5	esrs_2023	S3	Targets	Community-related targets	5	2026-08-15 21:47:39.918315+00
S4-1	esrs_2023	S4	Policies	Consumer / end-user policies	1	2026-08-15 21:47:39.918315+00
S4-2	esrs_2023	S4	Engagement	Processes to engage consumers and end-users on impacts	2	2026-08-15 21:47:39.918315+00
S4-3	esrs_2023	S4	Channels to raise concerns	Grievance channels and remediation	3	2026-08-15 21:47:39.918315+00
S4-4	esrs_2023	S4	Actions	Actions on material impacts and their effectiveness	4	2026-08-15 21:47:39.918315+00
S4-5	esrs_2023	S4	Targets	Consumer / end-user targets	5	2026-08-15 21:47:39.918315+00
G1-1	esrs_2023	G1	Business conduct policies and corporate culture	Conduct policies; description of corporate culture	1	2026-08-15 21:47:39.918315+00
G1-2	esrs_2023	G1	Management of supplier relationships	Approach to supplier relationships; payment-practices policy	2	2026-08-15 21:47:39.918315+00
G1-3	esrs_2023	G1	Prevention and detection of corruption and bribery	Procedures in place; training coverage	3	2026-08-15 21:47:39.918315+00
G1-4	esrs_2023	G1	Confirmed incidents of corruption or bribery	Number of confirmed incidents; convictions; fines	4	2026-08-15 21:47:39.918315+00
G1-5	esrs_2023	G1	Political influence and lobbying	Political contributions; lobbying spend	5	2026-08-15 21:47:39.918315+00
G1-6	esrs_2023	G1	Payment practices	Average time to pay; standard terms; late-payment status	6	2026-08-15 21:47:39.918315+00
\.


--
-- Data for Name: mr_esrs_subtopics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_esrs_subtopics (code, topic_code, label, sort_order, standard_version, parent_code, created_at) FROM stdin;
E1.1	E1	Climate change mitigation	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E1.2	E1	Climate change adaptation	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E1.3	E1	Energy	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E2.1	E2	Pollution of air	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E2.2	E2	Pollution of water	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E2.3	E2	Pollution of soil	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E2.4	E2	Substances of concern, including substances of very high concern	4	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E2.5	E2	Microplastics	5	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E3.1	E3	Water use, including withdrawal, consumption, discharges and storage	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E4.1	E4	Drivers of biodiversity and ecosystem change (including terrestrial and marine habitat change, invasive species)	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E4.2	E4	State of species	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E4.3	E4	The extent and condition of terrestrial and marine ecosystems	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E4.4	E4	Ecosystem services	4	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E5.1	E5	Resource inflows	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E5.2	E5	Resource outflows related to products and services	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
E5.3	E5	Resource outflows (waste)	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S1.1	S1	Working conditions (including adequate wages, work-life balance, working time, secure employment) and social protection	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S1.2	S1	Social dialogue and collective bargaining, freedom of association, information and consultation rights of workers, including through works councils	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S1.3	S1	Health and safety	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S1.4	S1	Training and skills development	4	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S1.5	S1	Diversity and equal treatment (including gender equality, equal pay for work of equal value, employment and inclusion of people with disabilities, non-discrimination, anti-harassment, measures against violence)	5	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S1.6	S1	Other labour-related human rights (including child labour, forced labour, privacy and adequate housing)	6	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S2.1	S2	Working conditions (including adequate wages, work-life balance, working time, secure employment) and social protection	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S2.2	S2	Social dialogue and collective bargaining, freedom of association, information and consultation rights of workers, including through works councils	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S2.3	S2	Health and safety	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S2.4	S2	Training and skills development	4	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S2.5	S2	Diversity and equal treatment (including gender equality, equal pay for work of equal value, employment and inclusion of people with disabilities, non-discrimination, anti-harassment, measures against violence)	5	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S2.6	S2	Other labour-related human rights (including child labour, forced labour, privacy and adequate housing, water and sanitation)	6	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S3.1	S3	Communities' economic, social and cultural rights (including land-related impacts, security-related impacts, adequate housing and food, water and sanitation)	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S3.2	S3	Communities' civil and political rights (including freedom of expression, freedom of assembly, impacts on human rights defenders)	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S3.3	S3	Rights of indigenous peoples (including free, prior and informed consent (FPIC), self-determination, cultural rights)	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S4.1	S4	Information-related impacts for consumers or users (including privacy, access to information, freedom of expression)	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S4.2	S4	Personal safety of consumers or end-users (including health and safety, protection of children, security of a person)	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
S4.3	S4	Social inclusion of consumers or end-users (including access to products and services, responsible marketing practices, non-discrimination)	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
G1.1	G1	Corporate culture, including anti-corruption and bribery, the protection of whistle-blowers and animal welfare	1	esrs_2026	\N	2026-08-15 18:10:27.862346+00
G1.2	G1	Political influence, including lobbying activities	2	esrs_2026	\N	2026-08-15 18:10:27.862346+00
G1.3	G1	Management of relationships with suppliers, including payment practices, especially late payment to small- and medium-sized undertakings	3	esrs_2026	\N	2026-08-15 18:10:27.862346+00
\.


--
-- Data for Name: mr_esrs_subtopic_display; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_esrs_subtopic_display (subtopic_code, standard_version, short_name, question_framing, shared_with_subtopic_code, created_at, updated_at) FROM stdin;
E1.1	esrs_2026	Climate change mitigation	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E1.2	esrs_2026	Climate change adaptation	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E1.3	esrs_2026	Energy use and sourcing	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E2.1	esrs_2026	Air pollution	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E2.2	esrs_2026	Water pollution	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E2.3	esrs_2026	Soil pollution	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E2.4	esrs_2026	Substances of concern	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E2.5	esrs_2026	Microplastics	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E3.1	esrs_2026	Water use	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E4.1	esrs_2026	Drivers of biodiversity loss	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E4.2	esrs_2026	State of species	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E4.3	esrs_2026	Extent and condition of ecosystems	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E4.4	esrs_2026	Ecosystem services	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E5.1	esrs_2026	Resource inflows (materials used)	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E5.2	esrs_2026	Resource outflows (products and services)	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
E5.3	esrs_2026	Waste	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S1.1	esrs_2026	Working conditions and social protection	in your own workforce	S2.1	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S1.2	esrs_2026	Social dialogue and collective bargaining	in your own workforce	S2.2	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S1.3	esrs_2026	Health and safety	in your own workforce	S2.3	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S1.4	esrs_2026	Training and skills development	in your own workforce	S2.4	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S1.5	esrs_2026	Diversity and equal treatment	in your own workforce	S2.5	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S1.6	esrs_2026	Other labour rights	in your own workforce	S2.6	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S2.1	esrs_2026	Working conditions and social protection	for workers in your suppliers' and value-chain operations	S1.1	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S2.2	esrs_2026	Social dialogue and collective bargaining	for workers in your suppliers' and value-chain operations	S1.2	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S2.3	esrs_2026	Health and safety	for workers in your suppliers' and value-chain operations	S1.3	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S2.4	esrs_2026	Training and skills development	for workers in your suppliers' and value-chain operations	S1.4	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S2.5	esrs_2026	Diversity and equal treatment	for workers in your suppliers' and value-chain operations	S1.5	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S2.6	esrs_2026	Other labour rights	for workers in your suppliers' and value-chain operations	S1.6	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S3.1	esrs_2026	Communities' economic, social and cultural rights	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S3.2	esrs_2026	Communities' civil and political rights	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S3.3	esrs_2026	Rights of indigenous peoples	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S4.1	esrs_2026	Privacy and access to information	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S4.2	esrs_2026	Consumer safety	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
S4.3	esrs_2026	Consumer inclusion and responsible marketing	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
G1.1	esrs_2026	Corporate culture and anti-corruption	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
G1.2	esrs_2026	Political influence and lobbying	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
G1.3	esrs_2026	Supplier relationships and payment practices	\N	\N	2026-08-16 13:11:05.294727+00	2026-08-16 13:11:05.294727+00
\.


--
-- Data for Name: mr_esrs_topic_labels; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_esrs_topic_labels (topic_code, standard_version, label, created_at) FROM stdin;
E1	esrs_2026	Climate Change	2026-08-15 18:55:21.067013+00
E2	esrs_2026	Pollution	2026-08-15 18:55:21.067013+00
E3	esrs_2026	Water	2026-08-15 18:55:21.067013+00
E4	esrs_2026	Biodiversity and Ecosystems	2026-08-15 18:55:21.067013+00
E5	esrs_2026	Circular Economy and Resource Use	2026-08-15 18:55:21.067013+00
S1	esrs_2026	Own Workforce and Workers in the Value Chain	2026-08-15 18:55:21.067013+00
S2	esrs_2026	Own Workforce and Workers in the Value Chain	2026-08-15 18:55:21.067013+00
S3	esrs_2026	Affected Communities	2026-08-15 18:55:21.067013+00
S4	esrs_2026	Consumers and End-users	2026-08-15 18:55:21.067013+00
G1	esrs_2026	Business Conduct	2026-08-15 18:55:21.067013+00
\.


--
-- Data for Name: mr_industries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_industries (code, label, carbon_exposure, sort_order, active, created_at, provenance, source_ref, source_date) FROM stdin;
energy	Energy & Utilities	3	2	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
finance	Financial Services	1	6	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
realestate	Real Estate	2	3	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
tech	Technology	1	7	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
health	Healthcare & Pharma	2	9	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
manuf	Industrials & Manufacturing	3	4	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
retail	Consumer & Retail	2	8	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
agri	Agriculture & Food	2	1	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
transport	Transport & Logistics	3	5	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
extract	Mining & Metals	3	10	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
construction	Construction & Materials	3	11	t	2026-05-27 12:40:13.012338+00	starter	\N	\N
profservices	Professional Services	1	12	t	2026-05-27 12:40:13.012338+00	starter	\N	\N
other	Other	2	13	t	2026-05-27 12:40:13.012338+00	starter	\N	\N
\.


--
-- Data for Name: mr_industry_hazards; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_industry_hazards (industry_code, hazard, sensitivity, provenance, source_ref, source_date) FROM stdin;
agri	drought	3	starter	\N	\N
agri	water	3	starter	\N	\N
agri	heat	3	starter	\N	\N
agri	flood	2	starter	\N	\N
energy	heat	3	starter	\N	\N
energy	water	3	starter	\N	\N
energy	cyclone	2	starter	\N	\N
energy	wildfire	2	starter	\N	\N
realestate	coastal	3	starter	\N	\N
realestate	flood	3	starter	\N	\N
realestate	heat	2	starter	\N	\N
realestate	wildfire	2	starter	\N	\N
realestate	cyclone	2	starter	\N	\N
manuf	flood	2	starter	\N	\N
manuf	water	2	starter	\N	\N
manuf	heat	2	starter	\N	\N
transport	flood	3	starter	\N	\N
transport	cyclone	2	starter	\N	\N
transport	coastal	2	starter	\N	\N
transport	heat	2	starter	\N	\N
finance	flood	1	starter	\N	\N
finance	coastal	1	starter	\N	\N
tech	heat	2	starter	\N	\N
tech	water	2	starter	\N	\N
retail	flood	2	starter	\N	\N
retail	drought	1	starter	\N	\N
health	heat	2	starter	\N	\N
health	flood	2	starter	\N	\N
extract	water	3	starter	\N	\N
extract	heat	2	starter	\N	\N
extract	flood	2	starter	\N	\N
extract	drought	2	starter	\N	\N
construction	flood	3	starter	\N	\N
construction	heat	3	starter	\N	\N
construction	coastal	2	starter	\N	\N
construction	wildfire	2	starter	\N	\N
profservices	flood	1	starter	\N	\N
profservices	heat	1	starter	\N	\N
other	flood	2	starter	\N	\N
other	heat	2	starter	\N	\N
other	drought	1	starter	\N	\N
\.


--
-- Data for Name: mr_industry_opportunities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_industry_opportunities (industry_code, opportunity_category, relevance, sort_order, created_at, provenance, source_ref, source_date) FROM stdin;
manuf	resource_efficiency	3	1	2026-06-01 19:19:21.928813+00	starter	\N	\N
manuf	energy_source	3	2	2026-06-01 19:19:21.928813+00	starter	\N	\N
manuf	products_services	2	3	2026-06-01 19:19:21.928813+00	starter	\N	\N
manuf	markets	2	4	2026-06-01 19:19:21.928813+00	starter	\N	\N
manuf	resilience	2	5	2026-06-01 19:19:21.928813+00	starter	\N	\N
energy	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
energy	energy_source	3	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
energy	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
energy	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
energy	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
extract	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
extract	energy_source	2	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
extract	products_services	2	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
extract	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
extract	resilience	1	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
transport	resource_efficiency	3	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
transport	energy_source	3	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
transport	products_services	2	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
transport	markets	2	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
transport	resilience	1	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
construction	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
construction	energy_source	2	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
construction	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
construction	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
construction	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
agri	resource_efficiency	3	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
agri	energy_source	2	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
agri	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
agri	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
agri	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
realestate	resource_efficiency	3	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
realestate	energy_source	2	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
realestate	products_services	2	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
realestate	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
realestate	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
retail	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
retail	energy_source	2	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
retail	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
retail	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
retail	resilience	1	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
finance	resource_efficiency	1	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
finance	energy_source	1	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
finance	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
finance	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
finance	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
tech	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
tech	energy_source	2	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
tech	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
tech	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
tech	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
health	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
health	energy_source	1	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
health	products_services	2	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
health	markets	1	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
health	resilience	2	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
profservices	resource_efficiency	1	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
profservices	energy_source	1	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
profservices	products_services	3	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
profservices	markets	3	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
profservices	resilience	1	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
other	resource_efficiency	2	1	2026-06-02 19:16:19.205526+00	starter	\N	\N
other	energy_source	1	2	2026-06-02 19:16:19.205526+00	starter	\N	\N
other	products_services	1	3	2026-06-02 19:16:19.205526+00	starter	\N	\N
other	markets	1	4	2026-06-02 19:16:19.205526+00	starter	\N	\N
other	resilience	1	5	2026-06-02 19:16:19.205526+00	starter	\N	\N
\.


--
-- Data for Name: mr_industry_subtopic_baselines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_industry_subtopic_baselines (industry_code, subtopic_code, standard_version, financial_base, impact_base, provenance, source_ref, source_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mr_industry_topic_baselines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_industry_topic_baselines (industry_code, topic_code, financial_base, impact_base, provenance, source_ref, source_date) FROM stdin;
agri	E1	8	5	starter	\N	\N
agri	E2	2	5	starter	\N	\N
agri	E3	8	8	starter	\N	\N
agri	E4	5	8	starter	\N	\N
agri	E5	5	8	starter	\N	\N
agri	S1	2	2	starter	\N	\N
agri	S2	5	8	starter	\N	\N
agri	S3	5	5	starter	\N	\N
agri	S4	2	2	starter	\N	\N
agri	G1	2	2	starter	\N	\N
energy	E1	8	8	starter	\N	\N
energy	E2	8	8	starter	\N	\N
energy	E3	5	8	starter	\N	\N
energy	E4	2	5	starter	\N	\N
energy	E5	2	5	starter	\N	\N
energy	S1	5	5	starter	\N	\N
energy	S2	2	2	starter	\N	\N
energy	S3	5	8	starter	\N	\N
energy	S4	2	2	starter	\N	\N
energy	G1	8	5	starter	\N	\N
realestate	E1	8	8	starter	\N	\N
realestate	E2	2	5	starter	\N	\N
realestate	E3	2	5	starter	\N	\N
realestate	E4	5	8	starter	\N	\N
realestate	E5	8	8	starter	\N	\N
realestate	S1	5	5	starter	\N	\N
realestate	S2	2	2	starter	\N	\N
realestate	S3	2	5	starter	\N	\N
realestate	S4	2	2	starter	\N	\N
realestate	G1	5	2	starter	\N	\N
manuf	E1	8	5	starter	\N	\N
manuf	E2	8	8	starter	\N	\N
manuf	E3	5	5	starter	\N	\N
manuf	E4	2	2	starter	\N	\N
manuf	E5	8	8	starter	\N	\N
manuf	S1	5	5	starter	\N	\N
manuf	S2	5	8	starter	\N	\N
manuf	S3	2	2	starter	\N	\N
manuf	S4	2	2	starter	\N	\N
manuf	G1	5	5	starter	\N	\N
transport	E1	8	8	starter	\N	\N
transport	E2	5	8	starter	\N	\N
transport	E3	2	2	starter	\N	\N
transport	E4	2	2	starter	\N	\N
transport	E5	2	5	starter	\N	\N
transport	S1	5	5	starter	\N	\N
transport	S2	2	2	starter	\N	\N
transport	S3	2	2	starter	\N	\N
transport	S4	5	5	starter	\N	\N
transport	G1	8	5	starter	\N	\N
finance	E1	8	8	starter	\N	\N
finance	E2	2	2	starter	\N	\N
finance	E3	2	2	starter	\N	\N
finance	E4	2	5	starter	\N	\N
finance	E5	2	2	starter	\N	\N
finance	S1	5	2	starter	\N	\N
finance	S2	2	2	starter	\N	\N
finance	S3	2	5	starter	\N	\N
finance	S4	8	5	starter	\N	\N
finance	G1	8	8	starter	\N	\N
tech	E1	5	5	starter	\N	\N
tech	E2	2	2	starter	\N	\N
tech	E3	5	5	starter	\N	\N
tech	E4	2	2	starter	\N	\N
tech	E5	5	8	starter	\N	\N
tech	S1	8	5	starter	\N	\N
tech	S2	2	2	starter	\N	\N
tech	S3	2	2	starter	\N	\N
tech	S4	8	8	starter	\N	\N
tech	G1	8	8	starter	\N	\N
retail	E1	5	5	starter	\N	\N
retail	E2	2	8	starter	\N	\N
retail	E3	2	2	starter	\N	\N
retail	E4	2	2	starter	\N	\N
retail	E5	5	8	starter	\N	\N
retail	S1	5	5	starter	\N	\N
retail	S2	8	8	starter	\N	\N
retail	S3	2	2	starter	\N	\N
retail	S4	8	8	starter	\N	\N
retail	G1	8	5	starter	\N	\N
health	E1	5	5	starter	\N	\N
health	E2	8	8	starter	\N	\N
health	E3	5	8	starter	\N	\N
health	E4	2	2	starter	\N	\N
health	E5	5	5	starter	\N	\N
health	S1	5	5	starter	\N	\N
health	S2	2	2	starter	\N	\N
health	S3	2	2	starter	\N	\N
health	S4	8	8	starter	\N	\N
health	G1	8	8	starter	\N	\N
extract	E1	8	5	starter	\N	\N
extract	E2	8	8	starter	\N	\N
extract	E3	5	8	starter	\N	\N
extract	E4	5	8	starter	\N	\N
extract	E5	5	5	starter	\N	\N
extract	S1	5	5	starter	\N	\N
extract	S2	5	8	starter	\N	\N
extract	S3	8	8	starter	\N	\N
extract	S4	2	2	starter	\N	\N
extract	G1	8	5	starter	\N	\N
construction	E1	8	5	starter	\N	\N
construction	E2	5	8	starter	\N	\N
construction	E3	2	5	starter	\N	\N
construction	E4	5	8	starter	\N	\N
construction	E5	8	8	starter	\N	\N
construction	S1	8	5	starter	\N	\N
construction	S2	5	5	starter	\N	\N
construction	S3	2	5	starter	\N	\N
construction	S4	2	2	starter	\N	\N
construction	G1	5	5	starter	\N	\N
profservices	E1	2	2	starter	\N	\N
profservices	E2	2	2	starter	\N	\N
profservices	E3	2	2	starter	\N	\N
profservices	E4	2	2	starter	\N	\N
profservices	E5	2	2	starter	\N	\N
profservices	S1	8	5	starter	\N	\N
profservices	S2	2	2	starter	\N	\N
profservices	S3	2	2	starter	\N	\N
profservices	S4	5	5	starter	\N	\N
profservices	G1	8	8	starter	\N	\N
other	E1	5	5	starter	\N	\N
other	E2	5	5	starter	\N	\N
other	E3	5	5	starter	\N	\N
other	E4	2	2	starter	\N	\N
other	E5	5	5	starter	\N	\N
other	S1	5	5	starter	\N	\N
other	S2	2	2	starter	\N	\N
other	S3	2	2	starter	\N	\N
other	S4	5	5	starter	\N	\N
other	G1	5	5	starter	\N	\N
\.


--
-- Data for Name: mr_industry_transition_drivers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_industry_transition_drivers (industry_code, transition_driver, weight, sort_order, created_at, provenance, source_ref, source_date) FROM stdin;
energy	policy	3	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
energy	technology	3	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
energy	market	3	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
energy	reputation	2	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
manuf	policy	3	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
manuf	technology	3	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
manuf	market	2	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
manuf	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
extract	policy	3	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
extract	technology	2	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
extract	market	3	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
extract	reputation	2	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
transport	policy	3	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
transport	technology	3	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
transport	market	2	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
transport	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
construction	policy	3	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
construction	technology	2	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
construction	market	2	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
construction	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
agri	policy	2	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
agri	technology	2	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
agri	market	3	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
agri	reputation	2	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
realestate	policy	3	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
realestate	technology	2	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
realestate	market	3	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
realestate	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
retail	policy	2	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
retail	technology	1	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
retail	market	3	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
retail	reputation	3	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
finance	policy	2	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
finance	technology	1	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
finance	market	2	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
finance	reputation	2	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
tech	policy	1	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
tech	technology	1	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
tech	market	2	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
tech	reputation	2	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
health	policy	1	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
health	technology	1	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
health	market	1	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
health	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
profservices	policy	1	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
profservices	technology	1	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
profservices	market	2	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
profservices	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
other	policy	1	1	2026-06-02 15:48:56.161754+00	starter	\N	\N
other	technology	1	2	2026-06-02 15:48:56.161754+00	starter	\N	\N
other	market	1	3	2026-06-02 15:48:56.161754+00	starter	\N	\N
other	reputation	1	4	2026-06-02 15:48:56.161754+00	starter	\N	\N
\.


--
-- Data for Name: mr_jurisdictions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_jurisdictions (code, label, policy_intensity, sort_order, active, created_at, provenance, source_ref, source_date) FROM stdin;
eu_ets	EU (EU ETS)	3	1	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
uk_ets	UK (UK ETS)	3	3	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
ca	Canada (federal pricing)	2	4	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
us_fed	US (federal)	1	5	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
us_ca	US — California cap-and-trade	2	6	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
cn	China (national ETS)	2	7	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
kr	South Korea (K-ETS)	2	8	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
jp	Japan	1	9	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
au	Australia (Safeguard)	2	10	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
nz	New Zealand (NZ ETS)	2	11	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
ch	Switzerland (CH ETS)	2	12	t	2026-05-27 03:09:17.287836+00	starter	\N	\N
in	India (CCTS)	1	21	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
id	Indonesia (ETS)	1	22	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
sg	Singapore (carbon tax)	2	23	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
za	South Africa (carbon tax)	1	24	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
mx	Mexico (carbon tax)	1	25	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
cl	Chile (carbon tax)	1	26	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
tw	Taiwan (carbon fee)	1	27	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
kz	Kazakhstan (ETS)	1	28	t	2026-06-12 16:57:40.447462+00	starter	\N	\N
\.


--
-- Data for Name: mr_model_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_model_config (id, model_version, phys_high, phys_med, topic_high, topic_med, horizon_short, horizon_medium, horizon_long, updated_at, trans_policy_high, trans_policy_med, trans_driver_high, trans_driver_med, provenance, source_ref, source_date) FROM stdin;
1	1.2	5.5	3.0	8.0	5.0	0.85	1.0	1.2	2026-07-14 18:06:20.529015+00	12	6	4	2	starter	\N	\N
\.


--
-- Data for Name: mr_regions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_regions (code, label, continent, sort_order, active, created_at) FROM stdin;
NWN	North-Western North America	North America	1	t	2026-05-27 03:10:47.912076+00
NEN	North-Eastern North America	North America	2	t	2026-05-27 03:10:47.912076+00
WNA	Western North America	North America	3	t	2026-05-27 03:10:47.912076+00
CNA	Central North America	North America	4	t	2026-05-27 03:10:47.912076+00
ENA	Eastern North America	North America	5	t	2026-05-27 03:10:47.912076+00
CAR	Caribbean	Central America & Caribbean	6	t	2026-05-27 03:10:47.912076+00
NEU	Northern Europe	Europe	7	t	2026-05-27 03:10:47.912076+00
WCE	Western & Central Europe	Europe	8	t	2026-05-27 03:10:47.912076+00
MED	Mediterranean	Europe	9	t	2026-05-27 03:10:47.912076+00
EEU	Eastern Europe	Europe	10	t	2026-05-27 03:10:47.912076+00
SAS	South Asia	Asia & Middle East	11	t	2026-05-27 03:10:47.912076+00
SEA	South-East Asia	Asia & Middle East	12	t	2026-05-27 03:10:47.912076+00
EAS	East Asia	Asia & Middle East	13	t	2026-05-27 03:10:47.912076+00
ARP	Arabian Peninsula	Asia & Middle East	14	t	2026-05-27 03:10:47.912076+00
WCA	West Central Asia	Asia & Middle East	15	t	2026-05-27 03:10:47.912076+00
WAF	Western Africa	Africa	16	t	2026-05-27 03:10:47.912076+00
ESAF	East Southern Africa	Africa	17	t	2026-05-27 03:10:47.912076+00
EAU	Eastern Australia	Australasia & Pacific	18	t	2026-05-27 03:10:47.912076+00
NAU	Northern Australia	Australasia & Pacific	19	t	2026-05-27 03:10:47.912076+00
PAC	Pacific Small Islands	Australasia & Pacific	20	t	2026-05-27 03:10:47.912076+00
\.


--
-- Data for Name: mr_region_aliases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_region_aliases (alias_label, region_code) FROM stdin;
Northern Europe	NEU
Southern Europe	MED
Eastern Europe	EEU
North America — East Coast	ENA
North America — West Coast	WNA
North America — Central	CNA
Middle East & North Africa	ARP
Sub-Saharan Africa	WAF
South Asia	SAS
Southeast Asia	SEA
East Asia	EAS
Australia & Pacific	EAU
\.


--
-- Data for Name: mr_region_hazards; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_region_hazards (region_code, hazard, intensity, source_note, provenance, source_ref, source_date) FROM stdin;
NWN	cold	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NWN	wildfire	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NWN	flood	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NEN	cold	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NEN	flood	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NEN	coastal	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WNA	wildfire	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WNA	drought	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WNA	water	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WNA	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
CNA	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
CNA	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
CNA	drought	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ENA	cyclone	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ENA	coastal	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ENA	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ENA	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
CAR	cyclone	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
CAR	coastal	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
CAR	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NEU	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NEU	coastal	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NEU	heat	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCE	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCE	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCE	drought	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCE	coastal	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
MED	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
MED	drought	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
MED	water	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
MED	wildfire	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EEU	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EEU	drought	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EEU	flood	1	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SAS	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SAS	flood	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SAS	cyclone	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SAS	water	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SEA	flood	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SEA	cyclone	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SEA	coastal	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
SEA	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAS	cyclone	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAS	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAS	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAS	coastal	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ARP	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ARP	water	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ARP	drought	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCA	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCA	drought	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WCA	water	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WAF	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WAF	drought	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
WAF	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ESAF	drought	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
ESAF	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAU	wildfire	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAU	heat	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
EAU	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NAU	cyclone	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NAU	heat	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
NAU	flood	2	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
PAC	coastal	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
PAC	cyclone	3	AR6 WGI starter	starter	Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.	\N
\.


--
-- Data for Name: mr_scenarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_scenarios (code, label, framework, descriptor, physical_mult, transition_mult, sort_order, created_at, provenance, source_ref, source_date) FROM stdin;
ngfs_orderly	NGFS Orderly	NGFS	Early policy	0.8	1.25	4	2026-05-27 03:09:17.287836+00	starter	\N	\N
ngfs_disorderly	NGFS Disorderly	NGFS	Late, abrupt	1.0	1.5	5	2026-05-27 03:09:17.287836+00	starter	\N	\N
ngfs_hothouse	NGFS Hot House	NGFS	Limited action	1.5	0.5	6	2026-05-27 03:09:17.287836+00	starter	\N	\N
ssp126	IPCC SSP1-2.6	IPCC	~1.8°C	0.75	1.4	1	2026-05-27 03:09:17.287836+00	primary_source	IPCC AR6 WGI (2021), Summary for Policymakers, Table SPM.1 — best estimate of global surface temperature change, 2081–2100 vs 1850–1900. Scenario framework: Box SPM.1.	2021-08-09
ssp245	IPCC SSP2-4.5	IPCC	~2.7°C	1.0	1.0	2	2026-05-27 03:09:17.287836+00	primary_source	IPCC AR6 WGI (2021), Summary for Policymakers, Table SPM.1 — best estimate of global surface temperature change, 2081–2100 vs 1850–1900. Scenario framework: Box SPM.1.	2021-08-09
ssp585	IPCC SSP5-8.5	IPCC	~4.4°C	1.4	0.6	3	2026-05-27 03:09:17.287836+00	primary_source	IPCC AR6 WGI (2021), Summary for Policymakers, Table SPM.1 — best estimate of global surface temperature change, 2081–2100 vs 1850–1900. Scenario framework: Box SPM.1.	2021-08-09
\.


--
-- Data for Name: mr_stakeholder_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mr_stakeholder_categories (code, label, track, labour_routing, is_affected, is_user, can_proxy_for_affected, sort_order, created_at) FROM stdin;
own_workforce	Own workforce (employee or non-employee worker)	internal	s1	t	f	f	1	2026-08-16 13:11:05.294727+00
workers_rep_own	Workers' representatives — own workforce	internal	s1	t	t	t	2	2026-08-16 13:11:05.294727+00
value_chain_worker	Worker in the value chain	external	s2	t	f	f	3	2026-08-16 13:11:05.294727+00
workers_rep_value_chain	Workers' representatives — value chain	external	s2	t	t	t	4	2026-08-16 13:11:05.294727+00
supplier	Supplier	external	s2	t	t	t	5	2026-08-16 13:11:05.294727+00
affected_community	Affected community	external	not_asked	t	f	f	6	2026-08-16 13:11:05.294727+00
consumer_end_user	Consumer or end-user	external	not_asked	t	f	f	7	2026-08-16 13:11:05.294727+00
customer	Customer (business)	external	not_asked	f	t	f	8	2026-08-16 13:11:05.294727+00
investor_lender	Investor, lender or creditor	external	not_asked	f	t	f	9	2026-08-16 13:11:05.294727+00
regulator	Regulator or public authority	external	not_asked	f	t	f	10	2026-08-16 13:11:05.294727+00
civil_society	Civil society or NGO	external	not_asked	f	t	t	11	2026-08-16 13:11:05.294727+00
\.


--
-- PostgreSQL database dump complete
--

\unrestrict WuqfIU0fVvHDOX8aeLScwdNbFM3cxaC9f3eytSpYVaTZpbfi1U8Xxqc6TALJRf4

