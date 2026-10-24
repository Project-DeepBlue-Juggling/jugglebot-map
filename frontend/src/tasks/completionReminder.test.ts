import { describe, expect, it } from 'vitest';
import { resolveCompletionReminder } from './completionReminder';
import type { Task } from '../api/schemas';

/** Minimal shape the resolver reads. */
function taskLike(overrides: Partial<Pick<Task, 'status' | 'is_section' | 'completion_criteria'>>) {
  return {
    status: 'in_progress' as const,
    is_section: false,
    completion_criteria: 'All acceptance tests pass.',
    ...overrides,
  };
}

describe('resolveCompletionReminder', () => {
  it('reminds on a genuine transition into complete with non-empty criteria', () => {
    const r = resolveCompletionReminder(taskLike({}), { nextStatus: 'complete' });
    expect(r.remind).toBe(true);
    expect(r.criteria).toBe('All acceptance tests pass.');
  });

  it('does not remind when the status is not becoming complete', () => {
    expect(resolveCompletionReminder(taskLike({}), { nextStatus: 'qa' }).remind).toBe(false);
    expect(resolveCompletionReminder(taskLike({}), { nextStatus: undefined }).remind).toBe(false);
  });

  it('does not remind when the task is already complete (re-save, not a transition)', () => {
    const r = resolveCompletionReminder(taskLike({ status: 'complete' }), {
      nextStatus: 'complete',
    });
    expect(r.remind).toBe(false);
  });

  it('does not remind when completion criteria is empty or whitespace-only', () => {
    expect(
      resolveCompletionReminder(taskLike({ completion_criteria: '' }), { nextStatus: 'complete' })
        .remind,
    ).toBe(false);
    expect(
      resolveCompletionReminder(taskLike({ completion_criteria: '   \n\t' }), {
        nextStatus: 'complete',
      }).remind,
    ).toBe(false);
  });

  it('does not remind for a section, even with criteria', () => {
    const r = resolveCompletionReminder(taskLike({ is_section: true }), { nextStatus: 'complete' });
    expect(r.remind).toBe(false);
  });

  it('uses the pending (edited) criteria when the same write changes it', () => {
    // Panel case: the user typed new criteria and set status=complete in one save.
    const r = resolveCompletionReminder(taskLike({ completion_criteria: 'old' }), {
      nextStatus: 'complete',
      nextCriteria: 'new criteria',
    });
    expect(r.remind).toBe(true);
    expect(r.criteria).toBe('new criteria');
  });

  it('does not remind when the same write clears the criteria to empty', () => {
    const r = resolveCompletionReminder(taskLike({ completion_criteria: 'old' }), {
      nextStatus: 'complete',
      nextCriteria: '',
    });
    expect(r.remind).toBe(false);
  });

  it('treats an explicit null criteria (a clear) as empty', () => {
    const r = resolveCompletionReminder(taskLike({ completion_criteria: 'old' }), {
      nextStatus: 'complete',
      nextCriteria: null,
    });
    expect(r.remind).toBe(false);
    expect(r.criteria).toBe('');
  });

  it('falls back to the stored criteria when the write leaves it untouched', () => {
    // Board/List case: status-only change carries no nextCriteria.
    const r = resolveCompletionReminder(taskLike({ completion_criteria: 'stored' }), {
      nextStatus: 'complete',
    });
    expect(r.remind).toBe(true);
    expect(r.criteria).toBe('stored');
  });
});
