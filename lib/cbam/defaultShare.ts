// lib/cbam/defaultShare.ts
// "The share of embedded emissions for which default values were used."
// IR (EU) 2025/2547 Annex IV — reporting item §1.2 (4)(b), which is WORD-FOR-WORD identical to
// §1.1 item 15(d). Pure functions, same seam pattern as benchmarks.ts / sefa.ts: all logic here,
// unit-testable, nothing touches Supabase. The caller passes in the resolution results the engine
// already produced (see below) so the share and the SEE figures cannot diverge.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE METHODOLOGY BELOW IS A DOCUMENTED ThemisIQ CHOICE, NOT A REGULATORY SPECIFICATION.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// All four parts of Annex IV have been extracted verbatim (§1.1, §1.1.1, §1.2, §2). NONE of them
// states a denominator, a unit, or whether "the share" covers the direct leg, the indirect leg, or
// both. §1.1 item 15(d) and §1.2 item (4)(b) carry the identical bare phrase and neither adds any
// further detail. Everything that follows is therefore our own defensible reading, recorded here so
// a verifier can see exactly where text ends and inference begins.
//
// The choice we make:
//   • Compute BOTH legs separately — defaultShareDirect and defaultShareIndirect. The regulation
//     gives no basis to collapse them, and the SEE engine already carries direct/indirect in
//     parallel (computeSEE), so we mirror it.
//   • Denominator = the good's embedded emissions FOR THAT LEG: see.direct for the direct share,
//     see.indirect for the indirect share.
//   • Numerator = Σ (m_i × SEE_i) over precursors whose SEE_i was resolved from a DEFAULT value,
//     for that leg. m_i = M_i / AL_g — the same weighting computeSEE uses, so the numerator is a
//     strict subset of the precursorContribution already inside the denominator.
//   • Stored as a FRACTION in [0,1], never a percentage. A percentage tempts a ×100 somewhere and
//     invites double-scaling at a boundary; the presentation layer multiplies by 100 to render.
//
// Which leg is item (4)(b)? We map (4)(b) to the DIRECT share. Rationale (INFERENCE, NOT TEXT):
// (4)(a) reads "specific DIRECT embedded emissions" and (4)(c) reads "share of INDIRECT emissions",
// so the drafter attaches a leg-qualifier whenever they mean one leg. (4)(b) omits the qualifier —
// which is a CONTRAST against its neighbours, not a resolution of it. Reading (4)(b) as the direct
// share makes it partition cleanly with (4)(c) rather than overlap it. This is the more coherent
// reading, but it is our inference; the words of (4)(b) alone do not settle it. The indirect share
// is computed here regardless, so whichever leg a verifier asks for is available.
//
// For Annex II goods (all chapter-72 crude steel) there is NO indirect leg: see.indirect is 0 and
// there are no indirect precursor contributions, so the direct share and the total share are the
// same number and the (4)(b) ambiguity does not bite for crude steel at all. It only matters for
// goods that carry an indirect leg.
import type { PrecursorInput, PrecursorResolution } from './types';

/**
 * The default-value share, per leg, as a fraction in [0,1] — or null where it is UNDEFINED.
 *
 * null ≠ 0. null means the leg's denominator was zero (or non-finite), so the ratio is not defined;
 * returning 0 there would ASSERT "no default values were used", a claim we would not have
 * established. 0 is reserved for a real computed zero — a good that genuinely defaulted nothing.
 */
export interface DefaultShareResult {
  direct: number | null;
  indirect: number | null;
}

// Whether a precursor's SEE_i counts as "a default value was used" (IR 2025/2547 Annex IV §1.2
// (4)(b) / §1.1 15(d)). Derived from resolveSEE's source discriminant in ONE place so the rule
// cannot drift. 'default_fallback' counts alongside plain 'default': it is an actual_verified
// precursor that fell back to the default value (no valid verifier report, or verified-but-null
// seeValue) — the operator INTENDED an actual figure, but the value being reported IS the default,
// so it is a defaulted contribution. 'eu_zero_rated', 'computed_here' and 'verified_actual' do not.
function fromDefault(source: PrecursorResolution['source']): boolean {
  return source === 'default' || source === 'default_fallback';
}

// A leg's share: numerator / denominator, but null for any non-positive or non-finite denominator.
// `> 0` (not `!== 0`) also swallows a negative denominator, which the SEE zero-floors should never
// produce but which — like NaN — is an undefined share, not a zero one.
function shareFor(numerator: number, denominator: number): number | null {
  if (!(denominator > 0) || !Number.isFinite(denominator)) return null;
  return numerator / denominator;
}

/**
 * Compute the default-value share for both legs of one good.
 *
 * `resolved` is keyed by precursor OBJECT IDENTITY — pass the SAME PrecursorInput objects you passed
 * to computeSEE, mapped to the SAME resolution results it saw. That reference-identity coupling is
 * the whole point: the share cannot be computed off a re-resolution that might disagree with the
 * engine's. A non-joint precursor absent from `resolved` is that divergence happening, so it THROWS
 * rather than being silently skipped.
 *
 * 'joint' precursors are skipped BEFORE the lookup — they are already inside the process's attributed
 * emissions (computeSEE never resolves them, so they are legitimately absent from `resolved`), the
 * same rule computeSEE applies.
 */
export function computeDefaultShare(
  precursors: PrecursorInput[],
  resolved: Map<PrecursorInput, PrecursorResolution>,
  activityLevel: number,
  see: { direct: number; indirect: number },
): DefaultShareResult {
  if (activityLevel <= 0) throw new Error('computeDefaultShare: activityLevel (AL_g) must be > 0');

  let numeratorDirect = 0;
  let numeratorIndirect = 0;

  for (const p of precursors) {
    if (p.boundary === 'joint') continue;                 // already inside AttrEm — never resolved

    const r = resolved.get(p);
    if (r == null) {
      // The precursor list and the resolution map have diverged — exactly what object-keying is
      // meant to prevent. Fail loud rather than under-count the numerator.
      throw new Error(
        `computeDefaultShare: precursor ${p.cnCode} is not present in the resolution map. ` +
          'Pass the same PrecursorInput objects and resolution results computeSEE consumed.',
      );
    }

    if (!fromDefault(r.source)) continue;                 // actual/computed — not a defaulted figure

    const mI = p.massConsumed / activityLevel;            // m_i = M_i / AL_g, as in computeSEE
    numeratorDirect += mI * r.direct;
    numeratorIndirect += mI * r.indirect;
  }

  return {
    direct: shareFor(numeratorDirect, see.direct),
    indirect: shareFor(numeratorIndirect, see.indirect),
  };
}
