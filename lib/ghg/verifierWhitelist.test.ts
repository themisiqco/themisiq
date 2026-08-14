// lib/ghg/verifierWhitelist.test.ts
//
// THE THREE COUPLED SITES, ASSERTED AGAINST EACH OTHER.
//
// get_verifier_inventory exposes ghg_inventories columns through an EXPLICIT whitelist, and every
// whitelisted column has to appear in three places that nothing holds together:
//   1. the jsonb_build_object projection      — what the verifier receives
//   2. the changed_fields array beside it     — what the audit trail may name as having changed
//   3. AUDIT_FIELD_LABELS in app/verify/[token]/page.tsx — how that name renders
//
// The failure mode is named in the factor_editions column comment: "a column named in the RPC
// without a label there renders to the verifier as 'Another field'". It is silent — no type error,
// no test failure, just a verifier reading an audit entry that says something they cannot identify
// changed. This file is what makes that fail instead.
//
// ⚠️ GENERIC ON PURPOSE, NOT factor_editions-SPECIFIC. A test naming one column would have to be
// rewritten for the next one, which is the same maintenance burden that let this drift in the first
// place. It parses the migration and compares sets, so the NEXT column fails it too, for free.
//
// It reads the LATEST get_verifier_inventory migration by filename order — the same rule a human
// applies, and the one the 6 Aug file states explicitly ("supersedes it. Reading the older file as
// the current definition is how you conclude a live field is not exposed").
//
// ⚠️ WHAT THIS CANNOT SEE: the migration FILE, not the live database. A function replaced by hand in
// the SQL editor and never captured to a migration is invisible here, and that has happened in this
// repo before. This test asserts the three sites in git agree; it does not assert git matches
// production. pg_get_functiondef is the only thing that does that.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const VERIFY_PAGE = join(process.cwd(), 'app', 'verify', '[token]', 'page.tsx');

/** The newest migration that defines get_verifier_inventory — filename order, like a reader would. */
function latestRpcMigration(): { name: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql') && /get_verifier_inventory/i.test(f))
    .sort();
  expect(files.length, 'no get_verifier_inventory migration found').toBeGreaterThan(0);
  const name = files[files.length - 1];
  return { name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') };
}

/** Strip SQL line comments so prose about a column is never mistaken for the column. */
const stripSql = (sql: string) =>
  sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

/** The keys of the INVENTORY jsonb_build_object — the projection whitelist. */
function projectionKeys(sql: string): string[] {
  const body = stripSql(sql);
  const start = body.indexOf('select jsonb_build_object(');
  expect(start, 'inventory projection not found').toBeGreaterThan(-1);
  const end = body.indexOf(') into v_inventory', start);
  expect(end, 'end of inventory projection not found').toBeGreaterThan(start);
  return [...body.slice(start, end).matchAll(/'([a-z0-9_]+)'\s*,\s*i\./g)].map(m => m[1]);
}

/** The field names inside the changed_fields unnest(array[...]). */
function changedFields(sql: string): string[] {
  const body = stripSql(sql);
  const start = body.indexOf('from unnest(array[');
  expect(start, 'changed_fields array not found').toBeGreaterThan(-1);
  const end = body.indexOf(']) as fld', start);
  expect(end, 'end of changed_fields array not found').toBeGreaterThan(start);
  return [...body.slice(start, end).matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]);
}

/** The keys of AUDIT_FIELD_LABELS, and the fallback the map falls through to. */
function auditLabels(): { keys: string[]; fallback: string } {
  const src = readFileSync(VERIFY_PAGE, 'utf8');
  const start = src.indexOf('const AUDIT_FIELD_LABELS');
  expect(start, 'AUDIT_FIELD_LABELS not found').toBeGreaterThan(-1);
  const end = src.indexOf('\n}', start);
  const block = src.slice(start, end).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const keys = [...block.matchAll(/^\s*([a-z0-9_]+)\s*:/gm)].map(m => m[1]);
  const fb = /AUDIT_FIELD_LABELS\[key\]\s*\?\?\s*'([^']+)'/.exec(src);
  expect(fb, 'the label fallback expression was not found').not.toBeNull();
  return { keys, fallback: fb![1] };
}

