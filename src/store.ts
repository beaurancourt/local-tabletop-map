import { emit, listen } from '@tauri-apps/api/event';
import { AppState, FogState, ToolState, PlayerViewport } from './types';

const SYNC_EVENT = 'vtt-state-sync';
const VIEWPORT_SYNC_EVENT = 'vtt-viewport-sync';

// Default state
export const createDefaultState = (): AppState => ({
  map: {
    imageUrl: null,
    filePath: null,
    imageWidth: 0,
    imageHeight: 0,
    gridSize: 50,
    gridVisible: true,
    gridColor: '#000000',
    gridOpacity: 0.3,
    gridOffsetX: 0,
    gridOffsetY: 0,
  },
  fog: {
    cells: [],
    cols: 0,
    rows: 0,
  },
  drawings: [],
  view: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  playerViewOffset: {
    x: 0,
    y: 0,
  },
  calibration: {
    pixelsPerInch: 96, // Default screen DPI
  },
});

export const createDefaultToolState = (): ToolState => ({
  activeTool: 'pan',
  brushSize: 1,
  drawColor: '#ff0000',
  drawStrokeWidth: 3,
});

// Initialize fog grid based on map dimensions
export function initializeFog(imageWidth: number, imageHeight: number, gridSize: number): FogState {
  const safeGridSize = gridSize || 50;
  const cols = Math.ceil(imageWidth / safeGridSize);
  const rows = Math.ceil(imageHeight / safeGridSize);
  const cells = Array(rows).fill(null).map(() => Array(cols).fill(true)); // Start fully fogged
  return { cells, cols, rows };
}

// Sync state to other windows
export async function syncState(state: AppState): Promise<void> {
  await emit(SYNC_EVENT, state);
}

// Listen for state updates from other windows
export function onStateSync(callback: (state: AppState) => void): () => void {
  let unlisten: (() => void) | null = null;

  listen<AppState>(SYNC_EVENT, (event) => {
    callback(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    if (unlisten) unlisten();
  };
}

// Sync player viewport to DM
export async function syncPlayerViewport(viewport: PlayerViewport): Promise<void> {
  await emit(VIEWPORT_SYNC_EVENT, viewport);
}

// Listen for player viewport updates
export function onViewportSync(callback: (viewport: PlayerViewport) => void): () => void {
  let unlisten: (() => void) | null = null;

  listen<PlayerViewport>(VIEWPORT_SYNC_EVENT, (event) => {
    callback(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    if (unlisten) unlisten();
  };
}

// Modify fog at a specific grid position
export function modifyFog(
  fog: FogState,
  gridX: number,
  gridY: number,
  brushSize: number,
  reveal: boolean
): FogState {
  const newCells = fog.cells.map(row => [...row]);
  const halfBrush = Math.floor(brushSize / 2);

  for (let dy = -halfBrush; dy < brushSize - halfBrush; dy++) {
    for (let dx = -halfBrush; dx < brushSize - halfBrush; dx++) {
      const row = gridY + dy;
      const col = gridX + dx;
      if (row >= 0 && row < fog.rows && col >= 0 && col < fog.cols) {
        newCells[row][col] = !reveal;
      }
    }
  }

  return { ...fog, cells: newCells };
}
