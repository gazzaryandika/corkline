import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import { useBoardState } from './state/useBoardState';
import { useSourceActions } from './state/useSourceActions';
import { Toolbar } from './components/Toolbar';
import { Legend } from './components/Legend';
import { Banner } from './components/Banner';
import { ChatPanel } from './components/ChatPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { BoardCanvas } from './board/BoardCanvas';
import { clearNewMarker } from './lib/route';

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

  useEffect(() => {
    if (isNew) clearNewMarker(projectId);
  }, [isNew, projectId]);

  useEffect(() => {
    document.title = `${board.brief.name.trim() || 'Untitled project'} — Corkline`;
  }, [board.brief.name]);

  const isEmpty = !board.nodes.some((n) => n.type === 'card');

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Toolbar board={board} initialBriefOpen={isNew} onOpenSources={openSources} readingCount={sourceActions.readingCount} />
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
        <main className="app-main">
          <BoardCanvas board={board} />
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
          <ChatPanel board={board} sourceActions={sourceActions} onOpenReview={openReview} />
        </main>
        {sourcesPanel && (
          <SourcesPanel
            board={board}
            actions={sourceActions}
            onClose={closeSources}
            initialReviewId={sourcesPanel.reviewId}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
