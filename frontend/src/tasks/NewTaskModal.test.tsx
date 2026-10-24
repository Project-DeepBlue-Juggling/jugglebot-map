import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NewTaskModal from './NewTaskModal';
import { createState, makeServer, type TestState } from '../test/server';
import { renderApp } from '../test/renderApp';

/**
 * Tests for the "Make this a section" behaviour around assignees (issue #120).
 *
 * A section is a grouping placeholder and carries no assignees (ADR 0048), so
 * ticking the box must hide the Assignees field AND ensure no assignees are
 * persisted — even if some chips were toggled before the box was ticked.
 */

let state: TestState;
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  state = createState();
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

describe('NewTaskModal — sections and assignees (issue #120)', () => {
  it('hides the Assignees field once "Make this a section" is ticked', async () => {
    renderApp('/list', <NewTaskModal project={state.project} onClose={vi.fn()} />);

    // Assignees show for a normal (non-section) new task.
    expect(await screen.findByText('Assignees (optional)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /make this a section/i }));

    // ...and are gone once it's a section (same rule as Status/Priority).
    expect(screen.queryByText('Assignees (optional)')).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();
  });

  it('does not persist assignees toggled before the section box was ticked', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    // Toggle Alice on while it's still a normal task...
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Alice' }));
    // ...then convert to a section (the Assignees field disappears)...
    await userEvent.click(screen.getByRole('checkbox', { name: /make this a section/i }));

    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Chassis subsystem');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    // The created section carries no assignees despite Alice having been toggled.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = state.tasks.find((t) => t.title === 'Chassis subsystem');
    expect(created?.is_section).toBe(true);
    expect(created?.assignee_ids).toEqual([]);
  });
});

describe('NewTaskModal — reviewer (ADR 0058, issue #157)', () => {
  const BOB_ID = '00000000-0000-0000-0000-000000000003';

  it('sends the reviewer picked in the modal on create', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /title/i }), 'Motor bracket');
    await userEvent.click(screen.getByRole('combobox', { name: /reviewer/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bob' }));
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = state.tasks.find((t) => t.title === 'Motor bracket');
    expect(created?.reviewer_id).toBe(BOB_ID);
  });

  it('hides the Reviewer field for a section and drops a reviewer picked before ticking', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.click(await screen.findByRole('combobox', { name: /reviewer/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bob' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /make this a section/i }));
    expect(screen.queryByRole('combobox', { name: /reviewer/i })).toBeNull();

    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Drivetrain');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = state.tasks.find((t) => t.title === 'Drivetrain');
    expect(created?.is_section).toBe(true);
    expect(created?.reviewer_id).toBeNull();
  });
});

describe('NewTaskModal — completion criteria (ADR 0060)', () => {
  it('sends the completion criteria entered in the modal on create', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /title/i }), 'Ship it');
    await userEvent.type(
      screen.getByLabelText(/completion criteria/i),
      'All acceptance tests pass.',
    );
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = state.tasks.find((t) => t.title === 'Ship it');
    expect(created?.completion_criteria).toBe('All acceptance tests pass.');
  });
});

/**
 * Ctrl/⌘+Enter creates the task, and the modal says so (issue #154;
 * ADR 0047 as amended 2026-09-17).
 *
 * Every case here fires from the **Description textarea** on purpose. A
 * single-line input submits a form on plain Enter natively, so a test typing
 * in the Title field would pass with no binding at all — it would be testing
 * the browser. A textarea takes Enter as a newline and submits nothing, so it
 * is the only field where a pass proves the handler exists.
 */
