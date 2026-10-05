// lib/disposableEmailDomains.ts
//
// DISPOSABLE ("THROWAWAY") EMAIL DOMAINS, REFUSED BY /api/ghg/free-calc/pending (LEAD1 L7, Oct 2026; design section 6,
// Q-L6). A static list: no network call, nothing to fail. Free webmail (gmail.com, outlook.com, hotmail.com,
// yahoo.com, icloud.com, proton.me and similar) is NOT here and stays allowed: many small companies use it.
//
// A subdomain of a listed domain is refused too (x.mailinator.com).
//
// HOW TO UPDATE: add a domain, lower case, to DISPOSABLE_DOMAINS below, in the same commit as a line in
// lib/disposableEmailDomains.test.ts if it is one a visitor actually used. A fuller public list is maintained at
// https://github.com/disposable-email-domains/disposable-email-domains (disposable_email_blocklist.conf); copy entries
// from it by hand, checking each, rather than importing it wholesale: a wrong entry blocks a real company, and a
// visitor refused here sees only "Please use your work email."

export const DISPOSABLE_EMAIL_MESSAGE = 'Please use your work email.'

export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  // Mailinator and its aliases
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'notmailinator.com', 'binkmail.com', 'bobmail.info',
  'chammy.info', 'devnullmail.com', 'letthemeatspam.com', 'mailinater.com', 'mailismagic.com', 'monumentmail.com',
  'safetymail.info', 'sogetthis.com', 'spamhereplease.com', 'spamherelots.com', 'suremail.info', 'thisisnotmyrealemail.com',
  'tradermail.info', 'veryrealemail.com', 'zippymail.info', 'objectmail.com',
  // Guerrilla Mail
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  // Ten-minute and temporary inboxes
  '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '20minutemail.com', 'temp-mail.org', 'temp-mail.io',
  'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempail.com', 'tempr.email', 'tempinbox.com', 'tempmailaddress.com',
  'mytemp.email', 'tmpmail.org', 'tmpmail.net', 'tmail.ws', 'dropmail.me', '1secmail.com', '1secmail.net', '1secmail.org',
  'mohmal.com', 'moakt.com', 'getnada.com', 'nada.email', 'emailondeck.com', 'mailpoof.com', 'inboxkitten.com',
  'generator.email', 'emailfake.com', 'harakirimail.com', 'burnermail.io', 'throwam.com', 'mailsac.com',
  // Yopmail and its aliases
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx',
  'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  // Trash and discard services
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'trashmail.me', 'trashmail.at',
  'trash-mail.com', 'mytrashmail.com', 'discard.email', 'discardmail.com', 'dispostable.com', 'mailnesia.com',
  'maildrop.cc', 'mailcatch.com', 'mintemail.com', 'fakeinbox.com', 'fakemail.net', 'spamgourmet.com', 'spambox.us',
  'mailexpire.com', 'incognitomail.org', 'anonbox.net', 'mailforspam.com', 'spamdecoy.net', 'mailnull.com',
  'jetable.org', 'filzmail.com', 'getairmail.com', 'rcpt.at', 'proxymail.eu', '0-mail.com',
  'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  // Fake Mail Generator
  'fakemailgenerator.com', 'armyspy.com', 'cuvox.de', 'dayrep.com', 'einrot.com', 'fleckens.hu', 'gustr.com',
  'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us',
])

/** True when the address's domain, or any domain it is a subdomain of, is on the list. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const labels = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '').split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join('.'))) return true
  }
  return false
}
