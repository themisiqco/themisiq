// ── WHICH ACTIVITY ROWS PRODUCED THE SAVED CATEGORY 3 FIGURE ─────────────────────────────────────
//
// Category 3 is the only category whose inputs live in ANOTHER module. A customer can save a Scope 3
// record, go back to the GHG wizard, change a meter reading, and the saved Category 3 figure is then
// describing energy that is no longer in the inventory. Nothing on the Scope 3 page would say so: the
// panel recalculates from the bound inventory on every render, so the screen is always current and the
// STORED record is the thing that goes stale.
//
// ⚠️ NOT updated_at, AND NOT THE FIGURE. `ghg_inventories.updated_at` moves when anything at all is
// saved in the GHG module, including a company name or a note, and it does not move when a coverage
// resolution changes what an existing figure resolves TO. Comparing totals is worse still: two
// different inventories can price to the same number, and a total that has not moved is not evidence
// that the inputs have not. So the comparison is over the inputs themselves.
//
// ⚠️ PER ROW, SO THE NOTICE CAN NAME WHAT MOVED WITHOUT STORING WHAT IT WAS. One hash over everything
// could only say "something changed". A hash PER (location, stream) says which rows changed, which
// appeared and which are gone, while the values themselves are never written into cat_data: a hash is
// one way. The location names and stream names ARE stored, in clear, because naming them is the whole
// point; they are the customer's own labels, in the customer's own record.
//
// Task 7 of ~/themisiq-sources/findings/cat3-design.md, Q6: it lives in cat_data.cat3.source_fingerprint,
// so there is no migration and it round-trips with the record the page already writes whole.

import type { Cat3Inputs, Cat3InputRow } from './cat3Energy'

/** One row's identity and a hash of what it held. `h` is 16 hex characters, two FNV-1a passes. */
export interface Cat3RowPrint {
  location: string
  stream: string
  h: string
}

export interface Cat3Fingerprint {
  /** Bumped only if what goes INTO a row hash changes; an older version cannot be compared, and says so. */
  version: 1
  rows: Cat3RowPrint[]
}

/**
 * FNV-1a over the UTF-16 code units of a canonical string, run twice from different offsets and joined:
 * 64 bits, as 16 hex characters.
 *
 * ⚠️ NOT A SECURITY HASH, AND IT DOES NOT NEED TO BE. It answers "is this the same row as before" for a
 * handful of rows in one record. Node's crypto is not in the browser bundle and SubtleCrypto is async,
 * which would make every render of the panel a promise.
 *
 * ⚠️ Math.imul AND >>> 0, NOT BigInt: this repo's tsconfig targets below ES2020, so a BigInt literal does
 * not compile. Math.imul is the exact 32-bit multiply these constants need; a plain `*` would lose the
 * low bits to the double's 53-bit mantissa and quietly weaken the hash.
 */
