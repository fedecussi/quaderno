import { serializeAsJSON, loadFromBlob } from "@excalidraw/excalidraw";
import type { BoardData, BoardMeta } from "./types";
import { boardTitle, slugify } from "./format";
import { createBoard } from "./store";
import { makeThumbnail } from "./thumbnail";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadExcalidrawFile(meta: BoardMeta, data: BoardData) {
  const json = serializeAsJSON(data.elements, data.appState as never, data.files ?? {}, "local");
  downloadBlob(new Blob([json], { type: "application/json" }), `${slugify(boardTitle(meta.title))}.excalidraw`);
}

/** Importa file .excalidraw come nuove lavagne. Ritorna quante ne ha create. */
export async function importExcalidrawFiles(files: File[], collectionId: string | null): Promise<number> {
  let n = 0;
  for (const f of files) {
    try {
      const scene = await loadFromBlob(f, null, null);
      const data: BoardData = {
        elements: scene.elements,
        appState: { viewBackgroundColor: scene.appState?.viewBackgroundColor, gridModeEnabled: scene.appState?.gridModeEnabled },
        files: scene.files ?? {},
      };
      const thumb = await makeThumbnail(data, "light");
      await createBoard(
        {
          title: f.name.replace(/\.excalidraw$/i, "").replace(/\.json$/i, ""),
          collectionId,
          thumb,
          elementCount: data.elements.filter((e) => !e.isDeleted).length,
          background: data.appState.viewBackgroundColor,
        },
        data,
      );
      n++;
    } catch (err) {
      console.warn("import failed", f.name, err);
    }
  }
  return n;
}
