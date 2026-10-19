import { chromium } from "@playwright/test";
const S = "/tmp/claude-0/-home-user-jobflow/005ba761-b7b5-5170-b5f3-9fe30f9c7fdd/scratchpad/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:4173/#/");
await page.waitForSelector(".empty-hero");
await page.screenshot({ path: `${S}/01-empty.png` });

// nuova lavagna
await page.click("text=Crea la prima lavagna");
await page.waitForSelector(".excalidraw");
await page.waitForTimeout(800);
await page.screenshot({ path: `${S}/02-editor-welcome.png` });

// titolo
await page.fill(".title-input", "Appunti di prova");
await page.keyboard.press("Enter");
await page.mouse.click(640, 500);
// disegna un rettangolo e un testo
await page.keyboard.press("r");
await page.mouse.move(400, 300); await page.mouse.down(); await page.mouse.move(700, 480, { steps: 8 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.keyboard.press("t");
await page.mouse.click(450, 560);
await page.keyboard.type("Ciao Quaderno!");
await page.keyboard.press("Escape");
await page.keyboard.press("a");
await page.mouse.move(720, 400); await page.mouse.down(); await page.mouse.move(900, 300, { steps: 8 }); await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(3600);
await page.screenshot({ path: `${S}/03-editor-drawn.png` });
const saveText = await page.textContent(".save-indicator");
console.log("save indicator:", saveText);

// condividi
await page.click("text=Condividi");
await page.waitForSelector(".modal");
await page.screenshot({ path: `${S}/04-share.png` });
await page.click("text=Crea link");
await page.waitForSelector(".share-link input");
await page.waitForTimeout(400);
const link = await page.inputValue(".share-link input");
console.log("share link length:", link.length);
await page.screenshot({ path: `${S}/05-share-link.png` });
await page.keyboard.press("Escape");

// torna alla dashboard
await page.click('[aria-label="Torna alle lavagne"]');
await page.waitForSelector(".card");
await page.waitForTimeout(500);
await page.screenshot({ path: `${S}/06-dashboard.png` });
const thumb = await page.$eval(".card-thumb img", (i) => i.src.length).catch(() => 0);
console.log("thumb data length:", thumb);

// apri link condiviso in un nuovo contesto (altro "utente")
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => errors.push("p2 pageerror: " + e.message));
await p2.goto(link);
await p2.waitForSelector(".shared-bar");
await p2.waitForTimeout(1000);
await p2.screenshot({ path: `${S}/07-shared-view.png` });
await p2.click("text=Salva nel mio Quaderno");
await p2.waitForSelector(".title-input");
console.log("copied title:", await p2.inputValue(".title-input"));

// link con password
await page.click(".card");
await page.waitForSelector(".excalidraw");
await page.click("text=Condividi");
await page.click("text=Proteggi con password");
await page.fill('input[placeholder*="password"]', "segreto1");
await page.click("text=Crea link");
await page.waitForSelector(".share-link input");
const plink = await page.inputValue(".share-link input");
await page.keyboard.press("Escape");
await p2.goto(plink);
await p2.waitForSelector(".gate-card");
await p2.screenshot({ path: `${S}/08-gate.png` });
await p2.fill('input[type=password]', "sbagliata");
await p2.click("text=Apri lavagna");
await p2.waitForSelector(".error-text");
console.log("wrong pw error:", await p2.textContent(".error-text"));
await p2.fill('input[type=password]', "segreto1");
await p2.click("text=Apri lavagna");
await p2.waitForSelector(".shared-bar");
console.log("password link opened OK");

// dark mode dashboard + list view
await page.click('[aria-label="Torna alle lavagne"]');
await page.waitForSelector(".card");
await page.click('[aria-label="Tema"]');
await page.click("text=Scuro");
await page.waitForTimeout(400);
await page.screenshot({ path: `${S}/09-dark.png` });
await page.click('[aria-label="Elenco"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${S}/10-list-dark.png` });
await page.click(".card");
await page.waitForSelector(".excalidraw");
await page.waitForTimeout(800);
await page.screenshot({ path: `${S}/11-editor-dark.png` });

// mobile
await page.setViewportSize({ width: 390, height: 760 });
await page.goto("http://localhost:4173/#/");
await page.waitForTimeout(500);
await page.screenshot({ path: `${S}/12-mobile.png` });

console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
