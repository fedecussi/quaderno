/**
 * Sincronizzazione tra dispositivi tramite un Gist privato dell'account GitHub dell'utente.
 *
 * Nel gist: `quaderno-index.json` (metadati lavagne, raccolte, lapidi, colori preferiti)
 * e un file `board-<id>.json` per il contenuto di ogni lavagna. Nessun server nostro:
 * serve solo un token personale con il permesso "gist".
 *
 * Regole di fusione: vince la versione modificata più di recente (updatedAt); se una
 * lavagna è cambiata sia qui sia altrove, la versione locale viene conservata come copia.
 */
import * as db from "./db";
import { applyRemoteIndex, getState, setSettings, setSyncState } from "./store";
import type { BoardData, BoardMeta, Collection, Tombstone } from "./types";
import { boardTitle } from "./format";

const GIST_DESC = "Quaderno · sincronizzazione lavagne (non modificare a mano)";
const INDEX_FILE = "quaderno-index.json";
const boardFile = (id: string) => `board-${id}.json`;
const PULL_MIN_INTERVAL = 4_000;
const PUSH_DEBOUNCE = 2_500;
const PERIODIC = 5 * 60_000;

interface RemoteIndex {
  v: 1;
  boards: BoardMeta[];
  collections: Collection[];
  tombstones: Tombstone[];
  prefs?: { favoriteStrokeColors?: string[]; favoriteBackgroundColors?: string[] };
  updatedAt: number;
}
interface GistFile {
  filename: string;
  size: number;
  truncated?: boolean;
  content?: string;
  raw_url: string;
}
interface Gist {
  id: string;
  description: string;
  updated_at: string;
  files: Record<string, GistFile>;
  history?: { version: string }[];
}

export class SyncError extends Error {}

const dirtyBoards = new Set<string>();
let indexDirty = false;
let applying = false;
let pushTimer: number | undefined;
let lastPullAt = 0;
let running: Promise<void> | null = null;
let started = false;

/* ---------- API GitHub ---------- */

function apiBase(): string {
  try {
    return localStorage.getItem("quaderno:gistApi") || "https://api.github.com";
  } catch {
    return "https://api.github.com";
  }
}

async function gh<T>(path: string, init: RequestInit = {}, token = getState().settings.syncToken): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) throw new SyncError("Token non valido o scaduto");
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") throw new SyncError("Limite di richieste GitHub raggiunto: riprova tra poco");
  if (res.status === 404) throw new SyncError("Gist non trovato: ricollega la sincronizzazione");
  if (!res.ok) throw new SyncError(`GitHub ha risposto ${res.status}`);
  return (await res.json()) as T;
}

async function fileContent(f: GistFile): Promise<string> {
  if (!f.truncated && typeof f.content === "string") return f.content;
  const res = await fetch(f.raw_url);
  if (!res.ok) throw new SyncError(`Impossibile scaricare ${f.filename}`);
  return res.text();
}

/* ---------- Collegamento ---------- */

export function isConnected(): boolean {
  const s = getState().settings;
  return !!s.syncToken && !!s.syncGistId;
}

/** Verifica il token, trova (o crea) il gist di Quaderno e avvia la sincronizzazione. */
export async function connect(token: string): Promise<{ login: string; gistId: string; created: boolean }> {
  token = token.trim();
  const user = await gh<{ login: string }>("/user", {}, token);
  let gistId = "";
  let created = false;
  for (let page = 1; page <= 5 && !gistId; page++) {
    const list = await gh<Gist[]>(`/gists?per_page=100&page=${page}`, {}, token);
    const found = list.find((g) => g.description === GIST_DESC);
    if (found) gistId = found.id;
    if (list.length < 100) break;
  }
  if (!gistId) {
    const g = await gh<Gist>("/gists", { method: "POST", body: JSON.stringify({ description: GIST_DESC, public: false, files: { [INDEX_FILE]: { content: JSON.stringify(emptyIndex()) } } }) }, token);
    gistId = g.id;
    created = true;
  }
  await setSettings({ syncToken: token, syncGistId: gistId, syncLogin: user.login, syncLastVersion: "" });
  // Al primo collegamento tutto il locale va inviato
  for (const b of getState().boards) dirtyBoards.add(b.id);
  indexDirty = true;
  setSyncState({ status: "idle", error: null, pending: dirtyBoards.size });
  start();
  await syncNow();
  return { login: user.login, gistId, created };
}

