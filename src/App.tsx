import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DMView } from './views/DMView';
import { PlayerView } from './views/PlayerView';
import './App.css';

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (windowLabel === null) {
    return <div className="loading">Loading...</div>;
  }

  if (windowLabel === 'player') {
    return <PlayerView />;
  }

  return <DMView />;
}

export default App;
