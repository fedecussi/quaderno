import { useEffect, useMemo, useState } from "react";
import { Link2, Lock, Copy, Check, Image as ImageIcon, AlertTriangle, ExternalLink, Cloud } from "lucide-react";
import { Button, Modal, toast } from "./ui";
import type { BoardData, BoardMeta } from "../lib/types";
import { loadBoardData } from "../lib/db";
import { encodeShare, publicBaseUrl, isExtensionContext } from "../lib/share";
import { useStore } from "../lib/store";
import { formatBytes, boardTitle } from "../lib/format";

const SOFT_LIMIT = 60_000; // oltre ~60 KB alcuni servizi di messaggistica troncano gli URL
const HARD_LIMIT = 1_500_000;

export function ShareDialog({ board, data: given, onClose }: { board: BoardMeta; data?: BoardData; onClose: () => void }) {
  const { settings } = useStore();
  const [data, setData] = useState<BoardData | undefined>(given);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [includeFiles, setIncludeFiles] = useState(true);
  const canGist = !!settings.syncToken;
  const [viaGist, setViaGist] = useState(false);
  const [link, setLink] = useState<{ url: string; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!given) loadBoardData(board.id).then(setData);
  }, [board.id, given]);

  const hasImages = useMemo(() => Object.keys(data?.files ?? {}).length > 0, [data]);
  const bigBoard = useMemo(() => (data ? JSON.stringify(data.elements).length > 60_000 : false), [data]);
  useEffect(() => {
    if (canGist && bigBoard) setViaGist(true);
  }, [canGist, bigBoard]);
  const base = publicBaseUrl(settings.publicUrl);
  const baseMissing = !base;

  async function generate() {
    if (!data) return;
    setBusy(true);
    try {
      const { fragment, bytes } = await encodeShare({ title: board.title, data, sharedAt: Date.now() }, { password: usePassword ? password : undefined, includeFiles, gistToken: viaGist && canGist ? settings.syncToken : undefined });
      if (bytes > HARD_LIMIT) {
        toast("La lavagna è troppo grande per un link. Prova senza immagini, oppure attiva il link breve.", "error");
        return;
      }
      setLink({ url: `${base}#/s/${fragment}`, bytes });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Creazione del link fallita", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    toast("Link copiato", "success");
    setTimeout(() => setCopied(false), 1800);
  }

  // Rigenera se cambiano le opzioni
  useEffect(() => setLink(null), [usePassword, password, includeFiles, viaGist]);

  return (
    <Modal open onClose={onClose} title={<><Link2 size={18} /> Condividi “{boardTitle(board.title)}”</>} width={480}>
      <p className="muted">
        Il link contiene la lavagna stessa, compressa e cifrata nel tuo browser. Nessun server la vede: chiunque abbia il link può aprirla e salvarne una copia. Le modifiche
        successive non si propagano: per aggiornare, genera un nuovo link.
      </p>

      {baseMissing && (
        <div className="callout warn">
          <AlertTriangle size={16} />
          <div>
            {isExtensionContext()
              ? "Stai usando l'estensione: imposta l'URL pubblico dell'app nelle Impostazioni, altrimenti il link non sarà apribile da altri."
              : "Imposta l'URL pubblico dell'app nelle Impostazioni per creare link apribili da altri."}
          </div>
        </div>
      )}

      <label className="option">
        <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
        <Lock size={15} />
        <span>Proteggi con password</span>
      </label>
      {usePassword && (
        <input className="input" type="text" autoComplete="off" placeholder="Scegli una password da comunicare a parte" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      )}
      {hasImages && (
        <label className="option">
          <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
          <ImageIcon size={15} />
          <span>Includi le immagini (rende il link più lungo)</span>
        </label>
      )}
      <label className="option" title={canGist ? "" : "Collega la sincronizzazione GitHub nelle Impostazioni per avere i link brevi"}>
        <input type="checkbox" checked={viaGist} disabled={!canGist} onChange={(e) => setViaGist(e.target.checked)} />
        <Cloud size={15} />
        <span>
          Link breve: la lavagna cifrata va in un gist segreto sul tuo GitHub{!canGist && " (serve la sincronizzazione collegata)"}
        </span>
      </label>

      {!link ? (
        <div className="modal-foot inline">
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" onClick={generate} disabled={!data || busy || baseMissing || (usePassword && password.length < 4)}>
            {busy ? "Creo il link…" : "Crea link"}
          </Button>
        </div>
      ) : (
        <div className="share-result">
          <div className="share-link">
            <input className="input mono" readOnly value={link.url} onFocus={(e) => e.target.select()} />
            <Button variant="primary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
              {copied ? "Copiato" : "Copia"}
            </Button>
          </div>
          <div className="share-info">
            <span className={link.bytes > SOFT_LIMIT ? "warn-text" : ""}>
              Lunghezza link: {formatBytes(link.bytes)}
              {link.bytes > SOFT_LIMIT && (canGist ? " · link lungo: attiva \"Link breve\" qui sopra." : " · link lungo, alcune app di messaggistica potrebbero troncarlo. Meglio inviarlo via email o come file.")}
            </span>
            <a href={link.url} target="_blank" rel="noreferrer" className="link-inline">
              Anteprima <ExternalLink size={13} />
            </a>
          </div>
          {usePassword && (
            <p className="muted small">
              Chi apre il link dovrà inserire la password <strong>{password}</strong>. Comunicala separatamente.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
