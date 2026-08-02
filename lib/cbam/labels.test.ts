// lib/cbam/labels.test.ts
// Pins the display-label maps and the fallback contract.
//
// The en-dash assertions are not pedantry. The two EAF labels were specified with U+2013, and a
// hyphen-minus is visually near-identical at small sizes — an editor, a copy-paste through a
// tool that normalises punctuation, or a well-meaning "fix" would swap them silently. Asserting
// the codepoint is the only way that shows up as a failure rather than as nothing.
import { describe, it, expect } from 'vitest';
import {
  ROUTE_LABELS,
  CALC_MODE_LABELS,
  STEEL_GRADE_LABELS,
  CC_MODE_LABELS,
  STREAM_KIND_LABELS,
  routeLabel,
  calcModeLabel,
  steelGradeLabel,
  ccModeLabel,
  streamKindLabel,
} from './labels';

const EN_DASH = '–';
const HYPHEN_MINUS = '-';

describe('labels — every mapped code returns its label', () => {
  it('routeLabel returns the label for every code in ROUTE_LABELS', () => {
    for (const [code, label] of Object.entries(ROUTE_LABELS)) {
      expect(routeLabel(code)).toBe(label);
    }
    // The map is not empty, so the loop above is not vacuous.
    expect(Object.keys(ROUTE_LABELS).length).toBe(9);
  });

  it('calcModeLabel returns the label for every code in CALC_MODE_LABELS', () => {
    for (const [code, label] of Object.entries(CALC_MODE_LABELS)) {
      expect(calcModeLabel(code)).toBe(label);
    }
    expect(Object.keys(CALC_MODE_LABELS).length).toBe(3);
  });

  it('steelGradeLabel returns the label for every code in STEEL_GRADE_LABELS', () => {
    for (const [code, label] of Object.entries(STEEL_GRADE_LABELS)) {
      expect(steelGradeLabel(code)).toBe(label);
    }
    expect(Object.keys(STEEL_GRADE_LABELS).length).toBe(3);
  });

  it('ccModeLabel returns the label for every code in CC_MODE_LABELS', () => {
    for (const [code, label] of Object.entries(CC_MODE_LABELS)) {
      expect(ccModeLabel(code)).toBe(label);
    }
    expect(Object.keys(CC_MODE_LABELS).length).toBe(3);
  });

  it('streamKindLabel returns the label for every code in STREAM_KIND_LABELS', () => {
    for (const [code, label] of Object.entries(STREAM_KIND_LABELS)) {
      expect(streamKindLabel(code)).toBe(label);
    }
    expect(Object.keys(STREAM_KIND_LABELS).length).toBe(3);
  });

  it('the exact specified strings, spelled out', () => {
    expect(routeLabel('bof')).toBe('Basic Oxygen Furnace (BOF)');
    expect(routeLabel('eaf_scrap')).toBe('Electric Arc Furnace (EAF) – Scrap');
    expect(routeLabel('eaf_dri')).toBe('Electric Arc Furnace (EAF) – DRI/HBI');
    expect(routeLabel('blast_furnace')).toBe('Blast Furnace');
    expect(routeLabel('direct_reduction')).toBe('Direct Reduction (DRI/HBI)');
    expect(routeLabel('smelting_reduction')).toBe('Smelting Reduction');
    expect(routeLabel('submerged_arc')).toBe('Submerged Arc Furnace');
    expect(routeLabel('primary_electrolysis')).toBe('Primary Smelting (Electrolysis)');
    expect(routeLabel('secondary_remelt')).toBe('Secondary Production (Remelting)');

    expect(calcModeLabel('actual')).toBe('Actual Installation Data');
    expect(calcModeLabel('default')).toBe('CBAM Default Values');
    expect(calcModeLabel('combined')).toBe('Combination of Actual and Default Values');

    expect(steelGradeLabel('carbon')).toBe('Carbon Steel');
    expect(steelGradeLabel('low_alloy')).toBe('Low-Alloy Steel');
    expect(steelGradeLabel('high_alloy')).toBe('High-Alloy Steel (including Stainless Steel)');

    expect(ccModeLabel('direct')).toBe('Carbon content');
    expect(ccModeLabel('ef_per_t')).toBe('Emission factor per tonne (t CO₂ / t)');
    expect(ccModeLabel('ef_per_tj')).toBe('Emission factor per terajoule (t CO₂ / TJ)');

    expect(streamKindLabel('fuel')).toBe('Fuel');
    expect(streamKindLabel('process_material')).toBe('Process material');
    expect(streamKindLabel('output')).toBe('Output');
  });
});

