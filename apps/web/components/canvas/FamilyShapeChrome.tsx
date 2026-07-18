/**
 * Rudimentary family silhouettes for fund (vault) and data-source (library / live feed)
 * canvas cards (D-068). Decorative only — low-contrast background structure; text labels lead.
 */

import type { FamilyShapeKind } from './canvas-visuals';

type ShapeProps = {
  hue: string;
  selected?: boolean | undefined;
};

/** Shared low-contrast stroke so structure reads as wash, not foreground (D-073). */
function structureStroke(hue: string, selected: boolean | undefined): string {
  return selected ? `${hue}22` : `${hue}0c`;
}

/** Capital vault: thick frame, rivets, door panel, keyhole. */
export function VaultShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 220 240"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x="4"
        y="4"
        width="212"
        height="232"
        rx="14"
        ry="14"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        opacity="0.28"
      />
      <rect
        x="18"
        y="28"
        width="184"
        height="188"
        rx="8"
        ry="8"
        fill={`${hue}03`}
        stroke={stroke}
        strokeWidth="0.5"
        opacity="0.28"
      />
      <line x1="18" y1="70" x2="202" y2="70" stroke={stroke} strokeWidth="0.5" opacity="0.16" />
      <line x1="18" y1="170" x2="202" y2="170" stroke={stroke} strokeWidth="0.5" opacity="0.16" />
      {[
        [14, 14],
        [206, 14],
        [14, 226],
        [206, 226],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="2.5"
          fill={`${hue}08`}
          stroke={stroke}
          strokeWidth="0.5"
          opacity="0.3"
        />
      ))}
      <g opacity="0.12" transform="translate(168 48)">
        <circle cx="0" cy="0" r="14" fill="none" stroke={stroke} strokeWidth="0.6" />
        <circle cx="0" cy="0" r="3.5" fill={`${hue}0e`} stroke={stroke} strokeWidth="0.5" />
        {[0, 45, 90, 135].map((deg) => (
          <line
            key={deg}
            x1="0"
            y1="-11"
            x2="0"
            y2="-7"
            stroke={stroke}
            strokeWidth="0.6"
            transform={`rotate(${deg})`}
          />
        ))}
        <path
          d="M -2 6 L 2 6 L 2 14 L 0 16 L -2 14 Z"
          fill={`${hue}0c`}
          stroke={stroke}
          strokeWidth="0.4"
        />
      </g>
      <path
        d="M 28 228 H 192"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.14"
      />
    </svg>
  );
}

/** Evidence library: shelf lines + book-spine stack watermark. */
export function LibraryShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 220 240"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x="3"
        y="3"
        width="214"
        height="234"
        rx="6"
        ry="6"
        fill="none"
        stroke={stroke}
        strokeWidth="0.7"
        strokeDasharray="5 3"
        opacity="0.22"
      />
      {[56, 108, 160, 212].map((y) => (
        <line
          key={y}
          x1="12"
          y1={y}
          x2="208"
          y2={y}
          stroke={stroke}
          strokeWidth="0.5"
          opacity="0.1"
        />
      ))}
      <g opacity="0.1" transform="translate(14 62)">
        {[
          { x: 0, h: 36, w: 8 },
          { x: 10, h: 40, w: 7 },
          { x: 19, h: 32, w: 9 },
          { x: 30, h: 38, w: 6 },
        ].map((book) => (
          <rect
            key={book.x}
            x={book.x}
            y={40 - book.h}
            width={book.w}
            height={book.h}
            rx="1"
            fill={`${hue}08`}
            stroke={stroke}
            strokeWidth="0.5"
          />
        ))}
      </g>
      <path
        d="M 178 3 H 206 Q 214 3 214 11 V 22 H 178 Z"
        fill={`${hue}06`}
        stroke={stroke}
        strokeWidth="0.5"
        opacity="0.2"
      />
    </svg>
  );
}

/** Live API feed: window / aperture with signal ticks. */
export function LiveFeedShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 220 240"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x="4"
        y="4"
        width="212"
        height="232"
        rx="8"
        ry="8"
        fill="none"
        stroke={stroke}
        strokeWidth="0.7"
        opacity="0.22"
      />
      <rect
        x="22"
        y="36"
        width="176"
        height="72"
        rx="4"
        fill={`${hue}03`}
        stroke={stroke}
        strokeWidth="0.5"
        opacity="0.22"
      />
      <line x1="22" y1="72" x2="198" y2="72" stroke={stroke} strokeWidth="0.4" opacity="0.1" />
      <g opacity="0.12" transform="translate(168 48)">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 7}
            y={16 - i * 4}
            width="4"
            height={8 + i * 4}
            rx="0.5"
            fill={`${hue}12`}
            stroke={stroke}
            strokeWidth="0.4"
          />
        ))}
      </g>
      <path
        d="M 4 120 H 14 M 206 120 H 216"
        stroke={stroke}
        strokeWidth="0.85"
        strokeLinecap="round"
        opacity="0.14"
      />
    </svg>
  );
}

export function FamilyShapeChrome({
  shape,
  hue,
  selected,
}: {
  shape: FamilyShapeKind | null | undefined;
  hue: string;
  selected?: boolean;
}) {
  if (!shape) return null;
  switch (shape) {
    case 'vault':
      return <VaultShapeChrome hue={hue} selected={selected} />;
    case 'library':
      return <LibraryShapeChrome hue={hue} selected={selected} />;
    case 'live_feed':
      return <LiveFeedShapeChrome hue={hue} selected={selected} />;
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
