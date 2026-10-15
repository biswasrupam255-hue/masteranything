import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // text  -> humans reading CI logs
      // json-summary -> we parse it for the job summary
      // html  -> uploaded as an artifact you can download and click through
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      // server.ts is the process entry point: nothing to unit test, and
      // including it would punish you for an untestable line.
      exclude: ["src/server.ts"],
      // A floor, not a target. CI fails below this.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
