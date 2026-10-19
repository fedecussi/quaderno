import { useEffect, useState } from "react";
import { Database, Globe, Magnet, Cloud, ExternalLink } from "lucide-react";
import { connect, disconnect, syncNow, SyncError } from "../lib/sync";
import { relativeTime } from "../lib/format";
import { Button, Modal, toast } from "./ui";
import { setSettings, useStore } from "../lib/store";
import { estimateUsage } from "../lib/db";
import { formatBytes } from "../lib/format";
import { isExtensionContext, publicBaseUrl } from "../lib/share";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, sync, boards } = useStore();
  const [url, setUrl] = useState(settings.publicUrl);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = !!settings.syncGistId && !!settings.syncToken;

  async function doConnect() {
    setBusy(true);
    try {
      const r = await connect(token);
      toast(r.created ? `Collegato a GitHub come ${r.login}: creato il gist di sincronizzazione` : `Collegato a GitHub come ${r.login}: trovate le lavagne già sincronizzate`, "success");
      setToken("");
    } catch (e) {
      toast(e instanceof SyncError ? e.message : "Collegamento fallito: controlla il token", "error");
    } finally {
      setBusy(false);
    }
  }
  const [usage, setUsage] = useState<{ boards: number; bytes: number | null } | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(settings.publicUrl);
      estimateUsage().then(setUsage);
    }
  }, [open, settings.publicUrl]);

  const effective = publicBaseUrl(url);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Impostazioni"
      width={500}
      footer={
        <>
          <Button onClick={onClose}>Chiudi</Button>
          <Button
            variant="primary"
            onClick={() => {
              setSettings({ publicUrl: url.trim() });
              onClose();
            }}
          >
            Salva
          </Button>
        </>
      }
    >
      <section className="settings-section">
        <h3>
          <Cloud size={16} /> Sincronizzazione tra dispositivi
        </h3>
        {connected ? (
          <>
            <p className="muted small">
              Collegato come <strong>{settings.syncLogin}</strong>. Le lavagne ({boards.length}) vengono salvate in un gist privato del tuo account GitHub e si aggiornano su web, estensione e app desktop.
            </p>
            <p className="small">
              Stato:{" "}
              {sync.status === "syncing" ? "sincronizzazione in corso…" : sync.status === "error" ? <span className="error-text">{sync.error}</span> : sync.lastSyncAt ? `sincronizzato ${relativeTime(sync.lastSyncAt)}` : "in attesa"}
              {sync.pending > 0 && ` · ${sync.pending} da inviare`}
            </p>
            <div className="row-actions">
              <Button size="sm" onClick={() => syncNow(true).then(() => toast("Sincronizzato", "success")).catch(() => {})} disabled={sync.status === "syncing"}>
                Sincronizza ora
              </Button>
              <a className="link-inline small" href={`https://gist.github.com/${settings.syncLogin}/${settings.syncGistId}`} target="_blank" rel="noreferrer">
                Apri il gist <ExternalLink size={12} />
              </a>
              <div className="grow" />
              <Button size="sm" variant="danger" onClick={() => disconnect().then(() => toast("Sincronizzazione scollegata"))}>
                Scollega
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              Senza server: le lavagne vengono salvate in un gist <em>privato</em> del tuo account GitHub. Serve un token personale con il solo permesso <code>gist</code>:{" "}
              <a className="link-inline" href="https://github.com/settings/tokens/new?scopes=gist&description=Quaderno%20sync" target="_blank" rel="noreferrer">
                crealo qui <ExternalLink size={12} />
              </a>{" "}
              (scegli “No expiration”), copialo e incollalo sotto. Ripeti su ogni dispositivo con lo stesso token.
            </p>
            <div className="share-link">
              <input className="input mono" type="password" placeholder="ghp_…" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
              <Button variant="primary" onClick={doConnect} disabled={busy || token.trim().length < 20}>
                {busy ? "Collego…" : "Collega"}
              </Button>
            </div>
            <p className="muted small">Il token resta solo su questo dispositivo. Se lavagne con lo stesso nome esistono su più dispositivi, vince la modifica più recente e l'altra versione viene conservata come copia.</p>
          </>
        )}
      </section>

      <details className="settings-section settings-advanced" open={isExtensionContext()}>
        <summary>
          <Globe size={16} /> Avanzate: URL pubblico dell'app
        </summary>
        <p className="muted small">
          Non c'entra con la sincronizzazione: è solo la base dei link condivisi. {isExtensionContext() ? "Nell'estensione va impostato: " : "Sul web e nell'app desktop è già corretto. "}
          Se serve, inserisci l'indirizzo dove è pubblicato Quaderno.
        </p>
        <input className="input mono" placeholder="https://tuonome.github.io/quaderno/" value={url} onChange={(e) => setUrl(e.target.value)} />
        {effective && <p className="muted small">I link avranno la forma: {effective}#/s/…</p>}
      </details>

      <section className="settings-section">
        <h3>
          <Magnet size={16} /> Frecce agganciate dal magnete
        </h3>
        <p className="muted small">Quando un punto viene agganciato a un vertice o a una metà lato, resta fisso lì anche se sposti la figura. Qui puoi tornare al comportamento di Excalidraw (il punto scivola lungo il bordo) per uno dei due estremi o per entrambi.</p>
        <label className="option">
          <input type="checkbox" checked={settings.anchorStart !== false} onChange={(e) => setSettings({ anchorStart: e.target.checked })} />
          <span>Punto iniziale fisso</span>
        </label>
        <label className="option">
          <input type="checkbox" checked={settings.anchorEnd !== false} onChange={(e) => setSettings({ anchorEnd: e.target.checked })} />
          <span>Punto finale fisso</span>
        </label>
      </section>

      <section className="settings-section">
        <h3>
          <Database size={16} /> Archivio locale
        </h3>
        <p className="muted small">
          Le lavagne vivono nel database del browser di questo dispositivo (IndexedDB). {usage && <>Lavagne salvate: {usage.boards}{usage.bytes != null && <> · spazio usato: {formatBytes(usage.bytes)}</>}.</>}
          <br />
          Per un backup esporta le lavagne come file .excalidraw.
        </p>
        <p className="muted small">
          Quaderno versione <code>{__APP_VERSION__}</code> del {__BUILD_DATE__}
          {typeof navigator !== "undefined" && navigator.userAgent.includes("Electron") ? " · app desktop" : isExtensionContext() ? " · estensione" : " · web"}
        </p>
      </section>
    </Modal>
  );
}
