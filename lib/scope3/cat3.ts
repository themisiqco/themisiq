// ── CATEGORY 3'S "WHERE TO FIND IT" TEXT ─────────────────────────────────────────────────────────
//
// One string, here rather than in app/dashboard/scope3/page.tsx, for the reason lib/scope3/cat15.ts
// gives: a claim about method belongs beside the method, where a guard can read it.
//
// ⚠️ IT DESCRIBED A METHOD THE PLATFORM HAS NEVER USED. Until 20 Sep 2026 it read "Your Scope 1 & 2
// energy consumption data (kWh, fuel volumes), with well-to-tank and T&D-loss factors applied. Source
// the consumption from utility bills / the GHG module." None of that happens. Category 3 is not in
// METHOD_BY_CATEGORY (lib/scope3/categoryMethods.ts), so scope3MethodFor returns 'flat_spend', and the
// figure is annual spend times one flat 0.5 kg CO2e per unit of currency with no source, year or
// region. The form asks for a spend figure and an optional known total; it asks for no kWh, no fuel
// volume and nothing from the GHG module. The text a customer reads under "Where to find it" was
// telling them to collect data the form cannot take, for a calculation that does not exist.
//
// ⚠️ THE FLAT CLAIM IS EMBEDDED, NOT RETYPED. scope3MethodDescription('flat_spend') is the same
// sentence the public methodology page and the CSV's Method cell carry, with the 0.5 and the
// provenance gap read from the factor record. Copying its words here would have made a fourth
// phrasing of one claim; categoryMethods.test.ts M9 fails if this stops embedding it.
//
// The Category 1 warning is not a style note: totalScope3 (page.tsx) sums every relevant, calculated
// category with no deduplication between them, so a fuel invoice entered in both categories is added
// twice to the same total.

import { scope3MethodDescription } from './categoryMethods'

/** CATEGORIES.cat3.dataSource: rendered under "Where to find it:" on the Calculate step. */
export const CAT3_DATA_SOURCE =
  "Accounts payable or your utility invoices: the annual spend on fuel and energy you purchased in the " +
  "reporting year, in the inventory's currency. Leave out any spend already entered under Category 1, " +
  `or it will be counted twice. ${scope3MethodDescription('flat_spend')} If you already hold a figure ` +
  "for this category, enter it as known emissions and that figure is used instead of the estimate."
