import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import {
  type Sheet,
  type SheetServe,
  type SheetStep,
  type SheetStepResult,
  type SheetVerdictResult,
  type SheetStepBody,
} from '../../api/schemas';
import { copyText } from './copyText';
import { rowRenderProbe } from './rowRenderProbe';
import { VERDICT_COLOUR } from './verdictLabels';

export interface SheetViewProps {
  sheet: Sheet;
  onOpen: (taskId: string) => void;
  /** Saves one step; resolves true when the server took it (false keeps the typed boxes). */
  onSaveStep: (n: number, body: Omit<SheetStepBody, 'date' | 'time'>) => Promise<boolean>;
  /** Rendered at the right end of the frozen Items banner (the All Items button). */
  trailing?: ReactNode;
}

/** What the operator has typed on one step and not saved yet. */
interface Draft {
  comments: string;
  /** Notes per Item. The sheet records notes only; the debrief derives the verdict from the logs. */
  verdicts: Record<string, { notes: string }>;
}

type SavedVerdicts = Record<string, SheetVerdictResult>;
type StepStatus = 'done' | 'problem' | 'skipped';
const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'Done',
  problem: 'Problem',
  skipped: 'Skipped',
};

const muted = 'text-slate-500 dark:text-slate-400';
const lbl = clsx('mr-1 text-[11px] lowercase', muted);
const KIND_CHIP: Record<string, string> = {
  setup: 'text-sky-700 dark:text-sky-300',
  run: 'text-emerald-700 dark:text-emerald-300',
  restore: 'text-amber-700 dark:text-amber-300',
};
const tiny =
  'rounded border border-slate-300 px-1.5 text-[11px] leading-5 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700';
const textarea =
  'w-full rounded border border-slate-300 bg-white p-1 text-xs dark:border-slate-600 dark:bg-slate-900';

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={() =>
        void copyText(text).then((ok) => {
          setState(ok ? 'copied' : 'failed');
          window.setTimeout(() => setState('idle'), 2000);
        })
      }
      className={clsx(tiny, 'shrink-0')}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  );
}

/** A state word; hover, keyboard focus or a tap shows its one-sentence description. */
function StateChip({ word, help }: { word: string; help: string | undefined }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-block">
      <span
        tabIndex={0}
        title={help}
        aria-describedby={open && help ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="cursor-help rounded bg-slate-100 px-1 text-[11px] leading-4 dark:bg-slate-700"
      >
        {word}
      </span>
      {open && help ? (
        <span
          role="tooltip"
          id={id}
          className="absolute left-0 top-full z-50 mt-0.5 w-56 max-w-[70vw] rounded border border-slate-300 bg-white p-1.5 text-[11px] font-normal leading-snug text-slate-800 shadow dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {help}
        </span>
      ) : null}
    </span>
  );
}

