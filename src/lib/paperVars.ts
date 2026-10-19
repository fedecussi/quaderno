import type { Paper } from "./types";
import { PAPER_STEP } from "./types";

/**
 * Aggiorna le variabili CSS del foglio in base a pan e zoom.
 * Quando si rimpicciolisce, il passo viene raddoppiato finché le celle restano leggibili
 * e i puntini si riducono con lo zoom, così il foglio non diventa una trama fitta.
 */
export function applyPaperVars(el: HTMLElement | null, paper: Paper, scrollX: number, scrollY: number, zoom: number) {
  if (!el) return;
  const step = paper.type === "blank" ? 24 : PAPER_STEP[paper.type][paper.size];
  let size = step * zoom;
  while (size < 14) size *= 2;
  const dot = Math.min(2.2, Math.max(0.7, 1.3 * zoom));
  el.style.setProperty("--size", `${size}px`);
  el.style.setProperty("--dot", `${dot}px`);
  el.style.setProperty("--px", `${scrollX * zoom}px`);
  el.style.setProperty("--py", `${scrollY * zoom}px`);
  // Trama più tenue quando il foglio è molto rimpicciolito, moltiplicata per l'intensità scelta
  const fade = Math.min(1, Math.max(0.45, zoom));
  el.style.setProperty("--alpha", String(fade * (paper.opacity ?? 1)));
}
