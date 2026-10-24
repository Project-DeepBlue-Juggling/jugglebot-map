import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDetailPanel from './TaskDetailPanel';
import { createState, makeServer, type TestState } from '../test/server';
import { renderApp } from '../test/renderApp';
import { addWorkingDaysMs } from './workingDays';

/**
 * Click-out auto-save behaviour for the shared TaskDetailPanel
 * (ADR 0012 revision 2026-06-07, issue #85). A dirty editor that the user
 * clicks away from should:
 *  - save then close when the form is valid (success),
 *  - raise the ConflictDialog on a 409 — and, because the click-out meant
 *    "leave", close the panel once that dialog is resolved (Overwrite or
 *    Cancel),
 *  - fall back to the Save-button pulse (no save, no close) when the form is
 *    invalid,
 *  - keep the panel open on a transient (non-409) save error,
 * while a *clean* click-out still just closes the panel, and an *explicit
 * Save-button* conflict leaves the panel open as before (closeOnResolve=false).
 *
 * Mounted through `renderApp` so the panel gets the real project context and
 * API client; MSW (`makeServer`) backs the task GET / PATCH. The fixture
 * task is "Design chassis" (ff01); its `updated_at` is the fixture `now`,
 * which is the `if_unchanged_since` the panel sends.
 */

const PATCH_URL = 'http://localhost:8000/api/v1/projects/:projectId/tasks/:id';
const TASK_ID = '00000000-0000-0000-0000-00000000ff01'; // "Design chassis"
const ALICE_ID = '00000000-0000-0000-0000-000000000002';
const FIXTURE_NOW = '2026-04-23T00:00:00Z'; // == fixture task.updated_at

// A 409 body whose `current_updated_at` equals the fixture timestamp, so an
// Overwrite retry (which resends it as `if_unchanged_since`) matches the
// default handler's current row and succeeds.
const CONFLICT_BODY = {
  detail: 'concurrent modification',
  current_updated_at: FIXTURE_NOW,
  current_updated_by: ALICE_ID,
  conflicts: { title: { client: 'Edited chassis', server: 'Alice chassis' } },
};

let state: TestState;
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  state = createState();
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  // Unmount before tearing down MSW so in-flight queries don't fire at a
  // closed server (matches the ListPage / CanvasView test teardown order).
  cleanup();
  server.resetHandlers();
  server.close();
});

function fixtureTask() {
  const task = state.tasks.find((t) => t.id === TASK_ID);
  if (task === undefined) throw new Error('fixture task ff01 missing');
  return task;
}

/** A one-shot PATCH handler that 409s with `CONFLICT_BODY`. */
function conflictOnce() {
  return http.patch(PATCH_URL, () => HttpResponse.json(CONFLICT_BODY, { status: 409 }), {
    once: true,
  });
}

async function mountPanelAndWait(onClose: () => void) {
  renderApp(
    '/canvas',
    <TaskDetailPanel taskId={TASK_ID} project={state.project} onClose={onClose} />,
  );
  // The title input carries the loaded task title once the GET resolves.
  return screen.findByDisplayValue('Design chassis');
}

