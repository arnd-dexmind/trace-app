/* eslint-env node */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "test-results/ux-audit";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
};

const ROUTES = [
  "/", "/spaces", "/review", "/items", "/repairs",
  "/upload", "/capture",
];

const results = [];

const browser = await chromium.launch({ headless: true });

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  const context = await browser.newContext({ viewport: vp });
  const page = await context.newPage();

  for (const route of ROUTES) {
    const name = route === "/" ? "Dashboard" : route.slice(1);
    console.log(`[${vpName}] ${name}...`);

    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1500);

      // Screenshot
      await page.screenshot({
        path: `${OUT}/${vpName}-${name}.png`,
        fullPage: true,
      });

      // Axe scan
      const axeResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const violations = axeResults.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      results.push({
        viewport: vpName,
        route: name,
        screenshot: `${OUT}/${vpName}-${name}.png`,
        violations: violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.help,
          nodes: v.nodes.length,
        })),
        totalViolations: axeResults.violations.length,
      });

      if (violations.length > 0) {
        console.log(`  ${violations.length} serious/critical violations`);
        for (const v of violations) {
          console.log(`    - ${v.id}: ${v.help} (${v.impact}, ${v.nodes.length} nodes)`);
        }
      }
    } catch (e) {
      console.log(`  FAILED: ${e.message}`);
      results.push({ viewport: vpName, route: name, error: e.message });
    }
  }

  await context.close();
}

await browser.close();

// Write report
writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log(`\nReport written to ${OUT}/report.json with ${results.length} entries`);