function ItemLinks({
  serves,
  onOpen,
  showPriority,
}: {
  serves: { item: string; task_id: string | null; priority?: string; title?: string }[];
  onOpen: (taskId: string) => void;
  showPriority?: boolean;
}) {
  return (
    <>
      {serves.map((sv) =>
        sv.task_id !== null ? (
          <button
            key={sv.item}
            type="button"
            title={sv.title}
            onClick={() => onOpen(sv.task_id as string)}
            className="font-mono text-[11px] text-sky-700 hover:underline dark:text-sky-400"
          >
            {sv.item}
            {showPriority === true && sv.priority ? (
              <span className={clsx('ml-0.5 font-sans', muted)}>{sv.priority}</span>
            ) : null}
          </button>
        ) : (
          <span key={sv.item} title={sv.title} className={clsx('font-mono text-[11px]', muted)}>
            {sv.item}
          </span>
        ),
      )}
    </>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" aria-hidden>
      <path d="M2 3h12v8H7l-3 2.5V11H2z" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function savedDraft(
  saved: SheetStepResult | undefined,
  verdicts: SavedVerdicts | undefined,
  step: SheetStep,
): Draft {
  const out: Draft = { comments: saved?.comments ?? '', verdicts: {} };
  for (const sv of step.serves) {
    if (!sv.verdict) continue;
    const v = verdicts?.[sv.item];
    out.verdicts[sv.item] = { notes: v?.notes ?? '' };
  }
  return out;
}

const verdictItems = (step: SheetStep) => step.serves.filter((s) => s.verdict);
/**
 * Done = a step ticked done or skipped, or a verdict step whose notes were saved. A verdict step
 * is completable either way, so no step waits on a verdict the operator no longer chooses.
 */
function isDone(
  saved: SheetStepResult | undefined,
  verdicts: SavedVerdicts | undefined,
  step: SheetStep,
): boolean {
  const s = saved?.status;
  if (s === 'done' || s === 'skipped') return true;
  return verdictItems(step).some((sv) => verdicts?.[sv.item] !== undefined);
}
const savedAtOf = (
  saved: SheetStepResult | undefined,
  verdicts: SavedVerdicts | undefined,
): string | undefined =>
  [saved?.saved_at, ...Object.values(verdicts ?? {}).map((v) => v.saved_at)]
    .filter((s): s is string => s !== undefined)
    .sort()
    .pop();

interface RowProps {
  step: SheetStep;
  stateHelp: Record<string, string>;
  saved: SheetStepResult | undefined;
  savedVerdicts: SavedVerdicts | undefined;
  current: boolean;
  /** What the operator typed and has not saved, by step number; outlives a fold or a rollback. */
  draftsRef: MutableRefObject<Map<number, Draft>>;
  /** Resolves true when the server took the save (false keeps the typed boxes). */
  onSaveStep: (n: number, body: Omit<SheetStepBody, 'date' | 'time'>) => Promise<boolean>;
  onOpen: (taskId: string) => void;
  /** True for a folded step the operator expanded: the number collapses it again. */
  open: boolean;
  onToggle: (n: number) => void;
}

const StepRow = memo(function StepRow({
  step,
  stateHelp,
  saved,
  savedVerdicts,
  current,
  draftsRef,
  onSaveStep,
  onOpen,
  open,
  onToggle,
}: RowProps) {
  rowRenderProbe.hook?.(step.n);
  const [commentOpen, setCommentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The typed draft is local to the row, so a keystroke renders this row and no other.
  const [typed, setTyped] = useState<Draft | null>(() => draftsRef.current.get(step.n) ?? null);
  const draft = useMemo(
    () => typed ?? savedDraft(saved, savedVerdicts, step),
    [typed, saved, savedVerdicts, step],
  );
  const onDraft = (d: Draft) => {
    draftsRef.current.set(step.n, d);
    setTyped(d);
  };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const onSave = async (s?: StepStatus) => {
    const body: Omit<SheetStepBody, 'date' | 'time'> = { comments: draft.comments };
    if (verdictItems(step).length > 0) {
      const verdicts: Record<string, { notes: string }> = {};
      for (const [item, v] of Object.entries(draft.verdicts))
        if (v.notes.trim() !== '') verdicts[item] = { notes: v.notes };
      if (Object.keys(verdicts).length > 0) body.verdicts = verdicts;
    }
    if (s !== undefined) body.status = s;
    setSaving(true);
    try {
      const ok = await onSaveStep(step.n, body);
      if (ok) {
        draftsRef.current.delete(step.n);
        if (mounted.current) setTyped(null);
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  const onCollapse = open ? () => onToggle(step.n) : null;
  const verdictRows = verdictItems(step);
  const isVerdict = verdictRows.length > 0;
  const status = saved?.status ?? null;
  const priorVerdicts = savedVerdicts ?? {};
  const savedAt = savedAtOf(saved, savedVerdicts);
  const hasNotes = Object.values(draft.verdicts).some((v) => v.notes.trim() !== '');
  const ready = draft.comments.trim() !== '' || hasNotes;
  const hasComment = ready;
  const setNotes = (item: string, notes: string) =>
    onDraft({ ...draft, verdicts: { ...draft.verdicts, [item]: { notes } } });
  const statusBtn = (s: StepStatus, text: string, tip: string, on: string) => (
    <button
      type="button"
      disabled={saving}
      aria-pressed={status === s}
      aria-label={STATUS_LABEL[s]}
      title={tip}
      onClick={() => void onSave(s)}
      className={clsx(
        'h-5 w-5 rounded border text-center text-[11px] leading-4 disabled:opacity-60',
        status === s
          ? on
          : 'border-slate-300 text-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700',
      )}
    >
      {text}
    </button>
  );
  return (
    <li
      id={`sheet-step-${step.n}`}
      data-testid="sheet-step"
      data-current={current ? 'true' : undefined}
      data-optional={step.optional ? 'true' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !saving) {
          e.preventDefault();
          if (isVerdict && ready) void onSave();
          else if (status === 'done' || status === 'problem' || status === 'skipped')
            void onSave(status);
        }
      }}
      className={clsx(
        'border-b border-slate-200 py-1 pl-1 text-[13px] leading-snug dark:border-slate-700',
        current && 'border-l-2 border-l-sky-500 bg-sky-50/50 dark:bg-sky-950/30',
        step.optional && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {onCollapse !== null ? (
          <button
            type="button"
            aria-label={`Collapse step ${step.n}`}
            onClick={onCollapse}
            className="w-6 text-right font-mono text-[11px] text-slate-500 hover:underline"
          >
            {step.n}
          </button>
        ) : (
          <span className="w-6 text-right font-mono text-[11px] text-slate-500">{step.n}</span>
        )}
        {statusBtn('done', '✓', 'Done', 'border-emerald-600 bg-emerald-600 text-white')}
        {statusBtn('problem', '!', 'Problem', 'border-red-600 bg-red-600 text-white')}
        {statusBtn(
          'skipped',
          '–',
          'Skipped (not flown this Sitting)',
          'border-slate-500 bg-slate-500 text-white',
        )}
        <button
          type="button"
          aria-label={`Comment on step ${step.n}`}
          aria-expanded={commentOpen}
          title="Comments"
          onClick={() => setCommentOpen((o) => !o)}
          className="relative h-5 w-5 rounded border border-slate-300 p-0.5 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          <CommentIcon />
          {hasComment && (
            <span
              data-testid="comment-dot"
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sky-500"
            />
          )}
        </button>
        <span className="min-w-0 font-semibold">{step.title}</span>
        <span className={clsx('text-[11px]', KIND_CHIP[step.kind] ?? muted)}>{step.kind}</span>
        {step.optional && (
          <span className="rounded border border-slate-400 px-1 text-[10px] text-slate-600 dark:text-slate-300">
            optional
          </span>
        )}
        {current && (
          <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">current</span>
        )}
        <span className="inline-flex flex-wrap items-center gap-0.5">
          <span className={lbl}>from</span>
          {step.from_.length === 0 ? (
            <StateChip word="Launch down" help="No launch is running; Terminal 1 is free." />
          ) : (
            step.from_.map((w) => <StateChip key={w} word={w} help={stateHelp[w]} />)
          )}
        </span>
        {step.serves.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <ItemLinks serves={step.serves} onOpen={onOpen} showPriority />
          </span>
        )}
        {status === 'problem' && (
          <span className="text-[11px] font-semibold text-red-700 dark:text-red-400">problem</span>
        )}
        {status === 'skipped' && (
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            skipped
          </span>
        )}
        {savedAt !== undefined && (
          <span
            data-testid="saved-at"
            className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
          >
            Saved {savedAt}
          </span>
        )}
      </div>
      <div className="pl-7">
        {step.actions.map((a, i) => (
          <div key={i} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="rounded bg-slate-200 px-1 text-[10px] dark:bg-slate-700">
              {a.where}
            </span>
            {a.text != null && a.text !== '' && <span>{a.text}</span>}
            {a.command != null && a.command !== '' && (
              <span className="flex w-full items-start gap-1">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] dark:bg-slate-900">
                  {a.command}
                </code>
                <CopyButton text={a.command} />
              </span>
            )}
          </div>
        ))}
        <div>
          <span className={lbl}>see</span>
          {step.see}
        </div>
        <div>
          <span className="mr-1 text-[11px] lowercase text-amber-700 dark:text-amber-400">
            stop if
          </span>
          {step.stop_if}
        </div>
        {step.record != null && step.record !== '' && (
          <div>
            <span className={lbl}>record</span>
            {step.record}
          </div>
        )}
        {isVerdict &&
          verdictRows.map((sv) => {
            const prior = priorVerdicts[sv.item];
            return (
              <div key={sv.item} data-testid="verdict-row" className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-mono font-semibold">{sv.item}</span>
                  <span className={clsx('min-w-0', muted)}>
                    passes when: {sv.pass_text ?? '(the Item is gone)'}
                  </span>
                  {prior?.verdict !== undefined && (
                    <span
                      data-testid="legacy-verdict"
                      title="Chosen at the robot before the sheet recorded notes only"
                      className={clsx('text-[11px] font-semibold', VERDICT_COLOUR[prior.verdict])}
                    >
                      saved verdict: {prior.verdict}
                    </span>
                  )}
                </div>
                <textarea
                  aria-label={`Notes for ${sv.item}`}
                  placeholder={`Notes for ${sv.item}`}
                  value={draft.verdicts[sv.item]?.notes ?? ''}
                  readOnly={saving}
                  onChange={(e) => setNotes(sv.item, e.target.value)}
                  rows={2}
                  className={textarea}
                />
              </div>
            );
          })}
        {isVerdict && (
          <div className="mt-0.5">
            <button
              type="button"
              disabled={!ready || saving}
              onClick={() => void onSave()}
              className="rounded bg-slate-900 px-2 text-[11px] leading-5 font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <span className={clsx('ml-2 text-[11px]', muted)}>Ctrl+Enter saves</span>
          </div>
        )}
        {commentOpen && (
          <div data-testid="comment-panel" className="mt-1 flex flex-col gap-1">
            <textarea
              aria-label={`Comments for step ${step.n}`}
              placeholder="Comments"
              value={draft.comments}
              readOnly={saving}
              onChange={(e) => onDraft({ ...draft, comments: e.target.value })}
              rows={2}
              className={textarea}
            />
            <div className="flex flex-wrap gap-1">
              {isVerdict ? (
                <button
                  type="button"
                  disabled={!ready || saving}
                  onClick={() => void onSave()}
                  className={tiny}
                >
                  Save comment
                </button>
              ) : status === null ? (
                (['done', 'problem', 'skipped'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={saving}
                    onClick={() => void onSave(s)}
                    className={tiny}
                  >
                    {`Save as ${s}`}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onSave(status as StepStatus)}
                  className={tiny}
                >
                  {saving ? 'Saving…' : 'Save comment'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
});

/** A step folded to one line: saved as done, or all its Items deselected in the picker. */
const FoldedRow = memo(function FoldedRow({
  step,
  kind,
  status,
  savedAt,
  onToggle,
  onOpen,
}: {
  step: SheetStep;
  kind: 'done' | 'dim';
  status: string | null;
  savedAt: string | undefined;
  onToggle: (n: number) => void;
  onOpen: (taskId: string) => void;
}) {
  return (
    <li
      id={`sheet-step-${step.n}`}
      data-testid={kind === 'done' ? 'sheet-step-done' : 'sheet-step-dim'}
      className={clsx(
        'flex items-center gap-1.5 border-b border-slate-200 py-0.5 pl-1 text-[12px] dark:border-slate-700',
        kind === 'dim' && 'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500',
      )}
    >
      <button
        type="button"
        aria-label={`Expand step ${step.n}`}
        onClick={() => onToggle(step.n)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span className="w-6 shrink-0 text-right font-mono text-[11px]">{step.n}</span>
        {kind === 'done' && (
          <span
            className={
              status === 'skipped'
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }
            aria-hidden
          >
            {status === 'skipped' ? '–' : '✓'}
          </span>
        )}
        <span className={clsx('truncate', kind === 'done' && muted)}>{step.title}</span>
        {kind === 'done' && savedAt !== undefined && (
          <span className="shrink-0 text-[11px] text-emerald-700 dark:text-emerald-400">
            {savedAt}
          </span>
        )}
      </button>
      {kind === 'dim' && (
        <span className="shrink-0 font-mono text-[11px]">
          {step.serves.map((s) => s.item).join(' · ')}
        </span>
      )}
      {kind === 'done' && step.serves.length > 0 && (
        <span className="inline-flex shrink-0 gap-1">
          <ItemLinks serves={step.serves} onOpen={onOpen} />
        </span>
      )}
    </li>
  );
});

// -- grouping and the Item picker -------------------------------------------------------

interface Group {
  key: string;
  title: string;
  label: string;
  steps: SheetStep[];
}

/** One group per `new_launch` step; the steps before the first belong to "Before launch". */
function groupSteps(steps: SheetStep[]): Group[] {
  const groups: Group[] = [];
  let launches = 0;
  for (const step of steps) {
    if (step.new_launch === true) {
      launches += 1;
      const m = /\(([^)]*)\)/.exec(step.title);
      groups.push({
        key: `l${launches}`,
        title: `Launch ${launches}`,
        label: m?.[1] ?? step.title,
        steps: [],
      });
    } else if (groups.length === 0) {
      groups.push({ key: 'pre', title: 'Before launch', label: '', steps: [] });
    }
    (groups[groups.length - 1] as Group).steps.push(step);
  }
  return groups;
}

const itemKey = (step: SheetStep) =>
  [...new Set(step.serves.map((s) => s.item))].sort().join(' · ');

const storeKey = (name: string) => `sheet-items:${name}`;
function loadDeselected(name: string): string[] {
  try {
    const raw = window.localStorage.getItem(storeKey(name));
    const v: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function storeDeselected(name: string, list: string[]) {
  try {
    window.localStorage.setItem(storeKey(name), JSON.stringify(list));
  } catch {
    /* the picker still works for this visit without storage */
  }
}

/** One Sitting sheet: its steps in order, grouped by launch; drafts keyed by step number. */
/**
 * A thin index down the left edge: one segment per group, as tall as its step count, filled from
 * the top by the steps done, with a dot at the current step. Decoration only (aria-hidden).
 */
function SheetRail({
  sheet,
  groups,
  current,
}: {
  sheet: Sheet;
  groups: Group[];
  current: number | null;
}) {
  return (
    <div className="w-1 shrink-0" aria-hidden="true">
      <div
        data-testid="sheet-rail"
        className="sticky top-0 flex h-[calc(100vh-3.5rem)] flex-col gap-1.5 py-1"
      >
        {groups.map((g) => {
          const done = g.steps.filter((s) =>
            isDone(sheet.results.steps[String(s.n)], sheet.results.verdicts[String(s.n)], s),
          ).length;
          const at = g.steps.findIndex((s) => s.n === current);
          return (
            <div
              key={g.key}
              data-testid="sheet-rail-segment"
              data-done={done}
              data-total={g.steps.length}
              data-current={at >= 0 ? 'true' : undefined}
              style={{ flexGrow: g.steps.length, flexBasis: 0 }}
              className="relative min-h-1 w-full overflow-visible rounded-full bg-slate-300 dark:bg-slate-700"
            >
              <div
                data-testid="sheet-rail-fill"
                style={{ height: `${(100 * done) / g.steps.length}%` }}
                className="w-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              />
              {at >= 0 && (
                <div
                  data-testid="sheet-rail-marker"
                  style={{ top: `${(100 * at) / g.steps.length}%` }}
                  className="absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-slate-900"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SheetView({ sheet, onOpen, onSaveStep, trailing }: SheetViewProps) {
  const draftsRef = useRef<Map<number, Draft>>(new Map());
  const [deselected, setDeselected] = useState<string[]>(() => loadDeselected(sheet.name));
  /** Folded steps the operator opened (done ones and dimmed ones). */
  const [opened, setOpened] = useState<number[]>([]);
  const changeDeselected = (next: string[]) => {
    setDeselected(next);
    storeDeselected(sheet.name, next);
  };
  const lastSaved = useMemo(() => {
    const ns = [...Object.keys(sheet.results.steps), ...Object.keys(sheet.results.verdicts)].map(
      Number,
    );
    return ns.length === 0 ? 0 : Math.max(...ns);
  }, [sheet.results]);
  const current = sheet.steps.find((s) => s.n > lastSaved)?.n ?? null;
  const groups = useMemo(() => groupSteps(sheet.steps), [sheet.steps]);
  const items = useMemo(() => {
    const seen = new Map<string, SheetServe>();
    for (const st of sheet.steps)
      for (const sv of st.serves) if (!seen.has(sv.item)) seen.set(sv.item, sv);
    return [...seen.values()];
  }, [sheet.steps]);
  // Stable callbacks (the latest props behind a ref) so memoised rows skip re-rendering.
  const latest = useRef({ onOpen, onSaveStep });
  useEffect(() => {
    latest.current = { onOpen, onSaveStep };
  });
  const stableOpen = useCallback((id: string) => latest.current.onOpen(id), []);
  const stableSave = useCallback(
    (n: number, body: Omit<SheetStepBody, 'date' | 'time'>) => latest.current.onSaveStep(n, body),
    [],
  );
  const goCurrent = () => {
    const el = document.getElementById(`sheet-step-${current ?? ''}`);
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const toggleOpened = useCallback(
    (n: number) => setOpened((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n])),
    [],
  );
  const dimmed = (step: SheetStep) =>
    step.serves.length > 0 && step.serves.every((s) => deselected.includes(s.item));
  return (
    <div className="flex gap-2">
      <SheetRail sheet={sheet} groups={groups} current={current} />
      <div className="min-w-0 flex-1">
        {sheet.check_errors.length > 0 && (
          <div
            role="alert"
            data-testid="sheet-stale"
            className="mb-2 rounded border border-red-500 bg-red-50 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <p className="font-semibold">
              This sheet no longer matches the Items or the firmware. Ask a Session to fix it, or
              run /sitting-sheet again, before you fly from it.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {sheet.check_errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div
          data-testid="item-picker"
          className="sticky top-0 z-30 flex h-8 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-300 bg-white px-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
        >
          <span className={muted}>Items</span>
          {items.map((sv) => {
            const on = !deselected.includes(sv.item);
            const low = sv.priority === 'low';
            return (
              <button
                key={sv.item}
                type="button"
                aria-pressed={on}
                title={`${sv.title}${low ? ' (optional, low priority)' : ''}`}
                onClick={() =>
                  changeDeselected(
                    on ? [...deselected, sv.item] : deselected.filter((x) => x !== sv.item),
                  )
                }
                className={clsx(
                  'shrink-0 rounded border px-1.5 font-mono leading-5',
                  low && 'border-dashed italic',
                  on
                    ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900'
                    : 'border-slate-300 text-slate-400 line-through dark:border-slate-600',
                )}
              >
                {sv.item}
                {low ? ' (opt)' : ''}
              </button>
            );
          })}
          <button
            type="button"
            className={clsx(tiny, 'shrink-0')}
            onClick={() => changeDeselected([])}
          >
            All
          </button>
          <button
            type="button"
            className={clsx(tiny, 'shrink-0')}
            onClick={() => changeDeselected(items.map((i) => i.item))}
          >
            None
          </button>
          {trailing !== undefined && <span className="ml-auto shrink-0 pl-2">{trailing}</span>}
        </div>
        {groups.map((g) => {
          const done = g.steps.filter((s) =>
            isDone(sheet.results.steps[String(s.n)], sheet.results.verdicts[String(s.n)], s),
          ).length;
          let prevKey: string | null = null;
          return (
            <section key={g.key} data-testid="launch-group">
              <div
                data-testid="launch-header"
                className="sticky top-8 z-20 flex h-6 items-center gap-2 border-b border-slate-300 bg-slate-100 px-1 text-xs dark:border-slate-600 dark:bg-slate-800"
              >
                <span className="font-semibold">{g.title}</span>
                <span className={clsx('min-w-0 flex-1 truncate', muted)}>{g.label}</span>
                <span data-testid="launch-progress" className="font-mono text-[11px]">
                  {done}/{g.steps.length}
                </span>
              </div>
              <ol>
                {g.steps.flatMap((step) => {
                  const key = itemKey(step);
                  const out = [];
                  if (key !== prevKey) {
                    out.push(
                      <li
                        key={`sub-${step.n}`}
                        data-testid="item-subheader"
                        className="flex items-center gap-1 pl-1 pt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                      >
                        {key === '' ? (
                          'setup'
                        ) : (
                          <ItemLinks
                            serves={[...new Map(step.serves.map((s) => [s.item, s])).values()]}
                            onOpen={stableOpen}
                          />
                        )}
                      </li>,
                    );
                    prevKey = key;
                  }
                  const open = opened.includes(step.n);
                  const isCur = step.n === current;
                  const saved = sheet.results.steps[String(step.n)];
                  const savedVerdicts = sheet.results.verdicts[String(step.n)];
                  if (dimmed(step) && !open)
                    out.push(
                      <FoldedRow
                        key={step.n}
                        step={step}
                        kind="dim"
                        status={saved?.status ?? null}
                        savedAt={savedAtOf(saved, savedVerdicts)}
                        onToggle={toggleOpened}
                        onOpen={stableOpen}
                      />,
                    );
                  else if (isDone(saved, savedVerdicts, step) && !open && !isCur)
                    out.push(
                      <FoldedRow
                        key={step.n}
                        step={step}
                        kind="done"
                        status={saved?.status ?? null}
                        savedAt={savedAtOf(saved, savedVerdicts)}
                        onToggle={toggleOpened}
                        onOpen={stableOpen}
                      />,
                    );
                  else
                    out.push(
                      <StepRow
                        key={step.n}
                        step={step}
                        stateHelp={sheet.state_help}
                        saved={saved}
                        savedVerdicts={savedVerdicts}
                        current={isCur}
                        draftsRef={draftsRef}
                        onSaveStep={stableSave}
                        onOpen={stableOpen}
                        open={open}
                        onToggle={toggleOpened}
                      />,
                    );
                  return out;
                })}
              </ol>
            </section>
          );
        })}
        <div className="sticky bottom-0 mt-2 flex justify-center bg-gradient-to-t from-white to-transparent py-1 dark:from-slate-900">
          {current !== null ? (
            <button
              type="button"
              onClick={goCurrent}
              className="rounded-full bg-sky-700 px-3 py-1 text-xs font-medium text-white shadow hover:bg-sky-600"
            >
              Go to current step {current} of {sheet.steps.length}
            </button>
          ) : (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              All {sheet.steps.length} steps saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