export async function disconnect() {
  window.clearTimeout(pushTimer);
  dirtyBoards.clear();
  indexDirty = false;
  await setSettings({ syncToken: "", syncGistId: "", syncLogin: "", syncLastVersion: "" });
  setSyncState({ status: "off", error: null, pending: 0, lastSyncAt: null });
}

/* ---------- Avvio e trigger ---------- */

export function start() {
  if (started) return;
  started = true;
  db.dbEvents.addEventListener("board", (e) => {
    if (applying) return;
    dirtyBoards.add((e as CustomEvent<{ id: string }>).detail.id);
    schedulePush();
  });
  db.dbEvents.addEventListener("index", () => {
    if (applying) return;
    indexDirty = true;
    schedulePush();
  });
  const onVisible = () => {
    if (document.visibilityState === "visible") syncNow().catch(() => {});
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", () => syncNow().catch(() => {}));
  window.setInterval(() => document.visibilityState === "visible" && syncNow().catch(() => {}), PERIODIC);
  if (isConnected()) {
    setSyncState({ status: "idle" });
    syncNow().catch(() => {});
  }
}

function schedulePush() {
  if (!isConnected()) return;
  setSyncState({ pending: dirtyBoards.size + (indexDirty ? 1 : 0) });
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => syncNow(true).catch(() => {}), PUSH_DEBOUNCE);
}

