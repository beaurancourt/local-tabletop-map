import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, SavedMapState, Token, ToolState } from '../types';
import type { Identity } from '../network';
import { uploadAsset } from '../network';
import { makeToken } from '../tokens';
import { HistoryManager } from '../history';
import { recordTokenChange } from '../tokenHistory';
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
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [tokenFocus, setTokenFocus] = useState<{ id: string; nonce: number } | null>(null);
  // Local history for this GM tab. Undo/redo never rewinds a local copy: it
  // computes the next shared state and calls onChange, which sends it down the
  // same `gm-state` WebSocket channel as every other GM edit.
  const historyManager = useMemo(() => new HistoryManager(), []);
  const [, bumpHistory] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetTokenHistory = useCallback(() => {
    historyManager.clear();
    bumpHistory(n => n + 1);
  }, [historyManager]);

  const undo = useCallback(() => {
    const next = historyManager.undo(state);
    if (!next) return;
    onChange(next);
    setSelectedTokenId(prev => next.tokens.some(token => token.id === prev) ? prev : null);
    bumpHistory(n => n + 1);
  }, [state, onChange, historyManager]);

  const redo = useCallback(() => {
    const next = historyManager.redo(state);
    if (!next) return;
    onChange(next);
    setSelectedTokenId(prev => next.tokens.some(token => token.id === prev) ? prev : null);
    bumpHistory(n => n + 1);
  }, [state, onChange, historyManager]);

  useEffect(() => {
    const handleUndoRedo = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Leave native text undo alone while a field has focus.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleUndoRedo);
    return () => window.removeEventListener('keydown', handleUndoRedo);
  }, [undo, redo]);
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
      resetTokenHistory();
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
    resetTokenHistory();
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
    resetTokenHistory();
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
    resetTokenHistory();
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

  const recordTokenStep = (before: Token | null, after: Token | null) => {
    if (recordTokenChange(historyManager, before, after)) bumpHistory(n => n + 1);
  };

  const placeToken = (gridX: number, gridY: number) => {
    const token = makeToken(`Token ${state.tokens.length + 1}`, gridX, gridY);
    changeTokens([...state.tokens, token]);
    recordTokenStep(null, token);
  };

  const moveToken = (id: string, gridX: number, gridY: number) => {
    const before = state.tokens.find((token) => token.id === id);
    if (!before || (before.gridX === gridX && before.gridY === gridY)) return;
    const after = { ...before, gridX, gridY };
    changeTokens(state.tokens.map((token) => token.id === id ? after : token));
    recordTokenStep(before, after);
  };

  const removeToken = (id: string) => {
    const before = state.tokens.find((token) => token.id === id) ?? null;
    changeTokens(state.tokens.filter((token) => token.id !== id));
    setSelectedTokenId(prev => prev === id ? null : prev);
    if (before) recordTokenStep(before, null);
  };

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
        <button
          onClick={undo}
          disabled={!historyManager.canUndo()}
          title={`Undo (Ctrl/Cmd+Z) — ${historyManager.getUndoCount()} step${historyManager.getUndoCount() === 1 ? '' : 's'}`}
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!historyManager.canRedo()}
          title={`Redo (Ctrl/Cmd+Shift+Z) — ${historyManager.getRedoCount()} step${historyManager.getRedoCount() === 1 ? '' : 's'}`}
        >
          Redo
        </button>
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
              onTokenPlace={placeToken}
              onTokenMove={moveToken}
              selectedTokenId={selectedTokenId}
              onTokenSelect={setSelectedTokenId}
              onTokenOpen={(id) => {
                setSelectedTokenId(id);
                setTokenFocus(prev => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
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
            onRemove={removeToken}
            onCommit={recordTokenStep}
            selectedId={selectedTokenId}
            onSelect={setSelectedTokenId}
            focusToken={tokenFocus}
          />
          {notice && <p className="network-notice">{notice}</p>}
          {error && <p className="network-error">{error}</p>}
        </aside>
      </div>
    </div>
  );
}
