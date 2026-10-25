import FrontPage from '../../pages/FrontPage';
import DictionaryPage from '../../pages/Dictionary';
import NowNextLaterPage from '../../pages/NowNextLaterPage';
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
