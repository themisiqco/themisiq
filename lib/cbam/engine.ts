import { CO2_C_RATIO } from './params';
import type { SourceStream } from './types';

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
