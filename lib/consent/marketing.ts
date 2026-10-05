// lib/consent/marketing.ts
//
// MARKETING CONSENT, PURE AND CLIENT-SAFE (LEAD1 L6, Oct 2026; design in docs/review/design-lead1.md section 5, table
// M5). The wording a visitor sees, its version, and the rules for what a set of consent rows means. No Supabase, no
// crypto (the unsubscribe token is server-only, lib/consent/unsubscribeToken.ts).
//
// ⚠️ THE WORDING IS STORED EXACTLY AS SHOWN, BY VERSION. The browser shows MARKETING_CONSENT.wording and sends only the
// version; the server stores the wording it holds for that version (consentWordingFor). So a record can never say a
// visitor agreed to words they were not shown, and a client cannot write its own wording into the proof. Changing the
// sentence means adding a NEW version here, never editing an old one: rows already stored name the old version.
//
// ⚠️ NOTHING DEPENDS ON THE ANSWER. Account creation and the claim go ahead ticked or not (CASL; design 5).

export const MARKETING_PURPOSE = 'updates' as const

/** Every wording ever shown, by version. Append only. */
// v1 (Lisa, 5 Oct 2026), set before any choice was recorded. A change to the sentence is v2, beside it.
export const MARKETING_CONSENT_VERSIONS: Record<string, string> = {
  v1: 'Send me occasional ThemisIQ updates about sustainability reporting and compliance. You can unsubscribe at any time.',
}
export const MARKETING_CONSENT = { version: 'v1', wording: MARKETING_CONSENT_VERSIONS.v1 } as const

export function consentWordingFor(version: unknown): string | null {
  return typeof version === 'string' && Object.prototype.hasOwnProperty.call(MARKETING_CONSENT_VERSIONS, version)
    ? MARKETING_CONSENT_VERSIONS[version] : null
}

/** Where the choice was made, as recorded. A path, at most 200 characters; anything else reads as the default. */
export function cleanSourcePage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const s = raw.trim().slice(0, 200)
  return s.startsWith('/') && !/[\u0000-\u001f]/.test(s) ? s : fallback
}

export const KEEP_RESULTS_SOURCE = '/dashboard/ghg (Keep my results)'
export const DASHBOARD_SOURCE = '/dashboard (Email updates)'

/** The choice a "Keep my results" submission carries, as the client sends it and the hold keeps it. */
export type ConsentChoice = { granted: boolean; version: string; sourcePage: string }

/** A choice from a request body or a held payload, or null when there is none (no box was shown). */
export function readConsentChoice(o: unknown, fallbackSource: string): ConsentChoice | null {
  const v = o && typeof o === 'object' ? (o as Record<string, unknown>) : null
  if (!v || typeof v.granted !== 'boolean') return null
  return {
    granted: v.granted,
    version: typeof v.version === 'string' ? v.version : '',
    sourcePage: cleanSourcePage(v.sourcePage, fallbackSource),
  }
}

/** An address with all but its first character hidden before the @: lisa@example.com reads l***@example.com. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export type ConsentRow = { id: string; granted: boolean; created_at: string; withdrawn_at: string | null }

/**
 * What a person's rows mean today: the NEWEST row decides. Granted and not withdrawn: active (the row returned, its id
 * signs the unsubscribe link). Anything else: not active. A later "no" after a "yes" is a no; a withdrawal ends a yes.
 */
export function activeConsent<T extends ConsentRow>(rows: readonly T[]): T | null {
  const newest = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  return newest && newest.granted && !newest.withdrawn_at ? newest : null
}

// ── Words the screens show ────────────────────────────────────────────────────────────────────────────────────────

export const CONSENT_COPY = {
  emailLink: 'Unsubscribe from ThemisIQ updates',
  emailTextLine: (url: string) => `Unsubscribe from ThemisIQ updates: ${url}`,
  checking: 'Checking your link…',
  confirmLine: (masked: string) => `This stops ThemisIQ updates to ${masked}. We will still send the emails you ask for, such as sign-in codes and your results.`,
  confirmButton: 'Unsubscribe from ThemisIQ updates',
  unsubscribing: 'Unsubscribing…',
  unsubscribed: 'You are unsubscribed from ThemisIQ updates. We will still send the emails you ask for, such as sign-in codes and your results.',
  linkInvalid: 'This unsubscribe link is not valid. Choose your email updates on your dashboard, or email hello@themisiq.co and we will remove you.',
  linkExpired: 'This unsubscribe link has expired. Choose your email updates on your dashboard, or email hello@themisiq.co and we will remove you.',
  failed: 'We could not change your choice just now. Nothing was changed; try again in a moment, or email hello@themisiq.co.',
  settingsTitle: 'Email updates',
  settingsIntro: 'Choose whether ThemisIQ sends you occasional updates. This does not affect emails you ask for.',
  settingsOn: 'You are receiving updates.',
  settingsOff: 'You are not receiving updates.',
  settingsSave: 'Save my choice',
  settingsSaving: 'Saving…',
  settingsSaved: 'Your choice is saved.',
  settingsSignIn: 'Sign in to choose your email updates.',
} as const
