#!/usr/bin/env node
// ── THE SCOPE 3 SURFACE SNAPSHOT: WRITE IT ───────────────────────────────────────────────────────
//
//   npm run harness:scope3                         compare only (the same thing the suite does)
//   npm run harness:scope3 -- --update-cat3        rewrite Category 3 and the shared strings
//   npm run harness:scope3 -- --update-all --yes-fourteen-categories   rewrite everything
//
// The snapshot is lib/scope3/__snapshots__/scope3-surfaces.json and the capture lives in
// lib/scope3/scope3Surfaces.test.ts, which never writes unless SCOPE3_SNAPSHOT_UPDATE is set. This
// wrapper exists so the two update modes are named rather than remembered, and so updating all fifteen
// categories takes a second flag: the whole point of the snapshot is that the other fourteen cannot
// move quietly while Category 3 is rebuilt.

import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
let mode = ''
if (has('--update-cat3')) mode = 'cat3'
if (has('--update-all')) {
  if (!has('--yes-fourteen-categories')) {
    console.error(
      '--update-all rewrites all fifteen categories, including the fourteen this snapshot exists to hold\n' +
      'still. If that is what you mean, add --yes-fourteen-categories.')
    process.exit(2)
  }
  mode = 'all'
}
console.log(mode ? `Scope 3 surfaces: rewriting ${mode === 'all' ? 'the whole snapshot' : 'Category 3 and the shared strings'}` : 'Scope 3 surfaces: comparing against the committed snapshot')
const r = spawnSync('npx', ['vitest', 'run', 'lib/scope3/scope3Surfaces.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ...(mode ? { SCOPE3_SNAPSHOT_UPDATE: mode } : {}) },
})
if (mode && r.status === 0) console.log('Snapshot written. Review the diff before staging it.')
process.exit(r.status ?? 1)
