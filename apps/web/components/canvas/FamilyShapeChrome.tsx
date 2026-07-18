/**
 * Rudimentary family silhouettes for fund (vault) and data-source (library / live feed)
 * canvas cards (D-067). Decorative only — no interaction; color reinforces text labels.
 */

import type { FamilyShapeKind } from './canvas-visuals';

type ShapeProps = {
  hue: string;
  selected?: boolean | undefined;
};

/** Capital vault: thick frame, rivets, door panel, keyhole. */
export function VaultShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = selected ? hue : `${hue}aa`;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 220 240"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Outer vault body — slightly inset so ports stay clear */}
      <rect
        x="4"
        y="4"
        width="212"
        height="232"
        rx="14"
        ry="14"
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        opacity="0.85"
      />
      {/* Inner door panel */}
      <rect
        x="18"
        y="28"
        width="184"
        height="188"
        rx="8"
        ry="8"
        fill={`${hue}0c`}
        stroke={stroke}
        strokeWidth="1.25"
        opacity="0.9"
      />
      {/* Horizontal vault bands */}
      <line x1="18" y1="70" x2="202" y2="70" stroke={stroke} strokeWidth="1" opacity="0.35" />
      <line x1="18" y1="170" x2="202" y2="170" stroke={stroke} strokeWidth="1" opacity="0.35" />
      {/* Corner rivets */}
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
          r="3"
          fill={`${hue}33`}
          stroke={stroke}
          strokeWidth="1"
        />
      ))}
      {/* Dial / keyhole watermark (upper right of body) */}
      <g opacity="0.45" transform="translate(168 48)">
        <circle cx="0" cy="0" r="14" fill="none" stroke={stroke} strokeWidth="1.5" />
        <circle cx="0" cy="0" r="4" fill={`${hue}55`} stroke={stroke} strokeWidth="1" />
        {[0, 45, 90, 135].map((deg) => (
          <line
            key={deg}
            x1="0"
            y1="-11"
            x2="0"
            y2="-7"
            stroke={stroke}
            strokeWidth="1.25"
            transform={`rotate(${deg})`}
          />
        ))}
        <path
          d="M -2 6 L 2 6 L 2 14 L 0 16 L -2 14 Z"
          fill={`${hue}44`}
          stroke={stroke}
          strokeWidth="0.75"
        />
      </g>
      {/* Pedestal lip */}
      <path
        d="M 28 228 H 192"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

/** Evidence library: shelf lines + book-spine stack watermark. */
export function LibraryShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = selected ? hue : `${hue}99`;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 220 240"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Soft outer frame — archive card */}
      <rect
        x="3"
        y="3"
        width="214"
        height="234"
        rx="6"
        ry="6"
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray="5 3"
        opacity="0.75"
      />
      {/* Shelf rails */}
      {[56, 108, 160, 212].map((y) => (
        <line
          key={y}
          x1="12"
          y1={y}
          x2="208"
          y2={y}
          stroke={stroke}
          strokeWidth="1"
          opacity="0.28"
        />
      ))}
      {/* Book spines watermark (left) */}
      <g opacity="0.4" transform="translate(14 62)">
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
            fill={`${hue}22`}
            stroke={stroke}
            strokeWidth="1"
          />
        ))}
      </g>
      {/* Catalog tab notch top-right */}
      <path
        d="M 178 3 H 206 Q 214 3 214 11 V 22 H 178 Z"
        fill={`${hue}18`}
        stroke={stroke}
        strokeWidth="1"
        opacity="0.7"
      />
    </svg>
  );
}

/** Live API feed: window / aperture with signal ticks. */
export function LiveFeedShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = selected ? hue : `${hue}aa`;
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
        strokeWidth="1.75"
        opacity="0.8"
      />
      {/* Aperture / viewport frame */}
      <rect
        x="22"
        y="36"
        width="176"
        height="72"
        rx="4"
        fill={`${hue}0a`}
        stroke={stroke}
        strokeWidth="1.25"
        opacity="0.85"
      />
      <line x1="22" y1="72" x2="198" y2="72" stroke={stroke} strokeWidth="0.75" opacity="0.35" />
      {/* Signal bars watermark */}
      <g opacity="0.5" transform="translate(168 48)">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 7}
            y={16 - i * 4}
            width="4"
            height={8 + i * 4}
            rx="0.5"
            fill={`${hue}66`}
            stroke={stroke}
            strokeWidth="0.75"
          />
        ))}
      </g>
      {/* Pipe stubs suggesting feed lines */}
      <path
        d="M 4 120 H 14 M 206 120 H 216"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
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
