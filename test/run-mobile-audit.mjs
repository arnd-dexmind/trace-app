import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE_URL = "http://localhost:5173";
const API_URL = "http://localhost:3001";
const TENANT = "qa-audit";
const OUT = "test-results/mobile-audit";

mkdirSync(OUT, { recursive: true });

const MOBILE_SIZES = [
  { name: "mobile-s", width: 320, height: 568 },
  { name: "mobile-m", width: 375, height: 812 },
  { name: "mobile-l", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 1024 },
];

const PAGES = [
  { path: "/", name: "Dashboard" },
  { path: "/items", name: "ItemSearch" },
  { path: "/repairs", name: "RepairList" },
  { path: "/upload", name: "Upload" },
  { path: "/review", name: "Review" },
  { path: "/spaces", name: "Spaces" },
  { path: "/settings", name: "Settings" },
  { path: "/analytics", name: "Analytics" },
  { path: "/compare", name: "DeltaComparison" },
];

async function seedData(request) {
  await request.post(`${API_URL}/api/onboarding/tour/complete`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  });
  const spaceRes = await request.post(`${API_URL}/api/spaces`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { name: "Audit Space", description: "QA audit space" },
  });
  if (spaceRes.ok()) {
    const space = await spaceRes.json();
    await request.post(`${API_URL}/api/spaces/${space.id}/inventory`, {
      headers: { "content-type": "application/json", "x-tenant-id": TENANT },
      data: { name: "Audit Hammer", category: "Tools", quantity: 2 },
    });
    await request.post(`${API_URL}/api/spaces/${space.id}/inventory`, {
      headers: { "content-type": "application/json", "x-tenant-id": TENANT },
      data: { name: "Audit Screwdriver", category: "Tools", quantity: 1 },
    });
    return space.id;
  }
  return null;
}

const findings = [];

