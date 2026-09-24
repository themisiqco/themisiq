import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assuranceForLine, carriesThirdPartyAssurance, assuranceContradictsFigure,
  assuranceLabel, assuranceStatement, assuranceWasRecorded,
  ASSURANCE_QUESTION_ID, ASSURANCE_SCOPE_NOTE, ASSURANCE_NOT_RECORDED_NOTE,
  assuranceTone, showsAssuranceChip, assuranceSummarySentence, assuranceContradictionSentence,
  type AssuranceState,
} from './supplierAssurance'
import { TEMPLATES, templateAsks, resolveTemplate } from '../supply-chain/templates'

// ── WHETHER A SUPPLIER-REPORTED FIGURE CAME FROM ASSURED REPORTING ──────────────────────────────
//
// For a limited assurance engagement this is the first question asked about a supplier-reported
// number, and until now the questionnaire collected the answer and nothing read it. These protect
// three claims: that an absence is reported as the particular absence it is, that nothing ever calls a
// figure assured on the strength of a question about the supplier's own reporting, and that a
// spend-based estimate is never counted as assured.

const ALL_STATES: AssuranceState[] = [
  'limited', 'reasonable', 'internal_only', 'no_measurement',
  'not_answered', 'not_asked', 'unrecognised', 'not_applicable',
]

describe('mapping the supplier answer', () => {
  it('maps each option of the live questionnaire, matched exactly', () => {
    // ⚠️ THE EXPECTED KEYS ARE READ OUT OF templates.ts, NOT TYPED OUT HERE. A hand-copied option list
    // is a second copy of the questionnaire, and this file already records what happened when the
    // questionnaire existed twice: 68 of 75 labels disagreed. If someone rewords an option, the map
    // stops covering it and this fails, which is the whole point.
    const q = TEMPLATES.scope3.sections
      .flatMap(s => s.questions)
      .find(x => x.id === ASSURANCE_QUESTION_ID)
    expect(q, 's3_assurance is still in the scope3 template').toBeDefined()
    expect(q!.options).toBeDefined()

    const states = q!.options!.map(opt =>
      assuranceForLine({ raw: opt, asked: true, method: 'supplier-specific' }).assurance)
    expect(states, 'every live option maps to a state, none falls through to unrecognised')
      .toEqual(['limited', 'reasonable', 'internal_only', 'no_measurement'])
  })

  it('keeps the supplier answer verbatim, em-dashes and all', () => {
    // The methodology rule: preserve source values a verifier may cross-check. The supplier chose
    // those words and will repeat them when asked. Our own wording lives in assuranceStatement().
    const r = assuranceForLine({ raw: 'Yes — limited assurance', asked: true, method: 'supplier-specific' })
    expect(r.supplier_assurance_raw).toBe('Yes — limited assurance')
  })

  it('does not fuzzy-match an off-list answer onto its nearest neighbour', () => {
    // ⚠️ NOTHING ENFORCES THE OPTION LIST. supplier_responses.response is text, portal_save_response
    // validates nothing, and it is granted to anon, so any string can arrive from anyone holding a
    // token. A /^Yes/ test would bracket 'reasonable assurance' with 'limited assurance', and the
    // difference between those two is the entire reason the field exists.
    for (const odd of ['Yes - limited assurance', 'yes — limited assurance', 'Limited', 'Yes', 'partial']) {
      const r = assuranceForLine({ raw: odd, asked: true, method: 'supplier-specific' })
      expect(r.assurance, `${odd} must not be interpreted`).toBe('unrecognised')
      expect(r.supplier_assurance_raw, 'and is still reported as given').toBe(odd)
    }
  })

  it('trims surrounding whitespace, which cannot change what was meant', () => {
    expect(assuranceForLine({ raw: '  No measurement  ', asked: true, method: 'supplier-specific' }).assurance)
      .toBe('no_measurement')
  })
})

