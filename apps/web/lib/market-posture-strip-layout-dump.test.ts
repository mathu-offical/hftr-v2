/**
 * Observability dump for strip packing — run with:
 *   pnpm exec vitest run lib/market-posture-strip-layout-dump.test.ts
 * Reads /tmp/mh-slim.json when present (from market-hub API).
 */
import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { MarketHubModelHydration } from '@hftr/contracts';
import {
  buildMarketPostureAlgorithmGraph,
  functionBandForStep,
} from './market-posture-algorithm-graph';

describe('strip layout dump', () => {
  it('summarizes transfer-step spacing from live hydration', () => {
    const path = '/tmp/mh-slim.json';
    if (!existsSync(path)) {
      expect(true).toBe(true);
      return;
    }
    const hydration = JSON.parse(
      readFileSync(path, 'utf8'),
    ) as MarketHubModelHydration;
    const graph = buildMarketPostureAlgorithmGraph({
      hydration,
      layoutMode: 'stripExpanded',
    });
    const clusters = graph.nodes.filter(
      (n) => n.data.nodeRole === 'process_cluster',
    );
    const steps = graph.nodes.filter(
      (n) =>
        n.data.nodeRole === 'process' ||
        n.data.nodeRole === 'analysis' ||
        n.data.nodeRole === 'adapter' ||
        n.data.nodeRole === 'live_source' ||
        n.data.nodeRole === 'library_source' ||
        n.data.nodeRole === 'research_engine' ||
        n.data.nodeRole === 'research_articles',
    );
    const screens = graph.nodes.filter(
      (n) => n.data.nodeRole === 'screen_group',
    );

    // Intra-cluster hop gaps (absolute x delta between consecutive edge levels).
    const hopGaps: number[] = [];
    const bandMix: Record<string, number> = {};
    for (const c of clusters) {
      const kids = steps
        .filter((s) => s.parentId === c.id)
        .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
      for (let i = 1; i < kids.length; i++) {
        const prev = kids[i - 1]!;
        const cur = kids[i]!;
        if (cur.position.y === prev.position.y) {
          hopGaps.push(cur.position.x - prev.position.x);
        }
      }
      for (const k of kids) {
        const b = functionBandForStep(k);
        bandMix[b] = (bandMix[b] ?? 0) + 1;
      }
    }

    const transferEdges = graph.edges.filter((e) => {
      const a = graph.nodes.find((n) => n.id === e.source);
      const b = graph.nodes.find((n) => n.id === e.target);
      if (!a || !b) return false;
      return (
        a.parentId &&
        a.parentId === b.parentId &&
        a.parentId.startsWith('cluster:')
      );
    });

    const summary = {
      screens: screens.map((s) => ({
        id: s.id,
        w: s.style?.width,
        x: s.position.x,
        label: s.data.label,
      })),
      clusters: clusters.length,
      steps: steps.length,
      transferEdges: transferEdges.length,
      labeledTransfer: transferEdges.filter((e) => e.label).length,
      hopGaps: {
        n: hopGaps.length,
        min: hopGaps.length ? Math.min(...hopGaps) : null,
        med: hopGaps.length
          ? [...hopGaps].sort((a, b) => a - b)[Math.floor(hopGaps.length / 2)]
          : null,
        max: hopGaps.length ? Math.max(...hopGaps) : null,
      },
      bandMix,
      analysisChainContinuous: (() => {
        const c = clusters.find((x) =>
          String(x.data.processRoute ?? '').startsWith('analysis_'),
        );
        if (!c) return null;
        const kids = steps
          .filter((s) => s.parentId === c.id)
          .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
        const xs = [...new Set(kids.map((k) => k.position.x))];
        return {
          route: c.data.processRoute,
          distinctX: xs.length,
          hops: kids.map((k) => ({
            id: k.id,
            hop: k.data.transferHop,
            x: k.position.x,
            fn: k.data.processFunction ?? k.data.nodeRole,
          })),
        };
      })(),
      sampleCluster: clusters.slice(0, 3).map((c) => {
        const kids = steps
          .filter((s) => s.parentId === c.id)
          .sort((a, b) => a.position.x - b.position.x);
        return {
          route: c.data.processRoute,
          detail: c.data.detail,
          w: c.style?.width,
          chain: kids.map((k) => ({
            id: k.id,
            x: k.position.x,
            y: k.position.y,
            band: functionBandForStep(k),
            fn: k.data.processFunction ?? k.data.nodeRole,
            op: k.data.operation,
          })),
        };
      }),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
    expect(clusters.length).toBeGreaterThan(0);
    expect(transferEdges.length).toBeGreaterThan(0);
    if (summary.analysisChainContinuous) {
      // Analysis transfer must not collapse source+organize onto one X.
      expect(summary.analysisChainContinuous.distinctX).toBeGreaterThanOrEqual(4);
      const hopGapsLocal: number[] = [];
      const hops = summary.analysisChainContinuous.hops;
      for (let i = 1; i < hops.length; i++) {
        if (hops[i]!.x > hops[i - 1]!.x) {
          hopGapsLocal.push(hops[i]!.x - hops[i - 1]!.x);
        }
      }
      expect(Math.max(...hopGapsLocal, 0)).toBeLessThan(220);
    }
  });
});
