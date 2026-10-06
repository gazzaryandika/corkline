import { useEffect, useState } from 'react';

/**
 * Tiny hash router — enough for two screens without a routing library:
 *   #/                     → projects page
 *   #/project/<id>         → that project's board
 *   #/project/<id>/new     → same, but opens the Project panel (just-created project)
 */
export type Route = { page: 'projects' } | { page: 'board'; projectId: string; isNew: boolean };

function parse(hash: string): Route {
  const match = hash.match(/^#\/project\/([^/]+)(\/new)?$/);
  return match ? { page: 'board', projectId: decodeURIComponent(match[1]), isNew: !!match[2] } : { page: 'projects' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function goToProjects(): void {
  window.location.hash = '#/';
}

export function goToProject(projectId: string, isNew = false): void {
  window.location.hash = `#/project/${encodeURIComponent(projectId)}${isNew ? '/new' : ''}`;
}

/** Drops the "/new" marker without adding a history entry, so Back doesn't reopen the panel. */
export function clearNewMarker(projectId: string): void {
  window.history.replaceState(null, '', `#/project/${encodeURIComponent(projectId)}`);
}
