import { CalibrationState, MapState } from '../types';

interface CalibrationSettingsProps {
  calibration: CalibrationState;
  map: MapState;
  onPixelsPerInchChange: (ppi: number) => void;
}

export function CalibrationSettings({
  calibration,
  map,
  onPixelsPerInchChange,
}: CalibrationSettingsProps) {
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
          min="50"
          max="300"
          value={calibration.pixelsPerInch}
          onChange={(e) => onPixelsPerInchChange(parseInt(e.target.value) || 96)}
        />
      </div>

      {map.gridSize > 0 && (
        <div className="setting-info">
          <p>Player view scale: {(calibration.pixelsPerInch / map.gridSize).toFixed(2)}x</p>
          <p>1 grid square = {calibration.pixelsPerInch}px = 1 inch</p>
        </div>
      )}

      <div className="calibration-helper">
        <p>To calibrate:</p>
        <ol>
          <li>Open player view on your TV</li>
          <li>Measure a grid square with a ruler</li>
          <li>Adjust pixels-per-inch until 1 square = 1 inch</li>
        </ol>
        <p><strong>Common values:</strong></p>
        <ul>
          <li>55" 4K TV: ~80 PPI</li>
          <li>65" 4K TV: ~68 PPI</li>
          <li>75" 4K TV: ~59 PPI</li>
        </ul>
      </div>
    </div>
  );
}
