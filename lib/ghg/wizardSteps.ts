// lib/ghg/wizardSteps.ts
// The six GHG wizard step names, in order.
//
// SHARED because two places need the same list and they are now on opposite sides of the network:
// the wizard renders them in the assistant's header, and /api/ghg-bot interpolates them into the
// system prompt ("You are on step 3 of 6: energy & fuel data"). The prompt moved server-side so the
// client could stop controlling it; without this file that move would have left two copies of the
// same array, and a renamed step would have the header and the model describing different things.
//
// A plain array with no imports, so a 'use client' page and a route can both take it.

export const WIZARD_STEP_NAMES = [
  'framework selection',
  'company setup',
  'energy & fuel data',
  'additional data',
  'review & workings',
  'export',
] as const

// Whether a client-supplied step index is one this wizard actually has. The route validates rather
// than indexing on trust: an out-of-range value would put "undefined" in the prompt and tell the
// model the user is on a step that does not exist.
export const isWizardStep = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < WIZARD_STEP_NAMES.length
