# Phase 2 inventory — every `impact-materiality` / `impact_materiality` occurrence

Read-only sweep of the 28 named files, 26 Aug 2026. Nothing edited, staged or committed.

Categories: **LINK** (href or route path) · **KEY** (module_key string value or comparison) ·
**LOCAL** (local identifier — variable, tile id, object key) · **COPY** (user-visible text) ·
**COMMENT** (inside a code comment).

---

## The occurrences

app/order/page.tsx:32 KEY | `'impact-materiality': 'Impact Materiality Assessment',`

app/impact-materiality/page.tsx:3 COMMENT | `// app/impact-materiality/page.tsx`
app/impact-materiality/page.tsx:6 COMMENT | `// ROUTE. Named for the ModuleKey it sells ('impact-materiality', lib/pricing.ts:42), so URL,`
app/impact-materiality/page.tsx:57 KEY | `const impactPrice = FLAT_MODULE_PRICES['impact-materiality'].toLocaleString('en-US')`

app/methodology/page.tsx:212 COPY | `content: 'Physical-risk geography uses the IPCC Sixth Assessment Report (AR6) … The impact-materiality axis (CSRD mode) uses the ten ESRS topical standards: E1–E5 environmental, S1–S4 social, G1 governance.',`
app/methodology/page.tsx:224 COPY | `content: 'The Climate Risk & Materiality assessment is a structured screening … (b) stakeholder engagement informing the impact-materiality axis. …',`

app/dashboard/stakeholder/[id]/report/page.tsx:19 COMMENT | `* useEntitlement('impact-materiality') is what the worksheet routes use, and this route sits under`
app/dashboard/stakeholder/[id]/report/page.tsx:209 KEY | `const isPaid = useEntitlement('impact-materiality')`

app/dashboard/climate-risk/page.tsx:1076 COPY | `{mode === 'csrd' && <li style={{ marginBottom: 4 }}>Stakeholder engagement informing the impact-materiality axis, as ESRS requires.</li>}`

app/dashboard/materiality/worksheet/[id]/iro-1/page.tsx:91 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/worksheet/[id]/determinations/page.tsx:115 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/worksheet/[id]/register/page.tsx:196 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/worksheet/[id]/determine/page.tsx:133 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/worksheet/[id]/page.tsx:124 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/worksheet/page.tsx:60 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/assessment/new/page.tsx:40 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/assessment/[id]/edit/page.tsx:42 KEY | `const isPaid = useEntitlement('impact-materiality')`

app/dashboard/materiality/report/page.tsx:422 COMMENT | `// survey response or a finalisation. Moving this gate to 'impact-materiality' would take a`
app/dashboard/materiality/report/page.tsx:635 COPY | `{isCsrd && <li style={li}><strong>ESRS topical standards</strong> — the impact-materiality axis assesses the ten ESRS topical standards (E1–E5 environment, S1–S4 social, G1 governance).</li>}`
app/dashboard/materiality/report/page.tsx:877 COPY | `<p style={p}>The following inputs were provided by the user for this assessment: … and the per-topic impact-materiality self-assessment. …</p>`

app/dashboard/materiality/survey/[id]/respondents/import/page.tsx:52 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/survey/[id]/respondents/page.tsx:86 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/survey/[id]/scope/page.tsx:82 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/survey/[id]/results/page.tsx:183 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/survey/[id]/page.tsx:53 KEY | `const isPaid = useEntitlement('impact-materiality')`
app/dashboard/materiality/survey/page.tsx:57 KEY | `const isPaid = useEntitlement('impact-materiality')`

app/dashboard/page.tsx:18 LOCAL+KEY | `impact_materiality: 'impact-materiality',`  ⚠️ **both in one line** — `ID_TO_PRICE_KEY` maps the dashboard tile id (LOCAL, left) to the `FLAT_MODULE_PRICES` key (KEY, right)
app/dashboard/page.tsx:109 LOCAL | `id: 'impact_materiality',`
app/dashboard/page.tsx:239 LOCAL+KEY | `'impact-materiality': ['impact_materiality'],`  ⚠️ **both in one line** — `KEY_TO_CARD_IDS` maps module_key (KEY, left) to tile ids (LOCAL, right)

app/components/Nav.tsx:15 LINK | `{ href: '/impact-materiality', label: 'Impact Materiality', labelShort: 'Impact Materiality', sub: 'CSRD · ESRS 1 · ESRS 2 · stakeholder engagement' },`

app/components/HomePricing.tsx:14 COMMENT | `// ⚠️ id 'impact', NOT 'impact-materiality' — this id IS the LEGACY_PRICING_PAGE_ID shorthand`
app/components/HomePricing.tsx:18 LINK | `{ id: 'impact', name: 'Impact Materiality Assessment', frameworks: '…', href: '/impact-materiality' },`
app/components/HomePricing.tsx:32 COMMENT | `// point and the one gated on useEntitlement('impact-materiality').`

