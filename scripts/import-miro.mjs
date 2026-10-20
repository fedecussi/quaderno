#!/usr/bin/env node
/**
 * Importa un board Miro in un file .excalidraw editabile (da trascinare in Quaderno).
 *
 * Uso:
 *   MIRO_TOKEN=... node scripts/import-miro.mjs <id-board-o-url> [--out lavagna.excalidraw] [--font clean|hand] [--no-images]
 *
 * Il token è un "access token" di un'app Miro (developer.miro.com → Your apps → Create new app,
 * permesso boards:read, "Install app and get OAuth token"). L'id del board è nella URL:
 * https://miro.com/app/board/uXjVK1234=/  →  uXjVK1234=
 *
 * Converte: forme (rettangoli, rettangoli arrotondati, cerchi, rombi, altre → rettangolo),
 * sticky note, testi, frecce/connettori (con ancore fisse di Quaderno), frame e immagini.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const API = "https://api.miro.com/v2";

/* ---------- utilità ---------- */
const rnd = () => Math.floor(Math.random() * 2 ** 31);
const id = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const num = (v, d = 0) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

const STICKY = {
  gray: "#e9ecef", light_yellow: "#fff9b1", yellow: "#f5d128", orange: "#ff9d48", light_green: "#d5f692", green: "#c9df56", dark_green: "#93d275",
  cyan: "#67c6c0", light_pink: "#ffcee0", pink: "#ea94bb", violet: "#be88c7", red: "#f16c7f", light_blue: "#a6ccf5", blue: "#6cd8fa", dark_blue: "#9ea9ff", black: "#000000",
};

export function htmlToText(html = "") {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function base(type, x, y, w, h, extra = {}) {
  return {
    id: id(),
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: rnd(),
    version: 1,
    versionNonce: rnd(),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    ...extra,
  };
}

/** Va a capo per parole in base alla larghezza disponibile (stima: 0.6 × dimensione font per carattere). */
export function wrapText(text, maxWidth, fontSize) {
  const perLine = Math.max(4, Math.floor(maxWidth / (fontSize * 0.6)));
  return text
    .split("\n")
    .flatMap((para) => {
      const lines = [];
      let line = "";
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        if (line && (line + " " + word).length > perLine) {
          lines.push(line);
          line = word;
        } else line = line ? line + " " + word : word;
      }
      lines.push(line);
      return lines;
    })
    .join("\n");
}

function textElement(text, x, y, w, h, opts) {
  const fontSize = opts.fontSize;
  const original = text;
  if (w) text = wrapText(text, w, fontSize);
  const lines = text.split("\n").length;
  const lineHeight = 1.25;
  const height = h ?? Math.max(fontSize * lineHeight, lines * fontSize * lineHeight);
  const width = w ?? Math.max(...text.split("\n").map((l) => l.length)) * fontSize * 0.6;
  return base("text", x, y, width, height, {
    text,
    originalText: original,
    fontSize,
    fontFamily: opts.fontFamily,
    textAlign: opts.textAlign ?? "center",
    verticalAlign: opts.verticalAlign ?? "middle",
    containerId: opts.containerId ?? null,
    lineHeight,
    autoResize: !opts.containerId,
    strokeColor: opts.color ?? "#1e1e1e",
    roughness: 0,
  });
}

/** Posizione assoluta (angolo in alto a sinistra) di un item Miro, tenendo conto dei frame. */
function absoluteBox(item, byId) {
  const w = num(item.geometry?.width, 100), h = num(item.geometry?.height, 100);
  let cx = num(item.position?.x), cy = num(item.position?.y);
  const parent = item.parent?.id ? byId.get(item.parent.id) : null;
  if (parent && (item.position?.relativeTo === "parent_top_left" || parent.type === "frame")) {
    const p = absoluteBox(parent, byId);
    cx += p.x;
    cy += p.y;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotation: num(item.geometry?.rotation) };
}

