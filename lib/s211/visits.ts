// lib/s211/visits.ts
// "In plain terms" and "What readers look for" open on the first visit to a section and stay closed after.
// A per-viewer convenience kept in the browser; if storage is unavailable they open every time.
//
// ⚠️ READ ONCE, BEFORE THE VISIT IS RECORDED. The page first read this inside the same callback that
// recorded the visit, on data load. React runs effects twice in development, so the second run read
// "visited" and closed both panels on every first visit. The page now reads it once when the section
// mounts (in a state initializer) and records the visit afterwards.

export type VisitStore = { getItem(k: string): string | null; setItem(k: string, v: string): void }
const key = (reportId: string, section: string) => `themisiq:s211:visited:${reportId}:${section}`

export const isFirstVisit = (store: VisitStore | null, reportId: string, section: string): boolean => {
  try { return store?.getItem(key(reportId, section)) !== '1' } catch { return true }
}
export const recordVisit = (store: VisitStore | null, reportId: string, section: string): void => {
  try { store?.setItem(key(reportId, section), '1') } catch { /* storage unavailable */ }
}
export const browserStore = (): VisitStore | null => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}
