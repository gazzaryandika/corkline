import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { seedBoard } from '../data/seed';
import { welcomeBoard } from '../data/welcome';
import { EMPTY_BRIEF } from '../state/useBoardState';
import {
  boardPreview,
  createProject,
  deleteProject,
  downloadBoard,
  duplicateProject,
  exportFilename,
  listProjects,
  loadBoard,
  parseImportedBoard,
  renameProject,
  setProjectStarred,
  type BoardPreview,
  type ProjectSummary,
} from '../lib/storage';
import { goToProject } from '../lib/route';
import type { BoardDocument } from '../types';
import { BoardThumbnail } from './BoardThumbnail';
import './ProjectsPage.css';

const DELETE_CONFIRM_MS = 3000;
const PREFS_KEY = 'corkline-projects-view';

type View = 'home' | 'starred';
type Sort = 'updated' | 'name' | 'created';
type Layout = 'grid' | 'list';

const SORT_LABELS: Record<Sort, string> = { updated: 'Last edited', name: 'Name', created: 'Date created' };

function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function loadPrefs(): { sort: Sort; layout: Layout } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { sort?: string; layout?: string };
    return {
      sort: p.sort === 'name' || p.sort === 'created' ? p.sort : 'updated',
      layout: p.layout === 'list' ? 'list' : 'grid',
    };
  } catch {
    return { sort: 'updated', layout: 'grid' };
  }
}

interface Template {
  id: string;
  title: string;
  description: string;
  preview?: BoardPreview;
  icon?: string;
}

interface ProjectsPageProps {
  /** Set when the URL pointed at a project that no longer exists. */
  missingProjectId?: string;
}

