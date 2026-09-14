import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Run files sequentially: tests share the real data store (apps/data/virtual-keys.json).
    // Parallel workers race on file writes and resurrect deleted test keys.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov"],
    },
  },
});
