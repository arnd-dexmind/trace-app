import { chromium } from "playwright";
import path from "path";

const PREVIEW_PATH = path.resolve(__dirname, "preview.html");
const FILE_URL = `file://${PREVIEW_PATH}`;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const SCREENSHOT_DIR = path.resolve(__dirname, "..", "test-results", "brand-qa");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const issues: string[] = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n[${vp.name}] Viewport ${vp.width}x${vp.height}`);
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();

    try {
      await page.goto(FILE_URL, { waitUntil: "networkidle", timeout: 10000 });
    } catch {
      issues.push(`[${vp.name}] Page load failed or timed out`);
      await context.close();
      continue;
    }

    // Check page title
    const title = await page.title();
    console.log(`  Title: "${title}"`);
    if (!title.includes("PerifEye")) {
      issues.push(`[${vp.name}] Page title missing "PerifEye": "${title}"`);
    }

    // Verify all <img> tags loaded without errors
    const imgCount = await page.locator("img").count();
    console.log(`  Images found: ${imgCount}`);

    for (let i = 0; i < imgCount; i++) {
      const img = page.locator("img").nth(i);
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      const naturalHeight = await img.evaluate((el: HTMLImageElement) => el.naturalHeight);
      const src = await img.getAttribute("src");
      console.log(`  img[${i}] ${src} => natural ${naturalWidth}x${naturalHeight}`);

      if (naturalWidth === 0 || naturalHeight === 0) {
        issues.push(`[${vp.name}] Broken image: ${src} (0x0 natural size)`);
      }
    }

    // Verify inline SVGs render
    const inlineSvgCount = await page.locator("main svg").count();
    console.log(`  Inline SVGs: ${inlineSvgCount}`);

    // Check for any visible visual clipping/overflow issues via body overflow
    const bodyOverflowX = await page.evaluate(() => {
      const body = document.body;
      return body.scrollWidth > body.clientWidth;
    });
    if (bodyOverflowX) {
      issues.push(`[${vp.name}] Horizontal overflow detected`);
    }

    // Screenshot full page
    const screenshotPath = path.join(SCREENSHOT_DIR, `logo-${vp.name}-${vp.width}x${vp.height}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    await context.close();
  }

  console.log("\n=== QA Findings ===");
  if (issues.length === 0) {
    console.log("PASS: No rendering issues detected.");
  } else {
    console.log(`FAIL: ${issues.length} issue(s) found:`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  await browser.close();
  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(2);
});
