// Quaderno — app desktop (Electron). Carica la build web da un protocollo locale "app://".
const { app, BrowserWindow, Menu, protocol, shell, net, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const DIST = path.join(__dirname, "..", "dist-desktop");
const PUBLIC_URL = "https://fedecussi.github.io/quaderno/";
const isMac = process.platform === "darwin";

// Protocollo privilegiato: moduli ES, fetch, IndexedDB e service worker funzionano come su https.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

/* ---------- Stato finestra (dimensione/posizione) ---------- */
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}
function saveState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* ignore */
  }
}

/* ---------- Finestra ---------- */
let mainWindow = null;

function createWindow(route = "#/") {
  const st = readState();
  const win = new BrowserWindow({
    width: st.width || 1280,
    height: st.height || 820,
    x: st.x,
    y: st.y,
    minWidth: 720,
    minHeight: 480,
    title: "Quaderno",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: "#faf8f3",
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  if (st.maximized) win.maximize();
  const showNow = () => !win.isDestroyed() && !win.isVisible() && win.show();
  win.once("ready-to-show", showNow);
  setTimeout(showNow, 300);
  win.loadURL(`app://quaderno/index.html${route}`);

  // Link esterni (anteprima link condivisi, link negli elementi) → browser di sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  let t;
  const onBounds = () => {
    clearTimeout(t);
    t = setTimeout(() => saveState(win), 300);
  };
  win.on("resize", onBounds);
  win.on("move", onBounds);
  win.on("close", () => saveState(win));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  mainWindow = win;
  return win;
}

/* ---------- Menu (serve soprattutto per copia/incolla e zoom su macOS) ---------- */
function buildMenu() {
  const template = [
    ...(isMac ? [{ role: "appMenu", submenu: [{ role: "about", label: "Informazioni su Quaderno" }, { type: "separator" }, { role: "hide", label: "Nascondi Quaderno" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit", label: "Esci da Quaderno" }] }] : []),
    {
      label: "File",
      submenu: [
        { label: "Nuova lavagna", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.loadURL("app://quaderno/index.html#/new") },
        { label: "Tutte le lavagne", accelerator: "CmdOrCtrl+Shift+H", click: () => mainWindow?.loadURL("app://quaderno/index.html#/") },
        { type: "separator" },
        { label: "Apri Quaderno sul web", click: () => shell.openExternal(PUBLIC_URL) },
        { type: "separator" },
        isMac ? { role: "close", label: "Chiudi finestra" } : { role: "quit", label: "Esci" },
      ],
    },
    { role: "editMenu", label: "Modifica" },
    {
      label: "Vista",
      submenu: [{ role: "reload", label: "Ricarica" }, { type: "separator" }, { role: "resetZoom", label: "Dimensione reale" }, { role: "zoomIn", label: "Ingrandisci interfaccia" }, { role: "zoomOut", label: "Riduci interfaccia" }, { type: "separator" }, { role: "togglefullscreen", label: "Schermo intero" }],
    },
    { role: "windowMenu", label: "Finestra" },
    { role: "help", label: "Aiuto", submenu: [{ label: "Codice sorgente e guida", click: () => shell.openExternal("https://github.com/fedecussi/quaderno") }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- Avvio ---------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".wasm": "application/wasm" };

app.whenReady().then(() => {
  // Serve i file della build dal protocollo app://quaderno/...
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response("Not found", { status: 404 });
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    return net.fetch(pathToFileURL(file).href).then((r) => new Response(r.body, { headers: { "content-type": type } }));
  });

  // Download (PDF, .excalidraw, PNG): finestra di salvataggio di sistema
  session.defaultSession.on("will-download", (_e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
  });

  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
