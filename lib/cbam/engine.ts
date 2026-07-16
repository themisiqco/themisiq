import { CO2_C_RATIO } from './params';
import type { SourceStream, PrecursorInput, SEEResult, ResolveContext, UnresolvedFlag } from './types';

// Carbon content of a source stream. Eq 13 (ef_per_tj), Eq 14 (ef_per_t), Eq 15 (biomass).
// Fail loud on missing inputs — a missing carbon input must never silently become 0.
export function carbonContent(s: SourceStream): number {
  let ccPre: number;
  switch (s.ccMode) {
    case 'direct':
      if (s.cc == null) throw new Error('carbonContent: ccMode "direct" requires cc');
      ccPre = s.cc;
      break;
    case 'ef_per_t':
      if (s.ef == null) throw new Error('carbonContent: ccMode "ef_per_t" requires ef');
      ccPre = s.ef / CO2_C_RATIO;                 // Eq 14
      break;
    case 'ef_per_tj':
      if (s.ef == null || s.ncv == null) throw new Error('carbonContent: ccMode "ef_per_tj" requires ef and ncv');
      ccPre = (s.ef * s.ncv) / CO2_C_RATIO;        // Eq 13
      break;
  }
  return ccPre * (1 - s.bf);                        // Eq 15
}

// Emissions of one source stream. Eq 12: Em_k = f × AD_k × CC_k. Outputs (ad<0) come out negative.
export function streamEmissions(s: SourceStream): number {
  return CO2_C_RATIO * s.ad * carbonContent(s);
}

// DirEm* — sum over all streams. Single reduce; the sign convention does the netting, never subtract.
export function massBalance(streams: SourceStream[]): number {
  return streams.reduce((total, s) => total + streamEmissions(s), 0);
}

// AttrEm_Dir — attributed direct emissions of a production process. IR 2025/2547 Annex III, Eq 55.
// EAF single-process MVP: heat import/export, waste-gas corrections, and on-site electricity
// production are all zero, so Eq 55 collapses to max(0, DirEm*). The zero-floor is mandatory:
// "Where AttrEm_Dir is calculated to have a negative value, it shall be set to zero."
// PHASE 2 (integrated plants): AttrEm_Dir = max(0, DirEm* + emHimp − emHexp + wgCorrImp − wgCorrExp − emElProd)
export function attributeDirect(streams: SourceStream[]): number {
  return Math.max(0, massBalance(streams));
}

// Resolve one precursor's SEE_i. Provenance fork + EU-origin zero-rating (Eq 60 rule).
// Fails LOUD: an 'actual_verified' precursor without a valid verifier report falls to default
// AND records an unresolved flag — never a silent accept, never a silent zero.
export function resolveSEE(
  p: PrecursorInput,
  ctx: ResolveContext,
): { value: number; unresolved?: UnresolvedFlag } {
  if (ctx.isEuOrExempted(p.originCountry)) return { value: 0 }; // legitimate zero — the ONLY one
  switch (p.provenance) {
    case 'computed_here':
      return { value: ctx.computeChildSEE(p) };
    case 'actual_verified':
      if (!ctx.hasValidVerifierReport(p)) {
        return {
          value: ctx.defaultLookup(p),
          unresolved: { cnCode: p.cnCode, reason: 'missing_or_invalid_verifier_report' },
        };
      }
      if (p.seeValue == null) {
        return {
          value: ctx.defaultLookup(p),
          unresolved: { cnCode: p.cnCode, reason: 'verified_but_no_see_value' },
        };
      }
      return { value: p.seeValue };
    case 'default':
      return { value: ctx.defaultLookup(p) };
  }
}

// SEE_g = ae_g + Σ (m_i × SEE_i).  Eq 62/63/61.
// ae_g = AttrEm / AL_g.  m_i = M_i / AL_g.  'joint' precursors are already inside AttrEm → skipped.
export function computeSEE(
  attrEm: number,
  activityLevel: number,
  precursors: PrecursorInput[],
  ctx: ResolveContext,
): SEEResult {
  if (activityLevel <= 0) throw new Error('computeSEE: activityLevel (AL_g) must be > 0');
  const aeG = attrEm / activityLevel;                       // Eq 63
  let precursorContribution = 0;
  const unresolved: UnresolvedFlag[] = [];
  for (const p of precursors) {
    if (p.boundary === 'joint') continue;                   // already in AttrEm — never double-count
    const mI = p.massConsumed / activityLevel;              // Eq 61
    const r = resolveSEE(p, ctx);
    if (r.unresolved) unresolved.push(r.unresolved);
    precursorContribution += mI * r.value;                  // Eq 62 term
  }
  return { see: aeG + precursorContribution, aeG, precursorContribution, unresolved };
}
