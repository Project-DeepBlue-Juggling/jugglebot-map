import { z } from 'zod';

// ADR 0052: canonical status order — backlog leads, qa sits before complete.
// ADR 0075 appends `dropped` (intentionally abandoned), so the two terminal
// states sit together at the end.
// The server's status vocabulary is mapkit's and differs per kind (inbox, open,
// active, promoted, ...), so the wire type is a plain string. The prototype's
// seven statuses stay the UI's known set (statusLabels / statusStyles fall back
// for anything else) until the two pages (P4) bring the map statuses.
export const TaskStatus = z.string();
export type TaskStatus = z.infer<typeof TaskStatus>;

// ADR 0052: optional triage level. The field is nullable on the wire — `null`
// means "no priority" (the default). These are the only non-null values.
// Item metrics (spec: the Jugglebot checkout's metrics/spec.md); null = unrated.
export const EffortValue = z.enum(['xs', 's', 'm', 'l', 'xl']);
export const HardwareValue = z.enum(['none', 'bench-leg', 'robot']);
export const OwnerNeedValue = z.enum(['none', 'decision', 'hands']);
export const RadiusValue = z.enum(['local', 'subsystem', 'cross-cutting', 'normative']);
export const DiagnosisValue = z.enum(['unknown', 'hypothesis', 'confirmed']);
export const AreaValue = z.enum([
  'firmware',
  'can-bridge',
  'legs',
  'hand',
  'platform-teensy',
  'tracking',
  'ball-butler',
  'skill-stack',
  'learner',
  'gui',
  'map-app',
  'tests-tooling',
  'docs',
  'sim',
]);

export const TaskPriority = z.enum(['low', 'medium', 'high']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const DarkMode = z.enum(['light', 'dark', 'system']);
export type DarkMode = z.infer<typeof DarkMode>;

export const MembershipRole = z.enum(['editor', 'admin']);
export type MembershipRole = z.infer<typeof MembershipRole>;

export const User = z.object({
  id: z.string(),
  email: z.string(),
  display_name: z.string(),
  color: z.string(),
  dark_mode: DarkMode,
  created_at: z.string(),
});
export type User = z.infer<typeof User>;

export const UserList = z.array(User);

/** The caller's own row: `GET /users/me`. */
export const CurrentUser = User;
export type CurrentUser = z.infer<typeof CurrentUser>;

export interface UserPatchSelfBody {
  color?: string;
  dark_mode?: DarkMode;
}

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  stages: z.array(z.string()),
  due_date_warning_days: z.number().int(),
  created_at: z.string(),
  created_by: z.string(),
});
export type Project = z.infer<typeof Project>;

export const ProjectList = z.array(Project);

export const ProjectMembership = z.object({
  user_id: z.string(),
  project_id: z.string(),
  role: MembershipRole,
  created_at: z.string(),
  created_by: z.string(),
});
export type ProjectMembership = z.infer<typeof ProjectMembership>;

export const ProjectMembershipList = z.array(ProjectMembership);

