export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--primary)" />
        {/* stylised running track / rising bars */}
        <path
          d="M8 21c3-9 5-11 8-11s5 2 8 11"
          stroke="var(--primary-fg)"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="9" r="2.4" fill="var(--primary-fg)" />
      </svg>
      {withText && (
        <span style={{ fontWeight: 800, fontSize: size * 0.62, letterSpacing: "-0.02em" }}>
          Run<span style={{ color: "var(--primary)" }}>Plan</span>
        </span>
      )}
    </span>
  );
}
