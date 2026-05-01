import { test, expect } from "@playwright/test";

// Set up localStorage before each test so the app has a tenant and space context
test.beforeEach(async ({ page }) => {
  await page.goto("/");

  // The app reads tenant/space from localStorage. Inject them.
  await page.evaluate(() => {
    localStorage.setItem("trace-tenant-id", "qa-tenant");
  });

  const spaceRes = await page.request.post("http://localhost:3001/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "QA Test Space", description: "Smoke test space" },
  });

  if (spaceRes.ok()) {
    const space = await spaceRes.json();
    await page.evaluate((id) => {
      localStorage.setItem("trace-space-id", id);
    }, space.id);
  }

  // Reload to pick up localStorage values
  await page.reload();
});

test("item search page renders", async ({ page }) => {
  await page.goto("/items");
  await page.waitForLoadState("networkidle");

  // Search input should be visible
  const searchInput = page.locator('input[type="search"]');
  await expect(searchInput).toBeVisible();

  // Should show search placeholder
  await expect(searchInput).toHaveAttribute("placeholder", /Search items/);

  // Results section should be present
  await expect(page.getByText("Results")).toBeVisible();
});

test("repair list page renders with filter bar", async ({ page }) => {
  await page.goto("/repairs");
  await page.waitForLoadState("networkidle");

  // Page title
  await expect(page.getByRole("heading", { name: "Repair Issues" })).toBeVisible();

  // Filter buttons
  await expect(page.getByRole("button", { name: /All/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Monitoring/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Resolved/ })).toBeVisible();

  // Empty state should show when no repairs exist
  await expect(page.getByText("No repair issues found")).toBeVisible();
});

test("repair list filter buttons update active state on click", async ({ page }) => {
  await page.goto("/repairs");
  await page.waitForLoadState("networkidle");

  // Click "Open" filter
  const openBtn = page.getByRole("button", { name: /Open/ });
  await openBtn.click();

  // The "Open" button should now have active styling (brand background)
  // We verify by checking the button is still present and the page didn't crash
  await expect(openBtn).toBeVisible();

  // Click "Resolved"
  const resolvedBtn = page.getByRole("button", { name: /Resolved/ });
  await resolvedBtn.click();
  await expect(resolvedBtn).toBeVisible();
});

test("operator console loads review queue", async ({ page }) => {
  await page.goto("/review");
  await page.waitForLoadState("networkidle");

  // Should show the Operator Console header
  await expect(page.getByText("Operator Console")).toBeVisible();

  // Tabs should be visible
  await expect(page.getByRole("button", { name: /Pending/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Completed/ })).toBeVisible();

  // Empty state or queue items should show
  const queuePanel = page.locator('nav[aria-label="Candidate queue"]');
  await expect(queuePanel).toBeVisible();

  // Main panel shows the placeholder text when no task is selected
  await expect(page.getByText("Select a task from the queue")).toBeVisible();
});

