// PROTOTYPE (branch prototype/nnl-relayout, never merged): floating variant switcher.
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PROTOTYPE_ON = import.meta.env.VITE_PROTOTYPE === '1';

export function usePrototypeVariant(keys: readonly string[]): string {
  const [params] = useSearchParams();
  const v = (params.get('variant') ?? keys[0]).toUpperCase();
  return keys.includes(v) ? v : keys[0];
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: ReadonlyArray<readonly [string, string]>;
  current: string;
}) {
  const [params, setParams] = useSearchParams();
  const i = Math.max(0, variants.findIndex(([k]) => k === current));
  const go = (d: number) => {
    const next = new URLSearchParams(params);
    next.set('variant', variants[(i + d + variants.length) % variants.length][0]);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.closest('input, textarea, select, [contenteditable="true"]') !== null)) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full bg-fuchsia-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg ring-2 ring-white/40">
      <button type="button" aria-label="previous variant" onClick={() => go(-1)}>◀</button>
      <span>
        PROTOTYPE {variants[i][0]} ({variants[i][1]})
      </span>
      <button type="button" aria-label="next variant" onClick={() => go(1)}>▶</button>
    </div>
  );
}
