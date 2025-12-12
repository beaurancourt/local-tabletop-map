import { ToolState } from '../types';

const TOOL_NAMES: Record<string, string> = {
  pan: 'Pan',
  fogReveal: 'Reveal Fog (C)',
  fogHide: 'Hide Fog (F)',
  draw: 'Draw (E)',
  laser: 'Laser (R)',
};

interface ToolbarProps {
  toolState: ToolState;
  onBrushSizeChange: (size: number) => void;
  onDrawColorChange: (color: string) => void;
  onLaserColorChange: (color: string) => void;
  onLoadMap: () => void;
  onOpenPlayerWindow: () => void;
  onClearDrawings: () => void;
  onResetFog: () => void;
  onClearFog: () => void;
}

export function Toolbar({
  toolState,
  onBrushSizeChange,
  onDrawColorChange,
  onLaserColorChange,
  onLoadMap,
  onOpenPlayerWindow,
  onClearDrawings,
  onResetFog,
  onClearFog,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button onClick={onLoadMap}>Load Map</button>
        <button onClick={onOpenPlayerWindow}>Open Player View</button>
      </div>

      <div className="toolbar-section">
        <span className="toolbar-label">Tool:</span>
        <span className="current-tool">{TOOL_NAMES[toolState.activeTool] || toolState.activeTool}</span>
      </div>

      {(toolState.activeTool === 'fogReveal' || toolState.activeTool === 'fogHide') && (
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

      <div className="toolbar-section">
        <button onClick={onClearDrawings}>Clear Drawings</button>
        <button onClick={onResetFog}>Reset Fog</button>
        <button onClick={onClearFog}>Clear All Fog</button>
      </div>
    </div>
  );
}
