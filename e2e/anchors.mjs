import { chromium } from "@playwright/test";
const S = process.env.SHOTS || ".";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("http://localhost:4173/#/");
await page.click("text=Crea la prima lavagna");
await page.waitForSelector(".excalidraw");
const boardId = location => location; 
const id = (await page.evaluate(() => location.hash)).split("/b/")[1];
const read = () => page.evaluate(async (id) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("quaderno"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const data = await new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get("board:" + id); t.onsuccess = () => res(t.result); t.onerror = rej; });
  return data.elements.filter((e) => !e.isDeleted).map((e) => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, anchors: e.customData?.qdAnchors, bound: e.boundElements?.length, pts: e.points?.map((p) => [Math.round(e.x + p[0]), Math.round(e.y + p[1])]) }));
}, id);
await page.mouse.click(640, 500);
// rettangolo (300,300)-(500,440); vertice alto-destra a (500,300) schermo
await page.keyboard.press("r");
await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(500, 440, { steps: 6 }); await page.mouse.up();
await page.keyboard.press("Escape");
// freccia dal vertice (snap) verso destra
await page.keyboard.press("a");
await page.mouse.move(506, 294); await page.mouse.down(); await page.mouse.move(750, 200, { steps: 10 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
console.log("dopo creazione:", JSON.stringify(await read()));
// sposta il rettangolo trascinandolo dal bordo sinistro di +150,+100
await page.mouse.move(300, 370); await page.mouse.down(); await page.mouse.move(450, 470, { steps: 12 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
const after = await read();
console.log("dopo spostamento:", JSON.stringify(after));
const rect = after.find((e) => e.type === "rectangle"), arrow = after.find((e) => e.type === "arrow");
console.log("VERTICE:", [rect.x + rect.w, rect.y], "INIZIO FRECCIA:", arrow.pts[0], "OK?", rect.x + rect.w === arrow.pts[0][0] && rect.y === arrow.pts[0][1]);
await page.screenshot({ path: `${S}/40-anchored.png`, clip: { x: 250, y: 150, width: 650, height: 450 } });
// ridimensiona dal vertice basso-destra del rettangolo (+60,+40) → il vertice alto-destra si sposta in x
await page.mouse.click(460, 440);  // seleziona (bordo sinistro nuovo: x 450..650, y 400..540)
await page.waitForTimeout(200);
await page.mouse.move(650, 540); await page.mouse.down(); await page.mouse.move(710, 580, { steps: 8 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
const r2 = await read();
const rect2 = r2.find((e) => e.type === "rectangle"), arrow2 = r2.find((e) => e.type === "arrow");
console.log("dopo resize → vertice:", [rect2.x + rect2.w, rect2.y], "inizio freccia:", arrow2.pts[0]);
// puntini e zoom out
await page.click('[aria-label="Foglio"]'); await page.click("text=Puntini");
await page.click('[aria-label="Foglio"]'); await page.click("text=Piccoli");
for (let i = 0; i < 6; i++) await page.click('[aria-label="Rimpicciolisci"], [title*="Rimpicciolisci"], .zoom-out-button').catch(() => page.keyboard.press("Control+-"));
await page.waitForTimeout(400);
await page.screenshot({ path: `${S}/41-dots-zoomed-out.png` });
console.log("zoom:", await page.textContent(".zoom-reset-button, [title*='Reimposta']").catch(() => "?"));
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