/* ---------- conversione ---------- */
export function convert(items, connectors, opts = {}) {
  const font = opts.font === "clean" ? 6 : 5; // 6 = Nunito, 5 = Excalifont
  const rough = opts.font === "clean" ? 0 : 1;
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map(); // miro id → elemento excalidraw principale
  const elements = [];
  const files = {};
  const push = (el) => (elements.push(el), el);

  // Frame prima, così gli altri elementi possono riferirli
  const frames = items.filter((i) => i.type === "frame");
  for (const f of frames) {
    const b = absoluteBox(f, byId);
    const el = push(base("frame", b.x, b.y, b.w, b.h, { name: htmlToText(f.data?.title) || null, strokeColor: "#bbb", roughness: 0 }));
    out.set(f.id, el);
  }
  const frameFor = (item) => (item.parent?.id && out.get(item.parent.id)?.type === "frame" ? out.get(item.parent.id).id : null);

  for (const it of items) {
    if (it.type === "frame") continue;
    const b = absoluteBox(it, byId);
    const frameId = frameFor(it);
    const angle = (b.rotation * Math.PI) / 180;
    const st = it.style ?? {};
    const fontSize = Math.max(10, num(st.fontSize, 14));
    const textColor = st.color && st.color !== "transparent" ? st.color : "#1e1e1e";

    if (it.type === "shape" || it.type === "sticky_note") {
      const shape = it.type === "sticky_note" ? "sticky" : it.data?.shape ?? "rectangle";
      const type = shape === "circle" ? "ellipse" : shape === "rhombus" ? "diamond" : "rectangle";
      const bg = it.type === "sticky_note" ? (STICKY[st.fillColor] ?? "#fff9b1") : st.fillColor && st.fillColor !== "transparent" ? st.fillColor : "transparent";
      const stroke = it.type === "sticky_note" ? bg : st.borderColor && st.borderColor !== "transparent" ? st.borderColor : "#1e1e1e";
      const el = push(
        base(type, b.x, b.y, b.w, b.h, {
          angle,
          frameId,
          backgroundColor: bg,
          strokeColor: stroke,
          strokeWidth: Math.min(4, Math.max(1, num(st.borderWidth, 2))),
          strokeStyle: st.borderStyle === "dashed" ? "dashed" : st.borderStyle === "dotted" ? "dotted" : "solid",
          opacity: Math.round(num(st.fillOpacity, 1) * 100) || 100,
          roughness: rough,
          roundness: shape === "round_rectangle" || shape === "sticky" ? { type: 3 } : null,
        }),
      );
      out.set(it.id, el);
      const text = htmlToText(it.data?.content);
      if (text) {
        const pad = 10;
        const t = push(textElement(text, b.x + pad, b.y + pad, b.w - pad * 2, b.h - pad * 2, { fontSize, fontFamily: font, containerId: el.id, color: textColor, textAlign: st.textAlign ?? "center", frameId }));
        t.frameId = frameId;
        el.boundElements.push({ type: "text", id: t.id });
      }
    } else if (it.type === "text") {
      const text = htmlToText(it.data?.content);
      if (!text) continue;
      const t = push(textElement(text, b.x, b.y, b.w, undefined, { fontSize, fontFamily: font, color: textColor, textAlign: st.textAlign ?? "left", verticalAlign: "top" }));
      t.angle = angle;
      t.frameId = frameId;
      out.set(it.id, t);
    } else if (it.type === "image" && it._dataUrl) {
      const fileId = id();
      files[fileId] = { id: fileId, mimeType: it._mime || "image/png", dataURL: it._dataUrl, created: Date.now() };
      const el = push(base("image", b.x, b.y, b.w, b.h, { angle, frameId, fileId, status: "saved", scale: [1, 1], roughness: 0 }));
      out.set(it.id, el);
    } else if (it.type === "card" || it.type === "app_card" || it.type === "document" || it.type === "embed") {
      const title = htmlToText(it.data?.title || it.data?.content || it.data?.url || it.type);
      const el = push(base("rectangle", b.x, b.y, b.w, b.h, { angle, frameId, backgroundColor: "#f1f3f5", strokeColor: "#868e96", roughness: rough, roundness: { type: 3 }, link: it.data?.url ?? null }));
      out.set(it.id, el);
      if (title) {
        const t = push(textElement(title, b.x + 10, b.y + 10, b.w - 20, b.h - 20, { fontSize, fontFamily: font, containerId: el.id, frameId }));
        t.frameId = frameId;
        el.boundElements.push({ type: "text", id: t.id });
      }
    }
  }

  // Connettori → frecce con ancore fisse (customData.qdAnchors) sui punti indicati da Miro
  for (const c of connectors) {
    const a = c.startItem?.id ? out.get(c.startItem.id) : null;
    const z = c.endItem?.id ? out.get(c.endItem.id) : null;
    const pct = (p, d) => (p === undefined || p === null ? d : parseFloat(String(p)) / 100);
    const pointOn = (el, pos, fallback) => {
      if (!el) return fallback;
      const fx = pct(pos?.x, 0.5), fy = pct(pos?.y, 0.5);
      return [el.x + el.width * fx, el.y + el.height * fy, fx - 0.5, fy - 0.5];
    };
    const [sx, sy, sfx, sfy] = pointOn(a, c.startItem?.position, [num(c.startItem?.x), num(c.startItem?.y)]);
    const [ex, ey, efx, efy] = pointOn(z, c.endItem?.position, [num(c.endItem?.x), num(c.endItem?.y)]);
    if (![sx, sy, ex, ey].every(Number.isFinite)) continue;
    const st = c.style ?? {};
    const cap = (v) => (v && v !== "none" ? "arrow" : null);
    const anchors = {};
    if (a && sfx !== undefined && !(sfx === 0 && sfy === 0)) anchors.start = { elementId: a.id, fx: sfx, fy: sfy };
    if (z && efx !== undefined && !(efx === 0 && efy === 0)) anchors.end = { elementId: z.id, fx: efx, fy: efy };
    const arrow = push(
      base("arrow", sx, sy, Math.abs(ex - sx), Math.abs(ey - sy), {
        points: [[0, 0], [ex - sx, ey - sy]],
        startArrowhead: cap(st.startStrokeCap),
        endArrowhead: st.endStrokeCap === undefined ? "arrow" : cap(st.endStrokeCap),
        strokeColor: st.strokeColor && st.strokeColor !== "transparent" ? st.strokeColor : "#1e1e1e",
        strokeWidth: Math.min(4, Math.max(1, num(st.strokeWidth, 2))),
        strokeStyle: st.strokeStyle === "dashed" ? "dashed" : st.strokeStyle === "dotted" ? "dotted" : "solid",
        roughness: rough,
        roundness: c.shape === "curved" ? { type: 2 } : null,
        startBinding: a && !anchors.start ? { elementId: a.id, focus: 0, gap: 4 } : null,
        endBinding: z && !anchors.end ? { elementId: z.id, focus: 0, gap: 4 } : null,
        elbowed: false,
        customData: Object.keys(anchors).length ? { qdAnchors: anchors } : undefined,
      }),
    );
    if (arrow.startBinding) a.boundElements.push({ type: "arrow", id: arrow.id });
    if (arrow.endBinding) z.boundElements.push({ type: "arrow", id: arrow.id });
    const caption = htmlToText(c.captions?.[0]?.content);
    if (caption) {
      const t = push(textElement(caption, (sx + ex) / 2 - 40, (sy + ey) / 2 - 10, 80, 24, { fontSize: 12, fontFamily: font, containerId: arrow.id }));
      arrow.boundElements.push({ type: "text", id: t.id });
    }
  }

  return { type: "excalidraw", version: 2, source: "quaderno-import-miro", elements, appState: { viewBackgroundColor: "#ffffff", gridModeEnabled: false }, files };
}

