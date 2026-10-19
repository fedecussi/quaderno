import React, { useCallback, useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw, MainMenu, WelcomeScreen, getSceneVersion, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { ArrowLeft, Share2, MoreHorizontal, Star, Copy, Download, Trash2, FolderInput, Check, Loader2, Grid3x3, FileDown } from "lucide-react";
import { Button, Menu, Modal, toast, useMenu } from "./ui";
import { ShareDialog } from "./ShareDialog";
import { FavoriteColors, type CurrentColors } from "./FavoriteColors";
import { ExportPdfDialog } from "./ExportPdfDialog";
import { attachMagnet } from "../lib/magnet";
import { syncAnchors } from "../lib/anchors";
import { applyPaperVars } from "../lib/paperVars";
import { LogoMark } from "./Logo";
import { useStore, touchBoard, updateBoard, trashBoard, restoreBoard, duplicateBoard } from "../lib/store";
import { loadBoardData, saveBoardData, EMPTY_BOARD } from "../lib/db";
import { navigate } from "../lib/router";
import type { BoardData, BoardMeta, Paper, PaperSize, PaperType } from "../lib/types";
import { DEFAULT_PAPER } from "../lib/types";
import { makeThumbnail } from "../lib/thumbnail";
import { downloadExcalidrawFile } from "../lib/files";
import { boardTitle } from "../lib/format";

type SaveState = "saved" | "dirty" | "saving";

const PAPER_LABEL: Record<PaperType, string> = { blank: "Bianco", lines: "Righe", squares: "Quadretti", dots: "Puntini" };
const SIZE_LABEL: Record<PaperSize, string> = { s: "Piccoli", m: "Medi", l: "Grandi" };

export function Editor({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const { boards, collections, settings } = useStore();
  const meta = boards.find((b) => b.id === id);
  const [initial, setInitial] = useState<BoardData | undefined>(undefined);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  apiRef.current = api;
  const anchorPrefs = useRef({ start: true, end: true });
  anchorPrefs.current = { start: settings.anchorStart !== false, end: settings.anchorEnd !== false };
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [colors, setColors] = useState<CurrentColors>({ stroke: "#1e1e1e", background: "transparent", hasSelection: false });
  const [pdfOpen, setPdfOpen] = useState(false);
  const canvasHost = useRef<HTMLDivElement>(null);
  const menu = useMenu();
  const [paperOpen, setPaperOpen] = useState(false);
  const paperPopRef = useRef<HTMLDivElement>(null);
  const [paper, setPaper] = useState<Paper>(DEFAULT_PAPER);
  const paperRef = useRef<HTMLDivElement>(null);

  const latest = useRef<BoardData | null>(null);
  const lastSavedVersion = useRef<number>(-1);
  const saveTimer = useRef<number | undefined>(undefined);
  const thumbTimer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);

  // Carica il contenuto
  useEffect(() => {
    let alive = true;
    setInitial(undefined);
    loadBoardData(id).then((d) => {
      if (!alive) return;
      const data = d ?? EMPTY_BOARD;
      latest.current = data;
      lastSavedVersion.current = getSceneVersion(data.elements);
      setPaper(data.appState.paper ?? DEFAULT_PAPER);
      setInitial(data);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const persist = useCallback(
    async (withThumb: boolean) => {
      const data = latest.current;
      if (!data) return;
      const version = getSceneVersion(data.elements);
      if (version === lastSavedVersion.current && !withThumb) {
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      await saveBoardData(id, data);
      lastSavedVersion.current = version;
      const live = data.elements.filter((e) => !e.isDeleted);
      const patch: Partial<BoardMeta> = { elementCount: live.length, background: data.appState.viewBackgroundColor };
      if (withThumb) patch.thumb = await makeThumbnail(data, "light");
      await touchBoard(id, patch);
      setSaveState("saved");
    },
    [id],
  );

  async function changePaper(patch: Partial<Paper>) {
    const next = { ...paper, ...patch };
    setPaper(next);
    const st = apiRef.current?.getAppState();
    if (st) applyPaperVars(paperRef.current, next, st.scrollX, st.scrollY, st.zoom.value);
    const data = latest.current;
    if (!data) return;
    latest.current = { ...data, appState: { ...data.appState, paper: next } };
    await saveBoardData(id, latest.current);
    await touchBoard(id, {});
  }

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const version = getSceneVersion(elements);
      // Colore corrente per il pannello dei preferiti (dalla selezione, altrimenti dallo strumento)
      const sel = appState.selectedElementIds;
      const first = elements.find((e) => sel[e.id] && !e.isDeleted);
      const next: CurrentColors = {
        stroke: first ? first.strokeColor : appState.currentItemStrokeColor,
        background: first ? first.backgroundColor : appState.currentItemBackgroundColor,
        hasSelection: !!first,
      };
      setColors((c) => (c.stroke === next.stroke && c.background === next.background && c.hasSelection === next.hasSelection ? c : next));
      // Il foglio (righe/quadretti/puntini) segue pan e zoom della tela
      applyPaperVars(paperRef.current, latest.current?.appState.paper ?? DEFAULT_PAPER, appState.scrollX, appState.scrollY, appState.zoom.value);
      // Punti ancorati a vertici/metà lato: li riportiamo in posizione se la figura si è mossa
      if (apiRef.current && syncAnchors(apiRef.current, anchorPrefs.current)) return;
      const data: BoardData = {
        elements,
        appState: {
          paper: latest.current?.appState.paper ?? DEFAULT_PAPER,
          viewBackgroundColor: appState.viewBackgroundColor,
          gridModeEnabled: appState.gridModeEnabled,
          objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: { value: appState.zoom.value },
        },
        files,
      };
      latest.current = data;
      if (version === lastSavedVersion.current) return;
      setSaveState("dirty");
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(thumbTimer.current);
      saveTimer.current = window.setTimeout(() => persist(false), 700);
      thumbTimer.current = window.setTimeout(() => persist(true), 3000);
    },
    [persist],
  );

  // Salva (con miniatura) uscendo dalla lavagna o chiudendo la scheda
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(thumbTimer.current);
      persist(true);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  // Chiusura del popover Foglio
  useEffect(() => {
    if (!paperOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!paperPopRef.current?.contains(e.target as Node)) setPaperOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPaperOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [paperOpen]);

  // La lavagna aperta è stata aggiornata dal cloud: ricarica la scena (solo se qui non ci sono modifiche in sospeso)
  useEffect(() => {
    if (!api) return;
    const onRemote = async (e: Event) => {
      if ((e as CustomEvent<{ id: string }>).detail.id !== id) return;
      if (saveTimer.current !== undefined && latest.current && getSceneVersion(latest.current.elements) !== lastSavedVersion.current) return;
      const data = await loadBoardData(id);
      if (!data) return;
      latest.current = data;
      lastSavedVersion.current = getSceneVersion(data.elements);
      api.addFiles(Object.values(data.files ?? {}));
      api.updateScene({ elements: data.elements, captureUpdate: CaptureUpdateAction.NEVER });
      toast("Lavagna aggiornata da un altro dispositivo");
    };
    window.addEventListener("quaderno:remote-board", onRemote);
    return () => window.removeEventListener("quaderno:remote-board", onRemote);
  }, [api, id]);

  // Magnete per i punti di linee e frecce (vertici, metà lato, centro delle figure)
  useEffect(() => {
    if (!api || !canvasHost.current) return;
    return attachMagnet(api, canvasHost.current);
  }, [api]);

  // Tema di Excalidraw e dell'app sincronizzati
  useEffect(() => {
    api?.updateScene({ appState: { theme } });
  }, [api, theme]);

  if (!meta) {
    return (
      <div className="editor-missing">
        <LogoMark size={40} />
        <h2>Lavagna non trovata</h2>
        <p className="muted">Forse è stata eliminata o il link è sbagliato.</p>
        <Button variant="primary" onClick={() => navigate({ name: "home", filter: { kind: "all" } })}>
          Torna alle lavagne
        </Button>
      </div>
    );
  }

  const collection = collections.find((c) => c.id === meta.collectionId);
  const goHome = () => navigate(meta.collectionId ? { name: "home", filter: { kind: "collection", id: meta.collectionId } } : { name: "home", filter: { kind: "all" } });

  return (
    <div className="editor" data-theme={theme}>
      <header className="editor-bar">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={18} />} aria-label="Torna alle lavagne" title="Torna alle lavagne" onClick={goHome} />
        <div className="editor-crumb">
          {collection && (
            <>
              <span className="crumb muted">
                {collection.emoji} {collection.name}
              </span>
              <span className="crumb-sep">/</span>
            </>
          )}
          <input
            ref={titleRef}
            className="title-input"
            value={meta.title}
            placeholder="Senza titolo"
            aria-label="Titolo lavagna"
            onChange={(e) => updateBoard(meta.id, { title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            style={{ width: `${Math.max(8, (meta.title || "Senza titolo").length + 1)}ch` }}
            spellCheck={false}
          />
        </div>
        <SaveIndicator state={saveState} />
        <div className="grow" />
        <div className="popover-anchor" ref={paperPopRef}>
          <Button variant="ghost" size="sm" icon={<Grid3x3 size={17} />} aria-label="Foglio" title="Foglio: bianco, righe, quadretti, puntini e intensità" aria-expanded={paperOpen} onClick={() => setPaperOpen((o) => !o)}>
            {PAPER_LABEL[paper.type]}
          </Button>
          {paperOpen && (
            <div className="paper-pop" role="dialog" aria-label="Foglio">
              <label className="row">Foglio</label>
              <div className="seg">
                {(Object.keys(PAPER_LABEL) as PaperType[]).map((t) => (
                  <button key={t} className={paper.type === t ? "on" : ""} onClick={() => changePaper({ type: t })}>
                    {PAPER_LABEL[t]}
                  </button>
                ))}
              </div>
              <label className="row">Dimensione</label>
              <div className="seg">
                {(Object.keys(SIZE_LABEL) as PaperSize[]).map((sz) => (
                  <button key={sz} className={paper.size === sz ? "on" : ""} disabled={paper.type === "blank"} onClick={() => changePaper({ size: sz })}>
                    {SIZE_LABEL[sz]}
                  </button>
                ))}
              </div>
              <label className="row" htmlFor="paper-opacity">
                <span>Intensità</span>
                <span>{Math.round((paper.opacity ?? 1) * 100)}%</span>
              </label>
              <input id="paper-opacity" type="range" min={10} max={100} step={5} disabled={paper.type === "blank"} value={Math.round((paper.opacity ?? 1) * 100)} onChange={(e) => changePaper({ opacity: Number(e.target.value) / 100 })} />
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Star size={17} fill={meta.favorite ? "currentColor" : "none"} />}
          aria-label="Preferita"
          title={meta.favorite ? "Togli dalle preferite" : "Aggiungi alle preferite"}
          className={meta.favorite ? "star-on" : ""}
          onClick={() => updateBoard(meta.id, { favorite: !meta.favorite })}
        />
        <Button variant="primary" size="sm" icon={<Share2 size={16} />} onClick={() => setSharing(true)}>
          Condividi
        </Button>
        <Button variant="ghost" size="sm" icon={<MoreHorizontal size={18} />} aria-label="Altre opzioni" onClick={menu.open} />
      </header>

      <div ref={canvasHost} className={`editor-canvas ${paper.type !== "blank" ? "has-paper" : ""}`}>
        <div
          ref={paperRef}
          className={`paper paper-${paper.type}`}
          aria-hidden="true"
        />
        {initial === undefined ? (
          <div className="editor-loading">
            <Loader2 className="spin" size={22} />
          </div>
        ) : (
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={{
              elements: initial.elements,
              appState: {
                ...initial.appState,
                // Aggancio a vertici e metà lato delle figure (Alt per disattivarlo al volo)
                objectsSnapModeEnabled: initial.appState.objectsSnapModeEnabled ?? true,
                theme,
                name: boardTitle(meta.title),
              } as Partial<AppState>,
              files: initial.files,
              scrollToContent: initial.appState.scrollX === undefined,
            }}
            onChange={onChange}
            theme={theme}
            langCode="it-IT"
            name={boardTitle(meta.title)}
            autoFocus
            UIOptions={{
              canvasActions: {
                toggleTheme: false,
                saveToActiveFile: false,
                loadScene: false,
                export: { saveFileToDisk: true },
              },
              tools: { image: true },
            }}
          >
            <MainMenu>
              <MainMenu.Item onSelect={goHome} icon={<ArrowLeft size={16} />}>
                Tutte le lavagne
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.Item onSelect={() => setPdfOpen(true)} icon={<FileDown size={16} />}>
                Esporta in PDF…
              </MainMenu.Item>
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Hints.ToolbarHint>Scegli uno strumento e inizia a disegnare</WelcomeScreen.Hints.ToolbarHint>
              <WelcomeScreen.Hints.MenuHint>Esporta, cerca, sfondo…</WelcomeScreen.Hints.MenuHint>
              <WelcomeScreen.Hints.HelpHint>Scorciatoie e aiuto</WelcomeScreen.Hints.HelpHint>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Logo>
                  <span className="welcome-logo">
                    <LogoMark size={36} /> Quaderno
                  </span>
                </WelcomeScreen.Center.Logo>
                <WelcomeScreen.Center.Heading>Una lavagna infinita per i tuoi appunti.</WelcomeScreen.Center.Heading>
                <WelcomeScreen.Center.Menu>
                  <WelcomeScreen.Center.MenuItemHelp />
                  <WelcomeScreen.Center.MenuItem onSelect={() => titleRef.current?.focus()} icon={<Check size={16} />}>
                    Dai un titolo alla lavagna
                  </WelcomeScreen.Center.MenuItem>
                </WelcomeScreen.Center.Menu>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>
        )}
      </div>

      <Menu
        anchor={menu.anchor}
        onClose={menu.close}
        items={[
          {
            label: "Duplica",
            icon: <Copy size={15} />,
            onSelect: async () => {
              await persist(true);
              const c = await duplicateBoard(meta.id);
              if (c) {
                toast("Lavagna duplicata", "success");
                navigate({ name: "board", id: c.id });
              }
            },
          },
          { label: "Sposta in raccolta…", icon: <FolderInput size={15} />, onSelect: () => setMoving(true) },
          { separator: true, label: "" },
          { label: "Esporta in PDF…", icon: <FileDown size={15} />, onSelect: () => setPdfOpen(true) },
          {
            label: "Scarica .excalidraw",
            icon: <Download size={15} />,
            onSelect: () => latest.current && downloadExcalidrawFile(meta, latest.current),
          },
          { separator: true, label: "" },
          {
            label: "Sposta nel cestino",
            icon: <Trash2 size={15} />,
            danger: true,
            onSelect: async () => {
              await trashBoard(meta.id);
              goHome();
              toast(`"${boardTitle(meta.title)}" spostata nel cestino`, "info", { label: "Annulla", onClick: () => restoreBoard(meta.id) });
            },
          },
        ]}
      />

      <Modal open={moving} onClose={() => setMoving(false)} title="Sposta in raccolta" width={380}>
        <div className="pick-list">
          <button className={`pick ${meta.collectionId == null ? "on" : ""}`} onClick={() => (updateBoard(meta.id, { collectionId: null }), setMoving(false))}>
            <span className="nav-emoji">∅</span> Nessuna raccolta
          </button>
          {collections.map((c) => (
            <button key={c.id} className={`pick ${meta.collectionId === c.id ? "on" : ""}`} onClick={() => (updateBoard(meta.id, { collectionId: c.id }), setMoving(false))}>
              <span className="nav-emoji">{c.emoji}</span> {c.name}
            </button>
          ))}
          {collections.length === 0 && <p className="muted">Non hai ancora raccolte: creane una dalla dashboard.</p>}
        </div>
      </Modal>

      {sharing && <ShareDialog board={meta} data={latest.current ?? undefined} onClose={() => setSharing(false)} />}
      {pdfOpen && latest.current && (
        <ExportPdfDialog data={latest.current} title={meta.title} selectedIds={api?.getAppState().selectedElementIds ?? {}} theme={theme} onClose={() => setPdfOpen(false)} />
      )}
      <FavoriteColors api={api} root={canvasHost.current} current={colors} />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className={`save-indicator save-${state}`} title={state === "saved" ? "Tutte le modifiche sono salvate" : "Salvataggio in corso"}>
      {state === "saved" ? <Check size={13} /> : <span className="dot" />}
      <span>{state === "saved" ? "Salvato" : "Salvataggio…"}</span>
    </span>
  );
}
