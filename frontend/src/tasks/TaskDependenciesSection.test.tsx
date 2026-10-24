import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskDetail } from '../api/schemas';
import { mapTask } from '../test/mapFixtures';
import TaskDependenciesSection from './TaskDependenciesSection';

vi.mock('../api/hooks', () => ({
  useCreateDependency: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteDependency: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('../ui/useToast', () => ({
  useToast: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
}));

const self = mapTask({ id: 'me', kind: 'feature', title: 'The feature', status: 'backlog' });
const phase = mapTask({ id: 'ph', kind: 'phase', title: 'P2 The phase', status: 'not_started' });
const other = mapTask({ id: 'ot', kind: 'bug', title: 'Another bug', status: 'backlog' });

const detail = {
  ...self,
  blocking: [{ id: 'e1', blocker_id: 'me', blocked_id: 'ph' }],
  blocked_by: [],
} as unknown as TaskDetail;

describe('TaskDependenciesSection with a blockerFilter', () => {
  it('shows the title of an edge whose other end is a phase', () => {
    render(
      <TaskDependenciesSection
        task={detail}
        allTasks={[self, phase, other]}
        blockerFilter={(t) => t.kind !== 'phase'}
      />,
    );
    expect(screen.getByText('P2 The phase')).toBeInTheDocument();
  });

  it('keeps phases out of the blocked-by picker only', async () => {
    render(
      <TaskDependenciesSection
        task={{ ...detail, blocking: [] }}
        allTasks={[self, phase, other]}
        blockerFilter={(t) => t.kind !== 'phase'}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Add task that blocks this one' }));
    const blockedBy = screen.getByRole('listbox');
    expect(within(blockedBy).getByText('Another bug')).toBeInTheDocument();
    expect(within(blockedBy).queryByText('P2 The phase')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'Add task this one will block' }));
    expect(within(screen.getByRole('listbox')).getByText('P2 The phase')).toBeInTheDocument();
  });
});
