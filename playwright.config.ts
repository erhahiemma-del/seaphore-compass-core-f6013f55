import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Which Chromium to launch.
 *
 * The sandbox ships one at a fixed path, so tests run there without an
 * install step. Returning `undefined` — rather than that path — when it
 * does not exist is what lets a CI runner use the browser it downloaded
 * itself; naming a missing binary fails the launch outright.
 */
function resolveChromium(): string | undefined {
  const explicit = process.env.SEAPHORE_CHROMIUM;
  if (explicit) return existsSync(explicit) ? explicit : undefined;
  const sandbox = "/chromium-1194/chrome-linux/chrome";
  return existsSync(sandbox) ? sandbox : undefined;
}

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
