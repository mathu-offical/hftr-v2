/**
 * Rudimentary family silhouettes for fund / data-source / agent / control
 * canvas cards (D-068 / D-109). Decorative only — low-contrast background; text labels lead.
 */

import type { ReactNode } from 'react';
import type { FamilyShapeKind } from './canvas-visuals';

type ShapeProps = {
  hue: string;
  selected?: boolean | undefined;
};

/** Shared low-contrast stroke so structure reads as wash, not foreground (D-073). */
function structureStroke(hue: string, selected: boolean | undefined): string {
  return selected ? `${hue}22` : `${hue}0c`;
}

function FrameSvg(props: {
  hue: string;
  selected?: boolean | undefined;
  children: ReactNode;
  dashed?: boolean;
}) {
  const stroke = structureStroke(props.hue, props.selected);
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
        rx="12"
        ry="12"
        fill="none"
        stroke={stroke}
        strokeWidth="0.8"
        strokeDasharray={props.dashed ? '5 3' : undefined}
        opacity="0.22"
      />
      {props.children}
    </svg>
  );
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
        x="28"
        y="36"
        width="164"
        height="120"
        rx="4"
        fill={`${hue}04`}
        stroke={stroke}
        strokeWidth="0.7"
        opacity="0.25"
      />
      <rect x="36" y="44" width="148" height="104" rx="2" fill="none" stroke={stroke} opacity="0.12" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={48 + i * 28}
          y1={168}
          x2={48 + i * 28}
          y2={168 - (8 + (i % 3) * 10)}
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.16"
        />
      ))}
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

/** Research: magnifier + scan arcs. */
function ResearchShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <FrameSvg hue={hue} selected={selected}>
      <g opacity="0.14" transform="translate(150 42)">
        <circle cx="0" cy="0" r="18" fill="none" stroke={stroke} strokeWidth="1" />
        <circle cx="0" cy="0" r="10" fill="none" stroke={stroke} strokeWidth="0.6" />
        <line x1="12" y1="12" x2="26" y2="26" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </g>
      {[70, 95, 120].map((y, i) => (
        <path
          key={y}
          d={`M 24 ${y} Q 110 ${y - 8 - i * 2} 196 ${y}`}
          fill="none"
          stroke={stroke}
          strokeWidth="0.6"
          opacity="0.12"
        />
      ))}
    </FrameSvg>
  );
}

/** Librarian: bookmark + index ticks. */
function LibrarianShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <FrameSvg hue={hue} selected={selected}>
      <path
        d="M 168 28 V 88 L 182 78 L 196 88 V 28 Z"
        fill={`${hue}08`}
        stroke={stroke}
        strokeWidth="0.6"
        opacity="0.2"
      />
      {[56, 78, 100, 122, 144].map((y) => (
        <line
          key={y}
          x1="28"
          y1={y}
          x2={y % 40 === 0 ? 140 : 120}
          y2={y}
          stroke={stroke}
          strokeWidth="0.5"
          opacity="0.12"
        />
      ))}
    </FrameSvg>
  );
}

/** Trend: ascending polyline. */
function TrendShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <FrameSvg hue={hue} selected={selected}>
      <polyline
        points="28,170 70,140 100,150 140,100 190,70"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.18"
      />
      <circle cx="190" cy="70" r="3" fill={`${hue}12`} stroke={stroke} opacity="0.25" />
    </FrameSvg>
  );
}

/** Trading: order ticket corners. */
function TradingShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <FrameSvg hue={hue} selected={selected}>
      <rect
        x="36"
        y="48"
        width="148"
        height="120"
        rx="4"
        fill={`${hue}04`}
        stroke={stroke}
        strokeWidth="0.7"
        opacity="0.2"
      />
      <line x1="36" y1="78" x2="184" y2="78" stroke={stroke} opacity="0.12" />
      <line x1="36" y1="128" x2="184" y2="128" stroke={stroke} opacity="0.12" />
      <rect x="48" y="140" width="52" height="16" rx="2" fill={`${hue}0a`} opacity="0.2" />
      <rect x="120" y="140" width="52" height="16" rx="2" fill={`${hue}0a`} opacity="0.2" />
    </FrameSvg>
  );
}

/** Analyzer: merge chevrons into one bar. */
function AnalyzerShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <FrameSvg hue={hue} selected={selected}>
      <path
        d="M 40 80 L 90 120 L 40 160"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        opacity="0.16"
      />
      <path
        d="M 70 80 L 120 120 L 70 160"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        opacity="0.14"
      />
      <rect x="130" y="108" width="50" height="24" rx="3" fill={`${hue}0a`} stroke={stroke} opacity="0.2" />
    </FrameSvg>
  );
}

/** Policy: shield outline. */
function PolicyShapeChrome({ hue, selected }: ShapeProps) {
  const stroke = structureStroke(hue, selected);
  return (
    <FrameSvg hue={hue} selected={selected} dashed>
      <path
        d="M 110 40 L 168 58 V 118 C 168 148 140 168 110 180 C 80 168 52 148 52 118 V 58 Z"
        fill={`${hue}05`}
        stroke={stroke}
        strokeWidth="0.9"
        opacity="0.2"
      />
      <path d="M 90 112 L 104 126 L 134 90" fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.18" />
    </FrameSvg>
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
    case 'research':
      return <ResearchShapeChrome hue={hue} selected={selected} />;
    case 'librarian':
      return <LibrarianShapeChrome hue={hue} selected={selected} />;
    case 'trend':
      return <TrendShapeChrome hue={hue} selected={selected} />;
    case 'trading':
      return <TradingShapeChrome hue={hue} selected={selected} />;
    case 'analyzer':
      return <AnalyzerShapeChrome hue={hue} selected={selected} />;
    case 'policy':
      return <PolicyShapeChrome hue={hue} selected={selected} />;
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}
