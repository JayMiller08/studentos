import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * Process stylesheets instead of stubbing them, so a test can read one and
     * hold it to something — `editor-styles.test.ts` checks that a checklist
     * item carries no strike-through until it is ticked. Stubbed, every such
     * assertion passes against an empty string and proves nothing.
     */
    css: true,
  },
})