describe('TaskDetailPanel — click-out auto-save (issue #85)', () => {
  it('saves the edits and closes the panel when a valid dirty editor is clicked away from', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');

    // Click outside the panel (document.body is not inside the aside, any
    // dialog, or the toast region).
    fireEvent.click(document.body);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // The PATCH landed on the backend with the edited title.
    expect(fixtureTask().title).toBe('Edited chassis');
  });

  it('sends if_unchanged_since with the click-out auto-save (preserves 409 detection)', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    let sentToken: string | undefined;
    server.use(
      http.patch(
        PATCH_URL,
        async ({ request }) => {
          const body = (await request.json()) as { if_unchanged_since?: string; title?: string };
          sentToken = body.if_unchanged_since;
          return HttpResponse.json({
            ...fixtureTask(),
            title: body.title ?? 'Design chassis',
            updated_at: '2026-04-23T00:00:01Z',
          });
        },
        { once: true },
      ),
    );

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    fireEvent.click(document.body);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // Without this token the optimistic-concurrency 409 path silently breaks.
    expect(sentToken).toBe(FIXTURE_NOW);
  });

  it('does not double-submit on a rapid second click-out while the save is in flight', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    let patchCount = 0;
    server.use(
      http.patch(PATCH_URL, async () => {
        patchCount += 1;
        await delay(50); // keep the first save in flight across the second click
        return HttpResponse.json({
          ...fixtureTask(),
          title: 'Edited chassis',
          updated_at: '2026-04-23T00:00:01Z',
        });
      }),
    );

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');

    // Two clicks in immediate succession; the re-entrancy guard
    // (autoSavingRef / patch.isPending) must collapse them to one save.
    fireEvent.click(document.body);
    fireEvent.click(document.body);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(patchCount).toBe(1);
  });

  it('raises the conflict dialog (and does not close) when the auto-save 409s', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    server.use(conflictOnce());

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    fireEvent.click(document.body);

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText(/Alice also edited this task/i)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the panel after the conflict is resolved with Overwrite (honours the click-out)', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    // First PATCH (the auto-save) 409s; the Overwrite retry sends the
    // server's current_updated_at as if_unchanged_since — which equals the
    // fixture timestamp, so the default handler lets the retry succeed.
    server.use(conflictOnce());

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    fireEvent.click(document.body);

    await userEvent.click(await screen.findByRole('button', { name: /overwrite with my edits/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fixtureTask().title).toBe('Edited chassis');
  });

  it('closes the panel after the conflict is dismissed with Cancel (honours the click-out)', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    server.use(conflictOnce());

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    fireEvent.click(document.body);

    await userEvent.click(
      await screen.findByRole('button', { name: /cancel and discard my edits/i }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // Cancel discards — the backend title is untouched.
    expect(fixtureTask().title).toBe('Design chassis');
  });

  it('keeps the dialog open on a nested 409 during Overwrite, then closes once resolved', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    // Auto-save 409s, the first Overwrite retry 409s again, the second
    // Overwrite (default handler) succeeds. closeOnResolve must survive the
    // re-raised conflict so the panel still closes at the end.
    server.use(conflictOnce(), conflictOnce());

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    fireEvent.click(document.body);

    await userEvent.click(await screen.findByRole('button', { name: /overwrite with my edits/i }));

    // The nested 409 keeps the dialog up; the panel has not closed.
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();

    const overwriteAgain = screen.getByRole('button', { name: /overwrite with my edits/i });
    await waitFor(() => expect(overwriteAgain).toBeEnabled());
    await userEvent.click(overwriteAgain);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fixtureTask().title).toBe('Edited chassis');
  });

  it('does not save or close an invalid dirty editor — it pulses the Save button instead', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    // Empty title is dirty but invalid (Save is disabled). Clicking away must
    // not auto-save (the server would 422) and must not close.
    await userEvent.clear(titleInput);
    fireEvent.click(document.body);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await waitFor(() => expect(saveButton).toHaveClass('animate-save-pulse'));
    expect(onClose).not.toHaveBeenCalled();
    expect(fixtureTask().title).toBe('Design chassis');
  });

  it('keeps the panel open (no close) when the click-out auto-save fails with a non-409 error', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    server.use(
      http.patch(PATCH_URL, () => HttpResponse.json({ detail: 'boom' }, { status: 500 }), {
        once: true,
      }),
    );

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    fireEvent.click(document.body);

    // The error toast appears; the panel stays open with the edit intact.
    expect(await screen.findByText(/could not save task/i)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Edited chassis')).toBeVisible();
    expect(fixtureTask().title).toBe('Design chassis');
  });

  it('still closes a clean panel on click-out without saving', async () => {
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    fireEvent.click(document.body);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fixtureTask().title).toBe('Design chassis');
  });
});

describe('TaskDetailPanel — explicit Save-button conflict stays open (issue #85)', () => {
  it('keeps the panel open after an explicit Save conflict is resolved with Overwrite', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    server.use(conflictOnce());

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    // Submit via the explicit Save button (closeOnResolve=false), not a click-out.
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await userEvent.click(await screen.findByRole('button', { name: /overwrite with my edits/i }));

    await waitFor(() => expect(fixtureTask().title).toBe('Edited chassis'));
    // The panel must NOT close on an explicit-Save conflict.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByDisplayValue('Edited chassis')).toBeVisible();
  });

  it('keeps the panel open after an explicit Save conflict is dismissed with Cancel', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    server.use(conflictOnce());

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await userEvent.click(
      await screen.findByRole('button', { name: /cancel and discard my edits/i }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(fixtureTask().title).toBe('Design chassis');
  });
});

