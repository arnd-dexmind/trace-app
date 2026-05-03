import { test } from "@playwright/test";

test("inspect dashboard", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  const s = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Inspect Space", description: "Test" },
  });
  const space = await s.json();
  await page.request.post("http://localhost:3000/api/spaces/" + space.id + "/inventory", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Test Hammer", category: "Tools", quantity: 2 },
  });
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  await page.goto("/");
  await page.waitForTimeout(2000);
  const text = await page.locator("body").innerText();
  console.log("=== DASHBOARD TEXT ===");
  console.log(text.substring(0, 1500));
});

test("inspect items", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  const s = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Items Space", description: "Test" },
  });
  const space = await s.json();
  await page.request.post("http://localhost:3000/api/spaces/" + space.id + "/inventory", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Test Hammer", category: "Tools", quantity: 2 },
  });
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  await page.goto("/items");
  await page.waitForTimeout(2000);
  const text = await page.locator("body").innerText();
  console.log("=== ITEMS TEXT ===");
  console.log(text.substring(0, 1500));
});

test("inspect settings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-tenant");
    localStorage.setItem("trace-space-id", "dummy");
  });
  await page.goto("/settings");
  await page.waitForTimeout(2000);
  const text = await page.locator("body").innerText();
  console.log("=== SETTINGS TEXT ===");
  console.log(text.substring(0, 1500));
});
