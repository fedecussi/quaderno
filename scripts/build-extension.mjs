// Costruisce l'estensione Chrome (Manifest V3) in dist-extension/.
import { execSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
execSync("node scripts/copy-assets.mjs", { cwd: root, stdio: "inherit" });
execSync("vite build", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, BASE_PATH: "./", BUILD_TARGET: "extension" },
});
const out = join(root, "dist-extension");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8"));
manifest.version = pkg.version;
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
cpSync(join(root, "extension/background.js"), join(out, "background.js"));
cpSync(join(root, "extension/icons"), join(out, "icons"), { recursive: true });
console.log("\n✓ estensione pronta in dist-extension/ — caricala da chrome://extensions → \"Carica estensione non pacchettizzata\"");