describe('the verifier whitelist is coherent across its three coupled sites', () => {
  const { name, sql } = latestRpcMigration();
  const projection = projectionKeys(sql);
  const changed = changedFields(sql);
  const { keys: labels, fallback } = auditLabels();

  it('W-1 the projection is non-trivial and the parse actually found it', () => {
    // Guards the regexes themselves: a parse that silently matched nothing would make every
    // assertion below pass vacuously, which is the classic way a source-text test rots.
    expect(projection.length, `${name}: projection parsed as empty`).toBeGreaterThan(10);
    expect(changed.length, `${name}: changed_fields parsed as empty`).toBeGreaterThan(10);
    expect(labels.length, 'AUDIT_FIELD_LABELS parsed as empty').toBeGreaterThan(10);
    expect(projection).toContain('company_name');
    expect(changed).toContain('company_name');
  });

  it('W-2 every projected column is named in changed_fields', () => {
    // Otherwise a verifier sees a field's VALUE but is never told when it was revised.
    const missing = projection.filter(c => !changed.includes(c)).sort();
    expect(missing,
      `\n\nPROJECTED BUT NOT IN changed_fields (${name}):\n  ${missing.join('\n  ')}\n\n` +
      'The verifier can see these values but the audit trail will never say they were revised.\n',
    ).toEqual([]);
  });

  it('W-3 changed_fields names nothing the verifier cannot see', () => {
    // The inverse, and it is the security-shaped half: naming a withheld column in the audit trail
    // tells a verifier that a field they are not permitted to see exists and changed.
    const leaked = changed.filter(c => !projection.includes(c)).sort();
    expect(leaked,
      `\n\nIN changed_fields BUT NOT PROJECTED (${name}):\n  ${leaked.join('\n  ')}\n\n` +
      'The audit trail would name a column the projection deliberately withholds.\n',
    ).toEqual([]);
  });

  it('W-4 every whitelisted column has a real label — not the "Another field" fallback', () => {
    // THE FAILURE THE COLUMN COMMENT WARNED ABOUT. A column in the RPC with no entry in
    // AUDIT_FIELD_LABELS renders to a verifier as the fallback, which identifies nothing.
    const unlabelled = [...new Set([...projection, ...changed])].filter(c => !labels.includes(c)).sort();
    expect(unlabelled,
      `\n\nWHITELISTED WITH NO LABEL (${name}):\n  ${unlabelled.join('\n  ')}\n\n` +
      `Each renders to the verifier as "${fallback}" in the audit trail — a revision they are told\n` +
      'about but cannot identify. Add an entry to AUDIT_FIELD_LABELS in app/verify/[token]/page.tsx.\n',
    ).toEqual([]);
  });

  it('W-5 factor_editions specifically completed all three sites', () => {
    // The column this file was written for. Kept as a named case ALONGSIDE the generic ones because
    // the generic tests pass just as happily if the column is absent from all three.
    expect(projection, 'factor_editions is not projected to the verifier').toContain('factor_editions');
    expect(changed, 'a revised edition map would not be named in the audit trail').toContain('factor_editions');
    expect(labels, 'factor_editions would render as the fallback').toContain('factor_editions');
  });

  it('W-6 the migration is ASCII-only — the 13 Aug paste failure', () => {
    // The factor_editions column migration did not paste cleanly into the Supabase SQL editor: only
    // its `alter table` ran, and the comment and grants had to be run separately. Non-ASCII in the
    // header block is the suspected cause. A migration that cannot be pasted whole is a migration
    // that lands in pieces, which is how a live function drifts from the file that claims to define it.
    const nonAscii = [...sql].map((ch, i) => ({ ch, i })).filter(x => x.ch.charCodeAt(0) > 127);
    const where = nonAscii.slice(0, 5).map(x => {
      const line = sql.slice(0, x.i).split('\n').length;
      return `line ${line}: ${JSON.stringify(x.ch)} (U+${x.ch.charCodeAt(0).toString(16).toUpperCase()})`;
    });
    expect(nonAscii.length,
      `\n\n${name} CONTAINS NON-ASCII CHARACTERS:\n  ${where.join('\n  ')}\n\n` +
      'Keep verifier-RPC migrations ASCII-only so they paste whole into the SQL editor.\n',
    ).toBe(0);
  });
});