describe('TaskDetailPanel — Enter focuses the Title field (ADR 0046)', () => {
  it('focuses the Title input on Enter when nothing interactive has focus', async () => {
    const titleInput = await mountPanelAndWait(vi.fn());

    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(titleInput);
  });

  it('stays literal while a form field has focus (ADR 0019 gate)', async () => {
    await mountPanelAndWait(vi.fn());

    const description = screen.getByLabelText(/description/i);
    description.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(description);
  });

  it('does not hijack Enter on a focused button (interactive-element guard)', async () => {
    const titleInput = await mountPanelAndWait(vi.fn());

    // A status pill is a harmless click target: Enter must activate it
    // (native button behaviour), not yank focus into the Title field.
    const pill = screen.getByRole('radio', { name: /in progress/i });
    pill.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).not.toBe(titleInput);
    expect(pill).toHaveAttribute('aria-checked', 'true');
  });
});

describe('TaskDetailPanel — Ctrl+Enter saves and returns to navigation (ADR 0047)', () => {
  it('saves a dirty valid form, returns focus, and keeps the panel open', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    expect(document.activeElement).toBe(titleInput); // firing from inside the field

    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(fixtureTask().title).toBe('Edited chassis'));
    await waitFor(() => expect(document.activeElement).toBe(document.body));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cmd+Enter behaves the same (macOS)', async () => {
    const onClose = vi.fn();
    const titleInput = await mountPanelAndWait(onClose);

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Edited chassis');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => expect(fixtureTask().title).toBe('Edited chassis'));
    await waitFor(() => expect(document.activeElement).toBe(document.body));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns focus without writing when the form is clean', async () => {
    const titleInput = await mountPanelAndWait(vi.fn());

    titleInput.focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(document.activeElement).toBe(document.body);
    expect(fixtureTask().title).toBe('Design chassis');
  });

  it('keeps focus in the form (no save) when the form is invalid', async () => {
    const titleInput = await mountPanelAndWait(vi.fn());

    await userEvent.clear(titleInput); // dirty AND invalid: empty title
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(document.activeElement).toBe(titleInput);
    expect(fixtureTask().title).toBe('Design chassis');
  });

  it('advertises the shortcut in the footer, as "save" and not "save and close"', async () => {
    // Issue #154. The wording is the assertion: the panel stays open and the
    // task stays selected, so a hint promising a close would be wrong on the
    // first press. Anchored, so "save and close" creeping in fails here.
    await mountPanelAndWait(vi.fn());

    expect(screen.getByText('Ctrl/⌘+Enter to save')).toBeInTheDocument();
  });
});

