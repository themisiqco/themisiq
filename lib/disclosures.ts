// ── SENTENCES THAT ARE PUBLISHED ON MORE THAN ONE PAGE ───────────────────────────────────────────
//
// Each constant below is rendered to customers on at least two public surfaces. The point of the
// file is that there is one copy, so the surfaces cannot disagree.
//
// They already had. Until 14 September 2026 /trust said "ThemisIQ staff cannot access your inventory
// data without your explicit request for support purposes" while /security said there was no support
// organisation with standing access at all: one page implied a support team and an access path the
// other page said did not exist. When that was corrected, the corrected sentence was written out
// twice, once per page, with "customer data" on one and "your data" on the other. Two copies of a
// claim is the defect, whether they currently agree or not.
//
// disclosures.test.ts scans app/ and fails if either sentence is pasted back in as a literal.

// Published on /trust (core data principles) and /security (access control). Do not edit this in
// place without reading how it reads on BOTH pages first: on /trust it follows a sentence about
// named individuals, on /security it follows a sentence naming the founder and one deputy.
export const ACCESS_NO_STANDING =
  'There is no support organisation with standing access to your data, and no third party administers the platform on our behalf.'

// Published on /trust today. It is kept here rather than inline because it is the natural companion
// to the sentence above and belongs on /security too if that page ever states its access lifecycle.
// Check both surfaces before editing.
export const ACCESS_BY_NAME =
  'Access is granted by name, not by role, and removed when it is no longer required.'
