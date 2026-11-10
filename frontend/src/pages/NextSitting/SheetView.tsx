import { useId, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  VERDICTS,
  type Sheet,
  type SheetServe,
  type SheetStep,
  type SheetStepBody,
  type Verdict,
} from '../../api/schemas';
import { copyText } from './copyText';
import { VERDICT_COLOUR, VERDICT_HINT, VERDICT_LABEL } from './verdictLabels';

export interface SheetViewProps {
  sheet: Sheet;
  onOpen: (taskId: string) => void;
  /** Saves one step; resolves true when the server took it (false keeps the typed boxes). */
  onSaveStep: (n: number, body: Omit<SheetStepBody, 'date' | 'time'>) => Promise<boolean>;
}

/** What the operator has typed on one step and not saved yet. */
interface Draft {
  comments: string;
  verdicts: Record<string, { verdict: Verdict | null; notes: string }>;
}

type StepStatus = 'done' | 'problem';

const muted = 'text-slate-500 dark:text-slate-400';
const lbl = clsx('mr-1 text-[11px] lowercase', muted);
const KIND_CHIP: Record<string, string> = {
  setup: 'text-sky-700 dark:text-sky-300',
  run: 'text-emerald-700 dark:text-emerald-300',
  restore: 'text-amber-700 dark:text-amber-300',
};
const tiny =
  'rounded border border-slate-300 px-1.5 text-[11px] leading-5 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700';
const verdictBtn = (on: boolean) =>
  clsx(
    'rounded border px-1.5 text-[11px] leading-5 disabled:opacity-60',
    on
      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
      : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
  );
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

function savedDraft(sheet: Sheet, step: SheetStep): Draft {
  const saved = sheet.results.steps[String(step.n)];
  const verdicts = sheet.results.verdicts[String(step.n)] ?? {};
  const out: Draft = { comments: saved?.comments ?? '', verdicts: {} };
  for (const sv of step.serves) {
    if (!sv.verdict) continue;
    const v = verdicts[sv.item];
    out.verdicts[sv.item] = {
      verdict:
        v !== undefined && (VERDICTS as readonly string[]).includes(v.verdict)
          ? (v.verdict as Verdict)
          : null,
      notes: v?.notes ?? '',
    };
  }
  return out;
}

const verdictItems = (step: SheetStep) => step.serves.filter((s) => s.verdict);
const savedStatus = (sheet: Sheet, step: SheetStep): string | null =>
  sheet.results.steps[String(step.n)]?.status ?? null;
/** Done = a simple step ticked done, or a verdict step with a saved verdict for every Item. */
function isDone(sheet: Sheet, step: SheetStep): boolean {
  const vr = verdictItems(step);
  if (vr.length === 0) return savedStatus(sheet, step) === 'done';
  const saved = sheet.results.verdicts[String(step.n)] ?? {};
  return vr.every((sv) => saved[sv.item] !== undefined);
}
const savedAtOf = (sheet: Sheet, step: SheetStep): string | undefined =>
  [
    sheet.results.steps[String(step.n)]?.saved_at,
    ...Object.values(sheet.results.verdicts[String(step.n)] ?? {}).map((v) => v.saved_at),
  ]
    .filter((s): s is string => s !== undefined)
    .sort()
    .pop();

interface RowProps {
  step: SheetStep;
  sheet: Sheet;
  current: boolean;
  saving: boolean;
  draft: Draft;
  onDraft: (d: Draft) => void;
  onSave: (status?: StepStatus) => void;
  onOpen: (taskId: string) => void;
  /** Set for a done step that is expanded: the number collapses it again. */
  onCollapse: (() => void) | null;
}