export const Task = z.object({
  id: z.string(),
  project_id: z.string(),
  parent_id: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  // ADR 0060: free-text completion criteria — a twin of `description`. A
  // soft reminder surfaces this text when a task is marked complete.
  completion_criteria: z.string(),
  // ADR 0034: replaces the single `assignee_id` FK. Sorted server-side
  // by `users.display_name` so the order is stable across reloads —
  // the "first assignee" presentation rule (canvas avatar colour,
  // Timeline pill ordering) depends on this ordering being deterministic.
  assignee_ids: z.array(z.string()),
  // One of the project's `stages` list (the kind list): pathway | idea |
  // feature | bug | ticket | plan | phase.
  kind: z.string(),
  status: TaskStatus,
  // ADR 0052: optional triage level; null = no priority.
  priority: TaskPriority.nullable(),
  effort: EffortValue.nullable(),
  hardware: HardwareValue.nullable(),
  owner: OwnerNeedValue.nullable(),
  radius: RadiusValue.nullable(),
  // Bugs only; null on every other kind.
  diagnosis: DiagnosisValue.nullable(),
  area: AreaValue.nullable(),
  // ADR 0048: true = this node is a grouping "section", not a real task.
  // When true the UI ignores the stored `status` above and renders a status
  // inferred from the section's descendants (see `sectionStatus`); the stored
  // value is preserved so converting back to a task restores it.
  is_section: z.boolean(),
  // ADR 0057: manual ordering within a Backlog priority band (lower = higher).
  // Server-assigned; the Backlog view sorts by it and computes midpoint ranks
  // for a reorder drag.
  backlog_rank: z.number(),
  color: z.string().nullable(),
  canvas_x: z.number(),
  canvas_y: z.number(),
  canvas_collapsed: z.boolean(),
  // ADR 0059: "days of work" estimate — Mon-Fri working days, integer >= 1.
  // null = no estimate. While set, `due_date` is a stored server-derived
  // output — direct due_date writes are rejected 422; edit work_days (or
  // the start pin) instead.
  work_days: z.number().int().nullable(),
  // ADR 0026 amendment 2026-05-14: `start_date` is now an optional
  // user-settable column (nullable ISO datetime, mirroring `due_date`).
  // When null, the server falls back to deriving the bar's left edge
  // from the task's direct blockers — see `effective_start_date` below.
  start_date: z.string().nullable(),
  due_date: z.string().nullable(),
  // ADR 0058: single optional reviewer — a project member who signs the
  // work off. `null` = no reviewer (the default).
  reviewer_id: z.string().nullable(),
  // Server-computed for rendering — explicit `start_date` if set,
  // otherwise max blocker due_date (or today). Always populated. Not
  // writeable on Create / Update. ISO `YYYY-MM-DD`.
  effective_start_date: z.string().nullable(),
  created_at: z.string(),
  created_by: z.string(),
  updated_at: z.string(),
  updated_by: z.string(),
  // Map fields (server/models.py Task).
  slug: z.string(),
  destination: z.string(),
  branch: z.string().nullable(),
  links: z.array(z.string()),
  filed_by: z.string().nullable(),
  promoted_to: z.string().nullable(),
  rank: z.number().nullable(),
  ticket_type: z.string().nullable(),
  source_path: z.string(),
  editable: z.boolean(),
  pathway_id: z.string().nullable(),
  // Short Item ID `JB-<n>` (null for plans, phases and an Item without one) and
  // whether the app has pushed the Item yet (an unpushed ID may still be renumbered).
  short_id: z.string().nullable(),
  unpushed: z.boolean(),
});
export type Task = z.infer<typeof Task>;

export const TaskList = z.array(Task);

export const DependencyEdge = z.object({
  id: z.string(),
  blocker_id: z.string(),
  blocked_id: z.string(),
  created_at: z.string(),
  created_by: z.string(),
});
export type DependencyEdge = z.infer<typeof DependencyEdge>;

export const DependencyEdgeList = z.array(DependencyEdge);

export const TaskDetail = Task.extend({
  blocking: z.array(DependencyEdge),
  blocked_by: z.array(DependencyEdge),
});
export type TaskDetail = z.infer<typeof TaskDetail>;

export const TaskSummary = z.object({
  id: z.string(),
  title: z.string(),
});
export type TaskSummary = z.infer<typeof TaskSummary>;

export const TaskDeleteConflict = z.object({
  detail: z.string(),
  children: z.array(TaskSummary),
  blocking: z.array(TaskSummary),
  blocked_by: z.array(TaskSummary),
});
export type TaskDeleteConflict = z.infer<typeof TaskDeleteConflict>;

/** 409 body returned by `PATCH /tasks/{id}` when a `parent_id` change
 *  would close a cycle in the parent tree (ADR 0029). */
export const ReparentCycleConflict = z.object({
  detail: z.string(),
  would_close_via: TaskSummary,
});
export type ReparentCycleConflict = z.infer<typeof ReparentCycleConflict>;

export const ConflictingValues = z.object({
  client: z.unknown(),
  server: z.unknown(),
});

export const TaskUpdateConflict = z.object({
  detail: z.string(),
  current_updated_at: z.string(),
  current_updated_by: z.string(),
  conflicts: z.record(z.string(), ConflictingValues),
});
export type TaskUpdateConflict = z.infer<typeof TaskUpdateConflict>;

export interface TaskCreateBody {
  title: string;
  kind: string;
  // File even though the server answered 409 `similar` (the person saw the list);
  // never overrides a 409 `duplicate` (an open Item with this title).
  allow_similar?: boolean;
  parent_id?: string | null;
  description?: string;
  // ADR 0060: optional completion criteria; omit for empty (like description).
  completion_criteria?: string;
  // ADR 0034. Omit or pass `[]` for unassigned; non-empty list sets the
  // assignee set.
  assignee_ids?: string[];
  status?: TaskStatus;
  // ADR 0052: optional triage level; omit or pass null for no priority.
  priority?: TaskPriority | null;
  effort?: z.infer<typeof EffortValue> | null;
  hardware?: z.infer<typeof HardwareValue> | null;
  owner?: z.infer<typeof OwnerNeedValue> | null;
  radius?: z.infer<typeof RadiusValue> | null;
  diagnosis?: z.infer<typeof DiagnosisValue> | null;
  area?: z.infer<typeof AreaValue> | null;
  // ADR 0048: create a node directly as a section (default: a normal task).
  is_section?: boolean;
  color?: string | null;
  canvas_x?: number;
  canvas_y?: number;
  canvas_collapsed?: boolean;
  // ADR 0059: optional days-of-work estimate. When set, omit `due_date`
  // (sending both is a 422) — the server derives it.
  work_days?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  // ADR 0058: optional reviewer; omit or pass null for none. Must be a
  // project member (the server 400s otherwise, like assignee_ids).
  reviewer_id?: string | null;
}