function fnv1a32(text: string, offset: number): number {
  let h = offset >>> 0
  for (let i = 0; i < text.length; i++) {
    h = (h ^ text.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}
const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
/** The two offsets are FNV's own 32-bit basis and the same basis with its bits inverted. */
function rowHash(text: string): string {
  return hex8(fnv1a32(text, 2166136261)) + hex8(fnv1a32(text, ~2166136261))
}

/**
 * The canonical form of one row: exactly the six things that decide what Category 3 prices from it.
 *
 * IN, and why each one is in:
 *   location   the row's own identity, and what the notice names. A rename is a change.
 *   stream     ditto: natural gas becoming propane at the same site is a different row.
 *   activity   the figure itself, as the row carries it after the inventory's coverage resolutions.
 *   unit       500 gallons and 500 litres are different energy, and the unit chooses the factor route.
 *   country    it decides the UK stand-in disclosure, and for New Zealand which 3c figure is used.
 *   nz_td      the engine's own New Zealand transmission figure, which Category 3 uses as published.
 *
 * OUT, and why each exclusion is safe:
 *   entry_method            manual, concierge or concierge-extrapolated describes HOW the figure got
 *                           into the inventory, not what it is. The same 500 gallons prices identically.
 *   country_resolved        derived from `country`: null country is the unresolved case, and null is
 *                           already in the canonical string.
 *   scope2_method           the adapter passes on the location-based row only; a market-based row never
 *                           reaches here, so the field is constant among the rows that do.
 *   scope1_publisher        a CITATION, not an input. It changes the wording of the stand-in disclosure
 *                           and not one figure. ⚠️ Stated consequence: if the GHG module re-cites a row
 *                           (a new eGRID vintage, say), the saved figure is still right and the notice
 *                           stays silent, although the disclosure text would read differently on a
 *                           re-save. That is the trade for a fingerprint that does not cry wolf.
 *   the declaration answers Attesting a stream absent can move the category from withheld to a figure,
 *                           and it is NOT in here: the fingerprint compares the activity, and a record
 *                           saved while the category was withheld has no figure to go stale. Item 5's
 *                           load cases say what happens in each of those states.
 *   everything else in the GHG inventory  company, year, GWP version, refrigerants, market-based rows,
 *                           coverage resolutions that changed nothing, notes. None of it reaches the
 *                           Category 3 calculation, so none of it may move this value.
 */
function canonicalRow(r: Cat3InputRow): string {
  return [
    r.location.trim(),
    r.stream,
    // The number as JavaScript writes it: the same double gives the same characters everywhere.
    String(r.activity),
    // A unit is a label, and 'kWh' and 'kwh' are the same unit. Case and padding must not read as a change.
    r.unit.trim().toLowerCase(),
    // null and '' are both "no country"; either way the row is treated as outside the UK.
    (r.country ?? '').trim().toUpperCase(),
    r.nz_td_result_tco2e == null ? '' : String(r.nz_td_result_tco2e),
  ].join('\u0000')
}

/**
 * The fingerprint of the inputs Category 3 read, or of an empty inventory.
 *
 * ⚠️ AN EMPTY LIST IS A FINGERPRINT, NOT AN ABSENCE. An inventory whose every stream is answered and
 * holds nothing prices to a calculated zero, and `rows: []` is exactly right for it: if a location later
 * gains a meter reading, the comparison sees a row appear.
 */
export function cat3Fingerprint(inputs: Cat3Inputs | null | undefined): Cat3Fingerprint {
  const rows = (inputs?.rows ?? []).map(r => ({
    location: r.location, stream: r.stream, h: rowHash(canonicalRow(r)),
  }))
  // Sorted, so the same inventory read twice gives the same value whatever order the workings arrived in.
  rows.sort((a, b) => (a.location === b.location
    ? a.stream.localeCompare(b.stream)
    : a.location.localeCompare(b.location)))
  return { version: 1, rows }
}

export interface Cat3FingerprintChange {
  /** Same location and stream, different figure, unit, country or New Zealand line. */
  changed: { location: string; stream: string }[]
  /** A row that was not in the inventory when this record was saved. */
  added: { location: string; stream: string }[]
  /** A row that was there and is not now. */
  removed: { location: string; stream: string }[]
}

/** Whether a stored value is a fingerprint this version can compare. Anything else is unreadable. */
export function isCat3Fingerprint(stored: unknown): stored is Cat3Fingerprint {
  if (typeof stored !== 'object' || stored === null) return false
  const s = stored as { version?: unknown; rows?: unknown }
  if (s.version !== 1 || !Array.isArray(s.rows)) return false
  return s.rows.every(r => typeof r === 'object' && r !== null
    && typeof (r as Cat3RowPrint).location === 'string'
    && typeof (r as Cat3RowPrint).stream === 'string'
    && typeof (r as Cat3RowPrint).h === 'string')
}

/**
 * What changed between the fingerprint stored with a record and the inventory as it stands.
 *
 * ⚠️ null MEANS "NO COMPARISON WAS POSSIBLE", NOT "NOTHING CHANGED", and the two must never be conflated
 * on screen. A record saved before this field existed, or one carrying a shape this version cannot read,
 * returns null: we do not know whether it is stale, and saying either way would be a claim nobody made.
 */
export function cat3FingerprintChange(
  stored: unknown, now: Cat3Fingerprint,
): Cat3FingerprintChange | null {
  if (!isCat3Fingerprint(stored)) return null
  const key = (r: { location: string; stream: string }) => `${r.location}\u0000${r.stream}`
  const before = new Map(stored.rows.map(r => [key(r), r]))
  const after = new Map(now.rows.map(r => [key(r), r]))
  const changed: Cat3FingerprintChange['changed'] = []
  const added: Cat3FingerprintChange['added'] = []
  const removed: Cat3FingerprintChange['removed'] = []
  for (const [k, r] of after) {
    const was = before.get(k)
    if (!was) added.push({ location: r.location, stream: r.stream })
    else if (was.h !== r.h) changed.push({ location: r.location, stream: r.stream })
  }
  for (const [k, r] of before) if (!after.has(k)) removed.push({ location: r.location, stream: r.stream })
  return { changed, added, removed }
}

/** Whether a comparison found anything. A change object with three empty lists is a match. */
export const cat3FingerprintMoved = (c: Cat3FingerprintChange | null): boolean =>
  c !== null && (c.changed.length > 0 || c.added.length > 0 || c.removed.length > 0)
