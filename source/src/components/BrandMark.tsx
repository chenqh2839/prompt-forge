export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-emblem ${className}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" role="img" focusable="false">
        <path
          className="brand-emblem-frame"
          d="M8 5.5h17.5L32 12v22.5H8z"
        />
        <path
          className="brand-emblem-fold"
          d="M25.5 5.5V12H32"
        />
        <path
          className="brand-emblem-glyph"
          d="M14 28V13.5h8.2c3.7 0 6 2 6 5.2 0 3.3-2.4 5.4-6.1 5.4h-3.4V28H14zm4.7-8h2.9c1.8 0 2.8-.5 2.8-1.7s-1-1.7-2.8-1.7h-2.9v3.4z"
        />
        <path
          className="brand-emblem-spark"
          d="m29.5 23 1.5 3.1 3.2 1.5-3.2 1.5-1.5 3.2-1.5-3.2-3.2-1.5 3.2-1.5z"
        />
      </svg>
    </span>
  );
}
