import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The element's measured `[ref, clientWidth, clientHeight]`, kept current by a
 * ResizeObserver. `watch` names something that moves the element without
 * resizing anything the observer sees first-hand (the drawer docking next to
 * it): when it changes, the size is read again now and on the next frame.
 */
export function useSize<T extends HTMLElement>(watch?: unknown): [React.RefObject<T>, number, number] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const read = () => {
    const el = ref.current;
    if (el === null) return;
    setSize((s) => (s[0] === el.clientWidth && s[1] === el.clientHeight ? s : [el.clientWidth, el.clientHeight]));
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    read();
    if (typeof requestAnimationFrame === 'undefined') return;
    const id = requestAnimationFrame(read);
    return () => cancelAnimationFrame(id);
  }, [watch]);
  return [ref, size[0], size[1]];
}
