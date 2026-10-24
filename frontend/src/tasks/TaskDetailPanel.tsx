import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ApiError } from '../api/client';
import {
  useCreateTask,
  useDeleteTask,
  useOptimisticTaskPatch,
  usePatchTask,
  useProjectAssignees,
  useTask,
  useTasks,
} from '../api/hooks';
import {
  TaskDeleteConflict,
  TaskUpdateConflict,
  type Project,
  type Task,
  type TaskCreateBody,
  type TaskDetail,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateBody,
  type TaskUpdateConflict as TaskUpdateConflictType,
} from '../api/schemas';
import { hasModifier, isShortcutTarget, modalIsOpen } from '../ui/keyboard';
import { useToast } from '../ui/useToast';
import UserCombobox from '../ui/UserCombobox';
import { STATUS_STYLES } from './statusStyles';
import { findChildPosition } from './placement';
import { descendantSet } from './itemTree';
import { resolveCompletionReminder } from './completionReminder';
import { useCompletionReminder } from './useCompletionReminder';
import { useDropCascade } from './useDropCascade';
import { useDropCascadeWrite } from './useDropCascadeWrite';
import { resolveDropCascade } from './dropCascade';
import ConflictDialog from './ConflictDialog';
import DueDateIndicator from './DueDateIndicator';
import { dateInputToIso, dueStatus, formatDueDate, isoToDateInput } from './dueStatus';
import { addWorkingDaysMs } from './workingDays';
import { buildEffectiveStatusIndex } from './sectionStatus';
import { STATUS_LABELS, STATUS_OPTIONS } from './statusLabels';
import { PRIORITY_LABELS, PRIORITY_OPTIONS } from './priority';
import NewTaskModal from './NewTaskModal';
import TaskDependenciesSection from './TaskDependenciesSection';
import TaskPicker from './TaskPicker';
import TaskSubtasksSection from './TaskSubtasksSection';

type PanelMode = 'sidebar' | 'overlay';

interface Props {
  taskId: string;
  project: Project;
  onClose: () => void;
  mode?: PanelMode;
  /** Render the dependency editor. Default true. The My tasks page turns
   *  it off (ADR 0076 section 8): editing the dependency graph is a
   *  structural act that belongs in the views that draw the graph, and
   *  the picker needs the whole project's task list to be useful. */
  showDependencies?: boolean;
  /** Fired after a field-editing save lands, with the task as it was, the
   *  patch that was applied, and the server's authoritative response.
   *
   *  This exists so a host page can build an undo step (ADR 0076 section 9).
   *  It is called from exactly one place - `runSaveWith`, immediately
   *  after the PATCH resolves - which is the only point where all three
   *  are in scope, and which every field-editing path funnels through:
   *  the Save button, the click-out auto-save, Ctrl+Enter, and the
   *  ConflictDialog's Overwrite. The section/task convert toggle patches
   *  directly and reports itself separately.
   *
   *  Deletes deliberately do NOT fire this. Undoing a delete re-creates
   *  the row under a new id, losing its comments, children and dependency
   *  edges; that is defensible on the Undo toast right beside the delete
   *  the user just did (which the panel still offers), and not defensible
   *  as a silent entry deep in a keyboard history. */
  onTaskWritten?: (before: Task, patch: TaskUpdateBody, after: Task) => void;
  /** Switch the panel to another task — a row in the Sub-tasks list
   *  (ADR 0084). Hosts route it through the same reveal-and-select as a
   *  search focus. Omitted (My tasks), the rows are not links. */
  onOpenTask?: (taskId: string) => void;
}

// Wrapper class per ADR 0012. `sidebar` lets the parent decide width and
// occupy a flex slot; `overlay` floats above the canvas without a backdrop
// (Figma / Miro pattern) so canvas pan / zoom and node-click stay live.
const WRAPPER_CLASS: Record<PanelMode, string> = {
  sidebar:
    'flex h-full w-full flex-col border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
  overlay:
    'fixed right-0 top-0 z-30 flex h-full w-96 flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800',
};

