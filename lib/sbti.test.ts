// lib/sbti.test.ts
// Engine tests — step 1: categorize() only. Assertions read thresholds from params
// (not hardcoded), so a §12 criteria change to params re-points them automatically.
import { describe, it, expect } from 'vitest';
import { categorize } from './sbti';
import { CATEGORY_A_THRESHOLDS as T } from './sbti/params';

describe('categorize — Route 1 (any country)', () => {
  it('net turnover AT threshold (€450M) → A / route1', () => {
    expect(categorize({ highIncomeCountry: false, netTurnoverEur: T.anyCountry.netTurnoverEur }))
      .toEqual({ category: 'A', matchedRoute: 'route1' });
  });
  it('FTE AT threshold (1,000) → A / route1', () => {
    expect(categorize({ highIncomeCountry: false, fte: T.anyCountry.fte }))
      .toEqual({ category: 'A', matchedRoute: 'route1' });
  });
  it('just below both Route 1 thresholds → B', () => {
    expect(categorize({
      highIncomeCountry: false,
      netTurnoverEur: T.anyCountry.netTurnoverEur - 1,
      fte: T.anyCountry.fte - 1,
    })).toEqual({ category: 'B', matchedRoute: null });
  });
});

describe('categorize — Route 2 (high-income only)', () => {
  it('emissions AT standalone threshold (10k tCO2e) → A / route2_emissions', () => {
    expect(categorize({ highIncomeCountry: true, scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e }))
      .toEqual({ category: 'A', matchedRoute: 'route2_emissions' });
  });
  it('emissions one below threshold + nothing else → B', () => {
    expect(categorize({ highIncomeCountry: true, scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e - 1 }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
  it('two of trio AT threshold — balance sheet (€25M) + FTE (250) → A / route2_twoOfThree', () => {
    expect(categorize({
      highIncomeCountry: true,
      balanceSheetEur: T.highIncomeCountry.twoOfThree.balanceSheetEur,
      fte: T.highIncomeCountry.twoOfThree.fte,
    })).toEqual({ category: 'A', matchedRoute: 'route2_twoOfThree' });
  });
  it('two of trio AT threshold — net turnover (€50M) + FTE (250) → A / route2_twoOfThree', () => {
    expect(categorize({
      highIncomeCountry: true,
      netTurnoverEur: T.highIncomeCountry.twoOfThree.netTurnoverEur,
      fte: T.highIncomeCountry.twoOfThree.fte,
    })).toEqual({ category: 'A', matchedRoute: 'route2_twoOfThree' });
  });
  it('exactly ONE of trio trips → B', () => {
    expect(categorize({ highIncomeCountry: true, balanceSheetEur: T.highIncomeCountry.twoOfThree.balanceSheetEur }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
});

describe('categorize — high-income gating (Route 2 is high-income ONLY)', () => {
  it('NOT high-income but would pass Route 2 emissions → B', () => {
    expect(categorize({ highIncomeCountry: false, scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
  it('NOT high-income but would pass Route 2 trio → B', () => {
    expect(categorize({
      highIncomeCountry: false,
      balanceSheetEur: T.highIncomeCountry.twoOfThree.balanceSheetEur,
      fte: T.highIncomeCountry.twoOfThree.fte, // 250 < 1,000, so Route 1 is NOT tripped
    })).toEqual({ category: 'B', matchedRoute: null });
  });
});

describe('categorize — clean B, absent inputs, precedence', () => {
  it('all inputs below every threshold → B / null', () => {
    expect(categorize({ highIncomeCountry: true, netTurnoverEur: 1, fte: 1, scope12EmissionsTco2e: 1, balanceSheetEur: 1 }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
  it('no optional inputs at all never throws → B / null', () => {
    expect(categorize({ highIncomeCountry: true })).toEqual({ category: 'B', matchedRoute: null });
  });
  it('meets BOTH routes → route1 wins (defined precedence)', () => {
    // Route 1 (net turnover ≥ €450M) AND Route 2 emissions (≥10k, high-income).
    expect(categorize({
      highIncomeCountry: true,
      netTurnoverEur: T.anyCountry.netTurnoverEur,
      scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e,
    })).toEqual({ category: 'A', matchedRoute: 'route1' });
  });
});
