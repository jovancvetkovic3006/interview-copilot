import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against Next.js + PartyKit (real WebSocket sync).
 * LLM routes (/api/chat, /api/analyze-transcript, /api/interview-report) are mocked in tests.
 *
 * Locally: starts servers unless reuseExistingServer finds port 3000 already up.
 * CI: set CI=1 so servers always start fresh.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run e2e:servers",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_PARTYKIT_HOST: "localhost:1999",
      NEXT_PUBLIC_E2E_QUIZ: "1",
    },
  },
});