describe('NewTaskModal — Ctrl+Enter creates (issue #154)', () => {
  /**
   * Open the Parent task picker and wait until its search box actually holds
   * focus, returning the combobox trigger.
   *
   * The wait is load-bearing. The picker takes focus on a `setTimeout(…, 0)`,
   * so a test that fires its keystroke straight after the click sends it to
   * the trigger button — nowhere near the handler these tests exist to get
   * past, and green whether or not the bug is present.
   */
  const openParentPicker = async () => {
    const picker = await screen.findByRole('combobox', { name: /parent task/i });
    await userEvent.click(picker);
    const search = await screen.findByRole('searchbox', { name: /search parent task/i });
    await waitFor(() => expect(document.activeElement).toBe(search));
    return picker;
  };

  it('creates from the Description textarea, where plain Enter would only insert a newline', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /title/i }), 'Weld the frame');
    await userEvent.type(screen.getByLabelText(/^description$/i), 'MIG, 3 mm fillet');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = state.tasks.find((t) => t.title === 'Weld the frame');
    expect(created?.description).toBe('MIG, 3 mm fillet');
  });

  it('Cmd+Enter behaves the same (macOS)', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /title/i }), 'Order bearings');
    await userEvent.click(screen.getByLabelText(/^description$/i));
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(state.tasks.some((t) => t.title === 'Order bearings')).toBe(true);
  });

  it('creates from inside an open TaskPicker dropdown', async () => {
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /title/i }), 'Spec the motor');
    await openParentPicker();

    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(state.tasks.some((t) => t.title === 'Spec the motor')).toBe(true);
  });

  it('does nothing on a form the Create button would refuse', async () => {
    // Empty title — the button is disabled, and the keystroke that stands in
    // for it has to refuse the same form rather than posting a titleless task.
    const onClose = vi.fn();
    renderApp('/list', <NewTaskModal project={state.project} onClose={onClose} />);

    await userEvent.type(await screen.findByLabelText(/^description$/i), 'No title yet');
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();

    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onClose).not.toHaveBeenCalled();
    expect(state.tasks.some((t) => t.description === 'No title yet')).toBe(false);
  });

  it('does not silently pick a parent task when a refused submit leaves the picker open', async () => {
    // The reason the binding is capture-phase and stops propagation. Bubble
    // instead and TaskPicker's own Enter handler commits the highlighted
    // option on the way past, so this keystroke means both "pick a parent"
    // and "create". On a valid form that hides — the POST body is read from
    // the render closure, so the pick never reaches the wire. Here the submit
    // is refused for the empty title, the modal stays open, and the stray
    // pick is left on screen for the user to find.
    renderApp('/list', <NewTaskModal project={state.project} onClose={vi.fn()} />);

    const picker = await openParentPicker();
    // Move off the "— none —" row onto a real task, or the pick this guards
    // against would commit null and be invisible either way.
    await userEvent.keyboard('{ArrowDown}');
    const search = screen.getByRole('searchbox', { name: /search parent task/i });
    const chassis = await screen.findByRole('option', { name: /design chassis/i });
    expect(search).toHaveAttribute('aria-activedescendant', chassis.id);

    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    // Still no parent, and the dropdown was never dismissed by a commit.
    expect(picker).toHaveTextContent('— none —');
    expect(screen.getByRole('searchbox', { name: /search parent task/i })).toBeInTheDocument();
  });

  it('advertises the shortcut next to the Create button', async () => {
    renderApp('/list', <NewTaskModal project={state.project} onClose={vi.fn()} />);

    expect(await screen.findByText('Ctrl/⌘+Enter to create')).toBeInTheDocument();
  });
});

describe('NewTaskModal — sub-task defaults (ADR 0084, issue #190)', () => {
  const CHASSIS_ID = '00000000-0000-0000-0000-00000000ff01';
  const BOB_ID = '00000000-0000-0000-0000-000000000003';

  it('pre-fills the parent, stage and reviewer, and sends them on create', async () => {
    const onClose = vi.fn();
    renderApp(
      '/list',
      <NewTaskModal
        project={state.project}
        onClose={onClose}
        defaultParentId={CHASSIS_ID}
        defaultStage="batch"
        defaultReviewerId={BOB_ID}
      />,
    );

    // The picker names the parent once the task list has loaded.
    const parentPicker = await screen.findByRole('combobox', { name: /parent/i });
    await waitFor(() => expect(parentPicker).toHaveTextContent('Design chassis'));
    expect(screen.getByRole('combobox', { name: /stage/i })).toHaveValue('batch');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /reviewer/i })).toHaveValue('Bob'),
    );

    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Weld frame');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = state.tasks.find((t) => t.title === 'Weld frame');
    expect(created?.parent_id).toBe(CHASSIS_ID);
    expect(created?.stage).toBe('batch');
    expect(created?.reviewer_id).toBe(BOB_ID);
  });

  it('ignores a default stage the project no longer has', async () => {
    renderApp(
      '/list',
      <NewTaskModal project={state.project} onClose={vi.fn()} defaultStage="retired-stage" />,
    );

    expect(await screen.findByRole('combobox', { name: /stage/i })).toHaveValue('prototype');
  });
});
