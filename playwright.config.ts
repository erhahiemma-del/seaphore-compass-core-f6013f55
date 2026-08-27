import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Seaphore UI regression tests.
 *
 * The Vite dev server is expected to be running on http://localhost:8080
 * (the sandbox / local `bun run dev` default). We do not start it from here
 * so the same config works inside the Lovable sandbox and on CI machines
 * that spin the server up separately.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    // Post-deploy health checks point at a deployed origin; everything
    // else keeps the local dev server default.
    baseURL: process.env.SEAPHORE_HEALTH_URL || "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the sandbox's pre-installed Chromium so tests run without a
        // separate `playwright install` step. Falls through to the bundled
        // browser (via PLAYWRIGHT_BROWSERS_PATH) when that path is absent —
        // developer machines and CI runners that ran `playwright install`.
        launchOptions: {
          executablePath: resolveChromium(),
        },
      },
    },
  ],
});
