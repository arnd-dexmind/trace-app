import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
} as const;

const ROUTES = [
  { path: "/", name: "Dashboard" },
  { path: "/spaces", name: "Spaces" },
  { path: "/review", name: "OperatorConsole" },
  { path: "/items", name: "ItemSearch" },
  { path: "/repairs", name: "RepairList" },
  { path: "/upload", name: "Upload" },
  { path: "/capture", name: "Capture" },
];

type _ViewportName = keyof typeof VIEWPORTS;

function _touchTargetViolations(_page: any) {
  // This is checked at code-review level; runtime detection is unreliable.
  // We document touch-target issues from source analysis.
}

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const route of ROUTES) {
    test(`[${vpName}] ${route.name} — screenshot + a11y`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(`http://localhost:3000${route.path}`, {
        waitUntil: "networkidle",
        timeout: 15000,
      });

      // Wait for any loading states to resolve
      await page.waitForTimeout(2000);

      // Screenshot
      await page.screenshot({
        path: `test-results/ux-audit/${vpName}-${route.name}.png`,
        fullPage: true,
      });

      // Axe a11y scan
      const results = new AxeBuilder({ page }).analyze();
      const violations = (await results).violations;

      if (violations.length > 0) {
        console.warn(
          `[${vpName}] ${route.name}: ${violations.length} a11y violations`
        );
        for (const v of violations) {
          console.warn(
            `  - ${v.id}: ${v.help} (impact: ${v.impact}, nodes: ${v.nodes.length})`
          );
        }
      }

      // No critical/serious violations rule
      const serious = violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? "")
      );
      expect(serious.length).toBe(0);
    });
  }
}