describe('labels — the fallback contract', () => {
  it('an unmapped code returns itself unchanged', () => {
    // A route seeded into cbam_production_routes but not yet labelled here must render as its
    // raw code — visibly unfinished — not blank and not an invented title-case guess.
    for (const fn of [routeLabel, calcModeLabel, steelGradeLabel, ccModeLabel, streamKindLabel]) {
      expect(fn('not_a_code')).toBe('not_a_code');
      expect(fn('some_new_route')).toBe('some_new_route');
      expect(fn('BOF')).toBe('BOF'); // case-sensitive: not the same key as 'bof'
    }
  });

  it('an empty string returns an empty string', () => {
    // '' is how route_code and steel_grade represent "not set". Returning a placeholder would
    // put text on screen where the caller decided there should be none.
    for (const fn of [routeLabel, calcModeLabel, steelGradeLabel, ccModeLabel, streamKindLabel]) {
      expect(fn('')).toBe('');
    }
  });

  it('a code mapped in one map is not resolved by another', () => {
    // The three namespaces are separate. 'carbon' is a steel grade and nothing else.
    expect(routeLabel('carbon')).toBe('carbon');
    expect(calcModeLabel('bof')).toBe('bof');
    expect(steelGradeLabel('actual')).toBe('actual');
    // 'direct' is a carbon-content mode; 'output' is a stream kind. Neither is a route.
    expect(routeLabel('direct')).toBe('direct');
    expect(ccModeLabel('output')).toBe('output');
    expect(streamKindLabel('direct')).toBe('direct');
  });

  it('does not resolve inherited Object.prototype keys', () => {
    // `map[code] ?? code` on a plain object literal would return Object.prototype.toString for
    // the code 'toString' if the lookup were not guarded by the map's own contents.
    expect(routeLabel('toString')).toBe('toString');
    expect(routeLabel('constructor')).toBe('constructor');
    expect(calcModeLabel('hasOwnProperty')).toBe('hasOwnProperty');
    // cc_mode and stream_kind are DB columns too — an inherited key must fall back, not resolve
    // to Object.prototype.toString, which would put a function into the JSX.
    expect(ccModeLabel('toString')).toBe('toString');
    expect(streamKindLabel('toString')).toBe('toString');
    expect(streamKindLabel('valueOf')).toBe('valueOf');
  });
});

describe('labels — the EAF dash is an en-dash, not a hyphen', () => {
  it('both EAF labels contain U+2013', () => {
    expect(ROUTE_LABELS.eaf_scrap).toContain(EN_DASH);
    expect(ROUTE_LABELS.eaf_dri).toContain(EN_DASH);
  });

  it('neither EAF label contains a hyphen-minus', () => {
    expect(ROUTE_LABELS.eaf_scrap).not.toContain(HYPHEN_MINUS);
    expect(ROUTE_LABELS.eaf_dri).not.toContain(HYPHEN_MINUS);
  });

  it('the separator is exactly a space, en-dash, space', () => {
    expect(ROUTE_LABELS.eaf_scrap).toBe(`Electric Arc Furnace (EAF) ${EN_DASH} Scrap`);
    expect(ROUTE_LABELS.eaf_dri).toBe(`Electric Arc Furnace (EAF) ${EN_DASH} DRI/HBI`);
  });

  it('the hyphens in the steel-grade labels are hyphen-minus, not en-dashes', () => {
    // The contrast is the point: 'Low-Alloy' is a compound word and takes a hyphen, where the
    // EAF labels separate two things and take an en-dash. Both are deliberate.
    expect(STEEL_GRADE_LABELS.low_alloy).toContain(HYPHEN_MINUS);
    expect(STEEL_GRADE_LABELS.high_alloy).toContain(HYPHEN_MINUS);
    expect(STEEL_GRADE_LABELS.low_alloy).not.toContain(EN_DASH);
    expect(STEEL_GRADE_LABELS.high_alloy).not.toContain(EN_DASH);
  });
});
