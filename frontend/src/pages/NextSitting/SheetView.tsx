import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  VERDICTS,
  type Sheet,
  type SheetServe,
  type SheetStep,
  type SheetStepBody,
  type Verdict,
} from '../../api/schemas';
import { KindPill } from '../../ui/ShortId';
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
  status: 'done' | 'problem' | null;
  comments: string;
  verdicts: Record<string, { verdict: Verdict | null; notes: string }>;
}

const label = 'text-xs font-semibold uppercase text-slate-500 dark:text-slate-400';
const KIND_CHIP: Record<string, string> = {
  setup: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  run: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  restore: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};
const toggle = (on: boolean) =>
  clsx(
    'rounded border px-3 py-1 text-sm disabled:opacity-60',
    on
      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
      : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
  );

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
      className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  );
}

function savedDraft(sheet: Sheet, step: SheetStep): Draft {
  const saved = sheet.results.steps[String(step.n)];
  const verdicts = sheet.results.verdicts[String(step.n)] ?? {};
  const out: Draft = {
    status: saved?.status === 'done' || saved?.status === 'problem' ? saved.status : null,
    comments: saved?.comments ?? '',
    verdicts: {},
  };
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

function ServeLine({ sv, onOpen }: { sv: SheetServe; onOpen: (taskId: string) => void }) {
  const id = sv.task_id;
  return (
    <span className="inline-flex items-baseline gap-1 text-sm">
      {sv.kind != null && <KindPill kind={sv.kind} />}
      {id !== null ? (
        <button
          type="button"
          onClick={() => onOpen(id)}
          className="font-mono text-sky-700 hover:underline dark:text-sky-400"
        >
          {sv.item}
        </button>
      ) : (
        <span className="font-mono text-slate-500">{sv.item}</span>
      )}
      <span className="text-xs text-slate-500 dark:text-slate-400">{sv.priority || 'unrated'}</span>
    </span>
  );
}

interface CardProps {
  step: SheetStep;
  sheet: Sheet;
  current: boolean;
  saving: boolean;
  draft: Draft;
  onDraft: (d: Draft) => void;
  onSave: () => void;
  onOpen: (taskId: string) => void;
}

function StepCard({ step, sheet, current, saving, draft, onDraft, onSave, onOpen }: CardProps) {
  const verdictRows = step.serves.filter((s) => s.verdict);
  const savedStep = sheet.results.steps[String(step.n)];
  const savedVerdicts = sheet.results.verdicts[String(step.n)] ?? {};
  const savedAt = [savedStep?.saved_at, ...Object.values(savedVerdicts).map((v) => v.saved_at)]
    .filter((s): s is string => s !== undefined)
    .sort()
    .pop();
  const ready =
    verdictRows.length > 0
      ? draft.comments.trim() !== '' ||
        Object.values(draft.verdicts).some((v) => v.verdict !== null)
      : draft.status !== null;
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
  return (
    <li
      id={`sheet-step-${step.n}`}
      data-testid="sheet-step"
      data-current={current ? 'true' : undefined}
      data-optional={step.optional ? 'true' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (ready && !saving) onSave();
        }
      }}
      className={clsx(
        'rounded-lg border bg-white p-4 dark:bg-slate-800',
        current
          ? 'border-sky-500 ring-2 ring-sky-400 dark:border-sky-400'
          : 'border-slate-200 dark:border-slate-700',
        step.optional && 'opacity-60',
      )}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">Step {step.n}</span>
        <span
          className={clsx(
            'rounded px-1.5 py-px text-[11px] font-medium',
            KIND_CHIP[step.kind] ?? 'bg-slate-100 text-slate-700',
          )}
        >
          {step.kind}
        </span>
        <span className="text-base font-semibold">{step.title}</span>
        {step.optional && (
          <span className="rounded border border-slate-400 px-1.5 py-px text-[11px] text-slate-600 dark:text-slate-300">
            optional
          </span>
        )}
        {current && (
          <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">current</span>
        )}
      </div>
      {step.serves.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {step.serves.map((sv) => (
            <ServeLine key={sv.item} sv={sv} onOpen={onOpen} />
          ))}
        </div>
      )}
      {step.new_launch === true && (
        <div className="mb-2 rounded border border-violet-500 bg-violet-100 px-2 py-1 text-sm font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-200">
          New launch: a fresh ROS2 launch starts here
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1 text-sm">
        <span className={label}>Start state</span>
        {step.from_.length === 0 ? (
          <span className="rounded bg-slate-100 px-1.5 text-xs dark:bg-slate-700">Launch down</span>
        ) : (
          step.from_.map((w) => (
            <span key={w} className="rounded bg-slate-100 px-1.5 text-xs dark:bg-slate-700">
              {w}
            </span>
          ))
        )}
      </div>
      <ol className="mb-3 flex flex-col gap-2">
        {step.actions.map((a, i) => (
          <li key={i} className="text-sm">
            <span className="mr-2 rounded bg-slate-200 px-1.5 py-px text-[11px] font-medium dark:bg-slate-700">
              {a.where}
            </span>
            {a.text != null && a.text !== '' && <span>{a.text}</span>}
            {a.command != null && a.command !== '' && (
              <div className="mt-1 flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-900">
                  {a.command}
                </pre>
                <CopyButton text={a.command} />
              </div>
            )}
          </li>
        ))}
      </ol>
      <dl className="mb-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className={label}>See</dt>
        <dd>{step.see}</dd>
        <dt className={clsx(label, 'text-red-700 dark:text-red-400')}>Stop if</dt>
        <dd className="rounded border border-red-500 bg-red-50 px-2 py-0.5 font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
          {step.stop_if}
        </dd>
        {step.record != null && step.record !== '' && (
          <>
            <dt className={label}>Record</dt>
            <dd>{step.record}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-col gap-2">
        {verdictRows.length > 0 ? (
          verdictRows.map((sv) => {
            const d = draft.verdicts[sv.item] ?? { verdict: null, notes: '' };
            const prior = savedVerdicts[sv.item];
            return (
              <div
                key={sv.item}
                data-testid="verdict-row"
                className="flex flex-col gap-1 rounded border border-slate-200 p-2 dark:border-slate-700"
              >
                <div className="text-sm">
                  <span className="font-mono font-semibold">{sv.item}</span> passes when:{' '}
                  {sv.pass_text ?? '(the Item is gone)'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {VERDICTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={saving}
                      aria-pressed={d.verdict === v}
                      aria-label={`${VERDICT_LABEL[v]} ${sv.item}`}
                      title={VERDICT_HINT[v]}
                      onClick={() => setVerdict(sv.item, { verdict: v })}
                      className={toggle(d.verdict === v)}
                    >
                      {VERDICT_LABEL[v]}
                    </button>
                  ))}
                  {prior !== undefined && (
                    <span
                      className={clsx(
                        'self-center text-sm font-semibold',
                        VERDICT_COLOUR[prior.verdict],
                      )}
                    >
                      saved: {prior.verdict}
                    </span>
                  )}
                </div>
                <textarea
                  aria-label={`Notes for ${sv.item}`}
                  value={d.notes}
                  readOnly={saving}
                  onChange={(e) => setVerdict(sv.item, { notes: e.target.value })}
                  rows={2}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </div>
            );
          })
        ) : (
          <div className="flex flex-wrap gap-2">
            {(['done', 'problem'] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={saving}
                aria-pressed={draft.status === s}
                onClick={() => onDraft({ ...draft, status: s })}
                className={toggle(draft.status === s)}
              >
                {s === 'done' ? 'Done' : 'Problem'}
              </button>
            ))}
          </div>
        )}
        <textarea
          aria-label={`Comments for step ${step.n}`}
          placeholder="Comments"
          value={draft.comments}
          readOnly={saving}
          onChange={(e) => onDraft({ ...draft, comments: e.target.value })}
          rows={2}
          className="w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!ready || saving}
            onClick={onSave}
            className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">Ctrl+Enter saves</span>
          {savedAt !== undefined && (
            <span
              data-testid="saved-at"
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400"
            >
              Saved {savedAt}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** One Sitting sheet: its steps in order, boxes per step, drafts keyed by step number. */
export function SheetView({ sheet, onOpen, onSaveStep }: SheetViewProps) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const lastSaved = useMemo(() => {
    const ns = [...Object.keys(sheet.results.steps), ...Object.keys(sheet.results.verdicts)].map(
      Number,
    );
    return ns.length === 0 ? 0 : Math.max(...ns);
  }, [sheet.results]);
  const current = sheet.steps.find((s) => s.n > lastSaved)?.n ?? null;
  const save = async (step: SheetStep) => {
    const d = drafts[step.n] ?? savedDraft(sheet, step);
    const verdictRows = step.serves.filter((s) => s.verdict);
    const body: Omit<SheetStepBody, 'date' | 'time'> = { comments: d.comments };
    if (verdictRows.length > 0) {
      const verdicts: Record<string, { verdict: Verdict; notes: string }> = {};
      for (const [item, v] of Object.entries(d.verdicts))
        if (v.verdict !== null) verdicts[item] = { verdict: v.verdict, notes: v.notes };
      body.verdicts = verdicts;
    } else if (d.status !== null) {
      body.status = d.status;
    }
    setSaving(step.n);
    try {
      const ok = await onSaveStep(step.n, body);
      if (ok)
        setDrafts((prev) => {
          return Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) !== step.n));
        });
    } finally {
      setSaving(null);
    }
  };
  const goCurrent = () => {
    const el = document.getElementById(`sheet-step-${current ?? ''}`);
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  return (
    <div>
      <ol ref={listRef} className="flex flex-col gap-4">
        {sheet.steps.map((step) => (
          <StepCard
            key={step.n}
            step={step}
            sheet={sheet}
            current={step.n === current}
            saving={saving === step.n}
            draft={drafts[step.n] ?? savedDraft(sheet, step)}
            onDraft={(d) => setDrafts((prev) => ({ ...prev, [step.n]: d }))}
            onSave={() => void save(step)}
            onOpen={onOpen}
          />
        ))}
      </ol>
      <div className="sticky bottom-0 mt-4 flex justify-center bg-gradient-to-t from-white to-transparent py-2 dark:from-slate-900">
        {current !== null ? (
          <button
            type="button"
            onClick={goCurrent}
            className="rounded-full bg-sky-700 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-sky-600"
          >
            Go to current step {current} of {sheet.steps.length}
          </button>
        ) : (
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            All {sheet.steps.length} steps saved
          </span>
        )}
      </div>
    </div>
  );
}
