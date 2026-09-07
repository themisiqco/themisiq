# Product rename inventory — "Impact Materiality Assessment" → "Materiality Assessment"

Read-only sweep, 26 Aug 2026. Nothing edited, staged or committed.

    grep -rn -i "impact materiality" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v .next

**66 occurrences in 33 files.** The ModuleKey (`double-materiality`) and the routes are already
done; this is display text only.

| category | count | action |
|---|---|---|
| **PRODUCT** | 12 | renames |
| **PAYWALL** | 26 (13 titles + 13 bodies) | renames — extraction candidate, see (a) |
| **AXIS** | 15 | ⚠️ **must not rename** — renaming makes the copy factually wrong |
| **REPORT** | 7 | renames, but read the argument in (d) first |
| **COMMENT** | 6 | renames where the comment names the product |

---

## PRODUCT — names the module as a sellable thing

app/components/HomePricing.tsx:18 PRODUCT | `{ id: 'impact', name: 'Impact Materiality Assessment', frameworks: 'CSRD · ESRS 1 · ESRS 2 · stakeholder engagement · double materiality', href: '/materiality' },`
app/components/HomePricing.tsx:33 PRODUCT | `impact: { headline: 'Ready to run your impact materiality assessment?', btn: 'Start your assessment →', href: '/dashboard/materiality/worksheet' },`
app/components/Nav.tsx:15 PRODUCT | `{ href: '/materiality', label: 'Impact Materiality', labelShort: 'Impact Materiality', sub: 'CSRD · ESRS 1 · ESRS 2 · stakeholder engagement' },`
app/dashboard/page.tsx:110 PRODUCT | `name: 'Impact Materiality',`
app/materiality/page.tsx:109 PRODUCT | `Impact Materiality<br />`  ⚠️ **the h1**, two-tone with "Assessment" in the gradient span on :111
app/materiality/page.tsx:197 PRODUCT | `The ThemisIQ Impact Materiality Assessment covers the first half, end to end. The second half &mdash; the financial one &mdash; is{' '}`
app/materiality/page.tsx:327 PRODUCT | `<h2 style={sectionTitle}>Why ThemisIQ for your Impact Materiality Assessment</h2>`
app/materiality/page.tsx:582 PRODUCT | `The ThemisIQ Impact Materiality Assessment currently supports the revised ESRS standards, required for financial years beginning on or after 1 January 2027.`
app/order/page.tsx:32 PRODUCT | `'double-materiality': 'Impact Materiality Assessment',`
app/pricing/page.tsx:89 PRODUCT | `name: 'Impact Materiality Assessment',`
app/pricing/page.tsx:98 PRODUCT | `headline: 'Ready to run your impact materiality assessment?',`
lib/pricing.ts:53 PRODUCT | `{ key: 'double-materiality', name: 'Impact Materiality Assessment' },`

⚠️ **`lib/pricing.ts:53` is the authority and should move first.** `app/order/page.tsx:32` is a
second copy of the same string keyed on the same ModuleKey; `pricing/page.tsx:89` is a third. All
three must move together or the order page prints one name while the pricing page prints another.

⚠️ **`app/materiality/page.tsx:109-111` is a two-line construction**, not one string:
`Impact Materiality<br />` then `<span …gradient…>Assessment</span>`. Renaming means deciding what
carries the gradient — "Materiality" over "Assessment", or a single line. Not a find-and-replace.

---

## PAYWALL — gated-route PaywallCard title/body. Renames; see (a)

