/**
 * Link condivisibili senza backend.
 *
 * La lavagna viene serializzata, compressa (deflate) e cifrata (AES-GCM) lato client.
 * Il risultato vive nel frammento dell'URL (#/s/...), che il browser non invia mai al server:
 * chi ospita l'app non può leggere il contenuto, esattamente come fa excalidraw.com.
 *
 * Formato: #/s/1.<k|p|g|gp>.<chiave-o-salt>.<dati-o-id>
 *   k  = la chiave è nel link (chi ha il link apre la lavagna), dati nel link
 *   p  = la chiave deriva da una password (PBKDF2); nel link c'è solo il salt, dati nel link
 *   g  = come k, ma i dati cifrati stanno in un gist segreto su GitHub (link breve)
 *   gp = come p, con i dati nel gist
 */
import type { BoardData } from "./types";

export interface SharePayload {
  title: string;
  data: BoardData;
  sharedAt: number;
}

export interface ShareOptions {
  password?: string;
  includeFiles?: boolean;
  /** Token GitHub con permesso gist: i dati cifrati vanno in un gist segreto e il link resta breve. */
  gistToken?: string;
}

export class SharePasswordRequired extends Error {}
export class ShareInvalid extends Error {}

const VERSION = "1";
const PBKDF2_ITERATIONS = 250_000;

/* ---------- base64url ---------- */
function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- compressione ---------- */
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await res.arrayBuffer());
}
const compress = (b: Uint8Array) => pipe(b, new CompressionStream("deflate-raw"));
const decompress = (b: Uint8Array) => pipe(b, new DecompressionStream("deflate-raw"));

/* ---------- crittografia ---------- */
async function randomKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 128 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { key, raw };
}
async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}
async function decrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.subarray(0, 12) as BufferSource;
  const ct = data.subarray(12) as BufferSource;
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

/* ---------- serializzazione ---------- */
function serialize(payload: SharePayload, includeFiles: boolean): Uint8Array {
  const { data } = payload;
  const elements = data.elements.filter((e) => !e.isDeleted);
  const usedFileIds = new Set(elements.map((e) => (e as { fileId?: string }).fileId).filter(Boolean));
  const files: BoardData["files"] = {};
  if (includeFiles) {
    for (const [id, f] of Object.entries(data.files ?? {})) if (usedFileIds.has(id)) files[id] = f;
  }
  const json = JSON.stringify({
    v: 1,
    t: payload.title,
    s: payload.sharedAt,
    e: elements,
    a: { viewBackgroundColor: data.appState.viewBackgroundColor, gridModeEnabled: data.appState.gridModeEnabled, paper: data.appState.paper },
    f: files,
  });
  return new TextEncoder().encode(json);
}

function deserialize(bytes: Uint8Array): SharePayload {
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || obj.v !== 1 || !Array.isArray(obj.e)) throw new ShareInvalid("Formato non riconosciuto");
  return {
    title: String(obj.t ?? ""),
    sharedAt: Number(obj.s ?? Date.now()),
    data: { elements: obj.e, appState: obj.a ?? {}, files: obj.f ?? {} },
  };
}

/* ---------- API ---------- */

function gistApi(): string {
  try {
    return localStorage.getItem("quaderno:gistApi") || "https://api.github.com";
  } catch {
    return "https://api.github.com";
  }
}
const GIST_FILE = "quaderno-lavagna.txt";

