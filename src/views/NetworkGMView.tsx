import { useEffect, useRef, useState } from 'react';
import type { AppState, SavedMapState, Token, ToolState } from '../types';
import type { Identity } from '../network';
import { uploadAsset } from '../network';
import { makeToken } from '../tokens';
import { applySavedState, parseSavedMapState } from '../persistence';
import { buildHexMapMeta, parseHexMapText, renderHexMapSvg } from '../hexmap';
import { MapCanvas } from '../components/MapCanvas';
import { TokenPanel } from '../components/TokenPanel';
import { createDefaultToolState } from '../store';

interface Props {
  identity: Identity;
  server: string;
  state: AppState;
  players: string[];
  onChange: (state: AppState) => void;
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The browser could not decode that image.'));
    image.src = url;
  });
}

function svgFile(svg: string, name: string): File {
  return new File([svg], name, { type: 'image/svg+xml' });
}

/** A saved state carries only the image's local path and its dimensions. If the
 * session already serves an image at exactly those dimensions, it is the same
 * map and can stay attached; otherwise the GM must choose the image file. */
function imageFitsSavedState(state: AppState, saved: SavedMapState): boolean {
  return Boolean(state.map.imageUrl)
    && state.map.imageWidth === saved.imageWidth
    && state.map.imageHeight === saved.imageHeight;
}

export function NetworkGMView({ identity, server, state, players, onChange }: Props) {
  const [toolState, setToolState] = useState<ToolState>(() => createDefaultToolState());
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Set when a saved state is loaded without its image, so the next image
  // upload fills in the visual without overwriting the restored table state.
  const pendingSavedRef = useRef<SavedMapState | null>(null);

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const loadImage = async (file: File) => {
    const url = await uploadAsset(server, identity, file);
    const image = await decodeImage(url);
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const saved = pendingSavedRef.current;

    if (saved) {
      // The saved state already supplied the grid, fog, drawings, labels and
      // tokens; only the image URL and its real pixel size are new.
      pendingSavedRef.current = null;
      onChange({
        ...state,
        map: {
          ...state.map,
          imageUrl: url,
          playerImageUrl: null,
          filePath: null,
          imageWidth,
          imageHeight,
        },
      });
      setNotice(
        imageWidth === saved.imageWidth && imageHeight === saved.imageHeight
          ? `Map image loaded and matched to the saved state (${imageWidth}×${imageHeight}).`
          : `Map image loaded at ${imageWidth}×${imageHeight}, but the saved state was calibrated for ${saved.imageWidth}×${saved.imageHeight}; check the grid alignment.`
      );
      return;
    }

    onChange({
      ...state,
      map: {
        ...state.map,
        imageUrl: url,
        playerImageUrl: null,
        filePath: null,
        imageWidth,
        imageHeight,
        gridSize: state.map.gridSize || 50,
        gridVisible: true,
        gridOffsetX: 0,
        gridOffsetY: 0,
        hexmap: null,
      },
    });
    setNotice('Map image loaded.');
  };

  const loadHexMap = async (file: File) => {
    const hexFile = parseHexMapText(await file.text());
    const meta = buildHexMapMeta(hexFile);
    // DM gets hex labels; players get the same map without the numbers, as on
    // the desktop path. Both renders are uploaded so each side has one URL.
    const [imageUrl, playerImageUrl] = await Promise.all([
      uploadAsset(server, identity, svgFile(renderHexMapSvg(hexFile, { showLabels: true }), 'hexmap-gm.svg')),
      uploadAsset(server, identity, svgFile(renderHexMapSvg(hexFile, { showLabels: false }), 'hexmap-player.svg')),
    ]);
    pendingSavedRef.current = null;
    onChange({
      ...state,
      map: {
        ...state.map,
        imageUrl,
        playerImageUrl,
        filePath: null,
        imageWidth: meta.width,
        imageHeight: meta.height,
        gridSize: meta.hexRadius,
        gridVisible: false,
        gridOffsetX: 0,
        gridOffsetY: 0,
        hexmap: meta,
      },
    });
    setNotice(`Hex map loaded: ${meta.cols}×${meta.rows} hexes.`);
  };

  const loadSavedState = async (file: File) => {
    const saved = parseSavedMapState(await file.text());
    const reuseImage = imageFitsSavedState(state, saved);
    pendingSavedRef.current = reuseImage ? null : saved;
    onChange(
      applySavedState(
        state,
        saved,
        reuseImage ? state.map.imageUrl : null,
        reuseImage ? state.map.playerImageUrl : null
      )
    );
    setNotice(
      reuseImage
        ? `Saved map state loaded and kept the current ${saved.imageWidth}×${saved.imageHeight} image.`
        : `Saved map state loaded (${saved.imageWidth}×${saved.imageHeight}) without its image. A saved state stores only the image's local file path, which a browser cannot read, so choose the matching image with Load map now — the saved grid, fog, drawings and tokens are kept.`
    );
  };

  const loadFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.hexm')) {
        await loadHexMap(file);
      } else if (name.endsWith('.json')) {
        await loadSavedState(file);
      } else if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
        await loadImage(file);
      } else {
        throw new Error('Choose a map image, a saved map (.json) or a hex map (.hexm).');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const changeTokens = (tokens: Token[]) => onChange({ ...state, tokens });
  const setTool = (activeTool: ToolState['activeTool']) => setToolState((prev) => ({ ...prev, activeTool }));

  return (
    <div className="network-gm">
      <header className="network-gm-bar">
        <div className="network-brand"><span className="toolbar-pip" /> VTT GM · {identity.name}</div>
        <button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Loading…' : 'Load map'}
        </button>
        <button className={toolState.activeTool === 'token' ? 'active' : ''} onClick={() => setTool('token')}>Place token</button>
        <button className={toolState.activeTool === 'pan' ? 'active' : ''} onClick={() => setTool('pan')}>Pan</button>
        <span className="network-players">At the table: {players.join(', ') || 'no one yet'}</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.json,.hexm,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
            e.target.value = '';
          }}
        />
      </header>
      <div className="network-gm-body">
        <div className="network-gm-map">
          {state.map.imageUrl ? (
            <MapCanvas
              state={state}
              toolState={toolState}
              isPlayerView={false}
              onStateChange={(next) => onChange(next)}
              onTokenPlace={(gridX, gridY) => {
                changeTokens([...state.tokens, makeToken(`Token ${state.tokens.length + 1}`, gridX, gridY)]);
              }}
              onTokenMove={(id, gridX, gridY) => {
                changeTokens(state.tokens.map((token) => token.id === id ? { ...token, gridX, gridY } : token));
              }}
              width={size.width - 330}
              height={size.height - 56}
            />
          ) : (
            <div className="network-waiting"><p>Load a map image, a saved map (.json) or a hex map (.hexm) to begin.</p></div>
          )}
        </div>
        <aside className="network-gm-panel">
          <TokenPanel
            tokens={state.tokens}
            onPlace={() => setTool('token')}
            onChange={(id, patch) => changeTokens(state.tokens.map((token) => token.id === id ? { ...token, ...patch } : token))}
            onRemove={(id) => changeTokens(state.tokens.filter((token) => token.id !== id))}
          />
          {notice && <p className="network-notice">{notice}</p>}
          {error && <p className="network-error">{error}</p>}
        </aside>
      </div>
    </div>
  );
}
