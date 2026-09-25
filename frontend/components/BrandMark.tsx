// Inline copy of brand/logo.svg: one decision (canExecute) above three consumers.
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`brand-logo shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="#ff7058" strokeWidth="4" strokeLinecap="round" fill="none">
        <line x1="25.64" y1="25.86" x2="14" y2="45.5" />
        <line x1="32" y1="28.5" x2="32" y2="45.5" />
        <line x1="38.36" y1="25.86" x2="50" y2="45.5" />
      </g>
      <g fill="#ff7058">
        <circle cx="32" cy="19.5" r="9" />
        <circle cx="14" cy="45.5" r="5.5" />
        <circle cx="32" cy="45.5" r="5.5" />
        <circle cx="50" cy="45.5" r="5.5" />
      </g>
    </svg>
  );
}
