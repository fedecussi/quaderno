// Copia i font di Excalidraw in public/ così l'app funziona offline e dentro l'estensione.
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dest = join(root, "public/excalidraw-assets/fonts");
// Xiaolai (ideogrammi cinesi) pesa 13 MB: lo lasciamo al CDN di fallback.
const skip = new Set(["Xiaolai"]);

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of readdirSync(src)) {
  if (skip.has(dir)) continue;
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log("✓ font Excalidraw copiati in public/excalidraw-assets/fonts");
if (!existsSync(join(root, "public/icons"))) console.warn("! public/icons mancante: esegui scripts/make-icons.sh");
