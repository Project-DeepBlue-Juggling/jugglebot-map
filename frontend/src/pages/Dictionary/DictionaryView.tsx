import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Glossary, GlossaryTerm } from '../../api/schemas';
import { NNL } from '../../theme/nnl';
import { isShortcutTarget, hasModifier } from '../../ui/keyboard';
import Markdown from '../../ui/Markdown';
import { useToast } from '../../ui/useToast';
import { clusterId, filterGlossary } from './filter';

const HIGHLIGHT_MS = 2000;

/**
 * The read-only Dictionary: GLOSSARY.md is normative and changes only through
 * the glossary skills, so this page has no edit affordance. `/` focuses the
 * search; `#term-<slug>` scrolls to a term and highlights it briefly.
 */
export function DictionaryView({ glossary }: { glossary: Glossary }) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { hash } = useLocation();
  const clusters = useMemo(() => filterGlossary(glossary, query), [glossary, query]);
  const total = glossary.clusters.reduce((n, c) => n + c.terms.length, 0);
  const shown = clusters.reduce((n, c) => n + c.terms.length, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || hasModifier(e) || !isShortcutTarget()) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Landing on `#term-<slug>`: scroll to the term and flash it.
  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (id === '') return;
    const el = document.getElementById(id);
    if (el === null) return;
    el.scrollIntoView?.({ block: 'start' });
    setHighlight(id);
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [hash, glossary]);

  return (
    <div
      data-testid="dictionary-page"
      className="dark flex h-full flex-col overflow-hidden"
      style={{ backgroundColor: NNL.canvas, color: NNL.textHi }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 pt-3">
        <h1 className="text-lg font-semibold">Dictionary</h1>
        <input
          ref={searchRef}
          type="search"
          aria-label="Search the dictionary"
          placeholder="Search terms, definitions, Avoid words  ( / )"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-dr-focus"
          style={{ backgroundColor: NNL.surface, borderColor: NNL.border, color: NNL.textHi, maxWidth: 480 }}
        />
        <span className="text-xs" style={{ color: NNL.textLo }}>
          {shown === total ? `${total} terms` : `${shown} of ${total} terms`} · read-only
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:items-start md:gap-6 md:px-4">
        {clusters.length > 0 && (
          <nav
            aria-label="Clusters"
            className="flex shrink-0 flex-wrap gap-1 px-4 pb-2 md:sticky md:top-0 md:w-48 md:flex-col md:gap-0 md:px-0 md:pb-4"
          >
            {clusters.map((c) => (
              <a
                key={c.name}
                href={`#${clusterId(c.name)}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(clusterId(c.name))?.scrollIntoView?.({ block: 'start' });
                }}
                className="rounded px-2 py-1 text-[13px] hover:bg-white/5"
                style={{ color: NNL.textMed }}
              >
                {c.name === '' ? 'Terms' : c.name}
                <span className="ml-1.5 text-[11px]" style={{ color: NNL.textLo }}>
                  {c.terms.length}
                </span>
              </a>
            ))}
          </nav>
        )}

        <main className="min-w-0 flex-1 px-4 pb-8 md:max-w-3xl md:px-0">
          {clusters.length === 0 && (
            <p data-testid="dictionary-empty" className="py-8 text-sm" style={{ color: NNL.textMed }}>
              {total === 0 ? 'The glossary has no terms.' : `No term matches “${query.trim()}”.`}
            </p>
          )}
          {clusters.map((c) => (
            <section key={c.name} id={clusterId(c.name)} aria-label={c.name === '' ? 'Terms' : c.name} className="mb-6">
              <h2
                className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: NNL.textMed, borderColor: NNL.border }}
              >
                {c.name === '' ? 'Terms' : c.name}
              </h2>
              <dl className="flex flex-col gap-2">
                {c.terms.map((t) => (
                  <TermRow key={t.anchor} term={t} highlighted={highlight === t.anchor} />
                ))}
              </dl>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

function TermRow({ term, highlighted }: { term: GlossaryTerm; highlighted: boolean }) {
  const toast = useToast();
  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${term.anchor}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', term.term);
    } catch {
      toast.error('Could not copy the link', url);
    }
  };
  return (
    <div
      id={term.anchor}
      data-testid="term"
      data-highlighted={highlighted ? 'true' : 'false'}
      className="group scroll-mt-2 rounded border px-3 py-2 transition-colors duration-700"
      style={{
        backgroundColor: highlighted ? NNL.raised : NNL.surface,
        borderColor: highlighted ? NNL.status.next : NNL.border,
      }}
    >
      <dt className="flex items-baseline gap-2">
        <strong className="min-w-0 break-words text-[15px] font-semibold">{term.term}</strong>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy link to ${term.term}`}
          title="Copy link"
          className="rounded px-1 text-xs opacity-60 hover:bg-white/10 hover:opacity-100 focus:opacity-100"
          style={{ color: NNL.textMed }}
        >
          #
        </button>
      </dt>
      <dd className="m-0 min-w-0 break-words">
        <Markdown source={term.definition} />
        {term.avoid.length > 0 && (
          <p className="mt-1 text-[13px]" style={{ color: NNL.textLo }}>
            Avoid: {term.avoid.join(', ')}
          </p>
        )}
      </dd>
    </div>
  );
}
