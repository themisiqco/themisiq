// lib/supply-chain/totalSpend.ts
// A register's total spend, in the register's currency.
//
// Suppliers carry their own currency (a CSV can mix them), so the total used to add yen to euros and
// label the sum in the register's currency. Each supplier's spend is now converted to the register's
// currency at the dated ECB reference rates in lib/fx.ts before it is added (30 Sep 2026). A supplier
// whose currency has no rate there is LEFT OUT and named: never treated as the register's currency,
// never guessed.

import { FX_AS_OF, isFxCurrency, convertFx } from '../fx'

export const TOTAL_SPEND_LABEL = `Total spend (converted at the ECB reference rate of ${FX_AS_OF})`

export type RegisterTotal = {
  /** In the register's currency, to the cent. */
  total: number
  /** Suppliers with spend that could not be converted, and so are not in `total`. */
  excludedCount: number
  /** Their currency codes, once each, in the order first met. */
  excludedCodes: string[]
}

export const registerTotalSpend = (
  suppliers: readonly { annual_spend: number; currency: string }[], registerCurrency: string,
): RegisterTotal => {
  let total = 0
  let excludedCount = 0
  const codes: string[] = []
  for (const s of suppliers) {
    // Zero spend adds nothing in any currency, so it is neither converted nor reported as left out.
    if (!(s.annual_spend > 0)) continue
    if (s.currency === registerCurrency) { total += s.annual_spend; continue }
    if (isFxCurrency(s.currency) && isFxCurrency(registerCurrency)) { total += convertFx(s.annual_spend, s.currency, registerCurrency); continue }
    excludedCount += 1
    const code = s.currency || '(blank)'
    if (!codes.includes(code)) codes.push(code)
  }
  return { total: Math.round(total * 100) / 100, excludedCount, excludedCodes: codes }
}

/** The note beside the total, or null when every supplier with spend is in it. */
export const excludedNote = (t: RegisterTotal): string | null =>
  t.excludedCount === 0 ? null
    : `Excludes ${t.excludedCount} supplier${t.excludedCount === 1 ? '' : 's'} with no reference rate: ${t.excludedCodes.join(', ')}`
