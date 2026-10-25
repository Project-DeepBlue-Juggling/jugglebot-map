import { Navigate, useLocation } from 'react-router-dom';
import { useProjects } from '../api/hooks';

/** Project pages a bare path may name (`/now?item=JB-5`). */
const PAGES = ['/now', '/done', '/dictionary'];

/**
 * The bare `/` route and every unmatched path: go to the one project, keeping a
 * page name (`/now`, `/done`, `/dictionary`) and the query, so a shared
 * `/now?item=JB-5` still opens that drawer; any other path lands on the front page.
 */
export default function RootRedirect() {
  const { data: projects, isLoading } = useProjects();
  const location = useLocation();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-slate-500">Loading…</div>;
  }

  const first = projects?.[0];
  if (first === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        The server has no project.
      </div>
    );
  }
  const path = location.pathname.replace(/\/+$/, '');
  const page = PAGES.includes(path) ? path : '';
  return <Navigate to={`/projects/${first.id}${page}${location.search}${location.hash}`} replace />;
}
