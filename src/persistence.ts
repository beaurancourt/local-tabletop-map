import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { AppState, SavedMapState } from './types';

// Generate a hash from the map file path for unique save file naming
function hashPath(path: string): string {
  // Simple hash function for creating a unique filename from the path
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Also include the filename for readability
  const filename = path.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'map';
  const safeName = filename.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  return `${safeName}_${Math.abs(hash).toString(16)}`;
}

// Get the save directory path
async function getSaveDir(): Promise<string> {
  const appData = await appDataDir();
  return await join(appData, 'maps');
}

// Generate the save file path for a map (stored in app data directory)
async function getSaveFilePath(mapFilePath: string): Promise<string> {
  const saveDir = await getSaveDir();
  const hash = hashPath(mapFilePath);
  return await join(saveDir, `${hash}.json`);
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
    blocks: state.blocks,
    view: state.view,
    playerViewOffset: state.playerViewOffset,
    calibration: state.calibration,
    savedAt: new Date().toISOString(),
  };
}

// Ensure the save directory exists
async function ensureSaveDir(): Promise<void> {
  const saveDir = await getSaveDir();
  if (!await exists(saveDir)) {
    await mkdir(saveDir, { recursive: true });
  }
}

// Save state to disk
export async function saveMapState(state: AppState): Promise<void> {
  const savedState = toSavedState(state);
  if (!savedState) {
    console.log('Cannot save: no filePath in state');
    return;
  }

  try {
    await ensureSaveDir();
    const saveFilePath = await getSaveFilePath(savedState.filePath);
    const json = JSON.stringify(savedState, null, 2);

    console.log('Attempting to save state to:', saveFilePath);

    await writeTextFile(saveFilePath, json);
    console.log('Successfully saved state to:', saveFilePath);
  } catch (err) {
    console.error('Failed to save state:', err);
    console.error('Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
  }
}

// Load saved state from disk
export async function loadMapState(mapFilePath: string): Promise<SavedMapState | null> {
  try {
    const saveFilePath = await getSaveFilePath(mapFilePath);
    console.log('Attempting to load state from:', saveFilePath);

    const json = await readTextFile(saveFilePath);
    const savedState = JSON.parse(json) as SavedMapState;
    console.log('Loaded saved state from:', saveFilePath);
    return savedState;
  } catch (err) {
    // File doesn't exist or couldn't be read - that's fine, just means no saved state
    console.log('No saved state found for:', mapFilePath);
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
    // Handle both new BlockState format and legacy array format
    blocks: savedState.blocks && 'cells' in savedState.blocks
      ? savedState.blocks
      : { cells: {} },
    laserPoints: [], // Laser is temporary, never persisted
    view: savedState.view,
    playerViewOffset: savedState.playerViewOffset,
    calibration: {
      pixelsPerInch: savedState.calibration.pixelsPerInch,
      savedPixelsPerInch: savedState.calibration.savedPixelsPerInch ?? savedState.calibration.pixelsPerInch,
    },
  };
}
