import { useGlossary } from '../../api/hooks';
import { DictionaryView } from './DictionaryView';

/** The Dictionary route: loads the glossary (refetched on every `invalidate`). */
export default function Dictionary() {
  const glossary = useGlossary();
  if (glossary.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load the glossary.</div>;
  }
  if (glossary.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading the glossary…</div>;
  }
  return <DictionaryView glossary={glossary.data} />;
}
