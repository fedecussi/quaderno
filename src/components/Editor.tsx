import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, WelcomeScreen, getSceneVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { ArrowLeft, Share2, MoreHorizontal, Star, Copy, Download, Trash2, FolderInput, Check, Loader2 } from "lucide-react";
import { Button, Menu, Modal, toast, useMenu } from "./ui";
import { ShareDialog } from "./ShareDialog";
import { LogoMark } from "./Logo";
import { useStore, touchBoard, updateBoard, trashBoard, restoreBoard, duplicateBoard } from "../lib/store";
import { loadBoardData, saveBoardData, EMPTY_BOARD } from "../lib/db";
import { navigate } from "../lib/router";
import type { BoardData, BoardMeta } from "../lib/types";
import { makeThumbnail } from "../lib/thumbnail";
import { downloadExcalidrawFile } from "../lib/files";
import { boardTitle } from "../lib/format";

type SaveState = "saved" | "dirty" | "saving";

export function Editor({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const { boards, collections } = useStore();
  const meta = boards.find((b) => b.id === id);
  const [initial, setInitial] = useState<BoardData | undefined>(undefined);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const menu = useMenu();

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

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const version = getSceneVersion(elements);
      const data: BoardData = {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridModeEnabled: appState.gridModeEnabled,
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

      <div className="editor-canvas">
        {initial === undefined ? (
          <div className="editor-loading">
            <Loader2 className="spin" size={22} />
          </div>
        ) : (
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={{
              elements: initial.elements,
              appState: { ...initial.appState, theme, name: boardTitle(meta.title) } as Partial<AppState>,
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
