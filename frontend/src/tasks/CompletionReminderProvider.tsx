import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { CompletionReminderContext, type CompletionReminderApi } from './completionReminderContext';
import CompletionReminderDialog from './CompletionReminderDialog';

interface Pending {
  title: string;
  criteria: string;
}

/**
 * ADR 0060: hosts the single completion-reminder dialog and exposes an
 * imperative `confirmComplete(title, criteria)` that resolves true/false when
 * the user acts. Mounted in `ActiveProjectShell` so every direct completion
 * gesture (detail-panel save, board drag, list/backlog inline status) can
 * `await` it before committing the write.
 */
export function CompletionReminderProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Holds the current dialog's resolver. Kept in a ref (not state) so settling
  // is a plain call, never a side effect inside a state updater.
  const resolveRef = useRef<((proceed: boolean) => void) | null>(null);

  const confirmComplete = useCallback(
    (title: string, criteria: string) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setPending({ title, criteria });
      }),
    [],
  );

  const settle = useCallback((proceed: boolean) => {
    resolveRef.current?.(proceed);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const value = useMemo<CompletionReminderApi>(() => ({ confirmComplete }), [confirmComplete]);

  return (
    <CompletionReminderContext.Provider value={value}>
      {children}
      {pending !== null && (
        <CompletionReminderDialog
          title={pending.title}
          criteria={pending.criteria}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </CompletionReminderContext.Provider>
  );
}
