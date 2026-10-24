import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ApiError } from '../api/client';
import { useCreateDependency, useCreateTask, useProjectAssignees, useTasks } from '../api/hooks';
import type { Project, Task, TaskPriority, TaskStatus } from '../api/schemas';
import { useToast } from '../ui/useToast';
import { STATUS_LABELS, STATUS_OPTIONS } from './statusLabels';
import { PRIORITY_LABELS, PRIORITY_OPTIONS } from './priority';
import { dateInputToIso, formatDueDate } from './dueStatus';
import { addWorkingDaysMs } from './workingDays';
import TaskPicker from './TaskPicker';
import UserCombobox from '../ui/UserCombobox';

interface Props {
  project: Project;
  onClose: () => void;
  // Pre-fill the new task's canvas_x / canvas_y so it lands at a specific
  // canvas position. Used by the canvas's "click empty space → new task"
  // gesture; the list view leaves these unset and the task lands at 0, 0.
  defaultCanvasX?: number;
  defaultCanvasY?: number;
  // Pre-select the status. Used by the board's per-column "+ Add card"
  // affordance so a task captured into a column lands in that column's
  // status (ADR 0041). Defaults to 'backlog' when unset (ADR 0052).
  defaultStatus?: TaskStatus | undefined;
  // Pre-fill the title and body. Used by the BOM's missing-information
  // log, whose "Create task" button is **the only crossing between the
  // BOM and the work graph** (ADR 0077 sect 11) — and a one-way one:
  // nothing is written back and the created task is an ordinary task.
  // Both stay editable, because a prefilled field is a suggestion.
  defaultTitle?: string;
  defaultDescription?: string;
  // Pre-fill the parent, kind and reviewer. Used by the detail panel's
  // "+ Add sub-task" (ADR 0084): the child starts under the task being
  // viewed, in its kind, with its reviewer. All stay editable.
  defaultParentId?: string;
  defaultKind?: string;
  defaultReviewerId?: string | null;
}

