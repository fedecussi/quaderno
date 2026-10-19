import React, { useEffect, useState } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import { Lock, Download, BookmarkPlus, Loader2, AlertTriangle, FileDown } from "lucide-react";
import { ExportPdfDialog } from "./ExportPdfDialog";
import { Button, toast } from "./ui";
import { Logo, LogoMark } from "./Logo";
import { decodeShare, shareNeedsPassword, SharePasswordRequired, ShareInvalid, type SharePayload } from "../lib/share";
import { createBoard } from "../lib/store";
import { navigate } from "../lib/router";
import { makeThumbnail } from "../lib/thumbnail";
import { downloadExcalidrawFile } from "../lib/files";
import { boardTitle, relativeTime } from "../lib/format";
import { PAPER_STEP } from "../lib/types";
import { useRef } from "react";

export function SharedView({ payload: fragment, theme }: { payload: string; theme: "light" | "dark" }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [needsPassword, setNeedsPassword] = useState(() => shareNeedsPassword(fragment));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  async function open(pw?: string) {
    setBusy(true);
    setError(null);
    try {
      setPayload(await decodeShare(fragment, pw));
      setNeedsPassword(false);
    } catch (e) {
      if (e instanceof SharePasswordRequired) setNeedsPassword(true);
      else if (e instanceof ShareInvalid) setError(e.message);
      else setError("Impossibile aprire il link");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!shareNeedsPassword(fragment)) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fragment]);

  async function saveCopy() {
    if (!payload) return;
    const thumb = await makeThumbnail(payload.data, "light");
    const b = await createBoard(
      { title: payload.title, thumb, elementCount: payload.data.elements.length, background: payload.data.appState.viewBackgroundColor },
      payload.data,
    );
    toast("Salvata nel tuo Quaderno", "success");
    navigate({ name: "board", id: b.id });
  }

  if (!payload) {
    return (
      <div className="gate">
        <div className="gate-card">
          <Logo size={32} />
          {needsPassword ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                open(password);
              }}
            >
              <div className="gate-icon">
                <Lock size={22} />
              </div>
              <h1>Lavagna protetta</h1>
              <p className="muted">Chi ti ha inviato il link ti avrà comunicato anche la password.</p>
              <input className="input" type="password" autoFocus placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="error-text">{error}</p>}
              <Button variant="primary" size="lg" type="submit" disabled={!password || busy}>
                {busy ? "Apro…" : "Apri lavagna"}
              </Button>
            </form>
          ) : error ? (
            <>
              <div className="gate-icon warn">
                <AlertTriangle size={22} />
              </div>
              <h1>Link non valido</h1>
              <p className="muted">{error}. Il link potrebbe essere stato troncato copiandolo: chiedi di inviartelo di nuovo.</p>
              <Button variant="primary" onClick={() => navigate({ name: "home", filter: { kind: "all" } })}>
                Vai alle mie lavagne
              </Button>
            </>
          ) : (
            <div className="gate-loading">
              <Loader2 className="spin" size={22} /> Apro la lavagna…
            </div>
          )}
        </div>
      </div>
    );
  }

  const paper = payload.data.appState.paper ?? { type: "blank" as const, size: "m" as const };
  const paperRef = useRef<HTMLDivElement>(null);
  const meta = { id: "shared", title: payload.title, collectionId: null, favorite: false, createdAt: payload.sharedAt, updatedAt: payload.sharedAt, deletedAt: null, elementCount: 0 };

  return (
    <div className="editor" data-theme={theme}>
      <header className="editor-bar shared-bar">
        <a href="#/" className="bar-logo" title="Le mie lavagne">
          <LogoMark size={24} />
        </a>
        <div className="editor-crumb">
          <span className="shared-badge">Condivisa</span>
          <span className="title-static ellipsis">{boardTitle(payload.title)}</span>
          <span className="muted small crumb">· {relativeTime(payload.sharedAt)}</span>
        </div>
        <div className="grow" />
        <Button variant="ghost" size="sm" icon={<FileDown size={16} />} onClick={() => setPdfOpen(true)}>
          PDF
        </Button>
        <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => downloadExcalidrawFile(meta, payload.data)}>
          Scarica
        </Button>
        <Button variant="primary" size="sm" icon={<BookmarkPlus size={16} />} onClick={saveCopy}>
          Salva nel mio Quaderno
        </Button>
      </header>
      <div className={`editor-canvas ${paper.type !== "blank" ? "has-paper" : ""}`}>
        <div ref={paperRef} className={`paper paper-${paper.type}`} style={{ "--step": `${paper.type === "blank" ? 24 : PAPER_STEP[paper.type][paper.size]}px` } as React.CSSProperties} aria-hidden="true" />
        <Excalidraw
          onChange={(_els, appState) => {
            const el = paperRef.current;
            if (!el) return;
            const z = appState.zoom.value;
            el.style.setProperty("--zoom", String(z));
            el.style.setProperty("--px", `${appState.scrollX * z}px`);
            el.style.setProperty("--py", `${appState.scrollY * z}px`);
          }}
          initialData={{ elements: payload.data.elements, appState: { ...payload.data.appState, theme } as Partial<AppState>, files: payload.data.files, scrollToContent: true }}
          viewModeEnabled
          theme={theme}
          langCode="it-IT"
          name={boardTitle(payload.title)}
          UIOptions={{ canvasActions: { toggleTheme: false, saveToActiveFile: false, loadScene: false, clearCanvas: false, changeViewBackgroundColor: false, export: { saveFileToDisk: true } } }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
      {pdfOpen && <ExportPdfDialog data={payload.data} title={payload.title} selectedIds={{}} theme={theme} onClose={() => setPdfOpen(false)} />}
    </div>
  );
}
