// Tests that talk to the hosted Supabase project: `npm run test:live`.
// The service key comes from .env.local and is handed to the tests with `provide`, never printed.
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const env = loadEnv("live", import.meta.dirname, "SUPABASE_");

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.live.test.ts"],
    provide: { supabaseSecretKey: env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" },
    // One test at a time: they share the test accounts and talk to a real server.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
