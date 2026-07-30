// lib/cbam/boundariesLookup.ts
// The READ SIDE of BOUNDARIES. The data lives in boundaries.ts; selecting from it lives here,
// the same way cn.ts is kept separate from the cbam_cn_map table it reads.
//
// Pure functions over an in-memory array. No React, no Supabase, no I/O.
//
// THREE GROUPS, NOT ONE FLAT ARRAY — AND THE GROUPING IS OURS, NOT THE REGULATION'S.
//
// Annex I §3 splits every sector section into .1 and .2, consistently across all nineteen
// sectors, and keeps the split even where there is nothing to say: §3.16.1 and §3.18.1 read
// only 'None.'. A structure maintained that rigidly, including where it is empty, is carrying
// meaning. The two subsections do different work — a .1 determines WHAT FALLS INSIDE a
// category, a .2 describes THE BOUNDARY once something does — so the .1 question is answered
// logically before the .2 question is even asked.
//
// But the regulation nowhere DIRECTS that they be presented in that order, or grouped at all.
// This is our arrangement, inferred from how the text is organised. It is a presentation
// choice and should be described as one; do not tell a verifier the regulation prescribes it.
import { BOUNDARIES, type BoundaryEntry } from './boundaries';

export interface BoundaryLookupResult {
  categoryCode: string;
  routeCode: string | null;
  /** scope 'cross_sectoral' — governs every category, never filtered. */
  crossSectoral: BoundaryEntry[];
  /** scope 'special_provisions' — what falls inside the category. */
  specialProvisions: BoundaryEntry[];
  /** scope 'category' — the boundary itself. */
  boundaries: BoundaryEntry[];
}

/**
 * Does this entry apply to the route the caller named?
 *
 * TWO WAYS TO BE INCLUDED, and neither is a fallback for the other.
 *
 * `routeCodes: null` means the entry applies to the WHOLE CATEGORY — either the regulation
 * names no route for it (§3.11.2, §3.16.2) or the section is a special provision, which is
 * about the category rather than any route. Such an entry is ALWAYS included and must never be
 * filtered out: dropping it because the caller named a route would hide the only boundary the
 * category has.
 *
 * NO ROUTE NAMED MEANS NO NARROWING, NOT A GUESS. When routeCode is null, undefined or empty,
 * every entry for the category is returned. We do not know the caller's route, and picking one
 * — the first, the most common, the one that happens to sort first — would silently answer a
 * question they did not ask, with a boundary that may not be theirs. Showing both routes and
 * letting them see the split is honest; choosing for them is not.
 */
function appliesToRoute(entry: BoundaryEntry, routeCode: string | null): boolean {
  if (entry.routeCodes === null) return true;
  if (routeCode === null || routeCode === '') return true;
  return entry.routeCodes.includes(routeCode);
}

function coversCategory(entry: BoundaryEntry, categoryCode: string): boolean {
  return entry.categoryCodes !== null && entry.categoryCodes.includes(categoryCode);
}

/**
 * Everything Annex I §3 says about one category, optionally narrowed to one production route.
 *
 * CROSS-CATEGORY REACH IS DELIBERATE — SELECTION IS BY categoryCodes, NEVER BY SECTION NUMBER.
 * §3.15.1 lists both crude_steel and iron_steel_products, so it is returned for BOTH, despite
 * its number sitting under §3.15. Whoever selected iron or steel products needs it most: their
 * own §3.16.1 reads 'None.', while the rule deciding whether their rolled product belongs in
 * crude steel at all — primary hot-rolling and rough forging yielding CN 7207, 7218 or 7224
 * stay in crude steel, everything else falls to products — is printed under §3.15.1. Filtering
 * by section number would withhold exactly the rule they need.
 *
 * An empty or unknown categoryCode returns no category-scoped entries and does not throw.
 * Cross-sectoral rules are still returned for an unknown code: §3.1 governs everything,
 * including a category this function has never heard of.
 */
export function lookupBoundaries(
  categoryCode: string,
  routeCode?: string | null,
): BoundaryLookupResult {
  const cat = (categoryCode ?? '').trim();
  const route = (routeCode ?? '') === '' ? null : (routeCode as string);

  // Order within each group is BOUNDARIES array order, which is section order — .filter
  // preserves it. Callers can render a group as-is and get the regulation's own sequence.
  const crossSectoral = BOUNDARIES.filter((e) => e.scope === 'cross_sectoral');

  if (cat === '') {
    // Nothing selected. Cross-sectoral rules govern every category, but there is no category
    // here to govern — returning §3.1 against no selection would assert a scope that has not
    // been chosen yet.
    return { categoryCode: cat, routeCode: route, crossSectoral: [], specialProvisions: [], boundaries: [] };
  }

  const specialProvisions = BOUNDARIES.filter(
    (e) => e.scope === 'special_provisions' && coversCategory(e, cat) && appliesToRoute(e, route),
  );

  const boundaries = BOUNDARIES.filter(
    (e) => e.scope === 'category' && coversCategory(e, cat) && appliesToRoute(e, route),
  );

  return { categoryCode: cat, routeCode: route, crossSectoral, specialProvisions, boundaries };
}
