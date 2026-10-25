import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import Markdown from '../../ui/Markdown';

/** Grow a textarea to its content (the caller caps it with max-height). */
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

const TITLE_TYPE = 'text-[18px] font-semibold leading-[1.35] text-dr-hi [overflow-wrap:anywhere]';

interface TitleProps {
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  /** Shown instead of `value` in the reading view (a phase's code + title). */
  display?: string;
}

/**
 * The drawer's title: a wrapping heading (never clipped), and for editable
 * kinds a click-to-edit region. The editor updates the form on every key so a
 * save-on-leave sees it; Enter or blur ends editing, Esc restores the value
 * from when editing began.
 */
export function Title({ value, editable, onChange, display }: TitleProps) {
  const [editing, setEditing] = useState(false);
  const start = useRef(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Set when Enter/Esc ends editing, so focus returns inside the drawer and
  // its shortcuts (Ctrl+Enter save) keep working; a blur leaves focus alone.
  const refocus = useRef(false);
  useAutoGrow(ref, value);
  // Announce the title when an item opens.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!editing) {
      if (refocus.current) heading.current?.focus({ preventScroll: true });
      refocus.current = false;
      return;
    }
    const el = ref.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  const begin = () => {
    start.current = value;
    setEditing(true);
  };
  if (!editable) {
    return (
      <h2 ref={heading} tabIndex={-1} className={clsx(TITLE_TYPE, 'outline-none')}>
        {display ?? value}
      </h2>
    );
  }
  if (editing) {
    const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        refocus.current = true;
        setEditing(false);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        onChange(start.current);
        refocus.current = true;
        setEditing(false);
      }
    };
    return (
      <textarea
        ref={ref}
        rows={1}
        aria-label="Title"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
        onKeyDown={key}
        onBlur={() => setEditing(false)}
        className={clsx(
          TITLE_TYPE,
          'block w-full resize-none overflow-hidden rounded border border-dr-strong bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-dr-focus',
        )}
      />
    );
  }
  return (
    <div className="group relative -mx-1 flex items-start gap-1 rounded border border-transparent px-1 hover:border-dr-strong">
      <h2
        ref={heading}
        tabIndex={-1}
        onClick={begin}
        className={clsx(TITLE_TYPE, 'min-w-0 flex-1 cursor-text outline-none')}
      >
        {value}
      </h2>
      <button
        type="button"
        aria-label="Edit title"
        onClick={begin}
        className="mt-0.5 shrink-0 rounded px-1 text-[13px] text-dr-lo opacity-60 hover:text-dr-hi hover:opacity-100 focus:opacity-100"
      >
        ✎
      </button>
    </div>
  );
}

interface FieldProps {
  /** Section label, also the editor's accessible name ("Description", "Notes"...). */
  label: string;
  value: string;
  editable: boolean;
  onChange?: (v: string) => void;
  editing?: boolean;
  onEditingChange?: (v: boolean) => void;
  /** Left accent for the Pathway Destination callout. */
  callout?: string;
  emptyText?: string;
}

/**
 * A markdown block. Reading view renders it; for editable kinds an Edit
 * button swaps in Write | Preview over the raw markdown (the file in git stays
 * the source of truth) with a Done button. Clicking rendered text never starts
 * editing, so links and selection keep working.
 */
export function MarkdownField({
  label,
  value,
  editable,
  onChange,
  editing = false,
  onEditingChange,
  callout,
  emptyText = 'Add a description…',
}: FieldProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement>(null);
  const section = useRef<HTMLElement>(null);
  // Set when Esc or Done ends editing, so focus stays inside the drawer.
  const refocus = useRef(false);
  useAutoGrow(ref, value);
  useEffect(() => {
    if (!editing) {
      if (refocus.current) section.current?.focus({ preventScroll: true });
      refocus.current = false;
      return;
    }
    setTab('write');
    const el = ref.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  const setEditing = (v: boolean) => onEditingChange?.(v);
  const finish = () => {
    refocus.current = true;
    setEditing(false);
  };
  const empty = value.trim() === '';

  return (
    <section
      ref={section}
      tabIndex={-1}
      className={clsx(
        'outline-none',
        callout === undefined
          ? 'mt-4 border-t border-dr-border pt-3'
          : 'mt-4 rounded-r border-l-[3px] bg-dr-code p-3',
      )}
      style={callout === undefined ? undefined : { borderLeftColor: callout }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-dr-lo">{label}</span>
        {editable && !editing && (
          <button
            type="button"
            aria-label={`Edit ${label.toLowerCase()}`}
            onClick={() => setEditing(true)}
            className="text-xs text-dr-link hover:underline"
          >
            ✎ Edit
          </button>
        )}
        {editable && editing && (
          <button
            type="button"
            onClick={finish}
            className="rounded border border-dr-strong px-2 py-0.5 text-xs text-dr-hi"
          >
            Done
          </button>
        )}
      </div>
      {editing ? (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              finish();
            }
          }}
        >
          <div role="tablist" aria-label={`${label} editor`} className="mb-1.5 flex gap-3">
            {(['write', 'preview'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={clsx(
                  'border-b-2 pb-0.5 text-xs',
                  tab === t
                    ? 'border-dr-focus text-dr-hi'
                    : 'border-transparent text-dr-lo hover:text-dr-hi',
                )}
              >
                {t === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
          {tab === 'write' ? (
            <textarea
              ref={ref}
              rows={10}
              aria-label={label}
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              className="block max-h-[60vh] min-h-[10rem] w-full resize-none overflow-y-auto rounded border border-dr-strong bg-dr-code p-2 font-mono text-[13px] leading-[1.55] text-dr-hi focus:outline-none focus:ring-2 focus:ring-dr-focus"
            />
          ) : empty ? (
            <p className="text-[13px] text-dr-lo">Nothing to preview</p>
          ) : (
            <Markdown source={value} />
          )}
        </div>
      ) : empty ? (
        editable ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full rounded border border-dashed border-dr-strong p-3 text-left text-[13px] text-dr-lo hover:text-dr-hi"
          >
            {emptyText}
          </button>
        ) : (
          <p className="text-[13px] text-dr-lo">None</p>
        )
      ) : (
        <Markdown source={value} />
      )}
    </section>
  );
}