app/dashboard/materiality/assessment/[id]/edit/page.tsx:158 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/assessment/[id]/edit/page.tsx:159 PAYWALL | `body="Editing an assessment is part of the Impact Materiality Assessment."`
app/dashboard/materiality/assessment/new/page.tsx:89 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/assessment/new/page.tsx:90 PAYWALL | `body="Creating an assessment is part of the Impact Materiality Assessment."`
app/dashboard/materiality/survey/[id]/page.tsx:237 PAYWALL | `<PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/survey/[id]/page.tsx:238 PAYWALL | `body="Stakeholder surveys are part of the Impact Materiality Assessment. Unlock it to run a survey round, invite stakeholders, and gather their views as evidence for your materiality assessment."`
app/dashboard/materiality/survey/[id]/respondents/import/page.tsx:296 PAYWALL | `<PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/survey/[id]/respondents/import/page.tsx:297 PAYWALL | `body="Stakeholder surveys are part of the Impact Materiality Assessment."`
app/dashboard/materiality/survey/[id]/respondents/page.tsx:229 PAYWALL | `title="Unlock Impact Materiality"`
app/dashboard/materiality/survey/[id]/respondents/page.tsx:230 PAYWALL | `body="Stakeholder surveys are part of the Impact Materiality Assessment. Unlock it to run a survey round, choose which ESRS sub-topics are in scope, and gather stakeholder views as evidence for your materiality assessment."`
app/dashboard/materiality/survey/[id]/results/page.tsx:254 PAYWALL | `<PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/survey/[id]/results/page.tsx:255 PAYWALL | `body="Stakeholder survey results are part of the Impact Materiality Assessment. Unlock it to run a survey round and read what your stakeholders said."`
app/dashboard/materiality/survey/[id]/scope/page.tsx:300 PAYWALL | `title="Unlock Impact Materiality"`
app/dashboard/materiality/survey/[id]/scope/page.tsx:301 PAYWALL | `body="Stakeholder surveys are part of the Impact Materiality Assessment. Unlock it to run a survey round, choose which ESRS sub-topics are in scope, and gather stakeholder views as evidence for your materiality assessment."`
app/dashboard/materiality/survey/page.tsx:162 PAYWALL | `title="Unlock Impact Materiality"`
app/dashboard/materiality/survey/page.tsx:163 PAYWALL | `body="Stakeholder surveys are part of the Impact Materiality Assessment. Unlock it to run a survey round, choose which ESRS sub-topics are in scope, and gather stakeholder views as evidence for your materiality assessment."`
app/dashboard/materiality/worksheet/page.tsx:103 PAYWALL | `<PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/worksheet/page.tsx:104 PAYWALL | `body="The impact worksheet is part of the Impact Materiality Assessment. Unlock it to record ESRS severity determinations and share the work with colleagues."`
app/dashboard/materiality/worksheet/[id]/page.tsx:629 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/worksheet/[id]/page.tsx:630 PAYWALL | `body="The impact worksheet is part of the Impact Materiality Assessment."`
app/dashboard/materiality/worksheet/[id]/determine/page.tsx:545 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/worksheet/[id]/determine/page.tsx:546 PAYWALL | `body="The impact worksheet is part of the Impact Materiality Assessment."`
app/dashboard/materiality/worksheet/[id]/determinations/page.tsx:285 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/worksheet/[id]/determinations/page.tsx:286 PAYWALL | `body="The impact worksheet is part of the Impact Materiality Assessment."`
app/dashboard/materiality/worksheet/[id]/register/page.tsx:446 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/worksheet/[id]/register/page.tsx:447 PAYWALL | `body="The impact worksheet is part of the Impact Materiality Assessment."`
app/dashboard/materiality/worksheet/[id]/iro-1/page.tsx:204 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/materiality/worksheet/[id]/iro-1/page.tsx:205 PAYWALL | `body="The impact worksheet is part of the Impact Materiality Assessment."`
app/dashboard/stakeholder/[id]/report/page.tsx:615 PAYWALL | `<Shell><PaywallCard title="Unlock Impact Materiality"`
app/dashboard/stakeholder/[id]/report/page.tsx:616 PAYWALL | `body="The stakeholder board paper is part of the Impact Materiality Assessment."`

---

## AXIS — ⚠️ MUST NOT RENAME

Every line below uses "impact materiality" to mean **the impact half of double materiality** — the
inside-out axis, as against the financial outside-in axis. It is the ESRS term of art, not the
product. Renaming any of these makes the sentence false: "Materiality Assessment (inside-out)" is
not a thing, and "financial materiality plus materiality assessment" is nonsense.

