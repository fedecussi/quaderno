import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button, Modal, toast } from "./ui";
import type { BoardData } from "../lib/types";
import { DEFAULT_PDF, estimatePixels, exportPdf, type PdfOptions } from "../lib/pdf";

const SCALES: { v: PdfOptions["scale"]; label: string; hint: string }[] = [
  { v: 1, label: "1×", hint: "96 dpi · leggero" },
  { v: 2, label: "2×", hint: "192 dpi · consigliato" },
  { v: 3, label: "3×", hint: "288 dpi · stampa" },
  { v: 4, label: "4×", hint: "384 dpi · massima" },
];

export function ExportPdfDialog({
  data,
  title,
  selectedIds,
  theme,
  onClose,
}: {
  data: BoardData;
  title: string;
  selectedIds: Record<string, boolean>;
  theme: "light" | "dark";
  onClose: () => void;
}) {
  const hasSelection = Object.keys(selectedIds).length > 0;
  const hasPaper = !!data.appState.paper && data.appState.paper.type !== "blank";
  const [opts, setOpts] = useState<PdfOptions>({ ...DEFAULT_PDF, dark: theme === "dark", onlySelected: false });
  const [busy, setBusy] = useState(false);
  const px = useMemo(() => estimatePixels(data, opts, selectedIds), [data, opts, selectedIds]);
  const set = (p: Partial<PdfOptions>) => setOpts((o) => ({ ...o, ...p }));
  const empty = px.width === 0;

  async function go() {
    setBusy(true);
    try {
      await exportPdf(data, title, opts, selectedIds);
      toast("PDF scaricato", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Esportazione fallita", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <>
          <FileDown size={18} /> Esporta in PDF
        </>
      }
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={go} disabled={busy || empty}>
            {busy ? "Preparo il PDF…" : "Scarica PDF"}
          </Button>
        </>
      }
    >
      <section className="pdf-section">
        <h3>Risoluzione</h3>
        <div className="pdf-scales">
          {SCALES.map((s) => (
            <button key={s.v} type="button" className={`pdf-scale ${opts.scale === s.v ? "on" : ""}`} onClick={() => set({ scale: s.v })}>
              <strong>{s.label}</strong>
              <span>{s.hint}</span>
            </button>
          ))}
        </div>
        <p className="muted small">
          {empty ? "La lavagna è vuota." : <>Immagine risultante: {px.width} × {px.height} px{px.scale < opts.scale && " (ridotta: la lavagna è molto grande)"}</>}
        </p>
      </section>

      <section className="pdf-section">
        <h3>Pagina</h3>
        <div className="seg seg-wide">
          <button className={opts.page === "fit" ? "on" : ""} onClick={() => set({ page: "fit" })}>
            Su misura
          </button>
          <button className={opts.page === "a4" ? "on" : ""} onClick={() => set({ page: "a4" })}>
            A4
          </button>
          <button className={opts.page === "a3" ? "on" : ""} onClick={() => set({ page: "a3" })}>
            A3
          </button>
        </div>
        {opts.page !== "fit" && (
          <div className="seg seg-wide">
            <button className={opts.orientation === "auto" ? "on" : ""} onClick={() => set({ orientation: "auto" })}>
              Automatico
            </button>
            <button className={opts.orientation === "portrait" ? "on" : ""} onClick={() => set({ orientation: "portrait" })}>
              Verticale
            </button>
            <button className={opts.orientation === "landscape" ? "on" : ""} onClick={() => set({ orientation: "landscape" })}>
              Orizzontale
            </button>
          </div>
        )}
        <p className="muted small">{opts.page === "fit" ? "Una pagina grande quanto il disegno." : "Il disegno viene adattato alla pagina con un piccolo margine."}</p>
      </section>

      <section className="pdf-section">
        <h3>Contenuto</h3>
        <label className="option">
          <input type="checkbox" checked={opts.background} onChange={(e) => set({ background: e.target.checked })} />
          <span>Sfondo della lavagna</span>
        </label>
        {hasPaper && (
          <label className="option">
            <input type="checkbox" checked={opts.paper} disabled={!opts.background} onChange={(e) => set({ paper: e.target.checked })} />
            <span>Foglio (righe, quadretti o puntini)</span>
          </label>
        )}
        <label className="option">
          <input type="checkbox" checked={opts.dark} onChange={(e) => set({ dark: e.target.checked })} />
          <span>Colori del tema scuro</span>
        </label>
        {hasSelection && (
          <label className="option">
            <input type="checkbox" checked={opts.onlySelected} onChange={(e) => set({ onlySelected: e.target.checked })} />
            <span>Solo gli elementi selezionati</span>
          </label>
        )}
      </section>
    </Modal>
  );
}
