// PROTOTYPE (branch prototype/nnl-relayout, never merged): Now / Next / Later re-layout
// variants on the real /now route, switchable with ?variant=, owner scores them.
// "Four structurally different Now / Next / Later layouts that show every Pathway at
// once at 1500x900, no scrolling, rail never covered." Z = the current page.
import type { ComponentType } from 'react';
import { PrototypeSwitcher, usePrototypeVariant } from '../../../ui/PrototypeSwitcher';
import { NowNextLaterView, type NowNextLaterViewProps } from '../NowNextLaterView';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';
import { VariantD } from './VariantD';
import { VariantE } from './VariantE';
import { VariantF } from './VariantF';
import { VariantG } from './VariantG';

const VARIANTS: ReadonlyArray<readonly [string, string, ComponentType<NowNextLaterViewProps>]> = [
  ['A', 'Horizon strips', VariantA],
  ['B', 'Slim metro', VariantB],
  ['C', 'Tiles with a horizon row', VariantC],
  ['D', 'Count matrix', VariantD],
  ['E', 'Metro + ledger', VariantE],
  ['F', 'Kind grid', VariantF],
  ['G', 'Plan tracks', VariantG],
  ['Z', 'Current page', NowNextLaterView],
];

// Round 2 (critic-reviewed) cycles in the bar, G first; A-D and F stay reachable by URL.
const CYCLE = ['G', 'E', 'B', 'Z'];

export function PrototypeNowNextLater(props: NowNextLaterViewProps) {
  const v = usePrototypeVariant([...CYCLE, ...VARIANTS.map(([k]) => k).filter((k) => !CYCLE.includes(k))]);
  const Comp = (VARIANTS.find(([k]) => k === v) ?? VARIANTS[0])[2];
  return (
    <>
      <Comp {...props} />
      <PrototypeSwitcher
        variants={CYCLE.map((k) => [k, (VARIANTS.find(([x]) => x === k) ?? VARIANTS[0])[1]] as const)}
        current={v}
      />
    </>
  );
}
