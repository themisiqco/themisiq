import type { ModuleKey } from './pricing'

/**
 * The claims every module marketing page shares, held once so they cannot drift across seven pages.
 * Same reason as lib/auditTrailNotice.ts and lib/verifierDocNotice.ts: one claim, several consumers.
 */

/**
 * The sub-line under every module headline, identical on all of them.
 *
 * ⚠️ DO NOT VARY IT, AND DO NOT INLINE IT. The repetition is the point: a reader who visits three
 * module pages should see the same promise three times. That is a rule a string typed into seven files
 * cannot hold — app/components/buttonStyles.ts exists because thirteen files each declared their own
 * identical button and a palette change had to be applied thirteen times, with a miss invisible.
 * lib/modulePages.test.ts asserts every converted page imports this.
 *
 * ⚠️ "ADVISORS", AND THEY ARE PEOPLE. Not "human-led", which is a product claim dressed as a person.
 */
export const MODULE_SUBLINE = 'Self-guided, or with advisors at the ready.'

/**
 * WHICH MODULE COVERS WHICH HALF OF DOUBLE MATERIALITY. Two widths, and a slot needing more does not
 * invent a fifth form.
 *
 * ⚠️ IT IS HERE AND NOT IN lib/csrd.ts, AND THAT IS THE POINT. This is a PRODUCT MAPPING, not a fact
 * about the Directive. lib/csrd.ts's own comment on CSRD_DOUBLE_MATERIALITY_SENTENCE records being burned
 * by exactly that conflation: a sentence there "used to end 'across all ten ESRS topical standards',
 * which is ESRS STRUCTURE attributed to CSRD inside a constant named for CSRD — two instruments fused in
 * the one place most likely to be copied out." A ThemisIQ module split inside a constant named for the
 * Directive is the same error one step further out. This file already holds the claims that must not
 * drift across module pages, which is what this is.
 *
 * ⚠️ FOUR SURFACES HAD FOUR WORDINGS BEFORE THIS EXISTED: app/frameworks/page.tsx's CSRD entry,
 * app/climate-risk/page.tsx's FAQ, app/page.tsx's wider card, and app/materiality/page.tsx's stat tile.
 * The mapping is the module's commonest point of confusion — app/materiality/page.tsx's header records
 * that "a large share of its visitors need Climate Risk and not this" — so four forms of it was the worst
 * possible arrangement.
 *
 * ⚠️ NEITHER FORM NAMES A MODULE COUNT. CLAUDE.md forbids stating one, and the materiality page's stat
 * tile already had to reason about this: its comment reads "'2 · HALVES', NOT '2 · MODULES'".
 */
export const CSRD_BOTH_HALVES_SHORT = 'Materiality covers impact, Climate Risk covers financial.'

export const CSRD_BOTH_HALVES =
  'CSRD needs both halves: the Materiality Assessment covers the impact half, how your organisation '
  + 'affects people and the environment, and Climate Risk covers the financial half, how the climate '
  + 'affects you.'

