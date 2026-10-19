/**
 * Ancore fisse per linee e frecce.
 *
 * Il collegamento nativo di Excalidraw ("binding") fa scivolare il punto lungo il bordo
 * della figura quando questa si sposta. Quando il magnete aggancia un punto a un vertice
 * o a una metà lato, convertiamo il binding in un'ancora fissa salvata in customData
 * (posizione relativa alla figura: fx, fy ∈ [-0.5, 0.5]). Ad ogni modifica, se la figura
 * si muove, si ridimensiona o ruota, riportiamo il punto esattamente sull'ancora.
 */
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type P = [number, number];
type End = "start" | "end";
interface Anchor {
  elementId: string;
  fx: number;
  fy: number;
}
interface Anchors {
  start?: Anchor;
  end?: Anchor;
}
type LinearLike = ExcalidrawElement & {
  points: readonly P[];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  elbowed?: boolean;
};
type Shape = ExcalidrawElement & { boundElements?: readonly { id: string; type: string }[] | null };

const SNAP_EPS = 1.2;
const EPS = 0.05;
const SHAPES = new Set(["rectangle", "ellipse", "diamond", "image", "text", "frame", "magicframe", "embeddable", "iframe"]);

const isLinear = (e: ExcalidrawElement): e is LinearLike => (e.type === "arrow" || e.type === "line") && Array.isArray((e as LinearLike).points);
const getAnchors = (e: ExcalidrawElement): Anchors | undefined => (e.customData as { qdAnchors?: Anchors } | undefined)?.qdAnchors;

/** Punti di riferimento (vertici, metà lato) in coordinate relative: escluso il centro. */
function localRefs(e: ExcalidrawElement): P[] {
  if (e.type === "ellipse") return [[0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]];
  if (e.type === "diamond") return [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [-0.25, -0.25]];
  return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]];
}

function toScene(e: ExcalidrawElement, fx: number, fy: number): P {
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
  const lx = fx * e.width, ly = fy * e.height;
  const cos = Math.cos(e.angle), sin = Math.sin(e.angle);
  return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
}

function endpoint(a: LinearLike, end: End): P {
  const p = end === "start" ? a.points[0] : a.points[a.points.length - 1];
  return [a.x + p[0], a.y + p[1]];
}

function withEndpoint(a: LinearLike, end: End, target: P): Record<string, unknown> {
  let x = a.x, y = a.y;
  let points = a.points.map((p) => [p[0], p[1]] as P);
  if (end === "start") {
    const dx = target[0] - a.x, dy = target[1] - a.y;
    x = target[0];
    y = target[1];
    points = points.map((p, i) => (i === 0 ? [0, 0] : [p[0] - dx, p[1] - dy]));
  } else {
    points[points.length - 1] = [target[0] - x, target[1] - y];
  }
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { x, y, points, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

const DETACH_PX = 4;

export interface AnchorPrefs {
  start: boolean;
  end: boolean;
}

/** Da chiamare ad ogni onChange. Ritorna true se ha aggiornato la scena. */
export function syncAnchors(api: ExcalidrawImperativeAPI, prefs: AnchorPrefs = { start: true, end: true }): boolean {
  const elements = api.getSceneElements();
  const st = api.getAppState();
  const selected = st.selectedElementIds;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const patches = new Map<string, Record<string, unknown>>();
  const patch = (id: string, p: Record<string, unknown>) => patches.set(id, { ...(patches.get(id) ?? {}), ...p });
  const shapeUnbind = (shapeId: string, arrowId: string) => {
    const s = byId.get(shapeId) as Shape | undefined;
    if (!s?.boundElements?.some((b) => b.id === arrowId)) return;
    const current = (patches.get(shapeId) as Shape | undefined)?.boundElements ?? s.boundElements;
    patch(shapeId, { boundElements: current.filter((b) => b.id !== arrowId) });
  };

  for (const el of elements) {
    if (el.isDeleted || !isLinear(el) || el.elbowed) continue;
    const a = el;
    const anchors: Anchors = { ...(getAnchors(a) ?? {}) };
    let anchorsChanged = false;
    let geom: Record<string, unknown> = {};

    for (const end of ["start", "end"] as End[]) {
      const pt = endpoint(a, end);
      const binding = end === "start" ? a.startBinding : a.endBinding;
      const bindingKey = end === "start" ? "startBinding" : "endBinding";

      // Estremo con ancore disattivate dalle impostazioni: comportamento nativo
      if (!prefs[end]) {
        if (anchors[end]) {
          delete anchors[end];
          anchorsChanged = true;
        }
        continue;
      }

      // 0) Se l'ancora esiste già ma Excalidraw ha ricreato il binding (succede alla
      //    chiusura della freccia), lo togliamo di nuovo: altrimenti i due si contendono il punto
      if (binding?.elementId && anchors[end]) {
        geom = { ...geom, [bindingKey]: null };
        shapeUnbind(binding.elementId, a.id);
      }

      // 1) Binding nativo con il punto su un vertice/metà lato → diventa ancora fissa
      if (binding?.elementId && !anchors[end]) {
        const shape = byId.get(binding.elementId);
        if (shape && !shape.isDeleted && SHAPES.has(shape.type)) {
          const hit = localRefs(shape).find(([fx, fy]) => {
            const [sx, sy] = toScene(shape, fx, fy);
            return Math.hypot(sx - pt[0], sy - pt[1]) <= SNAP_EPS;
          });
          if (hit) {
            anchors[end] = { elementId: shape.id, fx: hit[0], fy: hit[1] };
            anchorsChanged = true;
            geom = { ...geom, [bindingKey]: null };
            shapeUnbind(shape.id, a.id);
            continue;
          }
        }
      }

      const anchor = anchors[end];
      if (!anchor) continue;
      const shape = byId.get(anchor.elementId);
      if (!shape || shape.isDeleted) {
        delete anchors[end];
        anchorsChanged = true;
        continue;
      }
      const target = toScene(shape, anchor.fx, anchor.fy);
      const dist = Math.hypot(target[0] - pt[0], target[1] - pt[1]);
      if (dist <= EPS) continue;

      // 2) L'utente sta trascinando la freccia (o un suo punto) con il mouse, senza la figura:
      //    oltre qualche pixel l'ancora cade. In ogni altro caso il punto torna sull'ancora.
      const userDragging = st.cursorButton === "down" && !!selected[a.id] && !selected[shape.id];
      if (userDragging && dist > DETACH_PX) {
        delete anchors[end];
        anchorsChanged = true;
        continue;
      }
      if (userDragging) continue;
      geom = { ...geom, ...withEndpoint({ ...a, ...geom } as LinearLike, end, target) };
    }

    if (anchorsChanged) {
      const customData = { ...(a.customData ?? {}) } as Record<string, unknown>;
      if (anchors.start || anchors.end) customData.qdAnchors = anchors;
      else delete customData.qdAnchors;
      geom = { ...geom, customData };
    }
    if (Object.keys(geom).length) patch(a.id, geom);
  }

  if (!patches.size) return false;
  api.updateScene({
    elements: elements.map((e) => (patches.has(e.id) ? newElementWith(e, patches.get(e.id) as never) : e)),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
}
