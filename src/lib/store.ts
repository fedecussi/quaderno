import { useSyncExternalStore } from "react";
import type { BoardData, BoardMeta, Collection, Settings, Tombstone } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import * as db from "./db";

export type SyncStatus = "off" | "idle" | "syncing" | "error";
export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
  pending: number;
}

interface State {
  ready: boolean;
  boards: BoardMeta[];
  collections: Collection[];
  settings: Settings;
  tombstones: Tombstone[];
  sync: SyncState;
}

let state: State = { ready: false, boards: [], collections: [], settings: DEFAULT_SETTINGS, tombstones: [], sync: { status: "off", lastSyncAt: null, error: null, pending: 0 } };
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
  const [boards, collections, settings, tombstones] = await Promise.all([db.loadIndex(), db.loadCollections(), db.loadSettings(), db.loadTombstones()]);
  setState({ ready: true, boards, collections, settings, tombstones });
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

/** Ogni modifica ai metadati aggiorna updatedAt: è il criterio con cui la sincronizzazione sceglie la versione più recente. */
export async function updateBoard(id: string, patch: Partial<BoardMeta>) {
  await persistBoards(state.boards.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)));
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
async function addTombstones(ids: string[]) {
  const now = Date.now();
  const tombstones = [...state.tombstones.filter((t) => !ids.includes(t.id)), ...ids.map((id) => ({ id, at: now }))];
  setState({ tombstones });
  await db.saveTombstones(tombstones);
}
export async function deleteForever(id: string) {
  await addTombstones([id]);
  await db.deleteBoardData(id);
  await persistBoards(state.boards.filter((b) => b.id !== id));
}
export async function emptyTrash() {
  const trashed = state.boards.filter((b) => b.deletedAt);
  await addTombstones(trashed.map((b) => b.id));
  for (const b of trashed) await db.deleteBoardData(b.id);
  await persistBoards(state.boards.filter((b) => !b.deletedAt));
}

/* ---------- Usato dalla sincronizzazione ---------- */

export function getState(): State {
  return state;
}
export function setSyncState(patch: Partial<SyncState>) {
  setState({ sync: { ...state.sync, ...patch } });
}
/** Applica l'indice ricevuto dal cloud (già fuso con quello locale). */
export async function applyRemoteIndex(next: { boards: BoardMeta[]; collections: Collection[]; tombstones: Tombstone[]; settings?: Partial<Settings> }) {
  const settings = next.settings ? { ...state.settings, ...next.settings } : state.settings;
  setState({ boards: next.boards, collections: next.collections, tombstones: next.tombstones, settings });
  await db.saveIndex(next.boards);
  await db.saveCollections(next.collections);
  await db.saveTombstones(next.tombstones);
  if (next.settings) await db.saveSettings(settings);
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
