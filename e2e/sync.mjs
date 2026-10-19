import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
const S = process.env.SHOTS || ".";
const mock = spawn("node", ["e2e/mock-gist.mjs"], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(name + ": " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(name + ": " + m.text()));
  await page.goto("http://localhost:4173/#/");
  await page.evaluate(() => localStorage.setItem("quaderno:gistApi", "http://localhost:4799"));
  await page.reload();
  await page.waitForSelector(".sidebar");
  return page;
}
async function connect(page) {
  await page.click('[aria-label="Impostazioni"]');
  await page.fill('input[placeholder="ghp_…"]', "ghp_fede0123456789abcdef");
  await page.click("button:has-text('Collega')");
  await page.waitForSelector("text=Collegato come", { timeout: 15000 });
  await page.keyboard.press("Escape");
}
try {
  // Dispositivo A: crea una lavagna con un titolo, poi collega la sincronizzazione
  const A = await device("A");
  await A.click("text=Crea la prima lavagna");
  await A.waitForSelector(".excalidraw");
  await A.fill(".title-input", "Dal Mac");
  await A.keyboard.press("Enter");
  await A.mouse.click(640, 500);
  await A.keyboard.press("r");
  await A.mouse.move(400, 300); await A.mouse.down(); await A.mouse.move(600, 420, { steps: 5 }); await A.mouse.up();
  await A.waitForTimeout(3500);
  await A.click('[aria-label="Torna alle lavagne"]');
  await A.waitForSelector(".card");
  await connect(A);
  await A.waitForSelector(".sync-idle", { timeout: 15000 });
  await A.screenshot({ path: `${S}/80-sync-A.png` });

  // Dispositivo B (altro profilo): si collega e deve ricevere la lavagna
  const B = await device("B");
  await connect(B);
  await B.waitForSelector(".card", { timeout: 15000 });
  console.log("B vede:", await B.$$eval(".card-title", (x) => x.map((t) => t.textContent)));
  const thumbB = await B.$eval(".card-thumb img", (i) => i.src.length).catch(() => 0);
  console.log("B miniatura:", thumbB > 100 ? "ok" : "MANCANTE");

  // B rinomina; A (al focus) deve vedere il nuovo titolo
  await B.click(".card-more");
  await B.click("text=Rinomina");
  await B.fill(".modal input", "Dal Mac · modificato su B");
  await B.keyboard.press("Enter");
  await B.waitForTimeout(4000);
  await A.bringToFront();
  await A.evaluate(() => window.dispatchEvent(new Event("focus")));
  await A.waitForSelector("text=modificato su B", { timeout: 15000 });
  console.log("A vede:", await A.$$eval(".card-title", (x) => x.map((t) => t.textContent)));

  // A elimina definitivamente; B deve perderla
  await A.click(".card-more"); await A.click("text=Sposta nel cestino");
  await A.waitForTimeout(500);
  await A.click("text=Cestino");
  await A.click(".card-more"); await A.click("text=Elimina definitivamente");
  await A.click("button:has-text('Elimina per sempre')");
  await A.waitForTimeout(4000);
  await B.bringToFront();
  await B.evaluate(() => window.dispatchEvent(new Event("focus")));
  await B.click("text=Tutte le lavagne");
  await B.waitForSelector(".empty-hero", { timeout: 15000 });
  console.log("B dopo eliminazione: nessuna lavagna ✓");
  console.log("ERRORS:", errors.length ? errors : "none");
} finally {
  await browser.close();
  mock.kill();
}
