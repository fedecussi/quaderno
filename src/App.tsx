import { Suspense, lazy, useEffect } from "react";
import { useRoute } from "./lib/router";
import { init, useStore, createBoard } from "./lib/store";
import { navigate } from "./lib/router";
import { start as startSync } from "./lib/sync";
import { useTheme } from "./lib/useTheme";
import { Dashboard } from "./components/Dashboard";
import { Toaster } from "./components/ui";
import { LogoMark } from "./components/Logo";

// L'editor (con Excalidraw) viene caricato solo quando serve: la dashboard parte subito
const Editor = lazy(() => import("./components/Editor").then((m) => ({ default: m.Editor })));
const SharedView = lazy(() => import("./components/SharedView").then((m) => ({ default: m.SharedView })));

export default function App() {
  const route = useRoute();
  const { ready } = useStore();
  const theme = useTheme();

  useEffect(() => {
    init().then(startSync);
  }, []);

  // #/new (menu File dell'app desktop): crea una lavagna e aprila
  useEffect(() => {
    if (ready && route.name === "new") createBoard().then((b) => navigate({ name: "board", id: b.id }, true));
  }, [ready, route]);

  useEffect(() => {
    document.title = route.name === "home" ? "Quaderno" : route.name === "shared" ? "Lavagna condivisa · Quaderno" : "Quaderno";
  }, [route]);

  if (!ready) {
    return (
      <div className="splash">
        <LogoMark size={44} />
      </div>
    );
  }

  return (
    <>
      {route.name === "home" && <Dashboard filter={route.filter} />}
      <Suspense fallback={<div className="splash"><LogoMark size={44} /></div>}>
        {route.name === "board" && <Editor key={route.id} id={route.id} theme={theme} />}
        {route.name === "shared" && <SharedView key={route.payload} payload={route.payload} theme={theme} />}
      </Suspense>
      <Toaster />
    </>
  );
}
