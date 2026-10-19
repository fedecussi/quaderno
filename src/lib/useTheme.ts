import { useEffect, useState } from "react";
import { resolvedTheme, useStore } from "./store";

/** Tema effettivo (light/dark), applicato a <html data-theme>. Segue il sistema se impostato. */
export function useTheme(): "light" | "dark" {
  const { settings } = useStore();
  const [theme, setTheme] = useState(() => resolvedTheme(settings.theme));
  useEffect(() => {
    const apply = () => setTheme(resolvedTheme(settings.theme));
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return theme;
}
