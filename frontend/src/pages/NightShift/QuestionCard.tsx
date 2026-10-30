import { useState } from 'react';
import type { NightShiftQuestion } from '../../api/schemas';
import Markdown from '../../ui/Markdown';

export interface QuestionCardProps {
  question: NightShiftQuestion;
  onOpen: (taskId: string) => void;
  onAnswer: (taskId: string, answer: string) => Promise<void>;
}

/** One open question: the Item it blocks, the question, a textarea and a Save button. */
export function QuestionCard({ question: q, onOpen, onAnswer }: QuestionCardProps) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onAnswer(q.id, text.trim());
    } finally {
      setSaving(false);
    }
  };
  return (
    <li
      data-testid="question-card"
      className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      {q.parent_id !== null && (
        <button
          type="button"
          onClick={() => onOpen(q.parent_id as string)}
          className="mb-1 flex items-center gap-2 text-left text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          <span className="font-mono">{q.parent_short_id ?? 'item'}</span>
          <span>{q.parent_title}</span>
        </button>
      )}
      <h3 className="mb-2 text-sm font-semibold">{q.title}</h3>
      <div className="mb-3 text-sm">
        <Markdown source={q.body} />
      </div>
      <textarea
        aria-label={`Answer to ${q.title}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mb-2 w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
      />
      <button
        type="button"
        disabled={saving || text.trim() === ''}
        onClick={() => void save()}
        className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Save
      </button>
    </li>
  );
}
