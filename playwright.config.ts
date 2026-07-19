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
    baseURL: "http://localhost:8080",
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
        // browser (via PLAYWRIGHT_BROWSERS_PATH) on developer machines.
        launchOptions: {
          executablePath:
            process.env.SEAPHORE_CHROMIUM || "/chromium-1194/chrome-linux/chrome",
        },

      },
    },
  ],
});
