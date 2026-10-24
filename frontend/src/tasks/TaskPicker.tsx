import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Task } from '../api/schemas';
import FolderIcon from './FolderIcon';
import { byTitle, flattenItemTree, lineageOf } from './itemTree';

/**
 * Searchable + indented task picker (ADR 0039, ADR 0043).
 *
 * Replaces the flat native `<select>` used everywhere a task is chosen
 * (parent picker, dependency add-dropdowns, the List "Parent" filter). When
 * the search box is empty it renders the `parent_id` tree indented by depth,
 * **collapsed to roots by default** (ADR 0043) — a ▸/▾ triangle folds/unfolds
 * each branch (pointer, or →/← on the active row), and Expand-all / Collapse-all
 * controls sit in the popover header. Typing filters to a flat list of title
 * matches, each tagged with its ancestor lineage so same-named tasks stay
 * distinguishable; a search always reveals every match regardless of fold state.
 *
 * Hand-rolled (no combobox dependency) to stay consistent with the existing
 * popover idiom in ProjectPicker. Combobox a11y: the trigger is a
 * `role="combobox"`; the popover holds a `<input>` and a `role="listbox"` of
 * `role="option"`s; the active option is tracked with `aria-activedescendant`.
 * The disclosure triangle is an aria-hidden glyph (folding is exposed to the
 * keyboard via →/←) — `aria-expanded` is not valid on `role="option"`, so fold
 * state is conveyed by which rows are present rather than an ARIA state.
 */

export interface TaskPickerProps {
  tasks: readonly Task[];
  /** Currently-selected task id, or null for "none" / "all". */
  value: string | null;
  /** Fires with the chosen task id, or null when the none/clear row is picked. */
  onChange: (id: string | null) => void;
  /** Accessible name for the trigger (e.g. "Parent task", "Filter by parent"). */
  ariaLabel: string;
  /** Task ids to omit entirely (self + descendants for the parent picker;
   *  self + already-linked for dependency pickers). Never rendered. */
  excludeIds?: ReadonlySet<string>;
  /** Label for the trigger when nothing is selected. Default "— none —". */
  noneLabel?: string;
  /** When false, no clear/none row is offered (selection is mandatory).
   *  Default true. */
  allowNone?: boolean;
  /** Snap the control back to the placeholder after a pick instead of showing
   *  the selection — the dependency chip-input flow (pick adds an edge, the
   *  control stays ready for the next pick). Default false. */
  resetOnSelect?: boolean;
  disabled?: boolean;
  className?: string;
}

const TRIGGER_CLASS =
  'flex w-full items-center justify-between gap-2 rounded border border-slate-300 bg-white px-2 py-1 text-left text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';

// Indentation per depth level, capped so deep trees don't crowd the ~384px
// detail panel (ADR 0039). Past the cap, lineage breadcrumbs in search results
// carry disambiguation rather than raw indent.
const INDENT_PER_LEVEL_REM = 0.85;
const MAX_INDENT_LEVELS = 6;

// Stable empty set used while searching (ADR 0043): a search reveals all
// matches, so the tree's collapse never applies. Module-level for a stable
// reference identity across renders.
const EMPTY_COLLAPSED: ReadonlySet<string> = new Set();