async function uploadToGist(cipher: string, token: string, title: string): Promise<string> {
  const res = await fetch(`${gistApi()}/gists`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ description: `Quaderno · lavagna condivisa: ${title || "senza titolo"} (contenuto cifrato)`, public: false, files: { [GIST_FILE]: { content: cipher } } }),
  });
  if (res.status === 401) throw new ShareInvalid("Token GitHub non valido: ricollega la sincronizzazione");
  if (!res.ok) throw new ShareInvalid(`GitHub ha risposto ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

async function downloadFromGist(id: string): Promise<string> {
  const res = await fetch(`${gistApi()}/gists/${id}`, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) throw new ShareInvalid("Lavagna non trovata: il gist è stato eliminato");
  if (res.status === 403) throw new ShareInvalid("Troppe richieste a GitHub da questa rete: riprova tra qualche minuto");
  if (!res.ok) throw new ShareInvalid(`GitHub ha risposto ${res.status}`);
  const g = (await res.json()) as { files: Record<string, { content?: string; truncated?: boolean; raw_url: string }> };
  const f = g.files[GIST_FILE] ?? Object.values(g.files)[0];
  if (!f) throw new ShareInvalid("Gist vuoto");
  if (!f.truncated && typeof f.content === "string") return f.content;
  const raw = await fetch(f.raw_url);
  if (!raw.ok) throw new ShareInvalid("Impossibile scaricare la lavagna");
  return raw.text();
}

/** Crea il frammento (senza "#/s/") e restituisce anche la dimensione in byte. */
export async function encodeShare(payload: SharePayload, opts: ShareOptions = {}): Promise<{ fragment: string; bytes: number; gist?: boolean }> {
  const plain = serialize(payload, !!opts.includeFiles);
  const packed = await compress(plain);
  let keyPart: string, data: string, mode: string;
  if (opts.password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(opts.password, salt);
    data = toB64url(await encrypt(key, packed));
    keyPart = toB64url(salt);
    mode = "p";
  } else {
    const { key, raw } = await randomKey();
    data = toB64url(await encrypt(key, packed));
    keyPart = toB64url(raw);
    mode = "k";
  }
  if (opts.gistToken) {
    const id = await uploadToGist(data, opts.gistToken, payload.title);
    const fragment = `${VERSION}.g${mode === "p" ? "p" : ""}.${keyPart}.${id}`;
    return { fragment, bytes: fragment.length, gist: true };
  }
  const fragment = `${VERSION}.${mode}.${keyPart}.${data}`;
  return { fragment, bytes: fragment.length };
}

export function shareNeedsPassword(fragment: string): boolean {
  const m = fragment.split(".")[1];
  return m === "p" || m === "gp";
}
export function shareIsGist(fragment: string): boolean {
  const m = fragment.split(".")[1];
  return m === "g" || m === "gp";
}

/** Decodifica un frammento. Lancia SharePasswordRequired se serve la password, ShareInvalid se corrotto o password errata. */
export async function decodeShare(fragment: string, password?: string): Promise<SharePayload> {
  const parts = fragment.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new ShareInvalid("Link non valido");
  const [, mode, keyOrSalt, dataOrId] = parts;
  const withPassword = mode === "p" || mode === "gp";
  const viaGist = mode === "g" || mode === "gp";
  if (!["k", "p", "g", "gp"].includes(mode)) throw new ShareInvalid("Link non valido");
  if (withPassword && !password) throw new SharePasswordRequired();
  const key = withPassword ? await deriveKey(password!, fromB64url(keyOrSalt)) : await importKey(fromB64url(keyOrSalt));
  const data = viaGist ? await downloadFromGist(dataOrId) : dataOrId;
  let packed: Uint8Array;
  try {
    packed = await decrypt(key, fromB64url(data.trim()));
  } catch {
    throw new ShareInvalid(withPassword ? "Password errata" : "Link danneggiato");
  }
  return deserialize(await decompress(packed));
}

/** Base pubblica dell'app per costruire link apribili da chiunque. */
/** Se l'utente incolla l'indirizzo del repository GitHub, lo trasforma nell'indirizzo del sito pubblicato (GitHub Pages). */
export function normalizePublicUrl(url: string): string {
  const m = url.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (m) return `https://${m[1].toLowerCase()}.github.io/${m[2].replace(/\.git$/, "")}/`;
  return url.trim();
}

export function publicBaseUrl(configured: string): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ?? "";
  let base = normalizePublicUrl(configured || fromEnv || "");
  if (!base) {
    // Nell'estensione Chrome l'URL non è apribile da altri: in quel caso serve la base configurata.
    if (location.protocol.startsWith("http")) base = location.origin + location.pathname;
  }
  if (base && !base.endsWith("/") && !base.endsWith(".html")) base += "/";
  return base;
}

export function isExtensionContext(): boolean {
  return location.protocol === "chrome-extension:" || location.protocol === "moz-extension:";
}
