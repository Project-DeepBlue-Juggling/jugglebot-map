import { useContext } from 'react';
import { CompletionReminderContext } from './completionReminderContext';

/**
 * ADR 0060: access the completion-reminder confirm. Outside a
 * `CompletionReminderProvider` it returns an auto-proceed no-op, so completion
 * gestures work unchanged in components rendered without the provider.
 */
export function useCompletionReminder() {
  return useContext(CompletionReminderContext);
}
