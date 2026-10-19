import "./assetPath";
import React from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles/app.css";
import App from "./App";

// App desktop su macOS: lascia spazio ai semafori della finestra e rende trascinabili le barre
if (navigator.userAgent.includes("Electron") && /Mac/i.test(navigator.platform)) document.documentElement.classList.add("mac-desktop");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
