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
 * everywhere". It is not. Checked against the migrations on 25 Sep 2026: audit_log triggers exist on
 * ghg_inventories (audit_ghg_inventories, live but captured in no migration), and on
 * cbam_production_processes and cbam_installation_disclosures
 * (supabase/migrations/20260726_cbam_audit_triggers.sql). THAT IS THE COMPLETE LIST. Climate Risk,
 * Materiality, People, Cyber, AI Governance and Deals write no audit_log rows at all, so a page of
 * theirs claiming an audit trail would be asserting a database object that does not exist for it —
 * the same defect CLAUDE.md records on the homepage, where "every calculation and data point is logged
 * with a full audit trail" was platform-wide and false.
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
