import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useGlossary, useTasks } from '../../api/hooks';
import { searchMap, type SearchHit } from '../../lib/search';
import { hasModifier, isShortcutTarget, modalIsOpen } from '../../ui/keyboard';
import { useActiveProjectId } from '../../projects/useActiveProject';
import { useOpenItem } from '../drawer/drawerContext';
import { NightlyChip } from '../nightly/NightlyChip';

const DEBOUNCE_MS = 50; // search is ~7 ms, so keystroke-to-results stays inside the 100 ms budget

/**
 * Header search over the loaded items, plans and glossary terms. `/` focuses
 * it, Esc clears and blurs, arrows + Enter pick a result: an item or plan opens
 * in the drawer, a glossary term opens the Dictionary scrolled to that term.
 * Below `sm` the box collapses to an icon that expands the input on tap.
 */
export function SearchBar() {
  const projectId = useActiveProjectId();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const openItem = useOpenItem();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  // The glossary is fetched on first focus unless the Dictionary already cached it.
  const [wantGlossary, setWantGlossary] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tasks = useTasks();
  const glossary = useGlossary({ enabled: wantGlossary });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const groups = useMemo(
    () => searchMap(tasks.data ?? [], glossary.data, debounced),
    [tasks.data, glossary.data, debounced],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  useEffect(() => setActive(0), [groups]);

  // `/` from anywhere but a text field. The Dictionary page keeps its own `/`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || hasModifier(e) || !isShortcutTarget() || modalIsOpen()) return;
      if (/\/dictionary\/?$/.test(pathname)) return;
      e.preventDefault();
      setExpanded(true);
      setWantGlossary(true);
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pathname]);

  // Click outside closes the panel.
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: PointerEvent | MouseEvent) => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target)) return;
      setPanelOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panelOpen]);

  const reset = () => {
    setQuery('');
    setDebounced('');
    setPanelOpen(false);
    setExpanded(false);
  };

  const choose = (hit: SearchHit) => {
    reset();
    inputRef.current?.blur();
    if (hit.group === 'glossary') navigate(`/projects/${projectId}/dictionary#${hit.id}`);
    else openItem(hit.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query !== '' || panelOpen) e.nativeEvent.stopPropagation(); // keep the drawer open
      reset();
      e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (flat.length === 0) return;
      e.preventDefault();
      setPanelOpen(true);
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + d + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      const hit = flat[active];
      if (hit !== undefined && panelOpen) {
        e.preventDefault();
        choose(hit);
      }
    }
  };

  const showPanel = panelOpen && debounced.trim() !== '';
  const optionId = (hit: SearchHit) => `search-opt-${hit.group}-${hit.id}`;

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800"
    >
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          setWantGlossary(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={clsx(
          'rounded px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 sm:hidden',
          expanded && 'hidden',
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search items, plans and terms"
        aria-expanded={showPanel}
        aria-controls="search-results"
        aria-activedescendant={
          showPanel && flat[active] !== undefined ? optionId(flat[active]) : undefined
        }
        placeholder="Search items, plans, terms"
        value={query}
        onFocus={() => {
          setWantGlossary(true);
          if (query !== '') setPanelOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setPanelOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={clsx(
          'min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-dr-focus dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 sm:block sm:max-w-md',
          !expanded && 'hidden',
        )}
      />
      {showPanel && (
        <div
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-4 right-4 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800 sm:right-auto sm:w-[28rem]"
        >
          {groups.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              No match for “{debounced.trim()}”.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label}>
              <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {g.label}
              </div>
              {g.hits.map((hit) => {
                const isActive = flat[active] === hit;
                return (
                  <div
                    key={hit.id}
                    id={optionId(hit)}
                    role="option"
                    aria-selected={isActive}
                    data-closed={hit.closed ? 'true' : 'false'}
                    onMouseEnter={() => setActive(flat.indexOf(hit))}
                    onClick={() => choose(hit)}
                    className={clsx(
                      'flex cursor-pointer items-baseline gap-2 px-3 py-1 text-sm',
                      isActive && 'bg-slate-100 dark:bg-slate-700',
                      hit.closed && 'opacity-50',
                    )}
                  >
                    {hit.shortId !== null && (
                      <span className="shrink-0 font-mono text-[11px] opacity-70">
                        {hit.shortId}
                      </span>
                    )}
                    <span className="min-w-0 truncate">{hit.title}</span>
                    {hit.avoid !== null && (
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        avoid: {hit.avoid}
                      </span>
                    )}
                    {hit.closed && hit.status !== null && (
                      <span className="ml-auto shrink-0 text-xs">{hit.status}</span>
                    )}
                  </div>
                );
              })}
              {g.more > 0 && (
                <div className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400">
                  +{g.more} more
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <NightlyChip />
    </div>
  );
}