describe('the three absences, which are three different facts', () => {
  it('separates not answered from not asked', () => {
    expect(assuranceForLine({ raw: '', asked: true, method: 'supplier-specific' }).assurance).toBe('not_answered')
    expect(assuranceForLine({ raw: null, asked: true, method: 'supplier-specific' }).assurance).toBe('not_answered')
    expect(assuranceForLine({ raw: undefined, asked: false, method: 'supplier-specific' }).assurance).toBe('not_asked')
  })

  it('never substitutes a fallback string into the verbatim field', () => {
    // ⚠️ NULL, NOT PROSE. data_quality on the same line puts 'Supplier-reported (basis unspecified)'
    // into the field that otherwise holds the supplier's own words, so a reader cannot tell whose
    // words they are holding without checking the option list. That is now frozen into snapshots. The
    // split here is one field for what the supplier said and one for what we know.
    for (const asked of [true, false]) {
      expect(assuranceForLine({ raw: null, asked, method: 'supplier-specific' }).supplier_assurance_raw).toBeNull()
    }
  })

  it('an answer that exists outranks the template no longer asking', () => {
    // A response row for a question the current template lacks means the supplier answered it at some
    // point, most likely before the campaign's template was changed. Reporting 'not_asked' would throw
    // that evidence away. So 'not_asked' means not asked AND unanswered, which is what keeps it from
    // overlapping 'not_answered'.
    expect(assuranceForLine({ raw: 'No — internal only', asked: false, method: 'supplier-specific' }).assurance)
      .toBe('internal_only')
  })
})

describe('a spend-based line is not the supplier\'s reporting', () => {
  it('is not_applicable however the supplier answered', () => {
    for (const raw of ['Yes — limited assurance', 'Yes — reasonable assurance', null, 'nonsense']) {
      expect(assuranceForLine({ raw, asked: true, method: 'spend-based' }).assurance).toBe('not_applicable')
    }
  })

  it('still carries the raw answer, because it is true about the supplier', () => {
    expect(assuranceForLine({ raw: 'Yes — limited assurance', asked: true, method: 'spend-based' })
      .supplier_assurance_raw).toBe('Yes — limited assurance')
  })

  it('and is excluded from the assured rollup, which is what the helper is for', () => {
    // ⚠️ THE UNTRUE SENTENCE THIS PREVENTS: "12 of 20 suppliers hold assurance, so 60% of the figure is
    // assured", computed by filtering the raw answer. A spend-based line's figure is the buyer's spend
    // times a factor. Counting it because its supplier holds assurance reports an estimate as assured.
    expect(carriesThirdPartyAssurance('not_applicable')).toBe(false)
    expect(ALL_STATES.filter(carriesThirdPartyAssurance)).toEqual(['limited', 'reasonable'])
  })
})

describe('a figure from a supplier who states they measure nothing', () => {
  const base = { supplier_id: 's1', supplier_name: 'Acme', data_quality: 'x', basis: 'x' } as const

  it('is reported, and only for a supplier-specific line with a figure', () => {
    expect(assuranceContradictsFigure({ method: 'supplier-specific', value_mt: 10, assurance: 'no_measurement' })).toBe(true)
    expect(assuranceContradictsFigure({ method: 'supplier-specific', value_mt: 0, assurance: 'no_measurement' })).toBe(false)
    expect(assuranceContradictsFigure({ method: 'spend-based', value_mt: 10, assurance: 'no_measurement' })).toBe(false)
    expect(assuranceContradictsFigure({ method: 'supplier-specific', value_mt: 10, assurance: 'internal_only' })).toBe(false)
    void base
  })
})

