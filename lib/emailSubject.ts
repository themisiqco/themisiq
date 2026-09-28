// ─────────────────────────────────────────────────────────────────────────────
// A SUBJECT LINE IS PLAIN TEXT. A BODY IS HTML. THEY NEED OPPOSITE TREATMENT.
//
// ⚠️ WHAT WENT WRONG, 27 Sep 2026. app/api/order/quote-request/route.ts built five subjects from a value
// that had been through its HTML escaper, so a company called "AT&T" arrived in the inbox as
// "AT&amp;T" — five subjects, every quote request from such a company. HTML escaping in a subject is not
// a harmless extra: there is no HTML parser at the other end to undo it, so the escape IS the text.
//
// ⚠️ AND THE OPPOSITE MISTAKE IS WORSE. A subject is one header line, so a CR or LF in an interpolated
// value can end the header and begin another — the classic header injection. Every subject in this repo
// interpolates something a person typed: a company name, a lead's name, an email address. So a subject
// needs exactly one transformation, and it is not escaping: remove the line breaks.
//
// CR and LF become a SPACE rather than being deleted, so "Acme\nLtd" reads "Acme Ltd" rather than
// "AcmeLtd". Nothing else is touched: ampersands, quotes, angle brackets and emoji all pass through as
// the person wrote them, because the subject is displayed, not parsed.
// ─────────────────────────────────────────────────────────────────────────────

/** An interpolated value, made safe for a subject line: line breaks out, everything else untouched. */
export function subjectText(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}
