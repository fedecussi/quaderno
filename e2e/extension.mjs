// Carica dist-extension/ in Chromium e verifica che l'app parta dentro l'estensione.
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ext = resolve("dist-extension");
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "qd-")), {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const id = sw.url().split("/")[2];
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`chrome-extension://${id}/index.html#/`);
await page.waitForSelector(".empty-hero", { timeout: 15000 });
await page.click("text=Crea la prima lavagna");
await page.waitForSelector(".excalidraw");
await page.keyboard.press("t");
await page.mouse.click(500, 400);
await page.keyboard.type("Estensione OK");
await page.keyboard.press("Escape");
await page.waitForTimeout(3500);
const fontLoaded = await page.evaluate(() => document.fonts.check('16px "Excalifont"'));
await page.screenshot({ path: process.env.SHOT || "ext.png" });
console.log("extension id:", id, "| save:", await page.textContent(".save-indicator"), "| Excalifont loaded:", fontLoaded);
console.log("ERRORS:", errors.length ? errors : "none");
await ctx.close();
