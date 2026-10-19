import "./assetPath";
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import App from "./App";

// App desktop su macOS: lascia spazio ai semafori della finestra e rende trascinabili le barre
if (navigator.userAgent.includes("Electron") && /Mac/i.test(navigator.platform)) document.documentElement.classList.add("mac-desktop");

// Aggiornamenti della versione web: controllo ogni minuto e avviso con pulsante "Aggiorna"
if (import.meta.env.PROD && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    const update = registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) {
        if (reg) setInterval(() => reg.update().catch(() => {}), 60_000);
      },
      onNeedRefresh() {
        import("./components/ui").then(({ toast }) => toast("È disponibile una nuova versione di Quaderno", "info", { label: "Aggiorna", onClick: () => update(true) }));
      },
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
