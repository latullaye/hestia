// Renders the PNG icons from public/icons/icon.svg with the Chromium that Playwright provides (npm run icons).
// Only needed when the logo changes; the PNG files are committed.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright"); // installed globally or as a dev dependency

const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const inner = svg.replace(/<svg[^>]*>/, "").replace("</svg>", "");
const shapes = inner.replace(/<rect[^>]*\/>/, "");
// maskable: full-bleed background, the drawing kept inside the safe zone; badge: a white shape for the status bar
const variants = {
  "icon-192.png": [192, svg], "icon-512.png": [512, svg], "apple-touch-icon.png": [180, svg.replace('rx="112"', 'rx="0"')],
  "icon-maskable-512.png": [512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f6f78"/><g transform="translate(64 64) scale(0.75)">${shapes}</g></svg>`],
  "badge.png": [96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 42 44 17Q50 13 56 17L88 42"/><path d="M32 46v40M66 46v40"/><path d="M32 70c11-14 23-14 34-2 5 5 10 6 16 2"/></g></svg>`],
};
const browser = await chromium.launch();
for (const [name, [size, markup]] of Object.entries(variants)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons written");
