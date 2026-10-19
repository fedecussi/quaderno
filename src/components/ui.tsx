import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${!children ? "btn-icon" : ""} ${className}`} type="button" {...rest}>
      {icon && <span className="btn-ico">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={{ width }}>
        {title && (
          <header className="modal-head">
            <h2>{title}</h2>
            <Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Chiudi" onClick={onClose} />
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Menu (dropdown) ---------- */
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  separator?: boolean;
  checked?: boolean;
}

export function Menu({
  anchor,
  items,
  onClose,
  align = "end",
}: {
  anchor: DOMRect | null;
  items: MenuItem[];
  onClose: () => void;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const m = ref.current.getBoundingClientRect();
    let top = anchor.bottom + 6;
    let left = align === "end" ? anchor.right - m.width : anchor.left;
    if (top + m.height > innerHeight - 8) top = Math.max(8, anchor.top - m.height - 6);
    left = Math.min(Math.max(8, left), innerWidth - m.width - 8);
    setPos({ top, left, visibility: "visible" });
  }, [anchor, align]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    });
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div className="menu" ref={ref} style={pos} role="menu">
      {items.map((it, i) =>
        it.separator ? (
          <div className="menu-sep" key={i} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${it.danger ? "danger" : ""} ${it.checked ? "checked" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
          >
            {it.icon && <span className="menu-ico">{it.icon}</span>}
            <span className="menu-label">{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** Hook: apre un menu ancorato all'elemento che riceve il click. */
export function useMenu() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = (e: { currentTarget: Element; preventDefault?: () => void; stopPropagation?: () => void }) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    setAnchor(e.currentTarget.getBoundingClientRect());
  };
  const openAt = (x: number, y: number) => setAnchor(new DOMRect(x, y, 0, 0));
  const close = () => setAnchor(null);
  return { anchor, open, openAt, close, isOpen: !!anchor };
}

/* ---------- Toast ---------- */
interface ToastMsg {
  id: number;
  text: string;
  kind: "info" | "success" | "error";
  action?: { label: string; onClick: () => void };
}
let toastSeq = 0;
const toastListeners = new Set<(t: ToastMsg) => void>();
export function toast(text: string, kind: ToastMsg["kind"] = "info", action?: ToastMsg["action"]) {
  const t = { id: ++toastSeq, text, kind, action };
  for (const l of toastListeners) l(t);
}

export function Toaster() {
  const [list, setList] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const l = (t: ToastMsg) => {
      setList((xs) => [...xs, t]);
      setTimeout(() => setList((xs) => xs.filter((x) => x.id !== t.id)), t.action ? 6000 : 3200);
    };
    toastListeners.add(l);
    return () => void toastListeners.delete(l);
  }, []);
  return createPortal(
    <div className="toaster">
      {list.map((t) => (
        <div className={`toast toast-${t.kind}`} key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                setList((xs) => xs.filter((x) => x.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ---------- Confirm ---------- */
export function Confirm({
  open,
  title,
  message,
  confirmLabel = "Conferma",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={400}
      footer={
        <>
          <Button onClick={onClose}>Annulla</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

/* ---------- Prompt (input singolo) ---------- */
export function Prompt({
  open,
  title,
  label,
  initial = "",
  placeholder,
  confirmLabel = "Salva",
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    if (open) setV(initial);
  }, [open, initial]);
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!v.trim()) return;
          onSubmit(v.trim());
          onClose();
        }}
      >
        {label && <label className="field-label">{label}</label>}
        <input className="input" autoFocus value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} />
        <div className="modal-foot inline">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={!v.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
