import { createStore, get, set, del, keys } from "idb-keyval";
import { nanoid } from "nanoid";
import type { BoardData, BoardMeta, Collection, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const store = createStore("quaderno", "kv");
const K_INDEX = "boards:index";
const K_COLLECTIONS = "collections";
const K_SETTINGS = "settings";
const boardKey = (id: string) => `board:${id}`;

export const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/* ---------- Indice lavagne ---------- */

export async function loadIndex(): Promise<BoardMeta[]> {
  const idx = (await get<BoardMeta[]>(K_INDEX, store)) ?? [];
  // Svuota automaticamente il cestino dopo 30 giorni.
  const now = Date.now();
  const expired = idx.filter((b) => b.deletedAt && now - b.deletedAt > TRASH_TTL_MS);
  if (expired.length) {
    for (const b of expired) await del(boardKey(b.id), store);
    const kept = idx.filter((b) => !expired.includes(b));
    await set(K_INDEX, kept, store);
    return kept;
  }
  return idx;
}

export async function saveIndex(index: BoardMeta[]) {
  await set(K_INDEX, index, store);
}

/* ---------- Contenuto lavagne ---------- */

export async function loadBoardData(id: string): Promise<BoardData | undefined> {
  return get<BoardData>(boardKey(id), store);
}

export async function saveBoardData(id: string, data: BoardData) {
  await set(boardKey(id), data, store);
}

export async function deleteBoardData(id: string) {
  await del(boardKey(id), store);
}

export function newBoardMeta(partial: Partial<BoardMeta> = {}): BoardMeta {
  const now = Date.now();
  return {
    id: nanoid(10),
    title: "",
    collectionId: null,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    elementCount: 0,
    ...partial,
  };
}

export const EMPTY_BOARD: BoardData = { elements: [], appState: {}, files: {} };

/* ---------- Raccolte ---------- */

export async function loadCollections(): Promise<Collection[]> {
  return (await get<Collection[]>(K_COLLECTIONS, store)) ?? [];
}
export async function saveCollections(c: Collection[]) {
  await set(K_COLLECTIONS, c, store);
}
export function newCollection(name: string, emoji = "📁"): Collection {
  return { id: nanoid(8), name, emoji, createdAt: Date.now() };
}

/* ---------- Impostazioni ---------- */

export async function loadSettings(): Promise<Settings> {
  const s = (await get<Partial<Settings> & { favoriteColors?: string[] }>(K_SETTINGS, store)) ?? {};
  // Migrazione: la vecchia lista unica diventa la lista del tratto
  if (s.favoriteColors && !s.favoriteStrokeColors) s.favoriteStrokeColors = s.favoriteColors;
  delete s.favoriteColors;
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function saveSettings(s: Settings) {
  await set(K_SETTINGS, s, store);
  try {
    localStorage.setItem("quaderno:theme", s.theme);
  } catch {
    /* ignore */
  }
}

/* ---------- Utility ---------- */

export async function estimateUsage(): Promise<{ boards: number; bytes: number | null }> {
  const ks = await keys(store);
  let bytes: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    bytes = est?.usage ?? null;
  } catch {
    /* ignore */
  }
  return { boards: ks.filter((k) => String(k).startsWith("board:")).length, bytes };
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}
