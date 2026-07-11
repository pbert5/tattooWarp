// Drives the app in a real browser with Playwright to produce the
// screenshots embedded in the top-level README. Not part of the app build;
// a dev-only tool for regenerating docs imagery when the UI changes.
//
// Usage (from app/, with `npm run dev` already running on port 5183):
//   node ../examples/generate-screenshots.mjs
//
// Requires Playwright's Chromium (already a devDependency of app/); if it
// isn't installed yet, run `npx playwright install chromium` first. Set
// PLAYWRIGHT_CHROMIUM_PATH to point at a prebuilt binary instead (used by
// sandboxed/CI environments that ship their own browser).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const EX = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(EX, "screenshots");
const BASE_URL = process.env.TATTOOWARP_DEV_URL ?? "http://localhost:5183/";

// Resolve playwright from app/'s node_modules regardless of which directory
// this script is invoked from (it lives outside app/, so a plain `import
// "playwright"` wouldn't find it there).
const appRequire = createRequire(path.join(EX, "..", "app", "package.json"));
const { chromium } = appRequire("playwright");

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));

await page.goto(BASE_URL);
await page.waitForSelector(".app-shell");
await page.screenshot({ path: `${OUT}/01-empty.png` });

// --- Import the sample forearm mesh ---
const fileInput = page.locator('input[type=file][accept*=".obj"]');
await fileInput.setInputFiles(path.join(EX, "sample-forearm.obj"));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/02-model-imported-centerline.png` });

// --- Add a couple more rings ---
await page.locator(".hamburger").click();
await page.locator("input[type=number]").fill("3");
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
await page.locator(".hamburger").click(); // close menu
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-three-rings.png` });

// --- Enter crop mode ---
await page.getByRole("button", { name: "Crop", exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-crop-mode.png` });
await page.getByRole("button", { name: "Cancel", exact: true }).click();
await page.waitForTimeout(300);

// --- Import graphics: one static band, one tiling motif ---
async function importGraphic(filename) {
  const menuButton = page.getByRole("button", { name: "Import graphic…" });
  if (!(await menuButton.isVisible().catch(() => false))) {
    await page.locator(".hamburger").click();
  }
  await menuButton.waitFor({ state: "visible", timeout: 5000 });
  await menuButton.click();
  const graphicInput = page.locator('input[type=file][accept*="svg"]');
  await graphicInput.setInputFiles(path.join(EX, filename));
  await page.waitForTimeout(400);
}

await importGraphic("static-band.svg");
await importGraphic("tiling-diamond.svg");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/05-graphics-imported.png` });

// Select the tiling-diamond graphic node (order depends on layer sort) and enable tiling
const items = page.locator(".graphic-tree-item");
const nameInputs = page.locator(".graphic-tree-item input.graphic-name");
const nameCount = await nameInputs.count();
let diamondIndex = 0;
for (let i = 0; i < nameCount; i++) {
  const v = await nameInputs.nth(i).inputValue();
  if (v.includes("tiling-diamond")) diamondIndex = i;
}
const diamondItem = items.nth(diamondIndex);
await diamondItem.click();
await page.waitForTimeout(200);

const tilingCheckbox = diamondItem.getByRole("checkbox").first();
await tilingCheckbox.check();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/06-tiling-enabled.png` });

// Nudge tiling options: staggered on, tighter unit size, so the layout looks lively
const staggeredCheckbox = diamondItem.locator(".tiling-options input[type=checkbox]");
if (await staggeredCheckbox.count()) await staggeredCheckbox.check();
const unitSizeSlider = diamondItem.locator(".tiling-options input[type=range]").first();
if (await unitSizeSlider.count()) await unitSizeSlider.fill("0.55");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/07-tiling-staggered.png` });

// Adjust a ring slider on the right sidebar
const ringSlider = page.locator(".sidebar-right input[type=range]").first();
if (await ringSlider.count()) {
  await ringSlider.fill("70");
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${OUT}/08-ring-height-adjusted.png` });

// Orbit the viewer a bit for a nicer final overview shot
const canvas = page.locator(".viewer canvas");
const box = await canvas.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${OUT}/09-overview.png` });

await browser.close();
console.log(`wrote screenshots to ${OUT}`);
