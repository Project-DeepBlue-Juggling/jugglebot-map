import FrontPage from '../../pages/FrontPage';
import DonePage from '../../pages/Done';
import DictionaryPage from '../../pages/Dictionary';
import NowNextLaterPage from '../../pages/NowNextLaterPage';
import NightShiftPage from '../../pages/NightShift';
import NextSittingPage from '../../pages/NextSitting';
import { useOpenItem } from './drawerContext';

/** Route elements: each page gets the shared drawer's opener as `onOpen`. */
export function FrontRoute() {
  return <FrontPage onOpen={useOpenItem()} />;
}

export function NowRoute() {
  return <NowNextLaterPage onOpen={useOpenItem()} />;
}

export function DictionaryRoute() {
  return <DictionaryPage />;
}

export function DoneRoute() {
  return <DonePage onOpen={useOpenItem()} />;
}

export function NightShiftRoute() {
  return <NightShiftPage onOpen={useOpenItem()} />;
}

export function NextSittingRoute() {
  return <NextSittingPage onOpen={useOpenItem()} />;
}
