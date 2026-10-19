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
  const db = await new Promise((res) => { const r = indexedDB.open("quaderno"); r.onsuccess = () => res(r.result); });
  const data = await new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get("board:" + id); t.onsuccess = () => res(t.result); });
  return data.elements.filter((e) => !e.isDeleted).map((e) => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), sb: e.startBinding?.elementId ?? null, eb: e.endBinding?.elementId ?? null, anchors: e.customData?.qdAnchors, pts: e.points?.map((p) => [Math.round(e.x + p[0]), Math.round(e.y + p[1])]) }));
}, id);
const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 12 }); await page.mouse.up(); };
await page.mouse.click(640, 500);
// rect A (300,300)-(450,400): vertice alto-destra (450,300). rect B (700,500)-(850,600): metà lato sinistro (700,550)
await page.keyboard.press("r"); await drag(300, 300, 450, 400); await page.keyboard.press("Escape");
await page.keyboard.press("r"); await drag(700, 500, 850, 600); await page.keyboard.press("Escape");
// freccia da vertice A (snap) a metà lato B (snap)
await page.keyboard.press("a"); await drag(456, 294, 694, 556); await page.keyboard.press("Escape");
await page.waitForTimeout(1000);
let r = await read();
const arrow = () => r.find((e) => e.type === "arrow");
console.log("creazione:", JSON.stringify(arrow()));
// sposta A (dal bordo sinistro) di +60,+150
await drag(300, 350, 360, 500); await page.keyboard.press("Escape"); await page.waitForTimeout(900);
r = await read(); let A = r[0], B = r[1];
console.log("A spostato → vertice A:", [A.x + A.w, A.y], "inizio:", arrow().pts[0], "| mid B:", [B.x, B.y + B.h / 2], "fine:", arrow().pts.at(-1));
// sposta B (dal bordo destro) di +100,-200
await drag(850, 550, 950, 350); await page.keyboard.press("Escape"); await page.waitForTimeout(900);
r = await read(); A = r[0]; B = r[1];
console.log("B spostato → vertice A:", [A.x + A.w, A.y], "inizio:", arrow().pts[0], "| mid B:", [B.x, B.y + B.h / 2], "fine:", arrow().pts.at(-1));
const ok1 = A.x + A.w === arrow().pts[0][0] && A.y === arrow().pts[0][1] && B.x === arrow().pts.at(-1)[0] && B.y + B.h / 2 === arrow().pts.at(-1)[1];
console.log("ENTRAMBI FISSI:", ok1, "anchors:", JSON.stringify(arrow().anchors));
await page.screenshot({ path: `${S}/60-both-anchored.png` });
// stacca il punto finale trascinandolo via (seleziona la freccia cliccando a metà, poi trascina l'estremo)
const [ex, ey] = arrow().pts.at(-1); const [sx, sy] = arrow().pts[0];
const mid = [(sx + ex) / 2, (sy + ey) / 2 + 50];  // +50: offset header (scena→schermo)
await page.mouse.click(mid[0], mid[1]);
await page.waitForTimeout(300);
await drag(ex, ey + 50, ex + 120, ey + 50 + 120); await page.keyboard.press("Escape"); await page.waitForTimeout(900);
r = await read();
console.log("dopo distacco → fine:", arrow().pts.at(-1), "anchors:", JSON.stringify(arrow().anchors));
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
