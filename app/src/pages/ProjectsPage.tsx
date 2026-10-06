import { useCallback, useEffect, useRef, useState } from 'react';
import { seedBoard } from '../data/seed';
import { EMPTY_BRIEF } from '../state/useBoardState';
import {
  createProject,
  deleteProject,
  downloadBoard,
  exportFilename,
  listProjects,
  loadBoard,
  parseImportedBoard,
  type ProjectSummary,
} from '../lib/storage';
import { goToProject } from '../lib/route';
import type { BoardDocument } from '../types';
import './ProjectsPage.css';

const DELETE_CONFIRM_MS = 2600;

function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface ProjectsPageProps {
  /** Set when the URL pointed at a project that no longer exists. */
  missingProjectId?: string;
}

export function ProjectsPage({ missingProjectId }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>(listProjects);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const deleteTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Projects — Corkline';
  }, []);

  useEffect(() => () => window.clearTimeout(deleteTimer.current), []);

  // Re-reads localStorage (an external store), so calling it from an effect is intended.
  // eslint-disable-next-line react/set-state-in-effect
  const refresh = useCallback(() => setProjects(listProjects()), []);

  // Re-read after mount: a board we just left writes its last changes while
  // unmounting, which happens after this page's first render.
  useEffect(refresh, [refresh]);

  const create = useCallback((doc: BoardDocument, openPanel: boolean) => {
    const result = createProject(doc);
    if (!result.ok) {
      setError(`Couldn't create the project: ${result.reason}`);
      return;
    }
    goToProject(result.id, openPanel);
  }, []);

  const handleNew = () => create({ version: 1, brief: { ...EMPTY_BRIEF }, nodes: [], edges: [] }, true);
  const handleNewFromExample = () => create(seedBoard(), false);

  const handleDuplicate = (project: ProjectSummary) => {
    const doc = loadBoard(project.id);
    if (!doc) return;
    const copyName = `${project.name || 'Untitled project'} (copy)`;
    const result = createProject({ ...doc, brief: { ...EMPTY_BRIEF, ...doc.brief, name: copyName } });
    if (!result.ok) setError(`Couldn't duplicate the project: ${result.reason}`);
    refresh();
  };

  const handleExport = (project: ProjectSummary) => {
    const doc = loadBoard(project.id);
    if (doc) downloadBoard(doc, exportFilename(project.name));
  };

  const handleDelete = (project: ProjectSummary) => {
    window.clearTimeout(deleteTimer.current);
    if (confirmingDeleteId !== project.id) {
      setConfirmingDeleteId(project.id);
      deleteTimer.current = window.setTimeout(() => setConfirmingDeleteId(null), DELETE_CONFIRM_MS);
      return;
    }
    setConfirmingDeleteId(null);
    deleteProject(project.id);
    refresh();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const doc = parseImportedBoard(await file.text());
      create(doc, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.');
    }
  };

  return (
    <div className="projects-page">
      <header className="projects-page__header">
        <div className="projects-page__brand">
          <span className="projects-page__mark" aria-hidden />
          CORKLINE<span> · projects</span>
        </div>
        <div className="projects-page__actions">
          <button type="button" className="projects-btn" onClick={() => fileInputRef.current?.click()}>
            ⇧ Import
          </button>
          <button type="button" className="projects-btn" onClick={handleNewFromExample}>
            + From example
          </button>
          <button type="button" className="projects-btn projects-btn--primary" onClick={handleNew}>
            + New project
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} hidden />
        </div>
      </header>

      <main className="projects-page__main">
        {missingProjectId && <p className="projects-page__notice">That project doesn&rsquo;t exist anymore.</p>}
        {error && (
          <p className="projects-page__notice projects-page__notice--error">
            {error}{' '}
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </p>
        )}

        {projects.length === 0 ? (
          <div className="projects-empty">
            <p>No projects yet.</p>
            <button type="button" className="projects-btn projects-btn--primary" onClick={handleNew}>
              + New project
            </button>
          </div>
        ) : (
          <ul className="projects-grid">
            {projects.map((p) => (
              <li key={p.id} className={`project-tile${p.broken ? ' is-broken' : ''}`}>
                <button
                  type="button"
                  className="project-tile__open"
                  onClick={() => goToProject(p.id)}
                  disabled={p.broken}
                >
                  <span className="project-tile__name">{p.name || 'Untitled project'}</span>
                  <span className="project-tile__desc">
                    {p.broken ? 'This project’s data could not be read.' : p.description || 'No description yet.'}
                  </span>
                  <span className="project-tile__meta">
                    {p.cardCount} {p.cardCount === 1 ? 'card' : 'cards'} · edited {timeAgo(p.updatedAt)}
                  </span>
                </button>
                <div className="project-tile__actions">
                  {!p.broken && (
                    <>
                      <button type="button" onClick={() => handleDuplicate(p)}>
                        Duplicate
                      </button>
                      <button type="button" onClick={() => handleExport(p)}>
                        Export
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`project-tile__delete${confirmingDeleteId === p.id ? ' is-confirming' : ''}`}
                    onClick={() => handleDelete(p)}
                  >
                    {confirmingDeleteId === p.id ? 'Click again to delete' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="projects-page__footnote">
          Projects are saved in this browser only. Use Export to back one up or move it to another computer.
        </p>
      </main>
    </div>
  );
}
