import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ── Enforce sequential execution ──────────────────────────────────────
    // Tests share a real PostgreSQL database. Parallel execution would cause
    // race conditions: beforeEach from one test file deleting rows that
    // another test file just inserted.
    //
    // Vitest 4 removed poolOptions; use top-level maxWorkers instead.
    // ─────────────────────────────────────────────────────────────────────
    pool: "forks",
    maxWorkers: 1,         // single worker process
    minWorkers: 1,

    // Global setup — runs beforeAll/beforeEach hooks before every test
    setupFiles: ["./tests/setup.ts"],

    // Generous timeouts for real DB operations
    testTimeout: 20000,
    hookTimeout: 20000,

    // Environment variables
    env: {
      NODE_ENV: "test",
    },

    include: ["tests/**/*.test.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
});

