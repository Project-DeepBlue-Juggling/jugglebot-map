import type { CSSProperties } from 'react';
import { useDrawer } from '../../features/drawer/drawerContext';
import { NNL } from '../../theme/nnl';

/** The id of the item open in the drawer (null when closed). */
export function useOpenId(): string | null {
  return useDrawer()?.openId ?? null;
}

/** The selected-item ring: a thin neutral outline on whatever mark or line is open in the drawer. */
export const SELECTED: CSSProperties = { boxShadow: `0 0 0 1px ${NNL.textHi}` };
