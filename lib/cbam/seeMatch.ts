// lib/cbam/seeMatch.ts
// Shared stale-record tolerance for the CBAM see_record tripwire. Used by BOTH the verifier route
// and the owner report route so the two comparisons can never drift apart.
//
// WHY A TOLERANCE (and why exactly 1e-9): the stored see_record and a fresh loadAndComputeProcess
// recomputation run the same engine, but the direct/indirect legs are float64 sums (massBalance is a
// non-associative reduce; the precursor roll-up is another). Any change in stream/precursor row
// order — an UPDATE, a VACUUM, a read replica — reshuffles those sums by ~1 ULP (~1e-17 t/t). Exact
// `!==` reads that last-bit noise as tampering and 409s on an identical figure. 1e-9 t/t sits ~8
// orders of magnitude above that ULP noise, yet far below any physically or fraudulently meaningful
// change to an embedded-emissions figure — so it kills the false positive while the tripwire still
// fires on real divergence (which is orders of magnitude larger than 1e-9).
//
// Do NOT widen this. Do NOT compare see_total instead of the two legs — a compensating error across
// direct/indirect could net to zero on the total and slip through.
export const SEE_EPSILON = 1e-9;

export function seeRecordMatches(
  stored: { direct: number; indirect: number },
  recomputed: { direct: number; indirect: number },
): boolean {
  return Math.abs(stored.direct - recomputed.direct) <= SEE_EPSILON
      && Math.abs(stored.indirect - recomputed.indirect) <= SEE_EPSILON;
}
