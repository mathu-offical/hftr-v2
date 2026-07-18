'use client';

import { excerptResearchMarkdownBody } from '@/lib/research-markdown-excerpt';

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
 * Excerpts are prose-only (no mid-table GFM slices).
 */
export function ResearchConceptPreview(props: ConceptPreviewProps) {
  const excerpt = excerptResearchMarkdownBody(props.body ?? '', 280);

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
        <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-[var(--color-ink-dim)]" aria-hidden>
          {excerpt}
        </p>
      ) : (
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">No excerpt</p>
      )}
    </button>
  );
}
