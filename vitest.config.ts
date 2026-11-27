import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    // Live tests hit the hosted project; they run with `npm run test:live`.
    exclude: ["**/node_modules/**", "**/*.live.test.ts"],
  },
});
