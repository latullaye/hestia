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
// Notifications: one picture per kind, so that a notification says what it is about before it is read. "large" is the
// picture beside the text (Android, desktop); "badge" the white shape of the status bar. The service worker (src/sw.ts)
// picks them by name. Drawn from the app's line icons (Lucide), white on the accent colour, with the ember of the logo.
const require = createRequire(import.meta.url);
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const lucide = require("lucide-react");
const NOTIFY = {
  approval: "Hourglass", approved: "CircleCheck", declined: "CircleX", event: "CalendarClock", chores: "ListChecks",
  digest: "Sun", comment: "MessageCircle", arrival: "House", stay: "Luggage", gift: "Gift",
};
for (const [name, icon] of Object.entries(NOTIFY)) {
  const shape = (color, width) => `<g fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${
    renderToStaticMarkup(createElement(lucide[icon], { size: 24 })).replace(/<svg[^>]*>/, "").replace("</svg>", "")}</g>`;
  variants[`notify/${name}.png`] = [192, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="#1f6f78"/>
    <g transform="translate(42 40) scale(4.4)">${shape("#ffffff", 1.9)}</g><circle cx="158" cy="156" r="9" fill="#e9c58f"/></svg>`];
  variants[`notify/${name}-badge.png`] = [96, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g transform="translate(6 6) scale(3.5)">${shape("#ffffff", 2.4)}</g></svg>`];
}

const browser = await chromium.launch();
for (const [name, [size, markup]] of Object.entries(variants)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons written");
