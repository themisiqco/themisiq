// lib/cbam/readiness.test.ts
// Pins the readiness content layer (readiness.ts) against the report builder's own
// requirement set.
//
// The load-bearing test is the JOIN: readiness.ts annotates requirements, it does not
// restate them. Everything else here is shape hygiene on the content itself.
import { describe, it, expect } from 'vitest';
import {
  READINESS_ENTRIES, HOLDER_GROUPS, entryForAccumulatorItem, groupedEntries, readinessKey,
  type HolderGroup,
} from './readiness';
import { buildSummaryReport } from './report/build';

// The minimum requirement set: nothing supplied, no processes, no goods.
const EMPTY = () => buildSummaryReport({
  operator: null, installation: null, processes: [], disclosures: null,
  goods: [], installationProcessesComplete: undefined,
});

const derived = () => READINESS_ENTRIES.filter((e) => e.kind === 'derived');
const declared = () => READINESS_ENTRIES.filter((e) => e.kind === 'declared');

describe('readiness ↔ completeness join', () => {
  // Content must not drift from the requirement set. build.ts DECLARES what is required;
  // this file only ANNOTATES it. Add a requirement without adding an entry, or rename a
  // field, and this fails — which is the point. There is no second registry to keep in sync.
  it('every accumulator item has a derived readiness entry, and every derived entry has an accumulator item', () => {
    const { completeness } = EMPTY();

    // Direction 1 — no requirement is left unannotated.
    for (const i of completeness.items) {
      const entry = entryForAccumulatorItem(i.item, i.field);
      expect(entry, `no readiness entry for ${readinessKey(i.item, i.field)}`).toBeDefined();
    }

    // Direction 2 — no orphan content describing something no longer required.
    const accKeys = new Set(completeness.items.map((i) => readinessKey(i.item, i.field)));
    for (const e of derived()) {
      expect(
        accKeys.has(readinessKey(e.item as string, e.field as string)),
        `orphan readiness entry ${e.id} (${e.item} / ${e.field})`,
      ).toBe(true);
    }

    expect(derived()).toHaveLength(completeness.items.length);
  });

  // 17 is the MINIMUM requirement set — an empty input. Per-process and per-precursor
  // items only materialise once those rows exist, which is correct: you cannot tell
  // someone they need precursor origin data before knowing they have precursors.
  it('the minimum requirement set is 17 derived entries', () => {
    expect(derived()).toHaveLength(17);
    expect(EMPTY().completeness.items).toHaveLength(17);
  });
});

describe('readiness content shape', () => {
  it('every entry id is unique', () => {
    const ids = READINESS_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derived entries carry item AND field; declared entries carry neither', () => {
    for (const e of derived()) {
      expect(e.item, `derived ${e.id} has no item`).not.toBeNull();
      expect(e.field, `derived ${e.id} has no field`).not.toBeNull();
    }
    for (const e of declared()) {
      expect(e.item, `declared ${e.id} has an item`).toBeNull();
      expect(e.field, `declared ${e.id} has a field`).toBeNull();
    }
    // Both kinds are populated — a regression that emptied one would otherwise pass above.
    expect(declared().length).toBeGreaterThan(0);
  });

  it('every holder is a declared HolderGroup', () => {
    const groups = new Set(Object.keys(HOLDER_GROUPS));
    for (const e of READINESS_ENTRIES) {
      expect(groups.has(e.holder), `${e.id} has unknown holder ${e.holder}`).toBe(true);
    }
  });

  it('no entry has an empty label, whereToFind or goodEnough', () => {
    for (const e of READINESS_ENTRIES) {
      expect(e.label.trim(), `${e.id} label`).not.toBe('');
      expect(e.whereToFind.trim(), `${e.id} whereToFind`).not.toBe('');
      expect(e.goodEnough.trim(), `${e.id} goodEnough`).not.toBe('');
    }
  });
});

describe('groupedEntries', () => {
  it('returns groups in ascending display order and omits empty ones', () => {
    const grouped = groupedEntries();
    const orders = grouped.map((g) => g.meta.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const g of grouped) expect(g.entries.length).toBeGreaterThan(0);
    // Every entry lands in exactly one group — nothing dropped by the filter.
    expect(grouped.reduce((n, g) => n + g.entries.length, 0)).toBe(READINESS_ENTRIES.length);
  });

  it('omits a group with no entries', () => {
    const onlyCustoms = READINESS_ENTRIES.filter((e) => e.holder === 'customs');
    const grouped = groupedEntries(onlyCustoms);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group).toBe<HolderGroup>('customs');
  });
});
