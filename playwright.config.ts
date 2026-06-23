import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the two-client realtime harness (US-009).
 *
 * Boots the REAL app (`server.ts` = Next.js + Socket.io) and drives two browser
 * contexts against it. Single worker: the suite shares one server and one
 * database, and the realtime tests coordinate two users on one board, so
 * parallel files would race on shared state. This suite is intentionally NOT
 * part of the required CI gate (US-008) — it runs in its own workflow.
 */
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
