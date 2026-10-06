import { useState } from 'react';
import { BoardScreen } from './BoardScreen';
import { ProjectsPage } from './pages/ProjectsPage';
import { seedBoard } from './data/seed';
import { ensureProjects, projectExists } from './lib/storage';
import { useRoute } from './lib/route';
import './App.css';

export default function App() {
  // First run: turn the pre-projects board (or the example) into the first project.
  useState(() => ensureProjects(seedBoard));
  const route = useRoute();

  if (route.page === 'board' && projectExists(route.projectId)) {
    // Keyed by id so switching projects starts a fresh board state and chat.
    return <BoardScreen key={route.projectId} projectId={route.projectId} isNew={route.isNew} />;
  }
  return <ProjectsPage missingProjectId={route.page === 'board' ? route.projectId : undefined} />;
}