/**
 * What a module can truthfully say about evidence. THE GATE, and it is the reason this file exists.
 *
 * ⚠️ THERE ARE TWO CLAIMS AND THEY ARE NOT INTERCHANGEABLE.
 *
 *   'verifier'  A named outside party can be granted read access to the figures and trace them to
 *               source, and that grant can be revoked. TRUE FOR GHG AND CBAM ONLY, plus Scope 3
 *               Category 1 behind a per-grant opt-in. There is no verifier surface for any other
 *               module: get_verifier_inventory and get_verifier_scope3 are the only two RPCs, and
 *               app/verify/[token] and app/verify-cbam/[token] are the only two pages.
 *
 *   'workings'  Every figure keeps the inputs and the method behind it, so a reviewer can see why it
 *               came out as it did. True on every module, because it is a property of the engines.
 *
 * ⚠️ 'workings' IS DELIBERATELY NOT CALLED 'audit-trail', AND THAT NAMING WAS A NEAR-MISS. The brief
 * for this file described the non-verifier paragraph as "the audit-trail paragraph, which is true
 * everywhere". It is not. SEVEN audit triggers exist, verified LIVE on 17 Sep 2026, covering
 * ghg_inventories, ghg_entries, two cbam_* tables and three concierge_* tables. Climate Risk,
 * Materiality, People, Cyber, AI Governance and Deals write no audit_log rows at all, so a page of
 * theirs claiming an audit trail would assert a database object that does not exist for it — the same
 * defect CLAUDE.md records on the homepage, where "every calculation and data point is logged with a
 * full audit trail" was platform-wide and false.
 *
 * ⚠️ THIS COMMENT SAID THREE TRIGGERS AND "THAT IS THE COMPLETE LIST" UNTIL 26 SEP 2026, AND THE METHOD
 * WAS THE DEFECT, NOT THE ARITHMETIC. The three came from grepping supabase/migrations/, which
 * UNDERCOUNTS BY DESIGN: 20260726_capture_audit_log_infrastructure.sql says of the ghg_inventories
 * trigger that it is "intentionally NOT recreated here — it already exists in prod", and the concierge
 * and ghg_entries triggers are in the same category. CLAUDE.md is explicit that much of the schema is
 * not in git and that the DATABASE is the source of truth, with the migration header only a record of
 * execution. A complete list cannot be asserted from an incomplete source.
 *   DO NOT REPEAT THE METHOD. To recount, query the database:
 *     select tgrelid::regclass as table_name, tgname from pg_trigger
 *     where not tgisinternal and tgfoid = 'public.log_audit'::regproc;
 *   plus the same for log_audit_cbam_disclosures, which is the composite-PK variant.
 *   The outcome of the gate did not change — GHG and CBAM remain the only verifier modules, and
 * concierge is a mode of GHG rather than a module of its own — which is exactly why a wrong figure
 * could sit here for a day without anything failing.
 *   So the modules with an audit log are exactly the modules with a verifier, and the other five get a
 * claim about workings, which is true and is not smaller than it sounds.
 *
 * ⚠️ A Record<ModuleKey, …> ON PURPOSE. A tenth module fails tsc here rather than defaulting to the
 * safe-looking answer, which would be the wrong way round: defaulting to 'workings' would silently
 * withhold a true verifier claim, and defaulting to 'verifier' would make a false one.
 */
export type EvidenceKind = 'verifier' | 'workings'

export const EVIDENCE_BY_MODULE: Record<ModuleKey, EvidenceKind> = {
  ghg: 'verifier',
  cbam: 'verifier',
  'climate-risk': 'workings',
  'double-materiality': 'workings',
  'supply-chain': 'workings',
  people: 'workings',
  deals: 'workings',
  'ai-governance': 'workings',
  cyber: 'workings',
}

/**
 * The shared second paragraph of the evidence section, chosen by module rather than by the page.
 *
 * ⚠️ THE PAGE DOES NOT GET TO PICK. That is the whole mechanism: a page passes its moduleKey and its
 * own one-line workings claim, and this decides whether a verifier sentence may follow. Seven
 * hand-written paragraphs would make a wrong claim likely; this makes it impossible.
 */
export function evidenceClaim(key: ModuleKey): string {
  return EVIDENCE_BY_MODULE[key] === 'verifier'
    ? 'Your verifier can check the figures back to their source, through access you grant and can revoke. '
      + 'That covers Scope 1 and 2, CBAM, and Scope 3 Category 1 where you have opted in for that grant.'
    : 'Nothing is a black box. Every score carries the inputs and the method that produced it, so a '
      + 'reviewer can follow the reasoning rather than taking the number on trust.'
}

/** True where a page may render a verifier claim at all. Exported so a test can assert the negative. */
export const hasVerifierSurface = (key: ModuleKey): boolean => EVIDENCE_BY_MODULE[key] === 'verifier'
