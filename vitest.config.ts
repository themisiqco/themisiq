// vitest.config.ts
// Added 30 Sep 2026 so a test can import a page that uses the "@/" alias (tsconfig.json paths:
// "@/*" -> "./*"). Nothing else is set: every other option is Vitest's default, as before this file.
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
})
