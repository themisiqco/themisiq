import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// THREE SURFACES, ONE SET OF FACTS, THREE DIFFERENT REGISTERS.
//
// The AI disclosure is published on /trust (a numbered principle), on /calculate-emissions (a
// FAQPage JSON-LD answer that Google may surface as a rich result) and on /privacy (a row in the
// subprocessor table). They are deliberately NOT a shared string: a principle, an FAQ answer and a
// table cell read correctly in different registers, and flattening them to one sentence would make
// at least one of the three read wrong.
//
// What must not differ is the FACTS. This file asserts the facts and says nothing about the words,
// so an author can rewrite any of the three freely and will only be stopped if a rewrite drops
// something. Each fact accepts several phrasings for exactly that reason.
//
// ⚠️ THE EXTRACTORS ARE LOAD-BEARING. 'Concierge' appears nine times in calculate-emissions/page.tsx
// and 'GHG guide' twice. A scan over the whole file would pass on text from somewhere else on the
// page while the disclosure itself said nothing. Each extractor pulls one exact string and throws if
// its anchor has moved, so a relocated disclosure fails loudly instead of passing vacuously.

const ROOT = process.cwd()

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** The `content` of the PRINCIPLES entry titled 'Where we use AI'. */
function trustPrinciple(): string {
  const src = read('app/trust/page.tsx')
  const lines = src.split('\n')
  const at = lines.map((l, i) => [l, i] as const).filter(([l]) => l.trimStart().startsWith("title: 'Where we use AI'"))
  if (at.length === 0) throw new Error("app/trust/page.tsx: no principle titled 'Where we use AI' — it was renamed or removed")
  if (at.length > 1) throw new Error(`app/trust/page.tsx: ${at.length} principles with that title — anchor is ambiguous`)
  const body = lines.slice(at[0][1], at[0][1] + 6).find(l => l.trimStart().startsWith('content:'))
  if (!body) throw new Error("app/trust/page.tsx: 'Where we use AI' has no content line within 5 lines of its title")
  return body
}

/** The FAQPage JSON-LD answer text for 'Is my data secure?'. */
function jsonLdSecurityAnswer(): string {
  const src = read('app/calculate-emissions/page.tsx')
  const lines = src.split('\n')
  // Anchored on the JSON-LD FIELD, not the bare question text. The string 'Is my data secure?' also
  // occurs in the visible <summary> further down the page and in the comment above FAQ_LD, and an
  // earlier draft of this extractor matched the comment and reported the answer missing entirely.
  const at = lines
    .map((l, i) => [l, i] as const)
    .filter(([l]) => l.trimStart().startsWith('name: "Is my data secure?"'))
  if (at.length === 0) throw new Error("app/calculate-emissions/page.tsx: no JSON-LD question field 'Is my data secure?'")
  if (at.length > 1) throw new Error(`app/calculate-emissions/page.tsx: ${at.length} such JSON-LD questions — anchor is ambiguous`)
  const body = lines.slice(at[0][1], at[0][1] + 6).find(l => l.trimStart().startsWith('text:'))
  if (!body) throw new Error("app/calculate-emissions/page.tsx: 'Is my data secure?' has no answer text within 5 lines")
  return body
}

/** The Anthropic row of the §5 data-sharing table. */
function privacySubprocessorRow(): string {
  const src = read('app/privacy/page.tsx')
  const hits = src.split('\n').filter(l => l.trimStart().startsWith("['Anthropic',"))
  if (hits.length === 0) throw new Error('app/privacy/page.tsx: no Anthropic row in the data-sharing table')
  if (hits.length > 1) throw new Error(`app/privacy/page.tsx: ${hits.length} Anthropic rows — anchor is ambiguous`)
  return hits[0]
}

interface Fact {
  id: number
  name: string
  /** Any one of these matching is enough. Phrasing is free; the fact is not. */
  accepts: RegExp[]
  why: string
}

const FACTS: Fact[] = [
  {
    id: 1,
    name: 'Anthropic is named as the AI provider',
    accepts: [/\bAnthropic\b/],
    why: 'a customer cannot assess an AI subprocessor we decline to name',
  },
  {
    id: 2,
    name: 'Concierge document reading is named as a use',
    accepts: [/Concierge[^']*?(read|figures|bills|documents|tabulat)/i, /(read|figures|bills|documents)[^']*?Concierge/i],
    why: 'this is the use that sends a customer document off our infrastructure, so it is the one that matters most',
  },
  {
    id: 3,
    name: 'The GHG guide is named as a use',
    accepts: [/GHG guide/i, /GHG assistant/i],
    why: 'the second of the two uses; naming one and not the other understates the footprint',
  },
  {
    id: 4,
    name: 'The exactly-two-places claim is stated',
    accepts: [/exactly two places/i, /\btwo places\b/i, /only two\b/i],
    why: 'without a count, "we use AI here and here" does not exclude a third use the reader has not been told about',
  },
  {
    id: 5,
    name: 'The step-of-the-wizard disclosure appears',
    accepts: [/which step/i, /step of the wizard/i],
    why: 'the GHG guide transmits more than the typed question, and a reader who is told only about the question is told less than the route sends',
  },
]

