# The 2026 colourway — the target values for the palette swap

Recorded 25 Sep 2026, as the first act of step 6, **before any token moves**.

⚠️ **WHY THIS FILE EXISTS.** Until now these twenty values lived only in a chat message. A swap whose
targets are not in the repo cannot be reviewed in a diff, cannot be asserted by
`lib/tokenContrast.test.ts`, and cannot be re-derived if a session is lost — which is exactly what
happened between step 4 and step 6, when the values were needed to close an arithmetic question and were
gone. This file is the record. It states the **target**; `app/styles/themisiq-tokens.css` remains the
authority for what is **live**, and the two will disagree for the duration of the swap.

---

## ⚠️ STEP 6 IS ON HOLD. NO MODULE VALUE MOVES UNTIL THIS IS ANSWERED.

Held 25 Sep 2026, on the strength of the measurements below. Three facts, stated plainly, because they
changed the decision and the decision had already been taken once:

1. **Today all eight module values clear WCAG AA body contrast (4.5:1) on white. After the swap, one
   does.** Climate Risk `#004AAD` at 8.13:1 is the only survivor. GHG `#0097B2` reaches 3.46:1; the
   remaining six sit between 2.85:1 and 1.33:1.

2. **Five of the eight fail the 3:1 non-text threshold as well, so they cannot carry a meaningful rule,
   icon, chart series or focus ring** — not merely text. `-ink` companions do nothing for any of those.
   Cyber `#67B8C1` 2.28:1, Supply Chain `#7ED957` 1.76:1, Deals `#BEC4ED` 1.71:1, CBAM `#A9D2D7` 1.63:1,
   People `#FFDE59` 1.33:1. Decorative accents are exempt under WCAG 1.4.11; anything that tells the
   reader which module they are in is not.

3. **The six planned companions address text only, and the two modules with no companion by decision are
   the worst and third-worst values in the set** — People `#FFDE59` at 1.33:1 and AI Governance `#F47068`
   at 2.85:1. Identity-only was decided for a legibility reason unrelated to contrast, before these
   numbers existed. It now means those two modules would have no legible text colour AND no legible
   graphic colour, with no escape hatch, which is a stronger constraint than "stays off text" and should
   be confirmed rather than inherited.

## The palette as given

| Band | Values |
|---|---|
| **Primaries** | `#0097B2` · `#FFDE59` · `#7ED957` · `#004AAD` |
| **Secondaries** | `#67B8C1` · `#A9D2D7` · `#F47068` · `#BEC4ED` |
| **Gradation** | `#FFDE59` → `#7ED957` → `#0097B2` → `#004AAD` |

The gradation is a genuine ordered ramp, and it is the only ordered thing in the set. Measured:

| | Hue | Lightness | On white |
|---|---|---|---|
| `#FFDE59` | 48° | 67.5% | 1.33:1 |
| `#7ED957` | 102° | 59.6% | 1.76:1 |
| `#0097B2` | 189° | 34.9% | 3.46:1 |
| `#004AAD` | 214° | 33.9% | 8.13:1 |

Hue and lightness both move monotonically for the first three steps; the fourth holds lightness and turns
the hue. Note the ramp runs **light to dark**, so anything drawn from it inherits its contrast from its
position — the first two steps cannot carry text or a meaningful graphic at all.

## Module assignment

| Module | Target | Current |
|---|---|---|
| GHG Emissions | `#0097B2` | `#095C6B` |
| Climate Risk | `#004AAD` | `#A94E0D` |
| Supply Chain | `#7ED957` | `#AF3790` |
| CBAM | `#A9D2D7` | `#1C5EAA` |
| Deals & Investment | `#BEC4ED` | `#754CAA` |
| AI Governance | `#F47068` | `#136C3D` |
| Cyber Governance | `#67B8C1` | `#A41A3B` |
| People & Workforce | `#FFDE59` | `#7B630D` |

**AI Governance and People & Workforce are identity-only by decision** and get no `-ink` companion. That
decision is asserted by `IDENTITY_ONLY` in `lib/tokenContrast.test.ts`, which fails if a companion is
declared for either. It is not a contrast decision: see that file's comment for the reason.

---

## ⚠️ MEASURED: SEVEN OF THE EIGHT MODULE VALUES CANNOT CARRY TEXT, AND FIVE CANNOT CARRY A GRAPHIC

Every value against `--color-paper` `#FFFFFF`. WCAG AA body is 4.5:1, AA large text is 3.0:1 (≥24px
regular or ≥18.66px bold), and 1.4.11 non-text is 3.0:1 for a meaningful graphic or UI boundary.

