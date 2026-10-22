import { defineConfig, devices } from "@playwright/test";

const pagesBase = process.env["GITHUB_ACTIONS"] ? "/neko-nap/" : "/";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:4173${pagesBase}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: `http://127.0.0.1:4173${pagesBase}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        ...(process.env["CI"] ? { channel: "chrome" as const } : {}),
      },
    },
  ],
});
