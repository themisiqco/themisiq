// ⚠️ 'Not provided', NOT '—'. An em dash as an empty-value glyph reads as typography to a designer and
// as a missing value to nobody else. In a document an external reader judges — a deal team's report, a
// verifier's workings table — the words are the answer, and a dash is a shrug.
//
// IT IS ALSO A SENTINEL RISK, WHICH IS WHY ONE CONSTANT AND NOT A LITERAL PER SITE. An em dash cell has
// twice been compared for equality to mean "empty" (app/verify-cbam/[token]/page.tsx:570 still does, on
// its own locally-formatted values). A named constant is greppable; '—' in a diff is not distinguishable
// from an em dash in prose.
//
// Deals replaced six of these on 26 Sep 2026 and the GHG workings rows followed on 27 Sep 2026. It lives
// at the top of lib/ rather than in either module because both now read it, and lib/deals/reportModel.ts
// re-exports it so its own importers did not have to change.
export const NOT_PROVIDED = 'Not provided'
