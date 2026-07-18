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
} from 'react';
import { forceCollide, forceManyBody } from 'd3-force-3d';
import type {
  ResearchGraphLibraryNest,
  ResearchGraphLink,
  ResearchGraphNode,
} from '@hftr/contracts';
import {
  chargeStrengthForGraphSize,
  computeLibraryCenters3D,
  createLibraryNestForce,
  hashSpread3D,
  linkDistanceForWeight,
  linkStrengthForWeight,
  type GalaxySimNode,
} from '@/lib/galaxy-physics';
import {
  buildCompanyHullNode,
  buildLibraryHullNodes,
  isNestHullNode,
  type NestHullNode,
} from '@/lib/galaxy-nest-hulls';
import { createNestHullObject3d, paintNestHull2d } from '@/lib/galaxy-nest-mesh';
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
  d3Force?: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation?: () => void;
  width?: (w?: number) => number | ForceGraphHandle;
  height?: (h?: number) => number | ForceGraphHandle;
  cameraPosition?: (
    pos?: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    transitionMs?: number,
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

const TAG_COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#c0caf5'];

function tagColor(tag: string, tags: readonly string[]): string {
  const idx = tags.indexOf(tag);
  return TAG_COLORS[idx >= 0 ? idx % TAG_COLORS.length : 0] ?? '#7aa2f7';
}

export interface GalaxyViewProps {
  companyId: string;
  nodes: ResearchGraphNode[];
  links: ResearchGraphLink[];
  tags: string[];
  libraries?: ResearchGraphLibraryNest[];
  focusConceptIds?: string[] | null;
  highlightConceptId?: string | null;
  selectedLibraryIds?: string[] | null;
  className?: string;
  onInspectConcept?: (conceptId: string) => void;
  onGraphInvalidated?: () => void;
}

function useGraphDimensions() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const applySize = useCallback((width: number, height: number) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  // Callback ref: container mounts only after concepts load — effect([]) would miss it.
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el) return;

      const measure = () => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) applySize(rect.width, rect.height);
      };
      measure();

      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) applySize(width, height);
        else measure();
      });
      ro.observe(el);
      observerRef.current = ro;
    },
    [applySize],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref: setRef, ...size };
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
  const [statusText, setStatusText] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [physicsReady, setPhysicsReady] = useState(false);
  const graphBox = useGraphDimensions();
  const graphHandleRef = useRef<ForceGraphHandle | null>(null);
  const physicsSignatureRef = useRef('');
  const layoutCommittedRef = useRef(new Set<string>());

  /** Prefer 3D always; 2D only for WebGL failure or explicit toggle (TD-09). */
  const prefer2dFallback = false;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (prefer2dFallback) return;
    let cancelled = false;
    void loadForceGraph3D()
      .then((mod) => {
        if (cancelled) return;
        setForceGraph3D(() => mod.default);
        setThreeAvailable(true);
        setMode3d(true);
      })
      .catch(() => {
        if (cancelled) return;
        setThreeAvailable(false);
        setMode3d(false);
        setStatusText('3D renderer unavailable — showing 2D physics fallback.');
      });
    return () => {
      cancelled = true;
    };
  }, [prefer2dFallback]);

  const libraryCenters = useMemo(
    () =>
      computeLibraryCenters3D(
        libraryNests,
        props.nodes.map((n) => ({ primaryLibraryId: n.primaryLibraryId ?? null })),
      ),
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
    const liveIds = new Set<string>();
    const conceptNodes = props.nodes
      .filter((n) => filteredNodeIds.has(n.id))
      .map((n) => {
        liveIds.add(n.id);
        const degree = degreeById.get(n.id) ?? 0;
        const refs = n.referenceCount ?? 0;
        const libId = n.primaryLibraryId;
        const center = libId ? libraryCenters.get(libId) : null;
        const focused = !focusSet || focusSet.has(n.id);
        const base = {
          ...n,
          val: Math.max(1.2, degree * 0.7 + refs * 0.4 + 1),
          __focused: focused,
        };
        // Seed nest coordinates until the sim has committed this id (keeps d3 positions).
        if (!layoutCommittedRef.current.has(n.id)) {
          const spread = hashSpread3D(n.id);
          return {
            ...base,
            x: center ? center.x + spread.dx : spread.dx * 0.5,
            y: center ? center.y + spread.dy : spread.dy * 0.5,
            z: center ? center.z + spread.dz : spread.dz * 0.5,
          };
        }
        return base;
      });

    const libraryHulls = buildLibraryHullNodes(libraryCenters, libraryFilter);
    const companyHull = buildCompanyHullNode(libraryCenters, libraryFilter);
    const hullNodes: NestHullNode[] = companyHull
      ? [companyHull, ...libraryHulls]
      : libraryHulls;

    const nodes = [...conceptNodes, ...hullNodes];
    const nodeSet = new Set(conceptNodes.map((n) => n.id));
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
          __distance: linkDistanceForWeight(l.weightBand, l.relation),
          __strength: linkStrengthForWeight(l.weightBand),
          __directed:
            l.relation === 'causes' ||
            l.relation === 'supports' ||
            l.relation === 'derived_from',
        };
      });
    return { nodes, links, liveIds, hullCount: hullNodes.length };
  }, [
    props.nodes,
    props.links,
    filteredNodeIds,
    degreeById,
    libraryCenters,
    libraryFilter,
    focusSet,
  ]);

  useEffect(() => {
    for (const id of graphData.liveIds) {
      layoutCommittedRef.current.add(id);
    }
    for (const id of [...layoutCommittedRef.current]) {
      if (!graphData.liveIds.has(id)) layoutCommittedRef.current.delete(id);
    }
  }, [graphData]);

  const use3dRenderer = mode3d && threeAvailable === true && ForceGraph3D !== null;
  const hasTopicFocus = focusSet !== null && focusSet.size > 0;
  const graphWidth = graphBox.width > 0 ? graphBox.width : undefined;
  const graphHeight = graphBox.height > 0 ? graphBox.height : undefined;

  const configurePhysics = useCallback(
    (fg: ForceGraphHandle) => {
      if (!fg.d3Force) return;
      try {
        const linkForce = fg.d3Force('link') as
          | {
              distance?: (fn: (l: { __distance?: number }) => number) => unknown;
              strength?: (fn: (l: { __strength?: number }) => number) => unknown;
              iterations?: (n: number) => unknown;
            }
          | undefined;
        linkForce?.distance?.((l) => l.__distance ?? 48);
        linkForce?.strength?.((l) => l.__strength ?? 0.5);
        linkForce?.iterations?.(2);

        fg.d3Force(
          'charge',
          forceManyBody()
            .strength((node: unknown) => {
              const n = node as GalaxySimNode & { __kind?: string };
              if (n.__kind === 'nest-hull') return 0;
              return chargeStrengthForGraphSize(
                Math.max(1, graphData.nodes.length - graphData.hullCount),
              );
            })
            .distanceMax(420),
        );

        const center = fg.d3Force('center') as { strength?: (n: number) => unknown } | undefined;
        center?.strength?.(0.05);

        fg.d3Force(
          'collide',
          forceCollide((node: unknown) => {
            const n = node as GalaxySimNode & { __kind?: string };
            return n.__kind === 'nest-hull' ? 0 : Math.cbrt(n.val ?? 1) * 4.2;
          })
            .strength(0.85)
            .iterations(2),
        );
        fg.d3Force('nest', createLibraryNestForce(libraryCenters));

        fg.d3ReheatSimulation?.();
        setPhysicsReady(true);
      } catch {
        setStatusText('Physics reheat deferred — layout still settling.');
      }
    },
    [graphData.nodes.length, graphData.hullCount, libraryCenters],
  );

  // Stable imperative handle — avoid callback-ref identity churn (causes tick races).
  const bindGraphRef = useCallback((instance: ForceGraphHandle | null) => {
    graphHandleRef.current = instance;
    if (!instance) setPhysicsReady(false);
  }, []);

  useEffect(() => {
    const fg = graphHandleRef.current;
    if (!fg?.d3Force) return;
    const sig = `${graphData.nodes.length}:${graphData.links.length}:${libraryCenters.size}:${use3dRenderer}`;
    if (physicsSignatureRef.current === sig && physicsReady) return;
    physicsSignatureRef.current = sig;
    const frame = requestAnimationFrame(() => {
      if (graphHandleRef.current === fg) configurePhysics(fg);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    configurePhysics,
    graphData.links.length,
    graphData.nodes.length,
    libraryCenters.size,
    physicsReady,
    use3dRenderer,
  ]);

  useEffect(() => {
    const fg = graphHandleRef.current;
    if (!fg || graphWidth === undefined || graphHeight === undefined) return;
    try {
      fg.width?.(graphWidth);
      fg.height?.(graphHeight);
    } catch {
      // Renderer may not expose size methods until mounted.
    }
  }, [graphWidth, graphHeight, use3dRenderer]);

  const fitFocusedNodes = useCallback(() => {
    if (!focusSet || focusSet.size === 0) return;
    const fg = graphHandleRef.current;
    if (!fg?.zoomToFit) return;
    const durationMs = reducedMotion ? 0 : 500;
    fg.zoomToFit(durationMs, 56, (node) => {
      if (node.id === undefined || isNestHullNode(node)) return false;
      return focusSet.has(String(node.id));
    });
  }, [focusSet, reducedMotion]);

  useEffect(() => {
    if (!hasTopicFocus || !physicsReady) return;
    const frame = requestAnimationFrame(() => fitFocusedNodes());
    return () => cancelAnimationFrame(frame);
  }, [hasTopicFocus, fitFocusedNodes, use3dRenderer, graphData.nodes.length, physicsReady]);

  useEffect(() => {
    const id = props.highlightConceptId;
    if (!id || !physicsReady) return;
    const fg = graphHandleRef.current;
    if (!fg?.zoomToFit) return;
    const durationMs = reducedMotion ? 0 : 650;
    const t = window.setTimeout(() => {
      fg.zoomToFit?.(durationMs, 72, (n) => String(n.id) === id);
    }, reducedMotion ? 0 : 120);
    return () => window.clearTimeout(t);
  }, [props.highlightConceptId, props.nodes, reducedMotion, physicsReady]);

  const onNodeClick = useCallback(
    (node: { id?: string | number; __kind?: string }) => {
      if (node.id === undefined || isNestHullNode(node)) return;
      props.onInspectConcept?.(String(node.id));
    },
    [props],
  );

  const nodeThreeObject = useCallback((node: object) => {
    if (!isNestHullNode(node as NestHullNode)) return undefined;
    return createNestHullObject3d(node as NestHullNode);
  }, []);

  const nodeColor = useCallback(
    (node: {
      id?: string | number;
      tags?: string[];
      __focused?: boolean;
      __kind?: string;
      __color?: string;
    }) => {
      if (isNestHullNode(node)) return node.__color ?? '#4a5568';
      const tag = node.tags?.[0];
      const base = tag ? tagColor(tag, props.tags) : '#9aa4b8';
      if (props.highlightConceptId && String(node.id) === props.highlightConceptId) {
        return '#7aa2f7';
      }
      if (hasTopicFocus && node.__focused === false) {
        return 'rgba(120, 130, 150, 0.28)';
      }
      return base;
    },
    [props.tags, props.highlightConceptId, hasTopicFocus],
  );

  const paintNode2d = useCallback(
    (
      node: {
        id?: string | number;
        x?: number;
        y?: number;
        tags?: string[];
        __focused?: boolean;
        title?: string;
        __kind?: string;
        __hullKind?: string;
        __radius?: number;
        __color?: string;
        __label?: string;
      },
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      if (paintNestHull2d(node, ctx, globalScale)) return;

      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isHighlight = Boolean(
        props.highlightConceptId && String(node.id) === props.highlightConceptId,
      );
      const isFocused = !hasTopicFocus || node.__focused !== false;
      const r = (isHighlight ? 7 : isFocused ? 4.5 : 3) / Math.max(globalScale * 0.35, 0.5);
      const fill = nodeColor(node);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isHighlight ? '#7aa2f7' : fill;
      ctx.globalAlpha = hasTopicFocus && node.__focused === false ? 0.28 : 0.95;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHighlight || (isFocused && globalScale > 1.35)) {
        const label = humanizeConceptTitle(node.title ?? '');
        if (label) {
          const fontSize = Math.max(8 / globalScale, 2);
          const maxChars = isHighlight ? 36 : 22;
          const text = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
          ctx.font = `${isHighlight ? 600 : 400} ${fontSize}px sans-serif`;
          const metrics = ctx.measureText(text);
          const pad = 2 / globalScale;
          ctx.fillStyle = 'rgba(12, 16, 24, 0.72)';
          ctx.fillRect(
            x - (metrics.width + pad * 2) / 2,
            y + r + 1 / globalScale,
            metrics.width + pad * 2,
            fontSize + pad * 2,
          );
          ctx.fillStyle = isHighlight ? '#e8ecf4' : 'rgba(200, 210, 230, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(text, x, y + r + pad + 1 / globalScale);
        }
      }
    },
    [hasTopicFocus, nodeColor, props.highlightConceptId],
  );

  const linkColor = useCallback(
    (link: { __bothFocused?: boolean; __eitherFocused?: boolean; weightBand?: string }) => {
      if (hasTopicFocus) {
        if (link.__bothFocused) return '#7aa2f7';
        if (link.__eitherFocused) return 'rgba(122, 162, 247, 0.28)';
        return 'rgba(80, 90, 110, 0.1)';
      }
      if (link.weightBand === 'strong') return 'rgba(122, 162, 247, 0.55)';
      if (link.weightBand === 'weak') return 'rgba(120, 130, 150, 0.22)';
      return 'rgba(140, 150, 170, 0.35)';
    },
    [hasTopicFocus],
  );

  const linkWidth = useCallback(
    (link: { __bothFocused?: boolean; weightBand?: string }) => {
      if (link.__bothFocused) return 2.4;
      if (link.weightBand === 'strong') return 1.6;
      if (link.weightBand === 'weak') return 0.6;
      return 1;
    },
    [],
  );

  const linkParticles = useCallback(
    (link: { __bothFocused?: boolean; weightBand?: string }) => {
      if (reducedMotion) return 0;
      if (link.__bothFocused) return 3;
      if (link.weightBand === 'strong') return 2;
      return 1;
    },
    [reducedMotion],
  );

  const linkParticleWidth = useCallback(
    (link: { __bothFocused?: boolean; weightBand?: string }) => {
      if (link.__bothFocused) return 2.2;
      if (link.weightBand === 'strong') return 1.6;
      return 1;
    },
    [],
  );

  const linkParticleSpeed = useCallback(
    (link: { __bothFocused?: boolean; weightBand?: string }) => {
      if (link.__bothFocused) return 0.008;
      if (link.weightBand === 'strong') return 0.006;
      return 0.004;
    },
    [],
  );

  const rootClass =
    props.className ??
    'flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)]';

  return (
    <div
      data-testid="galaxy-view"
      role="region"
      className={`${rootClass} flex min-h-0 flex-col overflow-hidden`}
      aria-label="Research galaxy graph"
      data-physics={physicsReady ? 'ready' : 'warming'}
      data-renderer={use3dRenderer ? '3d' : '2d'}
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
              if (threeAvailable === false) {
                setStatusText('3D renderer unavailable — showing 2D physics fallback.');
                return;
              }
              setMode3d(true);
              setStatusText(null);
            }}
            aria-pressed={mode3d && threeAvailable !== false}
            className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              mode3d && threeAvailable !== false
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
              setStatusText('2D fallback — springs + charge still apply in plane.');
            }}
            aria-pressed={!mode3d || threeAvailable === false}
            className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              !mode3d || threeAvailable === false
                ? 'border border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border border-[var(--color-line)] text-[var(--color-ink-faint)]'
            }`}
          >
            2D
          </button>
        </div>
      </div>

      {(hasTopicFocus || statusText || use3dRenderer) && (
        <p
          className="shrink-0 px-2 py-1 text-[10px] text-[var(--color-ink-faint)]"
          aria-live="polite"
        >
          {use3dRenderer && !statusText
            ? '3D physics space · nest sphere outlines · link springs'
            : null}
          {use3dRenderer && (hasTopicFocus || statusText) ? ' · ' : null}
          {hasTopicFocus && `Focused ${focusSet!.size} concepts`}
          {hasTopicFocus && statusText ? ' · ' : null}
          {statusText}
        </p>
      )}

      {libraryCenters.size > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-line)] px-2 py-1">
          {[...libraryCenters.entries()].map(([id, c]) => (
            <span
              key={id}
              title={c.name}
              className="shrink-0 rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-faint)]"
            >
              {shortLibraryLabel(c.name, 18)}
            </span>
          ))}
        </div>
      )}

      {graphData.nodes.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-[var(--color-ink-faint)]">
          No concepts match the current filters.
        </p>
      ) : (
        <div ref={graphBox.ref} className="relative min-h-0 flex-1 overflow-hidden bg-[#070a10]">
          {props.tags.length > 0 && (
            <div className={`${styles.orbitRing} overflow-hidden`} aria-label="Tag filter orbit">
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
                    title={t}
                    className={`${styles.orbitChip} max-w-[7rem] truncate rounded-full border px-1.5 py-0.5 text-[9px] ${
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

          {!graphWidth || !graphHeight ? (
            <p className="flex h-full items-center justify-center text-[10px] text-[var(--color-ink-faint)]">
              Measuring galaxy viewport…
            </p>
          ) : use3dRenderer && ForceGraph3D ? (
            <ForceGraph3D
              ref={bindGraphRef as never}
              graphData={graphData}
              width={graphWidth}
              height={graphHeight}
              backgroundColor="#070a10"
              numDimensions={3}
              forceEngine="d3"
              controlType="orbit"
              warmupTicks={reducedMotion ? 0 : 80}
              cooldownTicks={reducedMotion ? 0 : 120}
              d3AlphaDecay={0.022}
              d3VelocityDecay={0.32}
              nodeLabel={(n: { title?: string; __kind?: string; __label?: string }) =>
                isNestHullNode(n)
                  ? String(n.__label ?? n.title ?? '')
                  : humanizeConceptTitle(String(n.title ?? '')).slice(0, 40)
              }
              nodeVal="val"
              nodeRelSize={4.2}
              nodeOpacity={hasTopicFocus ? 0.95 : 0.9}
              nodeColor={nodeColor as (node: object) => string}
              nodeThreeObject={nodeThreeObject as (node: object) => object | undefined}
              nodeThreeObjectExtend={false}
              linkColor={linkColor as (link: object) => string}
              linkWidth={linkWidth as (link: object) => number}
              linkOpacity={0.55}
              linkCurvature={0.12}
              linkDirectionalArrowLength={(link: { __directed?: boolean }) =>
                link.__directed ? 3.2 : 0
              }
              linkDirectionalArrowRelPos={1}
              linkDirectionalParticles={linkParticles as (link: object) => number}
              linkDirectionalParticleWidth={linkParticleWidth as (link: object) => number}
              linkDirectionalParticleSpeed={linkParticleSpeed as (link: object) => number}
              linkDirectionalParticleColor={() => '#7aa2f7'}
              showNavInfo={false}
              enableNodeDrag={!reducedMotion}
              onNodeClick={onNodeClick}
              onEngineStop={() => {
                if (hasTopicFocus) fitFocusedNodes();
              }}
            />
          ) : threeAvailable === false || !mode3d ? (
            <ForceGraph2D
              ref={bindGraphRef as never}
              graphData={graphData}
              width={graphWidth}
              height={graphHeight}
              backgroundColor="#070a10"
              warmupTicks={reducedMotion ? 0 : 40}
              cooldownTicks={reducedMotion ? 0 : 80}
              d3AlphaDecay={0.025}
              d3VelocityDecay={0.35}
              nodeLabel="title"
              nodeRelSize={4}
              nodeColor={nodeColor as (node: object) => string}
              linkColor={linkColor as (link: object) => string}
              linkWidth={linkWidth as (link: object) => number}
              linkDirectionalParticles={linkParticles as (link: object) => number}
              linkDirectionalParticleWidth={linkParticleWidth as (link: object) => number}
              onNodeClick={onNodeClick}
              nodeCanvasObjectMode={() => 'replace'}
              nodeCanvasObject={
                paintNode2d as (
                  node: object,
                  ctx: CanvasRenderingContext2D,
                  globalScale: number,
                ) => void
              }
            />
          ) : (
            <p className="flex h-full items-center justify-center text-[10px] text-[var(--color-ink-faint)]">
              Loading 3D physics engine…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const GalaxyView = memo(GalaxyViewInner);
