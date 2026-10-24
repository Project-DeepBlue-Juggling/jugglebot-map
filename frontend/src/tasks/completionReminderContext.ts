import { createContext } from 'react';

/**
 * ADR 0060: imperative confirm for the completion reminder. `confirmComplete`
 * shows a modal with the task's completion criteria and resolves `true` if the
 * user proceeds, `false` if they cancel.
 */
export interface CompletionReminderApi {
  confirmComplete: (title: string, criteria: string) => Promise<boolean>;
}

/**
 * Default is a no-op that auto-proceeds — so a component rendered without the
 * provider (e.g. in a focused unit test) completes normally with no dialog.
 * Production always mounts `CompletionReminderProvider` in `ActiveProjectShell`.
 */
export const CompletionReminderContext = createContext<CompletionReminderApi>({
  confirmComplete: () => Promise.resolve(true),
});