export default function TaskPicker({
  tasks,
  value,
  onChange,
  ariaLabel,
  excludeIds,
  noneLabel = '— none —',
  allowNone = true,
  resetOnSelect = false,
  disabled = false,
  className,
}: TaskPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Collapsed parent ids for the empty-search tree (ADR 0043). `null` is the
  // uninitialised sentinel: until the user folds/unfolds a branch (or uses the
  // Expand-all / Collapse-all controls), the effective set is "every parent",
  // so the popover opens to roots only. Reset to `null` on each open (below),
  // mirroring how the search query resets — the tree always opens collapsed.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string> | null>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const selectedTitle = value === null ? null : (titleById.get(value) ?? null);

  // Tasks the picker is allowed to offer (exclusions removed once, up front).
  const visibleTasks = useMemo(
    () =>
      excludeIds === undefined || excludeIds.size === 0
        ? tasks
        : tasks.filter((t) => !excludeIds.has(t.id)),
    [tasks, excludeIds],
  );

  // The empty-search tree, fully flattened (independent of collapse): every
  // visible task in DFS order with its depth + hasChildren. Also yields the set
  // of all parents — what Collapse-all folds and the lazy default collapses to.
  const treeRows = useMemo(() => flattenItemTree(visibleTasks), [visibleTasks]);
  const allParentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of treeRows) if (r.hasChildren) ids.add(r.task.id);
    return ids;
  }, [treeRows]);
  const searching = query.trim() !== '';
  // Effective collapsed set (ADR 0043): only the empty-search tree folds — a
  // search shows a flat match list and must reveal every match. `null` → every
  // parent collapsed (roots only); otherwise the user's explicit set.
  const effectiveCollapsed = searching ? EMPTY_COLLAPSED : (collapsedIds ?? allParentIds);

  // Rows to render: indented tree when the query is empty, flat title-matched
  // list (with lineage) otherwise. A synthetic "none" row leads the list when
  // allowed so it participates in keyboard navigation like any other option.
  interface Option {
    id: string | null;
    label: string;
    depth: number;
    lineage: string[];
    hasChildren: boolean;
    collapsed: boolean;
    /** ADR 0048: render a folder glyph before section names. */
    isSection: boolean;
  }
  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const head: Option[] = allowNone
      ? [
          {
            id: null,
            label: noneLabel,
            depth: 0,
            lineage: [],
            hasChildren: false,
            collapsed: false,
            isSection: false,
          },
        ]
      : [];
    if (q === '') {
      // Drop any row under a collapsed ancestor (same walk as the List view):
      // track the shallowest collapsed depth and skip rows deeper than it until
      // we return to or above that depth.
      const rows: Option[] = [];
      let hiddenBelowDepth: number | null = null;
      for (const r of treeRows) {
        if (hiddenBelowDepth !== null) {
          if (r.depth > hiddenBelowDepth) continue;
          hiddenBelowDepth = null;
        }
        const collapsed = effectiveCollapsed.has(r.task.id);
        rows.push({
          id: r.task.id,
          label: r.task.title,
          depth: r.depth,
          lineage: [],
          hasChildren: r.hasChildren,
          collapsed,
          isSection: r.task.is_section,
        });
        if (r.hasChildren && collapsed) hiddenBelowDepth = r.depth;
      }
      return [...head, ...rows];
    }
    const matches = visibleTasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .sort(byTitle)
      .map((t) => ({
        id: t.id,
        label: t.title,
        depth: 0,
        lineage: lineageOf(t.id, tasks),
        hasChildren: false,
        collapsed: false,
        isSection: t.is_section,
      }));
    return [...head, ...matches];
  }, [query, treeRows, effectiveCollapsed, visibleTasks, tasks, allowNone, noneLabel]);

  // Keep the active index in range as the option set shrinks/grows.
  useEffect(() => {
    setActiveIndex((i) => Math.min(Math.max(i, 0), Math.max(options.length - 1, 0)));
  }, [options.length]);

  // On open: reset the query + collapse (so the tree opens to roots only, ADR
  // 0043), focus the search box, and point the active option at the current
  // selection (or the first row).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCollapsedIds(null);
    const selectedIdx = options.findIndex((o) => o.id === value);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    // Focus after paint so the input exists.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // Intentionally only on `open` — we snapshot the selection at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click / Escape (mirrors ProjectPicker's lifecycle).
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
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  // Fold / unfold one parent in the empty-search tree (ADR 0043). Seeds from
  // the lazy default (`prev === null` → every parent collapsed) so the first
  // toggle flips one branch out of the collapsed-by-default state.
  const toggleCollapse = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev ?? allParentIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => setCollapsedIds(EMPTY_COLLAPSED);
  const collapseAll = () => setCollapsedIds(new Set(allParentIds));

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      // Tree-style fold/unfold of the active branch (ADR 0043). Right expands a
      // collapsed parent; Left collapses an expanded one. No-ops on leaves, on
      // the none row, and while searching (the flat match list has no tree).
      case 'ArrowRight': {
        const opt = options[activeIndex];
        if (opt?.id != null && opt.hasChildren && opt.collapsed) {
          e.preventDefault();
          toggleCollapse(opt.id);
        }
        break;
      }
      case 'ArrowLeft': {
        const opt = options[activeIndex];
        if (opt?.id != null && opt.hasChildren && !opt.collapsed) {
          e.preventDefault();
          toggleCollapse(opt.id);
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const opt = options[activeIndex];
        if (opt !== undefined) commit(opt.id);
        break;
      }
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const triggerLabel = resetOnSelect
    ? noneLabel
    : selectedTitle !== null
      ? selectedTitle
      : noneLabel;
  const showingPlaceholder = resetOnSelect || selectedTitle === null;
  // Only advertise an active descendant when an option actually exists: with
  // allowNone=false and everything filtered/excluded out, options is empty and
  // there is no `…-opt-0` element to point at (only the non-option "No matching
  // tasks." row renders), which would be an ARIA integrity violation.
  const activeOptionId = open && options.length > 0 ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={TRIGGER_CLASS}
      >
        <span
          className={clsx('truncate', showingPlaceholder && 'text-slate-400 dark:text-slate-500')}
        >
          {triggerLabel}
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-100 p-1 dark:border-slate-700">
            <input
              ref={inputRef}
              type="text"
              role="searchbox"
              aria-label={`Search ${ariaLabel}`}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>
          {/* Bulk tree controls (ADR 0043). Shown only for the empty-search
              tree that actually has parents to fold. `onMouseDown` +
              preventDefault runs the action without blurring the search box, so
              arrow-key navigation keeps working after a fold/unfold. */}
          {!searching && allParentIds.size > 0 && (
            <div className="flex items-center justify-end gap-1 border-b border-slate-100 px-1 py-1 dark:border-slate-700">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  expandAll();
                }}
                className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Expand all
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  collapseAll();
                }}
                className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Collapse all
              </button>
            </div>
          )}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-64 overflow-auto py-1 text-sm"
          >
            {options.every((o) => o.id === null) && (
              <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                No matching tasks.
              </li>
            )}
            {options.map((opt, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = opt.id === value;
              const indentRem = Math.min(opt.depth, MAX_INDENT_LEVELS) * INDENT_PER_LEVEL_REM + 0.5;
              return (
                <li
                  key={opt.id ?? '__none__'}
                  id={`${baseId}-opt-${idx}`}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  // Use onMouseDown (not onClick) so the selection commits
                  // before the input's blur can close the popover. A press on
                  // the disclosure triangle folds/unfolds the branch instead of
                  // selecting (ADR 0043).
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (
                      opt.id !== null &&
                      opt.hasChildren &&
                      (e.target as HTMLElement).closest('[data-disclosure]') !== null
                    ) {
                      toggleCollapse(opt.id);
                      setActiveIndex(idx);
                      return;
                    }
                    commit(opt.id);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={clsx(
                    'flex cursor-pointer flex-col py-1 pr-3',
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                    opt.id === null && 'italic text-slate-500 dark:text-slate-400',
                  )}
                  style={{ paddingLeft: `${indentRem}rem` }}
                >
                  <span className="flex items-center gap-1.5 truncate text-slate-800 dark:text-slate-100">
                    {/* Disclosure triangle on parents (aria-hidden; folding is
                        a pointer/Arrow-key affordance — see onKeyDown). Leaves
                        in the tree get an equal-width spacer so titles align. */}
                    {opt.hasChildren ? (
                      <span
                        data-disclosure
                        aria-hidden
                        className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400"
                      >
                        {opt.collapsed ? '▸' : '▾'}
                      </span>
                    ) : (
                      !searching && <span aria-hidden className="h-4 w-4 shrink-0" />
                    )}
                    {opt.isSection && (
                      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
                    )}
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <span aria-hidden className="shrink-0 text-xs text-slate-400">
                        ✓
                      </span>
                    )}
                  </span>
                  {opt.lineage.length > 0 && (
                    <span className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {opt.lineage.join(' › ')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
