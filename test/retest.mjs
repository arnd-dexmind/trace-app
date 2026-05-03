import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const API = "http://localhost:3001";
const TENANT = "qa-retest";

const RESULTS = [];

function result(severity, area, detail) {
  RESULTS.push({ severity, area, detail });
  console.log(`  ${severity === "PASS" ? "✓" : severity === "FAIL" ? "✗" : "!"} [${severity}] ${area}: ${detail}`);
}

async function seed(request) {
  await request.post(`${API}/api/onboarding/tour/complete`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  });
  const r = await request.post(`${API}/api/spaces`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { name: "Retest Space", description: "Re-test space" },
  });
  if (r.ok()) {
    const space = await r.json();
    await request.post(`${API}/api/spaces/${space.id}/inventory`, {
      headers: { "content-type": "application/json", "x-tenant-id": TENANT },
      data: { name: "Test Item", category: "Tools", quantity: 1 },
    });
    return space.id;
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const request = context.request;

  const spaceId = await seed(request);
  console.log(`Seeded space: ${spaceId}\n`);

  await context.addInitScript((id, tenant) => {
    localStorage.setItem("trace-tenant-id", tenant);
    if (id) localStorage.setItem("trace-space-id", id);
  }, spaceId, TENANT);

  // ═══════════════════════════════════════════════
  // 1. MOBILE OVERFLOW FIX VERIFICATION
  // ═══════════════════════════════════════════════
  console.log("=== 1. MOBILE OVERFLOW ===");

  const viewports = [
    { w: 320, h: 568, name: "320px" },
    { w: 375, h: 812, name: "375px" },
    { w: 414, h: 896, name: "414px" },
    { w: 768, h: 1024, name: "768px" },
  ];

  const pages = ["/", "/items", "/repairs", "/upload", "/review", "/spaces", "/settings", "/analytics", "/compare"];

  let overflowFails = 0;
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    for (const path of pages) {
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(800);

        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
        const viewW = await page.evaluate(() => window.innerWidth);

        if (scrollW > viewW + 5) {
          result("FAIL", `Overflow [${vp.name}] ${path}`, `scrollW=${scrollW} > viewW=${viewW}`);
          overflowFails++;
        }
      } catch (err) {
        result("FAIL", `Load [${vp.name}] ${path}`, err.message);
      }
    }
  }
  if (overflowFails === 0) {
    result("PASS", "Mobile overflow", "No horizontal overflow on any page at 320-768px");
  }

  // ═══════════════════════════════════════════════
  // 2. BOTTOM NAV VISIBILITY
  // ═══════════════════════════════════════════════
  console.log("\n=== 2. BOTTOM NAV ===");

  // Mobile: should be visible
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(800);

  const navOnMobile = await page.locator('nav[aria-label="Bottom navigation"]').isVisible().catch(() => false);
  if (navOnMobile) {
    result("PASS", "BottomNav mobile", "Visible on 375px viewport");
  } else {
    result("FAIL", "BottomNav mobile", "Not visible on 375px viewport");
  }

  // Desktop: should be hidden
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(500);

  const navOnDesktop = await page.locator('nav[aria-label="Bottom navigation"]').isVisible().catch(() => false);
  if (!navOnDesktop) {
    result("PASS", "BottomNav desktop", "Hidden on 1440px viewport");
  } else {
    result("FAIL", "BottomNav desktop", "Visible on desktop — should be hidden");
  }

  // Active route highlight
  await page.setViewportSize({ width: 375, height: 812 });
  for (const { path, label } of [
    { path: "/", label: "Home" },
    { path: "/items", label: "Items" },
    { path: "/repairs", label: "Repairs" },
    { path: "/upload", label: "Upload" },
    { path: "/review", label: "Review" },
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(500);
    const active = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
    const text = await active.textContent().catch(() => "");
    if (text && text.includes(label)) {
      result("PASS", `BottomNav active: ${label}`, "Correctly highlighted");
    } else {
      result("FAIL", `BottomNav active: ${label}`, `Expected "${label}", got "${text}"`);
    }
  }

  // ═══════════════════════════════════════════════
  // 3. LOADING SKELETONS (WITH NETWORK THROTTLE)
  // ═══════════════════════════════════════════════
  console.log("\n=== 3. LOADING SKELETONS ===");

  // Simulate slow 3G
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (400 * 1024) / 8, // 400 Kbps
    uploadThroughput: (400 * 1024) / 8,
    latency: 400, // ms
  });

  const loadingRoutes = [
    { path: "/", name: "Dashboard" },
    { path: "/items", name: "ItemSearch" },
    { path: "/repairs", name: "RepairList" },
    { path: "/analytics", name: "Analytics" },
  ];

  for (const route of loadingRoutes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}${route.path}`, { waitUntil: "commit" });
    await page.waitForTimeout(500);

    const hasLoading = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      return body.includes("loading");
    });

    if (hasLoading) {
      result("PASS", `Loading: ${route.name}`, "Loading indicator visible during fetch");
    } else {
      // Check for skeleton divs with animation
      const hasSkeleton = await page.evaluate(() => {
        const els = document.querySelectorAll("*");
        for (const el of els) {
          const style = window.getComputedStyle(el);
          if (style.animation && style.animation.includes("pulse")) return true;
        }
        return false;
      });
      if (hasSkeleton) {
        result("PASS", `Loading: ${route.name}`, "Skeleton animation detected");
      } else {
        result("WARN", `Loading: ${route.name}`, "No loading state or skeleton detected (data may be cached)");
      }
    }

    // Wait for full load
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // Disable throttling
  await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: 0, uploadThroughput: 0, latency: 0 });

  // ═══════════════════════════════════════════════
  // 4. DESKTOP NAV VERIFICATION
  // ═══════════════════════════════════════════════
  console.log("\n=== 4. DESKTOP NAV ON MOBILE ===");

  // At 375px, desktop nav links should NOT be visible
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(800);

  // The hamburger toggle should be visible
  const hamburger = page.locator('button[aria-label="Toggle navigation"]');
  const hamburgerVisible = await hamburger.isVisible().catch(() => false);
  if (hamburgerVisible) {
    result("PASS", "Mobile hamburger", "Toggle button visible on mobile");
  } else {
    result("FAIL", "Mobile hamburger", "Toggle button not visible on mobile");
  }

  // Desktop nav links should be hidden
  const desktopNavDivs = await page.locator(".desktop-nav").count();
  let desktopVisible = false;
  for (let i = 0; i < desktopNavDivs; i++) {
    const vis = await page.locator(".desktop-nav").nth(i).isVisible().catch(() => false);
    if (vis) desktopVisible = true;
  }
  if (!desktopVisible) {
    result("PASS", "Desktop nav hidden", "Desktop nav links hidden on mobile");
  } else {
    result("FAIL", "Desktop nav hidden", "Desktop nav links still visible on mobile");
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════");
  console.log("           SUMMARY");
  console.log("═══════════════════════════════════════");

  const passes = RESULTS.filter(r => r.severity === "PASS").length;
  const fails = RESULTS.filter(r => r.severity === "FAIL").length;
  const warns = RESULTS.filter(r => r.severity === "WARN").length;

  console.log(`\n${passes} PASS, ${fails} FAIL, ${warns} WARN`);

  if (fails > 0) {
    console.log("\nFAILURES:");
    RESULTS.filter(r => r.severity === "FAIL").forEach(r => console.log(`  ✗ ${r.area}: ${r.detail}`));
  }
  if (warns > 0) {
    console.log("\nWARNINGS:");
    RESULTS.filter(r => r.severity === "WARN").forEach(r => console.log(`  ! ${r.area}: ${r.detail}`));
  }

  await browser.close();

  // Exit code based on failures
  process.exit(fails > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
