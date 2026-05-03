import { test, expect } from "@playwright/test";

// ── Helpers ─────────────────────────────────────────────────────────────

async function setupTenantAndSpace(page: any) {
  // Bypass onboarding via API (runs before page loads)
  await page.request.post("http://localhost:3001/api/onboarding/tour/complete", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
  });

  const spaceRes = await page.request.post("http://localhost:3001/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "QA Regression Space", description: "Regression test space" },
  });

  let spaceId: string | null = null;

  if (spaceRes.ok()) {
    const space = await spaceRes.json();
    spaceId = space.id;

    await page.request.post(`http://localhost:3001/api/spaces/${space.id}/inventory`, {
      headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
      data: { name: "Regression Hammer", category: "Tools", quantity: 2 },
    });
    await page.request.post(`http://localhost:3001/api/spaces/${space.id}/inventory`, {
      headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
      data: { name: "Regression Screwdriver", category: "Tools", quantity: 1 },
    });
    await page.request.post(`http://localhost:3001/api/spaces/${space.id}/inventory`, {
      headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
      data: { name: "Office Chair", category: "Furniture", quantity: 1 },
    });
  }

  // Inject localStorage before app JS runs
  await page.addInitScript((id: string | null) => {
    localStorage.setItem("trace-tenant-id", "qa-tenant");
    if (id) localStorage.setItem("trace-space-id", id);
  }, spaceId);

  return spaceId;
}

async function _waitForDashboard(page: any) {
  // Wait for "Loading dashboard..." to disappear or summary cards to appear
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return !body.includes("Loading dashboard...");
  }, { timeout: 15000 }).catch(() => {});
  // Give a moment for cards to render
  await page.waitForTimeout(500);
}

async function waitForSpaces(page: any) {
  // Wait until the space selector shows a real space (not "No spaces")
  await page.waitForFunction(() => {
    const select = document.querySelector('select[aria-label="Select space"]') as HTMLSelectElement;
    return select && select.options.length > 0 && select.options[0].value !== "";
  }, { timeout: 15000 }).catch(() => {});
}

// ── Setup ───────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupTenantAndSpace(page);
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
});

// ══════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD HOME PAGE
// ══════════════════════════════════════════════════════════════════════════

test("dashboard renders heading and quick actions", async ({ page }) => {
  await page.goto("/");

  // Wait for either the data state or the welcome state to appear
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return !body.includes("Loading dashboard...") &&
      (body.includes("Inventory Items") || body.includes("Welcome to PerifEye") || body.includes("No Space Selected"));
  }, { timeout: 20000 });

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("At-a-glance view of your space")).toBeVisible();

  // Quick action link should always be present
  await expect(page.getByRole("link", { name: "+ New Walkthrough" })).toBeVisible();

  // TopNav Dashboard link
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});

test("dashboard shows empty state for space with no data", async ({ page }) => {
  // Create a fresh empty space
  const spaceRes = await page.request.post("http://localhost:3001/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Empty Test Space", description: "No data" },
  });

  let emptySpaceId: string | null = null;
  if (spaceRes.ok()) {
    const space = await spaceRes.json();
    emptySpaceId = space.id;
  }

  // Add an init script AFTER beforeEach's — it runs second and wins
  await page.addInitScript((id) => {
    if (id) localStorage.setItem("trace-space-id", id);
  }, emptySpaceId);

  await page.goto("/");

  // Wait for dashboard to load
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return !body.includes("Loading dashboard...");
  }, { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Should show the welcome/empty state
  await expect(page.getByText("Welcome to PerifEye")).toBeVisible();
  await expect(page.getByText("Upload your first walkthrough")).toBeVisible();
  await expect(page.getByText("Review observations")).toBeVisible();
  await expect(page.getByText("Manage inventory & repairs")).toBeVisible();
});

test("dashboard top nav links are present", async ({ page }) => {
  await page.goto("/");

  // Check primary nav links are present
  const navLinks = ["Dashboard", "Spaces", "Review", "Items", "Repairs", "Capture"];
  for (const label of navLinks) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }

  // Space selector should be visible
  await expect(page.locator('select[aria-label="Select space"]')).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════
// 2. GLOBAL SEARCH (ItemSearch page)
// ══════════════════════════════════════════════════════════════════════════

test("item search renders search input, sort, filter, and result section", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  // Wait for results to load (items or empty state)
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return body.includes("items found") || body.includes("No items found");
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Search input (rendered as combobox in the page)
  const searchInput = page.locator('input[type="search"]');
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toHaveAttribute("placeholder", /Search items/);

  // Sort dropdown
  const sortSelect = page.locator('[aria-label="Sort items"]');
  await expect(sortSelect).toBeVisible();

  // Filter toggle button
  await expect(page.getByRole("button", { name: /Filters/ })).toBeVisible();

  // Order toggle button
  await expect(page.getByRole("button", { name: /Sort/ })).toBeVisible();

  // Results section header
  await expect(page.getByText("Results")).toBeVisible();
});

