import { ReactFlowProvider } from '@xyflow/react';
import { useBoardState } from './state/useBoardState';
import { Toolbar } from './components/Toolbar';
import { Legend } from './components/Legend';
import { Banner } from './components/Banner';
import { ChatPanel } from './components/ChatPanel';
import { BoardCanvas } from './board/BoardCanvas';
import './App.css';

export default function App() {
  const board = useBoardState();

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Toolbar board={board} />
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
