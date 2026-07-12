import { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { buildCartographerBundle, imageBytesToDataUrl, mimeForImagePath } from '../cartographer';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

interface BundleCreatorProps {
  defaultCellSize: number;
  onClose: () => void;
}

const basename = (path: string) => path.split(/[\\/]/).pop() || path;

// A small utility for authoring a cartographer "both views" bundle (`.json`)
// from two images: one the GM sees, one the players see. Pick both, set the
// grid cell size, and save — the resulting file loads via "Load Map" like any
// other map, showing the GM image on the DM view and the player image on the
// player window.
export function BundleCreator({ defaultCellSize, onClose }: BundleCreatorProps) {
  const [gmPath, setGmPath] = useState<string | null>(null);
  const [playerPath, setPlayerPath] = useState<string | null>(null);
  const [cellSize, setCellSize] = useState<number>(defaultCellSize || 50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const pickImage = async (setter: (path: string) => void) => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: IMAGE_EXTS }],
    });
    if (typeof selected === 'string') {
      setter(selected);
      setSavedPath(null);
      setError(null);
    }
  };

  const createBundle = async () => {
    if (!gmPath || !playerPath) {
      setError('Pick both a GM image and a player image first.');
      return;
    }
    if (!cellSize || cellSize < 1) {
      setError('Grid cell size must be a positive number.');
      return;
    }
    setBusy(true);
    setError(null);
    setSavedPath(null);
    try {
      const [gmBytes, playerBytes] = await Promise.all([readFile(gmPath), readFile(playerPath)]);
      const gm = imageBytesToDataUrl(gmBytes, mimeForImagePath(gmPath));
      const player = imageBytesToDataUrl(playerBytes, mimeForImagePath(playerPath));
      const bundle = buildCartographerBundle(gm, player, cellSize);

      const outPath = await save({
        defaultPath: 'map.json',
        filters: [{ name: 'Cartographer bundle', extensions: ['json'] }],
      });
      if (!outPath) {
        setBusy(false);
        return; // user cancelled the save dialog
      }
      await writeTextFile(outPath, JSON.stringify(bundle));
      setSavedPath(outPath);
    } catch (err) {
      setError(`Failed to create bundle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Make Player/GM Bundle</h2>
        <p className="modal-help">
          Combine a GM image and a player image into a single <code>.json</code> map. Load it with
          "Load Map" — the DM sees the GM image, the player window sees the player image.
        </p>

        <div className="bundle-row">
          <span className="bundle-row-label">GM image</span>
          <button onClick={() => pickImage(setGmPath)}>Choose…</button>
          <span className="bundle-file">{gmPath ? basename(gmPath) : 'none selected'}</span>
        </div>

        <div className="bundle-row">
          <span className="bundle-row-label">Player image</span>
          <button onClick={() => pickImage(setPlayerPath)}>Choose…</button>
          <span className="bundle-file">{playerPath ? basename(playerPath) : 'none selected'}</span>
        </div>

        <div className="bundle-row">
          <span className="bundle-row-label">Grid cell size (px)</span>
          <input
            type="number"
            min={1}
            value={cellSize}
            onChange={(e) => setCellSize(parseFloat(e.target.value))}
            style={{ width: 80 }}
          />
        </div>

        {error && <div className="bundle-error">{error}</div>}
        {savedPath && <div className="bundle-success">Saved {basename(savedPath)}</div>}

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={createBundle} disabled={busy}>
            {busy ? 'Saving…' : 'Create Bundle'}
          </button>
        </div>
      </div>
    </div>
  );
}
