import { Star, MoreHorizontal, Pencil, Copy, FolderInput, Share2, Trash2, RotateCcw, Download } from "lucide-react";
import type { BoardMeta } from "../lib/types";
import { relativeTime, boardTitle } from "../lib/format";
import { hrefFor } from "../lib/router";
import { useStore } from "../lib/store";
import { Menu, useMenu, type MenuItem } from "./ui";

export interface BoardActions {
  rename: (b: BoardMeta) => void;
  duplicate: (b: BoardMeta) => void;
  move: (b: BoardMeta) => void;
  share: (b: BoardMeta) => void;
  exportFile: (b: BoardMeta) => void;
  trash: (b: BoardMeta) => void;
  restore: (b: BoardMeta) => void;
  deleteForever: (b: BoardMeta) => void;
  toggleFavorite: (b: BoardMeta) => void;
}

export function boardMenuItems(b: BoardMeta, a: BoardActions): MenuItem[] {
  if (b.deletedAt) {
    return [
      { label: "Ripristina", icon: <RotateCcw size={15} />, onSelect: () => a.restore(b) },
      { separator: true, label: "" },
      { label: "Elimina definitivamente", icon: <Trash2 size={15} />, danger: true, onSelect: () => a.deleteForever(b) },
    ];
  }
  return [
    { label: "Rinomina", icon: <Pencil size={15} />, onSelect: () => a.rename(b) },
    { label: b.favorite ? "Togli dalle preferite" : "Aggiungi alle preferite", icon: <Star size={15} />, onSelect: () => a.toggleFavorite(b) },
    { label: "Duplica", icon: <Copy size={15} />, onSelect: () => a.duplicate(b) },
    { label: "Sposta in raccolta…", icon: <FolderInput size={15} />, onSelect: () => a.move(b) },
    { separator: true, label: "" },
    { label: "Condividi link…", icon: <Share2 size={15} />, onSelect: () => a.share(b) },
    { label: "Esporta .excalidraw", icon: <Download size={15} />, onSelect: () => a.exportFile(b) },
    { separator: true, label: "" },
    { label: "Sposta nel cestino", icon: <Trash2 size={15} />, danger: true, onSelect: () => a.trash(b) },
  ];
}

export function BoardCard({ board, actions, view }: { board: BoardMeta; actions: BoardActions; view: "grid" | "list" }) {
  const menu = useMenu();
  const { collections } = useStore();
  const collection = collections.find((c) => c.id === board.collectionId);
  const href = board.deletedAt ? undefined : hrefFor({ name: "board", id: board.id });
  const Tag = board.deletedAt ? "div" : "a";

  return (
    <>
      <Tag
        href={href}
        className={`card card-${view} ${board.deletedAt ? "card-trashed" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          menu.openAt(e.clientX, e.clientY);
        }}
      >
        <div className="card-thumb" style={{ background: board.background || undefined }}>
          {board.thumb ? <img src={board.thumb} alt="" loading="lazy" draggable={false} /> : <div className="card-empty">Lavagna vuota</div>}
          {!board.deletedAt && (
            <button
              className={`card-star ${board.favorite ? "on" : ""}`}
              aria-label={board.favorite ? "Togli dalle preferite" : "Aggiungi alle preferite"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                actions.toggleFavorite(board);
              }}
            >
              <Star size={15} fill={board.favorite ? "currentColor" : "none"} />
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="card-title ellipsis" title={boardTitle(board.title)}>
            {boardTitle(board.title)}
          </div>
          <div className="card-meta">
            {collection && (
              <span className="chip">
                {collection.emoji} {collection.name}
              </span>
            )}
            <span>{board.deletedAt ? `nel cestino ${relativeTime(board.deletedAt)}` : relativeTime(board.updatedAt)}</span>
            {view === "list" && <span className="muted">· {board.elementCount} elementi</span>}
          </div>
        </div>
        <button className="card-more" aria-label="Opzioni" onClick={menu.open}>
          <MoreHorizontal size={16} />
        </button>
      </Tag>
      <Menu anchor={menu.anchor} onClose={menu.close} items={boardMenuItems(board, actions)} />
    </>
  );
}
