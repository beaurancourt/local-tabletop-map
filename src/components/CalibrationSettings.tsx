import { CalibrationState, MapState } from '../types';

interface CalibrationSettingsProps {
  calibration: CalibrationState;
  map: MapState;
  onPixelsPerInchChange: (ppi: number) => void;
  onSaveCalibration: () => void;
  onResetCalibration: () => void;
}

export function CalibrationSettings({
  calibration,
  map,
  onPixelsPerInchChange,
  onSaveCalibration,
  onResetCalibration,
}: CalibrationSettingsProps) {
  const isModified = calibration.pixelsPerInch !== calibration.savedPixelsPerInch;

  return (
    <div className="settings-panel">
      <h3>Player View Calibration</h3>
      <p className="settings-help">
        Set pixels-per-inch so 1 grid square = 1 inch on your TV.
      </p>

      <div className="setting-row">
        <label>Pixels per inch:</label>
        <input
          type="number"
          min="10"
          max="500"
          value={calibration.pixelsPerInch}
          onChange={(e) => onPixelsPerInchChange(parseInt(e.target.value) || 96)}
        />
      </div>

      <div className="setting-row">
        <label>Saved:</label>
        <span>{calibration.savedPixelsPerInch} PPI</span>
        {isModified && <span style={{ color: '#ff9900', marginLeft: 8 }}>(modified)</span>}
      </div>

      <div className="setting-row">
        <button onClick={onSaveCalibration} disabled={!isModified}>
          Save
        </button>
        <button onClick={onResetCalibration} disabled={!isModified}>
          Reset (Shift+R)
        </button>
      </div>

      {map.gridSize > 0 && (
        <div className="setting-info">
          <p>Player view scale: {(calibration.pixelsPerInch / map.gridSize).toFixed(2)}x</p>
          <p>1 grid square = {calibration.pixelsPerInch}px = 1 inch</p>
        </div>
      )}

      <div className="calibration-helper">
        <p><strong>Keyboard shortcuts:</strong></p>
        <ul>
          <li><strong>-</strong> / <strong>=</strong> : Decrease / Increase viewport size</li>
          <li><strong>Shift+R</strong> : Reset to saved value</li>
        </ul>
        <p style={{ marginTop: 8 }}><strong>To calibrate:</strong></p>
        <ol>
          <li>Open player view on your TV</li>
          <li>Measure a grid square with a ruler</li>
          <li>Use - / = keys until 1 square = 1 inch</li>
          <li>Click Save to remember this calibration</li>
        </ol>
      </div>
    </div>
  );
}
