// lib/cbam/sefa.ts
// IR (EU) 2025/2620 specific embedded free allocation (SEFA), as pure functions. Same pattern as
// benchmarks.ts: all logic lives here and is unit-testable; the DB fetch (CBAM_y, CSCF_y, the
// Column A/B benchmark) is wired separately later. Nothing here touches Supabase.
//
// The equations, from the extraction:
//   Eq 2 (actual-data path):  SFA_Proc_g,y = CBAM_y × CSCF_y × BM*_g   — uses Column A
//   Eq 6 (default path):      SEFA_g       = CBAM_y × CSCF_y × BM_g    — uses Column B
//   Eq 4 (complex goods):     SEFA_g       = SFA_Proc_g + Σ (m_i × SEFA_i),  m_i = M_i / AL_i
// §3.3: the recursion repeats using Equations 2, 3 and 4 until no more precursors are relevant.
//
// SEFA mirrors the SEE engine deliberately (computeSEE / resolveSEE in engine.ts): same joint-
// precursor skip, same m_i = M_i / AL, same "fail loud, never a silent zero" stance. Where SEE
// records unresolved flags, SEFA THROWS — the free-allocation figure is not partially computable,
// so an unresolvable precursor must stop the calculation rather than under-state the allocation.
import type { PrecursorInput } from './types';

export interface SEFAResult {
  sefa: number;                   // SEFA_g = sfaProc + Σ m_i·SEFA_i  (Eq 4)
  sfaProc: number;                // SFA_Proc_g — this process's own free allocation (Eq 2)
  precursorContribution: number;  // Σ m_i · SEFA_i
}

// Injected resolver context for a precursor's SEFA_i — supplied by the DB/route layer later, same
// split of concerns as ResolveContext in engine.ts: this file decides WHICH branch applies; the
// caller provides HOW to fetch the default benchmark and how to recurse.
export interface SEFAContext {
  isEuOrExempted: (country: string) => boolean;
  cbamFactor: number;                              // CBAM_y for the reporting year
  cscf: number | null;                             // CSCF_y — null when unpublished; NEVER 1.0-by-default
  defaultBenchmarkB: (p: PrecursorInput) => number; // BM_g, Column B, for the default path (Eq 6)
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Eq 2 / Eq 6 core: CBAM_y × CSCF_y × benchmark.
 *
 * CSCF (cscf) is nullable and a null MUST throw. Spec §11.1: CSCF_y is confirmed unpublished for
 * 2026-2030, and the absence of a published value is not itself a value — substituting 1.0 would
 * fabricate a regulatory multiplier and silently under- or over-state the free allocation. A year
 * where the Commission publishes "no correction needed" is cscf = 1.0 (an affirmed value), NOT
 * null; only the DB's cscf_status = 'published' path may supply that 1.0. When cscf is null, SEFA
 * is simply not determinable and the calculation stops here.
 */
export function sfaProc(cbamFactor: number, cscf: number | null, benchmark: number): number {
  if (cscf === null) {
    throw new Error(
      'sfaProc: CSCF_y is null (unpublished — IR 2025/2620 CSCF is not published for 2026-2030). ' +
        'SEFA is NOT determinable and must not proceed. Never treat a null CSCF as 1.0; a published ' +
        '"correction not needed" year is cscf = 1.0, which is a value, not null. See spec §11.1.',
    );
  }
  if (!isFiniteNum(cbamFactor)) {
    throw new Error(`sfaProc: cbamFactor (CBAM_y) must be a finite number, got ${String(cbamFactor)}.`);
  }
  if (!isFiniteNum(cscf)) {
    throw new Error(`sfaProc: cscf (CSCF_y) must be a finite number when non-null, got ${String(cscf)}.`);
  }
  if (!isFiniteNum(benchmark)) {
    throw new Error(`sfaProc: benchmark (BM*_g / BM_g) must be a finite number, got ${String(benchmark)}.`);
  }
  return cbamFactor * cscf * benchmark;
}

/**
 * Eq 4 — complex-goods roll-up. SEFA_g = SFA_Proc_g + Σ (m_i × SEFA_i).
 *
 * sfaProcValue is this process's own SFA_Proc, already computed via sfaProc() by the caller.
 * 'joint' precursors are skipped — they are already inside the process (same rule as computeSEE),
 * so their free allocation is already reflected in sfaProc and must not be added again.
 * m_i = M_i / AL (Eq 4). resolveSefaI yields each precursor's SEFA_i (typically resolvePrecursorSefa).
 */
export function computeSEFA(
  sfaProcValue: number,
  precursors: PrecursorInput[],
  activityLevel: number,
  resolveSefaI: (p: PrecursorInput) => number,
): SEFAResult {
  if (activityLevel <= 0) throw new Error('computeSEFA: activityLevel (AL_g) must be > 0');

  let precursorContribution = 0;
  for (const p of precursors) {
    if (p.boundary === 'joint') continue;             // already inside SFA_Proc — never double-count
    const mI = p.massConsumed / activityLevel;        // m_i = M_i / AL
    precursorContribution += mI * resolveSefaI(p);
  }

  return {
    sefa: sfaProcValue + precursorContribution,
    sfaProc: sfaProcValue,
    precursorContribution,
  };
}

/**
 * Resolve one precursor's SEFA_i. Provenance fork, parallel to resolveSEE in engine.ts — but every
 * branch that resolveSEE can only partially handle, SEFA must refuse outright rather than guess.
 *
 * EU/exempted origin is checked FIRST and THROWS. resolveSEE zero-rates an EU-origin precursor's
 * SEE, but whether an EU-origin precursor carries free allocation is NOT established by anything we
 * have pulled — it is an OPEN QUESTION. Do not assume 0: a wrong 0 would over-state the net figure.
 */
export function resolvePrecursorSefa(p: PrecursorInput, ctx: SEFAContext): number {
  if (ctx.isEuOrExempted(p.originCountry)) {
    throw new Error(
      `resolvePrecursorSefa: precursor ${p.cnCode} has EU/exempted origin (${p.originCountry}), and ` +
        'whether an EU-origin precursor carries embedded free allocation is not established by any ' +
        'source we have pulled. Open question — do NOT assume 0.',
    );
  }
  switch (p.provenance) {
    case 'default':
      // Eq 6: SEFA_i = CBAM_y × CSCF_y × BM_g (Column B). Reuses sfaProc, so a null CSCF throws here too.
      return sfaProc(ctx.cbamFactor, ctx.cscf, ctx.defaultBenchmarkB(p));
    case 'computed_here':
      // Recursive SEFA for a separately-computed precursor (Eq 4 again, §3.3). Not in the MVP —
      // parallel to computeChildSEE, which also throws in MVP.
      throw new Error(
        `resolvePrecursorSefa: precursor ${p.cnCode} is 'computed_here' — recursive SEFA is not ` +
          'implemented in the MVP (parallel to computeChildSEE). Cannot resolve.',
      );
    case 'actual_verified':
      // KNOWN LIMITATION, parallel to spec §10.6 / the seeValue limitation in resolveSEE:
      // cbam_precursor_inputs has NO sefa_value column, so a verified precursor's own SEFA cannot be
      // expressed. Do NOT invent a field and do NOT fall back to the default benchmark — either would
      // silently substitute a different number for the verified one.
      throw new Error(
        `resolvePrecursorSefa: precursor ${p.cnCode} is 'actual_verified', but cbam_precursor_inputs ` +
          'has no sefa_value column — a verified precursor\'s SEFA cannot be expressed. Known ' +
          'limitation (parallel to spec §10.6); not falling back to a default. Cannot resolve.',
      );
  }
}
