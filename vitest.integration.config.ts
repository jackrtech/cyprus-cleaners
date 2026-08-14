import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Separate config for src/test/integration/** — these hit the live Supabase
// project directly (no mocks) to verify real Postgres RLS policies, so they
// don't belong in the fast/hermetic default `npm test` run. Run explicitly
// via `npm run test:integration`. Individual test files self-skip
// (describe.skipIf) when live credentials aren't present in .env.local.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/test/integration/**/*.test.ts'],
  },
})