| Module | Target | On white | Body 4.5 | Large 3.0 | Non-text 3.0 | Current, for comparison |
|---|---|---|---|---|---|---|
| Climate Risk | `#004AAD` | **8.13** | PASS | PASS | PASS | 5.55 |
| GHG | `#0097B2` | **3.46** | FAIL | PASS | PASS | 7.62 |
| AI Governance | `#F47068` | **2.85** | FAIL | FAIL | FAIL | 6.48 |
| Cyber | `#67B8C1` | **2.28** | FAIL | FAIL | FAIL | 7.53 |
| Supply Chain | `#7ED957` | **1.76** | FAIL | FAIL | FAIL | 5.57 |
| Deals | `#BEC4ED` | **1.71** | FAIL | FAIL | FAIL | 6.23 |
| CBAM | `#A9D2D7` | **1.63** | FAIL | FAIL | FAIL | 6.50 |
| People | `#FFDE59` | **1.33** | FAIL | FAIL | FAIL | 5.78 |

**Today all eight clear body AA. After the swap, one does.** This is the central fact about the swap and
everything else in step 6 follows from it.

Three consequences, none of them optional:

1. **`-ink` companions become mandatory, not a nicety.** `PENDING_STEP_6` in
   `lib/tokenContrast.test.ts` lists six modules needing one. Six is right, but the reason is now
   stronger than when that list was written: without a companion those modules have **no legible text
   colour at all**, not merely a tight one.
2. **The non-text failures are the part nobody has planned for.** Five values are below 3:1 on white,
   so they cannot carry a *meaningful* 4px rule, icon, chart series or focus ring either — a companion
   fixes text and does nothing for those. `#FFDE59` at 1.33:1 is effectively invisible on white.
   Decorative accents are exempt under 1.4.11; anything that identifies which module you are in is not.
3. **The two identity-only modules are the two with no escape hatch.** People `#FFDE59` at 1.33:1 and
   AI Governance `#F47068` at 2.85:1 are the worst and third-worst in the set, and by decision neither
   gets a companion. That is coherent only if their identity value is never used for text OR for a
   meaningful graphic. Worth confirming that is what was meant, because it is a stronger constraint
   than "stays off text".

## ⚠️ Two genuine collisions in the target set

A collision is **same hue AND same lightness** — two names for one colour. Contrast ratio alone does not
detect it: it measures lightness only, so `#B91C1C` against `#0F6E56` scans as 1.04:1 while being red
against green. The test below is hue within 20° *and* contrast under 1.5:1.

| | | Hue apart | Ratio |
|---|---|---|---|
| `--color-module-climate` `#004AAD` | `--color-state-info` `#0C447C` | 4.3° | **1.21:1** |
| `--color-module-cbam` `#A9D2D7` | `--color-module-cyber` `#67B8C1` | 0.5° | **1.40:1** |

Both are recorded as step-6 decisions in `docs/backlog.md`. Deliberately **not** collisions, listed so
they are not mistaken for some: GHG/CBAM 2.12:1, GHG/Cyber 1.52:1, AI/state-error 2.27:1,
Climate/Deals 4.77:1 — same hue family, separated by lightness.

## Still not recorded

**The incoming `--color-brand` value.** Today `--color-brand` and `--color-module-ghg` hold the same
value, `#095C6B`, so `#0097B2` is the natural inference — but it is an inference, and it matters: at
**3.46:1 on white and 2.89:1 on the darkest wash**, a brand token holding `#0097B2` could not be used
for body text anywhere, and `--color-brand` is currently set on text in many places. Confirm before the
swap.

**Every wash.** The colourway gives eight module colours and no washes. There are eight `-wash` tokens to
re-derive, and `lib/tokenContrast.test.ts` asserts each is a tint (≤1.25:1 against paper) with body text
legible on it. A wash derived from `#FFDE59` or `#7ED957` needs checking against the tint ceiling, not
assumed.

---

# Two approaches considered and REJECTED, with the arguments

Recorded 25 Sep 2026. **Whoever revisits this needs the argument, not the outcome.** Both were reasonable
readings of the problem and both were rejected on evidence rather than taste.

## REJECTED: swap the colourway into the product as-is

The original step 6. It fails on the table above: after the swap exactly one of eight module values clears
body AA, five cannot carry a meaningful graphic, and **seven of eight cannot carry the white text that sits
on them today** — the sticky compliance bar on six marketing pages and five dashboard pages is
`background: var(--color-module-X)` with `color: '#fff'`. `#FFDE59` against white is 1.33:1.

⚠️ **THE `-ink` COMPANION PLAN DOES NOT RESCUE IT, AND THAT WAS THE ASSUMPTION.** A companion fixes text
set *in* the module colour. It does nothing for text set *on* the module colour, for the 6px identity bar,
for an icon, or for a chart series. Those need the fill itself to clear 3:1 or 4.5:1, and five do not.