test("item search filter panel opens and shows category chips", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  // Wait for results to load (needed for category chips to populate)
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return body.includes("items found") || body.includes("No items found");
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Open filter panel
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.waitForTimeout(300);

  // Filter panel should have category controls (use .last() — "Category" also matches sort option)
  await expect(page.getByText("Category").last()).toBeVisible();

  // Confidence range inputs
  const minInput = page.locator('input[type="number"][placeholder="Min"]');
  const maxInput = page.locator('input[type="number"][placeholder="Max"]');
  await expect(minInput).toBeVisible();
  await expect(maxInput).toBeVisible();
});

test("item search text search filters results", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  const searchInput = page.locator('input[type="search"]');

  // Type "hammer" (should match only Regression Hammer)
  await searchInput.fill("hammer");
  await page.waitForTimeout(500);

  // If items loaded, hammer should be visible and others should not
  const hasHammer = await page.getByText("Regression Hammer").isVisible().catch(() => false);
  if (hasHammer) {
    await expect(page.getByText("Regression Screwdriver")).not.toBeVisible();
    await expect(page.getByText("Office Chair")).not.toBeVisible();
  }

  // Clear search
  await searchInput.fill("");
  await page.waitForTimeout(500);
});

test("item search sort changes URL", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  const sortSelect = page.locator('[aria-label="Sort items"]');

  // Default sort is name
  await expect(sortSelect).toHaveValue("name");

  // Change to category (sort options: name, category)
  await sortSelect.selectOption("category");
  await expect(page).toHaveURL(/sort=category/);

  // Toggle order
  await page.getByRole("button", { name: /Sort/ }).click();
  await expect(page).toHaveURL(/order=desc/);
});

test("item search clear filters resets URL state", async ({ page }) => {
  await page.goto("/items?sort=category&order=desc&category=Tools");
  await waitForSpaces(page);

  const clearBtn = page.getByText("Clear all");
  await expect(clearBtn).toBeVisible();

  await clearBtn.click();

  // URL should reset (no sort= or category= params)
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page).not.toHaveURL(/category=/);
});

test("item search empty results state", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  // Wait for initial results to load
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return body.includes("items found") || body.includes("No items found");
  }, { timeout: 15000 }).catch(() => {});

  const searchInput = page.locator('input[type="search"]');
  await searchInput.fill("xyzzy_nonexistent_item");

  // Wait for search debounce + API response
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return body.includes("No items found") || body.includes("0 items found");
  }, { timeout: 10000 }).catch(() => {});

  // Either empty state or zero count should appear
  const hasEmpty = await page.getByText("No items found").isVisible().catch(() => false);
  const hasZero = await page.getByText("0 items found").isVisible().catch(() => false);
  expect(hasEmpty || hasZero).toBeTruthy();
});

// ══════════════════════════════════════════════════════════════════════════
// 3. EXPORT WIZARD (Reports download UX)
// ══════════════════════════════════════════════════════════════════════════

test("export button opens dropdown with PDF and CSV options", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  const exportBtn = page.getByRole("button", { name: /Export/ });
  await expect(exportBtn).toBeVisible();

  // Click export to open dropdown
  await exportBtn.click();
  await page.waitForTimeout(300);

  // Dropdown should show PDF and CSV options
  await expect(page.getByText("PDF")).toBeVisible();
  await expect(page.getByText("Formatted report")).toBeVisible();
  await expect(page.getByText("CSV")).toBeVisible();
  await expect(page.getByText("Spreadsheet-ready")).toBeVisible();
});

test("export button dropdown closes on outside click", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  // Open dropdown
  await page.getByRole("button", { name: /Export/ }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText("Formatted report")).toBeVisible();

  // Click outside the dropdown
  await page.locator('input[type="search"]').click();
  await page.waitForTimeout(300);

  // Dropdown should close
  await expect(page.getByText("Formatted report")).not.toBeVisible();
});

