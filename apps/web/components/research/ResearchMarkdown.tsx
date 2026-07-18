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

/** Default prose classes for research inspector / article bodies (ui-spec terminal tokens). */
export const RESEARCH_MARKDOWN_PROSE_CLASS =
  [
    'research-md',
    'prose prose-invert max-w-none',
    'text-[12px] leading-relaxed text-[var(--color-ink-dim)]',
    'prose-headings:scroll-mt-2 prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-[var(--color-ink)]',
    'prose-h1:mb-2 prose-h1:mt-0 prose-h1:border-b prose-h1:border-[var(--color-line)] prose-h1:pb-1.5 prose-h1:text-[15px]',
    'prose-h2:mb-1.5 prose-h2:mt-3 prose-h2:text-[13px]',
    'prose-h3:mb-1 prose-h3:mt-2.5 prose-h3:text-[12px] prose-h3:text-[var(--color-ink)]',
    'prose-h4:mb-1 prose-h4:mt-2 prose-h4:text-[11px] prose-h4:uppercase prose-h4:tracking-wide prose-h4:text-[var(--color-ink-faint)]',
    'prose-p:my-1.5 prose-p:leading-relaxed',
    'prose-ul:my-1.5 prose-ul:list-disc prose-ul:pl-4',
    'prose-ol:my-1.5 prose-ol:list-decimal prose-ol:pl-4',
    'prose-li:my-0.5 prose-li:marker:text-[var(--color-ink-faint)]',
    'prose-strong:font-semibold prose-strong:text-[var(--color-ink)]',
    'prose-em:italic prose-em:text-[var(--color-ink-dim)]',
    'prose-blockquote:my-2 prose-blockquote:border-l-2 prose-blockquote:border-[var(--color-accent)]/50',
    'prose-blockquote:bg-[var(--color-surface-2)]/40 prose-blockquote:py-1 prose-blockquote:pl-3 prose-blockquote:pr-2',
    'prose-blockquote:text-[11px] prose-blockquote:not-italic prose-blockquote:text-[var(--color-ink-dim)]',
    'prose-code:rounded prose-code:border prose-code:border-[var(--color-line)]',
    'prose-code:bg-[var(--color-surface-2)] prose-code:px-1 prose-code:py-0.5',
    'prose-code:font-mono prose-code:text-[10px] prose-code:font-normal prose-code:text-[var(--color-ink)]',
    'prose-code:before:content-none prose-code:after:content-none',
    'prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border',
    'prose-pre:border-[var(--color-line)] prose-pre:bg-[var(--color-surface-0)] prose-pre:p-2.5',
    'prose-pre:text-[10px] prose-pre:leading-snug',
    'prose-hr:my-3 prose-hr:border-[var(--color-line)]',
    'prose-a:font-medium prose-a:text-[var(--color-accent)] prose-a:no-underline hover:prose-a:underline',
    'prose-table:my-2 prose-table:w-full prose-table:text-[10px]',
    'prose-th:border prose-th:border-[var(--color-line)] prose-th:bg-[var(--color-surface-2)]',
    'prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:font-medium prose-th:text-[var(--color-ink)]',
    'prose-td:border prose-td:border-[var(--color-line)] prose-td:px-2 prose-td:py-1',
  ].join(' ');

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
          <a href={anchorProps.href} className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline">
            {anchorProps.children}
          </a>
        );
      },
      pre: ({ children }) => (
        <pre className="overflow-x-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2.5 text-[10px] leading-snug text-[var(--color-ink)]">
          {children}
        </pre>
      ),
      code: ({ className, children, ...rest }) => {
        const isBlock = Boolean(className?.includes('language-'));
        if (isBlock) {
          return (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        }
        return (
          <code
            className="rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-ink)]"
            {...rest}
          >
            {children}
          </code>
        );
      },
    };
  }, [props.components]);

  return (
    <div
      data-testid="research-markdown"
      className={props.className ?? RESEARCH_MARKDOWN_PROSE_CLASS}
    >
      <ReactMarkdown components={components}>{prepared}</ReactMarkdown>
    </div>
  );
}
