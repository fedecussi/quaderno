import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type ColorKind = "stroke" | "background";

const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);

/** Normalizza un colore: "#abc" → "#aabbcc", "" → "transparent", altrimenti null se non valido. */
export function normalizeColor(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (t === "transparent" || t === "") return "transparent";
  const h = t.startsWith("#") ? t : `#${t}`;
  if (!isHex(h)) return null;
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

/** Applica il colore agli elementi selezionati (e allo strumento corrente per i prossimi). */
export function applyColor(api: ExcalidrawImperativeAPI, kind: ColorKind, color: string) {
  const app = api.getAppState();
  const sel = app.selectedElementIds;
  const key = kind === "stroke" ? "strokeColor" : "backgroundColor";
  const elements = api.getSceneElements();
  const containerOf = (e: unknown) => (e as { containerId?: string | null }).containerId ?? null;
  const picked = (e: (typeof elements)[number]) => !!sel[e.id] || (kind === "stroke" && !!containerOf(e) && !!sel[containerOf(e)!]);
  const touched = elements.some(picked);
  api.updateScene({
    elements: touched ? elements.map((e) => (picked(e) ? newElementWith(e, { [key]: color }) : e)) : undefined,
    appState: {
      currentItemStrokeColor: kind === "stroke" ? color : app.currentItemStrokeColor,
      currentItemBackgroundColor: kind === "background" ? color : app.currentItemBackgroundColor,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
