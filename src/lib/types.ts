import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Metadati di una lavagna (indice, sempre in memoria). */
export interface BoardMeta {
  id: string;
  title: string;
  collectionId: string | null;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  /** Timestamp di spostamento nel cestino, altrimenti null. */
  deletedAt: number | null;
  /** Miniatura (data URL webp/png) generata al salvataggio. */
  thumb?: string;
  /** Numero di elementi non cancellati, per la card. */
  elementCount: number;
  /** Colore di sfondo della lavagna, per la card. */
  background?: string;
}

/** Contenuto della lavagna (caricato solo quando serve). */
export interface BoardData {
  elements: readonly ExcalidrawElement[];
  appState: Partial<{
    viewBackgroundColor: string;
    gridModeEnabled: boolean;
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
  }>;
  files: BinaryFiles;
}

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
}

export type Theme = "light" | "dark" | "system";
export type ViewMode = "grid" | "list";
export type SortMode = "updated" | "created" | "title";

export interface Settings {
  theme: Theme;
  view: ViewMode;
  sort: SortMode;
  /** URL pubblico dell'app, usato come base per i link condivisi (utile nell'estensione). */
  publicUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  view: "grid",
  sort: "updated",
  publicUrl: "",
};