/** Scarica le novità (se ce ne sono) e invia le modifiche locali. */
export function syncNow(force = false): Promise<void> {
  if (!isConnected()) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    setSyncState({ status: "syncing", error: null });
    try {
      const hasLocal = dirtyBoards.size > 0 || indexDirty;
      if (force || hasLocal || Date.now() - lastPullAt > PULL_MIN_INTERVAL) {
        await pull();
        lastPullAt = Date.now();
      }
      if (dirtyBoards.size > 0 || indexDirty) await push();
      setSyncState({ status: "idle", lastSyncAt: Date.now(), error: null, pending: 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncState({ status: "error", error: navigator.onLine ? msg : "Sei offline: sincronizzo appena torna la rete" });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

/* ---------- Pull ---------- */

function emptyIndex(): RemoteIndex {
  return { v: 1, boards: [], collections: [], tombstones: [], updatedAt: 0 };
}

async function pull() {
  const { settings } = getState();
  const commits = await gh<{ version: string }[]>(`/gists/${settings.syncGistId}/commits?per_page=1`);
  const version = commits[0]?.version ?? "";
  if (version && version === settings.syncLastVersion) return;

  const gist = await gh<Gist>(`/gists/${settings.syncGistId}`);
  const idxFile = gist.files[INDEX_FILE];
  const remote: RemoteIndex = idxFile ? { ...emptyIndex(), ...(JSON.parse(await fileContent(idxFile)) as RemoteIndex) } : emptyIndex();

  const st = getState();
  const localById = new Map(st.boards.map((b) => [b.id, b]));
  const remoteById = new Map(remote.boards.map((b) => [b.id, b]));
  const tombstones = mergeTombstones(st.tombstones, remote.tombstones);
  const dead = new Map(tombstones.map((t) => [t.id, t.at]));

  const nextBoards: BoardMeta[] = [];
  const changedBoards: string[] = [];
  applying = true;
  try {
    // Lavagne remote: nuove o più recenti
    for (const rb of remote.boards) {
      const deadAt = dead.get(rb.id);
      if (deadAt && deadAt >= rb.updatedAt) continue;
      const lb = localById.get(rb.id);
      const file = gist.files[boardFile(rb.id)];
      if (!lb) {
        if (!file) continue; // contenuto non ancora arrivato: al prossimo giro
        await db.saveBoardData(rb.id, JSON.parse(await fileContent(file)) as BoardData);
        nextBoards.push(rb);
        changedBoards.push(rb.id);
      } else if (rb.updatedAt > lb.updatedAt) {
        if (dirtyBoards.has(lb.id)) {
          // Modificata su entrambi: la versione locale sopravvive come copia
          const data = await db.loadBoardData(lb.id);
          if (data) {
            const { id: _old, ...rest } = lb;
            void _old;
            const copy = db.newBoardMeta({ ...rest, title: `${boardTitle(lb.title)} (copia locale)`, updatedAt: Date.now() });
            await db.saveBoardData(copy.id, data);
            nextBoards.push(copy);
            dirtyBoards.add(copy.id);
          }
          dirtyBoards.delete(lb.id);
        }
        if (file) {
          await db.saveBoardData(rb.id, JSON.parse(await fileContent(file)) as BoardData);
          changedBoards.push(rb.id);
        }
        nextBoards.push(rb);
      } else {
        nextBoards.push(lb);
        if (lb.updatedAt > rb.updatedAt) dirtyBoards.add(lb.id);
      }
    }
    // Lavagne solo locali: eliminate altrove o da inviare
    for (const lb of st.boards) {
      if (remoteById.has(lb.id)) continue;
      const deadAt = dead.get(lb.id);
      if (deadAt && deadAt >= lb.updatedAt) {
        await db.deleteBoardData(lb.id);
        continue;
      }
      nextBoards.push(lb);
      dirtyBoards.add(lb.id);
    }

    // Raccolte: unione per id, vince la più recente (createdAt come età)
    const collections = [...st.collections];
    for (const rc of remote.collections) {
      const i = collections.findIndex((c) => c.id === rc.id);
      if (i < 0) collections.push(rc);
      else if (JSON.stringify(collections[i]) !== JSON.stringify(rc) && remote.updatedAt > (st.sync.lastSyncAt ?? 0)) collections[i] = rc;
    }
    if (collections.length !== st.collections.length) indexDirty = true;

    const prefs = remote.prefs
      ? {
          favoriteStrokeColors: union(st.settings.favoriteStrokeColors, remote.prefs.favoriteStrokeColors),
          favoriteBackgroundColors: union(st.settings.favoriteBackgroundColors, remote.prefs.favoriteBackgroundColors),
        }
      : undefined;

    nextBoards.sort((a, b) => b.updatedAt - a.updatedAt);
    await applyRemoteIndex({ boards: nextBoards, collections, tombstones, settings: { ...(prefs ?? {}), syncLastVersion: version } });
  } finally {
    applying = false;
  }
  for (const id of changedBoards) window.dispatchEvent(new CustomEvent("quaderno:remote-board", { detail: { id } }));
}

function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const m = new Map<string, number>();
  for (const t of [...a, ...b]) m.set(t.id, Math.max(m.get(t.id) ?? 0, t.at));
  return [...m].map(([id, at]) => ({ id, at }));
}
const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

/* ---------- Push ---------- */

async function push() {
  const st = getState();
  const files: Record<string, { content: string } | null> = {};
  const ids = [...dirtyBoards];
  const alive = new Set(st.boards.map((b) => b.id));
  for (const id of ids) {
    if (!alive.has(id)) {
      files[boardFile(id)] = null;
      continue;
    }
    const data = await db.loadBoardData(id);
    if (data) files[boardFile(id)] = { content: JSON.stringify(data) };
  }
  const index: RemoteIndex = {
    v: 1,
    boards: st.boards,
    collections: st.collections,
    tombstones: st.tombstones,
    prefs: { favoriteStrokeColors: st.settings.favoriteStrokeColors, favoriteBackgroundColors: st.settings.favoriteBackgroundColors },
    updatedAt: Date.now(),
  };
  files[INDEX_FILE] = { content: JSON.stringify(index) };
  const res = await gh<Gist>(`/gists/${st.settings.syncGistId}`, { method: "PATCH", body: JSON.stringify({ files }) });
  for (const id of ids) dirtyBoards.delete(id);
  indexDirty = false;
  const version = res.history?.[0]?.version ?? "";
  applying = true;
  try {
    await setSettings({ syncLastVersion: version });
  } finally {
    applying = false;
  }
}
