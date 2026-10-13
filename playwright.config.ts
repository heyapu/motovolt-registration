import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: { baseURL: "http://localhost:3140", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:demo -- --hostname 0.0.0.0 --port 3140",
    env: { APP_ORIGIN: "http://localhost:3140", PORTAL_API_TEST: "true" },
    url: "http://localhost:3140",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
