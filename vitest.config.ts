import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Edge Functions import supabase-js the Deno way. Mapping the specifier
      // to the installed package lets their behavioural tests load them (and
      // mock the client) without a Deno runtime. No app code uses `npm:`.
      'npm:@supabase/supabase-js@2': '@supabase/supabase-js',
    },
  },
  test: {
    environment: 'node',
    /**
     * Never the real project. Vite loads `.env` for tests as it does for the
     * app, so with these blank every suite starts in demo mode and a test that
     * forgets to mock the client reads localStorage, not production. A suite
     * that needs a client mocks `@/lib/supabase` itself.
     */
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    /**
     * `.tsx` as well as `.ts`. It was `.ts` only, which meant a component test
     * could be written, committed and never run — the suite would stay green
     * while testing nothing.
     */
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /**
     * Process stylesheets instead of stubbing them, so a test can read one and
     * hold it to something — `editor-styles.test.ts` checks that a checklist
     * item carries no strike-through until it is ticked. Stubbed, every such
     * assertion passes against an empty string and proves nothing.
     */
    css: true,
  },
})
