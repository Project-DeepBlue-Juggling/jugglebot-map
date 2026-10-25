import type { Glossary, Task } from '../api/schemas';
import { isDone } from './derive';

/**
 * Header search: pure matching over the already-loaded items, plans and
 * glossary. No I/O. Every item kind (plans included) is a `Task`; a glossary
 * term is matched on its name, its definition and its `_Avoid_` words, and an
 * Avoid-word match answers with the preferred term ("toss" finds Throw).
 */

export type SearchGroupKey =
  | 'pathway'
  | 'bug'
  | 'feature'
  | 'idea'
  | 'ticket'
  | 'plan'
  | 'glossary';

/** Display order of the result groups. */
export const SEARCH_GROUPS: readonly { key: SearchGroupKey; label: string }[] = [
  { key: 'pathway', label: 'Pathways' },
  { key: 'bug', label: 'Bugs' },
  { key: 'feature', label: 'Features' },
  { key: 'idea', label: 'Ideas' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'plan', label: 'Plans' },
  { key: 'glossary', label: 'Glossary terms' },
];

export const GROUP_CAP = 8;

/** Lower is better: title prefix, title word, title substring, body. */
export type MatchTier = 0 | 1 | 2 | 3;

export interface SearchHit {
  group: SearchGroupKey;
  /** Task id, or the glossary anchor. */
  id: string;
  title: string;
  /** The item's status; null for a glossary term. */
  status: string | null;
  closed: boolean;
  /** The Avoid word that matched, when the hit is a redirect to the preferred term. */
  avoid: string | null;
  tier: MatchTier;
}

export interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  /** At most `GROUP_CAP` hits, best first. */
  hits: SearchHit[];
  /** Hits beyond the cap. */
  more: number;
}

function tierOf(title: string, q: string): MatchTier | null {
  const t = title.toLowerCase();
  if (t.startsWith(q)) return 0;
  const at = t.indexOf(q);
  if (at === -1) return null;
  // Starts a word anywhere in the title (the character before is not a letter/digit).
  for (let i = at; i !== -1; i = t.indexOf(q, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(t.charAt(i - 1))) return 1;
  }
  return 2;
}

/** Every whitespace-separated token of `q` occurs in `text` (already lower-case). */
function hasAll(text: string, tokens: readonly string[]): boolean {
  return tokens.every((tok) => text.includes(tok));
}

function compare(a: SearchHit, b: SearchHit): number {
  if (a.closed !== b.closed) return a.closed ? 1 : -1;
  if (a.tier !== b.tier) return a.tier - b.tier;
  return a.title.localeCompare(b.title);
}

function taskHit(task: Task, q: string, tokens: readonly string[]): SearchHit | null {
  let tier: MatchTier | null = tierOf(task.title, q);
  if (tier === null && task.slug.toLowerCase().includes(q)) tier = 1;
  if (tier === null && hasAll(`${task.description}\n${task.destination}`.toLowerCase(), tokens)) {
    tier = 3;
  }
  if (tier === null) return null;
  return {
    group: task.kind as SearchGroupKey,
    id: task.id,
    title: task.title,
    status: task.status,
    closed: isDone(task),
    avoid: null,
    tier,
  };
}

const ITEM_GROUPS: ReadonlySet<string> = new Set([
  'pathway',
  'bug',
  'feature',
  'idea',
  'ticket',
  'plan',
]);

/** Search tasks and glossary for `query`; groups in display order, empty groups omitted. */
export function searchMap(
  tasks: readonly Task[],
  glossary: Glossary | undefined,
  query: string,
): SearchGroup[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const tokens = q.split(/\s+/);
  const hits: SearchHit[] = [];
  for (const task of tasks) {
    if (!ITEM_GROUPS.has(task.kind)) continue;
    const hit = taskHit(task, q, tokens);
    if (hit !== null) hits.push(hit);
  }
  for (const cluster of glossary?.clusters ?? []) {
    for (const term of cluster.terms) {
      let tier = tierOf(term.term, q);
      let avoid: string | null = null;
      if (tier === null) {
        const word = term.avoid.find((a) => a.toLowerCase().includes(q));
        if (word !== undefined) {
          tier = 1;
          avoid = word;
        }
      }
      if (tier === null && hasAll(term.definition.toLowerCase(), tokens)) tier = 3;
      if (tier === null) continue;
      hits.push({
        group: 'glossary',
        id: term.anchor,
        title: term.term,
        status: null,
        closed: false,
        avoid,
        tier,
      });
    }
  }
  const out: SearchGroup[] = [];
  for (const { key, label } of SEARCH_GROUPS) {
    const mine = hits.filter((h) => h.group === key).sort(compare);
    if (mine.length === 0) continue;
    out.push({
      key,
      label,
      hits: mine.slice(0, GROUP_CAP),
      more: Math.max(0, mine.length - GROUP_CAP),
    });
  }
  return out;
}
