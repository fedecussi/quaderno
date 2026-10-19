import { useEffect } from "react";
import { useRoute } from "./lib/router";
import { init, useStore, createBoard } from "./lib/store";
import { navigate } from "./lib/router";
import { useTheme } from "./lib/useTheme";
import { Dashboard } from "./components/Dashboard";
import { Editor } from "./components/Editor";
import { SharedView } from "./components/SharedView";
import { Toaster } from "./components/ui";
import { LogoMark } from "./components/Logo";

export default function App() {
  const route = useRoute();
  const { ready } = useStore();
  const theme = useTheme();

  useEffect(() => {
    init();
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
      {route.name === "board" && <Editor key={route.id} id={route.id} theme={theme} />}
      {route.name === "shared" && <SharedView key={route.payload} payload={route.payload} theme={theme} />}
      <Toaster />
    </>
  );
}
