const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const min = 60_000, hour = 3_600_000, day = 86_400_000;
  if (abs < min) return "adesso";
  if (abs < hour) return rtf.format(Math.round(diff / min), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 7 * day) return rtf.format(Math.round(diff / day), "day");
  return new Intl.DateTimeFormat("it", { day: "numeric", month: "short", year: abs > 300 * day ? "numeric" : undefined }).format(ts);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function boardTitle(title: string): string {
  return title.trim() || "Senza titolo";
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lavagna";
}
