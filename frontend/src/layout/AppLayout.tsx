import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ApiError } from '../api/client';
import { useEventStream } from '../api/eventStream';
import { HealthBanner } from './HealthBanner';
import { useCurrentUser, usePatchSelf, useProjects } from '../api/hooks';
import type { DarkMode } from '../api/schemas';
import { useAuth } from '../auth/useAuth';
import { hasModifier, isShortcutTarget } from '../ui/keyboard';
import { KeyboardShortcutsDialog } from '../ui/KeyboardShortcutsDialog';
import { PalettePicker } from '../ui/PalettePicker';
import { useToast } from '../ui/useToast';

const DARK_MODE_OPTIONS: { value: DarkMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return clsx(
    'rounded px-3 py-2 text-sm',
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  useEventStream();
  const location = useLocation();
  const { data: projects } = useProjects();
  const { data: currentUser } = useCurrentUser();
  // The server has exactly one project; the nav links point at it.
  const fromPath = location.pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const projectId = fromPath ?? projects?.[0]?.id ?? null;

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Plain `s` toggles the keyboard cheat-sheet.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isShortcutTarget() || hasModifier(e)) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Click-outside / Escape closes the profile popover.
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target === null) return;
      if (profileRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <HealthBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <aside className="flex w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-6 flex shrink-0 items-center justify-between px-2">
            <div className="text-lg font-semibold">Jugglebot map</div>
          </div>
          <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {projectId !== null && (
              <>
                <NavLink to={`/projects/${projectId}`} end className={navClass}>
                  Front page
                </NavLink>
                <NavLink to={`/projects/${projectId}/now`} className={navClass}>
                  Now / Next / Later
                </NavLink>
              </>
            )}
          </nav>

          <div className="relative shrink-0 border-t border-slate-200 pt-3 dark:border-slate-700">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={profileOpen}
              aria-label="Open profile preferences"
              className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: currentUser?.color ?? '#64748b' }}
              >
                {(currentUser?.display_name ?? '?').charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Signed in as
                </span>
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {currentUser?.display_name ?? user?.display_name ?? '…'}
                </span>
              </span>
            </button>

            {profileOpen && currentUser !== undefined && (
              <ProfilePopover popoverRef={profileRef} user={currentUser} />
            )}
          </div>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (s)"
            aria-label="Show keyboard shortcuts"
            className="mt-2 flex shrink-0 items-center justify-center gap-2 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              s
            </kbd>
            Keyboard shortcuts
          </button>
        </aside>
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
        <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </div>
  );
}

interface ProfilePopoverProps {
  // React 18 silently drops a `ref` prop on a plain function component
  // (it's reserved for forwardRef). Use a renamed prop so the ref reaches
  // the dialog div and the click-outside check sees interior clicks.
  popoverRef: React.Ref<HTMLDivElement>;
  user: {
    id: string;
    display_name: string;
    email: string;
    color: string;
    dark_mode: DarkMode;
  };
}

function ProfilePopover({ popoverRef, user }: ProfilePopoverProps) {
  const patchSelf = usePatchSelf();
  const toast = useToast();

  const updatePreference = async (body: { color?: string; dark_mode?: DarkMode }) => {
    try {
      await patchSelf.mutateAsync(body);
    } catch (err) {
      toast.error(
        'Could not save preferences',
        err instanceof ApiError ? err.message : String(err),
      );
    }
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Profile preferences"
      className="absolute bottom-full left-0 right-0 mb-2 rounded border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="mb-2 border-b border-slate-200 pb-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <div className="truncate text-slate-700 dark:text-slate-200">{user.email}</div>
      </div>

      <div className="mb-3">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          My colour
        </span>
        <PalettePicker
          value={user.color}
          onChange={(next) => next !== null && void updatePreference({ color: next })}
          disabled={patchSelf.isPending}
          ariaLabel="My colour"
        />
      </div>

      <div>
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Theme
        </span>
        <div role="radiogroup" aria-label="Theme" className="flex gap-1">
          {DARK_MODE_OPTIONS.map((opt) => {
            const selected = user.dark_mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={patchSelf.isPending}
                onClick={() => void updatePreference({ dark_mode: opt.value })}
                className={clsx(
                  'flex-1 rounded border px-2 py-1 text-xs',
                  selected
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
                  patchSelf.isPending && 'opacity-60',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