export default function TaskDetailPanel({
  taskId,
  project,
  onClose,
  mode = 'sidebar',
  showDependencies = true,
  onTaskWritten,
  onOpenTask,
}: Props) {
  const { data: task, isLoading, error } = useTask(taskId);
  // Only project members can be assigned (ADR 0021 amended).
  const { data: users = [] } = useProjectAssignees();
  const { data: tasks = [] } = useTasks();
  const patch = usePatchTask();
  const optimisticPatch = useOptimisticTaskPatch();
  const del = useDeleteTask();
  const create = useCreateTask();
  const toast = useToast();
  // ADR 0060: interpose the completion-criteria reminder on a save that
  // transitions the task into `complete` (see trySave below).
  const { confirmComplete } = useCompletionReminder();
  const { confirmDrop } = useDropCascade();
  const dropCascadeWrite = useDropCascadeWrite();
  const wrapperClass = WRAPPER_CLASS[mode];

  // Conflict-dialog state. When a save returns 409, we stash the parsed body
  // plus the user's pending edits here; the dialog's Overwrite re-runs the
  // PATCH with the server's `current_updated_at` as the new
  // `if_unchanged_since`. Cancel drops local edits. ADR 0004 §Decision item
  // #2 fixes the dialog as the only conflict surface for editor saves.
  // `closeOnResolve` records whether resolving the dialog (Overwrite or
  // Cancel) should also dismiss the panel — true when the conflict was
  // raised by a click-out auto-save (the user expressed intent to leave;
  // ADR 0012 revision 2026-06-07), false for an explicit Save-button save
  // (which leaves the panel open as before).
  const [conflictState, setConflictState] = useState<{
    body: TaskUpdateConflictType;
    pendingPatch: TaskUpdateBody;
    closeOnResolve: boolean;
  } | null>(null);

  // High-water mark of the server state the user has *acknowledged*. Captured
  // when the panel first sees the task, advanced after every successful save
  // by this user (editor save OR Overwrite from the conflict dialog). NOT
  // advanced by SSE echoes from other users — that's the whole point: a
  // concurrent edit must surface as 409 → ConflictDialog rather than be
  // silently overwritten (ADR 0004 §Decision item #6).
  //
  // The state lives at the panel level rather than inside the editor so a
  // successful save's response can update it; if it lived inside the editor
  // (captured via useState init), the second save would still send the
  // first-mount timestamp, and the server's now-advanced updated_at would
  // 409 the user against their own previous save.
  const [openedAtUpdatedAt, setOpenedAtUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    // Capture on first sight of a task and on every task.id transition (the
    // user opening a different task in the same panel instance). The effect
    // deliberately depends only on task.id so SSE echoes that bump
    // task.updated_at do NOT advance this — see comment above.
    if (task !== undefined) {
      setOpenedAtUpdatedAt(task.updated_at);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Esc precedence (ADR 0019): a modal-mode dialog in front of the
      // panel (ConflictDialog, NewTaskModal) consumes the key first; we
      // bail out when one is mounted so Esc doesn't also close the
      // panel underneath. The conflictState check is the same guard
      // expressed via state — kept for clarity.
      // `panelRef.current` excludes a dialog the panel is rendered
      // *inside* (ADR 0076 section 8) - the My tasks editor modal - while a
      // ConflictDialog mounted within the panel still counts.
      if (e.key === 'Escape' && conflictState === null && !modalIsOpen(panelRef.current)) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, conflictState]);

  // Click-outside-closes the panel when the editor is clean. When dirty,
  // the click is swallowed and the Save button pulses to signal that the
  // user must save (or × dismiss) before they can re-engage the main area.
  //
  // The exempt-from-close set: anything inside the panel itself, any
  // modal/dialog in front of it (ConflictDialog, NewTaskModal, profile
  // popover — all `role="dialog"`), and the toast container (aria-live).
  // The listener is in capture phase so we can stop propagation before
  // React's bubble-phase delegation fires onClick on the underlying
  // target (only used in the dirty case; clean clicks are allowed to
  // propagate so the user can switch to another row's panel in one click).
  const panelRef = useRef<HTMLElement | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);
  // ADR 0048: converting a task to/from a section is its own single-field
  // PATCH, distinct from the form save — tracked separately so the convert
  // button shows its own pending state without disabling Save.
  const [converting, setConverting] = useState(false);
  // ADR 0084: where "+ Add sub-task" will place the child on the canvas —
  // computed once at the click, so the modal's target doesn't drift while
  // it is open. Non-null means the NewTaskModal is mounted.
  const [subtaskPos, setSubtaskPos] = useState<{ x: number; y: number } | null>(null);
  // The editor publishes its latest validity + a builder for the edited body
  // here each render, so the click-outside handler can auto-save the current
  // edits at click time without the document listener re-subscribing on every
  // keystroke (it depends only on task/isDirty/onClose). Null only before the
  // editor first mounts. `syncScheduleFromServer` flows the other way: after
  // a successful save the panel hands the response task back so the editor
  // can re-sync the schedule-coupled fields the SERVER derived (ADR 0059).
  const editorStateRef = useRef<{
    canSave: boolean;
    getBody: () => TaskUpdateBody;
    syncScheduleFromServer: (saved: Task) => void;
  } | null>(null);
  // The click-out auto-save closure. Assigned below the task-load guard (where
  // `trySave` is in scope) and invoked from the effect above the guard via this
  // ref, so the effect never has to depend on the save closures.
  const autoSaveRef = useRef<(() => void) | null>(null);
  // Re-entrancy guard: blocks a second auto-save being kicked off (a rapid
  // double click-out) before the first settles. Pairs with the `patch.isPending`
  // check that covers an explicit Save still in flight.
  const autoSavingRef = useRef(false);
  // Ctrl/Cmd+Enter — save and return to navigation (ADR 0047). Unlike the
  // plain-Enter focus binding (ADR 0046) this deliberately fires from INSIDE
  // form fields — that's the whole gesture — so it is not focus-gated; a
  // modal in front still suppresses it. The save closure lives below the
  // task-load guard (where trySave is in scope) and is reached through
  // `saveAndReturnRef`, the same bridge pattern as `autoSaveRef`.
  const saveAndReturnRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (modalIsOpen(panelRef.current)) return;
      e.preventDefault();
      saveAndReturnRef.current?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (task === undefined) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target === null) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      if (target.closest('[aria-live="polite"]')) return;
      if (isDirty) {
        // Dirty click-outside auto-saves (ADR 0012 revision 2026-06-07).
        // Always swallow the click first: the save is async, so the panel
        // must stay mounted to host a possible ConflictDialog and must not
        // let the click navigate mid-save. `autoSaveRef` then decides
        // save (valid form) vs the Save-button pulse nudge (invalid form).
        e.preventDefault();
        e.stopImmediatePropagation();
        autoSaveRef.current?.();
        return;
      }
      // Clicks on the React Flow pane would also open the new-task modal
      // via `onPaneClick`. Suppress the click in that one case so closing
      // the panel is the only effect. Clicks elsewhere — another node, a
      // list row, the page header — keep propagating so the user can
      // switch to a different row's panel in a single click.
      if (target.closest('.react-flow__pane') !== null) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      onClose();
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [task, isDirty, onClose]);

  if (isLoading || task === undefined) {
    return (
      <aside ref={panelRef} role="complementary" aria-label="Task detail" className={wrapperClass}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading…</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ×
          </button>
        </header>
        {error !== null && (
          <p className="p-4 text-sm text-red-700 dark:text-red-300">{(error as Error).message}</p>
        )}
      </aside>
    );
  }

  // Drop `updated_at` from the editor key (per ADR 0004 §Decision item #6
  // logic): in-progress edits survive when an SSE echo updates the cached
  // task. The 409 path catches concurrent edits at save time and funnels
  // them into the ConflictDialog instead.
  const editorKey = task.id;

  const runSaveWith = async (body: TaskUpdateBody, ifUnchangedSince: string) => {
    // Optimistically apply the edited fields to the cached task so dependent UI
    // — notably a parent section's progress bar — updates instantly, before the
    // PATCH round-trip (ADR 0048 amendment). Rolled back on any failure; the
    // server response reconciles on success.
    const rollback = optimisticPatch(task.id, body);
    let updated: Task;
    try {
      updated = await patch.mutateAsync({
        id: task.id,
        body: { ...body, if_unchanged_since: ifUnchangedSince },
      });
    } catch (err) {
      rollback();
      throw err;
    }
    // Advance the high-water mark to the canonical post-save updated_at so a
    // second save by the same user doesn't 409 against their own first save
    // (which has now advanced the server-side updated_at).
    setOpenedAtUpdatedAt(updated.updated_at);
    // ADR 0059: the server derives / freezes schedule fields the client never
    // typed — clearing an estimate freezes due_date at its last derived
    // value; setting or changing one re-derives it. The editor deliberately
    // survives the save (keyed on task.id so SSE echoes don't clobber
    // in-progress edits), so its schedule-coupled state must re-sync from
    // the authoritative response here. Without this, a cleared estimate
    // leaves the now-visible due input empty and falsely dirty, and the
    // next click-out auto-save would PATCH {due_date: null}, silently
    // wiping the frozen date. Failed saves (409 et al.) throw above and
    // never reach this line — conflict state stays untouched.
    editorStateRef.current?.syncScheduleFromServer(updated);
    // Report the landed write to a host that wants to build an undo step
    // (ADR 0076 section 9). After the mutation resolved, so a refused save
    // never produces a step for something that did not happen; `task` is
    // the pre-edit row from the render closure and `updated` the server's
    // own answer.
    onTaskWritten?.(task, body, updated);
    // Use the server-echoed row so a title edit shows the *new* title, not the
    // pre-edit one captured in the render closure.
    toast.success('Task saved', updated.title);
  };

  // Run a save with the given concurrency token. On 409 stash the parsed
  // conflict + the pending patch so the ConflictDialog can offer Overwrite /
  // Cancel (ADR 0004); `closeOnResolve` records whether resolving the dialog
  // should also dismiss the panel (true for click-out, false for the Save
  // button). On any other error, toast and keep the edits. Returns true only
  // when the save landed, so a click-out caller can decide whether to close.
  // Shared by the explicit Save button and the click-out auto-save.
  const trySave = async (
    body: TaskUpdateBody,
    ifUnchangedSince: string,
    closeOnResolve: boolean,
  ): Promise<boolean> => {
    // ADR 0060: a save that transitions the task into `complete` (with
    // non-empty criteria) first surfaces the completion-criteria reminder.
    // Cancelling returns false — the save is abandoned with no toast, so a
    // click-out won't close the panel and Ctrl+Enter won't hand focus back.
    const reminder = resolveCompletionReminder(task, {
      nextStatus: body.status,
      nextCriteria: body.completion_criteria,
    });
    if (reminder.remind && !(await confirmComplete(task.title, reminder.criteria))) {
      return false;
    }
    // ADR 0075: a save that drops this task offers to carry the drop down the
    // branch. Resolved before the write, so Cancel abandons the save whole.
    const openBeneath = resolveDropCascade(task, { nextStatus: body.status }, tasks);
    let cascadeTo: Task[] = [];
    if (openBeneath.length > 0) {
      const choice = await confirmDrop(task.title, openBeneath);
      if (choice === 'cancel') return false;
      if (choice === 'cascade') cascadeTo = openBeneath;
    }
    try {
      await runSaveWith(body, ifUnchangedSince);
      // Only once this task is actually dropped is there a branch to follow.
      if (cascadeTo.length > 0) {
        const { failed } = await dropCascadeWrite(cascadeTo);
        if (failed.length > 0) {
          toast.error(
            `${failed.length} of ${cascadeTo.length} sub-tasks could not be dropped`,
            'They may have been changed by someone else. Refresh and try again.',
          );
        }
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const parsed = TaskUpdateConflict.safeParse(err.body);
        if (parsed.success) {
          setConflictState({ body: parsed.data, pendingPatch: body, closeOnResolve });
          return false;
        }
      }
      toast.error('Could not save task', err instanceof ApiError ? err.message : String(err));
      return false;
    }
  };

  // Click-out auto-save (ADR 0012 revision 2026-06-07). Invoked by the
  // click-outside effect (declared above the task-load guard, so it reaches
  // this latest closure through `autoSaveRef`). Valid + dirty → save, then
  // close on success; a 409 surfaces the ConflictDialog which — because the
  // click-out meant "leave" — closes the panel once resolved. Invalid → fall
  // back to the Save-button pulse so the user fixes the form rather than
  // losing the edit. Re-entrant calls (and saves still in flight) are no-ops.
  autoSaveRef.current = () => {
    if (autoSavingRef.current || patch.isPending) return;
    const editorState = editorStateRef.current;
    if (editorState === null || !editorState.canSave || openedAtUpdatedAt === null) {
      setPulseTick((n) => n + 1);
      return;
    }
    autoSavingRef.current = true;
    void (async () => {
      try {
        const saved = await trySave(editorState.getBody(), openedAtUpdatedAt, true);
        if (saved) onClose();
      } finally {
        autoSavingRef.current = false;
      }
    })();
  };

  // Ctrl/Cmd+Enter (ADR 0047): save if dirty, then hand focus back to the
  // document so arrow-key navigation (ADR 0045) resumes with the panel still
  // open and the task still selected. Clean form → just return focus.
  // Invalid form → Save-button pulse, focus stays for the fix (same policy
  // as click-out). A 409 raises the ConflictDialog with explicit-save
  // semantics (panel stays open once resolved) and keeps focus where it is.
  saveAndReturnRef.current = () => {
    if (autoSavingRef.current || patch.isPending) return;
    const editorState = editorStateRef.current;
    if (editorState === null || openedAtUpdatedAt === null) return;
    const returnFocus = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    };
    if (!isDirty) {
      returnFocus();
      return;
    }
    if (!editorState.canSave) {
      setPulseTick((n) => n + 1);
      return;
    }
    autoSavingRef.current = true;
    void (async () => {
      try {
        const saved = await trySave(editorState.getBody(), openedAtUpdatedAt, false);
        if (saved) returnFocus();
      } finally {
        autoSavingRef.current = false;
      }
    })();
  };

  // Opening a sub-task leaves this task the way a click-out does (ADR 0012
  // revision 2026-06-07): clean → go; dirty + valid → save, then go; invalid
  // → the Save-button pulse. Unlike a click-out, a 409 keeps the panel on
  // this task (explicit-save semantics) — the user asked to go somewhere
  // specific, and a resolved conflict shouldn't silently close the panel.
  const openSubtask = (childId: string) => {
    if (onOpenTask === undefined) return;
    if (!isDirty) {
      onOpenTask(childId);
      return;
    }
    if (autoSavingRef.current || patch.isPending) return;
    const editorState = editorStateRef.current;
    if (editorState === null || !editorState.canSave || openedAtUpdatedAt === null) {
      setPulseTick((n) => n + 1);
      return;
    }
    autoSavingRef.current = true;
    void (async () => {
      try {
        const saved = await trySave(editorState.getBody(), openedAtUpdatedAt, false);
        if (saved) onOpenTask(childId);
      } finally {
        autoSavingRef.current = false;
      }
    })();
  };

  const parentLookup = new Map(tasks.map((t) => [t.id, t.title]));

  return (
    <>
      <TaskDetailEditor
        key={editorKey}
        task={task}
        project={project}
        users={users}
        parents={tasks}
        showDependencies={showDependencies}
        onOpenTask={onOpenTask === undefined ? undefined : openSubtask}
        onAddSubtask={() => setSubtaskPos(findChildPosition(tasks, task))}
        wrapperClass={wrapperClass}
        panelRef={panelRef}
        editorStateRef={editorStateRef}
        onDirtyChange={setIsDirty}
        pulseTick={pulseTick}
        onClose={onClose}
        onSave={async (body) => {
          // Until the panel has captured an opened-at timestamp the user
          // can't have started typing — but be defensive. An explicit Save
          // leaves the panel open on conflict (closeOnResolve=false).
          if (openedAtUpdatedAt === null) return;
          await trySave(body, openedAtUpdatedAt, false);
        }}
        onDelete={async () => {
          // Snapshot for undo (ADR 0018) — captured before the delete
          // fires so the cache row is still authoritative. Identity is
          // not preserved; re-POST creates a new row with a new UUID.
          const snapshot: TaskCreateBody = {
            title: task.title,
            kind: task.kind,
            parent_id: task.parent_id,
            description: task.description,
            completion_criteria: task.completion_criteria,
            assignee_ids: [...task.assignee_ids],
            status: task.status,
            priority: task.priority,
            color: task.color,
            canvas_x: task.canvas_x,
            canvas_y: task.canvas_y,
            canvas_collapsed: task.canvas_collapsed,
            start_date: task.start_date,
            // ADR 0059: a create may carry EITHER an estimate (due derived
            // server-side) OR a hand-set due date — sending both is a 422,
            // so the snapshot keeps whichever mode the task was in.
            ...(task.work_days === null
              ? { due_date: task.due_date }
              : { work_days: task.work_days }),
            // ADR 0058: round-trip the reviewer on toast-undo restore too.
            reviewer_id: task.reviewer_id,
            // ADR 0026 amended 2026-05-14: `start_date` is now an explicit
            // user-settable column, so we round-trip it on undo. The
            // server-computed `effective_start_date` is still
            // re-derived on the restore POST.
          };
          try {
            await del.mutateAsync(task.id);
            toast.info('Task deleted', task.title, {
              action: {
                label: 'Undo',
                handler: async () => {
                  try {
                    const restored = await create.mutateAsync(snapshot);
                    toast.success('Task restored', restored.title);
                  } catch (err) {
                    toast.error(
                      'Could not restore task',
                      err instanceof ApiError ? err.message : String(err),
                    );
                  }
                },
              },
            });
            onClose();
          } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
              const parsed = TaskDeleteConflict.safeParse(err.body);
              if (parsed.success) {
                const parts: string[] = [];
                if (parsed.data.children.length > 0) {
                  parts.push(`Children: ${parsed.data.children.map((c) => c.title).join(', ')}`);
                }
                if (parsed.data.blocking.length > 0) {
                  parts.push(`Blocking: ${parsed.data.blocking.map((c) => c.title).join(', ')}`);
                }
                if (parsed.data.blocked_by.length > 0) {
                  parts.push(
                    `Blocked by: ${parsed.data.blocked_by.map((c) => c.title).join(', ')}`,
                  );
                }
                toast.error(
                  'Cannot delete: task has dependents',
                  parts.length > 0 ? parts.join('\n') : parsed.data.detail,
                );
                return;
              }
            }
            toast.error(
              'Could not delete task',
              err instanceof ApiError ? err.message : String(err),
            );
          }
        }}
        onConvert={async () => {
          // ADR 0048: convert is just toggling is_section. Sent without an
          // if_unchanged_since token (a deliberate one-field action, not part
          // of the form-edit concurrency flow); the stored status is preserved
          // server-side and restored on convert-back. Advance the high-water
          // mark so a later form save doesn't 409 against this write.
          setConverting(true);
          try {
            const updated = await patch.mutateAsync({
              id: task.id,
              body: { is_section: !task.is_section },
            });
            setOpenedAtUpdatedAt(updated.updated_at);
            // Convert bypasses `runSaveWith`, so it reports itself.
            onTaskWritten?.(task, { is_section: !task.is_section }, updated);
            toast.success(
              updated.is_section ? 'Converted to section' : 'Converted to task',
              updated.title,
            );
          } catch (err) {
            toast.error('Could not convert', err instanceof ApiError ? err.message : String(err));
          } finally {
            setConverting(false);
          }
        }}
        saving={patch.isPending}
        deleting={del.isPending}
        converting={converting}
      />
      {/* ADR 0084: the child starts under this task, in its kind, with its
          reviewer. The panel stays on this task afterwards; the new row
          appears in its Sub-tasks list via the response-driven cache update
          (ADR 0015). A dialog, so the panel's click-outside, Esc and
          Ctrl+Enter all stand down while it is open. */}
      {subtaskPos !== null && (
        <NewTaskModal
          project={project}
          onClose={() => setSubtaskPos(null)}
          defaultParentId={task.id}
          defaultKind={task.kind}
          defaultReviewerId={task.reviewer_id}
          defaultCanvasX={subtaskPos.x}
          defaultCanvasY={subtaskPos.y}
        />
      )}
      {conflictState !== null && (
        <ConflictDialog
          conflict={conflictState.body}
          users={users}
          parentLookup={parentLookup}
          busy={patch.isPending}
          onCancel={() => {
            // Cancel discards the user's edits. If the conflict was raised
            // by a click-out, honour that "leave" intent and close the panel.
            const close = conflictState.closeOnResolve;
            setConflictState(null);
            if (close) onClose();
          }}
          onOverwrite={async () => {
            try {
              await runSaveWith(conflictState.pendingPatch, conflictState.body.current_updated_at);
              const close = conflictState.closeOnResolve;
              setConflictState(null);
              // Click-out-initiated conflict: close once resolved (ADR 0012
              // revision 2026-06-07). An explicit Save-button conflict
              // (closeOnResolve=false) leaves the panel open as before.
              if (close) onClose();
            } catch (err) {
              if (err instanceof ApiError && err.status === 409) {
                // Yet another concurrent edit landed during the dialog —
                // show the new conflict instead of bouncing the user out.
                // Preserve closeOnResolve across the re-raised conflict.
                const parsed = TaskUpdateConflict.safeParse(err.body);
                if (parsed.success) {
                  setConflictState({
                    body: parsed.data,
                    pendingPatch: conflictState.pendingPatch,
                    closeOnResolve: conflictState.closeOnResolve,
                  });
                  return;
                }
              }
              toast.error(
                'Could not save task',
                err instanceof ApiError ? err.message : String(err),
              );
            }
          }}
        />
      )}
    </>
  );
}

