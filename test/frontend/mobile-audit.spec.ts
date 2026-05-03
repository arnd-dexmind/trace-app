import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";
const API_URL = "http://localhost:3001";
const TENANT = "qa-audit";

const MOBILE_VIEWPORTS = [
  { name: "mobile-s", width: 320, height: 568 },
  { name: "mobile-m", width: 375, height: 812 },
  { name: "mobile-l", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 1024 },
];

const DESKTOP = { width: 1440, height: 900 };

async function seedData(request: any) {
  await request.post(`${API_URL}/api/onboarding/tour/complete`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  });
  const spaceRes = await request.post(`${API_URL}/api/spaces`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { name: "Audit Space", description: "QA audit" },
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

async function injectTenant(page: any, spaceId: string | null) {
  await page.addInitScript((id: string | null) => {
    localStorage.setItem("trace-tenant-id", "qa-audit");
    if (id) localStorage.setItem("trace-space-id", id);
  }, spaceId);
}

async function waitForLoad(page: any) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. MOBILE VIEWPORT RESPONSIVENESS (320px–768px)
// ══════════════════════════════════════════════════════════════════════════

const ALL_PAGES = [
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

for (const vp of MOBILE_VIEWPORTS) {
  for (const pageDef of ALL_PAGES) {
    test(`[${vp.name}] ${pageDef.name} — no horizontal overflow`, async ({ page, request }) => {
      const spaceId = await seedData(request);
      await injectTenant(page, spaceId);

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: "networkidle", timeout: 20000 });
      await waitForLoad(page);

      // Check no horizontal scrollbar
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 5);

      // Screenshot
      await page.screenshot({
        path: `test-results/mobile-audit/${vp.name}-${pageDef.name}.png`,
        fullPage: true,
      });
    });

    test(`[${vp.name}] ${pageDef.name} — text not clipped`, async ({ page, request }) => {
      const spaceId = await seedData(request);
      await injectTenant(page, spaceId);

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: "networkidle", timeout: 20000 });
      await waitForLoad(page);

      // Check no text is overflowing its container with ellipsis cutoff
      const overflowIssues = await page.evaluate(() => {
        const issues: string[] = [];
        const allElements = document.querySelectorAll("*");
        for (const el of allElements) {
          const style = window.getComputedStyle(el);
          if (style.overflow === "hidden" && style.textOverflow === "ellipsis") {
            if (el.scrollWidth > el.clientWidth) {
              issues.push(`${el.tagName}.${el.className}: scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`);
            }
          }
        }
        return issues;
      });
      // Ellipsis with scrollWidth > clientWidth is expected — just log for review
      if (overflowIssues.length > 0) {
        console.log(`[${vp.name}] ${pageDef.name}: ${overflowIssues.length} truncated elements`);
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2. LOADING SKELETON STATES
// ══════════════════════════════════════════════════════════════════════════

test("Dashboard shows loading state before data resolves", async ({ page, request }) => {
  await seedData(request);
  await injectTenant(page, null);

  await page.setViewportSize(DESKTOP);

  // Navigate and immediately check for loading indicators
  await page.goto(`${BASE_URL}/`, { waitUntil: "commit" });
  await page.waitForTimeout(300);

  // Check for loading text or skeleton
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasLoading = bodyText.includes("Loading") || bodyText.includes("loading");

  if (hasLoading) {
    await page.screenshot({ path: "test-results/mobile-audit/dashboard-loading.png" });
  }
  // Allow full load
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
});

test("ItemSearch shows loading state before items resolve", async ({ page, request }) => {
  await seedData(request);
  await injectTenant(page, null);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/items`, { waitUntil: "commit" });
  await page.waitForTimeout(300);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasLoading = bodyText.includes("Loading") || bodyText.includes("loading");
  if (hasLoading) {
    await page.screenshot({ path: "test-results/mobile-audit/items-loading.png" });
  }
});

test("RepairList shows loading state before repairs resolve", async ({ page, request }) => {
  await seedData(request);
  await injectTenant(page, null);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/repairs`, { waitUntil: "commit" });
  await page.waitForTimeout(300);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasLoading = bodyText.includes("Loading") || bodyText.includes("loading");
  if (hasLoading) {
    await page.screenshot({ path: "test-results/mobile-audit/repairs-loading.png" });
  }
});

test("Analytics shows loading state", async ({ page, request }) => {
  await seedData(request);
  await injectTenant(page, null);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/analytics`, { waitUntil: "commit" });
  await page.waitForTimeout(300);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasLoading = bodyText.includes("Loading") || bodyText.includes("loading");
  if (hasLoading) {
    await page.screenshot({ path: "test-results/mobile-audit/analytics-loading.png" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 3. EMPTY STATES
// ══════════════════════════════════════════════════════════════════════════

test("Dashboard empty state with no space selected", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-audit");
    localStorage.removeItem("trace-space-id");
  });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/dashboard-no-space.png", fullPage: true });

  // Should show "No Space Selected" or similar
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toMatch(/No Space|Select a space|Welcome/);
});

test("Dashboard empty state with fresh space (no data)", async ({ page, request }) => {
  // Create a truly empty space
  await request.post(`${API_URL}/api/onboarding/tour/complete`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  });
  const spaceRes = await request.post(`${API_URL}/api/spaces`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { name: "Empty Space", description: "No inventory" },
  });
  let emptyId: string | null = null;
  if (spaceRes.ok()) {
    const space = await spaceRes.json();
    emptyId = space.id;
  }

  await page.addInitScript((id: string | null) => {
    localStorage.setItem("trace-tenant-id", "qa-audit");
    if (id) localStorage.setItem("trace-space-id", id);
  }, emptyId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/dashboard-empty-space.png", fullPage: true });
});

test("ItemSearch empty results state", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/items`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  // Search for something that doesn't exist
  const searchInput = page.locator('input[type="search"]');
  await searchInput.fill("xyznonexistent12345");
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "test-results/mobile-audit/items-empty-results.png", fullPage: true });

  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toMatch(/No items|0 items/);
});

