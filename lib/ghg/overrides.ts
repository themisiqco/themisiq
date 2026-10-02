// lib/ghg/overrides.ts
//
// SWITCHING A DOCUMENT-BACKED FIGURE TO MANUAL, AND BACK (T10). Pure: no React, no clock (the caller passes
// the time). Each function returns the patch for ONE location.
//
// Section 3.3 (ruling Q1): the customer chooses "Enter this figure manually instead" and must give a reason.
// The documents stay as evidence; their contributions read counted: false, reason manual_override, and the
// typed value on the field is the figure. T10 ruling: "Use the bills instead" removes the override, and the
// removal is kept with who and when in manual_overrides_removed.

import { activeOverride, overrideProblem, type Location } from './engine'

type Who = { userId: string; email: string }

/**
 * Switch `field` to manual. `startFrom` is the figure the field starts at, normally the figure the documents
 * gave, so switching never drops the figure to zero on its own; the customer then types the right one.
 * Throws when the reason is empty or who is missing, so nothing is recorded without them.
 */
export function addOverride(loc: Location, a: { field: keyof Location; reason: string; by: Who; at: string; startFrom: number }): Partial<Location> {
  const problem = overrideProblem({ reason: a.reason, by: a.by })
  if (problem) throw new Error(problem)
  return {
    manual_overrides: [...(loc.manual_overrides ?? []).filter(o => o.field !== String(a.field)),
      { field: String(a.field), reason: a.reason.trim(), at: a.at, by: a.by }],
    [a.field]: a.startFrom,
  } as Partial<Location>
}

/** "Use the bills instead": the override goes, and is kept with who removed it and when. */
export function removeOverride(loc: Location, a: { field: keyof Location; by: Who; at: string }): Partial<Location> {
  const current = activeOverride(loc, a.field)
  if (!current) return {}
  return {
    manual_overrides: (loc.manual_overrides ?? []).filter(o => o.field !== String(a.field)),
    manual_overrides_removed: [...(loc.manual_overrides_removed ?? []), { ...current, removedAt: a.at, removedBy: a.by }],
  }
}
