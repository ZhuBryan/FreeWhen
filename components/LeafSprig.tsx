// A single elegant leaf sprig used as a botanical accent across the app: a thin
// curved stem with alternating almond leaves, drawn entirely in currentColor so
// callers set size, tint, opacity, and rotation through className. Purely
// decorative: every placement wraps it as aria-hidden / pointer-events-none.
export default function LeafSprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Sinuous stem */}
      <path
        d="M60 238 C56 212 64 196 58 170 C52 148 64 130 60 104 C57 82 63 60 60 40 L60 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Almond leaves, alternating up the stem, ending in a terminal leaf */}
      <g fill="currentColor">
        <path d="M60 205 Q83.4 196.8 95 175 Q71.6 183.2 60 205 Z" />
        <path d="M60 178 Q48.7 157 26 150 Q37.3 171 60 178 Z" />
        <path d="M59 150 Q82.7 144.4 96 124 Q72.3 129.6 59 150 Z" />
        <path d="M60 122 Q47 102.5 24 98 Q37 117.5 60 122 Z" />
        <path d="M59 94 Q80.5 90.5 92 72 Q70.5 75.5 59 94 Z" />
        <path d="M60 66 Q50.3 47.8 30 44 Q39.7 62.2 60 66 Z" />
        <path d="M60 42 Q67 24 60 6 Q53 24 60 42 Z" />
      </g>
    </svg>
  );
}
