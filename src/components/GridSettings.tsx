import { MapState } from '../types';

interface GridSettingsProps {
  map: MapState;
  onGridSizeChange: (size: number) => void;
  onGridVisibleChange: (visible: boolean) => void;
  onGridColorChange: (color: string) => void;
  onGridOpacityChange: (opacity: number) => void;
}

export function GridSettings({
  map,
  onGridSizeChange,
  onGridVisibleChange,
  onGridColorChange,
  onGridOpacityChange,
}: GridSettingsProps) {
  return (
    <div className="settings-panel">
      <h3>Grid Settings</h3>

      <div className="setting-row">
        <label>
          <input
            type="checkbox"
            checked={map.gridVisible}
            onChange={(e) => onGridVisibleChange(e.target.checked)}
          />
          Show Grid
        </label>
      </div>

      <div className="setting-row">
        <label>Grid Size (px):</label>
        <input
          type="number"
          min="10"
          max="200"
          value={map.gridSize}
          onChange={(e) => onGridSizeChange(parseInt(e.target.value) || 50)}
        />
      </div>

      <div className="setting-row">
        <label>Grid Color:</label>
        <input
          type="color"
          value={map.gridColor}
          onChange={(e) => onGridColorChange(e.target.value)}
        />
      </div>

      <div className="setting-row">
        <label>Grid Opacity:</label>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={map.gridOpacity}
          onChange={(e) => onGridOpacityChange(parseFloat(e.target.value))}
        />
        <span>{Math.round(map.gridOpacity * 100)}%</span>
      </div>

      {map.imageWidth > 0 && map.gridSize > 0 && (
        <div className="setting-info">
          <p>Map: {map.imageWidth} x {map.imageHeight} px</p>
          <p>Grid: {Math.ceil(map.imageWidth / map.gridSize)} x {Math.ceil(map.imageHeight / map.gridSize)} squares</p>
        </div>
      )}
    </div>
  );
}
