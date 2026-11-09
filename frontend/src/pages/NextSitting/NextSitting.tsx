import { useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useRunbook,
  useSaveSheetStep,
  useSaveSittingResult,
  useSheet,
  useSheets,
} from '../../api/hooks';
import { useToast } from '../../ui/useToast';
import { NextSittingView } from './NextSittingView';
import { SheetView } from './SheetView';
import { localTime, localToday } from './today';

const noop = () => {};

export interface NextSittingProps {
  /** Opens the shared drawer for a task (the shell wires the drawer). */
  onOpen?: (taskId: string) => void;
}

/**
 * The Next Sitting route: the newest Sitting sheet to step through, with "All Items" (the
 * per-Item Runbook) behind a toggle. With no sheet at all it says so and shows the Runbook.
 */
export default function NextSitting({ onOpen = noop }: NextSittingProps) {
  const sheets = useSheets();
  const [picked, setPicked] = useState<string | null>(null);
  const [allItems, setAllItems] = useState(false);
  const list = sheets.data?.sheets ?? [];
  const name =
    picked !== null && list.some((s) => s.name === picked) ? picked : (list[0]?.name ?? null);
  const sheet = useSheet(name);
  const saveStep = useSaveSheetStep();
  const toast = useToast();
  if (sheets.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load Next Sitting.</div>;
  }
  if (sheets.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading Next Sitting…</div>;
  }
  if (list.length === 0) {
    return (
      <div className="h-full overflow-auto">
        <p className="px-6 pt-6 text-sm text-slate-500 dark:text-slate-400">
          No sheet yet: run /sitting-sheet &lt;rig&gt; in a Claude Session. The per-Item view is
          below.
        </p>
        <RunbookPage onOpen={onOpen} />
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
        <h1 className="text-xl font-semibold">Next Sitting</h1>
        {list.length > 1 && (
          <select
            aria-label="Sheet"
            value={name ?? ''}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            {list.map((s) => (
              <option key={s.name} value={s.name}>
                {s.date} · {s.rig} ({s.saved}/{s.steps})
              </option>
            ))}
          </select>
        )}
        {name !== null && list.length === 1 && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {list[0]?.date} · {list[0]?.rig}
          </span>
        )}
        <button
          type="button"
          aria-pressed={allItems}
          onClick={() => setAllItems(!allItems)}
          className="ml-auto text-sm text-slate-600 underline dark:text-slate-300"
        >
          {allItems ? 'Back to the sheet' : 'All Items'}
        </button>
      </div>
      {allItems ? (
        <RunbookPage onOpen={onOpen} />
      ) : sheet.error !== null ? (
        <div className="p-6 text-red-600 dark:text-red-400">Could not load the sheet.</div>
      ) : sheet.data === undefined ? (
        <div className="p-6 text-slate-500 dark:text-slate-400">Loading the sheet…</div>
      ) : (
        <div className="p-6">
          <SheetView
            key={sheet.data.name}
            sheet={sheet.data}
            onOpen={onOpen}
            onSaveStep={async (n, body) => {
              try {
                await saveStep.mutateAsync({
                  name: sheet.data.name,
                  n,
                  body: { ...body, date: localToday(), time: localTime() },
                });
                toast.success(`Step ${n} saved`);
                return true;
              } catch (err) {
                toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
                return false;
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The per-Item Runbook: loads it and saves a row's result with the save date and time. */
function RunbookPage({ onOpen }: { onOpen: (taskId: string) => void }) {
  const runbook = useRunbook();
  const save = useSaveSittingResult();
  const toast = useToast();
  if (runbook.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load Next Sitting.</div>;
  }
  if (runbook.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading Next Sitting…</div>;
  }
  return (
    <NextSittingView
      runbook={runbook.data}
      onOpen={onOpen}
      onSave={async (id, verdict, notes) => {
        try {
          await save.mutateAsync({ id, date: localToday(), time: localTime(), verdict, notes });
          toast.success('Result saved');
        } catch (err) {
          toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
        }
      }}
    />
  );
}