app/materiality/page.tsx:4 COMMENT | `// ThemisIQ — Materiality: the EXPLAINER AND ROUTER between /climate-risk and /impact-materiality.`
app/materiality/page.tsx:9 COMMENT | `// impact-materiality became its own $4,900 module (lib/pricing.ts:193). A page named after a`
app/materiality/page.tsx:18 COMMENT | `// ⚠️ THE TWO SAMPLES ARE BOTH CLIMATE-RISK OUTPUTS and belong here, not on /impact-materiality.`
app/materiality/page.tsx:148 COMMENT | `/impact-materiality on the same site. The IFRS S2 card beside it never drifted,`
app/materiality/page.tsx:219 COMMENT | `/impact-materiality's contents list is already a second copy of those twelve strings`
app/materiality/page.tsx:283 LINK | `<Link href="/impact-materiality#what-you-get" style={{…}}>See what is in it &rarr;</Link>`
app/materiality/page.tsx:321 LINK | `<Link href="/impact-materiality" style={{ color: '#fff', textDecoration: 'underline' }}>Impact Materiality Assessment</Link>`
app/materiality/page.tsx:331 COMMENT | `CSRD reporting" — and the fix is NOT to add 'impact-materiality' to that array.`
app/materiality/page.tsx:353 LINK | `<Link href="/impact-materiality" style={{ display: 'block', …}}>`

app/pricing/page.tsx:94 COMMENT | `// /impact-materiality, not here. Audience-style tag instead, as 'deals' uses.`
app/pricing/page.tsx:105 COMMENT | `// entry point and the one gated on useEntitlement('impact-materiality').`

lib/csrd.ts:7 COMMENT | `// /impact-materiality, written later, said the first reports cover FY2027 and are published in 2028`
lib/csrd.ts:16 COMMENT | `// app/impact-materiality/page.tsx states these facts in flowing prose at the paragraphs beginning`

lib/pricing.ts:40 COMMENT | `// backfill granting 'impact-materiality' to every 'climate-risk' holder. It did not, and the`
lib/pricing.ts:42 KEY | `| 'impact-materiality'`
lib/pricing.ts:53 KEY | `{ key: 'impact-materiality', name: 'Impact Materiality Assessment' },`
lib/pricing.ts:77 KEY | `impact: 'impact-materiality',`
lib/pricing.ts:193 KEY | `'impact-materiality': 4900,`

lib/pricing.test.ts:9 KEY | `'ghg', 'cbam', 'climate-risk', 'impact-materiality', 'supply-chain', 'people', 'deals',`

### Counts

| category | occurrences |
|---|---|
| KEY | 25 (2 of them sharing a line with LOCAL) |
| COMMENT | 16 |
| LINK | 5 |
| COPY | 5 |
| LOCAL | 3 (2 sharing a line with KEY) |

⚠️ **The two dual-category lines are the ones to read twice.** `app/dashboard/page.tsx:18` and
`:239` each hold a module_key on one side and a tile id on the other. A rename touching only the
underscore form, or only the hyphen form, breaks the mapping in a way nothing type-checks —
`:239`'s own comment says so: *"WITHOUT THIS A PAYING CUSTOMER SEES NO TILE. This map is not
type-checked against ModuleKey."*

⚠️ **The five COPY occurrences are not the module name.** All five use "impact-materiality" as the
name of an *axis* of double materiality (impact vs financial), not as the name of the product. Four
of them sit on climate-risk surfaces. Renaming the ModuleKey should not touch them; renaming them
would make the copy wrong.

---

## `app/dashboard/page.tsx:109` — how the `id` is consumed

**Purely in-render. It is never persisted, and never reaches the database or an API.**

`id: 'impact_materiality'` is a field on a `MODULES` array entry — the dashboard's own tile
catalogue. Its full lifecycle:

1. **Read at :239** — `KEY_TO_CARD_IDS` maps the entitlement's canonical `module_key`
   (`'impact-materiality'`) to a list of tile ids (`['impact_materiality']`).
2. **:246–250** — entitlement rows are mapped through that table into `cardIds`, then wrapped:
   `Array.from(cardIds).map((id) => ({ module_id: id }))`. **This object is synthesised in the
   browser.** There is no `module_id` column anywhere behind it; the shape is a leftover of an
   older subscriptions read, and the value is derived from the entitlement, not stored.
3. **:252** — `setSubscriptions(subs)`, React state only.
4. **Read back at :264, :270, :336, :357, :363, :421, :462** — to decide whether a tile renders
   unlocked, to count frameworks, as the React `key`, and at :421 to look up a locked-card price
   through `ID_TO_PRICE_KEY[mod.id]`.

So the underscore form is a display-layer identifier with three consumers, all in this one file.
Changing it requires changing :18, :109 and :239 together — and nothing else, because nothing
outside this file has ever seen it.

---

## `next.config` redirects

**There is no redirects block, and no rewrites block.** The whole file:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

`next.config.ts` is the only config file present. So if `/impact-materiality` becomes
`/double-materiality`, every one of the five LINK occurrences above is a hard 404 for anyone
holding the old URL — including the Nav entry at `Nav.tsx:15` and any external link or bookmark —
until a `redirects()` block is added. Nothing currently exists to inherit from.