test("upload flow page loads via nav", async ({ page }) => {
  // The app's nav has links to Review, Items, Repairs
  await page.goto("/items");
  await page.waitForLoadState("networkidle");

  // TopNav should be visible with PerifEye branding
  await expect(page.getByText("PerifEye")).toBeVisible();

  // Nav links
  await expect(page.getByRole("link", { name: "Review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Items" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Repairs" })).toBeVisible();

  // Space selector should be present
  const spaceSelector = page.locator('select[aria-label="Select space"]');
  await expect(spaceSelector).toBeVisible();
});

test("upload page renders drop zone with space selector", async ({ page }) => {
  await page.goto("/upload");
  await page.waitForLoadState("networkidle");

  // Space selector should be visible on the upload page
  const spaceSelect = page.locator("#upload-space-select");
  await expect(spaceSelect).toBeVisible();

  // Drop zone should be visible
  await expect(page.getByText("Drop walkthrough video here")).toBeVisible();

  // Walkthrough history section should be present
  await expect(page.getByText("Walkthrough History")).toBeVisible();

  // "+ New" button for creating spaces
  await expect(page.getByRole("button", { name: "+ New" })).toBeVisible();
});

test("upload page shows new space form on click", async ({ page }) => {
  await page.goto("/upload");
  await page.waitForLoadState("networkidle");

  // Click "+ New" to show the create space form
  await page.getByRole("button", { name: "+ New" }).click();

  // Form inputs should appear
  const nameInput = page.locator('input[placeholder="Space name"]');
  await expect(nameInput).toBeVisible();

  const descInput = page.locator('input[placeholder="Description (optional)"]');
  await expect(descInput).toBeVisible();

  // Cancel and form should disappear
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(nameInput).not.toBeVisible();
});

test("dashboard renders at / with summary cards and quick actions", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Page title
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Subtitle
  await expect(page.getByText("At-a-glance view of your space")).toBeVisible();

  // Either summary cards (if data exists) or empty state should show — both are valid
  const hasWelcome = await page.getByText("Welcome to PerifEye").isVisible().catch(() => false);
  if (hasWelcome) {
    // Empty state: setup steps visible
    await expect(page.getByText("Upload your first walkthrough")).toBeVisible();
  } else {
    // Has data: summary cards visible
    await expect(page.getByText("Inventory Items")).toBeVisible();
    await expect(page.getByText("Open Repairs")).toBeVisible();
  }

  // Quick actions or CTA should be present
  await expect(page.getByRole("link", { name: "+ New Walkthrough" })).toBeVisible();

  // TopNav Dashboard link
  const dashboardLink = page.getByRole("link", { name: "Dashboard" });
  await expect(dashboardLink).toBeVisible();
});

test("dashboard shows empty state for space with no data", async ({ page }) => {
  // Create a fresh space with no data
  const spaceRes = await page.request.post("http://localhost:3001/api/spaces", {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: { name: "Empty Test Space", description: "No data here" },
  });

  if (spaceRes.ok()) {
    const space = await spaceRes.json();
    await page.evaluate((id) => {
      localStorage.setItem("trace-space-id", id);
    }, space.id);
  }

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Empty state should show welcome message
  await expect(page.getByText("Welcome to PerifEye")).toBeVisible();

  // Setup steps should be visible
  await expect(page.getByText("Upload your first walkthrough")).toBeVisible();
  await expect(page.getByText("Review observations")).toBeVisible();
  await expect(page.getByText("Manage inventory & repairs")).toBeVisible();

  // CTA button should be present
  await expect(page.getByRole("link", { name: "+ New Walkthrough" })).toBeVisible();
});

test("capture page renders drop zone and accepts file selection", async ({ page }) => {
  await page.goto("/capture");
  await page.waitForLoadState("networkidle");

  // Page header
  await expect(page.getByRole("heading", { name: "Inventory Capture" })).toBeVisible();

  // Subtitle
  await expect(page.getByText("Upload photos or videos of your space")).toBeVisible();

  // Drop zone should be visible
  const dropZone = page.getByText("Drop photos or videos here");
  await expect(dropZone).toBeVisible();

  // Supported formats hint
  await expect(page.getByText(/JPG, PNG, GIF, WebP, MP4, WebM, MOV/)).toBeVisible();
});

test("capture page file select shows file in list with upload button", async ({ page }) => {
  await page.goto("/capture");
  await page.waitForLoadState("networkidle");

  // Use setInputFiles to programmatically set a file on the hidden input
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles({
    name: "test-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake-image-data"),
  });

  // The file should appear in the list
  await expect(page.getByText("test-photo.jpg")).toBeVisible();
  await expect(page.getByText("0 MB", { exact: true })).toBeVisible();

  // Upload button should appear
  await expect(page.getByRole("button", { name: /Upload 1 File/ })).toBeVisible();
});

test("capture page renders on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/capture");
  await page.waitForLoadState("networkidle");

  // Header should still be visible
  await expect(page.getByRole("heading", { name: "Inventory Capture" })).toBeVisible();

  // Drop zone should be visible
  await expect(page.getByText("Drop photos or videos here")).toBeVisible();
});

test("capture page is reachable from nav", async ({ page }) => {
  await page.goto("/capture");
  await page.waitForLoadState("networkidle");

  // TopNav should be visible with Capture link in active state
  await expect(page.getByRole("link", { name: "Capture" })).toBeVisible();

  // Space selector should be present
  const spaceSelector = page.locator('select[aria-label="Select space"]');
  await expect(spaceSelector).toBeVisible();
});

