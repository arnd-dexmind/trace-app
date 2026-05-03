import { test } from "@playwright/test";

test("screenshot dashboard", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  
  const spaceRes = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Screenshot Space", description: "Test" },
  });
  const space = await spaceRes.json();
  
  await page.request.post("http://localhost:3000/api/spaces/" + space.id + "/inventory", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Test Hammer", category: "Tools", quantity: 2 },
  });
  
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/dashboard-screenshot.png", fullPage: true });
});

test("screenshot items", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  
  const spaceRes = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Screenshot Space 2", description: "Test" },
  });
  const space = await spaceRes.json();
  
  await page.request.post("http://localhost:3000/api/spaces/" + space.id + "/inventory", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Test Hammer", category: "Tools", quantity: 2 },
  });
  
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); localStorage.setItem("trace-tenant-id", "qa-tenant"); }, space.id);
  await page.goto("/items", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/items-screenshot.png", fullPage: true });
});

test("screenshot settings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-tenant");
    localStorage.setItem("trace-space-id", "dummy");
  });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/settings-screenshot.png", fullPage: true });
});

test("screenshot repairs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-tenant");
  });
  const spaceRes = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Repair Space", description: "Test" },
  });
  const space = await spaceRes.json();
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  await page.goto("/repairs");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/repairs-screenshot.png", fullPage: true });
});
