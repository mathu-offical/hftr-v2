'use client';

import dynamic from 'next/dynamic';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react';
import type {
  ResearchGraphLibraryNest,
  ResearchGraphLink,
  ResearchGraphNode,
} from '@hftr/contracts';
import {
  humanizeConceptTitle,
  shortLibraryLabel,
} from '@/lib/research-library-shelves';
import styles from './galaxy-view.module.css';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

type ForceGraphHandle = {
  zoomToFit?: (
    durationMs?: number,
    padding?: number,
    nodeFilter?: (node: { id?: string | number }) => boolean,
  ) => void;
};

type ForceGraph3DComponent = ComponentType<Record<string, unknown>>;

let forceGraph3DPromise: Promise<{ default: ForceGraph3DComponent }> | null = null;

function loadForceGraph3D(): Promise<{ default: ForceGraph3DComponent }> {
  if (!forceGraph3DPromise) {
    forceGraph3DPromise = import('react-force-graph-3d');
  }
  return forceGraph3DPromise;
}

const TAG_COLORS = [
  'var(--color-accent)',
  '#7aa2f7',
  '#9ece6a',
  '#e0af68',
  '#bb9af7',
  '#7dcfff',
  '#f7768e',
];

function tagColor(tag: string, tags: readonly string[]): string {
  const idx = tags.indexOf(tag);
  return TAG_COLORS[idx >= 0 ? idx % TAG_COLORS.length : 0] ?? '#7aa2f7';
}

interface LibraryCenter {
  x: number;
  y: number;
  radius: number;
  name: string;
}

function hashSpread(id: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const r = 12 + (Math.abs(h) % 28);
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

const NEST_BOUNDARY_RATIO = 0.85;

function computeLibraryCenters(
  nests: ResearchGraphLibraryNest[],
  nodes: ResearchGraphNode[],
): Map<string, LibraryCenter> {
  const libMeta = new Map(nests.map((l) => [l.id, l]));
  const libIds =
    nests.length > 0
      ? nests.map((l) => l.id)
      : [
          ...new Set(
            nodes.map((n) => n.primaryLibraryId).filter((id): id is string => Boolean(id)),
          ),
        ];

  const count = Math.max(libIds.length, 1);
  const ringRadius = Math.min(220, 70 + count * 36);
  const centers = new Map<string, LibraryCenter>();

  libIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const meta = libMeta.get(id);
    const conceptCount = meta?.conceptCount ?? 3;
    centers.set(id, {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
      radius: 48 + Math.min(56, conceptCount * 1.6),
      name: meta?.name ?? 'Library',
    });
  });

  return centers;
}

export interface GalaxyViewProps {
  companyId: string;
  nodes: ResearchGraphNode[];
  links: ResearchGraphLink[];
  tags: string[];
  libraries?: ResearchGraphLibraryNest[];
  focusConceptIds?: string[] | null;
  /** Fly-to and emphasize when set (inspect / wikilink). */
  highlightConceptId?: string | null;
  selectedLibraryIds?: string[] | null;
  className?: string;
  /** Open concept in floating inspector (D-049) — preferred over inline drawer. */
  onInspectConcept?: (conceptId: string) => void;
  /** Called after verify / archive so the overlay can reload the graph (D-047). */
  onGraphInvalidated?: () => void;
}

function useGraphDimensions() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 220 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...size };
}

type SimNode = {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  primaryLibraryId?: string | null;
};

function clampNodeToLibraryNest(node: SimNode, centers: Map<string, LibraryCenter>): void {
  const libId = node.primaryLibraryId;
  if (!libId) return;
  const center = centers.get(libId);
  if (!center) return;

  const nx = node.x ?? 0;
  const ny = node.y ?? 0;
  const dx = nx - center.x;
  const dy = ny - center.y;
  const dist = Math.hypot(dx, dy);
  const maxR = center.radius * NEST_BOUNDARY_RATIO;
  if (dist <= maxR || dist === 0) return;

  const scale = maxR / dist;
  node.x = center.x + dx * scale;
  node.y = center.y + dy * scale;

  const vx = node.vx ?? 0;
  const vy = node.vy ?? 0;
  const outward = (dx * vx + dy * vy) / dist;
  if (outward > 0) {
    const damp = 0.35;
    node.vx = vx - (dx / dist) * outward * damp;
    node.vy = vy - (dy / dist) * outward * damp;
  }
}

