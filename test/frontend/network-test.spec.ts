import { test } from "@playwright/test";

test("log network errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("response", async (r) => {
    if (r.status() >= 400) {
      const body = await r.text().catch(() => "");
      errors.push(`${r.status()} ${r.method()} ${r.url()}: ${body.substring(0, 200)}`);
    }
  });

  await page.addInitScript(() => localStorage.setItem("trace-tenant-id", "qa-tenant"));
  const s = await page.request.post("http://localhost:3000/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Net Debug Space", description: "Test" },
  });
  const space = await s.json();
  await page.addInitScript((id) => { localStorage.setItem("trace-space-id", id); }, space.id);
  
  await page.goto("/");
  await page.waitForTimeout(3000);
  
  console.log("=== NETWORK ERRORS ===");
  for (const e of errors) console.log(e);
  
  // Also check what the spaces API returns from browser
  const spacesText = await page.evaluate(async () => {
    const r = await fetch("/api/spaces", { headers: {"content-type":"application/json","x-tenant-id":localStorage.getItem("trace-tenant-id")||""} });
    return r.text();
  });
  console.log("=== SPACES FROM BROWSER ===");
  console.log(spacesText.substring(0, 500));
});