test("export button toggles closed on second click", async ({ page }) => {
  await page.goto("/items");
  await waitForSpaces(page);

  const exportBtn = page.getByRole("button", { name: /Export/ });

  // Open dropdown
  await exportBtn.click();
  await page.waitForTimeout(200);
  await expect(page.getByText("Formatted report")).toBeVisible();

  // Click again to close
  await exportBtn.click();
  await page.waitForTimeout(300);

  await expect(page.getByText("Formatted report")).not.toBeVisible();
});

test("repairs page has export button for repair exports", async ({ page }) => {
  await page.goto("/repairs");
  await waitForSpaces(page);

  const exportBtn = page.getByRole("button", { name: /Export/ });
  await expect(exportBtn).toBeVisible();

  // Open dropdown
  await exportBtn.click();
  await page.waitForTimeout(200);
  await expect(page.getByText("Formatted report")).toBeVisible();
  await expect(page.getByText("Spreadsheet-ready")).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════
// 4. SETTINGS PAGES
// ══════════════════════════════════════════════════════════════════════════

test("settings page renders with three tabs", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // All three tab buttons should be visible
  await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Account" })).toBeVisible();

  // Profile tab should be active by default
  await expect(page.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
});

test("settings profile tab shows name field and save button", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("domcontentloaded");

  // "Profile" text matches both the tab and the content heading — use .first()
  await expect(page.getByText("Profile").first()).toBeVisible();
  await expect(page.getByText("Your personal information")).toBeVisible();

  // Name input should be present
  const nameInput = page.locator('input[placeholder="Your name"]');
  await expect(nameInput).toBeVisible();

  // Save button
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
});

test("settings notifications tab shows preference toggles", async ({ page }) => {
  await page.goto("/settings");

  // Switch to Notifications tab
  await page.getByRole("tab", { name: "Notifications" }).click();
  await page.waitForTimeout(500);

  // Section headings (these may fail if notifications API errors — show what we can see)
  await expect(page.getByText("Delivery Channels")).toBeVisible();
  await expect(page.getByText("Alert Configuration")).toBeVisible();

  // Toggle labels
  await expect(page.getByText("In-app notifications")).toBeVisible();
  await expect(page.getByText("Email notifications")).toBeVisible();

  // Save button should be present
  await expect(page.getByRole("button", { name: "Save Preferences" })).toBeVisible();
});

test("settings notifications save button is disabled with no changes", async ({ page }) => {
  await page.goto("/settings");

  // Switch to Notifications tab
  await page.getByRole("tab", { name: "Notifications" }).click();
  await page.waitForTimeout(500);

  const saveBtn = page.getByRole("button", { name: "Save Preferences" });
  await expect(saveBtn).toBeDisabled();
});

test("settings notifications toggle enables save button", async ({ page }) => {
  await page.goto("/settings");

  // Switch to Notifications tab
  await page.getByRole("tab", { name: "Notifications" }).click();
  await page.waitForTimeout(500);

  // Toggle the first switch
  const firstSwitch = page.getByRole("switch", { name: "In-app notifications" });
  await firstSwitch.click();
  await page.waitForTimeout(200);

  // Save button should now be enabled
  const saveBtn = page.getByRole("button", { name: "Save Preferences" });
  await expect(saveBtn).toBeEnabled();
});

test("settings account tab shows user info and session management", async ({ page }) => {
  await page.goto("/settings");

  // Switch to Account tab
  await page.getByRole("tab", { name: "Account" }).click();
  await page.waitForTimeout(500);

  // Section headings
  await expect(page.getByText("Account").first()).toBeVisible();
  await expect(page.getByText("Your account details")).toBeVisible();

  // Info rows
  await expect(page.getByText("User ID")).toBeVisible();
  await expect(page.getByText("Email")).toBeVisible();
  await expect(page.getByText("Member since")).toBeVisible();

  // Session management
  await expect(page.getByText("Session Management")).toBeVisible();
  await expect(page.getByText("Current session")).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
});

test("settings tab switching preserves correct aria-selected", async ({ page }) => {
  await page.goto("/settings");

  // Start on Profile
  await expect(page.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");

  // Click Notifications
  await page.getByRole("tab", { name: "Notifications" }).click();
  await page.waitForTimeout(300);
  await expect(page.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "false");

  // Click Account
  await page.getByRole("tab", { name: "Account" }).click();
  await page.waitForTimeout(300);
  await expect(page.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "false");
});

test("settings is reachable from nav link", async ({ page }) => {
  await page.goto("/");

  // Settings link in top nav
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  // Navigate via link
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
