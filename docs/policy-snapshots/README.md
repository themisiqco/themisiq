# Policy snapshots: what is in here, and where amendments are recorded

Three customer-facing policies (the Privacy Policy, the Terms of Service and the Refund Policy) exist
only as React components in `app/` and are edited in place. Each file in this directory is the record of
one published version, so that editing the live page does not erase the wording a customer agreed to.

| File | Records |
|---|---|
| `2026-06-v2-final.md` | Terms, Refund Policy and the consent wording under consent version `2026-06-v2-final`, and the Privacy Policy at v2.0 |
| `2026-09-privacy-v2.1.md` | Privacy Policy v2.1 |
| `2026-09-privacy-v2.2.md` | Privacy Policy v2.2 (current) |

**A snapshot is never edited to match a newer version.** Each is the record of its own version, and
`2026-06-v2-final.md` and `2026-09-privacy-v2.2.md` both say so in their own text. `purchase_consents.consent_version`
points at a consent version recorded here, so rewriting one would change what a stored consent means.

## Amendments that do not move a version

A change to a live policy page that alters no wording, no meaning, no legal term, no right and no date
does not move the version number. It does put the live page out of step with the snapshot above, and that
has to be written down rather than discovered later. Those amendments are listed here, not in the
snapshot files, precisely because a snapshot records one version and must stay fixed.

- **27 Sep 2026, punctuation only, no version change.** Eleven em dashes were replaced across the three
  pages: nine in the Privacy Policy (`app/privacy/page.tsx`), one in the Terms (`app/terms/page.tsx`) and
  one in the Refund Policy (`app/refund-policy/page.tsx`). Eight became colons where the dash introduced a
  qualifier or an explanation. Those eight are `Processor: you are the controller`, `Express consent
  (CASL): unsubscribe anytime`, `Legitimate interest: security`, `EU/UK customers: GDPR transfer
  mechanism`, `US residents: additional rights`, and the three sentence dashes in the Privacy Officer,
  PIPEDA and Law 25 paragraphs.
  Three became commas: the headings of the three contact panels now read `Privacy Officer, ThemisIQ
  Compliance Inc.`, `Legal enquiries, ThemisIQ Compliance Inc.` and `Refund enquiries, ThemisIQ Compliance
  Inc.` The comma is deliberate: a colon there would read as an equation saying the officer is the
  company.

  No wording, meaning, legal term, right, date, statute reference or document id changed. The Privacy
  Policy remains **TIQ-PRV-001 v2.2, effective September 12, 2026**; the Terms and Refund Policy remain
  effective **June 22, 2026** under consent version `2026-06-v2-final`. The snapshots above therefore
  differ from the live pages by these eleven punctuation marks and nothing else, and are correct as the
  record of their versions.

  Part of the site-wide em-dash sweep. The three pages were exempt from it as `PENDING_DECISION` in
  `lib/emDashCopy.test.ts` until this was decided; that exemption is now removed and the pages are held at
  zero by the same guard as every other page.
