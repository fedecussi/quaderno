import { jsPDF } from "jspdf";
import { exportToCanvas, getCommonBounds } from "@excalidraw/excalidraw";
import type { BoardData } from "./types";
import { PAPER_STEP } from "./types";
import { boardTitle, slugify } from "./format";

export type PdfPage = "fit" | "a4" | "a3";
export type PdfOrientation = "auto" | "portrait" | "landscape";
export interface PdfOptions {
  scale: 1 | 2 | 3 | 4;
  page: PdfPage;
  orientation: PdfOrientation;
  background: boolean;
  paper: boolean;
  dark: boolean;
  onlySelected: boolean;
}
export const DEFAULT_PDF: PdfOptions = { scale: 2, page: "fit", orientation: "auto", background: true, paper: true, dark: false, onlySelected: false };

const PADDING = 32;
const MAX_SIDE = 8192;
const PT_PER_PX = 0.75;
const PAGE_PT: Record<Exclude<PdfPage, "fit">, [number, number]> = { a4: [595.28, 841.89], a3: [841.89, 1190.55] };

export function selectElements(data: BoardData, opts: PdfOptions, selectedIds: Record<string, boolean>) {
  let els = data.elements.filter((e) => !e.isDeleted);
  if (opts.onlySelected) els = els.filter((e) => selectedIds[e.id] || ((e as { containerId?: string | null }).containerId && selectedIds[(e as { containerId: string }).containerId]));
  return els;
}

/** Dimensioni in pixel che avrà il rendering (per l'anteprima nel dialogo). */
export function estimatePixels(data: BoardData, opts: PdfOptions, selectedIds: Record<string, boolean>) {
  const els = selectElements(data, opts, selectedIds);
  if (!els.length) return { width: 0, height: 0, scale: opts.scale };
  const [minX, minY, maxX, maxY] = getCommonBounds(els);
  const w = maxX - minX + PADDING * 2;
  const h = maxY - minY + PADDING * 2;
  const scale = Math.min(opts.scale, MAX_SIDE / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale: Math.round(scale * 100) / 100 };
}

export async function exportPdf(data: BoardData, title: string, opts: PdfOptions, selectedIds: Record<string, boolean> = {}) {
  const elements = selectElements(data, opts, selectedIds);
  if (!elements.length) throw new Error("Niente da esportare");
  const bg = data.appState.viewBackgroundColor ?? "#ffffff";
  const [minX, minY] = getCommonBounds(elements);
  let scale: number = opts.scale;

  const scene = await exportToCanvas({
    elements,
    files: data.files ?? {},
    appState: { viewBackgroundColor: bg, exportBackground: opts.background, exportWithDarkMode: opts.dark },
    exportPadding: PADDING,
    getDimensions: (w: number, h: number) => {
      scale = Math.min(opts.scale, MAX_SIDE / Math.max(w, h));
      return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
    },
  });

  // Foglio (righe/quadretti/puntini) allineato alla scena, come nell'editor
  let canvas = scene;
  const paper = data.appState.paper;
  if (opts.paper && opts.background && paper && paper.type !== "blank") {
    const out = document.createElement("canvas");
    out.width = scene.width;
    out.height = scene.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = opts.dark ? "#000" : "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    const step = PAPER_STEP[paper.type][paper.size] * scale;
    const ox = ((((PADDING - minX) * scale) % step) + step) % step;
    const oy = ((((PADDING - minY) * scale) % step) + step) % step;
    ctx.strokeStyle = ctx.fillStyle = opts.dark ? (paper.type === "dots" ? "#45464f" : "#34353d") : paper.type === "dots" ? "#aeb4c0" : "#c4c9d4";
    ctx.lineWidth = Math.max(1, scale * 0.9);
    if (paper.type === "dots") {
      const r = 1.3 * scale;
      for (let x = ox; x < out.width; x += step)
        for (let y = oy; y < out.height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
    } else {
      ctx.beginPath();
      for (let y = oy; y < out.height; y += step) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(out.width, y + 0.5);
      }
      if (paper.type === "squares")
        for (let x = ox; x < out.width; x += step) {
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, out.height);
        }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = opts.dark ? "screen" : "multiply";
    ctx.drawImage(scene, 0, 0);
    canvas = out;
  }

  const imgW = canvas.width * PT_PER_PX / scale;
  const imgH = canvas.height * PT_PER_PX / scale;
  let pageW = imgW, pageH = imgH, x = 0, y = 0, drawW = imgW, drawH = imgH;
  if (opts.page !== "fit") {
    const [pw, ph] = PAGE_PT[opts.page];
    const landscape = opts.orientation === "landscape" || (opts.orientation === "auto" && imgW > imgH);
    pageW = landscape ? ph : pw;
    pageH = landscape ? pw : ph;
    const margin = 28;
    const k = Math.min((pageW - margin * 2) / imgW, (pageH - margin * 2) / imgH);
    drawW = imgW * k;
    drawH = imgH * k;
    x = (pageW - drawW) / 2;
    y = (pageH - drawH) / 2;
  }

  const doc = new jsPDF({ unit: "pt", format: [pageW, pageH], orientation: pageW >= pageH ? "landscape" : "portrait", compress: true });
  doc.setProperties({ title: boardTitle(title), creator: "Quaderno" });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, drawW, drawH, undefined, "FAST");
  doc.save(`${slugify(boardTitle(title))}.pdf`);
}
