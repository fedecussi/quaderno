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
const id = (await page.evaluate(() => location.hash)).split("/b/")[1];
const read = () => page.evaluate(async (id) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("quaderno"); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const data = await new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get("board:" + id); t.onsuccess = () => res(t.result); t.onerror = rej; });
  return data.elements.filter((e) => !e.isDeleted).map((e) => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, anchors: e.customData?.qdAnchors, bound: e.boundElements?.length ?? 0, pts: e.points?.map((p) => [Math.round(e.x + p[0]), Math.round(e.y + p[1])]) }));
}, id);
await page.mouse.click(640, 500);
// ellisse (300,300)-(500,440): metà lato sinistro a (300,370) schermo
await page.keyboard.press("o");
await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(500, 440, { steps: 6 }); await page.mouse.up();
await page.keyboard.press("Escape");
// freccia da sinistra che FINISCE sulla metà del lato sinistro (snap)
await page.keyboard.press("a");
await page.mouse.move(250, 150); await page.mouse.down(); await page.mouse.move(294, 376, { steps: 12 }); await page.mouse.up();
await page.keyboard.press("Escape");
// freccia click-click (multi punto) che finisce sul punto alto dell'ellisse (400,300)
await page.keyboard.press("a");
await page.mouse.click(400, 150);
await page.mouse.click(406, 294);
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
console.log("creazione:", JSON.stringify(await read()));
// sposta l'ellisse di +200,+120 trascinandola dal bordo destro
await page.mouse.move(500, 370); await page.mouse.down(); await page.mouse.move(700, 490, { steps: 14 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
const r = await read();
const el = r.find((e) => e.type === "ellipse");
const arrows = r.filter((e) => e.type === "arrow");
console.log("dopo spostamento:", JSON.stringify(r));
console.log("mid-sinistra:", [el.x, el.y + el.h / 2], "fine freccia1:", arrows[0].pts.at(-1), "| top:", [el.x + el.w / 2, el.y], "fine freccia2:", arrows[1].pts.at(-1));
await page.screenshot({ path: `${S}/50-end-anchors.png`, clip: { x: 50, y: 100, width: 800, height: 500 } });
// popover foglio + intensità
await page.click('[aria-label="Foglio"]');
await page.click(".paper-pop button:has-text('Quadretti')");
await page.fill("#paper-opacity", "40");
await page.waitForTimeout(300);
await page.screenshot({ path: `${S}/51-paper-opacity.png` });
console.log("opacity salvata:", JSON.stringify((await page.evaluate(async (id) => {
  const db = await new Promise((res) => { const r = indexedDB.open("quaderno"); r.onsuccess = () => res(r.result); });
  return new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get("board:" + id); t.onsuccess = () => res(t.result.appState.paper); });
}, id))));
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
