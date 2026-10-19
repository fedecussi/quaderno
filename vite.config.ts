import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH: "/" in locale, "/<nome-repo>/" su GitHub Pages, "./" per l'estensione Chrome.
const base = process.env.BASE_PATH || "/";
const isExtension = process.env.BUILD_TARGET === "extension";
const isDesktop = process.env.BUILD_TARGET === "desktop";

export default defineConfig({
  base,
  plugins: [
    react(),
    // Il service worker serve solo alla versione web (PWA installabile su Mac).
    !isExtension &&
      !isDesktop &&
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icons/*.png"],
        manifest: {
          name: "Quaderno",
          short_name: "Quaderno",
          description: "Lavagne infinite per appunti, schemi e idee. Locale, veloce, condivisibile.",
          theme_color: "#faf8f3",
          background_color: "#faf8f3",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,svg,png,ico,json}"],
          globIgnores: ["**/excalidraw-assets/**"],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes("/excalidraw-assets/"),
              handler: "CacheFirst",
              options: { cacheName: "excalidraw-assets", expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
  ].filter(Boolean),
  build: {
    outDir: isExtension ? "dist-extension" : isDesktop ? "dist-desktop" : "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 3000,
  },
  server: { port: 5180 },
});
