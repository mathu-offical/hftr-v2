'use client';

import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ResearchGraphLink, ResearchGraphNode } from '@hftr/contracts';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

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

export interface GalaxyViewProps {
  companyId: string;
  nodes: ResearchGraphNode[];
  links: ResearchGraphLink[];
  tags: string[];
}

function GalaxyViewInner(props: GalaxyViewProps) {
  const [mode3d, setMode3d] = useState(true);
  const [threeAvailable, setThreeAvailable] = useState<boolean | null>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<ForceGraph3DComponent | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<ResearchGraphNode | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const force2d = props.nodes.length > 200;

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

  const filteredNodeIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = new Set<string>();
    for (const node of props.nodes) {
      if (activeTag && !node.tags.includes(activeTag)) continue;
      if (q) {
        const hay = `${node.title} ${node.body} ${node.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      ids.add(node.id);
    }
    return ids;
  }, [props.nodes, query, activeTag]);

  const graphData = useMemo(() => {
    const nodes = props.nodes
      .filter((n) => filteredNodeIds.has(n.id))
      .map((n) => ({
        ...n,
        val: Math.max(
          1,
          props.links.filter((l) => l.fromConceptId === n.id || l.toConceptId === n.id).length,
        ),
      }));
    const nodeSet = new Set(nodes.map((n) => n.id));
    const links = props.links
      .filter((l) => nodeSet.has(l.fromConceptId) && nodeSet.has(l.toConceptId))
      .map((l) => ({
        ...l,
        source: l.fromConceptId,
        target: l.toConceptId,
      }));
    return { nodes, links };
  }, [props.nodes, props.links, filteredNodeIds]);

  const use3dRenderer = !force2d && mode3d && threeAvailable === true && ForceGraph3D !== null;

  const onNodeClick = useCallback(
    (node: { id?: string | number }) => {
      if (node.id === undefined) return;
      const nodeId = String(node.id);
      const full = props.nodes.find((n) => n.id === nodeId) ?? null;
      setSelected(full);
    },
    [props.nodes],
  );

  const graphCommon = {
    graphData,
    backgroundColor: 'rgba(0,0,0,0)',
    nodeLabel: 'title' as const,
    linkDirectionalParticles: 1,
    linkDirectionalParticleWidth: 1,
    onNodeClick,
    nodeColor: (node: { tags?: string[]; [key: string]: unknown }) => {
      const tag = node.tags?.[0];
      return tag ? tagColor(tag, props.tags) : 'var(--color-ink-dim)';
    },
    linkColor: () => 'var(--color-line)',
  };

  return (
    <div
      role="region"
      className="flex min-h-[280px] flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)]"
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

      {props.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--color-line)] px-2 py-1.5">
          {props.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              aria-pressed={activeTag === t}
              aria-label={`Filter galaxy by tag ${t}`}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                activeTag === t
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {statusText && (
        <p className="px-2 py-1 text-[10px] text-[var(--color-ink-faint)]" aria-live="polite">
          {statusText}
        </p>
      )}

      {graphData.nodes.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-[var(--color-ink-faint)]">
          No concepts match the current filters.
        </p>
      ) : (
        <div className="relative min-h-[220px] flex-1">
          {use3dRenderer && ForceGraph3D ? (
            <ForceGraph3D
              {...graphCommon}
              height={220}
              showNavInfo={false}
              nodeOpacity={0.92}
              linkOpacity={0.35}
            />
          ) : (
            <ForceGraph2D {...graphCommon} height={220} nodeRelSize={4} linkWidth={1} />
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
