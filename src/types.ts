export interface Point {
  x: number;
  y: number;
}

export interface MapState {
  imageUrl: string | null;
  filePath: string | null; // Original file path for persistence
  imageWidth: number;
  imageHeight: number;
  gridSize: number; // pixels per grid square
  gridVisible: boolean;
  gridColor: string;
  gridOpacity: number;
  gridOffsetX: number; // pixel offset for grid alignment
  gridOffsetY: number;
}

export interface FogState {
  // Fog is represented as a 2D array where true = fogged (hidden), false = revealed
  // Each cell corresponds to one grid square
  cells: boolean[][];
  cols: number;
  rows: number;
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface Drawing {
  id: string;
  points: DrawingPoint[];
  color: string;
  strokeWidth: number;
}

export interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface CalibrationState {
  pixelsPerInch: number; // For player view calibration (current/active value)
  savedPixelsPerInch: number; // Saved calibration value (Shift+R resets to this)
}

export interface PlayerViewport {
  // The rectangle (in map coordinates) that the player can see
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerViewOffset {
  // Offset for player view (in map coordinates), controlled by Shift+WASD
  x: number;
  y: number;
}

export interface AppState {
  map: MapState;
  fog: FogState;
  drawings: Drawing[];
  laserPoints: DrawingPoint[]; // Temporary laser pointer (synced to player view, cleared on release)
  view: ViewState;
  playerViewOffset: PlayerViewOffset;
  calibration: CalibrationState;
}

// Persisted state for a map (saved to disk)
export interface SavedMapState {
  filePath: string;
  imageWidth: number;
  imageHeight: number;
  gridSize: number;
  gridVisible: boolean;
  gridColor: string;
  gridOpacity: number;
  gridOffsetX: number;
  gridOffsetY: number;
  fog: FogState;
  drawings: Drawing[];
  view: ViewState;
  playerViewOffset: PlayerViewOffset;
  calibration: CalibrationState;
  savedAt: string; // ISO timestamp
}

export type Tool = 'pan' | 'fogReveal' | 'fogHide' | 'draw' | 'laser';

export interface ToolState {
  activeTool: Tool;
  brushSize: number; // in grid squares
  drawColor: string;
  drawStrokeWidth: number;
  laserColor: string;
}
