import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ToastContext, type Toast, type ToastApi, type ToastOptions } from './toastContextValue';

const DEFAULT_TIMEOUT_MS = 5_000;
// Action toasts (typically "Undo") get a longer window so the user has
// time to recognise a misclick. ADR 0018 §Decision: 10 s.
const ACTION_TIMEOUT_MS = 10_000;

/**
 * How many toasts the feed shows at once.
 *
 * Without a cap the stack grows upward without bound: a burst of writes
 * — a pasted list becoming several items, a flurry of drags on the
 * Project Brief — can fill the height of the window, cover the thing
 * being worked on, and push the newest entry off the top of the screen.
 * Five is the most that still reads as a list at a glance.
 *
 * The **newest** five are kept. A toast announces something just done,
 * so when the feed has to shed one, the least relevant is the oldest.
 */
const MAX_VISIBLE_TOASTS = 5;

/** Fade applied to a toast evicted by the cap, before it is unmounted. */
const EVICT_FADE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Ids on their way out. Held beside the list rather than as a field on
  // `Toast`, so the shape every caller constructs stays unchanged:
  // fading is the feed's business, not the announcement's.
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(() => new Set());
  const nextId = useRef(1);

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setLeaving((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Enforce the cap. Done in an effect rather than inside `show` so the
  // eviction is a function of the rendered list: a toast that dismissed
  // itself in the same tick has already gone, and the feed sheds only
  // what is genuinely over the limit.
  //
  // Eviction fades rather than vanishing. The survivors slide down into
  // the gap, and a row disappearing from under the eye mid-read is the
  // jolt the cap exists to remove — replacing an unbounded stack with a
  // flickering one would be no better.
  useEffect(() => {
    const overflow = toasts.length - MAX_VISIBLE_TOASTS;
    if (overflow <= 0) return;
    const evicted = toasts.slice(0, overflow).map((t) => t.id);
    setLeaving((prev) => new Set([...prev, ...evicted]));
    const handle = window.setTimeout(() => {
      const gone = new Set(evicted);
      setToasts((prev) => prev.filter((t) => !gone.has(t.id)));
      setLeaving((prev) => {
        const next = new Set(prev);
        for (const id of evicted) next.delete(id);
        return next;
      });
    }, EVICT_FADE_MS);
    return () => window.clearTimeout(handle);
  }, [toasts]);

  const make = useCallback(
    (kind: Toast['kind']) => (title: string, message?: string, options?: ToastOptions) =>
      show({
        kind,
        title,
        message,
        action: options?.action,
        timeoutMs: options?.timeoutMs,
      }),
    [show],
  );

  const api: ToastApi = {
    show,
    success: make('success'),
    error: make('error'),
    info: make('info'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            leaving={leaving.has(t.id)}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  leaving,
  onDismiss,
}: {
  toast: Toast;
  /** Evicted by the feed's cap and fading out. */
  leaving: boolean;
  onDismiss: () => void;
}) {
  // Default 5 s; 10 s when an action is present (ADR 0018). An explicit
  // `timeoutMs` on the toast wins over both defaults.
  const timeoutMs =
    toast.timeoutMs ?? (toast.action !== undefined ? ACTION_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  useEffect(() => {
    const handle = window.setTimeout(onDismiss, timeoutMs);
    return () => window.clearTimeout(handle);
  }, [onDismiss, timeoutMs]);

  // Dismiss the toast BEFORE running the handler so a double-click cannot
  // fire the inverse mutation twice (ADR 0018).
  const onAction = async () => {
    if (toast.action === undefined) return;
    onDismiss();
    await toast.action.handler();
  };

  return (
    <div
      role="status"
      className={clsx(
        'rounded border px-3 py-2 shadow-sm transition-opacity duration-200',
        // On its way out: no longer clickable, so the Undo of a toast
        // that is half-gone cannot be hit by accident.
        leaving && 'pointer-events-none opacity-0',
        toast.kind === 'success' &&
          'border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200',
        toast.kind === 'error' &&
          'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200',
        toast.kind === 'info' &&
          'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/*
            One line, always. A title now carries which item an action
            applied to as well as what happened (ADR 0073 §4), so it can
            be long — and a feed of five (ADR 0074) that grows a line per
            entry defeats the cap. `truncate` bounds the height whatever
            a caller passes; the `title` attribute gives the full text
            back on hover, so nothing is actually lost. The parent has
            `min-w-0`, without which a flex child refuses to shrink and
            the ellipsis never appears.
          */}
          <div className="truncate font-medium" title={toast.title}>
            {toast.title}
          </div>
          {toast.message !== undefined && (
            <div className="mt-1 whitespace-pre-wrap text-sm opacity-80">{toast.message}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {toast.action !== undefined && (
            <button
              type="button"
              onClick={() => void onAction()}
              className="rounded px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:underline focus-visible:underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="text-sm opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
