
/**
 * AK monogram. Geometric, italic-slanted, one stroke weight: the A is a bare
 * stroke pair (flat apex, no crossbar) whose right foot lands on the K's stem,
 * so the two letters fuse into one mark. Built upright and skewed 13 degrees;
 * the K's arms run past the cap line and are clipped flat by the viewBox box.
 */
export function AKMark({
  className,
  title,
}: {
  className?: string;
  /** omit when the mark is decorative inside a labelled link */
  title?: string;
}) {
  const clipId = "ak-mark-clip"; // identical clip on every instance, so duplicate ids are harmless
  return (
    <svg
      className={className}
      viewBox="0 0 62 32"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="-10" y="0" width="90" height="32" />
        </clipPath>
      </defs>
      {/* upright drawing, then skewed (top moves right) */}
      <g transform="matrix(1 0 -0.231 1 7.4 0)" clipPath={`url(#${clipId})`}>
        {/* A: two legs meeting at a flat apex, no crossbar */}
        <path d="M0 32 L10 0 H18 L28 32 H20.5 L14 10.5 L7.5 32 Z" />
        {/* K: stem, upper arm, lower leg */}
        <path d="M25 0 H32.5 V32 H25 Z" />
        <path
          d="M30 19 L51 -8"
          fill="none"
          stroke="currentColor"
          strokeWidth="7.5"
        />
        <path
          d="M31 14.5 L52 42"
          fill="none"
          stroke="currentColor"
          strokeWidth="7.5"
        />
      </g>
    </svg>
  );
}