app/api/impact-invite/route.ts:72 AXIS | `<div style="…">Impact materiality</div>`  *(contributor email eyebrow — the axis the contributor is judging)*
app/dashboard/climate-risk/page.tsx:489 AXIS | `Double materiality adds impact materiality to single (financial) materiality.`
app/dashboard/climate-risk/page.tsx:493 AXIS | `d: 'Financial materiality plus impact materiality across all ten ESRS topics, plotted on the double-materiality matrix.'`
app/dashboard/climate-risk/page.tsx:815 AXIS | `<h2 style={sectionHead}>Impact materiality</h2>`
app/dashboard/climate-risk/page.tsx:914 AXIS | `<text …>Impact materiality →</text>`  *(matrix x-axis label)*
app/dashboard/materiality/report/page.tsx:532 AXIS | `'CSRD / ESRS — financial and impact materiality screening across the ten ESRS topical standards.'`
app/dashboard/materiality/report/page.tsx:647 AXIS | `<h3 style={h3}>Impact materiality (inside-out)</h3>`
app/dashboard/materiality/report/page.tsx:649 AXIS | `<strong>Double materiality</strong> combines single (financial) materiality and impact materiality…`
app/dashboard/materiality/report/page.tsx:652 AXIS | `Under ESRS, impact materiality is a function of the <strong>severity</strong> of an impact…`
app/dashboard/materiality/report/page.tsx:691 AXIS | `…financial materiality (vertical) and impact materiality (horizontal).`
app/dashboard/materiality/report/page.tsx:707 AXIS | `…with their financial and impact materiality scores (0–10) and band.`
app/dashboard/materiality/report/page.tsx:1047 AXIS | `<text …>Impact materiality →</text>`  *(matrix x-axis label)*
app/materiality/page.tsx:205 AXIS | `<desc>Impact materiality and climate risk and materiality overlap as double materiality.</desc>`  *(Venn SVG accessible description)*
app/methodology/page.tsx:200 AXIS | `…CSRD ESRS double materiality, which retains the financial axis and adds impact materiality (how the entity affects people and the environment).`
app/dashboard/page.tsx:112 AXIS | `desc: 'Survey affected stakeholders, delegate sub-topics to named contributors, and record a defensible impact materiality determination.'`

⚠️ **`app/dashboard/page.tsx:110` and `:112` sit two lines apart and split across categories.**
`:110` is the tile's `name` (PRODUCT, renames); `:112` is its `desc` and describes the axis being
determined (AXIS, must not). A whole-file replace on this file is wrong.

⚠️ **Five of these already appear in `docs/phase2-inventory.md` as the "five COPY axis references"
that survived the ModuleKey rename** (`methodology:212`/`:224`, `dashboard/climate-risk:1076`,
`dashboard/materiality/report:635`/`:877`). Those use the hyphenated `impact-materiality` and did
not match this sweep's search string. **They are the same protected class and must be excluded from
this rename too.** Total protected: 15 here + 5 hyphenated = **20**.

---

## REPORT — the board report artifact. See (d) before changing

lib/materiality/boardReport.ts:551 REPORT | `export const TITLE = 'Impact materiality report'`
lib/materiality/boardReport.ts:2 REPORT | `* The impact materiality report — the content of it, assembled from work already done.`
lib/materiality/boardReport.ts:22 REPORT | `* can cite. "Impact materiality report" is what it is to all four.`
lib/materiality/boardReportPdf.ts:2 REPORT | `* The impact materiality report, rendered.`
lib/materiality/boardReport.test.ts:97 REPORT | `assessment_name: 'FY2026 impact materiality',`
lib/disclaimer.ts:13 REPORT | `// ISAE 3410"; its final page called itself a screening. The impact materiality report records`
lib/disclaimer.ts:34 REPORT | `//   lib/materiality/boardReportPdf.ts                (impact materiality report, back cover)`
app/materiality/page.tsx:488 REPORT | `The deliverable is the <strong>Impact materiality report</strong> &mdash; a board paper…`
app/dashboard/stakeholder/[id]/report/page.tsx:508 REPORT | `assessment_name: roundName ? \`Impact materiality · ${roundName}\` : 'Impact materiality',`

