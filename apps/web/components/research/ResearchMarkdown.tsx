'use client';

import { createElement, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { parseSysChipHref, preprocessSysChips } from '@/lib/research-sys-chips';

type Props = {
  markdown: string;
  className?: string;
  /** Extra react-markdown component overrides (e.g. wikilink anchors). */
  components?: Components;
};

/**
 * Shared research markdown renderer with inline system-ref chips (D-047).
 * Uses [[sys:tool|lever|catalog|module:id]] → chip; other markdown unchanged.
 */
export function ResearchMarkdown(props: Props) {
  const prepared = useMemo(() => preprocessSysChips(props.markdown), [props.markdown]);

  const components = useMemo<Components>(() => {
    const outerA = props.components?.a;
    return {
      ...props.components,
      a: (anchorProps) => {
        const chip = parseSysChipHref(anchorProps.href);
        if (chip) {
          return (
            <span
              className="mx-0.5 inline-flex items-center rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 py-0.5 align-middle text-[9px] uppercase tracking-wide text-[var(--color-ink-dim)]"
              data-sys-kind={chip.kind}
              data-sys-id={chip.id}
              title={`${chip.kind}: ${chip.id}`}
            >
              {chip.label}
            </span>
          );
        }
        if (outerA) {
          return createElement(outerA, anchorProps);
        }
        return (
          <a href={anchorProps.href} className="text-[var(--color-accent)] underline">
            {anchorProps.children}
          </a>
        );
      },
    };
  }, [props.components]);

  return (
    <div
      className={
        props.className ??
        'prose prose-invert max-w-none text-[11px] text-[var(--color-ink-dim)] prose-p:my-1'
      }
    >
      <ReactMarkdown components={components}>{prepared}</ReactMarkdown>
    </div>
  );
}
