import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
const mock = spawn("node", ["e2e/mock-gist.mjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4173/#/");
  await page.evaluate(() => localStorage.setItem("quaderno:gistApi", "http://localhost:4799"));
  await page.reload(); await page.waitForSelector(".sidebar");
  // URL pubblico errato (repo) → corretto al salvataggio
  await page.click('[aria-label="Impostazioni"]');
  await page.click("summary:has-text('Avanzate')");
  await page.fill('input[placeholder="https://tuonome.github.io/quaderno/"]', "https://github.com/fedecussi/quaderno/");
  await page.fill('input[placeholder="ghp_…"]', "ghp_fede0123456789abcdef");
  await page.click("button:has-text('Collega')");
  await page.waitForSelector("text=Collegato come", { timeout: 15000 });
  await page.click("button:has-text('Salva')");
  await page.waitForTimeout(400);
  // crea lavagna grande
  await page.click("text=Crea la prima lavagna");
  await page.waitForSelector(".excalidraw");
  await page.mouse.click(640, 500);
  for (let i = 0; i < 12; i++) { await page.keyboard.press("r"); await page.mouse.move(150 + i * 60, 200); await page.mouse.down(); await page.mouse.move(200 + i * 60, 300, { steps: 3 }); await page.mouse.up(); await page.keyboard.press("Escape"); }
  await page.waitForTimeout(1500);
  await page.click("text=Condividi");
  await page.waitForSelector(".modal");
  await page.check(".modal input[type=checkbox] >> nth=1"); // link breve (la seconda casella: password è la prima)
  await page.click("text=Crea link");
  await page.waitForSelector(".share-link input", { timeout: 20000 });
  await page.waitForTimeout(400);
  const link = await page.inputValue(".share-link input");
  console.log("link:", link.slice(0, 80), "… lunghezza:", link.length, "| base corretta:", link.startsWith("https://fedecussi.github.io/quaderno/"));
  // apri in un altro profilo (senza token) → sostituisci la base con il preview locale
  const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p2.on("pageerror", (e) => errors.push("p2 " + e.message));
  await p2.goto("http://localhost:4173/#/");
  await p2.evaluate(() => localStorage.setItem("quaderno:gistApi", "http://localhost:4799"));
  await p2.goto("http://localhost:4173/" + link.slice("https://fedecussi.github.io/quaderno/".length));
  p2.on("console", (m) => console.log("p2 console:", m.type(), m.text().slice(0, 200)));
  await p2.waitForTimeout(5000);
  console.log("p2 errors:", errors);
  console.log("gate:", (await p2.textContent(".gate-card").catch(() => "—"))?.slice(0, 200), "| url:", p2.url().slice(0, 60), "| shell:", !!(await p2.$(".shell")), "editor:", !!(await p2.$(".editor")), "gate:", !!(await p2.$(".gate")), "| body:", (await p2.evaluate(() => document.body.innerText.slice(0, 160))).replace(/\n/g, " "));
  await p2.waitForSelector(".shared-bar", { timeout: 20000 });
  await p2.waitForTimeout(800);
  const n = await p2.evaluate(() => document.querySelectorAll(".excalidraw canvas").length);
  console.log("vista condivisa aperta da gist ✓ canvas:", n, "| ERRORS:", errors.length ? errors : "none");
} finally { await browser.close(); mock.kill(); }
