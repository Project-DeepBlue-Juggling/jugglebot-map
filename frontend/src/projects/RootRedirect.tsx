import { Navigate } from 'react-router-dom';
import { useProjects } from '../api/hooks';

/** The bare `/` route: go to the one project's front page. */
export default function RootRedirect() {
  const { data: projects, isLoading } = useProjects();

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
  return <Navigate to={`/projects/${first.id}`} replace />;
}
