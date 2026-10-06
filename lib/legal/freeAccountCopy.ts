// lib/legal/freeAccountCopy.ts
//
// LEAD1 L10 (Oct 2026; design section 5): the free-account text on the Privacy Policy (Section 3) and the Terms
// (Section 3). Plain text, kept here because a page may export only what Next allows, and so lib/lead1L10.test.ts can
// hold each sentence to what the code does. ⚠️ Change a sentence only together with the code it describes, and send
// any change to the lawyer reviewing these pages.

// ── Privacy Policy, Section 3: Free accounts ─────────────────────────────────────────────────────────────────────
export const FREE_ACCOUNT_INTRO = 'You can calculate Scope 1 and Scope 2 emissions on ThemisIQ without an account. If you choose "Keep my results", we create a free account for you and keep that one calculation. This is what that collects, why, and for how long.'

export const FREE_ACCOUNT_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ['Your name', 'To address your results email and identify your account.', 'While the account exists.'],
  ['Your work email', 'To send your sign-in code, sign you in, and email you your results.', 'While the account exists.'],
  ['Your company', 'To name the company your calculation is saved under.', 'While the account exists.'],
  ['Your calculation: the sites and figures you entered, and the results worked out from them', 'To save it to your account and email it to you. Until you confirm your email, we hold a copy so that you can confirm on another device.', 'The held copy: deleted when you confirm, or no longer usable after 24 hours. The saved calculation: while the account exists.'],
  ['The country of your first site', 'To understand which countries our free accounts report from.', 'While the account exists.'],
  ['Your IP address', 'To limit repeated requests and sign-ups from one connection, which protects the service from abuse.', 'With the held copy, for up to 24 hours. In our rate-limit records, as security records.'],
  ['Your marketing choice, with your IP address and browser details (user agent) and the time', 'To prove what you agreed to, as Canada\'s anti-spam law (CASL) requires. We record your choice whether or not you tick the box.', 'As a marketing consent record: 3 years from your last interaction with us.'],
] as const

export const FREE_ACCOUNT_PROCESSORS = 'The free account uses these service providers: Supabase stores the account, the calculation and the consent records, and sends your sign-in code; Resend delivers the sign-in code and results emails; Cloudflare Turnstile checks that the forms are used by a person, and receives your IP address and browser details for that check; Vercel hosts the site and receives your IP address with each request. Stripe is not involved unless you buy a plan.'

export const FREE_ACCOUNT_MARKETING = 'The box asking whether you want occasional updates is unticked and optional, and your account does not depend on it. You can withdraw your consent at any time with the unsubscribe link in an email that carries one, or under "Email updates" on your dashboard. Withdrawal takes effect immediately. We keep the record of your choice and of your withdrawal, with the time of each, as proof of consent; withdrawing does not delete that record.'


export const FREE_ACCOUNT_TERMS_INTRO = 'You can create a free account to keep one Scope 1 and Scope 2 calculation. The following applies to free accounts.'

export const FREE_ACCOUNT_TERMS: readonly string[] = [
  'No fee: a free account costs nothing and does not turn into a paid plan.',
  'One calculation: a free account keeps one Scope 1 and Scope 2 calculation. Document uploads, report downloads, Scope 3 and further inventories need a paid GHG plan.',
  'Indicative figures: the figures in a free calculation are indicative. You remain responsible for checking them before you rely on them or use them in any filing, disclosure or decision (see Section 11).',
  'On purchase: if you buy the GHG module, your free calculation becomes the first inventory of your plan. Nothing is copied and nothing you entered is lost.',
  'Provided as is: the free account is provided as is and as available, without warranty, to the extent permitted by law.',
  'Inactive accounts: ThemisIQ may delete a free account that has had no sign-in for 24 months, after giving 30 days\' notice by email.',
  'Business use: Section 1 (Business-only eligibility) applies to free accounts too.',
]