## REJECTED: split the palette — colourway for marketing, a text-safe palette for the product

Proposed on the reasoning that `lib/pdf/palette.ts` already keeps a separate palette for print. Rejected
for four reasons, in order of weight:

1. **BOTH MEASURED FAILURES WERE ALREADY ON A MARKETING PAGE.** The two homepage warming figures were
   28px at 1.63:1 and 2.28:1, on `app/page.tsx`. A marketing/product split would have moved the colourway
   to exactly where the failures were and called it resolved. WCAG has no marketing exemption, a public
   site is the most exposed surface there is, and shipping an unreadable homepage while selling compliance
   software is its own problem.

2. **`lib/pdf/palette.ts` IS THE PRECEDENT FOR ONE PALETTE, NOT TWO.** Read it: `MUTED = INK_MUTED` is
   imported from `lib/brand.ts`, with the comment *"IMPORTED, NOT RETYPED — declaring the hex again here
   would put it outside that check."* It declares two values of its own, `PAPER #f8f7f5` and `INK #0d0d0d`,
   because the medium forces them, and imports the rest. Its own comment records moving *away* from a
   print-only grey: *"one role now has one value across all three output formats instead of a screen grey
   and a print grey that happened to agree on nothing but their intent."* It is a two-value exception
   inside one palette, built to stay inside the drift check.

3. **THE TWO MEDIA CANNOT MIX; THESE TWO SURFACES CANNOT BE SEPARATED.** A PDF is generated once, has one
   ground, no cascade, and jsPDF cannot read a custom property. Marketing and product share the browser,
   the cascade, the fonts, `ThemisIQLogo`, the nav, the footer and the buttons, and a user crosses the line
   inside one session. A split whose halves share components is one palette with a conditional.

4. **THE BOUNDARY HAS NO CLEAN LINE.** There are no route groups: 39 marketing and 39 product pages sit
   flat under `app/` with one root layout. And four pages are public token-gated URLs with no login —
   `app/verify/[token]`, `app/verify-cbam/[token]`, `app/supplier/[token]`, `app/survey/[token]` — which
   any route rule puts on the marketing side while their readers are **auditors cross-checking figures**.
   `/methodology`, `/trust`, `/security` and `/frameworks` carry compliance claims; `/pricing` renders
   charged prices. Each needs a hand-written exception, and an exception list is what the rule was for.

⚠️ **AND THE DECIDING TECHNICAL POINT: A PER-SCOPE CONTRAST RULE HAS NOTHING TO SAY.** For a split to buy
anything, the marketing scope needs a *different* rule. But "text clears 4.5:1 on its ground" still holds
there, so the marketing module values still could not be text. The only rule that genuinely differs is
*"this value is never set on text or on a meaningful graphic"* — which is not a scope rule at all. **It is
a role rule, and it needs no scopes.** That is what was adopted instead.

## ADOPTED: one family, fill versus text, the same rule everywhere

The module value is a **fill** — backgrounds, washes, large decorative areas, gradients, illustration. Each
has a **text-safe companion** for anything read or anything carrying meaning as a graphic. One rule
everywhere, so there is nothing to keep in sync, no boundary, no exception list, and shared components need
no knowledge of where they render. `lib/tokenContrast.test.ts` already asserts it.

---

# The five companions, as measured

Recorded 25 Sep 2026. **Five, not six** — `climate` `#004AAD` measures 8.13:1 on paper and needs none. It
sits in `NEEDS_NO_INK` in `lib/tokenContrast.test.ts`, which fails if a companion is declared for it.

Each companion holds its fill's hue and saturation exactly and lowers lightness until it clears 4.5:1 on
paper **and** on its own wash. The washes are derived here too, because the colourway supplies none and
"against its own wash" is undefined without one; all sit at ~1.12:1 against paper, inside the 1.25 tint
ceiling the test asserts.

| Module | Fill | Wash | `-ink` | On paper | On wash | Reads as its module? |
|---|---|---|---|---|---|---|
| GHG | `#0097B2` | `#E9F4F7` | `#00798F` | 5.08 | 4.54 | **yes**, 1.47:1 from the fill |
| Supply Chain | `#7ED957` | `#DFFAD3` | `#397D1C` | 5.09 | 4.55 | no, 2.90:1 — lime to forest |
| CBAM | `#A9D2D7` | `#EEF3F3` | `#3B777F` | 5.08 | 4.54 | no, 3.12:1 — 75% to 36% lightness |
| Deals | `#BEC4ED` | `#F1F2F6` | `#5665D0` | 5.04 | 4.50 | no, 2.95:1 — pastel to saturated |
| Cyber | `#67B8C1` | `#EEF3F3` | `#347880` | 5.07 | 4.52 | borderline, 2.22:1 |

