import { test } from "@playwright/test";

test("debug spaces", async ({ page }) => {
  // Log ALL console messages and failed requests
  page.on("console", (msg) => console.log("CONSOLE:", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  page.on("requestfailed", (req) => console.log("REQUEST FAILED:", req.url(), req.failure()?.errorText));

  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  
  // Create space via direct API
  const s = await page.request.post("http://localhost:3001/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Debug Space " + Date.now(), description: "Test" },
  });
  const space = await s.json();
  console.log("SPACE CREATED:", space.id);
  
  await page.addInitScript((id) => { 
    localStorage.setItem("trace-space-id", id);
    console.log("INIT SCRIPT: space-id=" + id + " tenant=" + localStorage.getItem("trace-tenant-id"));
  }, space.id);
  
  await page.goto("/");
  await page.waitForTimeout(3000);
  
  // Check localStorage from the browser
  const tenant = await page.evaluate(() => localStorage.getItem("trace-tenant-id"));
  const spaceId = await page.evaluate(() => localStorage.getItem("trace-space-id"));
  console.log("BROWSER tenant:", tenant, "space:", spaceId);
  
  // Call the API from browser context
  const result = await page.evaluate(async () => {
    const r = await fetch("/api/spaces", {
      headers: { "x-tenant-id": localStorage.getItem("trace-tenant-id") || "default" }
    });
    return { status: r.status, ok: r.ok, body: await r.text() };
  });
  console.log("BROWSER SPACES:", result.status, result.ok);
  console.log("BROWSER SPACES body:", result.body.substring(0, 300));
});
