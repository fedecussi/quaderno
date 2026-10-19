import type { BoardData } from "./types";

const W = 480;
const H = 300;

/** Genera una miniatura compatta della lavagna (data URL). Ritorna undefined se vuota. */
export async function makeThumbnail(data: BoardData, theme: "light" | "dark"): Promise<string | undefined> {
  const elements = data.elements.filter((e) => !e.isDeleted);
  if (!elements.length) return undefined;
  try {
    const { exportToCanvas } = await import("@excalidraw/excalidraw");
    const canvas = await exportToCanvas({
      elements,
      files: data.files ?? {},
      appState: {
        viewBackgroundColor: data.appState.viewBackgroundColor ?? "#ffffff",
        exportWithDarkMode: theme === "dark",
        exportBackground: true,
      },
      exportPadding: 24,
      getDimensions: (w: number, h: number) => {
        const scale = Math.min(W / w, H / h, 1.25);
        return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
      },
    });
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = data.appState.viewBackgroundColor ?? "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const dx = (W - canvas.width) / 2;
    const dy = (H - canvas.height) / 2;
    ctx.drawImage(canvas, dx, dy);
    return out.toDataURL("image/webp", 0.8);
  } catch (err) {
    console.warn("thumbnail failed", err);
    return undefined;
  }
}