✔ **`TITLE` has one authority and two consumers**: declared at `boardReport.ts:551`, used at
`:1232` (`cover.title`) and asserted at `boardReport.test.ts:513`. Changing the constant changes
the printed cover and the test in one move — no other copy of the string is rendered.

---

## COMMENT

app/dashboard/materiality/assessment/new/page.tsx:7 COMMENT | `* that inserted a materiality_assessments row, so a customer holding Impact Materiality alone —`
app/dashboard/materiality/report/page.tsx:421 COMMENT | `// not because it belongs to the Impact Materiality module: nothing here reads a determination, a`
app/dashboard/materiality/worksheet/page.tsx:160 COMMENT | `Impact Materiality alone landed here with nothing to open and a link to a module`
app/materiality/page.tsx:41 COMMENT | `// display name is still 'Impact Materiality Assessment' (lib/pricing.ts MODULES). The merged`
app/pricing/page.tsx:102 COMMENT | `// lib/pricing.ts:53 names it 'Impact Materiality Assessment'.`
next.config.ts:6 COMMENT | `// ⚠️ THE FIRST REDIRECT IN THIS FILE. /impact-materiality was the Impact Materiality`

⚠️ **`app/materiality/page.tsx:41` and `app/pricing/page.tsx:102` both ASSERT the current name and
cite `lib/pricing.ts:53`.** Both go false the moment `:53` changes, and both are the notes a reader
would trust. `next.config.ts:6` is history and should keep the old name in its historical clause.

---

# (a) PAYWALL — the exact distinct strings

**One title, thirteen uses, no variants:**

    "Unlock Impact Materiality"

**Seven distinct bodies.** Four are one sentence; three carry a second "Unlock it to…" sentence:

| # | uses | body |
|---|---|---|
| B1 | 5 | `The impact worksheet is part of the Impact Materiality Assessment.` |
| B2 | 1 | `The impact worksheet is part of the Impact Materiality Assessment. Unlock it to record ESRS severity determinations and share the work with colleagues.` |
| B3 | 3 | `Stakeholder surveys are part of the Impact Materiality Assessment. Unlock it to run a survey round, choose which ESRS sub-topics are in scope, and gather stakeholder views as evidence for your materiality assessment.` |
| B4 | 1 | `Stakeholder surveys are part of the Impact Materiality Assessment. Unlock it to run a survey round, invite stakeholders, and gather their views as evidence for your materiality assessment.` |
| B5 | 1 | `Stakeholder surveys are part of the Impact Materiality Assessment.` |
| B6 | 1 | `Stakeholder survey results are part of the Impact Materiality Assessment. Unlock it to run a survey round and read what your stakeholders said.` |
| B7 | 1 | `Editing an assessment is part of the Impact Materiality Assessment.` / `Creating an assessment is part of the Impact Materiality Assessment.` *(two near-identical singles)* |

**Observations for the constant's shape:**

- Every body is `<what this screen does> is part of the <PRODUCT NAME>.` optionally followed by
  `Unlock it to <capabilities>.` — a **two-part shape**, not one string.
- **B3 and B4 differ by four words** and gate near-identical screens (survey scope vs survey
  round). B5 is B3 with the second sentence dropped, on the import screen. That inconsistency is
  almost certainly accidental drift, not design.
- **B1 appears five times, unchanged.** The five worksheet routes all say exactly the same thing.
- The phrase **"your materiality assessment"** (lowercase, generic) appears inside B3 and B4 and is
  NOT the product name — it means the exercise. After the rename those bodies would read
  "…part of the Materiality Assessment. Unlock it to … as evidence for your materiality
  assessment." **The same words twice, meaning two different things, in one paragraph.** This is
  the strongest argument for rewriting the bodies rather than find-and-replacing them.

