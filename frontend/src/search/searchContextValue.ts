import { createContext } from 'react';

/**
 * Shared types + the React context object for the global search layer
 * (ADR 0044). Split from the provider so the hooks (useSearch / useFocusRequest)
 * and the provider component live in different files — `react-refresh/
 * only-export-components` requires component files to export only components.
 */

/**
 * A one-shot request to focus a task in the currently-mounted view: reveal it
 * (expand/scroll/pan as appropriate) and open its detail panel. The `nonce`
 * makes a repeat click on the already-selected task re-fire the effect.
 */
export interface FocusRequest {
  taskId: string;
  nonce: number;
}

export interface SearchValue {
  /** Live query text driving both the results menu and the in-view highlight. */
  query: string;
  setQuery: (q: string) => void;
  /** Clear the query (and thus the highlight + results). */
  clear: () => void;
  /** Ids of tasks matching the current query; empty when the query is blank. */
  matchIds: ReadonlySet<string>;
  /** Count of matching tasks — the live "N matches" shown in the toolbar. */
  matchCount: number;
  /** The pending focus request, or null. Views subscribe via `useFocusRequest`. */
  focusRequest: FocusRequest | null;
  /** Ask the active view to reveal + open the detail panel for this task. */
  requestFocus: (taskId: string) => void;
}

export const SearchCtx = createContext<SearchValue | null>(null);
