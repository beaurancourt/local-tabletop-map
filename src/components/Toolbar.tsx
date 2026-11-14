import { ToolState } from '../types';

const TOOL_NAMES: Record<string, string> = {
  pan: 'Pan',
  fogReveal: 'Reveal Fog (C)',
  fogHide: 'Hide Fog (F)',
  draw: 'Draw (E)',
  laser: 'Laser (R)',
  block: 'Block (B)',
  text: 'Text (T)',
  token: 'Token (K)',
};

interface ToolbarProps {
  toolState: ToolState;
  onBrushSizeChange: (size: number) => void;
  onDrawColorChange: (color: string) => void;
  onLaserColorChange: (color: string) => void;
  onBlockColorChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onTextBgColorChange: (color: string) => void;
  onLoadMap: () => void;
  onOpenPlayerWindow: () => void;
  onMakeBundle: () => void;
  onClearDrawings: () => void;
  onResetFog: () => void;
  onClearFog: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  onUndo: () => void;
  onRedo: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
}

export function Toolbar({
  toolState,
  onBrushSizeChange,
  onDrawColorChange,
  onLaserColorChange,
  onBlockColorChange,
  onTextColorChange,
  onTextBgColorChange,
  onLoadMap,
  onOpenPlayerWindow,
  onMakeBundle,
  onClearDrawings,
  onResetFog,
  onClearFog,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  showSettings,
  onToggleSettings,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-brand">
        <span className="toolbar-pip" />
        VTT
      </div>

      <div className="toolbar-section">
        <button onClick={onLoadMap}>Load Map</button>
        <button onClick={onOpenPlayerWindow}>Open Player View</button>
        <button onClick={onMakeBundle}>Make Bundle</button>
      </div>

      <div className="toolbar-section">
        <span className="toolbar-label">Tool</span>
        <span className="current-tool">{TOOL_NAMES[toolState.activeTool] || toolState.activeTool}</span>
      </div>

      {(toolState.activeTool === 'fogReveal' || toolState.activeTool === 'fogHide' || toolState.activeTool === 'block') && (
        <div className="toolbar-section">
          <span className="toolbar-label">Brush:</span>
          <input
            type="range"
            min="1"
            max="5"
            value={toolState.brushSize}
            onChange={(e) => onBrushSizeChange(parseInt(e.target.value))}
          />
          <span>{toolState.brushSize}</span>
        </div>
      )}

      {toolState.activeTool === 'draw' && (
        <div className="toolbar-section">
          <span className="toolbar-label">Color:</span>
          <input
            type="color"
            value={toolState.drawColor}
            onChange={(e) => onDrawColorChange(e.target.value)}
          />
        </div>
      )}

      {toolState.activeTool === 'laser' && (
        <div className="toolbar-section">
          <span className="toolbar-label">Color:</span>
          <input
            type="color"
            value={toolState.laserColor}
            onChange={(e) => onLaserColorChange(e.target.value)}
          />
        </div>
      )}

      {toolState.activeTool === 'block' && (
        <div className="toolbar-section">
          <span className="toolbar-label">Color:</span>
          <input
            type="color"
            value={toolState.blockColor}
            onChange={(e) => onBlockColorChange(e.target.value)}
          />
        </div>
      )}

      {toolState.activeTool === 'text' && (
        <div className="toolbar-section">
          <span className="toolbar-label">Text:</span>
          <input
            type="color"
            value={toolState.textColor}
            onChange={(e) => onTextColorChange(e.target.value)}
          />
          <span className="toolbar-label">Background:</span>
          <input
            type="color"
            value={toolState.textBgColor}
            onChange={(e) => onTextBgColorChange(e.target.value)}
          />
        </div>
      )}

      <div className="toolbar-section">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={`Undo (Ctrl/Cmd+Z) — ${undoCount} step${undoCount === 1 ? '' : 's'}`}
        >
          Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={`Redo (Ctrl/Cmd+Shift+Z) — ${redoCount} step${redoCount === 1 ? '' : 's'}`}
        >
          Redo
        </button>
        <button onClick={onClearDrawings}>Clear Drawings</button>
        <button onClick={onResetFog}>Reset Fog</button>
        <button onClick={onClearFog}>Clear All Fog</button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-section">
        <button onClick={onToggleSettings}>
          {showSettings ? 'Hide' : 'Show'} Settings
        </button>
      </div>
    </div>
  );
}
