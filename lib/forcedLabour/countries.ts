// lib/forcedLabour/countries.ts
// The countries Forced Labour Reporting prepares a report for, and the words every surface uses to
// describe the module as a whole. Pure.
//
// ⚠️ ADDING A COUNTRY IS A CHANGE TO THIS LIST, NOT TO A PAGE. /forced-labour, the builder's "Start a
// report" form and the tests read COUNTRIES. A country becomes available by getting status 'available'
// and a page of its own (`href`), in the same change as the builder that prepares its report.
//
// ⚠️ THREE STATUSES (Stage D1b, 1 Oct 2026).
//   'available'  public, and in every account's builder.
//   'preview'    a country being built: in the builder ONLY for accounts with a row in s211_access (the preview
//                list), decided on the server by lib/forcedLabour/countryGate.ts. Nowhere public.
//   'hidden'     nowhere, for anyone.
// A country that is not available appears on NO public surface: not in the module page's country list, not in
// a "Start a report" list for an account that may not use it, and with no "Not yet available" line anywhere.
// Coverage we do not have must not read as coverage we do, or as coverage on its way.

import { CANADA_S211_URL, MODERN_SLAVERY_AU_URL, MODERN_SLAVERY_UK_S54_URL } from '../sources'

export type CountryStatus = 'available' | 'preview' | 'hidden'
export type CountryKey = 'canada' | 'australia' | 'uk'
export type Country = {
  key: CountryKey
  name: string
  /** The law's full name, as the country's own legislation site titles it. */
  law: string
  /** The law's short name where people use one ("S-211"). */
  shortName: string | null
  lawUrl: string
  status: CountryStatus
  /** The country's own page. Only an available country has one. */
  href: string | null
}

export const COUNTRIES: readonly Country[] = [
  { key: 'canada', name: 'Canada', law: 'Fighting Against Forced Labour and Child Labour in Supply Chains Act', shortName: 'S-211',
    lawUrl: CANADA_S211_URL, status: 'available', href: '/forced-labour/canada' },
  { key: 'australia', name: 'Australia', law: 'Modern Slavery Act 2018', shortName: null,
    lawUrl: MODERN_SLAVERY_AU_URL, status: 'hidden', href: null },
  { key: 'uk', name: 'United Kingdom', law: 'Modern Slavery Act 2015', shortName: null,
    lawUrl: MODERN_SLAVERY_UK_S54_URL, status: 'preview', href: null },
]

/** The only public status label: a country that is not available is not shown at all. */
export const STATUS_LABEL = { available: 'Available' } as const
/** The countries any public surface may name. */
export const availableCountries = () => COUNTRIES.filter(c => c.status === 'available')
/** The countries the builder shows an account: the available ones, and those in preview for a preview account. */
export const builderCountries = (previewAccount: boolean): Country[] =>
  COUNTRIES.filter(c => c.status === 'available' || (c.status === 'preview' && previewAccount))
export const countryByKey = (k: unknown): Country | undefined => COUNTRIES.find(c => c.key === k)

/** The module's subtitle on every card: the dashboard, the homepage, pricing, the navigation. */
export const MODULE_SUBTITLE = 'Supply chain reports, country by country. Available now: Canada (S-211).'
/** What the price includes, on the pricing card and the order page. */
export const PRICE_INCLUDES = 'includes the Canada report'

export const CANADA_PAGE = '/forced-labour/canada'
export const CANADA_CHECK = '/forced-labour/canada/check'
