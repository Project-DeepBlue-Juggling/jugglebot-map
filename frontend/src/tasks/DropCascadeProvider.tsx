import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { DropCascadeContext, type DropCascadeApi, type DropChoice } from './dropCascadeContext';
import DropCascadeDialog from './DropCascadeDialog';

interface Pending {
  title: string;
  openDescendants: readonly { title: string }[];
}

/**
 * ADR 0075 §11: hosts the single drop-cascade dialog and exposes an imperative
 * `confirmDrop(title, openDescendants)` that resolves with the user's choice.
 * Mounted in `ActiveProjectShell` alongside the completion reminder, so every
 * gesture that can set `dropped` — the detail-panel save and the List /
 * Backlog inline status selects — can `await` it before committing.
 */
export function DropCascadeProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Holds the current dialog's resolver. Kept in a ref (not state) so settling
  // is a plain call, never a side effect inside a state updater.
  const resolveRef = useRef<((choice: DropChoice) => void) | null>(null);

  const confirmDrop = useCallback(
    (title: string, openDescendants: readonly { title: string }[]) =>
      new Promise<DropChoice>((resolve) => {
        resolveRef.current = resolve;
        setPending({ title, openDescendants });
      }),
    [],
  );

  const settle = useCallback((choice: DropChoice) => {
    resolveRef.current?.(choice);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const value = useMemo<DropCascadeApi>(() => ({ confirmDrop }), [confirmDrop]);

  return (
    <DropCascadeContext.Provider value={value}>
      {children}
      {pending !== null && (
        <DropCascadeDialog
          title={pending.title}
          openDescendants={pending.openDescendants}
          onCascade={() => settle('cascade')}
          onOnly={() => settle('only')}
          onCancel={() => settle('cancel')}
        />
      )}
    </DropCascadeContext.Provider>
  );
}
