// vitest.setup.ts
//
// Runs before each test file (vitest.config.ts setupFiles). Deletes the app's secrets and deployment flags from
// process.env, so no test depends on what the machine running it has set: the list and the reason are in
// lib/testing/clearedEnv.ts. A test that needs one sets it with vi.stubEnv and restores it with vi.unstubAllEnvs.

import { CLEARED_ENV } from './lib/testing/clearedEnv'

for (const name of CLEARED_ENV) delete process.env[name]
