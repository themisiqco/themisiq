// lib/ghg/uploadPath.ts
//
// BR2: WHERE A BILL IS STORED, AND HOW THE EXTRACT ROUTE READS THE INVENTORY BACK OUT OF IT. One builder for the
// wizard and one parser for /api/concierge/extract, so the two cannot disagree about the format.
//
//   {userId}/{inventoryId}/{reporting year}/{location}/{timestamp}_{file}
//
// Since BR2 every new upload goes to a saved inventory (the upload saves it first), so the inventory id is always
// there. Uploads before BR2 are stored as {userId}/{reporting year}/{location}/{timestamp}_{file}, with no inventory.
// Every other reader treats a path as opaque (delete, withdraw, the verifier routes, the PDF, erasure), so both
// formats keep working everywhere except the extract route, which refuses the old one: it cannot tell which inventory
// an old path belongs to, so it cannot tell whether that inventory's bills may go to the AI.
//
// ⚠️ THE BROWSER CHOOSES THE INVENTORY SEGMENT. The storage policy checks only that the first segment is the caller.
// The route proves the caller owns the path and the inventory it names; it cannot prove the bill belongs to that
// inventory rather than another of the same customer's. Accepted (BR2 ruling, 10 Oct 2026), and recorded in the
// register (BR-01).
//
// Pure: no Supabase.

/** A segment as stored: letters, digits, dot, underscore and hyphen; anything else becomes "_". Never empty. */
export function pathSegment(s: string | null | undefined, fallback: string): string {
  const out = (s ?? '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return out.replace(/_/g, '') === '' ? fallback : out
}

/** The storage path for a new upload. Every part is one segment, so a "/" in a name can never add one. */
export function buildUploadPath(userId: string, inventoryId: string, year: number, locationName: string, at: number, fileName: string): string {
  return [userId, inventoryId, String(year), pathSegment(locationName, 'location'), `${at}_${pathSegment(fileName, 'file')}`].join('/')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The user and inventory a stored path names, or null when it is not in the BR2 format: an old path (a year where the
 * inventory belongs), or anything else. Read strictly: five segments, the second a uuid, the third a year.
 */
export function parseUploadPath(path: string | null | undefined): { userId: string; inventoryId: string } | null {
  if (!path) return null
  const s = path.split('/')
  if (s.length !== 5 || s.some(x => x === '')) return null
  if (!UUID.test(s[1]) || !/^\d{4}$/.test(s[2])) return null
  return { userId: s[0], inventoryId: s[1] }
}
