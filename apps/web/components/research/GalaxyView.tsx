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
import ReactMarkdown from 'react-markdown';
import type {
  ResearchGraphLibraryNest,
  ResearchGraphLink,
  ResearchGraphNode,
} from '@hftr/contracts';
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
  return TAG_COLORS[idx >= 0 ? idx % TAG_COLORS.length : 0] ?? 'var(--color-accent)';
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
  const ringRadius = Math.min(140, 50 + count * 22);
  const centers = new Map<string, LibraryCenter>();

  libIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const meta = libMeta.get(id);
    centers.set(id, {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
      radius: 36 + Math.min(24, (meta?.conceptCount ?? 3) * 2),
      name: meta?.name ?? 'Library',
    });
  });

  return centers;
}

function usageLine(queryCount: number, referenceCount: number): string {
  return `Queried ${queryCount} · Referenced ${referenceCount}`;
}

export interface GalaxyViewProps {
  companyId: string;
  nodes: ResearchGraphNode[];
  links: ResearchGraphLink[];
  tags: string[];
  libraries?: ResearchGraphLibraryNest[];
  focusConceptIds?: string[] | null;
  /** Fly-to and select when set (e.g. article wikilink navigation). */
  highlightConceptId?: string | null;
  selectedLibraryIds?: string[] | null;
  className?: string;
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

  const [mode3d, setMode3d] = useState(true);
  const [threeAvailable, setThreeAvailable] = useState<boolean | null>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<ForceGraph3DComponent | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<ResearchGraphNode | null>(null);
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
    const node = props.nodes.find((n) => n.id === id) ?? null;
    if (node) setSelected(node);
    const fg = graphHandleRef.current;
    if (!fg?.zoomToFit) return;
    const durationMs = reducedMotion ? 0 : 500;
    fg.zoomToFit(durationMs, 64, (n) => String(n.id) === id);
  }, [props.highlightConceptId, props.nodes, reducedMotion]);

  const onNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id === undefined) return;
      const nodeId = String(node.id);
      const full = props.nodes.find((n) => n.id === nodeId) ?? null;
      setSelected(full);
    },
    [props.nodes],
  );

  const nodeColor = useCallback(
    (node: { tags?: string[]; __focused?: boolean }) => {
      const tag = node.tags?.[0];
      const base = tag ? tagColor(tag, props.tags) : 'var(--color-ink-dim)';
      if (hasTopicFocus && node.__focused === false) {
        return 'rgba(120, 130, 150, 0.35)';
      }
      return base;
    },
    [props.tags, hasTopicFocus],
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
      name: c.name,
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
    'flex min-h-[280px] flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)]';

  return (
    <div
      data-testid="galaxy-view"
      role="region"
      className={rootClass}
      aria-label="Research galaxy graph"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-2 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search concepts"
          aria-label="Search galaxy concepts"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex gap-1">
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
        <p className="px-2 py-1 text-[10px] text-[var(--color-ink-faint)]" aria-live="polite">
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
        <div ref={graphBox.ref} className="relative min-h-[220px] flex-1">
          {hullOverlays.map((hull) => (
            <div
              key={hull.id}
              className="pointer-events-none absolute rounded-full border border-[var(--color-line)]/40 bg-[var(--color-surface-1)]/5"
              style={hull.style}
              aria-hidden
            >
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                {hull.name}
              </span>
            </div>
          ))}

          {props.tags.length > 0 && (
            <div className={styles.orbitRing} aria-label="Tag filter orbit">
              {props.tags.map((t, i) => {
                const count = props.tags.length;
                const angle = (360 / count) * i;
                const radius = reducedMotion ? 42 : 48;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTag(activeTag === t ? null : t)}
                    aria-pressed={activeTag === t}
                    aria-label={`Filter galaxy by tag ${t}`}
                    className={`${styles.orbitChip} rounded-full border px-1.5 py-0.5 text-[9px] ${
                      activeTag === t
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                    }`}
                    style={{
                      transform: `rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`,
                    }}
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

          {selected && (
            <div
              className="absolute bottom-0 left-0 right-0 max-h-[55%] overflow-y-auto border-t border-[var(--color-line)] bg-[var(--color-surface-1)]/95 p-2 backdrop-blur"
              role="region"
              aria-label={`Concept detail: ${selected.title}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--color-ink)]">
                  {selected.title}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close concept detail"
                  className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                >
                  ×
                </button>
              </div>
              {selected.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selected.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px]"
                      style={{ color: tagColor(t, props.tags) }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[9px] text-[var(--color-ink-faint)]">
                {usageLine(selected.queryCount ?? 0, selected.referenceCount ?? 0)}
              </p>
              <div className="prose prose-invert mt-2 max-w-none text-[11px] text-[var(--color-ink-dim)] prose-p:my-1 prose-headings:my-1 prose-headings:text-[var(--color-ink)]">
                <ReactMarkdown>{selected.body}</ReactMarkdown>
              </div>
              <dl className="mt-2 space-y-0.5 text-[9px] text-[var(--color-ink-faint)]">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="sr-only">Source class</dt>
                  <dd>{selected.sourceClass.replace(/_/g, ' ')}</dd>
                  <dt className="sr-only">Concept status</dt>
                  <dd>· {selected.status}</dd>
                </div>
                {selected.curationStatus && (
                  <div>
                    <dt className="inline">Library admission: </dt>
                    <dd className="inline text-[var(--color-ink-dim)]">
                      {selected.curationStatus.replace(/_/g, ' ')}
                    </dd>
                  </div>
                )}
                {selected.sourceRef && (
                  <div>
                    <dt className="inline">Evidence ref: </dt>
                    <dd className="inline break-all text-[var(--color-ink-dim)]">
                      {selected.sourceRef}
                    </dd>
                  </div>
                )}
                {selected.researchRunId && (
                  <div>
                    <dt className="inline">Research run: </dt>
                    <dd className="inline break-all text-[var(--color-ink-dim)]">
                      {selected.researchRunId}
                    </dd>
                  </div>
                )}
                {!selected.curationStatus && !selected.sourceRef && !selected.researchRunId && (
                  <p>No research-bus provenance on this concept yet.</p>
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const GalaxyView = memo(GalaxyViewInner);
