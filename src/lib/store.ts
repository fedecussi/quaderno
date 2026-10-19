import { useSyncExternalStore } from "react";
import type { BoardData, BoardMeta, Collection, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import * as db from "./db";

interface State {
  ready: boolean;
  boards: BoardMeta[];
  collections: Collection[];
  settings: Settings;
}

let state: State = { ready: false, boards: [], collections: [], settings: DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export async function init() {
  if (state.ready) return;
  const [boards, collections, settings] = await Promise.all([db.loadIndex(), db.loadCollections(), db.loadSettings()]);
  setState({ ready: true, boards, collections, settings });
  db.requestPersistence();
}

/* ---------- Boards ---------- */

async function persistBoards(boards: BoardMeta[]) {
  setState({ boards });
  await db.saveIndex(boards);
}

export async function createBoard(partial: Partial<BoardMeta> = {}, data: BoardData = db.EMPTY_BOARD): Promise<BoardMeta> {
  const meta = db.newBoardMeta(partial);
  await db.saveBoardData(meta.id, data);
  await persistBoards([meta, ...state.boards]);
  return meta;
}

export async function updateBoard(id: string, patch: Partial<BoardMeta>) {
  await persistBoards(state.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)));
}

export async function touchBoard(id: string, patch: Partial<BoardMeta>) {
  await updateBoard(id, { ...patch, updatedAt: Date.now() });
}

export async function trashBoard(id: string) {
  await updateBoard(id, { deletedAt: Date.now() });
}
export async function restoreBoard(id: string) {
  await updateBoard(id, { deletedAt: null });
}
export async function deleteForever(id: string) {
  await db.deleteBoardData(id);
  await persistBoards(state.boards.filter((b) => b.id !== id));
}
export async function emptyTrash() {
  const trashed = state.boards.filter((b) => b.deletedAt);
  for (const b of trashed) await db.deleteBoardData(b.id);
  await persistBoards(state.boards.filter((b) => !b.deletedAt));
}

export async function duplicateBoard(id: string): Promise<BoardMeta | undefined> {
  const src = state.boards.find((b) => b.id === id);
  if (!src) return;
  const data = (await db.loadBoardData(id)) ?? db.EMPTY_BOARD;
  const copy = db.newBoardMeta({
    title: src.title ? `${src.title} (copia)` : "",
    collectionId: src.collectionId,
    thumb: src.thumb,
    elementCount: src.elementCount,
    background: src.background,
  });
  await db.saveBoardData(copy.id, data);
  await persistBoards([copy, ...state.boards]);
  return copy;
}

/* ---------- Collections ---------- */

async function persistCollections(collections: Collection[]) {
  setState({ collections });
  await db.saveCollections(collections);
}

export async function addCollection(name: string, emoji?: string): Promise<Collection> {
  const c = db.newCollection(name, emoji);
  await persistCollections([...state.collections, c]);
  return c;
}
export async function updateCollection(id: string, patch: Partial<Collection>) {
  await persistCollections(state.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}
export async function deleteCollection(id: string) {
  await persistCollections(state.collections.filter((c) => c.id !== id));
  await persistBoards(state.boards.map((b) => (b.collectionId === id ? { ...b, collectionId: null } : b)));
}

/* ---------- Settings ---------- */

export async function setSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  await db.saveSettings(settings);
}

export function resolvedTheme(theme: Settings["theme"]): "light" | "dark" {
  if (theme === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return theme;
}
