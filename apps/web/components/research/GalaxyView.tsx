'use client';

import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { forceCollide, forceManyBody } from 'd3-force-3d';
import type {
  ResearchGraphArticleOrbit,
  ResearchGraphFolderStar,
  ResearchGraphLibraryNest,
  ResearchGraphLink,
  ResearchGraphNode,
} from '@hftr/contracts';
import {
  chargeStrengthForGraphSize,
  combineLinkLayout,
  computeArticleOrbitCenters3D,
  computeFolderCenters3D,
  computeLibraryCenters3D,
  computeVolumeCameraPose,
  createArticleHullOrbitForce,
  createArticleOrbitForce,
  createFolderCohereForce,
  createFolderNestForce,
  createFolderShellRadialForce,
  createForeignLibraryRepelForce,
  createLibraryNestForce,
  createNestShellRadialForce,
  createTagSatelliteForce,
  hierarchicalLinkScale,
  hashSpread3D,
  nestPackingSignature,
  type GalaxySimNode,
} from '@/lib/galaxy-physics';
import {
  buildConceptArticleIndex,
  buildConceptFolderIndex,
  buildTagSatelliteNodes,
  similarityBandForLink,
} from '@/lib/galaxy-hierarchy';
import { buildSemanticGalaxyLinks } from '@/lib/galaxy-semantic-springs';
import {
  buildArticleHullNodes,
  buildCompanyHullNode,
  buildFolderHullNodes,
  buildLibraryHullNodes,
  isNestHullNode,
  isTagSatelliteNode,
  type NestHullNode,
} from '@/lib/galaxy-nest-hulls';
import { resolveNestEmphasis, type NestEmphasisContext } from '@/lib/galaxy-nest-emphasis';
import {
  applyNestHullEmphasis,
  createNestHullObject3d,
  paintNestHull2d,
  type NestEmphasis,
} from '@/lib/galaxy-nest-mesh';
import {
  celestialKindForConcept,
  celestialKindForTagSatellite,
  createCelestialObject3d,
  paintCelestial2d,
} from '@/lib/galaxy-celestial';
import {
  conceptHoverLines,
  linkHoverLines,
  nestHoverLines,
  tagHoverLines,
} from '@/lib/galaxy-hover-labels';
import { humanizeConceptTitle, shortLibraryLabel } from '@/lib/research-library-shelves';
import styles from './galaxy-view.module.css';
import type * as THREE from 'three';

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
  ) => { x: number; y: number; z: number } | void;
  controls?: () => {
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    enableDamping?: boolean;
  } | null;
  graph2ScreenCoords?: (
    x: number,
    y: number,
    z?: number,
  ) => { x: number; y: number } | undefined;
  scene?: () => { traverse: (cb: (obj: THREE.Object3D) => void) => void };
  graphData?: () => {
    nodes: Array<{
      id?: string | number;
      x?: number;
      y?: number;
      z?: number;
      __kind?: string;
      primaryLibraryId?: string | null;
    }>;
  };
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
  folders?: ResearchGraphFolderStar[];
  articles?: ResearchGraphArticleOrbit[];
  focusConceptIds?: string[] | null;
  highlightConceptId?: string | null;
  selectedLibraryIds?: string[] | null;
  /** When true, show loading copy instead of “no matches”. */
  loading?: boolean;
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
  const folderStars = props.folders ?? [];
  const articleOrbits = props.articles ?? [];
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredHullId, setHoveredHullId] = useState<string | null>(null);
  const [selectedHullId, setSelectedHullId] = useState<string | null>(null);
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<{
    lines: string[];
    x: number;
    y: number;
    /** Graph node id used to re-project label onto the point while camera moves. */
    anchorId: string | null;
  } | null>(null);
  const graphBox = useGraphDimensions();
  const graphHandleRef = useRef<ForceGraphHandle | null>(null);
  const physicsSignatureRef = useRef('');
  const packingSignatureRef = useRef('');
  const layoutCommittedRef = useRef(new Set<string>());
  const volumeFitDoneRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const graphSurfaceRef = useRef<HTMLDivElement | null>(null);

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

  const conceptFolderIndex = useMemo(() => buildConceptFolderIndex(folderStars), [folderStars]);

  const conceptArticleIndex = useMemo(
    () => buildConceptArticleIndex(articleOrbits),
    [articleOrbits],
  );

  const folderCenters = useMemo(
    () =>
      computeFolderCenters3D({
        libraryCenters,
        folders: folderStars.map((folder) => ({
          folderKey: folder.folderKey,
          libraryId: folder.libraryId,
          label: folder.label,
          mass: folder.mass,
          memberCount: folder.memberConceptIds.length,
        })),
      }),
    [libraryCenters, folderStars],
  );

  const packingSig = useMemo(() => {
    const libSig = nestPackingSignature(libraryCenters);
    const folderParts: string[] = [];
    for (const [id, c] of [...folderCenters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      folderParts.push(
        `${id}:${Math.round(c.x)}:${Math.round(c.y)}:${Math.round(c.z)}:${Math.round(c.radius)}`,
      );
    }
    return `${libSig}||${folderParts.join('|')}`;
  }, [libraryCenters, folderCenters]);

  // Sync clear during render so the same frame that gets a new packing signature
  // also reseeds concept coords (effect-only clear races after graphData commits).
  if (packingSignatureRef.current !== packingSig) {
    packingSignatureRef.current = packingSig;
    layoutCommittedRef.current.clear();
    volumeFitDoneRef.current = false;
  }

  // When Fibonacci shells move, drop stale d3 seeds so concepts re-seed into volume (D-116 P1b).
  useEffect(() => {
    layoutCommittedRef.current.clear();
    volumeFitDoneRef.current = false;
  }, [packingSig]);

  const articleCenters = useMemo(
    () =>
      computeArticleOrbitCenters3D({
        articles: articleOrbits.map((article) => ({
          topicId: article.topicId,
          title: article.title,
          libraryId: article.libraryId,
          folderKey: article.folderKey,
          memberCount: article.memberConceptIds.length,
        })),
        libraryCenters,
        folderCenters,
      }),
    [articleOrbits, libraryCenters, folderCenters],
  );

  const nodeLookupById = useMemo(
    () => new Map(props.nodes.map((node) => [node.id, node])),
    [props.nodes],
  );

  const degreeById = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of props.links) {
      map.set(link.fromConceptId, (map.get(link.fromConceptId) ?? 0) + 1);
      map.set(link.toConceptId, (map.get(link.toConceptId) ?? 0) + 1);
    }
    return map;
  }, [props.links]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of props.links) {
      const a = map.get(link.fromConceptId) ?? new Set<string>();
      a.add(link.toConceptId);
      map.set(link.fromConceptId, a);
      const b = map.get(link.toConceptId) ?? new Set<string>();
      b.add(link.fromConceptId);
      map.set(link.toConceptId, b);
    }
    return map;
  }, [props.links]);

  const libraryNameById = useMemo(
    () => new Map(libraryNests.map((lib) => [lib.id, lib.name])),
    [libraryNests],
  );

  const folderLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folderStars) {
      map.set(`${folder.libraryId}::${folder.folderKey}`, folder.label);
    }
    return map;
  }, [folderStars]);

  const articleTitleById = useMemo(
    () => new Map(articleOrbits.map((article) => [article.topicId, article.title])),
    [articleOrbits],
  );

  const hoverNeighborIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    const neighbors = adjacency.get(hoveredNodeId);
    if (neighbors) for (const id of neighbors) set.add(id);
    return set;
  }, [hoveredNodeId, adjacency]);

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
        const folderMembership = conceptFolderIndex.get(n.id);
        const primaryFolderKey = folderMembership?.folderKey ?? null;
        const primaryArticleId = conceptArticleIndex.get(n.id) ?? null;
        const articleCenter = primaryArticleId ? articleCenters.get(primaryArticleId) : null;
        const folderCenter =
          libId && primaryFolderKey ? folderCenters.get(`${libId}::${primaryFolderKey}`) : null;
        const libCenter = libId ? libraryCenters.get(libId) : null;
        const center = articleCenter ?? folderCenter ?? libCenter ?? null;
        const focused = !focusSet || focusSet.has(n.id);
        const base = {
          ...n,
          primaryFolderKey,
          primaryArticleId,
          val: Math.max(1.2, degree * 0.7 + refs * 0.4 + 1),
          __focused: focused,
        };
        // Seed on a shell around article / folder / library (D-142) so sparse-link
        // catalogs start in shelf rings instead of a coincident cloud.
        if (!layoutCommittedRef.current.has(n.id)) {
          const spread = hashSpread3D(n.id);
          const mag = Math.hypot(spread.dx, spread.dy, spread.dz) || 1;
          let band = 0.55;
          for (let i = 0; i < n.id.length; i++) band = (band * 31 + n.id.charCodeAt(i)) % 100;
          const shellR = center
            ? Math.max(12, center.radius * (0.4 + (Math.abs(band) % 45) / 100))
            : 48;
          return {
            ...base,
            x: center ? center.x + (spread.dx / mag) * shellR : spread.dx,
            y: center ? center.y + (spread.dy / mag) * shellR : spread.dy,
            z: center ? center.z + (spread.dz / mag) * shellR : spread.dz,
          };
        }
        return base;
      });

    const tagSatellites = buildTagSatelliteNodes(conceptNodes);

    const libraryHulls = buildLibraryHullNodes(libraryCenters, libraryFilter);
    // All folders/articles in scope — no LOD cap (D-141). Library chips still filter.
    const folderInputs = [...folderCenters.values()]
      .filter((center) => !libraryFilter || libraryFilter.has(center.libraryId))
      .map((center) => ({
        libraryId: center.libraryId,
        folderKey: center.folderKey,
        label: center.name,
        x: center.x,
        y: center.y,
        z: center.z,
        radius: center.radius,
        mass: center.mass,
      }));
    const folderHulls = buildFolderHullNodes(folderInputs);
    const articleCandidates = [...articleCenters.values()].filter(
      (center) => !center.libraryId || !libraryFilter || libraryFilter.has(center.libraryId),
    );
    const articleHulls = buildArticleHullNodes(
      articleCandidates.map((center) => ({
        topicId: center.topicId,
        title: center.title,
        x: center.x,
        y: center.y,
        z: center.z,
        radius: center.radius,
        libraryId: center.libraryId,
        folderKey: center.folderKey,
        memberCount: Math.max(1, Math.round((center.radius - 12) / 2.4)),
      })),
    );
    const companyHull = buildCompanyHullNode(libraryCenters, libraryFilter);
    const hullNodes: NestHullNode[] = [
      companyHull,
      ...libraryHulls,
      ...folderHulls,
      ...articleHulls,
    ];

    const nodes = [...conceptNodes, ...tagSatellites, ...hullNodes];
    const nodeSet = new Set(conceptNodes.map((n) => n.id));
    const persisted = props.links.filter(
      (l) => nodeSet.has(l.fromConceptId) && nodeSet.has(l.toConceptId),
    );
    const semantic = buildSemanticGalaxyLinks(conceptNodes, persisted, articleOrbits);
    const mergedLinks = [
      ...persisted.map((l) => ({ ...l, __semantic: false as const, __semanticKind: null as null })),
      ...semantic,
    ];
    const links = mergedLinks.map((l) => {
        const bothFocused =
          focusSet !== null && focusSet.has(l.fromConceptId) && focusSet.has(l.toConceptId);
        const eitherFocused =
          focusSet !== null && (focusSet.has(l.fromConceptId) || focusSet.has(l.toConceptId));
        const fromNode = nodeLookupById.get(l.fromConceptId);
        const toNode = nodeLookupById.get(l.toConceptId);
        const similarityBand =
          'similarityBand' in l && l.similarityBand
            ? l.similarityBand
            : similarityBandForLink(fromNode, toNode);
        const layout = combineLinkLayout(l.weightBand, l.relation, similarityBand);
        const fromLib = fromNode?.primaryLibraryId ?? null;
        const toLib = toNode?.primaryLibraryId ?? null;
        const fromFolder = conceptFolderIndex.get(l.fromConceptId);
        const toFolder = conceptFolderIndex.get(l.toConceptId);
        const fromArticle = conceptArticleIndex.get(l.fromConceptId) ?? null;
        const toArticle = conceptArticleIndex.get(l.toConceptId) ?? null;
        const sameArticle = Boolean(fromArticle && toArticle && fromArticle === toArticle);
        const sameFolder = Boolean(
          fromFolder &&
            toFolder &&
            fromFolder.libraryId === toFolder.libraryId &&
            fromFolder.folderKey === toFolder.folderKey,
        );
        const sameLibrary = Boolean(fromLib && toLib && fromLib === toLib);
        const hierarchy = hierarchicalLinkScale({
          sameLibrary,
          sameFolder,
          sameArticle,
          similarityBand,
        });
        return {
          ...l,
          source: l.fromConceptId,
          target: l.toConceptId,
          __bothFocused: bothFocused,
          __eitherFocused: eitherFocused,
          __distance: layout.distance * hierarchy.distanceMul,
          __strength: layout.strength * hierarchy.strengthMul,
          __similarityBand: similarityBand,
          __directed:
            !('__semantic' in l && l.__semantic) &&
            (l.relation === 'causes' || l.relation === 'supports' || l.relation === 'derived_from'),
        };
      });
    return { nodes, links, liveIds, hullCount: hullNodes.length };
  }, [
    props.nodes,
    props.links,
    articleOrbits,
    filteredNodeIds,
    degreeById,
    libraryCenters,
    folderCenters,
    articleCenters,
    conceptFolderIndex,
    conceptArticleIndex,
    nodeLookupById,
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
        linkForce?.iterations?.(4);

        const baseCharge = chargeStrengthForGraphSize(
          Math.max(1, graphData.nodes.length - graphData.hullCount),
        );

        fg.d3Force(
          'charge',
          forceManyBody()
            .strength((node: unknown) => {
              const n = node as GalaxySimNode & { __kind?: string; __hullKind?: string };
              if (n.__kind === 'nest-hull') {
                // Article stars need repulsion so hubs don't stack (D-139 / D-142).
                return n.__hullKind === 'article' ? baseCharge * 0.45 : 0;
              }
              if (n.__kind === 'tag-sat') return baseCharge * 0.28;
              return baseCharge;
            })
            .distanceMax(240),
        );

        const center = fg.d3Force('center') as { strength?: (n: number) => unknown } | undefined;
        // Near-zero — free-float cloud; Fit frames the envelope (D-136).
        center?.strength?.(0.0015);

        fg.d3Force(
          'collide',
          forceCollide((node: unknown) => {
            const n = node as GalaxySimNode & { __kind?: string; __hullKind?: string; val?: number };
            if (n.__kind === 'nest-hull') {
              return n.__hullKind === 'article' ? Math.max(10, Math.cbrt(n.val ?? 1) * 5.5) : 0;
            }
            if (n.__kind === 'tag-sat') return Math.cbrt(n.val ?? 0.35) * 2.4;
            return Math.cbrt(n.val ?? 1) * 3.2;
          })
            .strength(0.75)
            .iterations(2),
        );
        fg.d3Force('nest', createLibraryNestForce(libraryCenters));
        fg.d3Force('nestShell', createNestShellRadialForce(libraryCenters));
        fg.d3Force('folderNest', createFolderNestForce(folderCenters));
        fg.d3Force('folderShell', createFolderShellRadialForce(folderCenters));
        fg.d3Force('folderCohere', createFolderCohereForce());
        fg.d3Force('foreignRepel', createForeignLibraryRepelForce(libraryCenters));
        fg.d3Force('articleOrbit', createArticleOrbitForce(articleCenters));
        fg.d3Force('articleHullOrbit', createArticleHullOrbitForce(folderCenters));
        fg.d3Force('tagSat', createTagSatelliteForce());

        fg.d3ReheatSimulation?.();
        setPhysicsReady(true);
      } catch {
        setStatusText('Physics reheat deferred — layout still settling.');
      }
    },
    [graphData.nodes.length, graphData.hullCount, libraryCenters, folderCenters, articleCenters],
  );

  // Stable imperative handle — configure nest forces immediately so warmup ticks
  // do not collapse the cloud to the origin before custom forces exist (D-132).
  const bindGraphRef = useCallback(
    (instance: ForceGraphHandle | null) => {
      graphHandleRef.current = instance;
      if (!instance) {
        setPhysicsReady(false);
        return;
      }
      configurePhysics(instance);
    },
    [configurePhysics],
  );

  useEffect(() => {
    const fg = graphHandleRef.current;
    if (!fg?.d3Force) return;
    const sig = `${graphData.nodes.length}:${graphData.links.length}:${libraryCenters.size}:${folderCenters.size}:${articleCenters.size}:${packingSig}:${use3dRenderer}`;
    if (physicsSignatureRef.current === sig && physicsReady) return;
    physicsSignatureRef.current = sig;
    configurePhysics(fg);
  }, [
    configurePhysics,
    graphData.links.length,
    graphData.nodes.length,
    libraryCenters.size,
    folderCenters.size,
    articleCenters.size,
    packingSig,
    physicsReady,
    use3dRenderer,
  ]);

  // When nest packing changes, push live FG coords back onto seeds (FG keeps stale x/y/z by id).
  const lastReseedSigRef = useRef('');
  useEffect(() => {
    const fg = graphHandleRef.current;
    if (!fg?.graphData || !physicsReady) return;
    if (lastReseedSigRef.current === packingSig) return;
    lastReseedSigRef.current = packingSig;
    const live = fg.graphData();
    if (!live?.nodes?.length) return;
    let moved = 0;
    for (const node of live.nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const id = node.id === undefined ? null : String(node.id);
      if (!id) continue;
      const concept = nodeLookupById.get(id);
      if (!concept) continue;
      const folderMembership = conceptFolderIndex.get(id);
      const primaryFolderKey = folderMembership?.folderKey ?? null;
      const primaryArticleId = conceptArticleIndex.get(id) ?? null;
      const articleCenter = primaryArticleId ? articleCenters.get(primaryArticleId) : null;
      const folderCenter =
        concept.primaryLibraryId && primaryFolderKey
          ? folderCenters.get(`${concept.primaryLibraryId}::${primaryFolderKey}`)
          : null;
      const libCenter = concept.primaryLibraryId
        ? libraryCenters.get(concept.primaryLibraryId)
        : null;
      const center = articleCenter ?? folderCenter ?? libCenter;
      if (!center) continue;
      const spread = hashSpread3D(id);
      const freeScale = 1.35;
      node.x = center.x + spread.dx * freeScale;
      node.y = center.y + spread.dy * freeScale;
      node.z = center.z + spread.dz * freeScale;
      moved += 1;
    }
    if (moved > 0) {
      layoutCommittedRef.current.clear();
      fg.d3ReheatSimulation?.();
      volumeFitDoneRef.current = false;
    }
  }, [
    packingSig,
    physicsReady,
    nodeLookupById,
    conceptFolderIndex,
    conceptArticleIndex,
    articleCenters,
    folderCenters,
    libraryCenters,
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
      if (node.id === undefined || isNestHullNode(node) || isTagSatelliteNode(node)) {
        return false;
      }
      return focusSet.has(String(node.id));
    });
  }, [focusSet, reducedMotion]);

  /** Frame the Fibonacci shell + company envelope with a stable elevated orbit pose. */
  const fitVolumeCamera = useCallback(
    (opts?: { force?: boolean; durationMs?: number }) => {
      if (!use3dRenderer) return;
      if (!opts?.force && volumeFitDoneRef.current) return;
      const fg = graphHandleRef.current;
      if (!fg?.cameraPosition) return;
      const durationMs = opts?.durationMs ?? (reducedMotion ? 0 : 900);
      const pose = computeVolumeCameraPose(libraryCenters);
      fg.cameraPosition(pose.position, pose.lookAt, durationMs);
      volumeFitDoneRef.current = true;
    },
    [libraryCenters, reducedMotion, use3dRenderer],
  );

  useEffect(() => {
    if (!hasTopicFocus || !physicsReady) return;
    const frame = requestAnimationFrame(() => fitFocusedNodes());
    return () => cancelAnimationFrame(frame);
  }, [hasTopicFocus, fitFocusedNodes, use3dRenderer, graphData.nodes.length, physicsReady]);

  useEffect(() => {
    if (!physicsReady || !use3dRenderer || hasTopicFocus) return;
    if (volumeFitDoneRef.current) return;
    const t = window.setTimeout(
      () => fitVolumeCamera({ force: true }),
      reducedMotion ? 0 : 450,
    );
    return () => window.clearTimeout(t);
  }, [
    physicsReady,
    use3dRenderer,
    hasTopicFocus,
    graphData.hullCount,
    packingSig,
    reducedMotion,
    fitVolumeCamera,
  ]);

  // Gentle idle orbit so Z depth keeps reading after settle (paused while pointer is down).
  useEffect(() => {
    if (!physicsReady || !use3dRenderer || reducedMotion || hasTopicFocus) return;
    const fg = graphHandleRef.current;
    const controls = fg?.controls?.();
    if (!controls) return;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.enableDamping = true;

    const surface = graphSurfaceRef.current;
    const pause = () => {
      controls.autoRotate = false;
    };
    const resume = () => {
      controls.autoRotate = true;
    };
    surface?.addEventListener('pointerdown', pause);
    surface?.addEventListener('pointerup', resume);
    surface?.addEventListener('pointerleave', resume);
    return () => {
      controls.autoRotate = false;
      surface?.removeEventListener('pointerdown', pause);
      surface?.removeEventListener('pointerup', resume);
      surface?.removeEventListener('pointerleave', resume);
    };
  }, [physicsReady, use3dRenderer, reducedMotion, hasTopicFocus, packingSig]);

  useEffect(() => {
    const id = props.highlightConceptId;
    if (!id || !physicsReady) return;
    const fg = graphHandleRef.current;
    if (!fg?.zoomToFit) return;
    const durationMs = reducedMotion ? 0 : 650;
    const t = window.setTimeout(
      () => {
        fg.zoomToFit?.(
          durationMs,
          72,
          (n) => String(n.id) === id && !isNestHullNode(n) && !isTagSatelliteNode(n),
        );
      },
      reducedMotion ? 0 : 120,
    );
    return () => window.clearTimeout(t);
  }, [props.highlightConceptId, props.nodes, reducedMotion, physicsReady]);

  const hoveredConceptMeta = useMemo(() => {
    if (!hoveredNodeId) {
      return {
        libraryId: null as string | null,
        folderKey: null as string | null,
        articleId: null as string | null,
      };
    }
    const node = nodeLookupById.get(hoveredNodeId);
    const folderMembership = conceptFolderIndex.get(hoveredNodeId);
    return {
      libraryId: node?.primaryLibraryId ?? null,
      folderKey: folderMembership?.folderKey ?? null,
      articleId: conceptArticleIndex.get(hoveredNodeId) ?? null,
    };
  }, [hoveredNodeId, nodeLookupById, conceptFolderIndex, conceptArticleIndex]);

  const highlightConceptMeta = useMemo(() => {
    const id = props.highlightConceptId;
    if (!id) {
      return {
        libraryId: null as string | null,
        folderKey: null as string | null,
        articleId: null as string | null,
      };
    }
    const node = nodeLookupById.get(id);
    const folderMembership = conceptFolderIndex.get(id);
    return {
      libraryId: node?.primaryLibraryId ?? null,
      folderKey: folderMembership?.folderKey ?? null,
      articleId: conceptArticleIndex.get(id) ?? null,
    };
  }, [props.highlightConceptId, nodeLookupById, conceptFolderIndex, conceptArticleIndex]);

  const nestEmphasisCtx: NestEmphasisContext = useMemo(
    () => ({
      hoveredHullId,
      selectedHullId,
      hoveredConceptId: hoveredNodeId,
      hoveredConceptLibraryId: hoveredConceptMeta.libraryId,
      hoveredConceptFolderKey: hoveredConceptMeta.folderKey,
      hoveredConceptArticleId: hoveredConceptMeta.articleId,
      highlightConceptId: props.highlightConceptId ?? null,
      highlightLibraryId: highlightConceptMeta.libraryId,
      highlightFolderKey: highlightConceptMeta.folderKey,
      highlightArticleId: highlightConceptMeta.articleId,
    }),
    [
      hoveredHullId,
      selectedHullId,
      hoveredNodeId,
      hoveredConceptMeta,
      props.highlightConceptId,
      highlightConceptMeta,
    ],
  );

  const nestEmphasisCtxRef = useRef(nestEmphasisCtx);
  nestEmphasisCtxRef.current = nestEmphasisCtx;

  const projectNodeToLocal = useCallback(
    (node: { x?: number; y?: number; z?: number }): { x: number; y: number } | null => {
      const fg = graphHandleRef.current;
      const surface = graphSurfaceRef.current;
      if (!fg?.graph2ScreenCoords || !surface) return null;
      const coords = use3dRenderer
        ? fg.graph2ScreenCoords(node.x ?? 0, node.y ?? 0, node.z ?? 0)
        : fg.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
      if (!coords) return null;
      const pad = 12;
      const w = surface.clientWidth;
      const h = surface.clientHeight;
      return {
        x: Math.min(Math.max(pad, coords.x), Math.max(pad, w - pad)),
        y: Math.min(Math.max(pad, coords.y), Math.max(pad, h - pad)),
      };
    },
    [use3dRenderer],
  );

  const findSimNode = useCallback((id: string) => {
    const nodes = graphData.nodes as Array<{
      id?: string | number;
      x?: number;
      y?: number;
      z?: number;
    }>;
    return nodes.find((n) => String(n.id) === id) ?? null;
  }, [graphData.nodes]);

  const placeHoverCard = useCallback(
    (lines: string[], anchorId: string | null) => {
      if (lines.length === 0) {
        setHoverCard(null);
        return;
      }
      let x = 80;
      let y = 80;
      if (anchorId) {
        const sim = findSimNode(anchorId);
        const projected = sim ? projectNodeToLocal(sim) : null;
        if (projected) {
          // Card CSS anchors above this point (translate -50%, -100%).
          x = projected.x;
          y = projected.y;
        } else {
          const surface = graphSurfaceRef.current;
          const rect = surface?.getBoundingClientRect();
          if (rect) {
            x = Math.min(Math.max(8, pointerRef.current.x - rect.left), rect.width - 8);
            y = Math.min(Math.max(8, pointerRef.current.y - rect.top), rect.height - 8);
          }
        }
      }
      setHoverCard({ lines, x, y, anchorId });
    },
    [findSimNode, projectNodeToLocal],
  );

  const clearHover = useCallback(() => {
    setHoveredNodeId(null);
    setHoveredHullId(null);
    setHoveredLinkKey(null);
    setHoverCard(null);
  }, []);

  const clearPointerState = useCallback(() => {
    clearHover();
    setSelectedHullId(null);
  }, [clearHover]);

  // Keep label glued to the node while the camera / simulation moves.
  useEffect(() => {
    if (!hoverCard?.anchorId) return;
    let raf = 0;
    const tick = () => {
      const id = hoverCard.anchorId;
      if (!id) return;
      const sim = findSimNode(id);
      const projected = sim ? projectNodeToLocal(sim) : null;
      if (projected) {
        const nextX = projected.x;
        const nextY = projected.y;
        setHoverCard((prev) => {
          if (!prev || prev.anchorId !== id) return prev;
          if (Math.abs(prev.x - nextX) < 0.5 && Math.abs(prev.y - nextY) < 0.5) return prev;
          return { ...prev, x: nextX, y: nextY };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hoverCard?.anchorId, findSimNode, projectNodeToLocal]);

  const syncNestEmphasisMaterials = useCallback(() => {
    const fg = graphHandleRef.current;
    const scene = fg?.scene?.();
    if (!scene) return;
    const ctx = nestEmphasisCtxRef.current;
    scene.traverse((obj) => {
      const hullId = obj.userData?.nestHullId as string | undefined;
      const hullKind = obj.userData?.nestHullKind as NestHullNode['__hullKind'] | undefined;
      if (!hullId || !hullKind) return;
      const emphasis = resolveNestEmphasis(
        { id: hullId, __hullKind: hullKind, __libraryId: undefined },
        ctx,
      );
      applyNestHullEmphasis(obj, hullKind, emphasis);
    });
  }, []);

  useEffect(() => {
    syncNestEmphasisMaterials();
  }, [nestEmphasisCtx, syncNestEmphasisMaterials, physicsReady, use3dRenderer]);

  const onNodeClick = useCallback(
    (node: {
      id?: string | number;
      __kind?: string;
      __hullKind?: string;
      __parentConceptId?: string;
      __libraryId?: string;
    }) => {
      if (node.id === undefined) return;
      if (isNestHullNode(node)) {
        const id = String(node.id);
        setSelectedHullId((prev) => (prev === id ? null : id));
        return;
      }
      if (isTagSatelliteNode(node)) {
        const parentId = node.__parentConceptId;
        if (parentId) props.onInspectConcept?.(parentId);
        return;
      }
      props.onInspectConcept?.(String(node.id));
    },
    [props],
  );

  /** Deterministic hover for Playwright / live QA (not production UI). */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    type GalaxyHoverTestApi = {
      showConcept: (conceptId: string) => boolean;
      clear: () => void;
      layoutStats: () => {
        packingSig: string;
        conceptCount: number;
        libraryCount: number;
        aabb: {
          xSpan: number;
          ySpan: number;
          zSpan: number;
          zOverX: number;
        } | null;
        clusterSeparation: {
          minCenterGap: number;
          minRequiredGap: number;
          ok: boolean;
        } | null;
        nestMembership: {
          assigned: number;
          insideHomeHull: number;
          fractionInside: number;
          folderAssigned: number;
          insideHomeFolder: number;
          folderFractionInside: number;
          articleAssigned: number;
          insideArticleOrbit: number;
          articleFractionInside: number;
          articleHullCount: number;
          folderHullCount: number;
        } | null;
        camera: {
          position: { x: number; y: number; z: number };
          lookAt: { x: number; y: number; z: number };
          envelopeRadius: number;
        } | null;
      };
    };
    const api: GalaxyHoverTestApi = {
      showConcept: (conceptId: string) => {
        const node = nodeLookupById.get(conceptId);
        if (!node) return false;
        const folderMembership = conceptFolderIndex.get(conceptId);
        const primaryFolderKey = folderMembership?.folderKey ?? null;
        const primaryArticleId = conceptArticleIndex.get(conceptId) ?? null;
        const folderKey =
          node.primaryLibraryId && primaryFolderKey
            ? `${node.primaryLibraryId}::${primaryFolderKey}`
            : null;
        setHoveredNodeId(conceptId);
        setHoveredHullId(null);
        setHoveredLinkKey(null);
        placeHoverCard(
          conceptHoverLines({
            kind: 'concept',
            title: node.title,
            tags: node.tags,
            sourceClass: node.sourceClass ?? null,
            curationStatus: node.curationStatus ?? null,
            queryCount: node.queryCount ?? null,
            referenceCount: node.referenceCount ?? null,
            libraryName: node.primaryLibraryId
              ? (libraryNameById.get(node.primaryLibraryId) ?? null)
              : null,
            folderLabel: folderKey ? (folderLabelByKey.get(folderKey) ?? null) : null,
            articleTitle: primaryArticleId
              ? (articleTitleById.get(primaryArticleId) ?? null)
              : null,
            degree: degreeById.get(conceptId) ?? 0,
          }),
          conceptId,
        );
        return true;
      },
      clear: () => clearHover(),
      layoutStats: () => {
        const pts = [...libraryCenters.entries()];
        const camera = computeVolumeCameraPose(libraryCenters);
        let clusterSeparation: {
          minCenterGap: number;
          minRequiredGap: number;
          ok: boolean;
        } | null = null;
        if (pts.length >= 2) {
          let minCenterGap = Number.POSITIVE_INFINITY;
          let minRequiredGap = 0;
          for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
              const a = pts[i]![1];
              const b = pts[j]![1];
              const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
              const required = (a.radius + b.radius) * 1.06;
              if (gap < minCenterGap) minCenterGap = gap;
              if (required > minRequiredGap) minRequiredGap = required;
            }
          }
          clusterSeparation = {
            minCenterGap,
            minRequiredGap,
            ok: minCenterGap + 1e-6 >= minRequiredGap * 0.98,
          };
        }

        let nestMembership: {
          assigned: number;
          insideHomeHull: number;
          fractionInside: number;
          folderAssigned: number;
          insideHomeFolder: number;
          folderFractionInside: number;
          articleAssigned: number;
          insideArticleOrbit: number;
          articleFractionInside: number;
          articleHullCount: number;
          folderHullCount: number;
        } | null = null;
        const liveNodes = graphHandleRef.current?.graphData?.()?.nodes ?? [];
        const concepts = liveNodes.filter(
          (n) => n.__kind !== 'nest-hull' && n.__kind !== 'tag-sat' && n.primaryLibraryId,
        );
        const articleHullCount = liveNodes.filter(
          (n) => n.__kind === 'nest-hull' && (n as { __hullKind?: string }).__hullKind === 'article',
        ).length;
        const folderHullCount = liveNodes.filter(
          (n) => n.__kind === 'nest-hull' && (n as { __hullKind?: string }).__hullKind === 'folder',
        ).length;
        if (concepts.length > 0) {
          let inside = 0;
          let folderAssigned = 0;
          let insideFolder = 0;
          let articleAssigned = 0;
          let insideArticle = 0;
          const liveHullByTopic = new Map<string, { x?: number; y?: number; z?: number }>();
          for (const n of liveNodes) {
            const hull = n as {
              __kind?: string;
              __hullKind?: string;
              __topicId?: string;
              x?: number;
              y?: number;
              z?: number;
            };
            if (hull.__kind === 'nest-hull' && hull.__hullKind === 'article' && hull.__topicId) {
              liveHullByTopic.set(hull.__topicId, hull);
            }
          }
          for (const node of concepts) {
            const center = libraryCenters.get(node.primaryLibraryId!);
            if (!center) continue;
            const dist = Math.hypot(
              (node.x ?? 0) - center.x,
              (node.y ?? 0) - center.y,
              (node.z ?? 0) - center.z,
            );
            if (dist <= center.radius * 1.05) inside += 1;
            const folderKey = (node as { primaryFolderKey?: string | null }).primaryFolderKey;
            if (folderKey) {
              folderAssigned += 1;
              const fCenter = folderCenters.get(`${node.primaryLibraryId}::${folderKey}`);
              if (fCenter) {
                const fDist = Math.hypot(
                  (node.x ?? 0) - fCenter.x,
                  (node.y ?? 0) - fCenter.y,
                  (node.z ?? 0) - fCenter.z,
                );
                // Orbital band: count inside outer envelope (D-142).
                if (fDist <= fCenter.radius * 1.2) insideFolder += 1;
              }
            }
            const articleId = (node as { primaryArticleId?: string | null }).primaryArticleId;
            if (articleId) {
              articleAssigned += 1;
              const aSeed = articleCenters.get(articleId);
              const live = liveHullByTopic.get(articleId);
              if (aSeed) {
                const ax = live?.x ?? aSeed.x;
                const ay = live?.y ?? aSeed.y;
                const az = live?.z ?? aSeed.z;
                const aDist = Math.hypot((node.x ?? 0) - ax, (node.y ?? 0) - ay, (node.z ?? 0) - az);
                if (aDist <= aSeed.radius * 1.5) insideArticle += 1;
              }
            }
          }
          nestMembership = {
            assigned: concepts.length,
            insideHomeHull: inside,
            fractionInside: inside / concepts.length,
            folderAssigned,
            insideHomeFolder: insideFolder,
            folderFractionInside: folderAssigned > 0 ? insideFolder / folderAssigned : 0,
            articleAssigned,
            insideArticleOrbit: insideArticle,
            articleFractionInside: articleAssigned > 0 ? insideArticle / articleAssigned : 0,
            articleHullCount,
            folderHullCount,
          };
        }

        if (pts.length === 0) {
          return {
            packingSig,
            conceptCount: props.nodes.length,
            libraryCount: 0,
            aabb: null,
            clusterSeparation: null,
            nestMembership,
            camera,
          };
        }
        const xs = pts.map(([, p]) => p.x);
        const ys = pts.map(([, p]) => p.y);
        const zs = pts.map(([, p]) => p.z);
        const span = (a: number[]) => Math.max(...a) - Math.min(...a);
        const xSpan = span(xs);
        const ySpan = span(ys);
        const zSpan = span(zs);
        return {
          packingSig,
          conceptCount: props.nodes.length,
          libraryCount: pts.length,
          aabb: {
            xSpan,
            ySpan,
            zSpan,
            zOverX: xSpan > 0 ? zSpan / xSpan : 0,
          },
          clusterSeparation,
          nestMembership,
          camera,
        };
      },
    };
    (window as Window & { __hftrGalaxyHoverTest?: GalaxyHoverTestApi }).__hftrGalaxyHoverTest =
      api;
    return () => {
      delete (window as Window & { __hftrGalaxyHoverTest?: GalaxyHoverTestApi })
        .__hftrGalaxyHoverTest;
    };
  }, [
    articleCenters,
    articleTitleById,
    clearHover,
    conceptArticleIndex,
    conceptFolderIndex,
    degreeById,
    folderCenters,
    folderLabelByKey,
    libraryCenters,
    libraryNameById,
    nodeLookupById,
    packingSig,
    placeHoverCard,
    props.nodes.length,
  ]);

  const onNodeHover = useCallback(
    (
      node: {
        id?: string | number;
        title?: string;
        tags?: string[];
        __kind?: string;
        __label?: string;
        __hullKind?: string;
        __parentConceptId?: string;
        primaryLibraryId?: string | null;
        primaryFolderKey?: string | null;
        primaryArticleId?: string | null;
        sourceClass?: string;
        curationStatus?: string | null;
        queryCount?: number;
        referenceCount?: number;
        x?: number;
        y?: number;
        z?: number;
      } | null,
    ) => {
      if (!node || node.id === undefined) {
        clearHover();
        return;
      }

      const id = String(node.id);

      if (isNestHullNode(node)) {
        setHoveredNodeId(null);
        setHoveredHullId(id);
        setHoveredLinkKey(null);
        placeHoverCard(
          nestHoverLines({
            kind: 'nest-hull',
            hullKind: node.__hullKind ?? null,
            label: String(node.__label ?? node.title ?? 'Nest'),
          }),
          id,
        );
        return;
      }

      if (isTagSatelliteNode(node)) {
        const parentId = node.__parentConceptId ?? null;
        setHoveredNodeId(parentId);
        setHoveredHullId(null);
        setHoveredLinkKey(null);
        const parent = parentId ? nodeLookupById.get(parentId) : null;
        placeHoverCard(
          tagHoverLines({
            kind: 'tag-sat',
            title: String(node.title ?? ''),
            parentTitle: parent?.title ?? null,
          }),
          id,
        );
        return;
      }

      setHoveredNodeId(id);
      setHoveredHullId(null);
      setHoveredLinkKey(null);
      const folderKey =
        node.primaryLibraryId && node.primaryFolderKey
          ? `${node.primaryLibraryId}::${node.primaryFolderKey}`
          : null;
      placeHoverCard(
        conceptHoverLines({
          kind: 'concept',
          title: String(node.title ?? ''),
          tags: node.tags ?? [],
          sourceClass: node.sourceClass ?? null,
          curationStatus: node.curationStatus ?? null,
          queryCount: node.queryCount ?? null,
          referenceCount: node.referenceCount ?? null,
          libraryName: node.primaryLibraryId
            ? (libraryNameById.get(node.primaryLibraryId) ?? null)
            : null,
          folderLabel: folderKey ? (folderLabelByKey.get(folderKey) ?? null) : null,
          articleTitle: node.primaryArticleId
            ? (articleTitleById.get(node.primaryArticleId) ?? null)
            : null,
          degree: degreeById.get(id) ?? 0,
        }),
        id,
      );
    },
    [
      articleTitleById,
      clearHover,
      degreeById,
      folderLabelByKey,
      libraryNameById,
      nodeLookupById,
      placeHoverCard,
    ],
  );

  const onLinkHover = useCallback(
    (
      link: {
        fromConceptId?: string;
        toConceptId?: string;
        relation?: string;
        weightBand?: string;
        source?: string | { id?: string | number; x?: number; y?: number; z?: number };
        target?: string | { id?: string | number; x?: number; y?: number; z?: number };
      } | null,
    ) => {
      if (!link) {
        clearHover();
        return;
      }
      const fromId =
        link.fromConceptId ??
        (typeof link.source === 'string' ? link.source : String(link.source?.id ?? ''));
      const toId =
        link.toConceptId ??
        (typeof link.target === 'string' ? link.target : String(link.target?.id ?? ''));
      if (!fromId || !toId) {
        clearHover();
        return;
      }
      setHoveredNodeId(null);
      setHoveredHullId(null);
      setHoveredLinkKey(`${fromId}→${toId}`);
      const fromNode = nodeLookupById.get(fromId);
      const toNode = nodeLookupById.get(toId);
      // Anchor link card to the midpoint of the two endpoints when available.
      const fromSim = findSimNode(fromId);
      const toSim = findSimNode(toId);
      const mid =
        fromSim && toSim
          ? {
              x: ((fromSim.x ?? 0) + (toSim.x ?? 0)) / 2,
              y: ((fromSim.y ?? 0) + (toSim.y ?? 0)) / 2,
              z: ((fromSim.z ?? 0) + (toSim.z ?? 0)) / 2,
            }
          : null;
      const lines = linkHoverLines({
        relation: String(link.relation ?? 'mentions'),
        weightBand: String(link.weightBand ?? 'typical'),
        similarityBand: similarityBandForLink(fromNode, toNode),
        fromTitle: fromNode?.title ?? null,
        toTitle: toNode?.title ?? null,
      });
      if (mid) {
        const projected = projectNodeToLocal(mid);
        setHoverCard({
          lines,
          x: projected?.x ?? 80,
          y: projected?.y ?? 80,
          anchorId: null,
        });
      } else {
        placeHoverCard(lines, fromId);
      }
    },
    [clearHover, findSimNode, nodeLookupById, placeHoverCard, projectNodeToLocal],
  );

  const nodeThreeObject = useCallback(
    (node: object) => {
      const n = node as {
        id?: string | number;
        __kind?: string;
        __hullKind?: string;
        __libraryId?: string;
        __color?: string;
        tags?: string[];
        sourceClass?: string | null;
        referenceCount?: number | null;
        val?: number;
      };

      if (isNestHullNode(n as NestHullNode)) {
        const hull = n as NestHullNode;
        const emphasis = resolveNestEmphasis(
          { id: hull.id, __hullKind: hull.__hullKind, __libraryId: hull.__libraryId },
          nestEmphasisCtxRef.current,
        );
        return createNestHullObject3d(hull, emphasis);
      }

      const fill = (() => {
        if (isTagSatelliteNode(n)) {
          const tag = n.tags?.[0];
          return tag ? tagColor(tag, props.tags) : '#7dcfff';
        }
        const tag = n.tags?.[0];
        return tag ? tagColor(tag, props.tags) : '#9aa4b8';
      })();

      if (isTagSatelliteNode(n)) {
        return createCelestialObject3d(celestialKindForTagSatellite(), fill, n.val ?? 0.4);
      }

      const kind = celestialKindForConcept({
        sourceClass: n.sourceClass,
        tags: n.tags,
        referenceCount: n.referenceCount,
      });
      return createCelestialObject3d(kind, fill, n.val ?? 1);
    },
    [props.tags],
  );

  const nestEmphasisFor = useCallback(
    (node: { id?: string | number; __hullKind?: string; __libraryId?: string }): NestEmphasis => {
      if (!node.id || !node.__hullKind) return 'idle';
      return resolveNestEmphasis(
        {
          id: String(node.id),
          __hullKind: node.__hullKind as NestHullNode['__hullKind'],
          __libraryId: node.__libraryId,
        },
        nestEmphasisCtx,
      );
    },
    [nestEmphasisCtx],
  );

  const nodeColor = useCallback(
    (node: {
      id?: string | number;
      tags?: string[];
      __focused?: boolean;
      __kind?: string;
      __color?: string;
      __parentConceptId?: string;
    }) => {
      if (isNestHullNode(node)) return node.__color ?? '#4a5568';
      if (isTagSatelliteNode(node)) {
        const tag = node.tags?.[0];
        const base = tag ? tagColor(tag, props.tags) : '#7dcfff';
        if (hoverNeighborIds && node.__parentConceptId && hoverNeighborIds.has(node.__parentConceptId)) {
          return base;
        }
        if (hoverNeighborIds) return 'rgba(120, 130, 150, 0.22)';
        return base;
      }
      const id = node.id === undefined ? null : String(node.id);
      const tag = node.tags?.[0];
      const base = tag ? tagColor(tag, props.tags) : '#9aa4b8';
      if (props.highlightConceptId && id === props.highlightConceptId) {
        return '#7aa2f7';
      }
      if (hoveredNodeId && id === hoveredNodeId) {
        return '#c0caf5';
      }
      if (hoverNeighborIds && id && hoverNeighborIds.has(id)) {
        return base;
      }
      if (hoverNeighborIds) {
        return 'rgba(120, 130, 150, 0.22)';
      }
      if (hasTopicFocus && node.__focused === false) {
        return 'rgba(120, 130, 150, 0.28)';
      }
      return base;
    },
    [props.tags, props.highlightConceptId, hasTopicFocus, hoveredNodeId, hoverNeighborIds],
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
        __parentConceptId?: string;
        val?: number;
      },
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      if (
        paintNestHull2d(
          {
            ...node,
            __emphasis: isNestHullNode(node) ? nestEmphasisFor(node) : 'idle',
          },
          ctx,
          globalScale,
        )
      ) {
        return;
      }

      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const id = node.id === undefined ? null : String(node.id);
      const isTagSat = isTagSatelliteNode(node);
      const isHighlight = Boolean(
        props.highlightConceptId && id === props.highlightConceptId,
      );
      const isHovered = Boolean(hoveredNodeId && id === hoveredNodeId);
      const isNeighbor = Boolean(hoverNeighborIds && id && hoverNeighborIds.has(id));
      const isFocused = !hasTopicFocus || node.__focused !== false;
      const r =
        (isTagSat ? 2.2 : isHighlight || isHovered ? 7.2 : isFocused ? 4.5 : 3) /
        Math.max(globalScale * 0.35, 0.5);
      const fill = nodeColor(node);

      if ((isHovered || isHighlight) && !isTagSat) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3 / Math.max(globalScale, 0.5), 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(122, 162, 247, 0.85)';
        ctx.lineWidth = 1.4 / Math.max(globalScale * 0.4, 0.45);
        ctx.stroke();
      }

      const kind = isTagSat
        ? celestialKindForTagSatellite()
        : celestialKindForConcept({
            sourceClass: (node as { sourceClass?: string | null }).sourceClass,
            tags: node.tags,
            referenceCount: (node as { referenceCount?: number | null }).referenceCount,
          });
      ctx.globalAlpha = isTagSat
        ? 0.75
        : hoverNeighborIds && !isNeighbor
          ? 0.2
          : hasTopicFocus && node.__focused === false
            ? 0.28
            : 0.95;
      paintCelestial2d(kind, ctx, x, y, isHighlight || isHovered ? '#7aa2f7' : fill, r);
      ctx.globalAlpha = 1;

      const showLabel =
        !isTagSat &&
        (isHighlight ||
          isHovered ||
          (isFocused && !hoverNeighborIds && globalScale > 1.35) ||
          (isNeighbor && globalScale > 1.1));
      if (showLabel) {
        const label = humanizeConceptTitle(node.title ?? '');
        if (label) {
          const fontSize = Math.max(8 / globalScale, 2);
          const maxChars = isHighlight || isHovered ? 36 : 22;
          const text = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
          ctx.font = `${isHighlight || isHovered ? 600 : 400} ${fontSize}px sans-serif`;
          const metrics = ctx.measureText(text);
          const pad = 2 / globalScale;
          ctx.fillStyle = 'rgba(12, 16, 24, 0.78)';
          ctx.fillRect(
            x - (metrics.width + pad * 2) / 2,
            y + r + 1 / globalScale,
            metrics.width + pad * 2,
            fontSize + pad * 2,
          );
          ctx.fillStyle = isHighlight || isHovered ? '#e8ecf4' : 'rgba(200, 210, 230, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(text, x, y + r + pad + 1 / globalScale);
        }
      }
    },
    [hasTopicFocus, hoverNeighborIds, hoveredNodeId, nestEmphasisFor, nodeColor, props.highlightConceptId],
  );

  const linkColor = useCallback(
    (link: {
      __bothFocused?: boolean;
      __eitherFocused?: boolean;
      __semantic?: boolean;
      weightBand?: string;
      fromConceptId?: string;
      toConceptId?: string;
      source?: string | { id?: string | number };
      target?: string | { id?: string | number };
    }) => {
      const fromId =
        link.fromConceptId ??
        (typeof link.source === 'string' ? link.source : String(link.source?.id ?? ''));
      const toId =
        link.toConceptId ??
        (typeof link.target === 'string' ? link.target : String(link.target?.id ?? ''));
      const linkKey = `${fromId}→${toId}`;
      if (hoveredLinkKey && linkKey === hoveredLinkKey) {
        return '#c0caf5';
      }
      if (hoverNeighborIds) {
        if (fromId && toId && hoverNeighborIds.has(fromId) && hoverNeighborIds.has(toId)) {
          return 'rgba(122, 162, 247, 0.75)';
        }
        return 'rgba(80, 90, 110, 0.08)';
      }
      if (hasTopicFocus) {
        if (link.__bothFocused) return '#7aa2f7';
        if (link.__eitherFocused) return 'rgba(122, 162, 247, 0.28)';
        return 'rgba(80, 90, 110, 0.1)';
      }
      if (link.__semantic) {
        if (link.weightBand === 'strong') return 'rgba(125, 207, 255, 0.42)';
        if (link.weightBand === 'weak') return 'rgba(125, 207, 255, 0.12)';
        return 'rgba(125, 207, 255, 0.22)';
      }
      if (link.weightBand === 'strong') return 'rgba(122, 162, 247, 0.55)';
      if (link.weightBand === 'weak') return 'rgba(120, 130, 150, 0.22)';
      return 'rgba(140, 150, 170, 0.35)';
    },
    [hasTopicFocus, hoverNeighborIds, hoveredLinkKey],
  );

  const linkWidth = useCallback(
    (link: {
      __bothFocused?: boolean;
      weightBand?: string;
      fromConceptId?: string;
      toConceptId?: string;
      source?: string | { id?: string | number };
      target?: string | { id?: string | number };
    }) => {
      const fromId =
        link.fromConceptId ??
        (typeof link.source === 'string' ? link.source : String(link.source?.id ?? ''));
      const toId =
        link.toConceptId ??
        (typeof link.target === 'string' ? link.target : String(link.target?.id ?? ''));
      const linkKey = `${fromId}→${toId}`;
      if (hoveredLinkKey && linkKey === hoveredLinkKey) return 2.8;
      if (
        hoverNeighborIds &&
        fromId &&
        toId &&
        hoverNeighborIds.has(fromId) &&
        hoverNeighborIds.has(toId)
      ) {
        return 2.1;
      }
      if (link.__bothFocused) return 2.4;
      if (link.weightBand === 'strong') return 1.6;
      if (link.weightBand === 'weak') return 0.6;
      return 1;
    },
    [hoverNeighborIds, hoveredLinkKey],
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
          {use3dRenderer ? (
            <button
              type="button"
              onClick={() => {
                fitVolumeCamera({ force: true, durationMs: reducedMotion ? 0 : 700 });
                setStatusText('Framed Fibonacci volume · company envelope');
              }}
              aria-label="Fit camera to galaxy volume"
              className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              Fit
            </button>
          ) : null}
        </div>
      </div>

      {(hasTopicFocus || statusText || use3dRenderer) && (
        <p
          className="shrink-0 px-2 py-1 text-[10px] text-[var(--color-ink-faint)]"
          aria-live="polite"
        >
          {use3dRenderer && !statusText
            ? '3D semantic springs · orbital shelves · articles · tags · live refresh'
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

      {props.loading && props.nodes.length === 0 ? (
        <p
          className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-[var(--color-ink-faint)]"
          data-testid="galaxy-loading"
        >
          Loading galaxy graph…
        </p>
      ) : graphData.nodes.length === 0 ? (
        <p
          className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-[var(--color-ink-faint)]"
          data-testid="galaxy-empty"
        >
          {props.nodes.length > 0
            ? 'No concepts match the current filters.'
            : 'No concepts in this company galaxy yet.'}
        </p>
      ) : (
        <div
          ref={(el) => {
            graphBox.ref(el);
            graphSurfaceRef.current = el;
          }}
          className="relative min-h-0 flex-1 overflow-hidden bg-[#070a10]"
          onMouseMove={(e) => {
            pointerRef.current = { x: e.clientX, y: e.clientY };
          }}
          onMouseLeave={clearHover}
        >
          {props.tags.length > 0 && (
            <div className={`${styles.orbitRing} overflow-hidden`} aria-label="Tag filter orbit">
              {props.tags.slice(0, 16).map((t, i) => {
                const count = Math.min(props.tags.length, 16);
                const angle = (360 / count) * i;
                const radius = reducedMotion ? 32 : Math.min(44, 26 + count * 0.85);
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

          {hoverCard ? (
            <div
              className={styles.hoverCard}
              style={{ left: hoverCard.x, top: hoverCard.y }}
              role="status"
              aria-live="polite"
              data-testid="galaxy-hover-card"
            >
              <div className={styles.hoverCardTitle}>{hoverCard.lines[0]}</div>
              {hoverCard.lines.slice(1).map((line, i) => (
                <div key={`${i}-${line}`} className={styles.hoverCardLine}>
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.hoverHint}>Hover node · click nest to pin · click opens panel</div>
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
              warmupTicks={reducedMotion ? 0 : 120}
              cooldownTicks={reducedMotion ? 0 : 180}
              d3AlphaDecay={0.018}
              d3VelocityDecay={0.32}
              nodeLabel={() => ''}
              linkLabel={() => ''}
              nodeVal="val"
              nodeRelSize={5.2}
              nodeOpacity={hasTopicFocus || hoverNeighborIds ? 0.96 : 0.88}
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
              onNodeHover={onNodeHover as (node: object | null) => void}
              onLinkHover={onLinkHover as (link: object | null) => void}
              onBackgroundClick={clearPointerState}
              onEngineTick={syncNestEmphasisMaterials}
              onEngineStop={() => {
                if (hasTopicFocus) fitFocusedNodes();
                else fitVolumeCamera({ force: false });
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
              nodeLabel={() => ''}
              linkLabel={() => ''}
              nodeRelSize={4}
              nodeColor={nodeColor as (node: object) => string}
              linkColor={linkColor as (link: object) => string}
              linkWidth={linkWidth as (link: object) => number}
              linkDirectionalParticles={linkParticles as (link: object) => number}
              linkDirectionalParticleWidth={linkParticleWidth as (link: object) => number}
              onNodeClick={onNodeClick}
              onNodeHover={onNodeHover as (node: object | null) => void}
              onLinkHover={onLinkHover as (link: object | null) => void}
              onBackgroundClick={clearPointerState}
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
