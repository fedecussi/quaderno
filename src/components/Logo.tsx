export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="logo-mark">
      <rect x="6" y="6" width="52" height="52" rx="14" fill="var(--accent)" />
      <path d="M20 42c4-14 10-20 24-24-6 10-10 16-24 24z" fill="#fff" opacity=".95" />
      <path d="M20 42l-2 4 4-2" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="18" r="3" fill="#fff" opacity=".7" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Quaderno</span>
    </span>
  );
}
