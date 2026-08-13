// lib/ghg/engineCallSites.test.ts
//
// A TRIPWIRE, NOT A PROOF. Read this before trusting it.
//
// calcLocation and calcGas both throw MissingEmissionFactorError when a location's fuel unit has no
// published factor for its country. Every call site must therefore decide what to do about that
// refusal — isolate the location, or skip it — or it takes down whatever renders it. Two seams were
// missed by hand-auditing (renderStep2's live-results panel, and the CSV location breakdown), which
// is why this file exists: it fails when a NEW call site appears that nobody has thought about.
//
// ⚠️ IT IS DEFEATABLE, AND EASILY. This test greps source text. It does not understand the module
// graph. It is blind to:
//   - an aliased import — `import { calcLocation as cl }` and then `cl(loc, ...)`
//   - an indirect call — `const f = calcLocation; f(loc, ...)`, or passing it as a dependency the
//     way monthlyEmissions.ts already does (that one is listed below only because the parameter
//     happens to be *named* calcGas)
//   - a call reached through a re-export under a different name
//   - whether a listed call site is ACTUALLY guarded — it counts occurrences, it does not verify
//     the guard. The notes below are human claims, and they go stale like any comment.
// A passing run means "no new call site spelled the obvious way", nothing stronger. Do not treat a
// green here as evidence that the refusal is handled everywhere.
//
// WHY COUNTS AND NOT LINE NUMBERS: line numbers churn on every edit above them and would make this
// a nuisance. A count changes only when a call site is added or removed, which is exactly the event
// worth interrupting someone for.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO = join(__dirname, '..', '..');
const ROOTS = ['app', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

/** Test files call these directly on purpose — to assert that they DO throw. */
const isTest = (p: string) => /\.test\.tsx?$/.test(p);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !isTest(full)) out.push(full);
  }
  return out;
}

/**
 * Strip comments so prose ABOUT these functions doesn't register as a call. lib/vsme/b3Energy.ts
 * and lib/vsme/energyContent.ts both document that they mirror calcLocation(); neither calls it,
 * and without this they would need allow-list entries for a sentence.
 *
 * Deliberately conservative: block comments, and whole lines that are `//` or a JSDoc `*`
 * continuation. A trailing comment after real code still counts — over-reporting is the safe
 * direction for a tripwire.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

// Matches a call, including a method-style one (`deps.calcGas(`), but not an identifier that merely
// ENDS with the name (`myCalcGas(`).
const callCount = (src: string, fn: string): number =>
  (src.match(new RegExp(`(?<![A-Za-z0-9_$])${fn}\\s*\\(`, 'g')) ?? []).length;

interface AllowEntry {
  file: string;
  calcLocation: number;
  calcGas: number;
  /** One line per call site, saying how the refusal is handled there. */
  notes: string[];
}

const ALLOWED: AllowEntry[] = [
  {
    file: 'app/dashboard/ghg/page.tsx',
    calcLocation: 3,
    calcGas: 0,
    notes: [
      'renderStep2 live-results panel — guarded by unpriceableById; blocked location shows the reason instead of figures',
      'Review-step workings card — guarded by unpriceableById; blocked location shows the reason, TOTAL row shows an em dash',
      'generateExport CSV location breakdown — guarded by unpriceableById; blocked location emits an EXCLUDED row with the reason',
    ],
  },
  {
    file: 'lib/ghg/engine.ts',
    calcLocation: 3,
    calcGas: 16,
    notes: [
      'calcLocation — the definition itself',
      'unpriceableReason — IS the guard; wraps calcLocation in try/catch and returns the refusal',
      'calcInventory — guarded by unpriceableReason; an unpriceable location is excluded from the reduce',
      'calcGas — the definition itself',
      'calcLocation x7 (gas/propane/diesel/heating oil/heavy fuel oil/petrol/mobile diesel) — the origin; throws by design',
      'fuelEmissionsByType x7 — sole caller is pctEstimated, which skips unpriceable locations first',
      'buildWorkings pushFuel x1 — guarded; buildWorkings emits a declaration:"unpriceable" row and skips the location',
    ],
  },
  {
    file: 'lib/ghg/monthlyEmissions.ts',
    calcLocation: 0,
    calcGas: 1,
    notes: [
      'deps.calcGas — guarded by try/catch around pickEF+calcGas; an unpriceable bill lands in skipped[] rather than aborting the monthly write',
    ],
  },
];

describe('engine call sites — every caller of calcLocation / calcGas is accounted for', () => {
  const found = new Map<string, { calcLocation: number; calcGas: number }>();
  for (const root of ROOTS) {
    for (const file of walk(join(REPO, root))) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const counts = { calcLocation: callCount(src, 'calcLocation'), calcGas: callCount(src, 'calcGas') };
      if (counts.calcLocation > 0 || counts.calcGas > 0) {
        found.set(relative(REPO, file).split(sep).join('/'), counts);
      }
    }
  }

  it('no file calls calcLocation or calcGas without an allow-list entry', () => {
    const allowed = new Set(ALLOWED.map((a) => a.file));
    const unlisted = [...found.keys()].filter((f) => !allowed.has(f)).sort();
    expect(
      unlisted,
      unlisted.length
        ? `\n\nNEW CALL SITE(S) of calcLocation/calcGas in:\n  ${unlisted.join('\n  ')}\n\n` +
          'Both functions THROW MissingEmissionFactorError for a location whose fuel unit has no\n' +
          'factor for its country. Decide what this call site does about that — isolate the location\n' +
          '(show the reason instead of a figure) or skip it — then add an entry to ALLOWED in\n' +
          'lib/ghg/engineCallSites.test.ts with a note saying which.\n'
        : undefined,
    ).toEqual([]);
  });

  it('an allow-listed file has not gained or lost call sites', () => {
    for (const entry of ALLOWED) {
      const actual = found.get(entry.file);
      expect(actual, `${entry.file} is on the allow-list but no longer calls either function — remove its entry`).toBeDefined();
      expect(
        { file: entry.file, ...actual },
        `\n\n${entry.file} call-site count changed.\n` +
          'If you ADDED one: guard it, then bump the count and add a note to ALLOWED.\n' +
          'If you REMOVED one: drop the corresponding note and lower the count.\n' +
          `Documented call sites:\n  ${entry.notes.join('\n  ')}\n`,
      ).toEqual({ file: entry.file, calcLocation: entry.calcLocation, calcGas: entry.calcGas });
    }
  });

  it('every allow-listed call site carries a note explaining how it is guarded', () => {
    for (const entry of ALLOWED) {
      // One note per call site — a count with no explanation is how a seam gets missed.
      const sites = entry.calcLocation + entry.calcGas;
      const described = entry.notes.reduce((n, note) => {
        const m = note.match(/x(\d+)/); // "calcLocation x6" describes six sites in one line
        return n + (m ? Number(m[1]) : 1);
      }, 0);
      expect(described, `${entry.file}: ${sites} call sites but notes describe ${described}`).toBe(sites);
      expect(entry.notes.every((n) => n.trim().length > 20), `${entry.file}: a note is too short to say anything`).toBe(true);
    }
  });

  it('prose mentioning calcLocation() is not mistaken for a call', () => {
    // Regression guard on stripComments itself: lib/vsme documents that it mirrors calcLocation();
    // an earlier version of this scan flagged those JSDoc lines as call sites.
    expect(found.has('lib/vsme/b3Energy.ts')).toBe(false);
    expect(found.has('lib/vsme/energyContent.ts')).toBe(false);
  });
});