interface EditorProps {
  task: TaskDetail;
  project: Project;
  // `color` joins so the assignee pills can render the avatar dot in the
  // user's own palette colour (matching the canvas / sidebar treatment).
  users: { id: string; display_name: string; color: string | null }[];
  parents: Task[];
  showDependencies: boolean;
  /** ADR 0084: open a row of the Sub-tasks list; undefined → rows aren't links. */
  onOpenTask: ((taskId: string) => void) | undefined;
  onAddSubtask: () => void;
  wrapperClass: string;
  /** Mutable ref the panel uses to detect "inside the panel" for the
   *  click-outside-closes behaviour. */
  panelRef: React.MutableRefObject<HTMLElement | null>;
  /** The editor publishes its current validity + a builder for the edited
   *  body here each render, so the panel's click-outside handler can
   *  auto-save the latest edits at click time (ADR 0012 revision 2026-06-07).
   *  `syncScheduleFromServer` is the return channel: the panel calls it with
   *  the response task after a successful save so the schedule-coupled
   *  fields re-sync to the server-derived values (ADR 0059). */
  editorStateRef: React.MutableRefObject<{
    canSave: boolean;
    getBody: () => TaskUpdateBody;
    syncScheduleFromServer: (saved: Task) => void;
  } | null>;
  /** Bumped each time the user tries to click outside while dirty —
   *  remounts the Save button so its `animate-save-pulse` plays fresh. */
  pulseTick: number;
  /** Reports whether any editor field differs from the underlying task.
   *  Drives the click-outside policy: dirty swallows + pulses, clean
   *  closes the panel. */
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
  /**
   * Save callback. The panel owns the `if_unchanged_since` timestamp (per
   * the comment on `openedAtUpdatedAt` in TaskDetailPanel) so a successful
   * save's response can advance it; the editor only sends edited fields.
   */
  onSave: (body: {
    title: string;
    description: string;
    completion_criteria: string;
    kind: string;
    status: TaskStatus;
    priority: TaskPriority | null;
    parent_id: string | null;
    assignee_ids: string[];
    reviewer_id: string | null;
    start_date: string | null;
    /** ADR 0059: null clears the estimate; an integer >= 1 sets it. */
    work_days: number | null;
    /** Omitted while an estimate is set (the server derives it) and when
     *  clearing the estimate with an empty due input (freeze semantics). */
    due_date?: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  /** ADR 0048: toggle this node between task and section. */
  onConvert: () => Promise<void>;
  saving: boolean;
  deleting: boolean;
  converting: boolean;
}

function TaskDetailEditor({
  task,
  project,
  users,
  parents,
  showDependencies,
  onOpenTask,
  onAddSubtask,
  wrapperClass,
  panelRef,
  editorStateRef,
  pulseTick,
  onDirtyChange,
  onClose,
  onSave,
  onDelete,
  onConvert,
  saving,
  deleting,
  converting,
}: EditorProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  // ADR 0060: free-text completion criteria (a twin of description).
  const [completionCriteria, setCompletionCriteria] = useState(task.completion_criteria);
  const [kind, setKind] = useState(task.kind);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  // ADR 0052: '' in the radiogroup = no priority (null on the wire).
  const [priority, setPriority] = useState<TaskPriority | ''>(task.priority ?? '');
  const [parentId, setParentId] = useState<string>(task.parent_id ?? '');
  // ADR 0034: assignee set (not single id). Set semantics so toggle is
  // O(1) and order is normalised — the server re-sorts on read anyway.
  const [assigneeIds, setAssigneeIds] = useState<ReadonlySet<string>>(
    () => new Set(task.assignee_ids),
  );
  // ADR 0058: single optional reviewer; null = none.
  const [reviewerId, setReviewerId] = useState<string | null>(task.reviewer_id);
  const [startDate, setStartDate] = useState<string>(isoToDateInput(task.start_date));
  // ADR 0059: "Days of work" is the primary sizing input. Kept as the raw
  // input string so partial typing doesn't fight the user; parsed below.
  const [workDays, setWorkDays] = useState<string>(
    task.work_days === null ? '' : String(task.work_days),
  );
  // For an estimated task the stored due_date is a server-derived output,
  // not a user entry — the due input starts empty (and hidden) so an
  // untouched form never claims "both filled".
  const [dueDate, setDueDate] = useState<string>(
    task.work_days === null ? isoToDateInput(task.due_date) : '',
  );
  // Inverted-range warning, mirroring the server's 422 (ADR 0026 amended).
  // Hidden when either field is empty; surfaced inline so the user can't
  // submit a doomed save.
  const startAfterDue = startDate !== '' && dueDate !== '' && startDate > dueDate;
  const workDaysNum = workDays === '' ? null : Number(workDays);
  const workDaysInvalid =
    workDaysNum !== null && (!Number.isInteger(workDaysNum) || workDaysNum < 1);
  // Mirror of the server's "not both" 422 (ADR 0059 §5): reachable when a
  // task with a hand-set due date gets an estimate typed in — the due
  // input stays visible in that state so either side can be cleared.
  const bothSizingSet = workDaysNum !== null && dueDate !== '';
  // Live preview of the due date the server will derive (ADR 0059 §7).
  // Basis mirrors the server rule: explicit start pin, else the
  // (blocker-derived) effective start.
  const derivedDueIso =
    workDaysNum !== null && !workDaysInvalid
      ? new Date(
          addWorkingDaysMs(
            Date.parse(`${startDate !== '' ? startDate : task.effective_start_date}T00:00:00Z`),
            workDaysNum,
          ),
        ).toISOString()
      : null;

  // Report dirty state up to the panel. After a successful save the cached
  // `task` advances to match the form, so this naturally flips back to
  // false without the editor needing to track "saved at" separately.
  // Compare the date-input string against the input value that the task's
  // due_date would render as (`isoToDateInput`). String-comparing the
  // round-tripped ISO would falsely flag dirty: the backend emits microsecond
  // precision (`...000000Z`) but our converter emits milliseconds (`...000Z`),
  // and even a same-day round-trip drops the time component entirely. The
  // input cares only about the YYYY-MM-DD bucket.
  const assigneesUnchanged =
    assigneeIds.size === task.assignee_ids.length &&
    task.assignee_ids.every((id) => assigneeIds.has(id));
  const isDirty =
    title.trim() !== task.title ||
    description !== task.description ||
    completionCriteria !== task.completion_criteria ||
    kind !== task.kind ||
    status !== task.status ||
    (priority === '' ? null : priority) !== task.priority ||
    (parentId === '' ? null : parentId) !== task.parent_id ||
    !assigneesUnchanged ||
    reviewerId !== task.reviewer_id ||
    startDate !== isoToDateInput(task.start_date) ||
    workDays !== (task.work_days === null ? '' : String(task.work_days)) ||
    // The due input's pristine value depends on the scheduling mode (see
    // the state initialiser above): the task's due date in legacy mode,
    // empty while an estimate is set.
    dueDate !== (task.work_days === null ? isoToDateInput(task.due_date) : '');
  // Mirrors the Save button's enable condition (minus the in-flight `saving`
  // check): the panel reads this at click-out time to decide whether to
  // auto-save (valid) or just pulse the Save button (invalid form).
  const canSave = title.trim() !== '' && !startAfterDue && !workDaysInvalid && !bothSizingSet;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Build the edited-fields body the panel sends to PATCH. Shared by the
  // explicit Save (below) and the click-out auto-save (via `editorStateRef`).
  // Return type is inferred so it stays the exact `onSave` body shape.
  const buildBody = () => ({
    title: title.trim(),
    description,
    completion_criteria: completionCriteria,
    kind,
    status,
    priority: priority === '' ? null : priority,
    parent_id: parentId === '' ? null : parentId,
    // Order in the request body is irrelevant — the server treats the
    // value as a set and re-sorts on read (ADR 0034).
    assignee_ids: Array.from(assigneeIds),
    // ADR 0058: an explicit null clears the reviewer server-side.
    reviewer_id: reviewerId,
    start_date: dateInputToIso(startDate),
    work_days: workDaysNum,
    // ADR 0059: while an estimate is set, due_date is server-derived — a
    // direct write would 422, so it's omitted. Clearing the estimate with
    // an empty due input also omits it, freezing due_date at its last
    // derived value; a typed due (or an empty input in legacy mode)
    // travels as before.
    ...(workDaysNum !== null
      ? {}
      : task.work_days !== null && dueDate === ''
        ? {}
        : { due_date: dateInputToIso(dueDate) }),
  });

  // Re-sync the schedule-coupled fields from a successful save's response
  // (ADR 0059). The server is authoritative for values the user never
  // typed — clearing an estimate freezes due_date at its last derived
  // value; setting or changing one re-derives it — and the editor survives
  // the save by design (keyed on task.id so SSE echoes don't clobber
  // in-progress edits, and Ctrl+Enter keeps focus), so the state
  // initialiser convention is re-applied here: the due input mirrors the
  // stored due only in legacy mode. Called by the panel's runSaveWith on
  // success only — a 409 (or any failed save) never re-syncs.
  const syncScheduleFromServer = (saved: Task) => {
    setWorkDays(saved.work_days === null ? '' : String(saved.work_days));
    setStartDate(isoToDateInput(saved.start_date));
    setDueDate(saved.work_days === null ? isoToDateInput(saved.due_date) : '');
  };

  // Publish the latest validity + body builder to the panel for click-out
  // auto-save (ADR 0012 revision 2026-06-07). No dep array: refresh after
  // every render so the panel always reads the current form state; null it
  // on unmount so a stale builder can't outlive the editor.
  useEffect(() => {
    editorStateRef.current = { canSave, getBody: buildBody, syncScheduleFromServer };
    return () => {
      editorStateRef.current = null;
    };
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(buildBody());
  };

  // Enter focuses the Title field (ADR 0046) — the keyboard bridge from
  // "task selected" to "task being edited", closing the arrows → Enter →
  // Tab → Esc loop. Lives on the editor (not per-view) so the binding
  // works in every view hosting the panel. Gated per ADR 0019 plus an
  // interactive-element guard the letter shortcuts don't need: Enter on a
  // focused button/link must stay a click, not a focus hijack.
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key !== 'Enter' ||
        hasModifier(e) ||
        !isShortcutTarget() ||
        modalIsOpen(panelRef.current)
      )
        return;
      const el = document.activeElement;
      if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) return;
      e.preventDefault();
      titleInputRef.current?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // `panelRef` is a ref object with a stable identity across renders, and
    // the handler reads `.current` at keypress time — the point of a ref.
    // Listing it would re-install the document listener on every render for
    // no behavioural gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture `now` once per editor render for the indicator. The classifier
  // only uses the day-bucket so re-running it on every keystroke is cheap.
  const now = useMemo(() => new Date(), []);
  const ds = dueStatus(task, project, now);

  // ADR 0048: a section's status is inferred (read-only) from its descendants.
  // Roll it up from the live task list so it tracks child edits in real time.
  const isSection = task.is_section;
  const inferredStatus = useMemo(
    () => buildEffectiveStatusIndex(parents).get(task.id) ?? task.status,
    [parents, task.id, task.status],
  );

  const inputClass =
    'rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';

  return (
    <aside ref={panelRef} role="complementary" aria-label="Task detail" className={wrapperClass}>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="flex items-center gap-2 text-sm font-medium dark:text-slate-100">
          <span>{isSection ? 'Section detail' : 'Task detail'}</span>
          <DueDateIndicator status={ds} title={formatDueDate(task.due_date)} size="md" />
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          className="rounded px-2 text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
        >
          ×
        </button>
      </header>
      <form
        onSubmit={save}
        className="flex flex-1 flex-col gap-3 overflow-auto p-4 text-sm dark:text-slate-100"
      >
        <label className="flex flex-col">
          <span className="mb-1 font-medium">Title</span>
          <input
            ref={titleInputRef}
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
        {/* Status / Kind / Assignee render as button-group pills rather
            than dropdowns (Harrison's 6.5c review). Status uses the same
            colour family the canvas pill carries so the same user-facing
            colour code applies in every view. Parent uses the searchable
            + indented TaskPicker (ADR 0039) — the candidate list is
            unbounded, so it needs search, not a button group. */}
        <fieldset className="flex flex-col">
          <legend className="mb-1 font-medium">Status</legend>
          {isSection ? (
            // ADR 0048: a section's status is inferred from its descendants and
            // is read-only — no manual override. Show the rolled-up value as a
            // static pill with a caption explaining where it comes from.
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  STATUS_STYLES[inferredStatus].pillBg,
                  STATUS_STYLES[inferredStatus].pillText,
                )}
              >
                {STATUS_LABELS[inferredStatus]}
              </span>
              <span className="text-xs italic text-slate-500 dark:text-slate-400">
                Inferred from sub-tasks
              </span>
            </div>
          ) : (
            <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((s) => {
                const selected = status === s;
                const styles = STATUS_STYLES[s];
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStatus(s)}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selected
                        ? `${styles.pillBg} ${styles.pillText} border-transparent`
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        {/* ADR 0052: optional triage level. Hidden for sections (like
            assignees); buildBody still sends `priority` so a section preserves
            any value set before conversion. "None" clears to no priority. */}
        {!isSection && (
          <fieldset className="flex flex-col">
            <legend className="mb-1 font-medium">Priority</legend>
            <div role="radiogroup" aria-label="Priority" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                role="radio"
                aria-checked={priority === ''}
                onClick={() => setPriority('')}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  priority === ''
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
                )}
              >
                None
              </button>
              {PRIORITY_OPTIONS.map((p) => {
                const selected = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPriority(p)}
                    // One selected treatment for every option, the same dark
                    // fill "None" and Kind already use. Previously each
                    // option was filled with its own PRIORITY_STYLES pill
                    // colour, which works for a pill *labelling* a priority
                    // but not for a control *reporting a choice*: Low's pill
                    // is a near-white slate, so a selected Low was all but
                    // indistinguishable from the unselected options beside
                    // it. What the row has to communicate is which one is
                    // picked, and that is one distinction, not three.
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
                    )}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <fieldset className="flex flex-col">
          <legend className="mb-1 font-medium">Kind</legend>
          <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
            {project.stages.map((s) => {
              const selected = kind === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setKind(s)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>
        {/* ADR 0048: a section carries no assignees in its UI. The field is
            hidden, but any existing assignee data is preserved — buildBody still
            sends assignee_ids — so converting back to a task restores it. */}
        {!isSection && (
          <fieldset className="flex flex-col">
            <legend className="mb-1 font-medium">Assignees</legend>
            {/* ADR 0034: multi-select. Each pill is a checkbox; toggling
              an empty set is the "Unassigned" state. Members are listed
              in `users` order (the parent passes useProjectAssignees() —
              the API's user-list order). */}
            <div role="group" aria-label="Assignees" className="flex flex-wrap gap-1.5">
              {users.length === 0 && (
                <span className="text-xs italic text-slate-500 dark:text-slate-400">
                  No project members.
                </span>
              )}
              {users.map((u) => (
                <AssigneePill
                  key={u.id}
                  selected={assigneeIds.has(u.id)}
                  onClick={() =>
                    setAssigneeIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(u.id)) next.delete(u.id);
                      else next.add(u.id);
                      return next;
                    })
                  }
                  label={u.display_name}
                  colour={u.color ?? null}
                />
              ))}
              {assigneeIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setAssigneeIds(new Set())}
                  className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Clear
                </button>
              )}
            </div>
          </fieldset>
        )}
        {/* ADR 0058: single optional reviewer, picked from project members
            with a searchable combobox (the issue asked for search, and a
            single-select states the one-reviewer cardinality — unlike the
            multi-toggle assignee pills). Hidden for sections, same rule as
            Assignees; buildBody still sends reviewer_id so a section
            preserves any value set before conversion. */}
        {!isSection && (
          <div className="flex flex-col">
            <span className="mb-1 font-medium">Reviewer</span>
            <UserCombobox
              noneLabel="None"
              users={users}
              value={reviewerId}
              onChange={setReviewerId}
              ariaLabel="Reviewer"
            />
          </div>
        )}
        <div className="flex flex-col">
          <span className="mb-1 font-medium">Parent</span>
          {/* Searchable + indented picker (ADR 0039). Exclude the task itself
           *  AND every descendant: setting parent_id to a descendant would
           *  close a parent cycle — rejected server-side by the ADR 0029
           *  cycle check, so offering it only invites a confusing 409. */}
          <TaskPicker
            tasks={parents}
            value={parentId === '' ? null : parentId}
            onChange={(id) => setParentId(id ?? '')}
            ariaLabel="Parent"
            excludeIds={descendantSet(task.id, parents)}
          />
        </div>
        {/* ADR 0059: "Days of work" is the primary sizing input — Mon-Fri
            working days; the due date is derived from it and shown
            read-only. Hidden for sections (like assignees/priority) —
            grouping nodes carry no schedule of their own. */}
        {!isSection && (
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col">
              <span className="mb-1 font-medium">Days of work</span>
              <input
                type="number"
                min={1}
                step={1}
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value)}
                className={inputClass}
                aria-invalid={workDaysInvalid || bothSizingSet}
              />
            </label>
            {workDaysNum !== null && !workDaysInvalid && derivedDueIso !== null && (
              <div className="flex flex-1 flex-col">
                <span className="mb-1 font-medium">Due date (derived)</span>
                <span
                  data-testid="derived-due-date"
                  className="px-2 py-1 text-slate-600 dark:text-slate-300"
                >
                  {formatDueDate(derivedDueIso)}
                </span>
              </div>
            )}
          </div>
        )}
        {workDaysInvalid && (
          <p className="-mt-1 text-xs text-red-700 dark:text-red-300">
            Days of work must be a whole number of at least 1.
          </p>
        )}
        {bothSizingSet && (
          <p className="-mt-1 text-xs text-red-700 dark:text-red-300">
            A task can't have both a due date and a days-of-work estimate — clear one.
          </p>
        )}
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col">
            <span className="mb-1 font-medium">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
              aria-invalid={startAfterDue}
            />
          </label>
          {/* The due-date input renders only while no estimate is set (the
              derived value shows read-only above instead). It stays visible
              when it still HOLDS a value alongside a typed estimate, so the
              both-filled conflict is resolvable from either side. */}
          {(workDaysNum === null || dueDate !== '') && (
            <label className="flex flex-1 flex-col">
              <span className="mb-1 font-medium">Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
                aria-invalid={startAfterDue || bothSizingSet}
              />
            </label>
          )}
        </div>
        {startAfterDue && (
          <p className="-mt-1 text-xs text-red-700 dark:text-red-300">
            Start date must be on or before due date.
          </p>
        )}
        <label className="flex flex-col">
          <span className="mb-1 font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </label>
        {/* ADR 0060: completion criteria — a twin of Description, placed
            between it and Dependencies. A soft reminder surfaces this text
            when the task is marked complete. */}
        <label className="flex flex-col">
          <span className="mb-1 font-medium">Completion Criteria</span>
          <textarea
            value={completionCriteria}
            onChange={(e) => setCompletionCriteria(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </label>
        <TaskSubtasksSection
          taskId={task.id}
          allTasks={parents}
          onOpenTask={onOpenTask}
          onAddSubtask={onAddSubtask}
        />
        {showDependencies && <TaskDependenciesSection task={task} allTasks={parents} />}
        <div className="mt-2 flex justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={deleting}
              className="rounded border border-red-300 bg-white px-3 py-1 text-sm text-red-700 disabled:opacity-50 dark:border-red-700 dark:bg-slate-700 dark:text-red-300"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            {/* ADR 0048: convert between task and section. A section's status
                becomes inferred; converting back restores the stored status. */}
            <button
              type="button"
              onClick={() => void onConvert()}
              disabled={converting}
              className="rounded border border-indigo-300 bg-white px-3 py-1 text-sm text-indigo-700 disabled:opacity-50 dark:border-indigo-700 dark:bg-slate-700 dark:text-indigo-300"
            >
              {converting ? 'Converting…' : isSection ? 'Convert to task' : 'Convert to section'}
            </button>
          </div>
          <div className="flex gap-2">
            {/* Discard is only meaningful while there are unsaved edits —
                Esc and × already cover the "close a clean panel" path. */}
            {isDirty && (
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                Discard
              </button>
            )}
            <button
              // Remount the button on every pulseTick bump so the CSS
              // `animate-save-pulse` keyframes replay even when the user
              // clicks-outside-while-dirty in rapid succession. pulseTick=0
              // is the initial state (no pulse) — gating the animation
              // class avoids a stray flash on first mount.
              key={`save-${pulseTick}`}
              type="submit"
              disabled={saving || !canSave}
              className={clsx(
                'rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900',
                pulseTick > 0 && 'animate-save-pulse',
              )}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {/* ADR 0047's commit gesture had no visible affordance anywhere in the
            panel — it was discoverable only from the `s` cheat sheet, which is
            to say not at all (issue #154). Right-aligned on its own line rather
            than inside the button row: the footer already carries four controls
            and wraps in a narrow sidebar.

            It says "save", not "save and close". That is the binding: the panel
            stays open and the task stays selected so arrow-key navigation
            resumes (ADR 0047) — the hint has to describe that, not the
            save-and-close the wording invites. */}
        <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-slate-500">
          Ctrl/⌘+Enter to save
        </p>
      </form>
    </aside>
  );
}

interface AssigneePillProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  /** The assignee's `users.color`, or null when unassigned / no colour set.
   *  Drives the avatar dot; the "Unassigned" pill renders a dashed border
   *  in place of a colour. */
  colour: string | null;
}

function AssigneePill({ selected, onClick, label, colour }: AssigneePillProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        selected
          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
      )}
    >
      {colour === null ? (
        <span
          aria-hidden
          className={clsx(
            'h-2 w-2 rounded-full border border-dashed',
            selected ? 'border-white' : 'border-slate-400 dark:border-slate-500',
          )}
        />
      ) : (
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />
      )}
      <span>{label}</span>
    </button>
  );
}
