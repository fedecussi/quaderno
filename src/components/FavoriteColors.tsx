import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { setSettings, useStore } from "../lib/store";
import { applyColor, normalizeColor, type ColorKind } from "../lib/colors";
import { toast } from "./ui";

export interface CurrentColors {
  stroke: string;
  background: string;
  hasSelection: boolean;
}

type Targets = Record<ColorKind, HTMLElement | null>;
const LABELS: Record<string, ColorKind> = { tratto: "stroke", stroke: "stroke", sfondo: "background", background: "background" };

/**
 * Inserisce una riga "Preferiti" dentro le sezioni Tratto e Sfondo del pannello
 * proprietà di Excalidraw. Il pannello è gestito da Excalidraw: osserviamo il DOM
 * e agganciamo un contenitore in coda a ciascuna sezione, dove React fa il portal.
 */
export function FavoriteColors({ api, root, current }: { api: ExcalidrawImperativeAPI | null; root: HTMLElement | null; current: CurrentColors }) {
  const [targets, setTargets] = useState<Targets>({ stroke: null, background: null });

  useEffect(() => {
    if (!root) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      const next: Targets = { stroke: null, background: null };
      root.querySelectorAll<HTMLElement>(".App-menu__left .panelColumn > div").forEach((section) => {
        const label = section.querySelector(":scope > h3")?.textContent?.trim().toLowerCase() ?? "";
        const kind = LABELS[label];
        if (!kind) return;
        let host = section.querySelector<HTMLElement>(":scope > .qd-fav");
        if (!host) {
          host = document.createElement("div");
          host.className = "qd-fav";
          section.appendChild(host);
        }
        next[kind] = host;
      });
      setTargets((t) => (t.stroke === next.stroke && t.background === next.background ? t : next));
    };
    const mo = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(sync);
    });
    mo.observe(root, { childList: true, subtree: true });
    sync();
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [root]);

  if (!api) return null;
  return (
    <>
      {targets.stroke && createPortal(<FavRow kind="stroke" api={api} active={current.stroke} />, targets.stroke)}
      {targets.background && createPortal(<FavRow kind="background" api={api} active={current.background} />, targets.background)}
    </>
  );
}

function FavRow({ kind, api, active }: { kind: ColorKind; api: ExcalidrawImperativeAPI; active: string }) {
  const { settings } = useStore();
  const key = kind === "stroke" ? "favoriteStrokeColors" : "favoriteBackgroundColors";
  const list = settings[key] ?? [];
  const canSave = active !== "transparent" && !list.includes(active);

  const save = () => {
    const c = normalizeColor(active);
    if (!c || c === "transparent") return;
    if (list.includes(c)) return toast("Già tra i preferiti");
    setSettings({ [key]: [...list, c] });
  };
  const remove = (c: string) => setSettings({ [key]: list.filter((x) => x !== c) });

  return (
    <div className="qd-fav-row">
      <div className="qd-fav-head">
        <span>Preferiti</span>
        <button type="button" className="qd-fav-save" disabled={!canSave} onClick={save} title={canSave ? `Salva ${active} nei preferiti` : "Il colore corrente è già nei preferiti"}>
          <Star size={12} fill={canSave ? "none" : "currentColor"} /> salva
        </button>
      </div>
      <div className="qd-fav-swatches">
        {list.map((c) => (
          <span className="qd-swatch-wrap" key={c}>
            <button type="button" className={`qd-swatch ${active === c ? "on" : ""}`} style={{ background: c }} title={c} onClick={() => applyColor(api, kind, c)} />
            <button type="button" className="qd-swatch-x" title="Rimuovi dai preferiti" aria-label={`Rimuovi ${c}`} onClick={() => remove(c)}>
              <X size={8} />
            </button>
          </span>
        ))}
        <label className="qd-swatch qd-pick" title="Scegli qualsiasi colore">
          +
          <input type="color" value={/^#[0-9a-f]{6}/i.test(active) ? active.slice(0, 7) : "#5b4de6"} onInput={(e) => applyColor(api, kind, (e.target as HTMLInputElement).value)} />
        </label>
        {list.length === 0 && <span className="qd-fav-empty">Nessun preferito: scegli un colore e premi “salva”.</span>}
      </div>
    </div>
  );
}
