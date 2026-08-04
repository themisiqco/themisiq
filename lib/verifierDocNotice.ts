// lib/verifierDocNotice.ts
// SINGLE SOURCE OF TRUTH for what a verifier is told about source-document links.
//
// WHY THIS EXISTS: the same claim was made in three places in three slightly different wordings —
// the CBAM verifier banner, the CBAM verifier document section, and the GHG verifier document
// section — with nothing holding them together. The GHG one had already drifted into being wrong:
// it promised "secure and expire after 10 minutes" while the URLs were batch-signed at PAGE LOAD,
// so the ten minutes ran from a moment the verifier never saw, every link on the page died at once,
// and no recovery was named. That is the drift shape CLAUDE.md warns about, and the fix is the same
// one lib/disclaimer.ts applies to the legal notice: one copy, several consumers.
//
// WIRED — these import from here:
//   app/verify/[token]/page.tsx        (GHG verifier — Source Documents section)
//   app/verify-cbam/[token]/page.tsx   (CBAM verifier — page banner AND Source documents section)
//
// WHAT THE WORDING IS CAREFUL ABOUT. It says what happens and what to do about it, and nothing
// more:
//   • It does NOT say "secure". Signed URLs are BEARER credentials — whoever holds the link can
//     open it, with no tie to the verifier's identity, session, or consent. "Secure" reads as "only
//     you can open this", which is not true. What IS true is that the link cannot be guessed and
//     stops working shortly, and that is what the sentence claims.
//   • It does NOT state a number. The TTL is 120s in both modules today; a figure in prose is a
//     second source of truth that goes stale the moment a constant moves.
//   • It NAMES THE RECOVERY. A verifier who hits a dead link needs to know the fix is to click
//     again, not to email the company for a new invite.

export const VERIFIER_DOC_LINK_NOTICE =
  'Source document links are generated fresh each time you open one and expire shortly after. ' +
  'If a link stops working, click View again.'

// Shown when the document was signed successfully but the new tab did not open — a pop-up blocker,
// almost always. Both verifier pages fall back to a link the reader clicks themselves.
//
// IT DOES NOT NAME A CAUSE. The old wording said "Your browser blocked the pop-up", which was two
// mistakes at once: window.open() returns null both when a blocker intervenes AND when the caller
// passes noopener, so the code cannot tell those apart — and for a long while the real reason was
// the second one, meaning the page told assurance providers their browser had done something it
// had not. On a page whose entire claim is that what it says can be relied on, a confident guess
// about someone else's software is the wrong habit. "Didn't open" is the part we can actually
// observe; the link beside it is the part the reader needs.
export const VERIFIER_DOC_TAB_DID_NOT_OPEN = 'Didn’t open in a new tab.'
