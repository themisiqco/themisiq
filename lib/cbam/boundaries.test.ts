// lib/cbam/boundaries.test.ts
// Provenance test for BOUNDARIES: every regulatory string in boundaries.ts must still be found,
// verbatim, in docs/reference/ir-2025-2547-annex-i-s3-boundaries.md.
//
// WHAT THIS PROTECTS. boundaries.ts is quotable — a verifier reads a provision from our surface
// and looks for it in the OJ. Nothing in TypeScript stops a well-meaning edit from rewording,
// re-wrapping or "tidying" one of those strings, and a paraphrase that reads better is exactly
// the failure this module exists to prevent (spec §11.15). The reference file is the local
// stand-in for the OJ, so agreement with it is the checkable form of that claim.
//
// THE NORMALISATION IS THE TEST'S WEAK POINT, so it is asymmetric on purpose. Only the
// REFERENCE is normalised: drop our '>' commentary, strip the markdown emphasis we added,
// join lines with a SINGLE SPACE, collapse runs of whitespace, trim. The entry strings are
// compared exactly as they are stored, with no normalisation of any kind.
//
// Joining with '' instead of ' ' would fuse the last word of a wrapped line to the first word
// of the next — 'the productionprocess'. That corruption is invisible if BOTH sides are
// normalised the same wrong way: the comparison still passes, and the test certifies a defect
// it introduced itself. Normalising one side only means any such bug shows up as a failure
// rather than as a pass. Do not "simplify" this by normalising the entry strings too.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BOUNDARIES } from './boundaries';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REFERENCE = resolve(
  REPO_ROOT,
  'docs',
  'reference',
  'ir-2025-2547-annex-i-s3-boundaries.md',
);

/** Steps 1–4, in order. Applied to the REFERENCE ONLY — never to an entry string. */
function normaliseReference(md: string): string {
  return md
    .split('\n')
    .filter((line) => !line.startsWith('>')) // 1. our commentary, not regulation
    .join('\n')
    .replace(/\*\*/g, '') // 2. markdown emphasis we added
    .replace(/\n/g, ' ') // 3. SINGLE SPACE, not '' — see the header note
    .replace(/\s+/g, ' ') // 4. collapse, then trim
    .trim();
}

const reference = normaliseReference(readFileSync(REFERENCE, 'utf8'));

function occurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + 1; // +1, not +needle.length: overlapping repeats still count separately
  }
}

const head = (s: string) => s.slice(0, 60);

