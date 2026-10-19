// Deve essere importato prima di @excalidraw/excalidraw: font e asset serviti in locale.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}
const assetBase = new URL(`${import.meta.env.BASE_URL}excalidraw-assets/`, location.href).href;
window.EXCALIDRAW_ASSET_PATH = assetBase;

// Il wordmark "Quaderno" usa il font a mano libera di Excalidraw (subset latino).
try {
  const face = new FontFace("Quaderno Hand", `url(${assetBase}fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2)`, { display: "swap" });
  document.fonts.add(face);
  face.load().catch(() => {});
} catch {
  /* font opzionale */
}
export {};