describe('the wording, which a verifier reads', () => {
  it('has a label and a statement for every state, with no state left unworded', () => {
    for (const s of ALL_STATES) {
      expect(assuranceLabel(s), `label for ${s}`).toBeTruthy()
      expect(assuranceStatement(s), `statement for ${s}`).toMatch(/\.$/)
    }
  })

  it('never says a figure is assured', () => {
    // ⚠️ THE CLAIM THE QUESTION CANNOT SUPPORT. It asks whether the SUPPLIER'S emissions figures are
    // independently assured. A supplier may hold limited assurance over their group Scope 1 and 2
    // while the slice allocated to this buyer is an unassured internal calculation, so "this figure is
    // assured" is a stronger claim than the answer licenses. Every statement attributes to the
    // supplier instead. These strings will end up on a verifier surface separated from their caveat,
    // which is why each has to be safe read alone.
    //
    // ⚠️ THE GUARD MATCHES THE PHRASE AND CANNOT SEE A NEGATION, DELIBERATELY. It first failed on the
    // scope note, which used 'an assured figure' in order to deny it. Teaching a pattern to tell an
    // assertion from a denial is guessing at meaning; the rule is simpler and stronger the other way
    // round, so our prose makes the point without the phrase and the guard stays blunt.
    const forbidden = [
      /\bthis figure is assured\b/i, /\bassured figure\b/i, /\bthe figure is assured\b/i,
      /\bthis line is assured\b/i, /\bassured emissions\b/i, /\bverified figure\b/i,
    ]
    const prose = [...ALL_STATES.map(assuranceStatement), ASSURANCE_SCOPE_NOTE, ASSURANCE_NOT_RECORDED_NOTE]
    for (const text of prose) {
      for (const pat of forbidden) expect(text, `${pat} in: ${text}`).not.toMatch(pat)
    }
  })

  it('attributes every positive statement to the supplier rather than asserting it', () => {
    for (const s of ['limited', 'reasonable', 'internal_only', 'no_measurement'] as AssuranceState[]) {
      expect(assuranceStatement(s), `${s} must attribute`).toMatch(/^The supplier states that/)
    }
  })

  it('says what is not known without saying "not assured"', () => {
    expect(assuranceStatement('not_asked')).toContain('nothing is recorded either way')
    expect(ASSURANCE_NOT_RECORDED_NOTE).toContain('was not recorded')
    expect(ASSURANCE_NOT_RECORDED_NOTE).not.toMatch(/not assured|unassured/i)
  })

  it('carries no em-dash or arrow in wording we wrote', () => {
    // The raw supplier answers keep their em-dashes because they are quoted source values. Ours do not.
    for (const text of [...ALL_STATES.map(assuranceLabel), ...ALL_STATES.map(assuranceStatement),
                        ASSURANCE_SCOPE_NOTE, ASSURANCE_NOT_RECORDED_NOTE]) {
      expect(text, `em-dash or arrow in: ${text}`).not.toMatch(/[—–→←]/)
    }
  })

  it('states the scope caveat in the note that surfaces print once', () => {
    expect(ASSURANCE_SCOPE_NOTE).toContain('attributed to your purchases')
    expect(ASSURANCE_SCOPE_NOTE).toMatch(/not about this number/)
  })
})

