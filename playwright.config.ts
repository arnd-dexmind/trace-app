import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/frontend",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: [
    {
      command: "PORT=3001 npm run dev",
      port: 3001,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: "npm run client:dev",
      port: 5173,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
