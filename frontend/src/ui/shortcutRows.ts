/** The rows of the keyboard cheat-sheet; see KeyboardShortcutsDialog. */
export interface ShortcutRow {
  keys: string[];
  description: string;
}

export const SHORTCUT_ROWS: ShortcutRow[] = [
  { keys: ['n'], description: 'New item (idea, feature or bug)' },
  { keys: ['/'], description: 'Search items, plans and glossary terms' },
  { keys: ['s'], description: 'Show or hide this dialog' },
  { keys: ['Enter'], description: 'Open the focused card, tile or tag in the drawer' },
  { keys: ['e'], description: "Edit the open item's description" },
  { keys: ['Ctrl', 'Enter'], description: 'Save the drawer, or create the new item' },
  { keys: ['Esc'], description: 'Close the frontmost dialog, or the drawer' },
];
