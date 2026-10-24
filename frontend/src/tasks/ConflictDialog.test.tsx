import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConflictDialog from './ConflictDialog';
import type { TaskUpdateConflict, User } from '../api/schemas';

/**
 * Tests for the Phase 4 conflict-warning dialog (ADR 0004).
 *
 * Cover the contract: per-field diff renders with humanised labels and
 * resolved names, Overwrite + Cancel callbacks fire, the busy state
 * disables both buttons, and the empty-conflicts case still shows the
 * "they edited fields you didn't touch" hint.
 */

const ALICE: User = {
  id: '00000000-0000-0000-0000-0000000000a1',
  email: 'alice@local',
  display_name: 'Alice',
  color: null,
  dark_mode: 'system',
  created_at: '2026-05-06T00:00:00Z',
  is_availability_admin: false,
  can_access_catalogue: false,
};

function makeConflict(overrides: Partial<TaskUpdateConflict> = {}): TaskUpdateConflict {
  return {
    detail: 'Task has been modified since the provided timestamp.',
    current_updated_at: '2026-05-07T00:00:00Z',
    current_updated_by: ALICE.id,
    conflicts: {
      title: { client: 'Bob title', server: 'Alice title' },
      status: { client: 'in_progress', server: 'complete' },
    },
    ...overrides,
  };
}

describe('ConflictDialog', () => {
  it('renders the conflicting user, the per-field diff, and humanised values', () => {
    render(
      <ConflictDialog
        conflict={makeConflict()}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={false}
        onCancel={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText(/Alice also edited this task/i)).toBeVisible();

    // Field labels.
    expect(screen.getByText('Title')).toBeVisible();
    expect(screen.getByText('Status')).toBeVisible();

    // Raw client + server values, status humanised via STATUS_LABELS.
    expect(screen.getByText('Bob title')).toBeVisible();
    expect(screen.getByText('Alice title')).toBeVisible();
    expect(screen.getByText('In progress')).toBeVisible();
    expect(screen.getByText('Complete')).toBeVisible();
  });

  it('falls back to "Another user" when the actor is unknown', () => {
    render(
      <ConflictDialog
        conflict={makeConflict()}
        users={[]}
        parentLookup={new Map()}
        busy={false}
        onCancel={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );
    expect(screen.getByText(/another user also edited this task/i)).toBeVisible();
  });

  it('renders the empty-conflicts hint when the diff is empty', () => {
    render(
      <ConflictDialog
        conflict={makeConflict({ conflicts: {} })}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={false}
        onCancel={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );
    expect(screen.getByText(/they edited fields you didn.?t touch/i)).toBeVisible();
  });

  it('Overwrite button calls onOverwrite', () => {
    const onOverwrite = vi.fn();
    render(
      <ConflictDialog
        conflict={makeConflict()}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={false}
        onCancel={vi.fn()}
        onOverwrite={onOverwrite}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /overwrite with my edits/i }));
    expect(onOverwrite).toHaveBeenCalledTimes(1);
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ConflictDialog
        conflict={makeConflict()}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={false}
        onCancel={onCancel}
        onOverwrite={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel and discard my edits/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ConflictDialog
        conflict={makeConflict()}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={false}
        onCancel={onCancel}
        onOverwrite={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    render(
      <ConflictDialog
        conflict={makeConflict()}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={true}
        onCancel={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel and discard my edits/i })).toBeDisabled();
  });

  it('labels reviewer_id conflicts "Reviewer" and resolves the user name (ADR 0058)', () => {
    render(
      <ConflictDialog
        conflict={makeConflict({
          conflicts: {
            reviewer_id: { client: ALICE.id, server: null },
          },
        })}
        users={[ALICE]}
        parentLookup={new Map()}
        busy={false}
        onCancel={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );
    // The humanised field label, not the raw column name.
    expect(screen.getByText('Reviewer')).toBeVisible();
    expect(screen.queryByText('reviewer_id')).toBeNull();
    // The id resolves to the user's display name in the value cell (the
    // column *header* also reads "Alice" — the conflicting user — so scope
    // the assertion to data cells) and null renders as empty.
    const valueCells = screen.getAllByRole('cell');
    expect(valueCells.some((c) => c.textContent === 'Alice')).toBe(true);
    expect(valueCells.some((c) => c.textContent?.trim() === ALICE.id)).toBe(false);
    expect(screen.getByText(/empty/i)).toBeVisible();
  });

  it('renders parent_id values via the lookup map', () => {
    const parentId = '00000000-0000-0000-0000-0000000000b1';
    render(
      <ConflictDialog
        conflict={makeConflict({
          conflicts: {
            parent_id: { client: parentId, server: null },
          },
        })}
        users={[ALICE]}
        parentLookup={new Map([[parentId, 'Parent task name']])}
        busy={false}
        onCancel={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );
    expect(screen.getByText('Parent task name')).toBeVisible();
    expect(screen.getByText(/empty/i)).toBeVisible();
  });
});