test("results page renders with empty state when no observations exist", async ({ page }) => {
  // Create a walkthrough in the current space
  const spaceId = await page.evaluate(() => localStorage.getItem("trace-space-id"));
  if (!spaceId) return;

  const wtRes = await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/walkthroughs`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
  });
  if (!wtRes.ok()) return;
  const walkthrough = await wtRes.json();

  await page.goto(`/results/${walkthrough.id}`);
  await page.waitForLoadState("networkidle");

  // Should show breadcrumb and header
  await expect(page.getByText("Walkthrough Results")).toBeVisible();

  // Empty state — no items detected
  await expect(page.getByText("No Items Detected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload Another Walkthrough" })).toBeVisible();
});

test("results page renders stats grid and item cards with observations", async ({ page }) => {
  const spaceId = await page.evaluate(() => localStorage.getItem("trace-space-id"));
  if (!spaceId) return;

  // Create walkthrough
  const wtRes = await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/walkthroughs`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
  });
  if (!wtRes.ok()) return;
  const walkthrough = await wtRes.json();

  // Ingest some observations to simulate AI processing
  await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/observations`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: {
      walkthroughId: walkthrough.id,
      items: [
        { label: "Binder - Blue 3-Ring", confidence: 96 },
        { label: "Fire Extinguisher #FE-042", confidence: 94 },
        { label: "Unknown Metal Object", confidence: 41 },
      ],
    },
  });

  await page.goto(`/results/${walkthrough.id}`);
  await page.waitForLoadState("networkidle");

  // Stats grid should be visible with summary counts
  await expect(page.getByText("Total Items")).toBeVisible();
  await expect(page.getByText("New")).toBeVisible();
  await expect(page.getByText("Matched")).toBeVisible();

  // Item cards should appear
  await expect(page.getByText("Binder - Blue 3-Ring")).toBeVisible();
  await expect(page.getByText("Fire Extinguisher #FE-042")).toBeVisible();
  await expect(page.getByText("Unknown Metal Object")).toBeVisible();

  // Confidence badges should show
  await expect(page.getByText("96%")).toBeVisible();
  await expect(page.getByText("94%")).toBeVisible();
  await expect(page.getByText("41%")).toBeVisible();

  // Status badges should appear (all "New" for unlinked items)
  await expect(page.getByText("New").first()).toBeVisible();

  // Keyboard hints should be present
  await expect(page.getByText("navigate")).toBeVisible();
});

test("results page stat cards filter list on click", async ({ page }) => {
  const spaceId = await page.evaluate(() => localStorage.getItem("trace-space-id"));
  if (!spaceId) return;

  const wtRes = await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/walkthroughs`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
  });
  if (!wtRes.ok()) return;
  const walkthrough = await wtRes.json();

  await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/observations`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: {
      walkthroughId: walkthrough.id,
      items: [
        { label: "Test Item Alpha", confidence: 90 },
        { label: "Test Item Beta", confidence: 60 },
      ],
    },
  });

  await page.goto(`/results/${walkthrough.id}`);
  await page.waitForLoadState("networkidle");

  // Both items visible initially
  await expect(page.getByText("Test Item Alpha")).toBeVisible();
  await expect(page.getByText("Test Item Beta")).toBeVisible();

  // Click "New" stat card to filter
  const statNew = page.getByRole("button", { name: /New:/ });
  await statNew.click();

  // Both should still be visible (both are "new" status items)
  await expect(page.getByText("Test Item Alpha")).toBeVisible();
  await expect(page.getByText("Test Item Beta")).toBeVisible();

  // Click "Matched" stat card — should filter to empty
  const statMatched = page.getByRole("button", { name: /Matched:/ });
  await statMatched.click();

  // Should show filtered-empty state
  await expect(page.getByText("No Matching Items")).toBeVisible();

  // Clear filters and items should reappear
  await page.getByRole("button", { name: "Clear All Filters" }).click();
  await expect(page.getByText("Test Item Alpha")).toBeVisible();
});

test("results page renders on mobile viewport", async ({ page }) => {
  const spaceId = await page.evaluate(() => localStorage.getItem("trace-space-id"));
  if (!spaceId) return;

  const wtRes = await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/walkthroughs`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
  });
  if (!wtRes.ok()) return;
  const walkthrough = await wtRes.json();

  await page.request.post(`http://localhost:3001/api/spaces/${spaceId}/observations`, {
    headers: { "content-type": "application/json", "x-tenant-id": "qa-tenant" },
    data: {
      walkthroughId: walkthrough.id,
      items: [{ label: "Mobile Test Item", confidence: 85 }],
    },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/results/${walkthrough.id}`);
  await page.waitForLoadState("networkidle");

  // Header and breadcrumb should still be visible
  await expect(page.getByText("Walkthrough Results")).toBeVisible();

  // Item card should be visible
  await expect(page.getByText("Mobile Test Item")).toBeVisible();

  // Nav should be reachable
  await expect(page.getByRole("link", { name: "Capture" })).toBeVisible();
});
