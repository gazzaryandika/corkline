import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import { useBoardState } from './state/useBoardState';
import { useSourceActions } from './state/useSourceActions';
import { Toolbar } from './components/Toolbar';
import { Legend } from './components/Legend';
import { Banner } from './components/Banner';
import { ChatPanel } from './components/ChatPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { ThemesPanel } from './components/ThemesPanel';
import { TracePanel } from './components/TracePanel';
import type { ThemeProposal } from './types';
import { BoardCanvas } from './board/BoardCanvas';
import { clearNewMarker } from './lib/route';

const TIDY_UNDO_MS = 30_000;

interface BoardScreenProps {
  projectId: string;
  /** Just created: open the Project panel straight away so it gets a name. */
  isNew: boolean;
}

export function BoardScreen({ projectId, isNew }: BoardScreenProps) {
  const board = useBoardState(projectId);
  // Adding and reading sources lives here, so reads keep going while the panel is
  // closed and the chat can start them too.
  const sourceActions = useSourceActions(board, projectId);
  /** null: panel closed. reviewId: open straight on that document's review. */
  const [sourcesPanel, setSourcesPanel] = useState<{ reviewId?: string } | null>(null);
  const openSources = useCallback(() => setSourcesPanel({}), []);
  const openReview = useCallback((docId: string) => setSourcesPanel({ reviewId: docId }), []);
  const closeSources = useCallback(() => setSourcesPanel(null), []);

  /** The summary note whose cards are highlighted on the board. */
  const [highlightedNoteId, setHighlightedNoteIdState] = useState<string | null>(null);
  /** Cards highlighted from the chat (e.g. both ends of a suggested link). */
  const [previewCardIds, setPreviewCardIdsState] = useState<string[] | null>(null);
  // Only one highlight at a time.
  const setHighlightedNoteId = useCallback((id: string | null) => {
    setHighlightedNoteIdState(id);
    if (id) setPreviewCardIdsState(null);
  }, []);
  const setPreviewCardIds = useCallback((ids: string[] | null) => {
    setPreviewCardIdsState(ids);
    if (ids) setHighlightedNoteIdState(null);
  }, []);
  const clearPreview = useCallback(() => setPreviewCardIdsState(null), []);

  // Themes the AI found and the designer hasn't finished reviewing (kept for this visit only).
  const [themeReview, setThemeReview] = useState<{ themes: ThemeProposal[]; model: string } | null>(null);
  const [themesOpen, setThemesOpen] = useState(false);
  const handleThemesFound = useCallback((themes: ThemeProposal[], model: string) => {
    setThemeReview(themes.length > 0 ? { themes, model } : null);
    setThemesOpen(themes.length > 0);
  }, []);
  const updateThemes = useCallback(
    (update: (themes: ThemeProposal[]) => ThemeProposal[]) =>
      setThemeReview((prev) => (prev ? { ...prev, themes: update(prev.themes) } : prev)),
    [],
  );
  const finishThemes = useCallback(() => {
    setThemeReview(null);
    setThemesOpen(false);
  }, []);

  /** The trace check panel (from the gaps pill in the toolbar). */
  const [traceOpen, setTraceOpen] = useState(false);
  /** A request for the chat to run as link suggestions (e.g. a route from the trace check). */
  const [chatRequest, setChatRequest] = useState<{ id: string; text: string } | null>(null);
  const askRoute = useCallback((text: string) => setChatRequest({ id: crypto.randomUUID(), text }), []);

  useEffect(() => {
    if (isNew) clearNewMarker(projectId);
  }, [isNew, projectId]);

  useEffect(() => {
    document.title = `${board.brief.name.trim() || 'Untitled project'} — Corkline`;
  }, [board.brief.name]);

  const isEmpty = !board.nodes.some((n) => n.type === 'card');

  // The Undo offer after "Tidy board" goes away on its own after a while.
  const { canUndoTidy, dismissTidyUndo } = board;
  useEffect(() => {
    if (!canUndoTidy) return;
    const id = window.setTimeout(dismissTidyUndo, TIDY_UNDO_MS);
    return () => window.clearTimeout(id);
  }, [canUndoTidy, dismissTidyUndo]);

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Toolbar board={board} initialBriefOpen={isNew} onOpenSources={openSources} readingCount={sourceActions.readingCount}
          onOpenTrace={() => setTraceOpen((open) => !open)}
        />
        {board.saveStatus === 'error' && (
          <Banner tone="error">
            Changes aren&rsquo;t saving ({board.saveError}) — use Export in the toolbar to back up your work now.
          </Banner>
        )}
        {board.crossTabNotice && (
          <Banner
            tone="info"
            onDismiss={board.dismissCrossTabNotice}
            action={{ label: 'Reload', onClick: board.reloadFromStorage }}
          >
            This board changed in another tab.
          </Banner>
        )}
        {board.canUndoTidy && (
          <Banner tone="info" onDismiss={board.dismissTidyUndo} action={{ label: 'Undo', onClick: board.undoTidy }}>
            Board tidied: every card is in its type&rsquo;s column.
          </Banner>
        )}
        <main className="app-main">
          <BoardCanvas
            board={board}
            highlightedNoteId={highlightedNoteId}
            onHighlightNote={setHighlightedNoteId}
            previewCardIds={previewCardIds}
            onClearPreview={clearPreview}
          />
          {isEmpty && (
            <div className="board-empty">
              <p className="board-empty__title">This board is empty</p>
              <p>Add the project&rsquo;s brief or other documents and Corkline will draft cards for you to review, or add cards yourself from the toolbar.</p>
              <button type="button" onClick={openSources}>
                Add a document
              </button>
            </div>
          )}
          <Legend />
          {traceOpen && (
            <TracePanel board={board} onClose={() => setTraceOpen(false)} onShowCards={setPreviewCardIds} onAskRoute={askRoute} />
          )}
          <ChatPanel
            board={board}
            sourceActions={sourceActions}
            onOpenReview={openReview}
            themesPending={themeReview !== null}
            onThemesFound={handleThemesFound}
            onOpenThemes={() => setThemesOpen(true)}
            onShowNote={setHighlightedNoteId}
            onPreviewCards={setPreviewCardIds}
            linkRequest={chatRequest}
          />
        </main>
        {sourcesPanel && (
          <SourcesPanel
            board={board}
            actions={sourceActions}
            onClose={closeSources}
            initialReviewId={sourcesPanel.reviewId}
          />
        )}
        {themesOpen && themeReview && (
          <ThemesPanel
            board={board}
            themes={themeReview.themes}
            model={themeReview.model}
            onChange={updateThemes}
            onDone={finishThemes}
            onClose={() => setThemesOpen(false)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
