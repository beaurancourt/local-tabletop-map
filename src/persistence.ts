import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { AppState, SavedMapState } from './types';

// Generate the save file path for a map (same location with .vtt.json extension)
function getSaveFilePath(mapFilePath: string): string {
  return `${mapFilePath}.vtt.json`;
}

// Convert app state to saved state
function toSavedState(state: AppState): SavedMapState | null {
  if (!state.map.filePath) return null;

  return {
    filePath: state.map.filePath,
    imageWidth: state.map.imageWidth,
    imageHeight: state.map.imageHeight,
    gridSize: state.map.gridSize,
    gridVisible: state.map.gridVisible,
    gridColor: state.map.gridColor,
    gridOpacity: state.map.gridOpacity,
    gridOffsetX: state.map.gridOffsetX,
    gridOffsetY: state.map.gridOffsetY,
    fog: state.fog,
    drawings: state.drawings,
    view: state.view,
    playerViewOffset: state.playerViewOffset,
    calibration: state.calibration,
    savedAt: new Date().toISOString(),
  };
}

// Save state to disk
export async function saveMapState(state: AppState): Promise<void> {
  const savedState = toSavedState(state);
  if (!savedState) {
    console.log('Cannot save: no filePath in state');
    return;
  }

  const saveFilePath = getSaveFilePath(savedState.filePath);
  const json = JSON.stringify(savedState, null, 2);

  console.log('Attempting to save state to:', saveFilePath);
  console.log('State gridSize:', savedState.gridSize);

  try {
    await writeTextFile(saveFilePath, json);
    console.log('Successfully saved state to:', saveFilePath);
  } catch (err) {
    console.error('Failed to save state:', err);
    console.error('Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
  }
}

// Load saved state from disk
export async function loadMapState(mapFilePath: string): Promise<SavedMapState | null> {
  const saveFilePath = getSaveFilePath(mapFilePath);

  console.log('Attempting to load state from:', saveFilePath);

  try {
    const json = await readTextFile(saveFilePath);
    const savedState = JSON.parse(json) as SavedMapState;
    console.log('Loaded saved state from:', saveFilePath);
    console.log('Loaded gridSize:', savedState.gridSize);
    return savedState;
  } catch (err) {
    // File doesn't exist or couldn't be read - that's fine, just means no saved state
    console.log('No saved state found for:', mapFilePath, 'Error:', err);
    return null;
  }
}

// Apply saved state to app state (keeping the new imageUrl)
export function applySavedState(
  currentState: AppState,
  savedState: SavedMapState,
  imageUrl: string
): AppState {
  return {
    ...currentState,
    map: {
      imageUrl,
      filePath: savedState.filePath,
      imageWidth: savedState.imageWidth,
      imageHeight: savedState.imageHeight,
      gridSize: savedState.gridSize,
      gridVisible: savedState.gridVisible,
      gridColor: savedState.gridColor,
      gridOpacity: savedState.gridOpacity,
      gridOffsetX: savedState.gridOffsetX ?? 0,
      gridOffsetY: savedState.gridOffsetY ?? 0,
    },
    fog: savedState.fog,
    drawings: savedState.drawings,
    view: savedState.view,
    playerViewOffset: savedState.playerViewOffset,
    calibration: {
      pixelsPerInch: savedState.calibration.pixelsPerInch,
      savedPixelsPerInch: savedState.calibration.savedPixelsPerInch ?? savedState.calibration.pixelsPerInch,
    },
  };
}
