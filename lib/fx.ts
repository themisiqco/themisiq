// lib/fx.ts
// The dated ECB reference rates, their source and the converter. ONE table for every module.
//
// MOVED HERE FROM lib/deals/assessment.ts ON 30 SEP 2026 so the Supply Chain risk score could compare
// spend in one currency without importing the Deals engine. The Deals engine re-exports what it used
// to define (FX_AS_OF, FX_SOURCE, and UNITS_PER_EUR narrowed to its own five currencies), so nothing
// about a deal's output changed: lib/deals/assessment.test.ts and a before/after of the report models
// both hold that.
//
// Deliberately a STATIC, DATED table, with no live API. A rate that moved between two runs would let
// the same figure silently cross a threshold with nothing in the audit trail to explain it. A dated
// table makes the rate a reviewable input, like an emission factor (cf. EF_SOURCES).
//
// ⚠️ THE ECB PDF URL LIVES HERE, NOT IN lib/sources.ts, AND lib/sources.test.ts EXEMPTS THIS FILE FOR
// IT. Its path encodes the fixing date (.../2026/07/20260701.pdf), so it is not a stable source link
// but an artefact that must move whenever FX_AS_OF moves. Lifting it into the registry would separate
// the URL from the date it dates.
//
// Refresh: re-transcribe EVERY rate from the new day's document and bump FX_AS_OF and the FX_SOURCE
// URL in the SAME edit as the rates, never separately.

export const FX_AS_OF = '2026-07-01'
export const FX_SOURCE = 'ECB euro foreign exchange reference rates, 1 July 2026 (14:15 CET daily fixing). https://www.ecb.europa.eu/stats/exchange/eurofxref/shared/pdf/2026/07/20260701.pdf'

// Units of each currency per 1 EUR: the ECB's OWN quotation convention, TRANSCRIBED VERBATIM from the
// document named in FX_SOURCE. Every number below appears literally in that PDF, so a reviewer confirms
// this table by comparing digit for digit against the source; nothing has to be re-derived to check it.
// That is the whole reason the table is EUR-base and not USD-cross-rated: a stored cross-rate is a
// computed number with no published figure behind it.
//
// VERIFIED 30 SEP 2026: the PDF was downloaded, its text extracted, and all 29 published figures below
// compared as text against it. All 29 matched, which is every currency the document lists. USD, GBP,
// CAD and AUD are the four the Deals engine has carried since the table was first transcribed; the
// other 25 were added that day.
//
// WIDTHS ARE NOT NORMALISED. Each figure is held exactly as printed, trailing zeros included (ISK
// 143.80, ILS 3.3900, PHP 70.170). Padding or trimming a digit to make the column tidy would be a
// silent edit to a transcribed figure.
export const ECB_UNITS_PER_EUR = {
  EUR: 1,          // the base, by definition: not a published figure
  USD: 1.1383,
  JPY: 185.21,
  CZK: 24.254,
  DKK: 7.4745,
  GBP: 0.85973,
  HUF: 355.83,
  PLN: 4.2958,
  RON: 5.2367,
  SEK: 11.0955,
  CHF: 0.9234,
  ISK: 143.80,
  NOK: 11.3125,
  TRY: 53.1266,
  AUD: 1.6518,
  BRL: 5.9048,
  CAD: 1.6191,
  CNY: 7.7342,
  HKD: 8.9287,
  IDR: 20444.89,
  ILS: 3.3900,
  INR: 108.4215,
  KRW: 1773.57,
  MXN: 19.9591,
  MYR: 4.6602,
  NZD: 2.0069,
  PHP: 70.170,
  SGD: 1.4762,
  THB: 38.002,
  ZAR: 18.7064,
} as const

/** A currency this table holds a dated rate for. */
export type FxCurrency = keyof typeof ECB_UNITS_PER_EUR
export const FX_CURRENCIES = Object.keys(ECB_UNITS_PER_EUR) as FxCurrency[]
export const isFxCurrency = (c: unknown): c is FxCurrency =>
  typeof c === 'string' && Object.prototype.hasOwnProperty.call(ECB_UNITS_PER_EUR, c)

// Convert between two currencies through the EUR base. Same currency is the identity, so a figure
// tested in its own currency has no float round-trip at all.
export const convertFx = (amount: number, from: FxCurrency, to: FxCurrency): number =>
  from === to ? amount : (amount * ECB_UNITS_PER_EUR[to]) / ECB_UNITS_PER_EUR[from]

/** `amount` in USD at the dated rate, or null when no rate is held for `currency`. Never a guess. */
export const toUsd = (amount: number, currency: unknown): number | null =>
  isFxCurrency(currency) ? convertFx(amount, currency, 'USD') : null