describe('TaskDetailPanel — Reviewer field (ADR 0058)', () => {
  const BOB_ID = '00000000-0000-0000-0000-000000000003';

  it('sets a reviewer through the combobox and saves it', async () => {
    await mountPanelAndWait(vi.fn());

    await userEvent.click(screen.getByRole('combobox', { name: /reviewer/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bob' }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(fixtureTask().reviewer_id).toBe(BOB_ID));
  });

  it('clears the reviewer (explicit null on the wire) and saves', async () => {
    // Seed the fixture with a reviewer so the panel opens with one set. The
    // MSW PATCH handler merges only the keys present in the body, so the
    // fixture ending up null proves the save carried an explicit
    // `reviewer_id: null` rather than omitting the field (ADR 0058 §2).
    fixtureTask().reviewer_id = ALICE_ID;
    await mountPanelAndWait(vi.fn());

    expect(screen.getByRole('combobox', { name: /reviewer/i })).toHaveValue('Alice');
    await userEvent.click(screen.getByRole('button', { name: /clear reviewer/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(fixtureTask().reviewer_id).toBeNull());
  });

  it('Escape with the reviewer popup open closes only the popup; a second Escape closes the panel', async () => {
    // ADR 0019: Esc peels the frontmost layer. The combobox popup swallows
    // the first Escape (stopPropagation), so the panel's window-level
    // Escape → onClose handler only fires once the popup is gone.
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    await userEvent.click(screen.getByRole('combobox', { name: /reviewer/i }));
    await screen.findByRole('listbox', { name: /reviewer/i });

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: /reviewer/i })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens clean (no Discard) for a task that already has a reviewer', async () => {
    fixtureTask().reviewer_id = ALICE_ID;
    await mountPanelAndWait(vi.fn());
    // Dirty-tracking must treat the loaded reviewer as the baseline.
    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull();
  });

  it('hides the Reviewer field for a section, same rule as Assignees (ADR 0048)', async () => {
    fixtureTask().is_section = true;
    await mountPanelAndWait(vi.fn());
    expect(screen.getByText(/section detail/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /reviewer/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Reviewer')).not.toBeInTheDocument();
  });
});

describe('TaskDetailPanel — section behaviour (ADR 0048)', () => {
  it('hides the Assignees field for a section but keeps it for a real task', async () => {
    // A normal task shows the Assignees group.
    renderApp(
      '/canvas',
      <TaskDetailPanel taskId={TASK_ID} project={state.project} onClose={vi.fn()} />,
    );
    await screen.findByDisplayValue('Design chassis');
    expect(screen.getByText('Assignees', { selector: 'legend' })).toBeInTheDocument();
    cleanup();

    // The same fixture as a section: the Assignees group is gone (the data is
    // still on the row and is sent on save — it's just not shown), the header
    // reads "Section detail", and Convert-to-task is offered.
    fixtureTask().is_section = true;
    renderApp(
      '/canvas',
      <TaskDetailPanel taskId={TASK_ID} project={state.project} onClose={vi.fn()} />,
    );
    await screen.findByDisplayValue('Design chassis');
    expect(screen.getByText(/section detail/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convert to task/i })).toBeInTheDocument();
    expect(screen.queryByText('Assignees', { selector: 'legend' })).not.toBeInTheDocument();
  });
});

describe('TaskDetailPanel — days of work (ADR 0059)', () => {
  /** Make the fixture task an estimated one: effective start Wed
   *  2026-05-13 (the frozen test clock), 6 working days -> due Wed
   *  2026-05-20 (server-derived, stored). */
  function seedEstimated(): void {
    const t = fixtureTask();
    t.work_days = 6;
    t.due_date = '2026-05-20T00:00:00.000Z';
    t.effective_start_date = '2026-05-13';
  }

  it('shows the estimate with a derived read-only due date and hides the due input', async () => {
    seedEstimated();
    await mountPanelAndWait(vi.fn());
    expect(screen.getByLabelText('Days of work')).toHaveValue(6);
    // The due-date INPUT is gone; the derived value renders read-only.
    expect(screen.queryByLabelText('Due date')).toBeNull();
    expect(screen.getByTestId('derived-due-date')).toHaveTextContent('2026');
  });

  it('saves work_days without a due_date field (the server derives the due)', async () => {
    seedEstimated();
    const captured: { body: Record<string, unknown> | null } = { body: null };
    server.use(
      http.patch(
        PATCH_URL,
        async ({ request }) => {
          captured.body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ...fixtureTask(),
            work_days: 8,
            due_date: '2026-05-22T00:00:00.000Z',
            updated_at: '2026-04-23T00:00:01Z',
          });
        },
        { once: true },
      ),
    );
    await mountPanelAndWait(vi.fn());
    const wd = screen.getByLabelText('Days of work');
    await userEvent.clear(wd);
    await userEvent.type(wd, '8');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body?.work_days).toBe(8);
    // due_date must be OMITTED — a direct write on an estimated task 422s.
    expect(captured.body !== null && 'due_date' in captured.body).toBe(false);
  });

  it('clearing the estimate reveals the due input and freezes the due on save', async () => {
    seedEstimated();
    const captured: { body: Record<string, unknown> | null } = { body: null };
    server.use(
      http.patch(
        PATCH_URL,
        async ({ request }) => {
          captured.body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ...fixtureTask(),
            work_days: null,
            updated_at: '2026-04-23T00:00:01Z',
          });
        },
        { once: true },
      ),
    );
    await mountPanelAndWait(vi.fn());
    const wd = screen.getByLabelText('Days of work');
    await userEvent.clear(wd);
    // Due input reappears (empty) once the estimate is cleared…
    expect(screen.getByLabelText('Due date')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(captured.body).not.toBeNull());
    // …and the save clears the estimate while OMITTING due_date, so the
    // stored due freezes at its last derived value (ADR 0059 §5).
    expect(captured.body?.work_days).toBeNull();
    expect(captured.body !== null && 'due_date' in captured.body).toBe(false);
  });

  it('re-syncs the due input to the frozen date after clearing the estimate — click-out fires no PATCH', async () => {
    // Regression: the editor survives a save (keyed on task.id), so before
    // the syncScheduleFromServer fix, the due input stayed '' after the
    // clear-estimate save, the form read as dirty, and the next click-out
    // auto-save PATCHed {due_date: null} — silently wiping the frozen due.
    seedEstimated();
    const patchBodies: Record<string, unknown>[] = [];
    server.use(
      http.patch(PATCH_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patchBodies.push(body);
        // Mirror the backend: merge the sent fields into the store row; an
        // omitted due_date stays frozen at its last derived value.
        const t = fixtureTask();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { if_unchanged_since, ...changes } = body;
        Object.assign(t, changes);
        t.updated_at = new Date(Date.parse(t.updated_at) + 1000).toISOString();
        return HttpResponse.json({ ...t });
      }),
    );
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);
    await userEvent.clear(screen.getByLabelText('Days of work'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]?.work_days).toBeNull();
    expect(patchBodies[0] !== undefined && 'due_date' in patchBodies[0]).toBe(false);
    // The editor re-synced from the response: the now-visible due input
    // carries the FROZEN date and the form is clean again (no Discard).
    await waitFor(() => expect(screen.getByLabelText('Due date')).toHaveValue('2026-05-20'));
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    // Click-out on a clean panel just closes — no auto-save, and in
    // particular no {due_date: null} wiping the frozen date.
    fireEvent.click(document.body);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(patchBodies).toHaveLength(1);
  });

  it('a legacy → estimated save re-syncs cleanly: derived due shown, no phantom dirty, no stray PATCH', async () => {
    const t = fixtureTask();
    t.work_days = null;
    t.due_date = '2026-05-20T00:00:00.000Z';
    t.effective_start_date = '2026-05-13';
    const patchBodies: Record<string, unknown>[] = [];
    server.use(
      http.patch(PATCH_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patchBodies.push(body);
        const task = fixtureTask();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { if_unchanged_since, ...changes } = body;
        Object.assign(task, changes);
        // Mirror the backend's trigger (b): a newly-set estimate derives
        // the due date from the effective start (Wed 13 May + 4wd = Mon 18).
        if (typeof changes.work_days === 'number') {
          task.due_date = new Date(
            addWorkingDaysMs(
              Date.parse(`${task.effective_start_date}T00:00:00.000Z`),
              changes.work_days,
            ),
          ).toISOString();
        }
        task.updated_at = new Date(Date.parse(task.updated_at) + 1000).toISOString();
        return HttpResponse.json({ ...task });
      }),
    );
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);
    // Clear the hand-set due, then size by estimate instead.
    await userEvent.clear(screen.getByLabelText('Due date'));
    await userEvent.type(screen.getByLabelText('Days of work'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]?.work_days).toBe(4);
    expect(patchBodies[0] !== undefined && 'due_date' in patchBodies[0]).toBe(false);
    // Post-save the panel sits in estimated mode: derived due shown
    // read-only, due input gone, form clean.
    await waitFor(() => expect(screen.queryByLabelText('Due date')).toBeNull());
    expect(screen.getByTestId('derived-due-date')).toHaveTextContent('2026');
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    // Click-out closes without any further PATCH — no stray due_date.
    fireEvent.click(document.body);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(patchBodies).toHaveLength(1);
  });
});

