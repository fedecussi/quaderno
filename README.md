# Quaderno

Lavagne infinite per appunti, schemi e idee. Un'app web leggera costruita sopra l'editor open source di [Excalidraw](https://github.com/excalidraw/excalidraw) (licenza MIT) con in più le funzioni "premium" che servono per prendere appunti:

- **Più lavagne** con titolo, miniatura automatica, ricerca, ordinamento, vista griglia/elenco
- **Raccolte** per raggruppare le lavagne per progetto o tema, **preferite**, **cestino** con ripristino (svuotamento automatico dopo 30 giorni)
- **Salvataggio automatico** in locale (IndexedDB): niente account, niente server
- **Sincronizzazione tra dispositivi** opzionale tramite un gist privato del tuo account GitHub: web, estensione e app desktop condividono le stesse lavagne (Impostazioni → Sincronizzazione)
- **Link condivisibili** senza backend: la lavagna viene compressa e cifrata nel browser e messa nel link stesso. Chi lo apre la vede in sola lettura e può salvarne una copia. Opzionale: **protezione con password**
- **Fogli** bianchi, a righe, a quadretti (tre misure) o puntinati, con intensità regolabile, che seguono zoom e scorrimento
- **Colori preferiti** dentro le sezioni Tratto e Sfondo del pannello: scegli qualsiasi colore con il selettore di sistema (“+”), salvalo con “salva” e applicalo con un clic
- **Magnete per linee e frecce**: i punti scattano su vertici, metà lato e centro delle figure vicine; un punto agganciato a un vertice o a una metà lato resta lì anche quando la figura viene spostata, ridimensionata o ruotata (Ctrl/Cmd disattiva il magnete al volo; nelle Impostazioni puoi sbloccare il punto iniziale, quello finale o entrambi)
- **Esportazione PDF** a 1×, 2×, 3× o 4× (96–384 dpi), pagina su misura, A4 o A3, con o senza sfondo e foglio
- **Tema chiaro** di default, scuro o di sistema a scelta; interfaccia in italiano
- **Import/export** di file `.excalidraw`, esportazione PNG/SVG dal menu dell'editor
- **PWA installabile** su Mac (Chrome: "Installa app"; Safari: "Aggiungi al Dock") e **estensione Chrome** (Manifest V3)

## Avvio in locale

```bash
npm install
npm run dev        # http://localhost:5180
```

Lo script copia automaticamente i font di Excalidraw in `public/excalidraw-assets/` così l'app funziona anche offline.

## Pubblicare su GitHub Pages (per i link condivisibili)

1. Crea il repo su GitHub (vedi sotto per il nome) e fai il push di questa cartella come root del repo.
2. In **Settings → Pages** scegli *Source: GitHub Actions*.
3. Il workflow `.github/workflows/deploy.yml` pubblica ad ogni push su `main`. L'app sarà su `https://<utente>.github.io/<repo>/`.

Il workflow imposta da solo `BASE_PATH` e `VITE_PUBLIC_APP_URL` a partire dal nome del repo, quindi i link generati puntano già al sito pubblico.

Vuoi un dominio o un host diverso (Vercel, Netlify, Cloudflare Pages)? È un sito statico: `npm run build` e pubblica `dist/`. Imposta `VITE_PUBLIC_APP_URL` all'URL pubblico (oppure inseriscilo dopo nelle Impostazioni dell'app).

## Estensione Chrome

```bash
npm run build:ext
```

Poi in `chrome://extensions` attiva *Modalità sviluppatore* → *Carica estensione non pacchettizzata* → scegli la cartella `dist-extension/`. L'icona nella barra apre Quaderno in una scheda; le lavagne restano nel profilo Chrome.

Dentro l'estensione i link condivisi devono puntare alla versione pubblicata: inserisci l'URL di GitHub Pages in **Impostazioni → URL pubblico dell'app** (una volta sola).

## App desktop (macOS)

L'app nativa è un contenitore Electron della stessa build web, con menu macOS, finestra che ricorda dimensione e posizione, download tramite finestra di salvataggio di sistema e link esterni aperti nel browser.