describe('BOUNDARIES — provisions are verbatim from the reference extract', () => {
  // AT LEAST once, not exactly once. The regulation repeats text across sections — §3.12.2 and
  // §3.17.2.1 carry a word-for-word identical electrode-paste bullet — so a second occurrence
  // is the source being itself, not a defect. Requiring uniqueness would make this test fail
  // harder the more faithfully boundaries.ts transcribes the remaining sections.
  it('every provision appears in the normalised reference at least once', () => {
    const failures: string[] = [];
    for (const entry of BOUNDARIES) {
      entry.provisions.forEach((p, i) => {
        const n = occurrences(reference, p);
        if (n < 1) {
          failures.push(
            `§${entry.section} provisions[${i}]: found ${n} time(s), expected at least 1 — "${head(p)}"`,
          );
        }
      });
    }
    expect(failures, `provisions not found in the reference:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  // NEGATIVE CONTROL for step 3 of normaliseReference. Every other test here can only prove the
  // matcher says yes; this one proves it can still say no.
  //
  // If the reference's wrapped lines were joined with '' instead of ' ', words would fuse on the
  // REFERENCE side too — and a provision carrying the same fusion would then match. The suite
  // would stay green while checking nothing, because both sides would be corrupted identically.
  // Deleting one space from a known-good provision must therefore break the match. If this test
  // ever passes its corrupted string, step 3 has regressed to a newline-stripping join.
  it('the matcher rejects text fused at a line break', () => {
    const original = BOUNDARIES[0].provisions[0];
    const at = original.indexOf(' ');
    expect(at, 'the control provision has no space to delete').toBeGreaterThan(-1);
    const corrupted = original.slice(0, at) + original.slice(at + 1);

    expect(corrupted, 'corruption did not change the string').not.toBe(original);
    expect(
      reference.includes(original),
      `control provision should be found unmodified — "${head(original)}"`,
    ).toBe(true);
    expect(
      reference.includes(corrupted),
      `fused text was FOUND in the reference — "${head(corrupted)}". The reference's wrapped ` +
        `lines are being joined without a separating space (step 3 of normaliseReference), so ` +
        `every other assertion in this file is comparing two identically corrupted strings.`,
    ).toBe(false);
  });

  it('every heading appears in the normalised reference', () => {
    const failures = BOUNDARIES.filter((e) => !reference.includes(e.heading)).map(
      (e) => `§${e.section}: heading not found — "${head(e.heading)}"`,
    );
    expect(failures, `headings not found:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('no provision carries markdown, a newline, or a double space', () => {
    // The standing rule in boundaries.ts: provisions hold the text as the OJ prints it, not as
    // the extract renders it. These three are the artefacts of the extract's rendering.
    const failures: string[] = [];
    for (const entry of BOUNDARIES) {
      entry.provisions.forEach((p, i) => {
        const issues: string[] = [];
        if (p.includes('**')) issues.push("contains '**'");
        if (p.includes('\n')) issues.push('contains a newline');
        if (p.includes('  ')) issues.push('contains a double space');
        if (issues.length > 0) {
          failures.push(`§${entry.section} provisions[${i}]: ${issues.join(', ')} — "${head(p)}"`);
        }
      });
    }
    expect(failures, `provisions carrying extract rendering:\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});

describe('BOUNDARIES — cites', () => {
  it("every ir_2025_2547 cite resolves to a 'point X' in the reference", () => {
    const failures: string[] = [];
    for (const entry of BOUNDARIES) {
      for (const cite of entry.cites) {
        if (cite.instrument !== 'ir_2025_2547') continue;
        const needle = `point ${cite.point}`;
        if (!reference.includes(needle)) {
          failures.push(
            `§${entry.section}: cite ${cite.instrument} Annex ${cite.annex} point ${cite.point} — ` +
              `"${needle}" not found in the reference`,
          );
        }
      }
    }
    expect(failures, `unresolvable cites:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('every reg_2023_956 cite carries a non-empty note', () => {
    // Exempt from resolution BECAUSE the instrument is not held in this repo — so the note is
    // the only thing standing between a reader and an unfollowable reference. An unexplained
    // exemption is indistinguishable from a broken cite.
    const failures: string[] = [];
    for (const entry of BOUNDARIES) {
      for (const cite of entry.cites) {
        if (cite.instrument !== 'reg_2023_956') continue;
        if ((cite.note ?? '').trim() === '') {
          failures.push(
            `§${entry.section}: cite reg_2023_956 Annex ${cite.annex} point "${cite.point}" has no note`,
          );
        }
      }
    }
    expect(failures, `reg_2023_956 cites without a note:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('publishedAs, where present, differs from the operative location', () => {
    // The field exists ONLY to record a mismatch between what the OJ prints and where the text
    // actually is. An identical pair records nothing and is a data error, not a harmless one:
    // it asserts a discrepancy that does not exist.
    const failures: string[] = [];
    for (const entry of BOUNDARIES) {
      for (const cite of entry.cites) {
        if (cite.publishedAs === undefined) continue;
        if (
          cite.publishedAs.annex === cite.annex &&
          cite.publishedAs.point === cite.point
        ) {
          failures.push(
            `§${entry.section}: publishedAs {annex: ${cite.publishedAs.annex}, point: ${cite.publishedAs.point}} ` +
              `is identical to the operative {annex: ${cite.annex}, point: ${cite.point}} — it records no mismatch`,
          );
        }
      }
    }
    expect(failures, `publishedAs recording no mismatch:\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});

describe('BOUNDARIES — scope and categoryCodes agree', () => {
  it('cross_sectoral entries have categoryCodes null; category and special_provisions entries have a non-empty array', () => {
    const failures: string[] = [];
    for (const entry of BOUNDARIES) {
      if (entry.scope === 'cross_sectoral') {
        if (entry.categoryCodes !== null) {
          failures.push(
            `§${entry.section}: scope 'cross_sectoral' but categoryCodes is ${JSON.stringify(entry.categoryCodes)} — expected null`,
          );
        }
      } else {
        // 'category' and 'special_provisions' alike. A special-provisions rule is scoped to the
        // categories it governs — possibly several, where it allocates between them — so an
        // empty or null list means nothing knows what the rule applies to.
        if (entry.categoryCodes === null || entry.categoryCodes.length === 0) {
          failures.push(
            `§${entry.section}: scope '${entry.scope}' but categoryCodes is ${JSON.stringify(entry.categoryCodes)} — expected a non-empty array`,
          );
        }
      }
    }
    expect(failures, `scope/categoryCodes disagreements:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  // Vacuous until the .1 entries land, and deliberately written ahead of them. A .1 subsection
  // states what falls inside a category; it never enumerates boundary processes. The moment one
  // of those entries is added with a populated `processes`, that is the mistake this catches.
  it('special_provisions entries never enumerate processes', () => {
    const failures = BOUNDARIES.filter(
      (e) => e.scope === 'special_provisions' && e.processes !== null,
    ).map(
      (e) =>
        `§${e.section}: scope 'special_provisions' but processes is ${JSON.stringify(e.processes)} — expected null`,
    );
    expect(failures, `special_provisions entries enumerating processes:\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});
