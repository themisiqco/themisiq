// vitest.config.ts
// Added 30 Sep 2026 so a test can import a page that uses the "@/" alias (tsconfig.json paths:
// "@/*" -> "./*").
// setupFiles (Oct 2026): vitest.setup.ts clears the app's secrets and deployment flags before each test file, so a test
// sees only the environment it sets (lib/testing/clearedEnv.ts). Every other option is Vitest's default.
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // BR3: 'server-only' is aliased by Next itself (next/dist/build/create-compiler-aliases.js) and is not an installed
  // package, so tests resolve it to Next's own empty module, as the server build does.
  resolve: { alias: {
    '@': fileURLToPath(new URL('.', import.meta.url)),
    'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)),
  } },
  test: { setupFiles: ['./vitest.setup.ts'] },
})
