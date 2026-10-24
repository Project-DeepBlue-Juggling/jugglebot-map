import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import type { Task } from '../api/schemas';
import TaskPicker from './TaskPicker';

// ADR 0039 named jest-axe as the automated-a11y net for the hand-rolled
// combobox. Register the matcher here (the shared setup file doesn't) so the
// smoke test below can assert zero violations on the open picker.
expect.extend(toHaveNoViolations);

const NOW = '2026-06-04T00:00:00Z';
const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa';
const DEV_ID = '00000000-0000-0000-0000-000000000001';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    project_id: PROJECT_ID,
    parent_id: null,
    description: '',
    completion_criteria: '',
    assignee_ids: [],
    stage: 'prototype',
    status: 'not_started',
    priority: null,
    is_section: false,
    backlog_rank: 0,
    color: null,
    canvas_x: 0,
    canvas_y: 0,
    canvas_collapsed: false,
    work_days: null,
    start_date: null,
    due_date: null,
    reviewer_id: null,
    effective_start_date: '2026-06-04',
    created_at: NOW,
    created_by: DEV_ID,
    updated_at: NOW,
    updated_by: DEV_ID,
    ...overrides,
  };
}

// A small forest:
//   Hardware
//     Tester board
//       Probe rig
//   Firmware
//     Tester harness
const TASKS: Task[] = [
  makeTask({ id: 'hw', title: 'Hardware' }),
  makeTask({ id: 'tb', title: 'Tester board', parent_id: 'hw' }),
  makeTask({ id: 'rig', title: 'Probe rig', parent_id: 'tb' }),
  makeTask({ id: 'fw', title: 'Firmware' }),
  makeTask({ id: 'th', title: 'Tester harness', parent_id: 'fw' }),
];

afterEach(cleanup);

function openPicker() {
  return userEvent.click(screen.getByRole('combobox', { name: /parent task/i }));
}

// ADR 0043: the empty-search tree opens collapsed to roots. Read the visible
// option labels (stripping the selection ✓), and click the popover's bulk
// controls.
function optionLabels() {
  const listbox = screen.getByRole('listbox', { name: /parent task/i });
  return within(listbox)
    .getAllByRole('option')
    .map((o) =>
      // Strip the aria-hidden disclosure glyphs (▸/▾) and selection ✓, which
      // are in textContent but not the accessible name.
      (o.textContent ?? '').replace(/[▸▾✓]/g, '').trim(),
    );
}
function clickExpandAll() {
  return userEvent.click(screen.getByRole('button', { name: /^expand all$/i }));
}

