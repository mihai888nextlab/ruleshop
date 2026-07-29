import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Engine and contract tests live with their package; app-level tests live
    // with their app. One root runner keeps `npm test` a single command.
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
});
