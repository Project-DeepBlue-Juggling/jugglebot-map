import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * Searchable single-select combobox over a user list (ADR 0058).
 *
 * Built for the task detail panel's "Reviewer" field, but generic over any
 * person-valued single pick: type-to-filter by display name (case-insensitive
 * substring), full keyboard navigation (↑/↓/Home/End move, Enter selects,
 * Esc closes), and a ✕ clear affordance when a value is set. Each option —
 * and the closed control — carries the user's palette colour dot, matching
 * the assignee pills.
 *
 * Combobox a11y mirrors the SearchToolbar idiom: the `<input>` is the
 * `role="combobox"` with `aria-expanded`, `aria-controls`,
 * `aria-autocomplete="list"` and `aria-activedescendant`; the popup is a
 * `role="listbox"` of `role="option"`s. While closed the input shows the
 * selected user's name; opening it starts a fresh query over the full list.
 */

/** Minimal structural user shape — satisfied by the API `User` and by the
 *  `{ id, display_name, color }` subset the detail panel already threads. */
export interface ComboboxUser {
  id: string;
  display_name: string;
  color: string | null;
}

export interface UserComboboxProps {
  users: readonly ComboboxUser[];
  /** Currently-selected user id, or null for "none". */
  value: string | null;
  /** Fires with the picked user id, or null when cleared. */
  onChange: (id: string | null) => void;
  /** Accessible name for the input (e.g. "Reviewer"). */
  ariaLabel: string;
  /** Placeholder while nothing is selected. Default "— none —". */
  placeholder?: string;
  /**
   * Label for an explicit "no one" row at the top of the list. Omit it for a
   * picker where clearing is meaningless — the availability roster's "Person
   * to add" has nothing to express by picking nobody.
   *
   * The ✕ affordance can already clear a set value, but it is a different
   * gesture in a different place, and someone who picked a reviewer from a
   * list looks for "None" in that same list to undo it. Offering both is the
   * point: the ✕ is the shortcut, this is the one you find without being told.
   */
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** The palette colour dot the assignee pills render (dashed ring when the
 *  user has no colour set). */
function ColourDot({ colour }: { colour: string | null }) {
  return colour === null ? (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full border border-dashed border-slate-400 dark:border-slate-500"
    />
  ) : (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: colour }}
    />
  );
}

export default function UserCombobox({
  users,
  value,
  onChange,
  ariaLabel,
  placeholder = '— none —',
  noneLabel,
  disabled = false,
  className,
}: UserComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = value === null ? null : (users.find((u) => u.id === value) ?? null);

  /**
   * The rows the listbox renders: the optional "none" row, then the filtered
   * users. Modelled as one list rather than a special case bolted on top,
   * because every index in this component — `activeIndex`, the arrow keys,
   * Home/End, `aria-activedescendant`, the scroll-into-view — addresses rows
   * by position. A row left out of that list would be visible but
   * unreachable by keyboard.
   *
   * Case-insensitive substring filter on the label; an empty query offers the
   * full member list (the sets here are ~10 users, ADR 0058). The none row
   * filters on its own label too, so typing "no" still finds it.
   */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches =
      q === '' ? users : users.filter((u) => u.display_name.toLowerCase().includes(q));
    const userRows = matches.map((u) => ({
      id: u.id as string | null,
      label: u.display_name,
      colour: u.color,
    }));
    if (noneLabel === undefined) return userRows;
    if (q !== '' && !noneLabel.toLowerCase().includes(q)) return userRows;
    return [{ id: null as string | null, label: noneLabel, colour: null }, ...userRows];
  }, [users, query, noneLabel]);

  // Keep the active row in range as the option set shrinks/grows.
  useEffect(() => {
    setActiveIndex((i) => Math.min(Math.max(i, 0), Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // Close on outside click (mirrors the TaskPicker / SearchToolbar lifecycle).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target !== null && rootRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
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

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    // Point the active option at the current selection (or the top).
    // Points at the current selection — including the none row when nothing
    // is picked, so opening the list always lands on the live answer.
    const selectedIdx = rows.findIndex((r) => r.id === value);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
  };

  const commit = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          openList();
          break;
        }
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActiveIndex(rows.length - 1);
        }
        break;
      case 'Enter': {
        if (!open) break;
        e.preventDefault();
        const row = rows[activeIndex];
        if (row !== undefined) commit(row.id);
        break;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          // Esc closes the frontmost layer only (ADR 0019): with the popup
          // open, swallow the key so the host panel's window-level Escape →
          // close-panel handler never sees it. React's onKeyDown fires
          // during bubbling before the event reaches window, so stopping
          // propagation here is sufficient. Focus stays in the input; a
          // second Escape (popup closed) falls through to the panel.
          e.stopPropagation();
          setOpen(false);
          setQuery('');
        }
        break;
      case 'Tab':
        setOpen(false);
        setQuery('');
        break;
      default:
        break;
    }
  };

  // While closed the input reads back the selection; typing always starts a
  // filter query over the whole list.
  const inputValue = open ? query : (selected?.display_name ?? '');
  const activeOptionId = open && rows.length > 0 ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <div className="relative">
        {/* The selected user's colour dot sits in the input's leading slot so
            the closed control reads like the assignee pills. */}
        {!open && selected !== null && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
            <ColourDot colour={selected.color} />
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          disabled={disabled}
          value={inputValue}
          placeholder={selected === null ? placeholder : undefined}
          onChange={(e) => {
            if (!open) openList();
            setQuery(e.target.value);
          }}
          onClick={openList}
          onFocus={openList}
          onKeyDown={onKeyDown}
          className={clsx(
            'w-full rounded border border-slate-300 bg-white py-1 pr-7 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100',
            !open && selected !== null ? 'pl-7' : 'pl-2',
          )}
        />
        {/* Clear affordance — only when a value is set (like the search box). */}
        {selected !== null && !disabled && (
          <button
            type="button"
            aria-label={`Clear ${ariaLabel.toLowerCase()}`}
            onClick={() => {
              commit(null);
              inputRef.current?.focus();
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-56 overflow-auto py-1 text-sm"
          >
            {rows.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                No matching members.
              </li>
            )}
            {rows.map((row, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = row.id === value;
              const isNone = row.id === null;
              return (
                <li
                  key={row.id ?? '__none__'}
                  id={`${baseId}-opt-${idx}`}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  // onMouseDown (not onClick) so selection commits before the
                  // input blur can close the popover.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(row.id);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-1.5 px-3 py-1',
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                  )}
                >
                  {isNone ? (
                    // No dot: the row means "nobody", and a colour dot there
                    // would read as a person whose colour is unset.
                    <span aria-hidden className="h-2 w-2 shrink-0" />
                  ) : (
                    <ColourDot colour={row.colour} />
                  )}
                  <span
                    className={clsx(
                      'truncate',
                      isNone
                        ? 'italic text-slate-500 dark:text-slate-400'
                        : 'text-slate-800 dark:text-slate-100',
                    )}
                  >
                    {row.label}
                  </span>
                  {isSelected && (
                    <span aria-hidden className="shrink-0 text-xs text-slate-400">
                      ✓
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
