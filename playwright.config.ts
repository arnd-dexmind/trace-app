import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/frontend",
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: "http://localhost:1450",
    headless: true,
  },
});
