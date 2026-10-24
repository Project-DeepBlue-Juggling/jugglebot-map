import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTasks } from '../api/hooks';
import FolderIcon from '../tasks/FolderIcon';
import { lineageOf } from '../tasks/itemTree';
import { searchTasks } from './searchMatch';
import { useSearch } from './useSearch';

/**
 * Global task-search toolbar (ADR 0044). An editable combobox in the shared
 * top bar above every view: type a title fragment, get a dropdown of matches
 * (each with its parent-lineage breadcrumb), and pick one to open its detail
 * panel + focus it in the active view. The match set also drives the in-view
 * ring highlight via the shared `useSearch()` context.
 *
 * Combobox a11y: the `<input>` is the `role="combobox"` with `aria-expanded`,
 * `aria-controls`, `aria-autocomplete="list"` and `aria-activedescendant`; the
 * popup is a `role="listbox"` of `role="option"`s. Mirrors the `<TaskPicker>`
 * keyboard model (↑/↓/Enter/Esc). Ctrl/⌘+K focuses the input from anywhere.
 */

// Cap rendered rows so a very loose query can't paint hundreds of options; the
// live count still reflects the true total and the trailing row says how many
// are hidden. Generous for v1 scale (≤ a few hundred tasks).
const MAX_RESULTS = 50;

export default function SearchToolbar() {
  const { data: tasks } = useTasks();
  const { query, setQuery, clear, matchCount, requestFocus } = useSearch();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allTasks = useMemo(() => tasks ?? [], [tasks]);
  const hasQuery = query.trim() !== '';

  // Rows to render: matches (capped), each tagged with its ancestor lineage so
  // same-named tasks stay distinguishable — exactly like the dependency picker.
  const results = useMemo(() => {
    if (!hasQuery) return [];
    return searchTasks(allTasks, query)
      .slice(0, MAX_RESULTS)
      .map((t) => ({
        id: t.id,
        label: t.title,
        lineage: lineageOf(t.id, allTasks),
        isSection: t.is_section,
      }));
  }, [allTasks, query, hasQuery]);

  const showDropdown = open && hasQuery;
  const hiddenCount = matchCount - results.length;

  // Keep the active row in range as the result set changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(Math.max(i, 0), Math.max(results.length - 1, 0)));
  }, [results.length]);

  // Ctrl/⌘+K focuses the search from anywhere. The modifier means the views'
  // plain-key shortcuts (which bail on any modifier) never collide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close the dropdown on outside click (mirrors the picker lifecycle). The
  // query — and so the highlight — survives; only the menu closes.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target !== null && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Scroll the active option into view as the user arrows through.
  useEffect(() => {
    if (!showDropdown) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, showDropdown]);

  const pick = (taskId: string) => {
    requestFocus(taskId);
    setOpen(false); // close the menu but keep the query so the highlight stays
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (showDropdown) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (showDropdown) {
          e.preventDefault();
          setActiveIndex(results.length - 1);
        }
        break;
      case 'Enter': {
        if (!showDropdown) break;
        e.preventDefault();
        const row = results[activeIndex];
        if (row !== undefined) pick(row.id);
        break;
      }
      case 'Escape':
        e.preventDefault();
        // First Escape closes the menu; if it's already closed, clear the query.
        if (open) setOpen(false);
        else if (hasQuery) clear();
        break;
      default:
        break;
    }
  };

  const activeOptionId =
    showDropdown && results.length > 0 ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} data-testid="search-toolbar" className="relative w-72 max-w-full">
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
        >
          ⌕
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search tasks"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          value={query}
          placeholder="Search tasks…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded border border-slate-300 bg-white py-1 pl-7 pr-14 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
        {/* Right slot: a live match count while searching, else a Ctrl+K hint. */}
        {hasQuery ? (
          <span className="absolute right-7 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {matchCount}
          </span>
        ) : (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1 font-mono text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
            ⌃K
          </kbd>
        )}
        {hasQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-100 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {matchCount === 0
              ? 'No matching tasks'
              : `${matchCount} matching task${matchCount === 1 ? '' : 's'}`}
          </div>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="max-h-72 overflow-auto py-1 text-sm"
          >
            {results.map((row, idx) => {
              const isActive = idx === activeIndex;
              return (
                <li
                  key={row.id}
                  id={`${baseId}-opt-${idx}`}
                  data-index={idx}
                  role="option"
                  aria-selected={isActive}
                  // onMouseDown (not onClick) so selection commits before the
                  // input blur can close the popover.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(row.id);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={clsx(
                    'flex cursor-pointer flex-col px-3 py-1',
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                  )}
                >
                  <span className="flex items-center gap-1 truncate text-slate-800 dark:text-slate-100">
                    {row.isSection && (
                      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
                    )}
                    <span className="truncate">{row.label}</span>
                  </span>
                  {row.lineage.length > 0 && (
                    <span className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {row.lineage.join(' › ')}
                    </span>
                  )}
                </li>
              );
            })}
            {hiddenCount > 0 && (
              <li className="px-3 py-1 text-xs italic text-slate-400 dark:text-slate-500">
                +{hiddenCount} more — refine your search
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