export interface TaskUpdateBody {
  title?: string;
  parent_id?: string | null;
  description?: string | null;
  // ADR 0060: omit = unchanged; null = clear (same as description).
  completion_criteria?: string | null;
  // ADR 0034. Omitting leaves the set unchanged; passing `[]` clears it;
  // passing a non-empty list replaces the set with exactly these IDs.
  assignee_ids?: string[];
  kind?: string;
  status?: TaskStatus;
  // ADR 0052: set/change/clear the triage level. Omit = unchanged; null = clear.
  priority?: TaskPriority | null;
  effort?: z.infer<typeof EffortValue> | null;
  hardware?: z.infer<typeof HardwareValue> | null;
  owner?: z.infer<typeof OwnerNeedValue> | null;
  radius?: z.infer<typeof RadiusValue> | null;
  diagnosis?: z.infer<typeof DiagnosisValue> | null;
  area?: z.infer<typeof AreaValue> | null;
  // ADR 0057: set the manual backlog position (a reorder drag's midpoint rank).
  // A cross-band drag sends this together with `priority`; a bare priority
  // change (no rank) is re-homed to the new band's bottom server-side.
  backlog_rank?: number;
  // ADR 0048: toggle the section discriminator (the convert action).
  is_section?: boolean;
  color?: string | null;
  canvas_x?: number;
  canvas_y?: number;
  canvas_collapsed?: boolean;
  // ADR 0059: omit = unchanged; null = clear the estimate (freezing
  // due_date at its last derived value); an integer >= 1 sets it and the
  // server re-derives due_date. Sending due_date while the task will still
  // carry an estimate after the PATCH is rejected 422; due_date together
  // with work_days: null is the transition back to hand-set due dates.
  work_days?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  // ADR 0058: set/change/clear the reviewer. Omit = unchanged; explicit
  // null = clear — the same null-vs-omitted semantics as start_date.
  reviewer_id?: string | null;
  // Map fields the server's store writes through to the item file.
  destination?: string;
  branch?: string | null;
  links?: string[];
  promoted_to?: string | null;
  if_unchanged_since?: string;
}

export interface DependencyCreateBody {
  blocker_id: string;
  blocked_id: string;
}

// ----- GET /health -----------------------------------------------------------

export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
  banner: z.object({
    level: z.enum(['error', 'warning']).nullable(),
    message: z.string(),
    since: z.string().nullable(),
  }),
});
export type Health = z.infer<typeof Health>;

// -- Glossary (read-only: GLOSSARY.md, parsed by mapkit) -----------------------

export const GlossaryTerm = z.object({
  term: z.string(),
  definition: z.string(),
  avoid: z.array(z.string()),
  anchor: z.string(),
});
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;

export const GlossaryCluster = z.object({
  name: z.string(),
  terms: z.array(GlossaryTerm),
});
export type GlossaryCluster = z.infer<typeof GlossaryCluster>;

export const Glossary = z.object({ clusters: z.array(GlossaryCluster) });
export type Glossary = z.infer<typeof Glossary>;

// -- Item history (server/history.py) and nightly status (server/nightly.py) --

export const HistoryCommit = z.object({
  sha: z.string(),
  short: z.string(),
  date: z.string(),
  subject: z.string(),
  logbook_entry: z.string().nullable(),
});
export type HistoryCommit = z.infer<typeof HistoryCommit>;

export const HistoryDocument = z.object({
  kind: z.enum(['logbook', 'plan', 'other']),
  path: z.string(),
  title: z.string(),
  exists: z.boolean(),
  url: z.string().nullable(),
});
export type HistoryDocument = z.infer<typeof HistoryDocument>;

/** `head: ""` with empty lists = the item is not committed (untracked). */
export const ItemHistory = z.object({
  head: z.string(),
  commits: z.array(HistoryCommit),
  documents: z.array(HistoryDocument),
});
export type ItemHistory = z.infer<typeof ItemHistory>;

export const NightlyState = z.enum(['GREEN', 'RED', 'DEFERRED', 'STALE', 'NEVER']);
export type NightlyState = z.infer<typeof NightlyState>;

export const NightlyStatus = z.object({
  state: NightlyState,
  line: z.string(),
  date: z.string().nullable(),
  age_days: z.number().nullable(),
  configured: z.boolean(),
});
export type NightlyStatus = z.infer<typeof NightlyStatus>;
