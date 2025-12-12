import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { MapCanvas } from '../components/MapCanvas';
import { Toolbar } from '../components/Toolbar';
import { GridSettings } from '../components/GridSettings';
import { CalibrationSettings } from '../components/CalibrationSettings';
import { AppState, Tool, ToolState, PlayerViewport, FogState, Drawing } from '../types';
import { createDefaultState, createDefaultToolState, initializeFog, syncState, onViewportSync } from '../store';
import { saveMapState, loadMapState, applySavedState } from '../persistence';
import {
  HistoryManager,
  createFogChangeOperation,
  createDrawingAddOperation,
  createDrawingsClearOperation,
  createFogResetOperation,
  createFogClearOperation,
} from '../history';

export function DMView() {
  const [state, setState] = useState<AppState>(createDefaultState);
  const [toolState, setToolState] = useState<ToolState>(createDefaultToolState);
  const [windowSize, setWindowSize] = useState({ width: 800, height: 600 });
  const [showSettings, setShowSettings] = useState(false);
  const [playerViewport, setPlayerViewport] = useState<PlayerViewport | null>(null);

  // Grid calibration binary search state
  const [gridCalibration, setGridCalibration] = useState<{
    active: boolean;
    low: number;
    high: number;
  } | null>(null);

  // History manager for undo/redo (command pattern)
  const historyManager = useMemo(() => new HistoryManager(), []);
  const [, forceUpdate] = useState(0); // To trigger re-render after undo/redo

  // Track fog state before operation starts (for computing diff)
  const fogBeforeOperation = useRef<FogState | null>(null);

  // Track latest fog state to avoid stale closures
  const latestFogRef = useRef(state.fog);
  latestFogRef.current = state.fog;

  // Undo function
  const undo = useCallback(() => {
    const newState = historyManager.undo(state);
    if (newState) {
      setState(newState);
      forceUpdate(n => n + 1);
    }
  }, [state, historyManager]);

  // Redo function
  const redo = useCallback(() => {
    const newState = historyManager.redo(state);
    if (newState) {
      setState(newState);
      forceUpdate(n => n + 1);
    }
  }, [state, historyManager]);

  // Keyboard handler for undo/redo
  useEffect(() => {
    const handleUndoRedo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleUndoRedo);
    return () => window.removeEventListener('keydown', handleUndoRedo);
  }, [undo, redo]);

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight - 60, // Account for toolbar
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Sync state to player window
  useEffect(() => {
    syncState(state);
  }, [state]);

  // Auto-save state when it changes (debounced)
  const saveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    // Only save if we have a map loaded
    if (!state.map.filePath) return;

    // Debounce saves to avoid excessive disk writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      saveMapState(state);
    }, 1000); // Save 1 second after last change

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state]);

  // Listen for player viewport updates
  useEffect(() => {
    const unlisten = onViewportSync((viewport) => {
      setPlayerViewport(viewport);
    });
    return unlisten;
  }, []);

  // Keyboard handler for Shift+WASD to move player viewport, Shift+IJKL to nudge grid, Shift+G for grid calibration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Grid calibration mode controls (no shift required when active)
      if (gridCalibration?.active) {
        if (e.key === '[') {
          // Too big - need smaller grid
          e.preventDefault();
          const newHigh = state.map.gridSize - 1;
          const newSize = Math.floor((gridCalibration.low + newHigh) / 2);
          if (newHigh >= gridCalibration.low) {
            setGridCalibration({ ...gridCalibration, high: newHigh });
            setState(prev => {
              const fog = prev.map.imageWidth > 0
                ? initializeFog(prev.map.imageWidth, prev.map.imageHeight, newSize)
                : prev.fog;
              return { ...prev, map: { ...prev.map, gridSize: newSize }, fog };
            });
          }
          return;
        }
        if (e.key === ']') {
          // Too small - need bigger grid
          e.preventDefault();
          const newLow = state.map.gridSize + 1;
          const newSize = Math.floor((newLow + gridCalibration.high) / 2);
          if (newLow <= gridCalibration.high) {
            setGridCalibration({ ...gridCalibration, low: newLow });
            setState(prev => {
              const fog = prev.map.imageWidth > 0
                ? initializeFog(prev.map.imageWidth, prev.map.imageHeight, newSize)
                : prev.fog;
              return { ...prev, map: { ...prev.map, gridSize: newSize }, fog };
            });
          }
          return;
        }
        if (e.key === 'Enter') {
          // Perfect - exit calibration mode
          e.preventDefault();
          setGridCalibration(null);
          return;
        }
        if (e.key === 'Escape') {
          // Cancel calibration mode
          e.preventDefault();
          setGridCalibration(null);
          return;
        }
      }

      if (!e.shiftKey) return;

      // Shift+G to start grid calibration
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (gridCalibration?.active) {
          setGridCalibration(null);
        } else {
          // Start binary search with reasonable bounds
          setGridCalibration({
            active: true,
            low: 10,
            high: 500,
          });
        }
        return;
      }

      const moveAmount = state.map.gridSize; // Move by 1 grid square

      switch (e.key.toLowerCase()) {
        // Player viewport movement (WASD)
        case 'w':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            playerViewOffset: {
              ...prev.playerViewOffset,
              y: prev.playerViewOffset.y - moveAmount,
            },
          }));
          break;
        case 's':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            playerViewOffset: {
              ...prev.playerViewOffset,
              y: prev.playerViewOffset.y + moveAmount,
            },
          }));
          break;
        case 'a':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            playerViewOffset: {
              ...prev.playerViewOffset,
              x: prev.playerViewOffset.x - moveAmount,
            },
          }));
          break;
        case 'd':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            playerViewOffset: {
              ...prev.playerViewOffset,
              x: prev.playerViewOffset.x + moveAmount,
            },
          }));
          break;
        // Grid offset nudge (IJKL) - 1 pixel at a time
        case 'i':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            map: {
              ...prev.map,
              gridOffsetY: prev.map.gridOffsetY - 1,
            },
          }));
          break;
        case 'k':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            map: {
              ...prev.map,
              gridOffsetY: prev.map.gridOffsetY + 1,
            },
          }));
          break;
        case 'j':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            map: {
              ...prev.map,
              gridOffsetX: prev.map.gridOffsetX - 1,
            },
          }));
          break;
        case 'l':
          e.preventDefault();
          setState(prev => ({
            ...prev,
            map: {
              ...prev.map,
              gridOffsetX: prev.map.gridOffsetX + 1,
            },
          }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.map.gridSize, gridCalibration]);

  // Load map image
  const handleLoadMap = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      });

      if (selected) {
        const fileData = await readFile(selected);
        const blob = new Blob([fileData]);
        const url = URL.createObjectURL(blob);

        // Check for saved state
        const savedState = await loadMapState(selected);

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          let newState: AppState;
          if (savedState) {
            // Restore saved state
            newState = applySavedState(state, savedState, url);
          } else {
            // Initialize fresh state
            const fog = initializeFog(img.width, img.height, state.map.gridSize);
            newState = {
              ...state,
              map: {
                ...state.map,
                imageUrl: url,
                filePath: selected,
                imageWidth: img.width,
                imageHeight: img.height,
                gridOffsetX: 0,
                gridOffsetY: 0,
              },
              fog,
              drawings: [],
              view: { scale: 1, offsetX: 0, offsetY: 0 },
              playerViewOffset: { x: 0, y: 0 },
            };
          }
          setState(newState);
          // Clear history when loading a new map
          historyManager.clear();
        };
        img.src = url;
      }
    } catch (err) {
      console.error('Failed to load map:', err);
    }
  }, [state]);

  // Open player window
  const handleOpenPlayerWindow = useCallback(async () => {
    try {
      await invoke('open_player_window');
    } catch (err) {
      console.error('Failed to open player window:', err);
    }
  }, []);

  // Tool handlers
  const handleToolChange = (tool: Tool) => {
    setToolState(prev => ({ ...prev, activeTool: tool }));
  };

  const handleBrushSizeChange = (size: number) => {
    setToolState(prev => ({ ...prev, brushSize: size }));
  };

  const handleDrawColorChange = (color: string) => {
    setToolState(prev => ({ ...prev, drawColor: color }));
  };

  // State handlers
  const handleStateChange = (newState: AppState) => {
    // Update fog ref immediately (before async React render) for undo/redo tracking
    latestFogRef.current = newState.fog;
    setState(newState);
  };

  // Fog operation callbacks
  const handleFogOperationStart = useCallback(() => {
    // Capture fog state before operation for computing diff
    fogBeforeOperation.current = JSON.parse(JSON.stringify(state.fog));
  }, [state.fog]);

  const handleFogOperationEnd = useCallback(() => {
    if (!fogBeforeOperation.current) return;

    // Compute which cells changed (use ref to get latest fog state)
    const changes: Array<{ row: number; col: number; wasRevealed: boolean }> = [];
    const before = fogBeforeOperation.current;
    const after = latestFogRef.current;

    for (let row = 0; row < Math.min(before.rows, after.rows); row++) {
      for (let col = 0; col < Math.min(before.cols, after.cols); col++) {
        if (before.cells[row][col] !== after.cells[row][col]) {
          changes.push({
            row,
            col,
            wasRevealed: !before.cells[row][col], // wasRevealed = was NOT fogged
          });
        }
      }
    }

    if (changes.length > 0) {
      const operation = createFogChangeOperation(changes);
      historyManager.push(operation);
      forceUpdate(n => n + 1);
    }

    fogBeforeOperation.current = null;
  }, [historyManager]);

  // Drawing added callback
  const handleDrawingAdded = useCallback((drawing: Drawing) => {
    const operation = createDrawingAddOperation(drawing);
    historyManager.push(operation);
    forceUpdate(n => n + 1);
  }, [historyManager]);

  const handleClearDrawings = () => {
    if (state.drawings.length === 0) return;
    const operation = createDrawingsClearOperation([...state.drawings]);
    historyManager.push(operation);
    setState(prev => ({ ...prev, drawings: [] }));
    forceUpdate(n => n + 1);
  };

  const handleResetFog = () => {
    if (state.map.imageWidth > 0) {
      const newFog = initializeFog(state.map.imageWidth, state.map.imageHeight, state.map.gridSize);
      const operation = createFogResetOperation(state.fog, newFog);
      historyManager.push(operation);
      setState(prev => ({ ...prev, fog: newFog }));
      forceUpdate(n => n + 1);
    }
  };

  const handleClearFog = () => {
    const operation = createFogClearOperation(state.fog);
    historyManager.push(operation);
    setState(prev => ({
      ...prev,
      fog: {
        ...prev.fog,
        cells: prev.fog.cells.map(row => row.map(() => false)),
      },
    }));
    forceUpdate(n => n + 1);
  };

  // Grid settings handlers
  const handleGridSizeChange = (size: number) => {
    // Guard against invalid values
    if (!size || size < 1 || !Number.isFinite(size)) return;

    setState(prev => {
      const fog = prev.map.imageWidth > 0
        ? initializeFog(prev.map.imageWidth, prev.map.imageHeight, size)
        : prev.fog;
      return {
        ...prev,
        map: { ...prev.map, gridSize: size },
        fog,
      };
    });
  };

  const handleGridVisibleChange = (visible: boolean) => {
    setState(prev => ({ ...prev, map: { ...prev.map, gridVisible: visible } }));
  };

  const handleGridColorChange = (color: string) => {
    setState(prev => ({ ...prev, map: { ...prev.map, gridColor: color } }));
  };

  const handleGridOpacityChange = (opacity: number) => {
    setState(prev => ({ ...prev, map: { ...prev.map, gridOpacity: opacity } }));
  };

  // Calibration handlers
  const handlePixelsPerInchChange = (ppi: number) => {
    setState(prev => ({ ...prev, calibration: { ...prev.calibration, pixelsPerInch: ppi } }));
  };

  return (
    <div className="dm-view">
      {/* Grid Calibration Mode Indicator */}
      {gridCalibration?.active && (
        <div className="calibration-indicator">
          <strong>Grid Calibration Mode</strong>
          <div>Current: {state.map.gridSize}px | Range: [{gridCalibration.low}, {gridCalibration.high}]</div>
          <div>[ = too big | ] = too small | Enter = perfect | Esc = cancel</div>
        </div>
      )}

      <Toolbar
        toolState={toolState}
        onToolChange={handleToolChange}
        onBrushSizeChange={handleBrushSizeChange}
        onDrawColorChange={handleDrawColorChange}
        onLoadMap={handleLoadMap}
        onOpenPlayerWindow={handleOpenPlayerWindow}
        onClearDrawings={handleClearDrawings}
        onResetFog={handleResetFog}
        onClearFog={handleClearFog}
      />

      <div className="main-content">
        <div className="canvas-container">
          <MapCanvas
            state={state}
            toolState={toolState}
            isPlayerView={false}
            onStateChange={handleStateChange}
            onFogOperationStart={handleFogOperationStart}
            onFogOperationEnd={handleFogOperationEnd}
            onDrawingAdded={handleDrawingAdded}
            width={showSettings ? windowSize.width - 300 : windowSize.width}
            height={windowSize.height}
            playerViewport={playerViewport}
          />
        </div>

        <button
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          {showSettings ? '>' : '<'} Settings
        </button>

        {showSettings && (
          <div className="settings-sidebar">
            <GridSettings
              map={state.map}
              onGridSizeChange={handleGridSizeChange}
              onGridVisibleChange={handleGridVisibleChange}
              onGridColorChange={handleGridColorChange}
              onGridOpacityChange={handleGridOpacityChange}
            />
            <CalibrationSettings
              calibration={state.calibration}
              map={state.map}
              onPixelsPerInchChange={handlePixelsPerInchChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
