import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useNightly, useNightlyReport } from '../../api/hooks';
import type { NightlyStatus } from '../../api/schemas';
import Markdown from '../../ui/Markdown';

const DOT: Record<NightlyStatus['state'], string> = {
  GREEN: '#16a34a',
  RED: '#dc2626',
  DEFERRED: '#94a3b8',
  STALE: '#d97706',
  NEVER: '#94a3b8',
};

/** The chip's words for a status; null = draw nothing. */
function nightlyLabel(s: NightlyStatus): string | null {
  switch (s.state) {
    case 'GREEN':
      return 'nightly green';
    case 'RED':
      return 'nightly RED';
    case 'DEFERRED':
      return 'nightly deferred';
    case 'STALE':
      return s.age_days === null ? 'nightly stale' : `nightly stale (${s.age_days} d)`;
    case 'NEVER':
      return s.configured ? 'no nightly' : null;
  }
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const report = useNightlyReport(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const missing = report.error instanceof ApiError && report.error.status === 404;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nightly-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-lg dark:bg-slate-800 dark:text-slate-100">
        <header className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 id="nightly-heading" className="text-lg font-semibold">
            Nightly report
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close nightly report"
            className="rounded px-2 text-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            ×
          </button>
        </header>
        <div className="overflow-auto px-5 pb-5 text-sm">
          {report.isPending && <p className="text-slate-500">Loading…</p>}
          {missing && <p className="text-slate-500">No report.</p>}
          {report.isError && !missing && (
            <p className="text-slate-500">Report unavailable: {report.error.message}</p>
          )}
          {report.data !== undefined && <Markdown source={report.data} />}
        </div>
      </div>
    </div>
  );
}

/** The nightly run's status in the top bar, right-aligned; click opens the latest report. */
export function NightlyChip() {
  const nightly = useNightly();
  const [open, setOpen] = useState(false);
  const status = nightly.data;
  if (status === undefined) return null;
  const label = nightlyLabel(status);
  if (label === null) return null;
  return (
    <>
      <button
        type="button"
        data-testid="nightly-chip"
        data-state={status.state}
        title={status.line}
        onClick={() => setOpen(true)}
        className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <i
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: DOT[status.state] }}
        />
        {label}
      </button>
      {open && <ReportModal onClose={() => setOpen(false)} />}
    </>
  );
}