- **Scaricarla**: dalle [Release](https://github.com/fedecussi/quaderno/releases). Per pubblicarne una nuova: *Actions → App desktop (macOS) → Run workflow* indicando la versione (es. `0.2.0`): il workflow costruisce `.dmg` e `.zip` per Apple Silicon e Intel più lo zip dell'estensione Chrome, crea il tag e la release. Funziona anche spingendo un tag `v*`.
- **Primo avvio**: l'app non è firmata con un certificato Apple, quindi macOS la blocca una volta. Apri *Impostazioni di Sistema → Privacy e sicurezza* e premi *Apri comunque*, oppure da Terminale: `xattr -cr /Applications/Quaderno.app`.
- **In locale**: `npm run desktop` avvia l'app in sviluppo; `npm run dist:mac` crea i pacchetti in `release/` (serve un Mac).

Le lavagne dell'app desktop stanno nel suo profilo (`~/Library/Application Support/Quaderno`), separate da quelle del browser.

In alternativa, senza installare nulla: apri l'URL pubblicato in Chrome e usa *Installa Quaderno* dalla barra degli indirizzi (PWA), che funziona anche offline.

## Sincronizzazione tra dispositivi

Non c'è un server di Quaderno: le lavagne vengono salvate in un gist *privato* del tuo account GitHub (`quaderno-index.json` con i metadati, un file per lavagna). Serve un [token personale](https://github.com/settings/tokens/new?scopes=gist&description=Quaderno%20sync) con il solo permesso `gist`, da incollare in *Impostazioni → Sincronizzazione* su ogni dispositivo. Il token resta sul dispositivo.

Si sincronizza all'avvio, quando la finestra torna in primo piano, ogni 5 minuti e pochi secondi dopo ogni modifica. Vince la modifica più recente; se una lavagna è stata modificata su due dispositivi senza sincronizzare, la versione locale viene conservata come "(copia locale)". Le eliminazioni definitive si propagano.

## Importare un board da Miro

Miro esporta solo immagini e PDF, quindi si passa dalle sue API. Serve un token: su [developer.miro.com](https://developers.miro.com/) → *Your apps* → *Create new app*, permesso `boards:read`, poi *Install app and get OAuth token* nel team del board. L'id del board è nella URL (`https://miro.com/app/board/uXjVK1234=/` → `uXjVK1234=`).

```bash
MIRO_TOKEN=il_tuo_token node scripts/import-miro.mjs "https://miro.com/app/board/uXjVK1234=/"
# opzioni: --out nome.excalidraw · --font clean (testo pulito invece di scritto a mano) · --no-images
```

Il file `.excalidraw` prodotto si trascina in Quaderno (o *Importa* nella barra laterale). Vengono convertiti forme (rettangoli, arrotondati, cerchi, rombi; le altre diventano rettangoli), sticky note, testi, connettori con etichette (ancorati ai punti scelti in Miro), frame e immagini. Non vengono convertiti elementi senza equivalente (mindmap, tabelle, kanban, documenti incorporati).

## Come funzionano i link condivisi

Il link ha la forma `https://…/#/s/1.k.<chiave>.<dati>`. La parte dopo `#` non viene mai inviata al server: contiene la lavagna serializzata, compressa (deflate) e cifrata (AES-GCM 128). Con la password, la chiave viene derivata con PBKDF2 (250 000 iterazioni) e nel link c'è solo il salt.

Limiti: il link è una "fotografia" della lavagna (le modifiche successive non si propagano) e la sua lunghezza cresce con il contenuto. Una lavagna di appunti tipica produce link di pochi KB; sopra i 60 KB l'app avvisa, perché alcune app di messaggistica troncano gli URL lunghi.

**Link breve.** Con la sincronizzazione GitHub collegata, l'opzione "Link breve" carica la lavagna cifrata in un gist segreto del tuo account e il link resta di poche decine di caratteri (`#/s/1.g.<chiave>.<id-gist>`). La chiave resta solo nel link: GitHub conserva dati illeggibili. Chi apre il link non ha bisogno di account. Per revocare un link basta eliminare il gist.

## Note

Il foglio (righe, quadretti, puntini) è disegnato sotto la tela e fuso con essa: compare nell'editor, nei link condivisi e nei PDF, non nelle immagini PNG/SVG esportate dal menu di Excalidraw.

## Struttura

```
src/
  lib/        storage (IndexedDB), store, router, cifratura link, miniature, import/export
  components/ Dashboard, Sidebar, BoardCard, Editor, SharedView, ShareDialog, SettingsDialog, ui
  styles/     design tokens + tema chiaro/scuro
extension/    manifest MV3 + service worker
scripts/      copia asset, generazione icone, build estensione
.github/      deploy su GitHub Pages
```

## Script

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | sviluppo locale |
| `npm run build` | build web in `dist/` (PWA inclusa) |
| `npm run build:ext` | build estensione Chrome in `dist-extension/` |
| `npm run desktop` | app desktop in sviluppo (Electron) |
| `npm run dist:mac` | pacchetti macOS `.dmg`/`.zip` in `release/` |
| `npm run typecheck` | controllo TypeScript |
| `npm run icons` | rigenera le icone PNG da `public/favicon.svg` (`CHROMIUM_PATH` opzionale) |
