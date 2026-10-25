import { lazy, Suspense } from 'react';

const MarkdownImpl = lazy(() => import('./MarkdownImpl'));

/**
 * Renders item markdown (GFM subset; raw HTML shown as literal text, only
 * http(s) links are links). The renderer loads on first use, so the plain
 * text is the fallback while it arrives.
 */
export default function Markdown({ source }: { source: string }) {
  return (
    <Suspense
      fallback={<div className="whitespace-pre-wrap text-[14px] text-dr-body">{source}</div>}
    >
      <MarkdownImpl source={source} />
    </Suspense>
  );
}