/* ---------- API Miro ---------- */
async function miro(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (res.status === 401) throw new Error("Token Miro non valido (401)");
  if (res.status === 404) throw new Error("Board non trovato: controlla l'id e che l'app sia installata nel team del board");
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return miro(path, token);
  }
  if (!res.ok) throw new Error(`Miro ha risposto ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pageAll(path, token) {
  const all = [];
  let cursor = "";
  do {
    const page = await miro(`${path}${path.includes("?") ? "&" : "?"}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token);
    all.push(...(page.data ?? []));
    cursor = page.cursor ?? "";
  } while (cursor);
  return all;
}

async function downloadImage(item, token) {
  const url = item.data?.imageUrl;
  if (!url) return;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!res.ok) return;
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
  item._mime = mime;
  item._dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
}

function parseBoardId(arg) {
  const m = String(arg).match(/board\/([^/?#]+)/);
  return decodeURIComponent(m ? m[1] : arg);
}

async function main() {
  const args = process.argv.slice(2);
  const boardArg = args.find((a) => !a.startsWith("--"));
  const opt = (name, d) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : d;
  };
  const token = process.env.MIRO_TOKEN;
  if (!boardArg || !token) {
    console.error("Uso: MIRO_TOKEN=... node scripts/import-miro.mjs <id-board-o-url> [--out file.excalidraw] [--font clean|hand] [--no-images]");
    process.exit(1);
  }
  const boardId = parseBoardId(boardArg);
  const board = await miro(`/boards/${encodeURIComponent(boardId)}`, token);
  console.log(`Board: ${board.name}`);
  const items = await pageAll(`/boards/${encodeURIComponent(boardId)}/items`, token);
  const connectors = await pageAll(`/boards/${encodeURIComponent(boardId)}/connectors`, token);
  console.log(`Elementi: ${items.length} · connettori: ${connectors.length}`);
  if (!args.includes("--no-images")) {
    for (const it of items.filter((i) => i.type === "image")) await downloadImage(it, token).catch(() => {});
  }
  const scene = convert(items, connectors, { font: opt("--font", "hand") });
  const out = opt("--out", `${(board.name || "miro").replace(/[^\w\-]+/g, "-").toLowerCase()}.excalidraw`);
  writeFileSync(out, JSON.stringify(scene));
  const skipped = items.filter((i) => !["frame", "shape", "sticky_note", "text", "image", "card", "app_card", "document", "embed"].includes(i.type)).map((i) => i.type);
  console.log(`✓ scritto ${out} (${scene.elements.length} elementi)${skipped.length ? ` · non convertiti: ${[...new Set(skipped)].join(", ")}` : ""}`);
  console.log("Ora trascina il file in Quaderno (oppure Importa dalla barra laterale).");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((e) => (console.error("✗", e.message), process.exit(1)));
