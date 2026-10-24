import { createContext } from 'react';

/**
 * What the user chose when asked whether to carry a drop down the tree
 * (ADR 0075 §11).
 *
 *   - `only`    — drop just this task; leave the work beneath it alone.
 *   - `cascade` — drop this task and every open task beneath it.
 *   - `cancel`  — write nothing.
 */
export type DropChoice = 'only' | 'cascade' | 'cancel';

/**
 * ADR 0075: imperative confirm for the drop cascade. `confirmDrop` shows a
 * modal naming the open sub-tasks and resolves with the user's choice.
 */
export interface DropCascadeApi {
  confirmDrop: (
    title: string,
    openDescendants: readonly { title: string }[],
  ) => Promise<DropChoice>;
}

/**
 * Default auto-proceeds with `only` — so a component rendered without the
 * provider (e.g. in a focused unit test) drops the one task with no dialog,
 * which is the conservative choice: it never writes to a task the caller did
 * not name. Production always mounts `DropCascadeProvider` in
 * `ActiveProjectShell`, mirroring ADR 0060's reminder.
 */
export const DropCascadeContext = createContext<DropCascadeApi>({
  confirmDrop: () => Promise.resolve<DropChoice>('only'),
});
