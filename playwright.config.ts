import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

import { shouldReuseExistingE2eServer } from "@/lib/e2e-server-policy";

/**
 * E2E harness for the two-client realtime suite (US-009): boots the real
 * server.ts app and drives two browser contexts. Single worker — files would
 * race on the shared server/database. Runs in its own workflow, not the
 * required CI gate (US-008).
 */
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const reuseExistingServer = shouldReuseExistingE2eServer(process.env);

export default defineConfig({
  testDir: "./e2e",
  // Realtime propagation is the thing under test — give it room, but fail loud.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    // Fresh by default so local runs cannot silently attach to a stale
    // server.ts process. `npm run test:e2e:reuse` is the explicit escape hatch.
    reuseExistingServer,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
