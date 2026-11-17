import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // RLS-testset op databaseniveau. Vereist DATABASE_URL naar een lokale of
        // tijdelijke database, nooit productie.
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Tests via REST, Realtime en Edge Functions tegen een lokale Supabase
        // (supabase start). Vereist SUPABASE_URL, SUPABASE_ANON_KEY en de lokale
        // SUPABASE_SERVICE_ROLE_KEY uit `supabase status`.
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
