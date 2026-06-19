import type { HexMapMeta } from './hexmap';

export interface Point {
  x: number;
  y: number;
}

export interface MapState {
  imageUrl: string | null;
  // Separate image shown in the player window. Set when a cartographer
  // "both views" bundle is loaded (DM sees `imageUrl`, players see this).
  // Null for plain image maps, where the player view falls back to imageUrl.
  playerImageUrl: string | null;
  filePath: string | null; // Original file path for persistence
  imageWidth: number;
  imageHeight: number;
  gridSize: number; // pixels per grid square
  gridVisible: boolean;
  gridColor: string;
  gridOpacity: number;
  gridOffsetX: number; // pixel offset for grid alignment
  gridOffsetY: number;
  // Present when a `.hexm` map is loaded: geometry + resolved per-hex links
  // used to hit-test clicks and open each hex's key (e.g. in Obsidian).
  // Null for image/cartographer maps. The visual itself is the rendered SVG
  // in `imageUrl`, so this stays purely interactive metadata.
  hexmap: HexMapMeta | null;
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

export interface BlockState {
  // Block colors stored as an object with "row,col" keys and color values
  // This allows efficient lookup and proper JSON serialization
  cells: Record<string, string>;
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

export interface InitiativeEntity {
  id: string;
  name: string;
  dice: string; // How this entity rolls initiative, e.g. "1d6", "1d20", "1d20+3"
  roll: number | null; // Current rolled initiative (null until rolled)
  isPc: boolean; // Player characters are kept by "Clear" (only NPCs are removed)
}

export interface InitiativeState {
  visible: boolean; // Whether the tracker is shown (in both DM and player windows)
  entities: InitiativeEntity[];
}

export interface AppState {
  map: MapState;
  fog: FogState;
  drawings: Drawing[];
  blocks: BlockState;
  laserPoints: DrawingPoint[]; // Temporary laser pointer (synced to player view, cleared on release)
  laserColor: string; // Laser color (synced to player view)
  view: ViewState;
  playerViewOffset: PlayerViewOffset;
  calibration: CalibrationState;
  initiative: InitiativeState; // Initiative tracker (synced to player view)
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
  blocks: BlockState;
  view: ViewState;
  playerViewOffset: PlayerViewOffset;
  calibration: CalibrationState;
  savedAt: string; // ISO timestamp
}

export type Tool = 'pan' | 'fogReveal' | 'fogHide' | 'draw' | 'laser' | 'block';

export interface ToolState {
  activeTool: Tool;
  brushSize: number; // in grid squares
  drawColor: string;
  drawStrokeWidth: number;
  laserColor: string;
  blockColor: string;
}
