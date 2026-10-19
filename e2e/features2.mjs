import { chromium } from "@playwright/test";
const S = process.env.SHOTS || ".";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("http://localhost:4173/#/");
await page.click("text=Crea la prima lavagna");
await page.waitForSelector(".excalidraw");
const boardId = (await page.evaluate(() => location.hash)).split("/b/")[1];
await page.mouse.click(640, 500);
// rettangolo 300,300 → 500,440 (vertice alto-destra a 500,300; metà lato destro a 500,370)
await page.keyboard.press("r");
await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(500, 440, { steps: 6 }); await page.mouse.up();
await page.keyboard.press("Escape");
// freccia che parte a 8px dal vertice alto-destra e finisce vicino a nulla
await page.keyboard.press("a");
await page.mouse.move(506, 294);
await page.waitForTimeout(100);
await page.screenshot({ path: `${S}/30-magnet-hover.png`, clip: { x: 250, y: 250, width: 500, height: 250 } });
await page.mouse.down(); await page.mouse.move(700, 200, { steps: 10 }); await page.mouse.up();
await page.keyboard.press("Escape");
// seconda freccia: da fuori verso la metà del lato destro (505, 376 → snap a 500,370)
await page.keyboard.press("a");
await page.mouse.move(760, 520); await page.mouse.down(); await page.mouse.move(506, 376, { steps: 12 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
// leggi gli elementi salvati da IndexedDB
const els = await page.evaluate(async (id) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("quaderno"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const data = await new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get("board:" + id); t.onsuccess = () => res(t.result); t.onerror = rej; });
  return data.elements.filter((e) => !e.isDeleted).map((e) => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), start: e.startBinding?.elementId ? "bound" : null, end: e.endBinding?.elementId ? "bound" : null, pts: e.points?.map((p) => [Math.round(e.x + p[0]), Math.round(e.y + p[1])]) }));
}, boardId);
console.log(JSON.stringify(els));
// preferiti nel pannello (strumento rettangolo attivo → pannello visibile)
await page.keyboard.press("r");
await page.waitForSelector(".qd-fav-row");
await page.click(".App-menu__left [data-testid='color-top-pick-#e03131']");
await page.click(".qd-fav .qd-fav-save >> nth=0");
await page.click(".App-menu__left [data-testid='color-top-pick-#b2f2bb']");
await page.click(".qd-fav .qd-fav-save >> nth=1");
await page.waitForTimeout(300);
await page.screenshot({ path: `${S}/31-fav-panel.png`, clip: { x: 0, y: 110, width: 260, height: 420 } });
console.log("fav stroke:", await page.$$eval(".qd-fav >> nth=0 >> .qd-swatch-wrap .qd-swatch", (b) => b.map((x) => x.title)), "fav bg:", await page.$$eval(".qd-fav >> nth=1 >> .qd-swatch-wrap .qd-swatch", (b) => b.map((x) => x.title)));
// seleziona il rettangolo e applica il preferito di sfondo
await page.keyboard.press("Escape");
await page.mouse.click(300, 370);
await page.waitForSelector(".qd-fav-row");
await page.click(".qd-fav >> nth=1 >> .qd-swatch-wrap .qd-swatch >> nth=0");
await page.waitForTimeout(200);
// PDF
await page.click('[aria-label="Altre opzioni"]');
await page.click("text=Esporta in PDF…");
await page.waitForSelector(".pdf-scales");
await page.click(".pdf-scale >> nth=2");
await page.screenshot({ path: `${S}/32-pdf-dialog.png` });
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('Scarica PDF')")]);
const path = await dl.path();
console.log("pdf:", dl.suggestedFilename(), (await import("node:fs")).statSync(path).size, "bytes");
(await import("node:fs")).copyFileSync(path, `${S}/export.pdf`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${S}/33-after.png` });
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
