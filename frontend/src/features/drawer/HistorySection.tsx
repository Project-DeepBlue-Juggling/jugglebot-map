import { useItemHistory } from '../../api/hooks';
import type { HistoryCommit, HistoryDocument } from '../../api/schemas';

const TAG = 'rounded border border-dr-border px-1 text-[10px] text-dr-lo';

function DocumentRow({ doc }: { doc: HistoryDocument }) {
  return (
    <li className="flex min-w-0 items-baseline gap-2 text-[13px]" data-testid="history-document">
      <span className="shrink-0 text-[10px] uppercase text-dr-lo">{doc.kind}</span>
      {doc.url !== null ? (
        <a
          href={doc.url}
          target="_blank"
          rel="noreferrer noopener"
          className="min-w-0 truncate text-dr-link underline-offset-2 hover:underline"
          title={doc.path}
        >
          {doc.title}
        </a>
      ) : (
        <span className="min-w-0 break-all font-mono text-[11px] text-dr-lo">{doc.path}</span>
      )}
      {!doc.exists && <span className={TAG}>missing</span>}
    </li>
  );
}

function CommitRow({ commit }: { commit: HistoryCommit }) {
  return (
    <li className="flex min-w-0 items-baseline gap-2 text-[13px]" data-testid="history-commit">
      <span className="shrink-0 font-mono text-[11px] text-dr-lo" title={commit.sha}>
        {commit.short}
      </span>
      <span className="shrink-0 text-[11px] text-dr-lo">{commit.date.slice(0, 10)}</span>
      <span className="min-w-0 flex-1 truncate" title={commit.subject}>
        {commit.subject}
      </span>
      {commit.logbook_entry !== null && (
        <span className={TAG} title="Logbook-Entry trailer">
          {commit.logbook_entry}
        </span>
      )}
    </li>
  );
}

/** The drawer's History section: documents first, then commits; loads when the drawer opens. */
export function HistorySection({ taskId }: { taskId: string }) {
  const history = useItemHistory(taskId);
  const data = history.data;
  return (
    <section
      className="mt-4 border-t border-dr-border pt-3"
      aria-label="History"
      data-testid="history"
    >
      <h3 className="text-xs font-medium text-dr-lo">History</h3>
      {history.isPending && (
        <div data-testid="history-loading" aria-hidden className="mt-2 flex flex-col gap-1.5">
          <div className="h-3 w-3/4 rounded bg-dr-border opacity-50" />
          <div className="h-3 w-1/2 rounded bg-dr-border opacity-50" />
        </div>
      )}
      {history.isError && (
        <p className="mt-2 text-xs text-dr-lo">History unavailable: {history.error.message}</p>
      )}
      {data !== undefined && data.documents.length === 0 && data.commits.length === 0 && (
        <p className="mt-2 text-xs text-dr-lo">
          {data.head === ''
            ? 'No history yet - this item has not been committed.'
            : 'No commits or documents reference this item.'}
        </p>
      )}
      {data !== undefined && data.documents.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {data.documents.map((d) => (
            <DocumentRow key={d.path} doc={d} />
          ))}
        </ul>
      )}
      {data !== undefined && data.commits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {data.commits.map((c) => (
            <CommitRow key={c.sha} commit={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