**Where the constant should live.** `lib/pricing.ts` already owns `MODULES[].name`, so the product
name has an authority; a paywall constant should READ it rather than restate it. Suggested shape,
for a decision rather than as a proposal:

    lib/paywallCopy.ts   — PAYWALL_TITLE (derived from MODULES) + a per-surface capability clause

Not `lib/pricing.ts` itself: that file is the pricing/entitlement authority and CLAUDE.md keeps it
narrow. Not a component default: `PaywallCard` is shared with GHG, CBAM and the other modules, and
a default naming one product would be wrong for the rest.

---

# (b) Could not categorise confidently

**1. `app/dashboard/stakeholder/[id]/report/page.tsx:508` — filed REPORT, arguably AXIS.**

    assessment_name: roundName ? `Impact materiality · ${roundName}` : 'Impact materiality'

This is a *label for the assessment*, not the report's title and not the product name. It reads as
the axis ("this is the impact-materiality work") but it is displayed as the name of a deliverable.
Renaming it gives "Materiality assessment · FY2026", which is fine; leaving it gives an axis name
in a slot expecting a document name. **Needs a decision, not a category.**

**2. `app/api/impact-invite/route.ts:72` — filed AXIS, but it is customer-facing email.**
The eyebrow above a contributor's invitation. The contributor is judging the impact axis, so AXIS
is right — but this is the one AXIS occurrence a **non-customer** reads, with no surrounding
double-materiality context to make the term land. Worth a copy decision independent of the rename.

**3. `lib/materiality/boardReport.test.ts:97` — a fixture, not display text.**
`assessment_name: 'FY2026 impact materiality'`. Renaming is harmless; leaving it is harmless. Filed
REPORT because it mirrors the artifact naming, but it asserts nothing.

---

# (c) Collisions with "Materiality Assessment"

**Four existing uses of the target name. None is a hard collision; two need a decision.**

| location | text | verdict |
|---|---|---|
| `app/page.tsx:133` | `The Materiality Assessment` | **Already the target name**, on the homepage capability strip. After the rename, homepage and product agree — this becomes *more* correct, not less. |
| `app/materiality/page.tsx:264` | `Materiality Assessment` | The "you are here" card in section 4, written during the merge. Already the target name. ✔ |
| `app/materiality/page.tsx:4` | `// ThemisIQ — the Materiality Assessment module page.` | Comment, already the target name. ✔ |
| `app/api/materiality/route.ts:2` | `// ThemisIQ — Materiality assessment API route.` | Comment, generic. ✔ |

**`app/methodology/page.tsx` — the one to watch, and it is a NAME collision, not a text one.**

That page's sections are keyed on a `module:` field. `:193` is **`module: 'Climate Risk &
Materiality'`** — the OTHER module, under its pre-rename name, and it is the section that owns the
screening methodology. Two consequences:

1. **A new "Materiality Assessment" entry would sit beside "Climate Risk & Materiality"** and the
   two would be near-indistinguishable in a contents list. The `& Materiality` drop is already
   scoped for climate-risk's marketing pages but **has not been applied to `methodology:193`,
   `:224` or `:135`** — those still say "Climate Risk & Materiality". Doing the methodology entry
   before dropping `& Materiality` there produces two adjacent sections whose names differ by one
   word.
2. `:224`'s limitations text describes the *screening's* limits and explicitly names
   *"stakeholder engagement informing the impact-materiality axis"* as something it does NOT do —
   which is the new module's whole subject. When the Materiality Assessment entry lands, that
   sentence should point at it rather than leaving the reader at a dead end.

**Recommended order:** drop `& Materiality` from methodology's three lines → rename the product →
add the methodology entry. Doing the rename first leaves "Materiality Assessment" and "Climate Risk
& Materiality" as siblings for however long the gap lasts.

**No collision** with `materiality_assessments` (the DB table), `/materiality` (the route) or
`ModuleKey 'double-materiality'` — different identifier spaces, none display text.