function StepRow({
  step,
  sheet,
  current,
  saving,
  draft,
  onDraft,
  onSave,
  onOpen,
  onCollapse,
}: RowProps) {
  const [commentOpen, setCommentOpen] = useState(false);
  const verdictRows = verdictItems(step);
  const isVerdict = verdictRows.length > 0;
  const status = savedStatus(sheet, step);
  const savedVerdicts = sheet.results.verdicts[String(step.n)] ?? {};
  const savedAt = savedAtOf(sheet, step);
  const ready =
    draft.comments.trim() !== '' || Object.values(draft.verdicts).some((v) => v.verdict !== null);
  const hasComment =
    draft.comments.trim() !== '' ||
    Object.values(draft.verdicts).some((v) => v.notes.trim() !== '');
  const setVerdict = (item: string, patch: Partial<{ verdict: Verdict; notes: string }>) =>
    onDraft({
      ...draft,
      verdicts: {
        ...draft.verdicts,
        [item]: {
          verdict: draft.verdicts[item]?.verdict ?? null,
          notes: draft.verdicts[item]?.notes ?? '',
          ...patch,
        },
      },
    });
  const statusBtn = (s: StepStatus, text: string, tip: string, on: string) => (
    <button
      type="button"
      disabled={saving}
      aria-pressed={status === s}
      aria-label={s === 'done' ? 'Done' : 'Problem'}
      title={tip}
      onClick={() => onSave(s)}
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
          if (isVerdict) {
            if (ready) onSave();
          } else if (status === 'done' || status === 'problem') onSave(status);
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
        {!isVerdict && (
          <>
            {statusBtn('done', '✓', 'Done', 'border-emerald-600 bg-emerald-600 text-white')}
            {statusBtn('problem', '!', 'Problem', 'border-red-600 bg-red-600 text-white')}
          </>
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
            step.from_.map((w) => <StateChip key={w} word={w} help={sheet.state_help[w]} />)
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
            const d = draft.verdicts[sv.item] ?? { verdict: null, notes: '' };
            const prior = savedVerdicts[sv.item];
            return (
              <div
                key={sv.item}
                data-testid="verdict-row"
                className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
              >
                <span className="font-mono font-semibold">{sv.item}</span>
                <span className={clsx('min-w-0', muted)}>
                  passes when: {sv.pass_text ?? '(the Item is gone)'}
                </span>
                <span className="inline-flex gap-1">
                  {VERDICTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={saving}
                      aria-pressed={d.verdict === v}
                      aria-label={`${VERDICT_LABEL[v]} ${sv.item}`}
                      title={VERDICT_HINT[v]}
                      onClick={() => setVerdict(sv.item, { verdict: v })}
                      className={verdictBtn(d.verdict === v)}
                    >
                      {VERDICT_LABEL[v]}
                    </button>
                  ))}
                </span>
                {prior !== undefined && (
                  <span
                    className={clsx('text-[11px] font-semibold', VERDICT_COLOUR[prior.verdict])}
                  >
                    saved: {prior.verdict}
                  </span>
                )}
              </div>
            );
          })}
        {isVerdict && (
          <div className="mt-0.5">
            <button
              type="button"
              disabled={!ready || saving}
              onClick={() => onSave()}
              className="rounded bg-slate-900 px-2 text-[11px] leading-5 font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <span className={clsx('ml-2 text-[11px]', muted)}>Ctrl+Enter saves</span>
          </div>
        )}
        {commentOpen && (
          <div data-testid="comment-panel" className="mt-1 flex flex-col gap-1">
            {isVerdict &&
              verdictRows.map((sv) => (
                <textarea
                  key={sv.item}
                  aria-label={`Notes for ${sv.item}`}
                  placeholder={`Notes for ${sv.item}`}
                  value={draft.verdicts[sv.item]?.notes ?? ''}
                  readOnly={saving}
                  onChange={(e) => setVerdict(sv.item, { notes: e.target.value })}
                  rows={2}
                  className={textarea}
                />
              ))}
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
                  onClick={() => onSave()}
                  className={tiny}
                >
                  Save comment
                </button>
              ) : status === null ? (
                (['done', 'problem'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={saving}
                    onClick={() => onSave(s)}
                    className={tiny}
                  >
                    {s === 'done' ? 'Save as done' : 'Save as problem'}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onSave(status as StepStatus)}
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
}

/** A step folded to one line: saved as done, or all its Items deselected in the picker. */
function FoldedRow({
  step,
  kind,
  sheet,
  onExpand,
  onOpen,
}: {
  step: SheetStep;
  kind: 'done' | 'dim';
  sheet: Sheet;
  onExpand: () => void;
  onOpen: (taskId: string) => void;
}) {
  const savedAt = savedAtOf(sheet, step);
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
        onClick={onExpand}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span className="w-6 shrink-0 text-right font-mono text-[11px]">{step.n}</span>
        {kind === 'done' && (
          <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
            ✓
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
}

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
export function SheetView({ sheet, onOpen, onSaveStep }: SheetViewProps) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<number | null>(null);
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
  const save = async (step: SheetStep, status?: StepStatus) => {
    const d = drafts[step.n] ?? savedDraft(sheet, step);
    const body: Omit<SheetStepBody, 'date' | 'time'> = { comments: d.comments };
    if (verdictItems(step).length > 0) {
      const verdicts: Record<string, { verdict: Verdict; notes: string }> = {};
      for (const [item, v] of Object.entries(d.verdicts))
        if (v.verdict !== null) verdicts[item] = { verdict: v.verdict, notes: v.notes };
      body.verdicts = verdicts;
    } else if (status !== undefined) {
      body.status = status;
    }
    setSaving(step.n);
    try {
      const ok = await onSaveStep(step.n, body);
      if (ok)
        setDrafts((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) !== step.n)),
        );
    } finally {
      setSaving(null);
    }
  };
  const goCurrent = () => {
    const el = document.getElementById(`sheet-step-${current ?? ''}`);
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const toggleOpened = (n: number) =>
    setOpened((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]));
  const dimmed = (step: SheetStep) =>
    step.serves.length > 0 && step.serves.every((s) => deselected.includes(s.item));
  return (
    <div>
      {sheet.check_errors.length > 0 && (
        <div
          role="alert"
          data-testid="sheet-stale"
          className="mb-2 rounded border border-red-500 bg-red-50 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-semibold">
            This sheet no longer matches the Items or the firmware. Ask a Session to fix it, or run
            /sitting-sheet again, before you fly from it.
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
      </div>
      {groups.map((g) => {
        const done = g.steps.filter((s) => isDone(sheet, s)).length;
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
                          onOpen={onOpen}
                        />
                      )}
                    </li>,
                  );
                  prevKey = key;
                }
                const open = opened.includes(step.n);
                const isCur = step.n === current;
                if (dimmed(step) && !open)
                  out.push(
                    <FoldedRow
                      key={step.n}
                      step={step}
                      kind="dim"
                      sheet={sheet}
                      onExpand={() => toggleOpened(step.n)}
                      onOpen={onOpen}
                    />,
                  );
                else if (isDone(sheet, step) && !open && !isCur)
                  out.push(
                    <FoldedRow
                      key={step.n}
                      step={step}
                      kind="done"
                      sheet={sheet}
                      onExpand={() => toggleOpened(step.n)}
                      onOpen={onOpen}
                    />,
                  );
                else
                  out.push(
                    <StepRow
                      key={step.n}
                      step={step}
                      sheet={sheet}
                      current={isCur}
                      saving={saving === step.n}
                      draft={drafts[step.n] ?? savedDraft(sheet, step)}
                      onDraft={(d) => setDrafts((prev) => ({ ...prev, [step.n]: d }))}
                      onSave={(s) => void save(step, s)}
                      onOpen={onOpen}
                      onCollapse={open ? () => toggleOpened(step.n) : null}
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
  );
}
