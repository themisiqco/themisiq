// lib/emailKey.ts
//
// THE KEY ONE MAILBOX IS COUNTED AND FOUND UNDER (LEAD1 L7, Oct 2026; design section 6). Used by /api/ghg/free-calc/
// pending (its rate limit and the hold's email_key) and /claim (the pending lookup), so the two always agree.
//
//   every address    trimmed and lower-cased
//   other domains    "+tag" dropped from the local part:          pat+calc@acme.com      -> pat@acme.com
//   gmail.com and    dots and "+tag" dropped, googlemail.com read  P.a.t+x@googlemail.com -> pat@gmail.com
//   googlemail.com   as gmail.com (Google delivers all of these to one mailbox)
//
// WHY. Without it, one person gets a fresh rate-limit allowance and a fresh hold per spelling of the same mailbox:
// pat+1@, pat+2@, p.at@gmail.com. Supabase still sends the code to the address exactly as typed; this is only the key.
//
// ⚠️ A RESIDUAL RISK, STATED: at a domain that does NOT treat "+" as subaddressing, pat+b@ and pat@ are two mailboxes
// and would share a key, so the newest hold for one could be claimed by the other after both verify their own
// address. "+" in a real local part is rare, and the claim still needs a verified session for the shared key.
// lib/assessmentSubmitGuard.ts recipientKey (trim and lower case only) is left as it was for the assessment limit.

const GMAIL = new Set(['gmail.com', 'googlemail.com'])

export function emailKey(raw: string): string {
  const e = raw.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1 || at === e.length - 1) return e
  let local = e.slice(0, at)
  let domain = e.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (GMAIL.has(domain)) {
    domain = 'gmail.com'
    local = local.replace(/\./g, '')
  }
  return local ? `${local}@${domain}` : e
}
