import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, LayoutGrid, List, ArrowUpDown, Trash2, Sparkles } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BoardCard, type BoardActions } from "./BoardCard";
import { Button, Confirm, Menu, Modal, Prompt, toast, useMenu } from "./ui";
import { ShareDialog } from "./ShareDialog";
import { SettingsDialog } from "./SettingsDialog";
import { useStore, createBoard, updateBoard, trashBoard, restoreBoard, deleteForever, emptyTrash, duplicateBoard, setSettings } from "../lib/store";
import { loadBoardData } from "../lib/db";
import { navigate, type HomeFilter } from "../lib/router";
import type { BoardMeta, SortMode } from "../lib/types";
import { boardTitle } from "../lib/format";
import { downloadExcalidrawFile, importExcalidrawFiles } from "../lib/files";

const SORT_LABEL: Record<SortMode, string> = { updated: "Ultima modifica", created: "Data di creazione", title: "Titolo" };

export function Dashboard({ filter }: { filter: HomeFilter }) {
  const { boards, collections, settings } = useStore();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<BoardMeta | null>(null);
  const [moving, setMoving] = useState<BoardMeta | null>(null);
  const [sharing, setSharing] = useState<BoardMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoardMeta | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sortMenu = useMenu();
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const live = boards.filter((b) => !b.deletedAt);
    const byCollection: Record<string, number> = {};
    for (const b of live) if (b.collectionId) byCollection[b.collectionId] = (byCollection[b.collectionId] ?? 0) + 1;
    return { all: live.length, favorites: live.filter((b) => b.favorite).length, trash: boards.length - live.length, byCollection };
  }, [boards]);

  const visible = useMemo(() => {
    let list = boards.filter((b) => (filter.kind === "trash" ? !!b.deletedAt : !b.deletedAt));
    if (filter.kind === "favorites") list = list.filter((b) => b.favorite);
    if (filter.kind === "collection") list = list.filter((b) => b.collectionId === filter.id);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((b) => boardTitle(b.title).toLowerCase().includes(q));
    const s = settings.sort;
    list = [...list].sort((a, b) =>
      s === "title" ? boardTitle(a.title).localeCompare(boardTitle(b.title), "it") : s === "created" ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt,
    );
    return list;
  }, [boards, filter, query, settings.sort]);

  const currentCollection = filter.kind === "collection" ? collections.find((c) => c.id === filter.id) : undefined;
  const heading =
    filter.kind === "favorites" ? "Preferite" : filter.kind === "trash" ? "Cestino" : currentCollection ? `${currentCollection.emoji} ${currentCollection.name}` : "Tutte le lavagne";

  async function onNew() {
    const b = await createBoard({ collectionId: filter.kind === "collection" ? filter.id : null });
    navigate({ name: "board", id: b.id });
  }

  // Scorciatoie: N nuova lavagna, / cerca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onNew();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const actions: BoardActions = {
    rename: setRenaming,
    duplicate: async (b) => {
      const c = await duplicateBoard(b.id);
      if (c) toast("Lavagna duplicata", "success");
    },
    move: setMoving,
    share: setSharing,
    exportFile: async (b) => {
      const data = await loadBoardData(b.id);
      if (data) downloadExcalidrawFile(b, data);
    },
    trash: async (b) => {
      await trashBoard(b.id);
      toast(`"${boardTitle(b.title)}" spostata nel cestino`, "info", { label: "Annulla", onClick: () => restoreBoard(b.id) });
    },
    restore: async (b) => {
      await restoreBoard(b.id);
      toast("Lavagna ripristinata", "success");
    },
    deleteForever: setConfirmDelete,
    toggleFavorite: (b) => updateBoard(b.id, { favorite: !b.favorite }),
  };

  async function onImportFiles(files: FileList | null) {
    if (!files?.length) return;
    const n = await importExcalidrawFiles(Array.from(files), filter.kind === "collection" ? filter.id : null);
    if (n > 0) toast(n === 1 ? "Lavagna importata" : `${n} lavagne importate`, "success");
    else toast("Nessun file .excalidraw valido", "error");
  }

  return (
    <div
      className="shell"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onImportFiles(e.dataTransfer.files);
      }}
    >
      <Sidebar filter={filter} counts={counts} onImport={() => fileRef.current?.click()} onOpenSettings={() => setSettingsOpen(true)} />
      <input ref={fileRef} type="file" accept=".excalidraw,application/json" multiple hidden onChange={(e) => onImportFiles(e.target.files)} />

      <main className="main">
        <header className="topbar">
          <h1 className="page-title">{heading}</h1>
          <div className="search">
            <Search size={16} />
            <input ref={searchRef} placeholder="Cerca lavagne…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
            {!query && <kbd>/</kbd>}
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" size="sm" icon={<ArrowUpDown size={16} />} onClick={sortMenu.open} title="Ordina">
              {SORT_LABEL[settings.sort]}
            </Button>
            <div className="seg">
              <button className={settings.view === "grid" ? "on" : ""} onClick={() => setSettings({ view: "grid" })} aria-label="Griglia" title="Griglia">
                <LayoutGrid size={16} />
              </button>
              <button className={settings.view === "list" ? "on" : ""} onClick={() => setSettings({ view: "list" })} aria-label="Elenco" title="Elenco">
                <List size={16} />
              </button>
            </div>
            {filter.kind === "trash" ? (
              <Button variant="danger" size="md" icon={<Trash2 size={16} />} disabled={counts.trash === 0} onClick={() => setConfirmEmpty(true)}>
                Svuota cestino
              </Button>
            ) : (
              <Button variant="primary" size="md" icon={<Plus size={17} />} onClick={onNew} title="Nuova lavagna (N)">
                Nuova lavagna
              </Button>
            )}
          </div>
        </header>

        {visible.length === 0 ? (
          <EmptyState filter={filter} query={query} onNew={onNew} />
        ) : (
          <div className={`boards boards-${settings.view}`}>
            {visible.map((b) => (
              <BoardCard key={b.id} board={b} actions={actions} view={settings.view} />
            ))}
          </div>
        )}
        {filter.kind === "trash" && visible.length > 0 && <p className="trash-note">Le lavagne nel cestino vengono eliminate automaticamente dopo 30 giorni.</p>}
      </main>

      <Menu
        anchor={sortMenu.anchor}
        onClose={sortMenu.close}
        items={(Object.keys(SORT_LABEL) as SortMode[]).map((s) => ({ label: SORT_LABEL[s], checked: settings.sort === s, onSelect: () => setSettings({ sort: s }) }))}
      />

      <Prompt open={!!renaming} title="Rinomina lavagna" initial={renaming?.title ?? ""} placeholder="Titolo" onClose={() => setRenaming(null)} onSubmit={(title) => renaming && updateBoard(renaming.id, { title })} />

      <Modal open={!!moving} onClose={() => setMoving(null)} title="Sposta in raccolta" width={380}>
        <div className="pick-list">
          <button className={`pick ${moving?.collectionId == null ? "on" : ""}`} onClick={() => moving && (updateBoard(moving.id, { collectionId: null }), setMoving(null))}>
            <span className="nav-emoji">∅</span> Nessuna raccolta
          </button>
          {collections.map((c) => (
            <button key={c.id} className={`pick ${moving?.collectionId === c.id ? "on" : ""}`} onClick={() => moving && (updateBoard(moving.id, { collectionId: c.id }), setMoving(null))}>
              <span className="nav-emoji">{c.emoji}</span> {c.name}
            </button>
          ))}
          {collections.length === 0 && <p className="muted">Non hai ancora raccolte: creane una dalla barra laterale.</p>}
        </div>
      </Modal>

      {sharing && <ShareDialog board={sharing} onClose={() => setSharing(null)} />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Confirm
        open={!!confirmDelete}
        title="Eliminare definitivamente?"
        message={<>“{boardTitle(confirmDelete?.title ?? "")}” verrà cancellata per sempre. Non si può annullare.</>}
        confirmLabel="Elimina per sempre"
        danger
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteForever(confirmDelete.id)}
      />
      <Confirm
        open={confirmEmpty}
        title="Svuotare il cestino?"
        message={<>Tutte le lavagne nel cestino ({counts.trash}) verranno cancellate per sempre.</>}
        confirmLabel="Svuota"
        danger
        onClose={() => setConfirmEmpty(false)}
        onConfirm={() => emptyTrash()}
      />
    </div>
  );
}

