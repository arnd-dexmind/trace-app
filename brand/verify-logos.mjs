import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_PATH = path.resolve(__dirname, "preview.html");
const FILE_URL = `file://${PREVIEW_PATH}`;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const SCREENSHOT_DIR = path.resolve(__dirname, "..", "test-results", "brand-qa");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function main() {
  const issues = [];

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n[${vp.name}] Viewport ${vp.width}x${vp.height}`);
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();

    try {
      await page.goto(FILE_URL, { waitUntil: "load", timeout: 10000 });
    } catch (err) {
      issues.push(`[${vp.name}] Page load failed: ${err.message}`);
      await context.close();
      continue;
    }

    const title = await page.title();
    console.log(`  Title: "${title}"`);
    if (!title.includes("PerifEye")) {
      issues.push(`[${vp.name}] Page title missing "PerifEye": "${title}"`);
    }

    // Verify all <img> tags loaded
    const imgCount = await page.locator("img").count();
    console.log(`  Images found: ${imgCount}`);

    for (let i = 0; i < imgCount; i++) {
      const img = page.locator("img").nth(i);
      const naturalWidth = await img.evaluate((el) => el.naturalWidth);
      const naturalHeight = await img.evaluate((el) => el.naturalHeight);
      const src = await img.getAttribute("src");
      console.log(`  img[${i}] natural ${naturalWidth}x${naturalHeight} (src: ${src})`);

      if (naturalWidth === 0 || naturalHeight === 0) {
        issues.push(`[${vp.name}] Broken image: ${src} (0x0 natural size)`);
      }
    }

    // Verify inline SVGs render
    const inlineSvgCount = await page.locator("main svg").count();
    console.log(`  Inline SVGs: ${inlineSvgCount}`);
    if (inlineSvgCount < 3) {
      issues.push(`[${vp.name}] Expected >=3 inline SVGs, found ${inlineSvgCount}`);
    }

    // Check for horizontal overflow
    const overflowX = await page.evaluate(() => {
      return { scrollW: document.body.scrollWidth, clientW: document.body.clientWidth };
    });
    if (overflowX.scrollW > overflowX.clientW + 2) {
      issues.push(`[${vp.name}] Horizontal overflow: scrollW=${overflowX.scrollW} > clientW=${overflowX.clientW}`);
    }

    // Screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, `logo-${vp.name}-${vp.width}x${vp.height}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot: ${screenshotPath}`);

    await context.close();
  }

  await browser.close();

  console.log("\n=== QA Findings ===");
  if (issues.length === 0) {
    console.log("PASS: No rendering issues detected.");
  } else {
    console.log(`FAIL: ${issues.length} issue(s) found:`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  return issues.length;
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(2);
  });
