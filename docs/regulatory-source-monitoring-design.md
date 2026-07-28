# Regulatory & Framework Source Monitoring — Design

Status: DESIGN (not yet built)
Date: 2026-07-28
Scope: platform-wide — all modules, all jurisdictions, regulatory and
voluntary frameworks.

## 0. Why not Google Alerts

Keyword alerting over the open web is the wrong primary instrument for this
platform, and not by a small margin. It is secondary-source-biased, noisy, and
structurally blind to the failure mode that actually threatens ThemisIQ: **a
PDF or XLS quietly replaced at the same URL.**

The steel and aluminium seeds came from exactly such files
(`DVs_as_adopted_v20260204`, `CBAM_Benchmarks_20260206`). A new revision
appearing on the Commission's legislation-and-guidance page would generate no
news article and no keyword hit, and would silently invalidate 6,423 seeded
steel rows and 1,628 aluminium defaults. The same exposure exists for every
hardcoded emission factor in the GHG engine: EPA, ECCC, DEFRA/DESNZ, DCCEEW,
MfE.

What is needed is **change detection over a registry of named primary sources,
wired to impact**. Keyword alerting is a backstop tier, not the system.

## 1. Governing principle

**An alert is a prompt to go read the primary source. It is never itself a
source.**

No monitoring output may be transcribed into a factor, benchmark, or corpus
entry. Nothing automated ever updates a number. Human-in-the-loop, always —
the same discipline the engine already enforces.

## 2. The core object: a source registry

`lib/sources.ts` — typed, in git, one entry per watched document or page:

- `source_id` — stable key (e.g. `EU_IR_2025_2621`)
- publisher, title, URL, document type
- watch method — feed / page-hash / mailing list / manual
- cadence — annual, ad hoc, scheduled
- last reviewed date
- **`depends_on: source_id[]`, referenced from every consuming artifact**

`depends_on` is what makes this worth building. Every seeded factor table,
every corpus entry, and every §11 item already cites a source in prose. Making
the citation a **key** means a detected change on `EU_IR_2025_2621` immediately
answers *"what breaks?"* — the aluminium seed, the steel per-country seed,
named corpus entries, named open items.

**Monitoring without an impact graph is just more inbox.**

## 3. Four tiers, in precision order

### Tier 1 — Machine-readable official feeds

EUR-Lex saved searches with email notification; US Federal Register free API
and saved-search alerts; Canada Gazette. Structured, high precision, near-zero
effort. Covers legislative instruments.

### Tier 2 — Page and asset hash-watch

**The highest-value tier for ThemisIQ and the one nothing else covers.**
Annual publications with no feed, where the file changes underneath a stable
URL:

- CBAM legislation-and-guidance page (default values, benchmarks)
- EPA Emission Factors Hub
- ECCC National Inventory Report
- DEFRA / DESNZ conversion factors
- DCCEEW NGA Factors
- MfE Measuring Emissions

Hash the page **and the linked asset URLs**; alert on any delta. Every
jurisdiction in the GHG engine has one of these, and each is a silent-revision
exposure on hardcoded factors.

### Tier 3 — Official announcement channels

Mailing lists and RSS for voluntary and standard-setting bodies: CDP,
EcoVadis, SBTi, IFRS / ISSB, GHG Protocol, GRI, PCAF, ISO and accreditation
bodies.

Subscribe a **dedicated inbox** (e.g. `regwatch@`) rather than a personal one.
Near-zero effort, far higher precision than keyword alerts.

### Tier 4 — Keyword alerting, backstop only

Google Alerts or equivalent, on a short term list, explicitly marked
secondary. Catches the unknown-unknown — a body not yet on the registry.
**Never a citation.**

## 4. Second axis: the calendar

Change detection catches the unexpected. Much of the real risk is **expected
but dated**, and needs its own register:

- known effective dates and transition deadlines
- questionnaire windows (CDP opens on an annual cycle)
- methodology version releases
- pending publications (CSCF)

Same registry, a `scheduled_events` companion. Feeds the same review ritual.
Has later customer-facing potential — a "what's coming for you" surface is a
natural extension once the data exists.

## 5. Feeds into §11

The `§11 Regs & Rules Watch` protocol already tracks 13 open items and is the
correct destination. **Monitoring is the intake; §11 is the register.** Do not
build a second tracker.

## 6. Build path

### Phase 0 — this week, zero build

Create the registry file and populate it. Create the dedicated inbox.
Subscribe to Tier 3 lists. Configure Tier 1 saved searches. Add the calendar
entries. Set a recurring weekly 20-minute review.

**This alone captures most of the value.**

### Phase 1 — small build, high value

A Vercel cron job hash-checking Tier 2 URLs into a `source_watch` table,
emailing a weekly digest of **deltas only**. Roughly a day's work. It is the
tier no free service covers, and it protects the hardcoded factors directly.

### Phase 2 — optional

AI triage over the digest: classify relevance, name the affected `source_id`
dependents. Same guardrail as the CBAM helper's Layer 4 — **it classifies and
routes; it never extracts a number.**

### Deliberately not

A scraping platform, a third-party regulatory-intelligence subscription, or
anything whose maintenance burden is disproportionate to a solo team.

## 7. Open items

- Populate the registry with **verified current URLs** — these must be checked,
  not recalled; several of these pages have moved historically.
- Confirm which Tier 3 bodies offer RSS versus mailing list only.
- Decide whether the calendar becomes a customer-facing surface later.
- Decide where the corpus review workflow referenced in
  `docs/cbam-customer-helper-design.md` §10 attaches — likely a `review_by`
  date on corpus entries keyed to `source_id`.
