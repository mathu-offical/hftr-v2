'use client';

import { ResearchMarkdown } from '@/components/research/ResearchMarkdown';

/** Compact markdown chrome for list previews (memberships, library nests, tags). */
export const RESEARCH_EXCERPT_PROSE_CLASS =
  [
    'research-md research-md-excerpt',
    'prose prose-invert max-w-none',
    'text-[10px] leading-snug text-[var(--color-ink-dim)]',
    'prose-p:my-0.5 prose-p:leading-snug',
    'prose-headings:my-0.5 prose-headings:text-[11px] prose-headings:font-medium prose-headings:text-[var(--color-ink)]',
    'prose-ul:my-0.5 prose-ul:list-disc prose-ul:pl-3',
    'prose-ol:my-0.5 prose-ol:list-decimal prose-ol:pl-3',
    'prose-li:my-0',
    'prose-strong:font-semibold prose-strong:text-[var(--color-ink)]',
    'prose-em:italic',
    'prose-code:rounded prose-code:border prose-code:border-[var(--color-line)]',
    'prose-code:bg-[var(--color-surface-2)] prose-code:px-0.5 prose-code:font-mono',
    'prose-code:text-[9px] prose-code:before:content-none prose-code:after:content-none',
    'prose-a:text-[var(--color-accent)]',
    'line-clamp-3 overflow-hidden',
  ].join(' ');

type ConceptPreviewProps = {
  title: string;
  body?: string | null;
  role?: string | null;
  tags?: readonly string[];
  meta?: string | null;
  onOpen: () => void;
  testId?: string;
};

/**
 * Shared rich preview row for research objects in inspector lists
 * (topic memberships, library members, tag matches).
 */
export function ResearchConceptPreview(props: ConceptPreviewProps) {
  const body = props.body?.trim() ?? '';
  const excerpt = body.length > 480 ? `${body.slice(0, 480)}\n\n…` : body;

  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onOpen}
      className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-2 text-left hover:border-[var(--color-accent)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-medium text-[var(--color-ink)]">{props.title}</span>
        {props.role ? (
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            {props.role}
          </span>
        ) : null}
        {props.meta ? (
          <span className="text-[9px] text-[var(--color-ink-faint)]">{props.meta}</span>
        ) : null}
      </div>
      {props.tags && props.tags.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {props.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded border border-[var(--color-line)] px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]"
            >
              {tag}
            </span>
          ))}
          {props.tags.length > 6 ? (
            <span className="text-[8px] text-[var(--color-ink-faint)]">+{props.tags.length - 6}</span>
          ) : null}
        </div>
      ) : null}
      {excerpt ? (
        <div className="mt-1 pointer-events-none" aria-hidden>
          <ResearchMarkdown markdown={excerpt} className={RESEARCH_EXCERPT_PROSE_CLASS} />
        </div>
      ) : (
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">No excerpt</p>
      )}
    </button>
  );
}