describe('TaskDetailPanel — completion criteria field + reminder (ADR 0060)', () => {
  it('renders the Completion Criteria field with the task value and saves edits', async () => {
    fixtureTask().completion_criteria = 'Reviewer signs off.';
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    const field = screen.getByLabelText(/completion criteria/i);
    expect(field).toHaveValue('Reviewer signs off.');

    await userEvent.clear(field);
    await userEvent.type(field, 'Demo recorded.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fixtureTask().completion_criteria).toBe('Demo recorded.'));
  });

  it('reminds before completing (with criteria) and proceeds on confirm', async () => {
    const t = fixtureTask();
    t.status = 'in_progress';
    t.completion_criteria = 'All acceptance tests pass.';
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    await userEvent.click(screen.getByRole('radio', { name: 'Complete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The reminder interposes before the PATCH.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Mark task complete?');
    expect(dialog).toHaveTextContent('All acceptance tests pass.');
    expect(fixtureTask().status).toBe('in_progress'); // not saved yet

    await userEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    await waitFor(() => expect(fixtureTask().status).toBe('complete'));
  });

  it('aborts the completion save when the reminder is cancelled (no PATCH, panel stays open)', async () => {
    const t = fixtureTask();
    t.status = 'in_progress';
    t.completion_criteria = 'All acceptance tests pass.';
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    await userEvent.click(screen.getByRole('radio', { name: 'Complete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fixtureTask().status).toBe('in_progress');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Design chassis')).toBeInTheDocument();
  });

  it('does not remind when completing a task that has no criteria', async () => {
    const t = fixtureTask();
    t.status = 'in_progress';
    t.completion_criteria = '';
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    await userEvent.click(screen.getByRole('radio', { name: 'Complete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // No dialog — the save goes straight through.
    await waitFor(() => expect(fixtureTask().status).toBe('complete'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TaskDetailPanel — Sub-tasks and "+ Add sub-task" (ADR 0084, issue #190)', () => {
  const MOTORS_ID = '00000000-0000-0000-0000-00000000ff02'; // "Order motors"
  const BOB_ID = '00000000-0000-0000-0000-000000000003';

  function makeMotorsAChild() {
    const motors = state.tasks.find((t) => t.id === MOTORS_ID);
    if (motors === undefined) throw new Error('fixture task ff02 missing');
    motors.parent_id = TASK_ID;
  }

  it('lists the direct sub-tasks with their status, or None', async () => {
    makeMotorsAChild();
    await mountPanelAndWait(vi.fn());

    const list = await screen.findByRole('list', { name: 'Sub-tasks' });
    expect(list).toHaveTextContent('Order motors');
    expect(list).toHaveTextContent('Not started');
    expect(list).not.toHaveTextContent('Write firmware');
    expect(screen.getByText('Sub-tasks (1)')).toBeInTheDocument();
  });

  it('shows None when the task has no sub-tasks yet', async () => {
    await mountPanelAndWait(vi.fn());

    expect(await screen.findByText('Sub-tasks (0)')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Sub-tasks' })).toBeNull();
  });

  it('creates a child under this task, below it on the canvas, and stays on the parent', async () => {
    fixtureTask().kind = 'batch';
    fixtureTask().reviewer_id = BOB_ID;
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    await userEvent.click(screen.getByRole('button', { name: '+ Add sub-task' }));
    const dialog = await screen.findByRole('dialog', { name: /new task/i });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /title/i }), 'Weld frame');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /new task/i })).toBeNull());
    const created = state.tasks.find((t) => t.title === 'Weld frame');
    expect(created?.parent_id).toBe(TASK_ID);
    expect(created?.kind).toBe('batch');
    expect(created?.reviewer_id).toBe(BOB_ID);
    // One node-step (80 px node + 12 px pad, rounded up to the 24 px grid)
    // under the parent at 0, 0.
    expect(created?.canvas_x).toBe(0);
    expect(created?.canvas_y).toBe(96);

    // The panel is still on the parent, and the new child is in its list.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Design chassis')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Sub-tasks' })).toHaveTextContent('Weld frame');
  });

  it('Esc closes the new sub-task modal without closing the panel', async () => {
    const onClose = vi.fn();
    await mountPanelAndWait(onClose);

    await userEvent.click(screen.getByRole('button', { name: '+ Add sub-task' }));
    await screen.findByRole('dialog', { name: /new task/i });
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /new task/i })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Design chassis')).toBeInTheDocument();
  });

  it('opens a sub-task through onOpenTask', async () => {
    makeMotorsAChild();
    const onOpenTask = vi.fn();
    renderApp(
      '/canvas',
      <TaskDetailPanel
        taskId={TASK_ID}
        project={state.project}
        onClose={vi.fn()}
        onOpenTask={onOpenTask}
      />,
    );
    await screen.findByDisplayValue('Design chassis');

    await userEvent.click(await screen.findByRole('button', { name: 'Open Order motors' }));
    expect(onOpenTask).toHaveBeenCalledWith(MOTORS_ID);
  });

  it('saves pending edits before opening a sub-task', async () => {
    makeMotorsAChild();
    const onOpenTask = vi.fn();
    renderApp(
      '/canvas',
      <TaskDetailPanel
        taskId={TASK_ID}
        project={state.project}
        onClose={vi.fn()}
        onOpenTask={onOpenTask}
      />,
    );
    const titleInput = await screen.findByDisplayValue('Design chassis');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Design chassis v2');

    await userEvent.click(await screen.findByRole('button', { name: 'Open Order motors' }));

    await waitFor(() => expect(onOpenTask).toHaveBeenCalledWith(MOTORS_ID));
    expect(fixtureTask().title).toBe('Design chassis v2');
  });

  it('renders sub-tasks as plain rows when the host cannot open them', async () => {
    makeMotorsAChild();
    await mountPanelAndWait(vi.fn());

    expect(await screen.findByRole('list', { name: 'Sub-tasks' })).toHaveTextContent(
      'Order motors',
    );
    expect(screen.queryByRole('button', { name: 'Open Order motors' })).toBeNull();
  });
});
