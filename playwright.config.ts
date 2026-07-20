import { defineConfig, devices } from "@playwright/test";

// Minimal e2e config: a single Chromium project against a production build
// served on a dedicated port so it never collides with `npm run dev`.
export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3210",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next start -p 3210",
    url: "http://localhost:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