Hue is preserved to within 0.6° in every case, so the arithmetic is not the difficulty.

## ⚠️ GHG, CBAM AND CYBER SHARE ONE COMPANION COLOUR, BY CONSTRUCTION

| | | Hue apart | Ratio |
|---|---|---|---|
| `ghg-ink` `#00798F` | `cbam-ink` `#3B777F` | 2.2° | **1.00:1** |
| `ghg-ink` `#00798F` | `cyber-ink` `#347880` | 2.9° | **1.00:1** |
| `cbam-ink` `#3B777F` | `cyber-ink` `#347880` | 0.7° | **1.00:1** |

The three fills sit inside 3° of hue — 189.1°, 186.5°, 186.0°. Darkening all three to the **same contrast
target** necessarily converges them on one teal. This is not a tuning failure and no amount of care with the
values fixes it: three modules whose identities are three degrees apart cannot have three distinguishable
companions at one contrast target. **Three modules, one text colour.**

### The lightness-separated alternative was tried and rejected

Same three hues, different contrast targets — 4.5 / 7.0 / 11.0 on paper:

`cbam #3F8088` (4.51:1) · `cyber #2A6167` (6.99:1) · `ghg #00434F` (10.96:1)

Pairwise separation **1.55, 1.57 and 2.43:1**. It technically clears the 1.5 threshold, and it should not
ship, for three reasons:

1. **Two of the three pairs clear the threshold by 0.05.** A guard with 3% headroom is not a guard.
2. **The only separating channel is lightness**, so a viewer has to see two of them side by side to tell
   which module they are looking at. Module colour exists to answer "which product am I in" without a
   comparison to hand.
3. **It buys separation by destroying the thing the companion was for.** GHG's companion at 10.96:1 is
   nearly black — 3.17:1 from `#0097B2`, so it stops reading as GHG in order to stop reading as CBAM.

⚠️ **DO NOT RE-DERIVE THIS.** Any method that preserves each fill's hue and targets a contrast floor lands
back on the same three teals, because the input hues are 3° apart. The only real fixes are outside the
companion scheme: change one of the three fills' hue, or accept that these three modules are distinguished
by name and position rather than by colour.

---

# ⚠️ WHY THE PREPARATION COULD NOT BE LANDED EARLY

Recorded 25 Sep 2026, after attempting exactly that. The bar inversion and the companion declarations look
like independent groundwork that could ship ahead of the swap and de-risk it. **They cannot. Both are WRONG
against the current values and only become right when the values move.**

| | | |
|---|---|---|
| **The bar inversion** | `--color-ink` on `--color-module-people` `#7B630D` | **2.68:1 — FAILS** |
| | `--color-ink` on `--color-module-ai` `#136C3D` | **2.31:1 — FAILS** |
| | `--color-ink` on `#FFDE59` (target) | 13.23:1 — passes |
| **The companions** | `#00798F` against `--color-module-ghg` `#095C6B` | **1.30:1 — indistinguishable** |

Today's module values are dark, so **white** is the correct text on the eleven sticky bars and `--color-ink`
is wrong. That reverses precisely when the values become light. Inverting early would break eleven working
bars. And `#00798F` against today's GHG teal is 1.30:1 — a token holding a near-duplicate of the value it
exists to darken, doing nothing at all until the swap.

**So the swap is one commit, or an immediate succession of them: values, bar inversion, companion
declarations, and the `--tq-mod` strip for the two identity-only modules, together.**

What *was* landed early is the machinery that makes a half-done version fail:
`lib/tokenContrast.test.ts` now asserts that whatever `--tq-mod` resolves to can carry the 4.5:1 text and
the 3.0:1 identity bar it feeds, that any module whose fill cannot carry text has a companion unless it is
`IDENTITY_ONLY`, and that a declared companion is actually wired into its `[data-module]` block rather than
left unused. All three pass today and all three fire during the swap.

⚠️ **AND A CORRECTION WORTH KEEPING, because it nearly caused a regression.** This was reported on
25 Sep 2026 as a *live* defect — People and AI Governance summaries rendering invisible text — and it was
not live. `#7B630D` measures **5.78:1** and `#136C3D` **6.48:1**; both render correctly today. The 1.33:1
and 2.85:1 figures behind the report were the *incoming* values applied to today's code path. Stripping
`--tq-mod` from those two blocks then would have removed a working identity colour from three summary
blocks in exchange for nothing. **The defect is the combination of a light value and a live `--tq-mod`, and
a combination is something to assert, not to pre-empt.**
