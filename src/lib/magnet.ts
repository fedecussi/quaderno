/**
 * Magnete per linee e frecce: mentre disegni (o sposti un punto) il puntatore scatta
 * sui vertici, sulle metà dei lati e sul centro delle figure vicine.
 *
 * Excalidraw calcola i punti dalle coordinate del puntatore: intercettiamo gli eventi
 * in fase di cattura e sovrascriviamo clientX/clientY prima che li legga. Così il punto
 * finisce esattamente sul vertice e il collegamento (binding) viene calcolato da
 * Excalidraw come se avessi mirato lì tu. Ctrl/Cmd disattiva il magnete al volo.
 */
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { reportSnap } from "./anchors";

const THRESHOLD_PX = 12;
const SKIP = new Set(["arrow", "line", "freedraw", "selection"]);
type P = [number, number];
interface Ref {
  p: P;
  id: string;
  fx: number;
  fy: number;
}

export function attachMagnet(api: ExcalidrawImperativeAPI, host: HTMLElement): () => void {
  const dot = document.createElement("div");
  dot.className = "magnet-dot";
  host.appendChild(dot);

  let cacheEls: readonly ExcalidrawElement[] | null = null;
  let cacheSel = "";
  let cachePts: Ref[] = [];

  function refPoints(st: AppState): Ref[] {
    const els = api.getSceneElements();
    const selKey = Object.keys(st.selectedElementIds).join(",");
    if (els === cacheEls && selKey === cacheSel) return cachePts;
    const pts: Ref[] = [];
    for (const e of els) {
      if (e.isDeleted || SKIP.has(e.type) || st.selectedElementIds[e.id]) continue;
      const w = e.width, h = e.height;
      const cx = e.x + w / 2, cy = e.y + h / 2;
      // Posizioni relative (frazioni di larghezza/altezza): vertici, metà lato, centro
      let local: P[];
      if (e.type === "ellipse") local = [[0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0], [0, 0]];
      else if (e.type === "diamond") local = [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [-0.25, -0.25], [0, 0]];
      else local = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0], [0, 0]];
      const cos = Math.cos(e.angle), sin = Math.sin(e.angle);
      for (const [fx, fy] of local) {
        const lx = fx * w, ly = fy * h;
        pts.push({ p: [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos], id: e.id, fx, fy });
      }
    }
    cacheEls = els;
    cacheSel = selKey;
    cachePts = pts;
    return pts;
  }

  function isActive(st: AppState): boolean {
    if (!st.objectsSnapModeEnabled) return false;
    const t = st.activeTool.type;
    if (t === "arrow" || t === "line") return true;
    if (st.editingLinearElement) return true;
    const sle = st.selectedLinearElement;
    return !!sle && (sle.isDragging || sle.pointerDownState.lastClickedPoint >= 0);
  }

  const hide = () => {
    dot.style.display = "none";
  };

  function onPointer(ev: PointerEvent) {
    const st = api.getAppState();
    if (!isActive(st) || ev.ctrlKey || ev.metaKey) return hide();
    const onCanvas = (ev.target as Element | null)?.closest?.(".excalidraw__canvas") != null;
    const dragging = (ev.buttons & 1) === 1;
    if (ev.type === "pointermove" ? !(onCanvas || dragging) : !onCanvas) return hide();

    const z = st.zoom.value;
    const sx = (ev.clientX - st.offsetLeft) / z - st.scrollX;
    const sy = (ev.clientY - st.offsetTop) / z - st.scrollY;
    let best: Ref | null = null;
    let bestD = THRESHOLD_PX / z;
    for (const r of refPoints(st)) {
      const d = Math.hypot(r.p[0] - sx, r.p[1] - sy);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (!best) return hide();

    // Un click o un rilascio su un punto agganciato: lo dichiariamo alle ancore
    if (ev.type !== "pointermove") reportSnap({ elementId: best.id, fx: best.fx, fy: best.fy, x: best.p[0], y: best.p[1] });

    const cx = (best.p[0] + st.scrollX) * z + st.offsetLeft;
    const cy = (best.p[1] + st.scrollY) * z + st.offsetTop;
    Object.defineProperty(ev, "clientX", { value: cx, configurable: true });
    Object.defineProperty(ev, "clientY", { value: cy, configurable: true });
    const r = host.getBoundingClientRect();
    dot.style.display = "block";
    dot.style.transform = `translate(${cx - r.left}px, ${cy - r.top}px)`;
  }

  const opts = { capture: true } as const;
  window.addEventListener("pointerdown", onPointer, opts);
  window.addEventListener("pointermove", onPointer, opts);
  window.addEventListener("pointerup", onPointer, opts);
  return () => {
    window.removeEventListener("pointerdown", onPointer, opts);
    window.removeEventListener("pointermove", onPointer, opts);
    window.removeEventListener("pointerup", onPointer, opts);
    dot.remove();
  };
}