export function ProjectsPage({ missingProjectId }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>(listProjects);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [query, setQuery] = useState('');
  const [{ sort, layout }, setPrefs] = useState(loadPrefs);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const deleteTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const templatesRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = 'Projects — Corkline';
  }, []);

  useEffect(() => () => window.clearTimeout(deleteTimer.current), []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sort, layout }));
    } catch {
      // Remembering the view is a convenience only.
    }
  }, [sort, layout]);

  // Re-reads localStorage (an external store), so calling it from an effect is intended.
  // eslint-disable-next-line react/set-state-in-effect
  const refresh = useCallback(() => setProjects(listProjects()), []);

  // Re-read after mount: a board we just left writes its last changes while
  // unmounting, which happens after this page's first render.
  useEffect(refresh, [refresh]);

  // "/" jumps to search; Escape closes menus and clears an open rename.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        setMenuId(null);
        setConfirmingDeleteId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Open the ⋯ menu upward when it would run off the bottom of the window.
  const [menuUp, setMenuUp] = useState(false);
  useLayoutEffect(() => {
    if (!menuId) return;
    const menu = document.querySelector<HTMLElement>('.project-menu');
    const anchor = menu?.parentElement?.getBoundingClientRect();
    if (!menu || !anchor) return;
    // Measured from the card, so the result doesn't depend on which way it opened before.
    // eslint-disable-next-line react/set-state-in-effect
    setMenuUp(anchor.bottom + menu.offsetHeight + 12 > window.innerHeight && anchor.top > menu.offsetHeight + 12);
  }, [menuId]);

  // Click anywhere else closes an open ⋯ menu.
  useEffect(() => {
    if (!menuId) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.project-menu, .project-card__more')) {
        setMenuId(null);
        setConfirmingDeleteId(null);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuId]);

  const templates: Template[] = useMemo(
    () => [
      { id: 'blank', title: 'Blank board', description: 'Start from an empty canvas', icon: '+' },
      {
        id: 'welcome',
        title: 'Welcome to Corkline',
        description: 'A 2-minute guided tour',
        preview: boardPreview(welcomeBoard()),
      },
      {
        id: 'example',
        title: 'Example: Triodos Kids',
        description: 'A finished project, research to prototype',
        preview: boardPreview(seedBoard()),
      },
      { id: 'import', title: 'Import a board', description: 'Open an exported .json file', icon: '⇧' },
    ],
    [],
  );

  const create = useCallback((doc: BoardDocument, openPanel: boolean) => {
    const result = createProject(doc);
    if (!result.ok) {
      setError(`Couldn't create the project: ${result.reason}`);
      return;
    }
    goToProject(result.id, openPanel);
  }, []);

  const handleTemplate = (id: string) => {
    if (id === 'blank') create({ version: 1, brief: { ...EMPTY_BRIEF }, nodes: [], edges: [] }, true);
    else if (id === 'welcome') create(welcomeBoard(), false);
    else if (id === 'example') create(seedBoard(), false);
    else fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      create(parseImportedBoard(await file.text()), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.');
    }
  };

  const handleDuplicate = (project: ProjectSummary) => {
    setMenuId(null);
    const copyName = `${project.name || 'Untitled project'} (copy)`;
    const result = duplicateProject(project.id, (doc) => ({ ...doc, brief: { ...EMPTY_BRIEF, ...doc.brief, name: copyName } }));
    if (!result.ok) setError(`Couldn't duplicate the project: ${result.reason}`);
    refresh();
  };

  const handleExport = (project: ProjectSummary) => {
    setMenuId(null);
    const doc = loadBoard(project.id);
    if (doc) downloadBoard(doc, exportFilename(project.name));
  };

  const handleStar = (project: ProjectSummary) => {
    const result = setProjectStarred(project.id, !project.starred);
    if (!result.ok) setError(`Couldn't update the project: ${result.reason}`);
    refresh();
  };

  const startRename = (project: ProjectSummary) => {
    setMenuId(null);
    setRenamingId(project.id);
    setRenameDraft(project.name);
  };

  const finishRename = (save: boolean) => {
    if (save && renamingId) {
      const result = renameProject(renamingId, renameDraft.trim());
      if (!result.ok) setError(`Couldn't rename the project: ${result.reason}`);
    }
    setRenamingId(null);
    refresh();
  };

  const handleDelete = (project: ProjectSummary) => {
    window.clearTimeout(deleteTimer.current);
    if (confirmingDeleteId !== project.id) {
      setConfirmingDeleteId(project.id);
      deleteTimer.current = window.setTimeout(() => setConfirmingDeleteId(null), DELETE_CONFIRM_MS);
      return;
    }
    setConfirmingDeleteId(null);
    setMenuId(null);
    deleteProject(project.id);
    refresh();
  };

  const starredCount = projects.filter((p) => p.starred).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter(
      (p) =>
        (view === 'home' || p.starred) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
    const byName = (p: ProjectSummary) => (p.name || 'Untitled project').toLowerCase();
    return [...list].sort((a, b) =>
      sort === 'name' ? byName(a).localeCompare(byName(b)) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt,
    );
  }, [projects, view, query, sort]);

  const goTemplates = () => {
    setView('home');
    window.setTimeout(() => templatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const renderMenu = (p: ProjectSummary) => (
    // Stop clicks reaching the list row underneath, which would open the project.
    <div className={`project-menu${menuUp ? ' opens-up' : ''}`} role="menu" onClick={(e) => e.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => goToProject(p.id)} disabled={p.broken}>
        Open
      </button>
      <button type="button" role="menuitem" onClick={() => startRename(p)} disabled={p.broken}>
        Rename
      </button>
      <button type="button" role="menuitem" onClick={() => handleDuplicate(p)} disabled={p.broken}>
        Duplicate
      </button>
      <button type="button" role="menuitem" onClick={() => handleExport(p)} disabled={p.broken}>
        Export as file
      </button>
      <hr />
      <button
        type="button"
        role="menuitem"
        className={`project-menu__danger${confirmingDeleteId === p.id ? ' is-confirming' : ''}`}
        onClick={() => handleDelete(p)}
      >
        {confirmingDeleteId === p.id ? 'Click again to delete' : 'Delete'}
      </button>
    </div>
  );

  const renderName = (p: ProjectSummary) =>
    renamingId === p.id ? (
      <input
        className="project-rename"
        value={renameDraft}
        placeholder="Untitled project"
        autoFocus
        // Select the whole name, as Finder and Figma do, so typing replaces it.
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setRenameDraft(e.target.value)}
        onBlur={() => finishRename(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finishRename(true);
          if (e.key === 'Escape') {
            e.stopPropagation();
            finishRename(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    ) : (
      <span className={`project-card__name${p.name ? '' : ' is-untitled'}`}>{p.name || 'Untitled project'}</span>
    );

  const meta = (p: ProjectSummary) =>
    p.broken ? 'Couldn’t be read' : `Edited ${timeAgo(p.updatedAt)} · ${p.cardCount} ${p.cardCount === 1 ? 'card' : 'cards'}`;

  const starButton = (p: ProjectSummary) => (
    <button
      type="button"
      className={`project-card__star${p.starred ? ' is-starred' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        handleStar(p);
      }}
      aria-pressed={!!p.starred}
      title={p.starred ? 'Unstar' : 'Star'}
    >
      {p.starred ? '★' : '☆'}
    </button>
  );

  const moreButton = (p: ProjectSummary) => (
    <button
      type="button"
      className="project-card__more"
      aria-haspopup="menu"
      aria-expanded={menuId === p.id}
      onClick={(e) => {
        e.stopPropagation();
        setConfirmingDeleteId(null);
        setMenuId(menuId === p.id ? null : p.id);
      }}
      title="More actions"
    >
      ⋯
    </button>
  );

  const open = (p: ProjectSummary) => {
    if (!p.broken && renamingId !== p.id) goToProject(p.id);
  };

  return (
    <div className="home">
      <aside className="home-side">
        <div className="home-side__brand">
          <span className="home-side__mark" aria-hidden />
          CORKLINE
        </div>
        <nav className="home-side__nav" aria-label="Projects">
          <button type="button" className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}>
            <span aria-hidden>⌂</span> Home <em>{projects.length}</em>
          </button>
          <button type="button" className={view === 'starred' ? 'is-active' : ''} onClick={() => setView('starred')}>
            <span aria-hidden>★</span> Starred <em>{starredCount}</em>
          </button>
          <button type="button" onClick={goTemplates}>
            <span aria-hidden>▦</span> Templates
          </button>
        </nav>
        <p className="home-side__note">
          Projects are saved in this browser only. Use <strong>Export as file</strong> in a project&rsquo;s ⋯ menu to back it up.
        </p>
      </aside>

      <div className="home-main">
        <header className="home-top">
          <div className="home-search">
            <span aria-hidden>⌕</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search projects"
            />
            {!query && <kbd>/</kbd>}
          </div>
          <button type="button" className="home-btn home-btn--primary" onClick={() => handleTemplate('blank')}>
            + New project
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} hidden />
        </header>

        <main className="home-content">
          {missingProjectId && <p className="home-notice">That project doesn&rsquo;t exist anymore.</p>}
          {error && (
            <p className="home-notice home-notice--error">
              {error}{' '}
              <button type="button" onClick={() => setError(null)}>
                Dismiss
              </button>
            </p>
          )}

          {view === 'home' && (
            <>
              <h1 className="home-hello">
                {greeting()}
                <span>Trace how your design decisions are made, from problem to prototype.</span>
              </h1>

              <section className="home-section" ref={templatesRef} aria-labelledby="templates-heading">
                <h2 id="templates-heading">Start something new</h2>
                <div className="template-row">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`template template--${t.id}`}
                      onClick={() => handleTemplate(t.id)}
                      aria-label={`${t.title}: ${t.description}`}
                    >
                      <span className="template__art">
                        {t.preview ? <BoardThumbnail preview={t.preview} /> : <span className="template__icon">{t.icon}</span>}
                      </span>
                      <span className="template__title">{t.title}</span>
                      <span className="template__desc">{t.description}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          <section className="home-section" aria-labelledby="projects-heading">
            <div className="home-section__head">
              <h2 id="projects-heading">{view === 'starred' ? 'Starred' : query ? 'Search results' : 'Recent projects'}</h2>
              <div className="home-controls">
                <label className="home-sort">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setPrefs((p) => ({ ...p, sort: e.target.value as Sort }))}>
                    {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                      <option key={s} value={s}>
                        {SORT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="home-layout" role="radiogroup" aria-label="Layout">
                  {(['grid', 'list'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={layout === l}
                      className={layout === l ? 'is-active' : ''}
                      onClick={() => setPrefs((p) => ({ ...p, layout: l }))}
                      title={l === 'grid' ? 'Grid view' : 'List view'}
                    >
                      {l === 'grid' ? '▦' : '☰'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="home-empty">
                {query ? (
                  <p>No projects match &ldquo;{query}&rdquo;.</p>
                ) : view === 'starred' ? (
                  <p>Star a project with ☆ to keep it here.</p>
                ) : (
                  <>
                    <p className="home-empty__title">No projects yet</p>
                    <p>Start with the guided tour, or open a blank board.</p>
                    <div className="home-empty__actions">
                      <button type="button" className="home-btn" onClick={() => handleTemplate('welcome')}>
                        Take the tour
                      </button>
                      <button type="button" className="home-btn home-btn--primary" onClick={() => handleTemplate('blank')}>
                        + New project
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : layout === 'grid' ? (
              <ul className="project-grid">
                {shown.map((p) => (
                  <li key={p.id} className={`project-card${p.broken ? ' is-broken' : ''}${menuId === p.id ? ' has-menu' : ''}`}>
                    <div
                      className="project-card__thumb"
                      role="button"
                      tabIndex={p.broken ? -1 : 0}
                      onClick={() => open(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') open(p);
                      }}
                      aria-label={`Open ${p.name || 'Untitled project'}`}
                    >
                      <BoardThumbnail preview={p.preview} />
                      {starButton(p)}
                    </div>
                    <div className="project-card__body" onClick={() => open(p)}>
                      <div className="project-card__text">
                        {renderName(p)}
                        <span className="project-card__meta">{meta(p)}</span>
                      </div>
                      {moreButton(p)}
                    </div>
                    {menuId === p.id && renderMenu(p)}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="project-list">
                <li className="project-list__head" aria-hidden>
                  <span />
                  <span>Name</span>
                  <span>Cards</span>
                  <span>Links</span>
                  <span>Edited</span>
                  <span>Created</span>
                  <span />
                </li>
                {shown.map((p) => (
                  <li
                    key={p.id}
                    className={`project-row${p.broken ? ' is-broken' : ''}${menuId === p.id ? ' has-menu' : ''}`}
                    onClick={() => open(p)}
                  >
                    <span className="project-row__thumb">
                      <BoardThumbnail preview={p.preview} emptyLabel="" />
                    </span>
                    <span className="project-row__name">
                      {renderName(p)}
                      {p.description && <span className="project-row__desc">{p.description}</span>}
                    </span>
                    <span>{p.cardCount}</span>
                    <span>{p.linkCount}</span>
                    <span>{timeAgo(p.updatedAt)}</span>
                    <span>{timeAgo(p.createdAt)}</span>
                    <span className="project-row__actions">
                      {starButton(p)}
                      {moreButton(p)}
                    </span>
                    {menuId === p.id && renderMenu(p)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
