import { test } from "@playwright/test";
import * as fs from "fs";

test("dump dashboard", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  const spaceRes = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Dump Space", description: "Test" },
  });
  const space = await spaceRes.json();
  await page.request.post("http://localhost:3000/api/spaces/" + space.id + "/inventory", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Test Hammer", category: "Tools", quantity: 2 },
  });
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  await page.goto("/");
  await page.waitForTimeout(2000);
  fs.writeFileSync("test-results/dashboard-content.txt", await page.content());
});

test("dump items", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  const spaceRes = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Items Space", description: "Test" },
  });
  const space = await spaceRes.json();
  await page.request.post("http://localhost:3000/api/spaces/" + space.id + "/inventory", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Test Hammer", category: "Tools", quantity: 2 },
  });
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  await page.goto("/items");
  await page.waitForTimeout(2000);
  fs.writeFileSync("test-results/items-content.txt", await page.content());
});

test("dump settings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-tenant");
    localStorage.setItem("trace-space-id", "dummy");
  });
  await page.goto("/settings");
  await page.waitForTimeout(2000);
  fs.writeFileSync("test-results/settings-content.txt", await page.content());
});