function GalaxyViewInner(props: GalaxyViewProps) {
  const libraryNests = props.libraries ?? [];
  const focusSet = useMemo(
    () => (props.focusConceptIds ? new Set(props.focusConceptIds) : null),
    [props.focusConceptIds],
  );
  const libraryFilter = useMemo(
    () =>
      props.selectedLibraryIds && props.selectedLibraryIds.length > 0
        ? new Set(props.selectedLibraryIds)
        : null,
    [props.selectedLibraryIds],
  );

  const [mode3d, setMode3d] = useState(false);
  const [threeAvailable, setThreeAvailable] = useState<boolean | null>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<ForceGraph3DComponent | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const graphBox = useGraphDimensions();
  const graphHandleRef = useRef<ForceGraphHandle | null>(null);

  const captureGraphRef = useCallback((instance: ForceGraphHandle | null) => {
    graphHandleRef.current = instance;
  }, []);

  const force2d = props.nodes.length > 200;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (force2d) {
      setMode3d(false);
      setStatusText(`Large graph (${props.nodes.length} concepts) — 2D mode for performance.`);
    }
  }, [force2d, props.nodes.length]);

  useEffect(() => {
    if (force2d) return;
    let cancelled = false;
    void loadForceGraph3D()
      .then((mod) => {
        if (cancelled) return;
        setForceGraph3D(() => mod.default);
        setThreeAvailable(true);
      })
      .catch(() => {
        if (cancelled) return;
        setThreeAvailable(false);
        setMode3d(false);
        setStatusText('3D renderer unavailable — showing 2D graph.');
      });
    return () => {
      cancelled = true;
    };
  }, [force2d]);

  const libraryCenters = useMemo(
    () => computeLibraryCenters(libraryNests, props.nodes),
    [libraryNests, props.nodes],
  );

  const degreeById = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of props.links) {
      map.set(link.fromConceptId, (map.get(link.fromConceptId) ?? 0) + 1);
      map.set(link.toConceptId, (map.get(link.toConceptId) ?? 0) + 1);
    }
    return map;
  }, [props.links]);

  const filteredNodeIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = new Set<string>();
    for (const node of props.nodes) {
      if (libraryFilter && node.primaryLibraryId && !libraryFilter.has(node.primaryLibraryId)) {
        continue;
      }
      if (activeTag && !node.tags.includes(activeTag)) continue;
      if (q) {
        const hay = `${node.title} ${node.body} ${node.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      ids.add(node.id);
    }
    return ids;
  }, [props.nodes, query, activeTag, libraryFilter]);

  const graphData = useMemo(() => {
    const nodes = props.nodes
      .filter((n) => filteredNodeIds.has(n.id))
      .map((n) => {
        const degree = degreeById.get(n.id) ?? 0;
        const refs = n.referenceCount ?? 0;
        const libId = n.primaryLibraryId;
        const center = libId ? libraryCenters.get(libId) : null;
        const spread = hashSpread(n.id);
        const x = center ? center.x + spread.dx : spread.dx * 0.4;
        const y = center ? center.y + spread.dy : spread.dy * 0.4;
        const focused = !focusSet || focusSet.has(n.id);
        return {
          ...n,
          x,
          y,
          val: Math.max(1, degree * 0.6 + refs * 0.35 + 1),
          __focused: focused,
        };
      });
    const nodeSet = new Set(nodes.map((n) => n.id));
    const links = props.links
      .filter((l) => nodeSet.has(l.fromConceptId) && nodeSet.has(l.toConceptId))
      .map((l) => {
        const bothFocused =
          focusSet !== null && focusSet.has(l.fromConceptId) && focusSet.has(l.toConceptId);
        const eitherFocused =
          focusSet !== null && (focusSet.has(l.fromConceptId) || focusSet.has(l.toConceptId));
        return {
          ...l,
          source: l.fromConceptId,
          target: l.toConceptId,
          __bothFocused: bothFocused,
          __eitherFocused: eitherFocused,
        };
      });
    return { nodes, links };
  }, [props.nodes, props.links, filteredNodeIds, degreeById, libraryCenters, focusSet]);

  const use3dRenderer = !force2d && mode3d && threeAvailable === true && ForceGraph3D !== null;
  const hasTopicFocus = focusSet !== null && focusSet.size > 0;

  const fitFocusedNodes = useCallback(() => {
    if (!focusSet || focusSet.size === 0) return;
    const fg = graphHandleRef.current;
    if (!fg?.zoomToFit) return;
    const durationMs = reducedMotion ? 0 : 400;
    fg.zoomToFit(durationMs, 48, (node) => {
      if (node.id === undefined) return false;
      return focusSet.has(String(node.id));
    });
  }, [focusSet, reducedMotion]);

  useEffect(() => {
    if (!hasTopicFocus) return;
    const frame = requestAnimationFrame(() => {
      fitFocusedNodes();
    });
    return () => cancelAnimationFrame(frame);
  }, [hasTopicFocus, fitFocusedNodes, use3dRenderer, graphData.nodes.length]);

  const onEngineStop = useCallback(() => {
    if (hasTopicFocus) fitFocusedNodes();
  }, [hasTopicFocus, fitFocusedNodes]);

  const onEngineTick = useCallback(() => {
    for (const node of graphData.nodes) {
      clampNodeToLibraryNest(node as SimNode, libraryCenters);
    }
  }, [graphData.nodes, libraryCenters]);

  useEffect(() => {
    const id = props.highlightConceptId;
    if (!id) return;
    const fg = graphHandleRef.current;
    if (!fg?.zoomToFit) return;
    const durationMs = reducedMotion ? 0 : 600;
    // Slight delay so layout/focus flags settle before camera move.
    const t = window.setTimeout(() => {
      fg.zoomToFit?.(durationMs, 80, (n) => String(n.id) === id);
    }, reducedMotion ? 0 : 80);
    return () => window.clearTimeout(t);
  }, [props.highlightConceptId, props.nodes, reducedMotion]);

  const onNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id === undefined) return;
      props.onInspectConcept?.(String(node.id));
    },
    [props],
  );

  const nodeColor = useCallback(
    (node: { id?: string | number; tags?: string[]; __focused?: boolean }) => {
      const tag = node.tags?.[0];
      const base = tag ? tagColor(tag, props.tags) : '#9aa4b8';
      if (props.highlightConceptId && String(node.id) === props.highlightConceptId) {
        return '#7aa2f7';
      }
      if (hasTopicFocus && node.__focused === false) {
        return 'rgba(120, 130, 150, 0.35)';
      }
      return base;
    },
    [props.tags, props.highlightConceptId, hasTopicFocus],
  );

  const paintNode = useCallback(
    (
      node: {
        id?: string | number;
        x?: number;
        y?: number;
        tags?: string[];
        __focused?: boolean;
        title?: string;
      },
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isHighlight = Boolean(
        props.highlightConceptId && String(node.id) === props.highlightConceptId,
      );
      const isFocused = !hasTopicFocus || node.__focused !== false;
      const r = (isHighlight ? 7 : isFocused ? 4.5 : 3) / Math.max(globalScale * 0.35, 0.5);
      const fill = nodeColor(node);

      if (isHighlight) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.85, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(122, 162, 247, 0.55)';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(122, 162, 247, 0.22)';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isHighlight ? '#7aa2f7' : fill;
      ctx.globalAlpha = hasTopicFocus && node.__focused === false ? 0.28 : 0.95;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHighlight || (isFocused && globalScale > 1.35)) {
        const raw = node.title ?? '';
        const label = humanizeConceptTitle(raw);
        if (label) {
          const fontSize = Math.max(8 / globalScale, 2);
          const maxChars = isHighlight ? 36 : 22;
          ctx.font = `${isHighlight ? 600 : 400} ${fontSize}px sans-serif`;
          ctx.fillStyle = isHighlight ? '#e8ecf4' : 'rgba(200, 210, 230, 0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const text =
            label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
          // Soft backdrop so overlapping labels stay readable.
          const metrics = ctx.measureText(text);
          const pad = 2 / globalScale;
          const tw = metrics.width + pad * 2;
          const th = fontSize + pad * 2;
          ctx.fillStyle = 'rgba(12, 16, 24, 0.72)';
          ctx.fillRect(x - tw / 2, y + r + 1 / globalScale, tw, th);
          ctx.fillStyle = isHighlight ? '#e8ecf4' : 'rgba(200, 210, 230, 0.9)';
          ctx.fillText(text, x, y + r + pad + 1 / globalScale);
        }
      }
    },
    [hasTopicFocus, nodeColor, props.highlightConceptId],
  );

  const nodeColorAccessor = nodeColor as (node: object) => string;

  const linkColor = useCallback(
    (link: { __bothFocused?: boolean; __eitherFocused?: boolean }) => {
      if (hasTopicFocus) {
        if (link.__bothFocused) return 'var(--color-accent)';
        if (link.__eitherFocused) return 'rgba(122, 162, 247, 0.25)';
        return 'rgba(80, 90, 110, 0.12)';
      }
      return 'var(--color-line)';
    },
    [hasTopicFocus],
  );

  const linkColorAccessor = linkColor as (link: object) => string;

  const linkWidth = useCallback((link: { __bothFocused?: boolean }) => {
    return link.__bothFocused ? 2.2 : 0.8;
  }, []);

  const linkWidthAccessor = linkWidth as (link: object) => number;

  const nodeOpacity = useCallback(
    (node: { __focused?: boolean }) => {
      if (!hasTopicFocus) return 0.92;
      return node.__focused === false ? 0.28 : 1;
    },
    [hasTopicFocus],
  );

  const nodeOpacityAccessor = nodeOpacity as (node: object) => number;

  const linkParticles = useCallback(
    (link: { __bothFocused?: boolean }) => (hasTopicFocus && link.__bothFocused ? 2 : 1),
    [hasTopicFocus],
  );
  const linkParticleWidth = useCallback(
    (link: { __bothFocused?: boolean }) => (hasTopicFocus && link.__bothFocused ? 2 : 1),
    [hasTopicFocus],
  );
  const linkParticlesAccessor = linkParticles as (link: object) => number;
  const linkParticleWidthAccessor = linkParticleWidth as (link: object) => number;

  const graphCommon = {
    graphData,
    backgroundColor: 'rgba(0,0,0,0)',
    nodeLabel: 'title' as const,
    linkDirectionalParticles: linkParticlesAccessor,
    linkDirectionalParticleWidth: linkParticleWidthAccessor,
    onNodeClick,
    nodeColor: nodeColorAccessor,
    linkColor: linkColorAccessor,
  };

  const hullOverlays = useMemo(() => {
    if (libraryCenters.size === 0) return [];
    return [...libraryCenters.entries()].map(([id, c]) => ({
      id,
      name: shortLibraryLabel(c.name, 24),
      fullName: c.name,
      style: {
        left: `calc(50% + ${c.x}px)`,
        top: `calc(50% + ${c.y}px)`,
        width: c.radius * 2,
        height: c.radius * 2,
        marginLeft: -c.radius,
        marginTop: -c.radius,
      } as CSSProperties,
    }));
  }, [libraryCenters]);

  const rootClass =
    props.className ??
    'flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)]';

  return (
    <div
      data-testid="galaxy-view"
      role="region"
      className={`${rootClass} flex min-h-0 flex-col overflow-hidden`}
      aria-label="Research galaxy graph"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-2 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search concepts"
          aria-label="Search galaxy concepts"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => {
              if (force2d) {
                setStatusText(
                  `Large graph (${props.nodes.length} concepts) — 2D mode for performance.`,
                );
                return;
              }
              if (threeAvailable === false) {
                setStatusText('3D renderer unavailable — showing 2D graph.');
                return;
              }
              setMode3d(true);
              setStatusText(null);
            }}
            disabled={force2d}
            aria-pressed={use3dRenderer}
            className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              use3dRenderer
                ? 'border border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border border-[var(--color-line)] text-[var(--color-ink-faint)]'
            }`}
          >
            3D
          </button>
          <button
            type="button"
            onClick={() => {
              setMode3d(false);
              setStatusText(null);
            }}
            aria-pressed={!use3dRenderer}
            className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              !use3dRenderer
                ? 'border border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border border-[var(--color-line)] text-[var(--color-ink-faint)]'
            }`}
          >
            2D
          </button>
        </div>
      </div>

      {(hasTopicFocus || statusText) && (
        <p
          className="shrink-0 px-2 py-1 text-[10px] text-[var(--color-ink-faint)]"
          aria-live="polite"
        >
          {hasTopicFocus && `Focused ${focusSet!.size} concepts`}
          {hasTopicFocus && statusText ? ' · ' : null}
          {statusText}
        </p>
      )}

      {graphData.nodes.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-[var(--color-ink-faint)]">
          No concepts match the current filters.
        </p>
      ) : (
        <div ref={graphBox.ref} className="relative min-h-0 flex-1 overflow-hidden">
          {hullOverlays.map((hull) => (
            <div
              key={hull.id}
              className="pointer-events-none absolute rounded-full border border-[var(--color-line)]/35 bg-[var(--color-surface-1)]/5"
              style={hull.style}
              aria-hidden
              title={hull.fullName}
            >
              <span
                className="absolute left-1/2 top-2 max-w-[85%] -translate-x-1/2 truncate rounded bg-[var(--color-surface-0)]/80 px-1.5 py-0.5 text-center text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]"
                title={hull.fullName}
              >
                {hull.name}
              </span>
            </div>
          ))}

          {props.tags.length > 0 && (
            <div
              className={`${styles.orbitRing} overflow-hidden`}
              aria-label="Tag filter orbit"
            >
              {props.tags.map((t, i) => {
                const count = props.tags.length;
                const angle = (360 / count) * i;
                const radius = reducedMotion ? 36 : 42;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTag(activeTag === t ? null : t)}
                    aria-pressed={activeTag === t}
                    aria-label={`Filter galaxy by tag ${t}`}
                    className={`${styles.orbitChip} max-w-[7rem] truncate rounded-full border px-1.5 py-0.5 text-[9px] ${
                      activeTag === t
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                    }`}
                    style={{
                      transform: `rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`,
                    }}
                    title={t}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}

          {use3dRenderer && ForceGraph3D ? (
            <ForceGraph3D
              ref={captureGraphRef as never}
              {...graphCommon}
              nodeLabel={(n: { title?: string }) =>
                humanizeConceptTitle(String(n.title ?? '')).slice(0, 28)
              }
              width={graphBox.width}
              height={graphBox.height}
              showNavInfo={false}
              nodeOpacity={nodeOpacityAccessor}
              linkOpacity={hasTopicFocus ? 0.55 : 0.35}
              linkWidth={linkWidthAccessor}
              onEngineStop={onEngineStop}
              onEngineTick={onEngineTick}
            />
          ) : (
            <ForceGraph2D
              ref={captureGraphRef as never}
              {...graphCommon}
              width={graphBox.width}
              height={graphBox.height}
              nodeRelSize={4}
              linkWidth={linkWidthAccessor}
              onEngineStop={onEngineStop}
              onEngineTick={onEngineTick}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={
                paintNode as (
                  node: object,
                  ctx: CanvasRenderingContext2D,
                  globalScale: number,
                ) => void
              }
              linkCanvasObjectMode={() => 'after'}
              linkCanvasObject={(link, ctx, globalScale) => {
                const l = link as {
                  source: { x?: number; y?: number };
                  target: { x?: number; y?: number };
                  __bothFocused?: boolean;
                };
                const sx = l.source.x ?? 0;
                const sy = l.source.y ?? 0;
                const tx = l.target.x ?? 0;
                const ty = l.target.y ?? 0;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
                ctx.strokeStyle = linkColorAccessor(l);
                ctx.lineWidth = linkWidthAccessor(l) / globalScale;
                if (l.__bothFocused && !reducedMotion) {
                  ctx.setLineDash([4 / globalScale, 3 / globalScale]);
                  ctx.lineDashOffset = (Date.now() / 80) % 14;
                } else {
                  ctx.setLineDash([]);
                }
                ctx.stroke();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export const GalaxyView = memo(GalaxyViewInner);