describe('TaskPicker', () => {
  it('renders a combobox trigger labelled by ariaLabel, collapsed by default', () => {
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    const trigger = screen.getByRole('combobox', { name: /parent task/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the selected task title on the trigger', () => {
    render(<TaskPicker tasks={TASKS} value="tb" onChange={() => {}} ariaLabel="Parent task" />);
    expect(screen.getByRole('combobox', { name: /parent task/i })).toHaveTextContent(
      'Tester board',
    );
  });

  it('has no axe violations when closed or open (ADR 0039)', async () => {
    const { container } = render(
      <TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />,
    );
    expect(await axe(container)).toHaveNoViolations();
    await openPicker();
    await screen.findByRole('listbox', { name: /parent task/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens collapsed to roots only, plus a none row (ADR 0043)', async () => {
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    await screen.findByRole('listbox', { name: /parent task/i });
    // Only the none row + the two depth-0 roots (alphabetical); every parent is
    // folded so the nested tasks stay hidden until expanded or searched.
    expect(optionLabels()).toEqual(['— none —', 'Firmware', 'Hardware']);
    expect(screen.queryByRole('option', { name: /Tester board/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Probe rig/ })).not.toBeInTheDocument();
  });

  it('Expand all reveals the full DFS tree; Collapse all returns to roots', async () => {
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    await clickExpandAll();
    // none + 5 tasks, in DFS pre-order with siblings alphabetical.
    expect(optionLabels()).toEqual([
      '— none —',
      'Firmware',
      'Tester harness',
      'Hardware',
      'Tester board',
      'Probe rig',
    ]);
    await userEvent.click(screen.getByRole('button', { name: /^collapse all$/i }));
    expect(optionLabels()).toEqual(['— none —', 'Firmware', 'Hardware']);
  });

  it('expands one branch via its disclosure triangle (pointer)', async () => {
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    const hardware = screen.getByRole('option', { name: 'Hardware' });
    const triangle = hardware.querySelector('[data-disclosure]');
    if (triangle === null) throw new Error('expected a disclosure triangle on a parent');
    // A press on the triangle unfolds Hardware → its child (still a collapsed
    // parent) appears, but the grandchild stays hidden. It must NOT select.
    fireEvent.mouseDown(triangle);
    expect(screen.getByRole('option', { name: /Tester board/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Probe rig/ })).not.toBeInTheDocument();
  });

  it('expands and collapses the active branch with Right/Left arrows', async () => {
    const user = userEvent.setup();
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    // Move the active option onto Hardware (none → Firmware → Hardware).
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{ArrowRight}'); // expand
    expect(screen.getByRole('option', { name: /Tester board/ })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}'); // collapse
    expect(screen.queryByRole('option', { name: /Tester board/ })).not.toBeInTheDocument();
  });

  it('indents deeper tasks more than shallow ones', async () => {
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    await clickExpandAll();
    const hardware = screen.getByRole('option', { name: 'Hardware' });
    const board = screen.getByRole('option', { name: /Tester board/ });
    const rig = screen.getByRole('option', { name: /Probe rig/ });
    const pad = (el: HTMLElement) => parseFloat(el.style.paddingLeft);
    expect(pad(board)).toBeGreaterThan(pad(hardware));
    expect(pad(rig)).toBeGreaterThan(pad(board));
  });

  it('filters to title matches with an ancestor breadcrumb when typing', async () => {
    const user = userEvent.setup();
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    await user.type(screen.getByRole('searchbox'), 'tester');
    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    // none row + the two "Tester …" matches (alphabetical).
    const taskOptions = options.filter((o) => !(o.textContent ?? '').includes('— none —'));
    expect(taskOptions).toHaveLength(2);
    // "Tester board" shows its lineage "Hardware"; "Tester harness" → "Firmware".
    expect(screen.getByRole('option', { name: /Tester board/ })).toHaveTextContent('Hardware');
    expect(screen.getByRole('option', { name: /Tester harness/ })).toHaveTextContent('Firmware');
  });

  it('shows an empty-state message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.getByText(/no matching tasks/i)).toBeInTheDocument();
  });

  it('calls onChange with the task id when an option is picked', async () => {
    const onChange = vi.fn();
    render(<TaskPicker tasks={TASKS} value={null} onChange={onChange} ariaLabel="Parent task" />);
    await openPicker();
    await userEvent.click(screen.getByRole('option', { name: 'Hardware' }));
    expect(onChange).toHaveBeenCalledWith('hw');
  });

  it('calls onChange with null when the none row is picked', async () => {
    const onChange = vi.fn();
    render(<TaskPicker tasks={TASKS} value="hw" onChange={onChange} ariaLabel="Parent task" />);
    await openPicker();
    await userEvent.click(screen.getByRole('option', { name: '— none —' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('omits excluded ids entirely', async () => {
    render(
      <TaskPicker
        tasks={TASKS}
        value={null}
        onChange={() => {}}
        ariaLabel="Parent task"
        excludeIds={new Set(['tb', 'rig'])}
      />,
    );
    await openPicker();
    // Expand all so the absence is exclusion, not the collapsed default.
    await clickExpandAll();
    expect(screen.queryByRole('option', { name: /Tester board/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Probe rig/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hardware' })).toBeInTheDocument();
  });

  it('hides the none row and uses the custom none label when allowNone is false', async () => {
    render(
      <TaskPicker
        tasks={TASKS}
        value={null}
        onChange={() => {}}
        ariaLabel="Parent task"
        allowNone={false}
        noneLabel="all"
      />,
    );
    await openPicker();
    expect(screen.queryByRole('option', { name: 'all' })).not.toBeInTheDocument();
    // First option is now a real task, not a none row.
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Firmware');
  });

  it('navigates options with the arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskPicker tasks={TASKS} value={null} onChange={onChange} ariaLabel="Parent task" />);
    await openPicker();
    // Expand all so the deeper tasks are navigable (the tree opens collapsed,
    // ADR 0043). DFS order: none, Firmware, Tester harness, Hardware, …
    await clickExpandAll();
    const searchbox = screen.getByRole('searchbox');
    // Active starts on the none row (index 0). Two downs → Firmware, Tester harness.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('th'); // Tester harness
    // After Enter the popover closes.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(searchbox).not.toBeInTheDocument();
  });

  it('tracks the active option via aria-activedescendant', async () => {
    const user = userEvent.setup();
    render(<TaskPicker tasks={TASKS} value={null} onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    const searchbox = screen.getByRole('searchbox');
    const first = searchbox.getAttribute('aria-activedescendant');
    expect(first).toBeTruthy();
    await user.keyboard('{ArrowDown}');
    expect(searchbox.getAttribute('aria-activedescendant')).not.toEqual(first);
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskPicker tasks={TASKS} value={null} onChange={onChange} ariaLabel="Parent task" />);
    await openPicker();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the trigger on the placeholder when resetOnSelect is set', () => {
    // The dependency chip-input flow: even with a value passed, the trigger
    // shows the placeholder so it reads as "ready for the next pick".
    render(
      <TaskPicker
        tasks={TASKS}
        value="hw"
        onChange={() => {}}
        ariaLabel="Add task this one will block"
        resetOnSelect
        noneLabel="— select a task —"
      />,
    );
    expect(
      screen.getByRole('combobox', { name: /add task this one will block/i }),
    ).toHaveTextContent('— select a task —');
  });

  it('marks the current value as the selected option', async () => {
    render(<TaskPicker tasks={TASKS} value="fw" onChange={() => {}} ariaLabel="Parent task" />);
    await openPicker();
    expect(screen.getByRole('option', { name: 'Firmware' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Hardware' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('disables the trigger when disabled', () => {
    render(
      <TaskPicker
        tasks={TASKS}
        value={null}
        onChange={() => {}}
        ariaLabel="Parent task"
        disabled
      />,
    );
    expect(screen.getByRole('combobox', { name: /parent task/i })).toBeDisabled();
  });
});
