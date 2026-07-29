// lib/cbam/cn.test.ts
// Pins CN normalisation and prefix matching (cn.ts) against the ACTUAL seeded cbam_cn_map
// rows — every fixture prefix below is transcribed from a migration, not invented:
//   supabase/migrations/20260716_cbam_reference.sql        44 steel rows
//   supabase/migrations/20260727_cbam_aluminium_seed.sql   14 aluminium rows
//
// The CN codes exercised against them are likewise real, taken from cbam_default_values'
// seeded spaced form ('7202 11', '7206 10 00', '2601 12 00') so the tests reproduce the
// actual cross-dataset mismatch §10.8 describes rather than a synthetic one.
import { describe, it, expect } from 'vitest';
import { normalizeCn, matchCnPrefix, type CnMapRow } from './cn';

// A representative slice of the real seed. Prefixes verbatim; nothing here is invented.
const SEED: CnMapRow[] = [
  { cn_prefix: '26011200', category_code: 'sintered_ore' },        // the one 8-digit prefix
  { cn_prefix: '7201', category_code: 'pig_iron' },
  { cn_prefix: '7203', category_code: 'dri' },
  { cn_prefix: '72021', category_code: 'ferroalloy' },             // the three 5-digit prefixes
  { cn_prefix: '72024', category_code: 'ferroalloy' },
  { cn_prefix: '72026', category_code: 'ferroalloy' },
  { cn_prefix: '7206', category_code: 'crude_steel' },
  { cn_prefix: '7207', category_code: 'crude_steel' },
  { cn_prefix: '7218', category_code: 'crude_steel' },
  { cn_prefix: '7224', category_code: 'crude_steel' },
  { cn_prefix: '7208', category_code: 'iron_steel_products' },
  { cn_prefix: '7601', category_code: 'primary_aluminium' },       // aluminium seed
  { cn_prefix: '7616', category_code: 'aluminium_products' },
];

describe('normalizeCn', () => {
  it('strips whitespace from the seeded spaced forms', () => {
    expect(normalizeCn('2601 12 00')).toBe('26011200');
    expect(normalizeCn('7206 10 00')).toBe('72061000');
    expect(normalizeCn('7202 11')).toBe('720211');
  });

  it('leaves an already-bare code unchanged', () => {
    expect(normalizeCn('7203')).toBe('7203');
  });

  it('throws on a non-digit input, naming it — never silently strips or coerces', () => {
    // A stray character must not be removed to force a parse: '7206-10-00' quietly becoming
    // '72061000' would resolve to a real category on the strength of a typo.
    expect(() => normalizeCn('7206-10-00')).toThrow(/7206-10-00/);
    expect(() => normalizeCn('ABC')).toThrow(/ABC/);
    expect(() => normalizeCn('')).toThrow();
  });
});

