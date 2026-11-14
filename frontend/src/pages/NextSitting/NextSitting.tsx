import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ApiError } from '../../api/client';
import {
  useRunbook,
  useSaveSheetStep,
  useSaveSittingResult,
  useSheet,
  useSheets,
} from '../../api/hooks';
import { useToast } from '../../ui/useToast';
import { groupSheets, rigLabel, rigsWithoutSheet } from './rigs';
import { copyText } from './copyText';
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
  const runbookQuery = useRunbook();
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
  const sheetGroups = groupSheets(list);
  const missing = rigsWithoutSheet(runbookQuery.data, list);
  const picker = (
    <>
      {list.length > 1 && (
        <select
          aria-label="Sheet"
          value={name ?? ''}
          onChange={(e) => setPicked(e.target.value)}
          className="max-w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
        >
          {sheetGroups.map((g) => (
            <optgroup key={g.rig} label={rigLabel(g.rig)}>
              {g.sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.date} · {s.rig} ({s.saved}/{s.steps})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {name !== null && list.length === 1 && (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {list[0]?.date} · {list[0]?.rig}
        </span>
      )}
    </>
  );
  const toggleClass = 'shrink-0 text-sm text-slate-600 underline dark:text-slate-300';
  const allItemsLink = (
    <button
      type="button"
      aria-pressed={false}
      onClick={() => setAllItems(true)}
      className={toggleClass}
    >
      All Items
    </button>
  );
  const backLink = (
    <button
      type="button"
      aria-pressed={true}
      onClick={() => setAllItems(false)}
      className={clsx(toggleClass, 'ml-auto')}
    >
      Back to the sheet
    </button>
  );
  return (
    <div className="h-full overflow-auto">
      {!allItems && (
        <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
          <h1 className="text-xl font-semibold">Next Sitting</h1>
          {picker}
        </div>
      )}
      {!allItems && missing.length > 0 && (
        <ul aria-label="Rigs without a sheet" className="flex flex-col gap-1 px-6 pt-2">
          {missing.map((m) => (
            <NoSheetLine key={m.hardware} hardware={m.hardware} items={m.items} />
          ))}
        </ul>
      )}
      {allItems ? (
        <RunbookPage
          onOpen={onOpen}
          toolbar={
            <>
              {picker}
              {backLink}
            </>
          }
        />
      ) : sheet.error !== null ? (
        <div className="p-6 text-red-600 dark:text-red-400">Could not load the sheet.</div>
      ) : sheet.data === undefined ? (
        <div className="p-6 text-slate-500 dark:text-slate-400">Loading the sheet…</div>
      ) : (
        <div className="p-2 sm:p-4">
          <SheetView
            key={sheet.data.name}
            sheet={sheet.data}
            trailing={allItemsLink}
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
function RunbookPage({
  onOpen,
  toolbar,
}: {
  onOpen: (taskId: string) => void;
  toolbar?: ReactNode;
}) {
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
      toolbar={toolbar}
      onSave={async (id, verdict, notes) => {
        try {
          await save.mutateAsync({ id, date: localToday(), time: localTime(), verdict, notes });
          toast.success('Result saved');
          return true;
        } catch (err) {
          toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
          return false;
        }
      }}
    />
  );
}

/** "Bench leg: 3 Items waiting, no sheet. In a Session: /sitting-sheet bench-leg" with a copy button. */
function NoSheetLine({ hardware, items }: { hardware: string; items: number }) {
  const toast = useToast();
  const command = `/sitting-sheet ${hardware}`;
  return (
    <li
      data-testid="no-sheet-line"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-300"
    >
      <span className="min-w-0">
        {rigLabel(hardware)}: {items} {items === 1 ? 'Item' : 'Items'} waiting, no sheet. In a
        Session: <code className="font-mono break-all">{command}</code>
      </span>
      <button
        type="button"
        aria-label={`Copy ${command}`}
        onClick={async () => {
          if (await copyText(command)) toast.success('Copied');
          else toast.error('Could not copy', command);
        }}
        className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        Copy
      </button>
    </li>
  );
}