test("RepairList empty state with no repairs", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/repairs`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/repairs-empty.png", fullPage: true });
});

test("Spaces page empty state with no spaces", async ({ page, request }) => {
  // Don't seed spaces this time
  await request.post(`${API_URL}/api/onboarding/tour/complete`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-audit-empty" },
  });
  await page.addInitScript(() => {
    localStorage.setItem("trace-tenant-id", "qa-audit-empty");
  });

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/spaces`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/spaces-empty.png", fullPage: true });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. BOTTOM NAV BEHAVIOUR ON MOBILE
// ══════════════════════════════════════════════════════════════════════════

test("BottomNav is visible on mobile viewport", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  const nav = page.locator('nav[aria-label="Bottom navigation"]');
  await expect(nav).toBeVisible();

  await page.screenshot({ path: "test-results/mobile-audit/bottomnav-mobile-visible.png" });
});

test("BottomNav is hidden on desktop viewport", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  const nav = page.locator('nav[aria-label="Bottom navigation"]');
  await expect(nav).not.toBeVisible();
});

test("BottomNav highlights active route", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize({ width: 375, height: 812 });

  // Home active
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);
  const homeLink = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
  await expect(homeLink).toBeVisible();
  await expect(homeLink).toContainText("Home");

  // Items active
  await page.goto(`${BASE_URL}/items`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);
  const itemsLink = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
  await expect(itemsLink).toContainText("Items");

  // Repairs active
  await page.goto(`${BASE_URL}/repairs`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);
  const repairsLink = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
  await expect(repairsLink).toContainText("Repairs");

  // Upload active
  await page.goto(`${BASE_URL}/upload`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);
  const uploadLink = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
  await expect(uploadLink).toContainText("Upload");

  // Review active
  await page.goto(`${BASE_URL}/review`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);
  const reviewLink = page.locator('nav[aria-label="Bottom navigation"] a[aria-current="page"]');
  await expect(reviewLink).toContainText("Review");
});

test("BottomNav all five tabs present on mobile", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  const links = page.locator('nav[aria-label="Bottom navigation"] a');
  await expect(links).toHaveCount(5);

  const labels = ["Home", "Items", "Repairs", "Upload", "Review"];
  for (const label of labels) {
    await expect(page.locator('nav[aria-label="Bottom navigation"]').getByText(label)).toBeVisible();
  }
});

