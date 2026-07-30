// lib/cbam/boundaryGuidanceView.ts
// VIEW MODEL for the boundary guidance surface. Pure data in, pure data out: no React, no
// Supabase, no imports outside lib/cbam. A renderer consumes this; it renders nothing itself.
//
// The layering is boundaries.ts (the transcribed text) -> boundariesLookup.ts (which entries
// apply) -> here (how they are framed for a customer). Each layer may only weaken, never
// invent: this file chooses headings, ordering and grouping, and touches no regulatory text.
//
// FOUR RULES THIS FILE EXISTS TO HOLD.
//
// 1. PROVISIONS PASS THROUGH BYTE-IDENTICAL. The arrays handed out here hold the very same
//    string values that are in boundaries.ts — not paraphrased, not truncated, not re-wrapped,
//    not sentence-cased, not trimmed. A customer may quote them to a verifier who holds the OJ,
//    and boundaries.test.ts checks those strings against the committed extract. Any edit here
//    would break a guarantee that is enforced one layer down and invisible from this one.
//
// 2. CITES ARE AS PUBLISHED. `cite` names where the section is printed: 'Annex I, point
//    3.15.2.1'. Outbound references — a section pointing at Annex II or Annex III — are NOT
//    emitted, and that is deliberate. Some of them are misprinted in the OJ, and boundaries.ts
//    records both the printed location and the operative one. Emitting the operative form would
//    show a customer a reference they cannot find in the Official Journal; emitting both, or
//    explaining the difference, would put our editorial commentary into a guidance surface. The
//    printed references already appear inside the provision text itself, verbatim, which is
//    where a reader will meet them and the form they will meet them in.
//
// 3. NO CODES IN DISPLAY STRINGS. Route codes and category codes are ours — 'eaf_scrap',
//    'iron_steel_products' — and appear nowhere a customer reads. Routes FILTER; they are never
//    printed. Nothing returned by this module contains either.
//
// 4. THE FRAMING IS OURS AND IS NOT ATTRIBUTED TO THE REGULATION. The three headings and
//    lead-ins below are plain-language wrappers we wrote. The regulation does not group its
//    sections this way, does not head them this way, and does not direct that they be shown in
//    this order. No string here says or implies otherwise. If that framing is ever put in front
//    of a verifier, it must be legible as ours.
import { lookupBoundaries } from './boundariesLookup';
import type { BoundaryEntry } from './boundaries';

export interface BoundaryGuidanceEntry {
  /** Where the section is printed, e.g. 'Annex I, point 3.15.2.1'. */
  cite: string;
  /** Byte-identical to boundaries.ts. Never edited here. */
  provisions: string[];
}

export interface BoundaryGuidanceGroup {
  key: 'crossSectoral' | 'specialProvisions' | 'boundaries';
  heading: string;
  leadIn: string;
  entries: BoundaryGuidanceEntry[];
}

export interface BoundaryGuidanceView {
  totalProvisions: number;
  groups: BoundaryGuidanceGroup[];
}

/**
 * OUR PLAIN-LANGUAGE FRAMING. Not the regulation's headings, not its ordering, not its
 * grouping — see rule 4 above. Written for someone who has never read Annex I and does not
 * know what a 'system boundary' or an 'aggregated goods category' is.
 *
 * The second lead-in earns its wording: a special provision reaches every category it
 * allocates between, so a rule printed under one sector's number is routinely returned for
 * another's. Saying 'these also cover some other goods, not just yours' prepares a reader for
 * text that names a good they do not make, which would otherwise look like a mistake.
 */
const GROUP_COPY: ReadonlyArray<{ key: BoundaryGuidanceGroup['key']; heading: string; leadIn: string }> = [
  {
    key: 'crossSectoral',
    heading: 'Rules that apply to every good',
    leadIn: 'These apply to all CBAM goods, whatever you make.',
  },
  {
    key: 'specialProvisions',
    heading: 'Rules for this group of goods',
    leadIn: 'These also cover some other goods, not just yours.',
  },
  {
    key: 'boundaries',
    heading: "What counts as part of this good's emissions",
    leadIn: "Where this good's emissions start and stop.",
  },
];

/**
 * Annex I is where every entry in BOUNDARIES lives — §3 is a point of Annex I — so the annex is
 * constant and the section number is what varies. 'as published' means exactly this form: what
 * a reader will find in the Official Journal, with nothing corrected and nothing appended.
 */
function citeOf(entry: BoundaryEntry): string {
  return `Annex I, point ${entry.section}`;
}

function toEntries(entries: BoundaryEntry[]): BoundaryGuidanceEntry[] {
  return entries.map((e) => ({
    cite: citeOf(e),
    // Copied by reference into a new array: the array is new so a caller cannot mutate
    // BOUNDARIES through it, and the STRINGS are the same values, which is the point — rule 1.
    provisions: [...e.provisions],
  }));
}

/**
 * Build the guidance view for one category, optionally narrowed to one production route.
 *
 * Returns null — not an empty view — when no category is selected. Null says 'there is nothing
 * to show yet'; an empty view says 'we looked and found nothing', which is a different claim
 * and would be false. A renderer can show nothing for null and an honest 'no guidance held'
 * state for an empty view.
 *
 * A group with no entries is OMITTED rather than rendered empty. An empty 'What counts as part
 * of this good's emissions' heading reads as though the regulation is silent on the boundary,
 * which for every live category it is not.
 *
 * Route narrowing is delegated entirely to lookupBoundaries, including its rule that an entry
 * with no routes is never filtered out. Do not re-implement that here.
 */
export function buildBoundaryGuidanceView(
  categoryCode: string | null,
  routeCode?: string | null,
): BoundaryGuidanceView | null {
  const cat = (categoryCode ?? '').trim();
  if (cat === '') return null;

  const found = lookupBoundaries(cat, routeCode ?? null);
  const source: Record<BoundaryGuidanceGroup['key'], BoundaryEntry[]> = {
    crossSectoral: found.crossSectoral,
    specialProvisions: found.specialProvisions,
    boundaries: found.boundaries,
  };

  const groups: BoundaryGuidanceGroup[] = [];
  for (const copy of GROUP_COPY) {
    const entries = toEntries(source[copy.key]);
    if (entries.length === 0) continue;
    groups.push({ key: copy.key, heading: copy.heading, leadIn: copy.leadIn, entries });
  }

  // Counted over the INCLUDED groups only, so it always matches what a renderer will show. A
  // count taken before omission would promise text the surface does not display.
  const totalProvisions = groups.reduce(
    (n, g) => n + g.entries.reduce((m, e) => m + e.provisions.length, 0),
    0,
  );

  return { totalProvisions, groups };
}
