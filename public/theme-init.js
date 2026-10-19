// Applica il tema salvato prima del primo render (evita il flash chiaro/scuro).
// File separato perché l'estensione Chrome vieta gli script inline.
try {
  var t = localStorage.getItem("quaderno:theme");
  if (t === "system") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  if (!t) t = "light";
  document.documentElement.dataset.theme = t;
} catch (e) {}
