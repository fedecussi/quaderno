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

const THRESHOLD_PX = 12;
const SKIP = new Set(["arrow", "line", "freedraw", "selection"]);
type P = [number, number];

export function attachMagnet(api: ExcalidrawImperativeAPI, host: HTMLElement): () => void {
  const dot = document.createElement("div");
  dot.className = "magnet-dot";
  host.appendChild(dot);

  let cacheEls: readonly ExcalidrawElement[] | null = null;
  let cacheSel = "";
  let cachePts: P[] = [];

  function refPoints(st: AppState): P[] {
    const els = api.getSceneElements();
    const selKey = Object.keys(st.selectedElementIds).join(",");
    if (els === cacheEls && selKey === cacheSel) return cachePts;
    const pts: P[] = [];
    for (const e of els) {
      if (e.isDeleted || SKIP.has(e.type) || st.selectedElementIds[e.id]) continue;
      const w = e.width, h = e.height;
      const cx = e.x + w / 2, cy = e.y + h / 2;
      let local: P[];
      if (e.type === "ellipse") local = [[0, -h / 2], [0, h / 2], [-w / 2, 0], [w / 2, 0], [0, 0]];
      else if (e.type === "diamond") local = [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0], [w / 4, -h / 4], [w / 4, h / 4], [-w / 4, h / 4], [-w / 4, -h / 4], [0, 0]];
      else local = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0], [0, 0]];
      const cos = Math.cos(e.angle), sin = Math.sin(e.angle);
      for (const [lx, ly] of local) pts.push([cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]);
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
    let best: P | null = null;
    let bestD = THRESHOLD_PX / z;
    for (const p of refPoints(st)) {
      const d = Math.hypot(p[0] - sx, p[1] - sy);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return hide();

    const cx = (best[0] + st.scrollX) * z + st.offsetLeft;
    const cy = (best[1] + st.scrollY) * z + st.offsetTop;
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