describe('matchCnPrefix — real seeded prefixes', () => {
  it('8-digit: the sintered-ore code normalises and matches its 8-digit prefix', () => {
    // '2601 12 00' !== '26011200' under literal equality — the §10.8 headline example.
    expect(matchCnPrefix('2601 12 00', SEED)).toEqual({
      category_code: 'sintered_ore', matched_prefix: '26011200',
    });
  });

  it('8-digit spaced code matches a 4-digit prefix', () => {
    expect(matchCnPrefix('7206 10 00', SEED)).toEqual({
      category_code: 'crude_steel', matched_prefix: '7206',
    });
  });

  it('6-digit spaced code matches a 5-digit ferroalloy prefix', () => {
    // '7202 11' -> '720211', which starts with '72021'. The 5-digit rows exist precisely
    // because heading 7202 splits: only three ferroalloys are in CBAM scope.
    expect(matchCnPrefix('7202 11', SEED)).toEqual({
      category_code: 'ferroalloy', matched_prefix: '72021',
    });
    expect(matchCnPrefix('7202 41', SEED)).toEqual({
      category_code: 'ferroalloy', matched_prefix: '72024',
    });
    expect(matchCnPrefix('7202 60 00', SEED)).toEqual({
      category_code: 'ferroalloy', matched_prefix: '72026',
    });
  });

  it('the accidental-equality trap: a bare 4-digit code resolves VIA THE MATCHER, not via equality', () => {
    // '7203' === '7203' happens to hold, which is why a naive equality implementation looks
    // correct on this subset. Asserting matched_prefix — not just the category — is what makes
    // this test fail for an implementation that only ever compares whole strings, because such
    // an implementation cannot report WHICH prefix matched a longer code.
    const bare = matchCnPrefix('7203', SEED);
    expect(bare).toEqual({ category_code: 'dri', matched_prefix: '7203' });

    // The same prefix reached from a longer, spaced code — equality fails here, prefix does not.
    expect(matchCnPrefix('7203 00 00', SEED)).toEqual({
      category_code: 'dri', matched_prefix: '7203',
    });
  });

  it('aluminium: both seeds are exercised', () => {
    expect(matchCnPrefix('7601', SEED)).toEqual({
      category_code: 'primary_aluminium', matched_prefix: '7601',
    });
    expect(matchCnPrefix('7616 99 90', SEED)).toEqual({
      category_code: 'aluminium_products', matched_prefix: '7616',
    });
  });

  it('no match returns null — not a throw, and not a false match', () => {
    // 7204 (scrap) is deliberately absent from the map: out of CBAM scope. Null is the
    // correct answer and must be distinguishable from a category mismatch.
    expect(matchCnPrefix('7204 10 00', SEED)).toBeNull();
    expect(matchCnPrefix('9999 99 99', SEED)).toBeNull();
    expect(matchCnPrefix('7203', [])).toBeNull();
  });

  it('propagates a normalisation failure on the code rather than returning null', () => {
    // An unparseable code is not "no opinion" — the two must not collapse.
    expect(() => matchCnPrefix('72O6 10 00', SEED)).toThrow(/72O6/);
  });

  it('throws on a malformed row prefix rather than skipping it', () => {
    // A bad reference row is a real defect. Skipping it would silently change which category
    // a code resolves to, which is worse than failing.
    expect(() => matchCnPrefix('7206 10 00', [{ cn_prefix: '72 06x', category_code: 'x' }]))
      .toThrow(/72 06x/);
  });
});

describe('matchCnPrefix — longest-prefix precedence', () => {
  // NOT FROM THE SEED, and deliberately so. Verified 29 Jul 2026: the 58 seeded prefixes are
  // mutually disjoint — no prefix is a prefix of another, and in particular there is NO '7202'
  // row alongside the 5-digit '72021'/'72024'/'72026'. So the live data cannot distinguish
  // longest-prefix from first-match today. This fixture pins the CONTRACT against the day a
  // heading is seeded above an existing sub-heading, which is the shape heading 7202 would
  // take if the out-of-scope ferroalloys were ever added.
  const OVERLAPPING: CnMapRow[] = [
    { cn_prefix: '7202', category_code: 'HEADING_LEVEL' },
    { cn_prefix: '72021', category_code: 'ferroalloy' },
  ];

  it('the longer prefix wins regardless of row order', () => {
    expect(matchCnPrefix('7202 11', OVERLAPPING)).toEqual({
      category_code: 'ferroalloy', matched_prefix: '72021',
    });
    expect(matchCnPrefix('7202 11', [...OVERLAPPING].reverse())).toEqual({
      category_code: 'ferroalloy', matched_prefix: '72021',
    });
  });

  it('falls back to the shorter prefix when the longer one does not match', () => {
    // '7202 30' -> '720230' matches '7202' but not '72021'.
    expect(matchCnPrefix('7202 30', OVERLAPPING)).toEqual({
      category_code: 'HEADING_LEVEL', matched_prefix: '7202',
    });
  });
});
