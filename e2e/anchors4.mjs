import { chromium } from "@playwright/test";
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
  const db = await new Promise((res) => { const r = indexedDB.open("quaderno"); r.onsuccess = () => res(r.result); });
  const data = await new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get("board:" + id); t.onsuccess = () => res(t.result); });
  return data.elements.filter((e) => !e.isDeleted).map((e) => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, anchors: e.customData?.qdAnchors, pts: e.points?.map((p) => [Math.round(e.x + p[0]), Math.round(e.y + p[1])]) }));
}, id);
const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 14 }); await page.mouse.up(); };
await page.mouse.click(640, 500);
// scenario utente: rettangolo in alto a sinistra, ellisse in basso a destra
await page.keyboard.press("r"); await drag(300, 150, 580, 280); await page.keyboard.press("Escape");   // bottom-mid (440,280)
await page.keyboard.press("o"); await drag(760, 560, 1060, 700); await page.keyboard.press("Escape"); // top (910,560)
// freccia 1: dal centro-basso del rettangolo (snap bottom-mid) alla cima dell'ellisse (snap top), trascinando
await page.keyboard.press("a"); await drag(446, 286, 904, 554); await page.keyboard.press("Escape");
// freccia 2: dall'interno del rettangolo (nessun snap) alla metà sinistra dell'ellisse (snap), click-click + Escape
await page.keyboard.press("a"); await page.mouse.click(350, 200); await page.mouse.click(766, 634); await page.keyboard.press("Escape");
await page.waitForTimeout(1000);
let r = await read();
console.log("creazione:", JSON.stringify(r.filter((e) => e.type === "arrow").map((a) => ({ sb: a.sb, eb: a.eb, anchors: a.anchors, pts: a.pts }))));
// sposta l'ellisse molto lontano, in alto a sinistra (trascinata dal bordo destro)
await drag(1060, 630, 700, 400); await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
r = await read();
const ell = r.find((e) => e.type === "ellipse"); const [a1, a2] = r.filter((e) => e.type === "arrow");
console.log("ellisse top:", [ell.x + ell.w / 2, ell.y], "fine freccia1:", a1.pts.at(-1), "| mid-sx:", [ell.x, ell.y + ell.h / 2], "fine freccia2:", a2.pts.at(-1));
console.log("OK?", ell.x + ell.w / 2 === a1.pts.at(-1)[0] && ell.y === a1.pts.at(-1)[1] && ell.x === a2.pts.at(-1)[0] && ell.y + ell.h / 2 === a2.pts.at(-1)[1]);
// e il rettangolo: spostalo e controlla l'inizio della freccia 1 (bottom-mid)
await drag(300, 215, 200, 100); await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
r = await read(); const rect = r.find((e) => e.type === "rectangle"); const b1 = r.filter((e) => e.type === "arrow")[0];
console.log("rect bottom-mid:", [rect.x + rect.w / 2, rect.y + rect.h], "inizio freccia1:", b1.pts[0], "OK?", rect.x + rect.w / 2 === b1.pts[0][0] && rect.y + rect.h === b1.pts[0][1]);
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
