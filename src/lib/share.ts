/**
 * Link condivisibili senza backend.
 *
 * La lavagna viene serializzata, compressa (deflate) e cifrata (AES-GCM) lato client.
 * Il risultato vive nel frammento dell'URL (#/s/...), che il browser non invia mai al server:
 * chi ospita l'app non può leggere il contenuto, esattamente come fa excalidraw.com.
 *
 * Formato: #/s/1.<k|p>.<chiave-o-salt>.<dati>
 *   k = la chiave è nel link (chi ha il link apre la lavagna)
 *   p = la chiave deriva da una password (PBKDF2); nel link c'è solo il salt
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

/** Crea il frammento (senza "#/s/") e restituisce anche la dimensione in byte. */
export async function encodeShare(payload: SharePayload, opts: ShareOptions = {}): Promise<{ fragment: string; bytes: number }> {
  const plain = serialize(payload, !!opts.includeFiles);
  const packed = await compress(plain);
  let fragment: string;
  if (opts.password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(opts.password, salt);
    const ct = await encrypt(key, packed);
    fragment = `${VERSION}.p.${toB64url(salt)}.${toB64url(ct)}`;
  } else {
    const { key, raw } = await randomKey();
    const ct = await encrypt(key, packed);
    fragment = `${VERSION}.k.${toB64url(raw)}.${toB64url(ct)}`;
  }
  return { fragment, bytes: fragment.length };
}

export function shareNeedsPassword(fragment: string): boolean {
  return fragment.split(".")[1] === "p";
}

/** Decodifica un frammento. Lancia SharePasswordRequired se serve la password, ShareInvalid se corrotto o password errata. */
export async function decodeShare(fragment: string, password?: string): Promise<SharePayload> {
  const parts = fragment.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new ShareInvalid("Link non valido");
  const [, mode, keyOrSalt, data] = parts;
  let key: CryptoKey;
  if (mode === "p") {
    if (!password) throw new SharePasswordRequired();
    key = await deriveKey(password, fromB64url(keyOrSalt));
  } else if (mode === "k") {
    key = await importKey(fromB64url(keyOrSalt));
  } else throw new ShareInvalid("Link non valido");
  let packed: Uint8Array;
  try {
    packed = await decrypt(key, fromB64url(data));
  } catch {
    throw new ShareInvalid(mode === "p" ? "Password errata" : "Link danneggiato");
  }
  return deserialize(await decompress(packed));
}

/** Base pubblica dell'app per costruire link apribili da chiunque. */
export function publicBaseUrl(configured: string): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ?? "";
  let base = (configured || fromEnv || "").trim();
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
