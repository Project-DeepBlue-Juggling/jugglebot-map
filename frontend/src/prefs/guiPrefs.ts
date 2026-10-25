/**
 * GUI -> map preferences (theme + font size).
 *
 * The Jugglebot GUI frames this app in its Map tab and posts
 * `{type: 'jugglebot-gui-prefs', theme: 'dark' | 'light', fontSize: 10..22}`
 * to the iframe on load and on every change. We accept a message only from the
 * same hostname (any port), validate it, persist it (`jugglebot-gui-prefs`) so
 * a reloaded iframe keeps it, and publish it through a tiny external store.
 *
 * PRECEDENCE RULE (one rule): while a GUI pref exists (received or persisted),
 * its theme wins over the signed-in user's stored `dark_mode`; with no GUI pref
 * (the app opened standalone) the user's `dark_mode` applies as before.
 *
 * Font size is applied as CSS `zoom = fontSize / 14` on `#root` (the UI is sized
 * in px, so a root font-size change would not scale it). `--app-zoom` is set on
 * <html> and `#root` is sized `100% / --app-zoom` in index.css so the layout
 * still fills the viewport exactly.
 */
export type GuiTheme = 'dark' | 'light';
export interface GuiPrefs {
  theme: GuiTheme;
  fontSize: number;
}

export const GUI_PREFS_KEY = 'jugglebot-gui-prefs';
export const MESSAGE_TYPE = 'jugglebot-gui-prefs';
export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 22;

/** Validate untrusted data into prefs, or null when it is not a valid prefs message. */
export function parsePrefs(data: unknown): GuiPrefs | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.theme !== 'dark' && d.theme !== 'light') return null;
  const raw = d.fontSize;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) return null;
  const fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, raw));
  return { theme: d.theme, fontSize };
}

/** True when the message origin is the same hostname as this page (any port). */
export function isSameHostname(origin: string, hostname: string = window.location.hostname): boolean {
  try {
    return new URL(origin).hostname === hostname;
  } catch {
    return false;
  }
}

export function loadPrefs(): GuiPrefs | null {
  try {
    const raw = window.localStorage.getItem(GUI_PREFS_KEY);
    return raw === null ? null : parsePrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

function savePrefs(p: GuiPrefs): void {
  try {
    window.localStorage.setItem(GUI_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode / storage blocked: the pref still applies for this page load */
  }
}

let current: GuiPrefs | null = loadPrefs();
const listeners = new Set<() => void>();

export function getPrefs(): GuiPrefs | null {
  return current;
}

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Apply the zoom variable. The theme class is applied by ThemeProvider (it owns precedence). */
export function applyZoom(p: GuiPrefs | null): void {
  const scale = (p?.fontSize ?? DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE;
  document.documentElement.style.setProperty('--app-zoom', String(scale));
}

/** Handle one window `message` event; returns true when it was accepted. */
export function handleMessage(event: { origin: string; data: unknown }): boolean {
  if (!isSameHostname(event.origin)) return false;
  const d = event.data as { type?: unknown } | null;
  if (typeof d !== 'object' || d === null || d.type !== MESSAGE_TYPE) return false;
  const p = parsePrefs(d);
  if (p === null) return false;
  current = p;
  savePrefs(p);
  applyZoom(p);
  listeners.forEach((l) => l());
  return true;
}

/** Test seam: forget the in-memory prefs (does not touch storage). */
export function resetPrefsForTest(p: GuiPrefs | null = null): void {
  current = p;
  applyZoom(p);
  listeners.forEach((l) => l());
}
