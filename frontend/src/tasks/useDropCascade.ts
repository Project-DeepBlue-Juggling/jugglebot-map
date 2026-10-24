import { useContext } from 'react';
import { DropCascadeContext } from './dropCascadeContext';

/**
 * ADR 0075: access the drop-cascade confirm. Outside a `DropCascadeProvider`
 * it resolves `'only'`, so a drop gesture in a component rendered without the
 * provider still drops the one task and never touches its children.
 */
export function useDropCascade() {
  return useContext(DropCascadeContext);
}
