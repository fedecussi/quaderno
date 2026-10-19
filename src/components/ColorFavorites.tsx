import { useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Palette, Plus, X, Ban } from "lucide-react";
import { setSettings, useStore } from "../lib/store";
import { toast } from "./ui";

export interface CurrentColors {
  stroke: string;
  background: string;
  hasSelection: boolean;
}

type Kind = "stroke" | "background";

const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
const normalize = (v: string) => {
  const t = v.trim().toLowerCase();
  if (t === "transparent" || t === "") return "transparent";
  const h = t.startsWith("#") ? t : `#${t}`;
  if (!isHex(h)) return null;
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
};

/**
 * Pannello "Colori preferiti": scegli qualsiasi colore (selettore nativo o hex),
 * salvalo nei preferiti e applicalo al tratto o allo sfondo degli elementi selezionati
 * (e a quelli che disegnerai dopo).
 */
export function ColorFavorites({ api, current }: { api: ExcalidrawImperativeAPI | null; current: CurrentColors }) {
  const { settings } = useStore();
  const favorites = settings.favoriteColors ?? [];
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("stroke");
  const [hex, setHex] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const active = kind === "stroke" ? current.stroke : current.background;

  useEffect(() => {
    setHex(active === "transparent" ? "" : active);
  }, [active, kind]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply(color: string, k: Kind = kind) {
    if (!api) return;
    const app = api.getAppState();
    const sel = app.selectedElementIds;
    const key = k === "stroke" ? "strokeColor" : "backgroundColor";
    const elements = api.getSceneElements();
    const containerOf = (e: unknown) => (e as { containerId?: string | null }).containerId ?? null;
    const picked = (e: (typeof elements)[number]) => !!sel[e.id] || (k === "stroke" && !!containerOf(e) && !!sel[containerOf(e)!]);
    const touched = elements.some(picked);
    api.updateScene({
      elements: touched
        ? elements.map((e) => (picked(e) ? newElementWith(e, { [key]: color }) : e))
        : undefined,
      appState: {
        currentItemStrokeColor: k === "stroke" ? color : app.currentItemStrokeColor,
        currentItemBackgroundColor: k === "background" ? color : app.currentItemBackgroundColor,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  function addFavorite(color: string) {
    const c = normalize(color);
    if (!c) return;
    if (favorites.includes(c)) {
      toast("Già tra i preferiti");
      return;
    }
    setSettings({ favoriteColors: [...favorites, c] });
  }
  function removeFavorite(color: string) {
    setSettings({ favoriteColors: favorites.filter((c) => c !== color) });
  }

  function submitHex() {
    const c = normalize(hex);
    if (!c) {
      toast("Colore non valido: usa un esadecimale come #ff8800", "error");
      return;
    }
    apply(c);
  }

  return (
    <div className="colorfav" ref={ref}>
      <button className={`colorfav-btn ${open ? "on" : ""}`} onClick={() => setOpen((o) => !o)} title="Colori preferiti" aria-label="Colori preferiti" aria-expanded={open}>
        <Palette size={16} />
        <span className="colorfav-dots">
          <i style={{ background: current.stroke }} />
          <i style={{ background: current.background === "transparent" ? undefined : current.background }} className={current.background === "transparent" ? "none" : ""} />
        </span>
      </button>

      {open && (
        <div className="colorfav-pop" role="dialog" aria-label="Colori preferiti">
          <div className="colorfav-head">
            <strong>Colori</strong>
            <div className="seg seg-sm">
              <button className={kind === "stroke" ? "on" : ""} onClick={() => setKind("stroke")}>
                Tratto
              </button>
              <button className={kind === "background" ? "on" : ""} onClick={() => setKind("background")}>
                Sfondo
              </button>
            </div>
          </div>

          <p className="colorfav-hint">{current.hasSelection ? "Si applica agli elementi selezionati." : "Nessuna selezione: vale per i prossimi elementi."}</p>

          <div className="colorfav-grid">
            {kind === "background" && (
              <button className={`swatch swatch-none ${active === "transparent" ? "on" : ""}`} title="Nessuno sfondo" onClick={() => apply("transparent")}>
                <Ban size={13} />
              </button>
            )}
            {favorites.map((c) => (
              <span key={c} className="swatch-wrap">
                <button className={`swatch ${active === c ? "on" : ""}`} style={{ background: c }} title={c} onClick={() => apply(c)} />
                <button className="swatch-x" title="Rimuovi dai preferiti" aria-label={`Rimuovi ${c}`} onClick={() => removeFavorite(c)}>
                  <X size={9} />
                </button>
              </span>
            ))}
            <label className="swatch swatch-pick" title="Scegli qualsiasi colore">
              <Plus size={14} />
              <input
                type="color"
                value={active === "transparent" || !isHex(active) ? "#5b4de6" : active.slice(0, 7)}
                onInput={(e) => apply((e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
          {favorites.length === 0 && <p className="colorfav-empty">Ancora nessun preferito. Scegli un colore e premi “Salva nei preferiti”.</p>}

          <form
            className="colorfav-hex"
            onSubmit={(e) => {
              e.preventDefault();
              submitHex();
            }}
          >
            <span className="swatch swatch-current" style={{ background: active === "transparent" ? undefined : active }} />
            <input className="input mono" value={hex} placeholder="#rrggbb" spellCheck={false} onChange={(e) => setHex(e.target.value)} onBlur={() => hex && normalize(hex) !== active && submitHex()} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => addFavorite(active)} disabled={active === "transparent" || favorites.includes(active)}>
              Salva nei preferiti
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
