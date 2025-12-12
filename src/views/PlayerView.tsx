import { useState, useEffect } from 'react';
import { MapCanvas } from '../components/MapCanvas';
import { AppState } from '../types';
import { createDefaultState, onStateSync, syncPlayerViewport } from '../store';

export function PlayerView() {
  const [state, setState] = useState<AppState>(createDefaultState);
  const [windowSize, setWindowSize] = useState({ width: 800, height: 600 });

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Listen for state updates from DM window
  useEffect(() => {
    const unlisten = onStateSync((newState) => {
      setState(newState);
    });

    return unlisten;
  }, []);

  // Calculate and sync viewport to DM
  useEffect(() => {
    if (!state.map.imageUrl || state.map.gridSize === 0) return;

    // Calculate the scale used in player view
    const playerScale = state.calibration.pixelsPerInch / state.map.gridSize;

    // Calculate viewport in map coordinates (using playerViewOffset which is already in map coords)
    const viewportWidth = windowSize.width / playerScale;
    const viewportHeight = windowSize.height / playerScale;

    syncPlayerViewport({
      x: state.playerViewOffset.x,
      y: state.playerViewOffset.y,
      width: viewportWidth,
      height: viewportHeight,
    });
  }, [state.playerViewOffset, state.calibration, state.map.gridSize, state.map.imageUrl, windowSize]);

  return (
    <div className="player-view">
      {state.map.imageUrl ? (
        <MapCanvas
          state={state}
          isPlayerView={true}
          width={windowSize.width}
          height={windowSize.height}
        />
      ) : (
        <div className="waiting-message">
          <p>Waiting for DM to load a map...</p>
        </div>
      )}
    </div>
  );
}
