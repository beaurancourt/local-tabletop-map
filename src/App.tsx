import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DMView } from './views/DMView';
import { PlayerView } from './views/PlayerView';
import { NetworkApp } from './views/NetworkApp';
import './App.css';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (!isTauri) {
    return <NetworkApp />;
  }

  if (windowLabel === null) {
    return <div className="loading">Loading...</div>;
  }

  if (windowLabel === 'player') {
    return <PlayerView />;
  }

  return <DMView />;
}

export default App;
