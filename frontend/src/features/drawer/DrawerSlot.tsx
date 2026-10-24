import { useDrawer } from './drawerContext';

/**
 * A layout slot. A page puts this in its flex row where the drawer should sit
 * (Now / Next / Later: between the lanes and the inbox rail); while an item is
 * open the drawer renders inside it and takes its width from its neighbours.
 * Empty, it is `hidden`, so it adds neither width nor a flex gap. Pages without
 * a slot get the overlay.
 */
export function DrawerSlot() {
  const ctx = useDrawer();
  if (ctx === null) return null;
  return (
    <div
      ref={ctx.setSlot}
      data-testid="drawer-slot"
      className="flex min-h-0 shrink-0 empty:hidden"
    />
  );
}
