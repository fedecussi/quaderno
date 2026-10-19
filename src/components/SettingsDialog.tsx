import { useEffect, useState } from "react";
import { Database, Globe, Magnet } from "lucide-react";
import { Button, Modal } from "./ui";
import { setSettings, useStore } from "../lib/store";
import { estimateUsage } from "../lib/db";
import { formatBytes } from "../lib/format";
import { isExtensionContext, publicBaseUrl } from "../lib/share";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useStore();
  const [url, setUrl] = useState(settings.publicUrl);
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
      width={460}
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
          <Globe size={16} /> URL pubblico dell'app
        </h3>
        <p className="muted small">
          È la base dei link condivisi. {isExtensionContext() ? "Nell'estensione è obbligatorio: " : "Di solito non serve toccarlo: "}
          inserisci l'indirizzo dove hai pubblicato Quaderno (es. GitHub Pages).
        </p>
        <input className="input mono" placeholder="https://tuonome.github.io/quaderno/" value={url} onChange={(e) => setUrl(e.target.value)} />
        {effective && <p className="muted small">I link avranno la forma: {effective}#/s/…</p>}
      </section>

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
      </section>
    </Modal>
  );
}
