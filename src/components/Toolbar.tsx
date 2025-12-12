import { Tool, ToolState } from '../types';

interface ToolbarProps {
  toolState: ToolState;
  onToolChange: (tool: Tool) => void;
  onBrushSizeChange: (size: number) => void;
  onDrawColorChange: (color: string) => void;
  onLoadMap: () => void;
  onOpenPlayerWindow: () => void;
  onClearDrawings: () => void;
  onResetFog: () => void;
  onClearFog: () => void;
}

export function Toolbar({
  toolState,
  onToolChange,
  onBrushSizeChange,
  onDrawColorChange,
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
        <button
          className={toolState.activeTool === 'pan' ? 'active' : ''}
          onClick={() => onToolChange('pan')}
        >
          Pan
        </button>
        <button
          className={toolState.activeTool === 'fogReveal' ? 'active' : ''}
          onClick={() => onToolChange('fogReveal')}
        >
          Reveal Fog
        </button>
        <button
          className={toolState.activeTool === 'fogHide' ? 'active' : ''}
          onClick={() => onToolChange('fogHide')}
        >
          Hide Fog
        </button>
        <button
          className={toolState.activeTool === 'draw' ? 'active' : ''}
          onClick={() => onToolChange('draw')}
        >
          Draw
        </button>
      </div>

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

      <div className="toolbar-section">
        <button onClick={onClearDrawings}>Clear Drawings</button>
        <button onClick={onResetFog}>Reset Fog</button>
        <button onClick={onClearFog}>Clear All Fog</button>
      </div>
    </div>
  );
}
