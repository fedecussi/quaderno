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

// Memoria dell'ultima posizione vista di ancora e punto, per capire chi si è mosso.
const seen = new Map<string, { p: P; e: P }>();

/** Da chiamare ad ogni onChange. Ritorna true se ha aggiornato la scena. */
export function syncAnchors(api: ExcalidrawImperativeAPI): boolean {
  const elements = api.getSceneElements();
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
      const key = `${a.id}:${end}`;
      const pt = endpoint(a, end);
      const binding = end === "start" ? a.startBinding : a.endBinding;

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
            geom = { ...geom, [end === "start" ? "startBinding" : "endBinding"]: null };
            shapeUnbind(shape.id, a.id);
            seen.set(key, { p: pt, e: pt });
            continue;
          }
        }
      }

      const anchor = anchors[end];
      if (!anchor) {
        seen.delete(key);
        continue;
      }
      const shape = byId.get(anchor.elementId);
      if (!shape || shape.isDeleted) {
        delete anchors[end];
        anchorsChanged = true;
        seen.delete(key);
        continue;
      }
      const target = toScene(shape, anchor.fx, anchor.fy);
      const prev = seen.get(key);
      const targetMoved = !prev || Math.hypot(prev.p[0] - target[0], prev.p[1] - target[1]) > EPS;
      const pointMoved = !!prev && Math.hypot(prev.e[0] - pt[0], prev.e[1] - pt[1]) > EPS;
      const offTarget = Math.hypot(target[0] - pt[0], target[1] - pt[1]) > EPS;

      if (offTarget && pointMoved && !targetMoved) {
        // L'utente ha staccato il punto: l'ancora cade (se lo riaggancia, il binding la ricrea)
        delete anchors[end];
        anchorsChanged = true;
        seen.delete(key);
        continue;
      }
      if (offTarget) {
        geom = { ...geom, ...withEndpoint({ ...a, ...geom } as LinearLike, end, target) };
        seen.set(key, { p: target, e: target });
      } else {
        seen.set(key, { p: target, e: pt });
      }
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