interface Surface {
  label: string
  file: string
  extract: () => string
  /** Fact ids this surface must carry. */
  carries: number[]
  /** Fact ids deliberately absent here, with the reason, so an omission is a decision and not a gap. */
  exempt: Record<number, string>
}

const SURFACES: Surface[] = [
  {
    label: '/trust principle "Where we use AI"',
    file: 'app/trust/page.tsx',
    extract: trustPrinciple,
    carries: [1, 2, 3, 4, 5],
    exempt: {},
  },
  {
    label: '/calculate-emissions FAQPage JSON-LD, "Is my data secure?"',
    file: 'app/calculate-emissions/page.tsx',
    extract: jsonLdSecurityAnswer,
    carries: [1, 2, 3, 4, 5],
    exempt: {},
  },
  {
    label: '/privacy §5 subprocessor table, Anthropic row',
    file: 'app/privacy/page.tsx',
    extract: privacySubprocessorRow,
    carries: [1, 2, 3],
    exempt: {
      4: 'The table is structural: one row per recipient, and the count of AI uses is not a property ' +
         'of the Anthropic row. A reader counts the uses by reading the Purpose cell.',
      5: 'Proposed, not asserted — see the note at the foot of this file.',
    },
  },
]

describe('the AI disclosure carries the same facts on every surface', () => {
  for (const surface of SURFACES) {
    describe(surface.label, () => {
      it('S0 the extractor found its anchor', () => {
        const text = surface.extract()
        expect(text.length, `${surface.file}: extracted text is implausibly short`).toBeGreaterThan(40)
      })

      for (const fact of FACTS) {
        const required = surface.carries.includes(fact.id)
        const exemption = surface.exempt[fact.id]

        if (!required) {
          it(`F${fact.id} ${fact.name} — deliberately absent`, () => {
            expect(exemption, `fact ${fact.id} is neither carried nor exempt on ${surface.label}`).toBeTruthy()
          })
          continue
        }

        it(`F${fact.id} ${fact.name}`, () => {
          const text = surface.extract()
          const matched = fact.accepts.some(re => re.test(text))
          expect(
            matched,
            `MISSING FACT ${fact.id} on ${surface.label} (${surface.file}).\n` +
            `  Fact: ${fact.name}\n` +
            `  Why it must be there: ${fact.why}\n` +
            `  Accepted phrasings (any one): ${fact.accepts.map(String).join('  |  ')}\n` +
            '  The three surfaces are deliberately worded differently and are NOT a shared string.\n' +
            '  Reword freely; do not drop a fact. If the fact genuinely does not belong on this\n' +
            '  surface, add it to that surface\'s `exempt` map with the reason, so the omission is\n' +
            '  a recorded decision rather than an oversight.',
          ).toBe(true)
        })
      }
    })
  }

  it('every fact is accounted for on every surface', () => {
    // Guards the table itself: a fact added to FACTS but to no surface would otherwise be checked
    // nowhere at all.
    for (const s of SURFACES) {
      for (const f of FACTS) {
        const known = s.carries.includes(f.id) || f.id in s.exempt
        expect(known, `fact ${f.id} (${f.name}) is neither carried nor exempt on ${s.label}`).toBe(true)
      }
    }
  })
})

// ── OPEN PROPOSAL: should /privacy carry fact 5? ────────────────────────────────────────────────
//
// Recommendation: YES, and it is the surface with the strongest claim to it.
//
// /privacy §5 is the only one of the three that purports to enumerate WHAT IS SENT rather than what
// the feature does. Its "Data shared" cell reads "Structured prompts; uploaded source documents
// (Concierge)". "Structured prompts" is doing real work there: it is broad enough to cover the step
// index, but a reader cannot tell that from it, and the same reader can go to /trust and learn that
// the wizard step is transmitted. A privacy policy that is vaguer than the marketing page about the
// contents of a transmission is the wrong way round, and under GDPR Art. 13 the categories of data
// disclosed to a processor are exactly what that section exists to state.
//
// It is left unasserted because changing a published privacy policy is a version bump (currently
// v2.2, with a snapshot under docs/policy-snapshots/), not a code change, and that is not a decision
// to take from inside a test file. If it is adopted: change "Structured prompts" to name the step,
// bump the version, snapshot it, then move fact 5 from `exempt` into `carries` for /privacy.
