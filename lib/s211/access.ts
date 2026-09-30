// lib/s211/access.ts
// Who may use the S-211 report builder while it is unpriced: an allow-list of Supabase user ids in the
// server-only environment variable S211_PREVIEW_USER_IDS, comma-separated.
//
// SERVER-SIDE ONLY. The variable has no NEXT_PUBLIC_ prefix, so it never reaches the browser, and the
// only reader is lib/s211/server.ts, which every S-211 API route calls before it touches the database.
// Anyone not on the list gets a 404 from the API, and the pages show the 404 page. Not a paywall: the
// module is not for sale yet, and a paywall would advertise it.
//
// Unset or empty means NOBODY. A typo in the variable closes the builder; it never opens it to all.

export const S211_PREVIEW_ENV = 'S211_PREVIEW_USER_IDS'

/** The ids in the variable: trimmed, blanks dropped. */
export const parsePreviewIds = (raw: string | undefined | null): Set<string> =>
  new Set((raw ?? '').split(',').map(s => s.trim()).filter(Boolean))

/** True only for a non-empty user id that is on the list. */
export const isPreviewUser = (userId: string | undefined | null, raw: string | undefined | null): boolean =>
  !!userId && parsePreviewIds(raw).has(userId)