export default function NewTaskModal({
  project,
  onClose,
  defaultCanvasX,
  defaultCanvasY,
  defaultStatus,
  defaultTitle,
  defaultDescription,
  defaultParentId,
  defaultKind,
  defaultReviewerId,
}: Props) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  // Only project members can be assigned (ADR 0021 amended).
  const { data: users = [] } = useProjectAssignees();
  const { data: tasks = [] } = useTasks();
  const create = useCreateTask();
  const createDep = useCreateDependency();
  const toast = useToast();

  const [title, setTitle] = useState(defaultTitle ?? '');
  // A default kind the project no longer offers (renamed since the parent
  // was filed) would leave the <select> showing one kind while sending
  // another, so it only applies when it is still a real option.
  const [kind, setKind] = useState(
    defaultKind !== undefined && project.stages.includes(defaultKind)
      ? defaultKind
      : (project.stages[0] ?? ''),
  );
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '');
  // ADR 0034 multi-assignee. Empty set = unassigned.
  const [assigneeIds, setAssigneeIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  // ADR 0058: single optional reviewer (issue #157). null = no reviewer.
  const [reviewerId, setReviewerId] = useState<string | null>(defaultReviewerId ?? null);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'backlog');
  // ADR 0052: optional triage level; '' in the <select> = no priority (null).
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  // ADR 0048: create this node directly as a section (a grouping placeholder
  // whose status is inferred from its children) rather than a real task.
  const [isSection, setIsSection] = useState(false);
  const [description, setDescription] = useState(defaultDescription ?? '');
  // ADR 0060: free-text completion criteria (a twin of description).
  const [completionCriteria, setCompletionCriteria] = useState('');
  // ADR 0059: "Days of work" is the primary sizing input (Mon-Fri working
  // days); when set, the due date is derived server-side and previewed here.
  const [workDays, setWorkDays] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(''); // YYYY-MM-DD from the date input
  const [dueDate, setDueDate] = useState<string>(''); // YYYY-MM-DD from the date input
  // Mirror the detail panel's inverted-range guard.
  const startAfterDue = startDate !== '' && dueDate !== '' && startDate > dueDate;
  const workDaysNum = workDays === '' ? null : Number(workDays);
  const workDaysInvalid =
    workDaysNum !== null && (!Number.isInteger(workDaysNum) || workDaysNum < 1);
  // Mirror of the server's "not both" 422 (ADR 0059 §5) — reachable when a
  // due date was typed before the estimate; the due input stays visible in
  // that state so either side can be cleared.
  const bothSizingSet = workDaysNum !== null && dueDate !== '';
  // Preview of the due date the server will derive: from the start pin if
  // given, else from today (the effective start of a new blocker-less task).
  const derivedDueIso =
    workDaysNum !== null && !workDaysInvalid
      ? new Date(
          addWorkingDaysMs(
            startDate !== '' ? Date.parse(`${startDate}T00:00:00Z`) : Date.now(),
            workDaysNum,
          ),
        ).toISOString()
      : null;
  // Pending dependency edges held client-side until the task itself exists
  // and we have an id to attach them to. POST /dependencies needs both
  // endpoints' UUIDs, so we can't fire these until /tasks has returned.
  const [blockingIds, setBlockingIds] = useState<string[]>([]);
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const taskTitle = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  // The one enable condition for creating, read by the Create button's
  // `disabled` and by the Ctrl+Enter binding below. The keystroke bypasses the
  // button entirely, so the two must not be free to drift: the button already
  // refuses an in-flight or invalid form, and the keystroke has to refuse the
  // same ones (issue #154).
  const canCreate =
    !create.isPending &&
    title.trim() !== '' &&
    !startAfterDue &&
    !workDaysInvalid &&
    !bothSizingSet;

  const submit = async () => {
    if (!canCreate) return;
    let createdId: string;
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        kind,
        parent_id: parentId === '' ? null : parentId,
        // ADR 0048 / issue #120: a section carries no assignees. The field is
        // hidden when "Make this a section" is ticked, and we drop any chips
        // that were toggled before ticking so none get persisted.
        assignee_ids: isSection ? [] : Array.from(assigneeIds),
        // Same rule as assignees: a section has no reviewer, so a pick made
        // before ticking "Make this a section" is dropped.
        reviewer_id: isSection ? null : reviewerId,
        status,
        priority: priority === '' ? null : priority,
        is_section: isSection,
        description,
        completion_criteria: completionCriteria,
        start_date: dateInputToIso(startDate),
        // ADR 0059: a create carries EITHER a days-of-work estimate (the
        // server derives the due date) OR a hand-set due date — never both.
        ...(workDaysNum !== null
          ? { work_days: workDaysNum }
          : { due_date: dateInputToIso(dueDate) }),
        ...(defaultCanvasX !== undefined ? { canvas_x: defaultCanvasX } : {}),
        ...(defaultCanvasY !== undefined ? { canvas_y: defaultCanvasY } : {}),
      });
      createdId = created.id;
    } catch (err) {
      const message =
        err instanceof ApiError ? `${err.status} ${String(err.message)}` : String(err);
      toast.error('Could not create task', message);
      return;
    }

    // Task is in. Fire the pending dependency POSTs in parallel — each
    // failure (cycle / duplicate / 5xx) is captured per-edge so a partial
    // success ("task created but 1 of 2 dependencies failed") is reported
    // honestly rather than aborting silently.
    const depResults = await Promise.all([
      ...blockingIds.map((id) =>
        createDep
          .mutateAsync({ blocker_id: createdId, blocked_id: id })
          .then(() => ({ ok: true as const }))
          .catch((err: unknown) => ({
            ok: false as const,
            target: taskTitle.get(id) ?? id,
            err,
          })),
      ),
      ...blockedByIds.map((id) =>
        createDep
          .mutateAsync({ blocker_id: id, blocked_id: createdId })
          .then(() => ({ ok: true as const }))
          .catch((err: unknown) => ({
            ok: false as const,
            target: taskTitle.get(id) ?? id,
            err,
          })),
      ),
    ]);
    const failed = depResults.filter((r) => !r.ok);
    if (failed.length === 0) {
      toast.success(isSection ? 'Section created' : 'Task created', title.trim());
    } else {
      const lines = failed.map((f) => {
        const detail = f.err instanceof ApiError ? f.err.message : String(f.err);
        return `${f.target}: ${detail}`;
      });
      toast.error(
        'Task created, but some dependencies failed',
        `${failed.length} of ${depResults.length} dependency edges could not be added:\n${lines.join('\n')}`,
      );
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-heading"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        // Ctrl/⌘+Enter commits the form from anywhere inside it — the same
        // "commit" gesture the detail panel binds (ADR 0047), which this modal
        // suppresses at the document level because it is a modal in front of
        // the panel. It therefore has to bind its own (issue #154).
        //
        // CAPTURE phase, and it stops propagation, so that one keystroke does
        // one thing. Two of the fields below open a TaskPicker dropdown whose
        // own Enter handler commits the highlighted option; let the event
        // reach it and Ctrl+Enter both picks a parent and submits. On a valid
        // form that looks harmless — the POST body is read from this render's
        // closure, so the pick never reaches the wire — but on an invalid one
        // the submit is refused, the modal stays open, and the user is left
        // holding a parent task they never chose. Plain Enter is untouched: it
        // still picks in the picker, and still submits natively from a
        // single-line input.
        onKeyDownCapture={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
          e.preventDefault();
          e.stopPropagation();
          void submit();
        }}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-lg dark:bg-slate-800 dark:text-slate-100"
      >
        <h2 id="new-task-heading" className="px-5 pt-5 text-lg font-semibold">
          {isSection ? 'New section' : 'New task'}
        </h2>
        <div className="flex flex-col gap-3 overflow-auto px-5 py-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Title</span>
            <input
              ref={titleRef}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </label>
          {/* ADR 0048: a section is a grouping placeholder — its status is
              inferred from its children, so the Status field is hidden below
              when this is checked. */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSection}
              onChange={(e) => setIsSection(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Make this a section</span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">
                — a grouping placeholder whose status is inferred from its sub-tasks
              </span>
            </span>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {project.stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Parent task (optional)</span>
            {/* Searchable + indented picker (ADR 0039). No exclusions — the
                task doesn't exist yet, so no descendant cycle is possible. */}
            <TaskPicker
              tasks={tasks}
              value={parentId === '' ? null : parentId}
              onChange={(id) => setParentId(id ?? '')}
              ariaLabel="Parent task"
            />
          </div>
          {/* ADR 0048 / issue #120: a section has no assignees, so hide the
              field when "Make this a section" is ticked (matching the detail
              panel and the Status/Priority fields below). */}
          {!isSection && (
            <fieldset className="flex flex-col text-sm">
              <legend className="mb-1 font-medium">Assignees (optional)</legend>
              {/* ADR 0034 multi-assignee. Same chip pattern as the detail
                panel's picker so the two surfaces feel uniform. Empty
                set = unassigned (no "Clear" needed — leaving every chip
                un-toggled is the implicit unassigned state). */}
              <div role="group" aria-label="Assignees" className="flex flex-wrap gap-1.5">
                {users.length === 0 && (
                  <span className="text-xs italic text-slate-500 dark:text-slate-400">
                    No project members.
                  </span>
                )}
                {users.map((u) => {
                  const selected = assigneeIds.has(u.id);
                  const colour = u.color ?? null;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() =>
                        setAssigneeIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
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
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colour }}
                        />
                      )}
                      <span>{u.display_name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {/* ADR 0058 / issue #157: the same searchable single-select as the
              detail panel's Reviewer field, hidden for sections. */}
          {!isSection && (
            <div className="flex flex-col text-sm">
              <span className="mb-1 font-medium">Reviewer (optional)</span>
              <UserCombobox
                noneLabel="None"
                users={users}
                value={reviewerId}
                onChange={setReviewerId}
                ariaLabel="Reviewer"
              />
            </div>
          )}
          {!isSection && (
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isSection && (
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium">Priority</span>
              {/* ADR 0052: optional triage level. Empty option = no priority. */}
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">— No priority —</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* ADR 0059: the estimate is the default sizing input; sections
              carry no schedule of their own so it's hidden for them. */}
          {!isSection && (
            <div className="flex gap-2 text-sm">
              <label className="flex flex-1 flex-col">
                <span className="mb-1 font-medium">Days of work (optional)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={workDays}
                  onChange={(e) => setWorkDays(e.target.value)}
                  aria-invalid={workDaysInvalid || bothSizingSet}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </label>
              {workDaysNum !== null && !workDaysInvalid && derivedDueIso !== null && (
                <div className="flex flex-1 flex-col">
                  <span className="mb-1 font-medium">Due date (derived)</span>
                  <span
                    data-testid="derived-due-date"
                    className="px-2 py-1 text-slate-600 dark:text-slate-400"
                  >
                    {formatDueDate(derivedDueIso)}
                  </span>
                </div>
              )}
            </div>
          )}
          {workDaysInvalid && (
            <p className="-mt-2 text-xs text-red-700 dark:text-red-300">
              Days of work must be a whole number of at least 1.
            </p>
          )}
          {bothSizingSet && (
            <p className="-mt-2 text-xs text-red-700 dark:text-red-300">
              A task can't have both a due date and a days-of-work estimate — clear one.
            </p>
          )}
          <div className="flex gap-2 text-sm">
            <label className="flex flex-1 flex-col">
              <span className="mb-1 font-medium">Start date (optional)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-invalid={startAfterDue}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </label>
            {/* Renders only while no estimate is set (the derived due shows
                read-only above); stays visible when it still holds a value
                so the both-filled conflict is resolvable from either side. */}
            {(workDaysNum === null || dueDate !== '') && (
              <label className="flex flex-1 flex-col">
                <span className="mb-1 font-medium">Due date (optional)</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-invalid={startAfterDue || bothSizingSet}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </label>
            )}
          </div>
          {startAfterDue && (
            <p className="-mt-2 text-xs text-red-700 dark:text-red-300">
              Start date must be on or before due date.
            </p>
          )}
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </label>
          {/* ADR 0060: completion criteria — between Description and
              Dependencies, mirroring the detail panel's ordering. */}
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Completion Criteria</span>
            <textarea
              value={completionCriteria}
              onChange={(e) => setCompletionCriteria(e.target.value)}
              rows={3}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </label>
          <DependencyDraftSection
            allTasks={tasks}
            blockingIds={blockingIds}
            blockedByIds={blockedByIds}
            onBlockingChange={setBlockingIds}
            onBlockedByChange={setBlockedByIds}
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          {/* The keystroke needs somewhere to be seen, or it may as well not
              exist (issue #154). Same treatment as the Comments box's hint, so
              the two shortcuts in the app that are worth advertising in place
              look like one convention rather than two. */}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Ctrl/⌘+Enter to create
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Local-only dependency picker for the New Task modal. POST /dependencies
 * needs both endpoints' UUIDs, and the new task doesn't have an id until
 * POST /tasks returns, so we buffer the picks here and the modal fires the
 * dependency POSTs after the task lands. Mirrors the visual shape of
 * TaskDependenciesSection so the experience matches the post-create panel.
 */
interface DraftProps {
  // Full Task objects (not just {id, title}) — TaskPicker reads parent_id to
  // build its indented tree (ADR 0039).
  allTasks: Task[];
  blockingIds: string[];
  blockedByIds: string[];
  onBlockingChange: (ids: string[]) => void;
  onBlockedByChange: (ids: string[]) => void;
}

function DependencyDraftSection({
  allTasks,
  blockingIds,
  blockedByIds,
  onBlockingChange,
  onBlockedByChange,
}: DraftProps) {
  const taskTitle = useMemo(() => new Map(allTasks.map((t) => [t.id, t.title])), [allTasks]);

  // Hide tasks that are already in the corresponding list so the user can't
  // queue the same edge twice (the backend would 409 on duplicate at
  // creation time too). Passed to each picker as `excludeIds`.
  const blockingSet = useMemo(() => new Set(blockingIds), [blockingIds]);
  const blockedBySet = useMemo(() => new Set(blockedByIds), [blockedByIds]);

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-700">
      <legend className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Dependencies (optional)
      </legend>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Blocking ({blockingIds.length})
          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
            — tasks this one blocks
          </span>
        </p>
        {blockingIds.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">None</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {blockingIds.map((id) => (
              <DraftRow
                key={id}
                title={taskTitle.get(id) ?? id}
                onRemove={() => onBlockingChange(blockingIds.filter((x) => x !== id))}
              />
            ))}
          </ul>
        )}
        {/* Picking a task adds the edge immediately; resetOnSelect keeps the
            picker showing the placeholder, ready for the next pick (ADR 0039
            chip-input flow). Already-queued tasks are excluded. */}
        <div className="mt-2">
          <TaskPicker
            tasks={allTasks}
            value={null}
            onChange={(id) => {
              if (id !== null) onBlockingChange([...blockingIds, id]);
            }}
            ariaLabel="Add task this one will block"
            excludeIds={blockingSet}
            noneLabel="— select a task —"
            allowNone={false}
            resetOnSelect
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          Blocked by ({blockedByIds.length})
          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
            — tasks that block this one
          </span>
        </p>
        {blockedByIds.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">None</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {blockedByIds.map((id) => (
              <DraftRow
                key={id}
                title={taskTitle.get(id) ?? id}
                onRemove={() => onBlockedByChange(blockedByIds.filter((x) => x !== id))}
              />
            ))}
          </ul>
        )}
        <div className="mt-2">
          <TaskPicker
            tasks={allTasks}
            value={null}
            onChange={(id) => {
              if (id !== null) onBlockedByChange([...blockedByIds, id]);
            }}
            ariaLabel="Add task that blocks this one"
            excludeIds={blockedBySet}
            noneLabel="— select a task —"
            allowNone={false}
            resetOnSelect
          />
        </div>
      </div>
    </fieldset>
  );
}

function DraftRow({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <li className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700">
      <span className="truncate" title={title}>
        {title}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${title}`}
        className="ml-2 rounded px-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-100"
      >
        ×
      </button>
    </li>
  );
}
