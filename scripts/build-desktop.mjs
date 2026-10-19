// Costruisce la build web per l'app desktop in dist-desktop/ (base relativa, senza service worker).
import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
execSync("node scripts/copy-assets.mjs", { cwd: root, stdio: "inherit" });
execSync("vite build", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, BASE_PATH: "./", BUILD_TARGET: "desktop", VITE_PUBLIC_APP_URL: process.env.VITE_PUBLIC_APP_URL || "https://fedecussi.github.io/quaderno/" },
});
console.log("\n✓ build desktop pronta in dist-desktop/");
