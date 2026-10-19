// Genera le icone PNG (PWA + estensione) dal favicon.svg usando Chromium (Playwright).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const svg = readFileSync(join(root, "public/favicon.svg"), "utf8");
mkdirSync(join(root, "public/icons"), { recursive: true });
mkdirSync(join(root, "extension/icons"), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const targets = [
  ...[192, 512].map((s) => [s, join(root, `public/icons/icon-${s}.png`)]),
  ...[16, 32, 48, 128].map((s) => [s, join(root, `extension/icons/icon-${s}.png`)]),
];
for (const [size, path] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path, omitBackground: true });
}
await browser.close();
console.log("✓ icone generate");