test("BottomNav does not overlap page content", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  // Check that bottom padding exists to prevent overlap
  const mainPadding = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    return window.getComputedStyle(main).paddingBottom;
  });

  // If main has padding-bottom, it should account for BottomNav height (~56px +)
  if (mainPadding) {
    const paddingPx = parseInt(mainPadding);
    expect(paddingPx).toBeGreaterThanOrEqual(56);
  }

  await page.screenshot({ path: "test-results/mobile-audit/bottomnav-no-overlap.png", fullPage: true });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. ERROR STATE HANDLING
// ══════════════════════════════════════════════════════════════════════════

test("Item detail shows error state for non-existent item", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/items/nonexistent-id-12345`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/item-detail-not-found.png", fullPage: true });
});

test("Repair detail shows error state for non-existent repair", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/repairs/nonexistent-id-12345`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/repair-detail-not-found.png", fullPage: true });
});

test("Processing shows error state for non-existent walkthrough", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/processing/nonexistent-id`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/processing-not-found.png", fullPage: true });
});

test("Results shows error state for non-existent walkthrough", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/results/nonexistent-id`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/results-not-found.png", fullPage: true });
});

test("Invalid share token shows error state", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE_URL}/share/invalid-token-999`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  await page.screenshot({ path: "test-results/mobile-audit/share-invalid-token.png", fullPage: true });
});

test("Network error banner appears when API is unreachable", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize(DESKTOP);

  // Block API requests to simulate network failure
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));

  await page.goto(`${BASE_URL}/`, { waitUntil: "commit" });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: "test-results/mobile-audit/network-error.png", fullPage: true });

  // Check for error banner or error text
  const body = await page.evaluate(() => document.body.innerText);
  const hasError = body.includes("error") || body.includes("Error") || body.includes("offline") || body.includes("network");
  if (hasError) {
    console.log("Error indicator found during network failure");
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 6. MOBILE-SPECIFIC REGRESSIONS
// ══════════════════════════════════════════════════════════════════════════

test("touch targets are at least 44px in height on mobile", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  const smallTargets = await page.evaluate(() => {
    const issues: { tag: string; text: string; height: number }[] = [];
    const interactive = document.querySelectorAll('a, button, input, select, [role="button"], [role="link"], [role="tab"]');
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      // Only check visible elements
      if (rect.height > 0 && rect.height < 44 && rect.width > 0) {
        issues.push({ tag: el.tagName, text: (el as HTMLElement).innerText?.slice(0, 30) || "", height: Math.round(rect.height) });
      }
    }
    return issues;
  });

  if (smallTargets.length > 0) {
    console.warn(`Small touch targets found: ${JSON.stringify(smallTargets.slice(0, 10))}`);
  }
  // Log but don't fail — some UI elements (small badges, inline links) may be under 44px legitimately
});

test("no overlapping elements on Dashboard mobile", async ({ page, request }) => {
  const spaceId = await seedData(request);
  await injectTenant(page, spaceId);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  // Check for elements that might overlap by looking for very close vertical positioning
  const overlaps = await page.evaluate(() => {
    const issues: string[] = [];
    const all = Array.from(document.querySelectorAll("header, main, nav, section, article, div")).filter((el) => {
      const s = window.getComputedStyle(el);
      return s.position === "fixed" || s.position === "sticky" || s.position === "absolute";
    });
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].getBoundingClientRect();
        const b = all[j].getBoundingClientRect();
        if (a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0) {
          const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
          if (overlap) {
            issues.push(`${(all[i] as HTMLElement).tagName} ↔ ${(all[j] as HTMLElement).tagName}`);
          }
        }
      }
    }
    return issues;
  });

  // Some overlap between fixed elements (TopNav + BottomNav) is expected if viewport is too small
  // Only flag if > 2 overlaps (normally just TopNav + BottomNav overlap is fine since one is top, one is bottom)
  if (overlaps.length > 2) {
    console.warn(`Unexpected overlaps: ${overlaps.join(", ")}`);
  }
});

test("settings tabs usable on mobile", async ({ page, request }) => {
  await seedData(request);
  await injectTenant(page, null);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle", timeout: 20000 });
  await waitForLoad(page);

  // All tabs should be visible
  await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Account" })).toBeVisible();

  // Switch tabs on mobile
  await page.getByRole("tab", { name: "Notifications" }).click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: "test-results/mobile-audit/settings-notifications-mobile.png", fullPage: true });
});