function finding(severity, area, detail) {
  findings.push({ severity, area, detail });
  const icon = severity === "fail" ? "✗" : severity === "warn" ? "!" : "✓";
  console.log(`  ${icon} [${severity}] ${area}: ${detail}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const request = context.request;

  const spaceId = await seedData(request);
  console.log(`Seeded space: ${spaceId}`);

  // Inject localStorage
  await context.addInitScript((id, tenant) => {
    localStorage.setItem("trace-tenant-id", tenant);
    if (id) localStorage.setItem("trace-space-id", id);
  }, spaceId, TENANT);

  // ═══════════════════════════════════════════════
  // 1. MOBILE RESPONSIVENESS
  // ═══════════════════════════════════════════════
  console.log("\n=== MOBILE RESPONSIVENESS ===");

  for (const vp of MOBILE_SIZES) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const pageDef of PAGES) {
      try {
        await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(1000);

        await page.screenshot({ path: `${OUT}/${vp.name}-${pageDef.name}.png`, fullPage: true });

        // Check horizontal overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        if (scrollWidth > viewportWidth + 5) {
          finding("fail", `[${vp.name}] ${pageDef.name}`, `Horizontal overflow: scrollWidth=${scrollWidth} > viewportWidth=${viewportWidth}`);
        }
      } catch (err) {
        finding("fail", `[${vp.name}] ${pageDef.name}`, `Page load failed: ${err.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════
  // 2. LOADING SKELETON STATES
  // ═══════════════════════════════════════════════
  console.log("\n=== LOADING SKELETON STATES ===");

  const loadingPages = ["/", "/items", "/repairs", "/analytics"];
  for (const path of loadingPages) {
    await page.setViewportSize({ width: 1440, height: 900 });
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "commit" });
      await page.waitForTimeout(400);

      const hasLoading = await page.evaluate(() => {
        return document.body.innerText.toLowerCase().includes("loading");
      });

      if (hasLoading) {
        await page.screenshot({ path: `${OUT}/loading-${path.replace(/\//g, "-")}.png` });
        finding("pass", `Loading state: ${path}`, "Loading indicator shown before data resolves");
      } else {
        finding("warn", `Loading state: ${path}`, "No loading indicator detected (may have loaded too fast or missing skeleton)");
      }
    } catch (err) {
      finding("fail", `Loading state: ${path}`, `Page load failed: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════
  // 3. EMPTY STATES
  // ═══════════════════════════════════════════════
  console.log("\n=== EMPTY STATES ===");

  // Test no-space dashboard
  await context.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-audit");
    localStorage.removeItem("trace-space-id");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/empty-dashboard-no-space.png`, fullPage: true });
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes("No Space") || body.includes("Select a space") || body.includes("Welcome")) {
      finding("pass", "Empty: Dashboard (no space)", "Shows appropriate empty/welcome state");
    } else {
      finding("fail", "Empty: Dashboard (no space)", "Missing empty state prompt");
    }
  } catch (err) {
    finding("fail", "Empty: Dashboard (no space)", `Page load failed: ${err.message}`);
  }

  // Test items empty search
  const spaceId2 = await seedData(request);
  await context.addInitScript((id) => {
    localStorage.setItem("trace-tenant-id", "qa-audit");
    if (id) localStorage.setItem("trace-space-id", id);
  }, spaceId2);

  await page.goto(`${BASE_URL}/items`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1000);

  const searchInput = page.locator('input[type="search"]');
  if (await searchInput.isVisible()) {
    await searchInput.fill("xyznonexistent_zzz");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/empty-items-search.png`, fullPage: true });
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes("No items") || body.includes("0 items")) {
      finding("pass", "Empty: ItemSearch", "Shows empty results state");
    } else {
      finding("warn", "Empty: ItemSearch", `Expected 'No items' or '0 items', got: "${body.slice(0, 200)}"`);
    }
  }

  // Test repairs empty (no repairs created)
  await page.goto(`${BASE_URL}/repairs`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/empty-repairs.png`, fullPage: true });
  const repairBody = await page.evaluate(() => document.body.innerText);
  if (repairBody.includes("No repairs") || repairBody.includes("0 repairs")) {
    finding("pass", "Empty: RepairList", "Shows empty repairs state");
  } else {
    finding("warn", "Empty: RepairList", `No empty state detected: "${repairBody.slice(0, 200)}"`);
  }

  // ═══════════════════════════════════════════════
  // 4. BOTTOM NAV ON MOBILE
  // ═══════════════════════════════════════════════
  console.log("\n=== BOTTOM NAV ===");

  // Mobile: should be visible
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1000);

  const bottomNavMobile = page.locator('nav[aria-label="Bottom navigation"]');
  const mobileVisible = await bottomNavMobile.isVisible().catch(() => false);
  if (mobileVisible) {
    await page.screenshot({ path: `${OUT}/bottomnav-mobile.png` });
    const linkCount = await page.locator('nav[aria-label="Bottom navigation"] a').count();
    if (linkCount === 5) {
      finding("pass", "BottomNav: mobile visibility", "Visible with 5 tabs on mobile (375px)");
    } else {
      finding("fail", "BottomNav: tab count", `Expected 5 tabs, found ${linkCount}`);
    }
  } else {
    finding("fail", "BottomNav: mobile visibility", "BottomNav not visible on mobile viewport");
  }

  // Desktop: should be hidden
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(500);

  const desktopVisible = await page.locator('nav[aria-label="Bottom navigation"]').isVisible().catch(() => false);
  if (!desktopVisible) {
    finding("pass", "BottomNav: desktop hidden", "Hidden on desktop as expected");
  } else {
    finding("warn", "BottomNav: desktop hidden", "BottomNav visible on desktop — should only show on mobile");
  }

  // Active route highlighting
  await page.setViewportSize({ width: 375, height: 812 });
  const bottomNavLinks = [
    { path: "/", label: "Home" },
    { path: "/items", label: "Items" },
    { path: "/repairs", label: "Repairs" },
    { path: "/upload", label: "Upload" },
    { path: "/review", label: "Review" },
  ];
  for (const { path, label } of bottomNavLinks) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(500);
    const activeLink = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
    const activeLabel = await activeLink.textContent().catch(() => "");
    if (activeLabel && activeLabel.includes(label)) {
      finding("pass", `BottomNav: active route ${path}`, `"${label}" correctly highlighted`);
    } else {
      finding("fail", `BottomNav: active route ${path}`, `Expected "${label}" active, got "${activeLabel}"`);
    }
  }

  // ═══════════════════════════════════════════════
  // 5. ERROR STATE HANDLING
  // ═══════════════════════════════════════════════
  console.log("\n=== ERROR STATES ===");

  await page.setViewportSize({ width: 1440, height: 900 });

  const errorRoutes = [
    { path: "/items/nonexistent-12345", name: "ItemDetail (404)" },
    { path: "/repairs/nonexistent-12345", name: "RepairDetail (404)" },
    { path: "/processing/nonexistent-12345", name: "Processing (404)" },
    { path: "/results/nonexistent-12345", name: "Results (404)" },
    { path: "/share/invalid-token-999", name: "Share (invalid token)" },
  ];

  for (const { path, name } of errorRoutes) {
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/error-${name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.png`, fullPage: true });

      const body = await page.evaluate(() => document.body.innerText);
      const hasError = body.includes("not found") || body.includes("Not Found") ||
        body.includes("error") || body.includes("Error") ||
        body.includes("doesn't exist") || body.includes("invalid") ||
        body.includes("404");
      if (hasError) {
        finding("pass", `Error: ${name}`, "Shows error/not-found state");
      } else {
        finding("warn", `Error: ${name}`, `No error indicator. Content: "${body.slice(0, 150)}"`);
      }
    } catch (err) {
      finding("fail", `Error: ${name}`, `Page load failed: ${err.message}`);
    }
  }

  // Network error simulation
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "commit" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/error-network-offline.png`, fullPage: true });
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes("error") || body.includes("Error") || body.includes("offline") || body.includes("unavailable") || body.includes("network")) {
      finding("pass", "Error: Network offline", "Error state shown when API unreachable");
    } else {
      finding("warn", "Error: Network offline", `No network error indicator. Content: "${body.slice(0, 150)}"`);
    }
  } catch (err) {
    finding("fail", "Error: Network offline", `Page load failed: ${err.message}`);
  }

  // ═══════════════════════════════════════════════
  // 6. SUMMARY
  // ═══════════════════════════════════════════════
  console.log("\n=== SUMMARY ===");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  const passes = findings.filter((f) => f.severity === "pass");

  console.log(`\n${passes.length} passed, ${warns.length} warnings, ${fails.length} failures`);

  if (fails.length > 0) {
    console.log("\nFAILURES:");
    for (const f of fails) {
      console.log(`  ✗ ${f.area}: ${f.detail}`);
    }
  }
  if (warns.length > 0) {
    console.log("\nWARNINGS:");
    for (const f of warns) {
      console.log(`  ! ${f.area}: ${f.detail}`);
    }
  }

  await browser.close();
  return { passes, warns, fails };
}

run().then((result) => {
  process.exit(result.fails.length > 0 ? 1 : 0);
}).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
