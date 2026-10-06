import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { useBoardState } from './state/useBoardState';
import { Toolbar } from './components/Toolbar';
import { Legend } from './components/Legend';
import { Banner } from './components/Banner';
import { ChatPanel } from './components/ChatPanel';
import { BoardCanvas } from './board/BoardCanvas';
import { clearNewMarker } from './lib/route';

interface BoardScreenProps {
  projectId: string;
  /** Just created: open the Project panel straight away so it gets a name. */
  isNew: boolean;
}

export function BoardScreen({ projectId, isNew }: BoardScreenProps) {
  const board = useBoardState(projectId);

  useEffect(() => {
    if (isNew) clearNewMarker(projectId);
  }, [isNew, projectId]);

  useEffect(() => {
    document.title = `${board.brief.name.trim() || 'Untitled project'} — Corkline`;
  }, [board.brief.name]);

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Toolbar board={board} initialBriefOpen={isNew} />
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
          <Legend />
          <ChatPanel board={board} />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
