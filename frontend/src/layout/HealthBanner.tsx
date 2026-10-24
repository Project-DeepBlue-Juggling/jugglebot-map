import { useState } from 'react';
import { useHealth } from '../api/hooks';

const RED = 'bg-red-600 text-white';
const AMBER = 'bg-amber-400 text-slate-900';

/** Top-of-shell bar: server banner (error/warning) and files that failed to parse. */
export function HealthBanner() {
  const { data } = useHealth();
  const [open, setOpen] = useState(false);
  if (data === undefined) return null;
  const { banner, errors } = data;
  return (
    <>
      {banner.level !== null && (
        <div
          role="alert"
          data-testid="health-banner"
          className={`px-4 py-2 text-sm ${banner.level === 'error' ? RED : AMBER}`}
        >
          {banner.message}
        </div>
      )}
      {errors.length > 0 && (
        <div className={`px-4 py-2 text-sm ${AMBER}`}>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {errors.length} file(s) failed to parse
          </button>
          {open && (
            <ul className="mt-1 list-disc pl-5">
              {errors.map((e) => (
                <li key={e.path}>
                  {e.path}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
