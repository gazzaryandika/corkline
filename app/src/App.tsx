import { useState } from 'react';
import { BoardScreen } from './BoardScreen';
import { ProjectsPage } from './pages/ProjectsPage';
import { welcomeBoard } from './data/welcome';
import { ensureProjects, projectExists } from './lib/storage';
import { useRoute } from './lib/route';
import './App.css';

export default function App() {
  // First run: turn the pre-projects board (or the welcome tour) into the first project.
  useState(() => ensureProjects(welcomeBoard));
  const route = useRoute();

  if (route.page === 'board' && projectExists(route.projectId)) {
    // Keyed by id so switching projects starts a fresh board state and chat.
    return <BoardScreen key={route.projectId} projectId={route.projectId} isNew={route.isNew} />;
  }
  return <ProjectsPage missingProjectId={route.page === 'board' ? route.projectId : undefined} />;
}