function EmptyState({ filter, query, onNew }: { filter: HomeFilter; query: string; onNew: () => void }) {
  if (query) {
    return (
      <div className="empty">
        <Search size={28} />
        <h2>Nessun risultato per “{query}”</h2>
        <p>Prova con un'altra parola o crea una nuova lavagna.</p>
      </div>
    );
  }
  if (filter.kind === "trash")
    return (
      <div className="empty">
        <Trash2 size={28} />
        <h2>Il cestino è vuoto</h2>
        <p>Le lavagne eliminate restano qui 30 giorni prima di sparire.</p>
      </div>
    );
  if (filter.kind === "favorites")
    return (
      <div className="empty">
        <Sparkles size={28} />
        <h2>Nessuna preferita</h2>
        <p>Premi la stellina su una lavagna per ritrovarla qui.</p>
      </div>
    );
  return (
    <div className="empty empty-hero">
      <div className="empty-art" aria-hidden="true">
        <svg viewBox="0 0 320 180" fill="none">
          <rect x="18" y="22" width="284" height="140" rx="14" className="art-paper" />
          <path d="M60 120c30-60 70-70 120-50-30 10-60 30-80 70" className="art-ink" />
          <path d="M190 60c20-10 40-10 60 10s0 50-30 40" className="art-ink" strokeDasharray="6 7" />
          <rect x="60" y="48" width="56" height="26" rx="6" className="art-box" />
          <circle cx="236" cy="124" r="14" className="art-box" />
          <path d="M116 61h36m0 0-8-7m8 7-8 7" className="art-ink" />
        </svg>
      </div>
      <h2>Inizia una nuova lavagna</h2>
      <p>Appunti a mano libera, schemi, mappe mentali: tutto resta sul tuo dispositivo, senza account.</p>
      <Button variant="primary" size="lg" icon={<Plus size={18} />} onClick={onNew}>
        Crea la prima lavagna
      </Button>
      <p className="muted small">Oppure trascina qui un file .excalidraw</p>
    </div>
  );
}
