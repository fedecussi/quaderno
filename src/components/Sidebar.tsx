import { useState } from "react";
import { LayoutGrid, Star, Trash2, Plus, FolderOpen, MoreHorizontal, Pencil, Settings, Sun, Moon, Monitor, Upload, Cloud, CloudOff, RefreshCw, CloudAlert } from "lucide-react";
import { relativeTime } from "../lib/format";
import { syncNow } from "../lib/sync";
import { Logo } from "./Logo";
import { Button, Menu, Prompt, Confirm, useMenu } from "./ui";
import { useStore, addCollection, updateCollection, deleteCollection, setSettings } from "../lib/store";
import type { HomeFilter } from "../lib/router";
import { hrefFor } from "../lib/router";
import type { Collection } from "../lib/types";

const EMOJIS = ["📁", "📝", "💡", "🧠", "📚", "🎯", "🛠️", "🎨", "🏠", "💼", "🔬", "✈️"];

export function Sidebar({
  filter,
  onImport,
  onOpenSettings,
  counts,
}: {
  filter: HomeFilter;
  onImport: () => void;
  onOpenSettings: () => void;
  counts: { all: number; favorites: number; trash: number; byCollection: Record<string, number> };
}) {
  const { collections, settings, sync } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const cmenu = useMenu();
  const [menuFor, setMenuFor] = useState<Collection | null>(null);
  const themeMenu = useMenu();

  const is = (k: HomeFilter["kind"], id?: string) => filter.kind === k && (k !== "collection" || (filter as { id: string }).id === id);

  const themeIcon = settings.theme === "dark" ? <Moon size={16} /> : settings.theme === "light" ? <Sun size={16} /> : <Monitor size={16} />;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <a href="#/" className="sidebar-logo">
          <Logo />
        </a>
      </div>

      <nav className="sidebar-nav">
        <a href={hrefFor({ name: "home", filter: { kind: "all" } })} className={`nav-item ${is("all") ? "active" : ""}`}>
          <LayoutGrid size={17} />
          <span>Tutte le lavagne</span>
          <em>{counts.all}</em>
        </a>
        <a href={hrefFor({ name: "home", filter: { kind: "favorites" } })} className={`nav-item ${is("favorites") ? "active" : ""}`}>
          <Star size={17} />
          <span>Preferite</span>
          {counts.favorites > 0 && <em>{counts.favorites}</em>}
        </a>

        <div className="nav-section">
          <span>Raccolte</span>
          <Button variant="ghost" size="sm" icon={<Plus size={15} />} aria-label="Nuova raccolta" title="Nuova raccolta" onClick={() => setAdding(true)} />
        </div>
        {collections.length === 0 && <p className="nav-hint">Raggruppa le lavagne per progetto o tema.</p>}
        {collections.map((c) => (
          <a
            key={c.id}
            href={hrefFor({ name: "home", filter: { kind: "collection", id: c.id } })}
            className={`nav-item nav-collection ${is("collection", c.id) ? "active" : ""}`}
            onContextMenu={(e) => {
              setMenuFor(c);
              cmenu.openAt(e.clientX, e.clientY);
              e.preventDefault();
            }}
          >
            <span className="nav-emoji">{c.emoji}</span>
            <span className="ellipsis">{c.name}</span>
            <em>{counts.byCollection[c.id] ?? 0}</em>
            <button
              className="nav-more"
              aria-label="Opzioni raccolta"
              onClick={(e) => {
                e.preventDefault();
                setMenuFor(c);
                cmenu.open(e);
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          </a>
        ))}

        <div className="nav-spacer" />
        <a href={hrefFor({ name: "home", filter: { kind: "trash" } })} className={`nav-item ${is("trash") ? "active" : ""}`}>
          <Trash2 size={17} />
          <span>Cestino</span>
          {counts.trash > 0 && <em>{counts.trash}</em>}
        </a>
      </nav>

      <div className="sidebar-foot">
        <Button variant="ghost" size="sm" icon={<Upload size={16} />} onClick={onImport} title="Importa un file .excalidraw">
          Importa
        </Button>
        <div className="grow" />
        <Button
          variant="ghost"
          size="sm"
          className={`sync-btn sync-${sync.status}`}
          icon={sync.status === "off" ? <CloudOff size={16} /> : sync.status === "syncing" ? <RefreshCw size={16} className="spin" /> : sync.status === "error" ? <CloudAlert size={16} /> : <Cloud size={16} />}
          aria-label="Sincronizzazione"
          title={
            sync.status === "off"
              ? "Sincronizzazione non attiva: configurala nelle Impostazioni"
              : sync.status === "syncing"
                ? "Sincronizzazione in corso…"
                : sync.status === "error"
                  ? `Errore: ${sync.error}`
                  : `Sincronizzato${sync.lastSyncAt ? " " + relativeTime(sync.lastSyncAt) : ""}${sync.pending ? ` · ${sync.pending} da inviare` : ""}. Clic per sincronizzare ora`
          }
          onClick={() => (sync.status === "off" ? onOpenSettings() : syncNow(true).catch(() => {}))}
        />
        <Button variant="ghost" size="sm" icon={themeIcon} aria-label="Tema" title="Tema" onClick={themeMenu.open} />
        <Button variant="ghost" size="sm" icon={<Settings size={16} />} aria-label="Impostazioni" title="Impostazioni" onClick={onOpenSettings} />
      </div>

      <Menu
        anchor={themeMenu.anchor}
        onClose={themeMenu.close}
        items={[
          { label: "Chiaro", icon: <Sun size={15} />, checked: settings.theme === "light", onSelect: () => setSettings({ theme: "light" }) },
          { label: "Scuro", icon: <Moon size={15} />, checked: settings.theme === "dark", onSelect: () => setSettings({ theme: "dark" }) },
          { label: "Come il sistema", icon: <Monitor size={15} />, checked: settings.theme === "system", onSelect: () => setSettings({ theme: "system" }) },
        ]}
      />

      <Menu
        anchor={cmenu.anchor}
        onClose={cmenu.close}
        items={[
          { label: "Rinomina", icon: <Pencil size={15} />, onSelect: () => setEditing(menuFor) },
          {
            label: "Cambia icona",
            icon: <FolderOpen size={15} />,
            onSelect: () => {
              if (!menuFor) return;
              const i = EMOJIS.indexOf(menuFor.emoji);
              updateCollection(menuFor.id, { emoji: EMOJIS[(i + 1) % EMOJIS.length] });
            },
          },
          { separator: true, label: "" },
          { label: "Elimina raccolta", icon: <Trash2 size={15} />, danger: true, onSelect: () => setDeleting(menuFor) },
        ]}
      />

      <Prompt open={adding} title="Nuova raccolta" placeholder="Es. Università, Lavoro, Idee…" confirmLabel="Crea" onClose={() => setAdding(false)} onSubmit={(name) => addCollection(name, EMOJIS[collections.length % EMOJIS.length])} />
      <Prompt open={!!editing} title="Rinomina raccolta" initial={editing?.name ?? ""} onClose={() => setEditing(null)} onSubmit={(name) => editing && updateCollection(editing.id, { name })} />
      <Confirm
        open={!!deleting}
        title="Eliminare la raccolta?"
        message={
          <>
            Le lavagne in <strong>{deleting?.name}</strong> non verranno cancellate: torneranno semplicemente tra tutte le lavagne.
          </>
        }
        confirmLabel="Elimina"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteCollection(deleting.id)}
      />
    </aside>
  );
}