describe('the state set, and why a member cannot be added casually', () => {
  it('has exactly these eight members', () => {
    // ⚠️ READ OUT OF THE SOURCE, so a ninth member fails here and has to be reasoned about. The set is
    // load-bearing for the immutability story: a snapshot line written before this field existed has NO
    // assurance key, and that absence is only readable because no member of this set means "unknown
    // whether it was recorded". Add one that does and old rows stop being distinguishable from new ones.
    const src = readFileSync(join(__dirname, 'supplierAssurance.ts'), 'utf8')
    const union = src.slice(src.indexOf('export type AssuranceState ='), src.indexOf('// ⚠️ EXACT STRINGS'))
    const members = [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect(members).toEqual(ALL_STATES)
  })

  it('has no member meaning "we did not record this"', () => {
    for (const s of ALL_STATES) {
      expect(s, `${s} looks like an unrecorded marker`).not.toMatch(/^(unknown|unrecorded|not_recorded|missing|absent|null)$/)
      expect(assuranceStatement(s), `${s} must not claim the value was never recorded`)
        .not.toMatch(/was not recorded/)
    }
  })

  it('reads a missing key as absence and a present one as a value', () => {
    // Presence is the test, not the value. This is the inference that replaces a backfill.
    expect(assuranceWasRecorded({}), 'a pre-field snapshot line').toBe(false)
    expect(assuranceWasRecorded({ assurance: undefined }), 'and an explicit undefined').toBe(false)
    for (const s of ALL_STATES) expect(assuranceWasRecorded({ assurance: s }), s).toBe(true)
  })
})

describe('which questionnaire the campaign actually sent', () => {
  it('asks about assurance in the scope3 template and in no other', () => {
    // ⚠️ FOUR OF FIVE TEMPLATES, INCLUDING THE DEFAULT, DO NOT ASK. That is the ordinary case, not an
    // edge case, and it is why 'not_asked' exists. Derived from TEMPLATES so adding the question to
    // another template updates the expectation rather than breaking silently.
    const asking = Object.keys(TEMPLATES).filter(k => templateAsks(k, ASSURANCE_QUESTION_ID))
    expect(asking).toEqual(['scope3'])
  })

  it('but the Cat 1 questions are in two templates, which is the whole problem', () => {
    const feeding = Object.keys(TEMPLATES).filter(k => templateAsks(k, 's3cat1_allocated'))
    expect(feeding.sort()).toEqual(['ecovadis', 'scope3'])
  })

  it('resolves an unknown, empty or missing template the way both readers resolve it', () => {
    // ⚠️ IF THIS FALLBACK IS WRONG, A LINE CLAIMS 'not_asked' ABOUT A QUESTION THE SUPPLIER SAW, or the
    // reverse. Both are verifier-facing claims about what was put to a supplier.
    for (const t of [null, undefined, '', 'typo', 'cs3d_v2']) {
      expect(resolveTemplate(t).key, `${String(t)} falls back`).toBe('ecovadis')
      expect(templateAsks(t, ASSURANCE_QUESTION_ID), `${String(t)} shows the EcoVadis form`).toBe(false)
    }
    expect(resolveTemplate('scope3').key).toBe('scope3')
  })

  it('and both readers still spell that fallback the same way', () => {
    // ⚠️ COUPLED SITES. The supplier portal and the buyer's response viewer each resolve the template
    // themselves. If either stopped falling back to ecovadis, templateAsks would answer about a
    // questionnaire nobody saw and this file's claims would quietly become wrong. Checked by reading
    // them, the way lib/ghg/declarationStates.test.ts checks its render branches.
    const root = join(__dirname, '..', '..')
    for (const rel of ['app/supplier/[token]/page.tsx',
                       'app/dashboard/supply-chain/portal/[id]/supplier/[supplierId]/page.tsx']) {
      const src = readFileSync(join(root, rel), 'utf8')
      expect(src, `${rel} must still fall back to ecovadis`).toMatch(/TEMPLATES\.ecovadis/)
    }
  })
})


// ── WHAT THE BUYER READS ────────────────────────────────────────────────────────────────────────

const sl = (o: Partial<Parameters<typeof showsAssuranceChip>[0]> & { supplier_name?: string; value_mt?: number } = {}) => ({
  supplier_name: 'Acme', method: 'supplier-specific' as const, value_mt: 10, assurance: 'limited' as AssuranceState, ...o,
})

describe('which lines earn a chip', () => {
  it('gives none to a spend-based line, whose state never varies', () => {
    expect(showsAssuranceChip({ method: 'spend-based', assurance: 'not_applicable' })).toBe(false)
    // Even with an answer recorded: the line is already labelled spend-based, which says it.
    expect(showsAssuranceChip({ method: 'spend-based', assurance: 'limited' })).toBe(false)
  })

  it('gives none to not_asked, which is a fact about the questionnaire', () => {
    // ⚠️ FORTY ROWS READING "Not asked" STATES ONE FACT ABOUT THE QUESTIONNAIRE FORTY TIMES, in the
    // column a reader scans for facts about suppliers. Four of the five templates do not ask, so this
    // is the ordinary case rather than an edge one. The campaign-level sentence carries it instead.
    expect(showsAssuranceChip({ method: 'supplier-specific', assurance: 'not_asked' })).toBe(false)
  })

  it('gives one to every state that actually varies by supplier', () => {
    for (const s of ['limited', 'reasonable', 'internal_only', 'no_measurement', 'not_answered', 'unrecognised'] as AssuranceState[]) {
      expect(showsAssuranceChip({ method: 'supplier-specific', assurance: s }), s).toBe(true)
    }
  })

  it('tones every state, with assurance read as good and an off-list answer as an alert', () => {
    expect(ALL_STATES.filter(s => assuranceTone(s) === 'good')).toEqual(['limited', 'reasonable'])
    expect(assuranceTone('unrecognised')).toBe('alert')
    expect(assuranceTone('not_applicable')).toBe('muted')
  })
})

describe('the sentence beside the method split', () => {
  const base = { asked: true, supplierSpecificCount: 4, supplierSpecificMt: 40, assuredCount: 1, assuredMt: 12.3, answeredCount: 4 }

  it('says nothing when no supplier reported a figure', () => {
    // An empty result reported as an empty result: there is nothing to say about the assurance of
    // supplier-reported figures when there are none, and '0 of 0' is noise rather than a finding.
    expect(assuranceSummarySentence({ ...base, supplierSpecificCount: 0 })).toBeNull()
  })

  it('attributes the claim to the supplier and never to the figure', () => {
    const out = assuranceSummarySentence(base)!
    expect(out).toContain('their emissions reporting carries third-party assurance')
    expect(out).not.toMatch(/assured figure|this figure is assured|assured emissions/i)
  })

  it('quotes the route rollup unchanged rather than recomputing it', () => {
    // The mt figures come from /api/campaigns/[id]/scope3-cat1, which filters through
    // carriesThirdPartyAssurance so no spend-based line is counted. This only formats them.
    expect(assuranceSummarySentence(base)).toContain('covering 12.30 mt of the 40.00 mt')
  })

  it('speaks about the questionnaire when the questionnaire did not ask', () => {
    // ⚠️ NOT "none of them is assured". They were never asked, and reporting silence as a negative
    // answer would put a claim about four suppliers on the strength of a template choice.
    const out = assuranceSummarySentence({ ...base, asked: false, assuredCount: 0, assuredMt: 0, answeredCount: 0 })!
    expect(out).toContain('does not ask whether suppliers')
    expect(out).not.toMatch(/none of/i)
  })

  it('separates nobody answered from nobody is assured', () => {
    const unanswered = assuranceSummarySentence({ ...base, assuredCount: 0, assuredMt: 0, answeredCount: 0 })!
    expect(unanswered).toContain('answered whether')
    const answeredNone = assuranceSummarySentence({ ...base, assuredCount: 0, assuredMt: 0, answeredCount: 4 })!
    expect(answeredNone).toContain('none states that their emissions reporting carries')
    expect(answeredNone).not.toContain('answered whether')
  })

  it('prefers a recorded answer over the template no longer asking', () => {
    // asked: false with answers present. Saying the question was never put to them while holding
    // their answer would be false, so the branch keys on whether anyone answered.
    const out = assuranceSummarySentence({ ...base, asked: false, answeredCount: 4 })!
    expect(out).not.toContain('does not ask')
    expect(out).toContain('carries third-party assurance')
  })

  it('agrees with itself on singular and plural', () => {
    const one = assuranceSummarySentence({ ...base, supplierSpecificCount: 1, assuredCount: 1 })!
    expect(one, 'not "1 of the 1 supplier"').toContain('The one supplier who reported a figure states')
    expect(assuranceSummarySentence(base)).toContain('4 suppliers who reported a figure state')
  })

  it('carries no em-dash or arrow', () => {
    for (const o of [base, { ...base, asked: false, answeredCount: 0, assuredCount: 0 }, { ...base, assuredCount: 0 }]) {
      expect(assuranceSummarySentence(o)!).not.toMatch(/[—–→←]/)
    }
  })
})

describe('the contradiction notice', () => {
  it('says nothing when there is none, rather than saying there are none', () => {
    expect(assuranceContradictionSentence([])).toBeNull()
    expect(assuranceContradictionSentence([sl()])).toBeNull()
  })

  it('names the suppliers and states the figures still stand', () => {
    // ⚠️ A QUESTION FOR THE SUPPLIER, NOT AN ERROR IN THE DATA. Nothing gates on this, and the sentence
    // says what was done with the figure so a reader does not assume it was dropped.
    const out = assuranceContradictionSentence([
      sl({ supplier_name: 'Acme', assurance: 'no_measurement' }),
      sl({ supplier_name: 'Borex', assurance: 'no_measurement' }),
      sl({ supplier_name: 'Clear', assurance: 'limited' }),
    ])!
    expect(out).toContain('2 suppliers reported a figure while stating that they do not measure their emissions: Acme, Borex')
    expect(out).toContain('included exactly as reported')
    expect(out, 'addresses both named suppliers, not one').toContain('Ask them which')
    expect(out).not.toMatch(/error|invalid|rejected|excluded/i)
  })

  it('uses the same predicate the route counts with, so the two cannot disagree', () => {
    const lines = [sl({ assurance: 'no_measurement', method: 'spend-based' }), sl({ assurance: 'no_measurement', value_mt: 0 })]
    expect(lines.filter(assuranceContradictsFigure)).toHaveLength(0)
    expect(assuranceContradictionSentence(lines)).toBeNull()
  })

  it('agrees with itself on singular', () => {
    expect(assuranceContradictionSentence([sl({ assurance: 'no_measurement' })])!)
      .toContain('One supplier reported a figure while stating')
  })
})

describe('the buyer surface renders these and derives nothing itself', () => {
  // ⚠️ JSX COMMENTS STRIPPED TOO, AND THE FIRST DRAFT FAILED WITHOUT IT. The page explains in a
  // {/* ... */} block WHY it must not call carriesThirdPartyAssurance, so a line filter that only
  // understood // comments matched the prose describing the rule and reported the rule as broken.
  // Third time in this repo: the same thing caught the snapshot grant test and check-sql.py. Prose
  // about a rule reads exactly like a breach of it to anything matching on substrings.
  const page = readFileSync(join(__dirname, '..', '..', 'app', 'dashboard', 'scope3', 'page.tsx'), 'utf8')
  const code = page
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  it('does not sum the assured share a second time', () => {
    // ⚠️ THE ONE SUMMATION IS IN THE ROUTE. app/dashboard/ghg/page.tsx renders buildWorkings() output
    // and never re-derives a row, because a second derivation in a component drifted from the engine
    // once and had to be removed. A share of an emissions total computed in two places is a share that
    // can disagree with itself, and the disagreement shows up as a number nobody can source.
    expect(code, 'the component must not filter lines by assurance itself')
      .not.toMatch(/carriesThirdPartyAssurance/)
    expect(code, 'nor reduce them into a total').not.toMatch(/assurance[^\n]*\.reduce\(/)
    expect(code, 'it reads the route rollup').toContain('supplier_specific_assured_mt')
  })

  it('builds every assurance sentence through this module', () => {
    // ⚠️ MATCHED AS A CALL, NOT AS A NAME, AND AN EARLIER DRAFT OF THIS TEST WAS USELESS FOR EXACTLY
    // THAT REASON. It asserted the page CONTAINED 'showsAssuranceChip', which stayed true after the
    // guard was deleted from the render, because the import line still mentioned it. A mutation that
    // put the chip on all 40 rows passed 45 of 45. An import is not a call site.
    for (const fn of ['assuranceSummarySentence', 'assuranceContradictionSentence',
                      'assuranceStatement', 'assuranceLabel', 'showsAssuranceChip']) {
      expect(code, `${fn} is called rather than inlined`).toContain(`${fn}(`)
    }
    expect(code, 'the scope caveat is the shared constant').toContain('ASSURANCE_SCOPE_NOTE')
  })

  it('gates the per-line chip on showsAssuranceChip rather than rendering it always', () => {
    // The guard is what keeps 'not_asked' out of 40 rows and 'not_applicable' off every spend-based
    // one. Deleting it renders a column of identical labels, which is the thing this was built to avoid.
    expect(code, 'the chip is rendered behind the guard').toMatch(/\{showsAssuranceChip\(l\) && \(/)
    expect(code, 'and the label comes from the module').toMatch(/assuranceLabel\(l\.assurance\)/)
  })

  it('states the contradiction in both places from one builder', () => {
    // The Cat 1 panel and the export notice must not drift into two different sentences about the
    // same fact. Two call sites, one builder.
    expect([...code.matchAll(/assuranceContradictionSentence\(/g)]).toHaveLength(2)
  })

  it('gives every tone a colour, so a new state cannot render unstyled', () => {
    const block = code.slice(code.indexOf('ASSURANCE_TONE_STYLE'), code.indexOf('const useCatOneFigure'))
    for (const tone of ['good', 'warn', 'alert', 'muted']) {
      expect(block, `${tone} has a style`).toMatch(new RegExp(`${tone}:\\s*{`))
    }
  })

  it('makes no claim that a figure is assured', () => {
    for (const pat of [/\bassured figure\b/i, /\bassured emissions\b/i, /\bthis figure is assured\b/i]) {
      expect(code, `${pat} in the Scope 3 page`).not.toMatch(pat)
    }
  })
})
