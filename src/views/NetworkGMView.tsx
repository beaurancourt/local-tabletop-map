import { useEffect, useRef, useState } from 'react';
import type { AppState, Token, ToolState } from '../types';
import type { Identity } from '../network';
import { uploadAsset } from '../network';
import { makeToken } from '../tokens';
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

export function NetworkGMView({ identity, server, state, players, onChange }: Props) {
  const [toolState, setToolState] = useState<ToolState>(() => createDefaultToolState());
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const url = await uploadAsset(server, identity, file);
      const image = new Image();
      image.onload = () => {
        onChange({
          ...state,
          map: {
            ...state.map,
            imageUrl: url,
            playerImageUrl: null,
            filePath: null,
            imageWidth: image.width,
            imageHeight: image.height,
            gridSize: state.map.gridSize || 50,
            gridVisible: true,
            gridOffsetX: 0,
            gridOffsetY: 0,
          },
        });
        setUploading(false);
      };
      image.onerror = () => {
        setError('The server could not decode that image.');
        setUploading(false);
      };
      image.src = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploading(false);
    }
  };

  const changeTokens = (tokens: Token[]) => onChange({ ...state, tokens });
  const setTool = (activeTool: ToolState['activeTool']) => setToolState((prev) => ({ ...prev, activeTool }));

  return (
    <div className="network-gm">
      <header className="network-gm-bar">
        <div className="network-brand"><span className="toolbar-pip" /> VTT GM · {identity.name}</div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Load map'}
        </button>
        <button className={toolState.activeTool === 'token' ? 'active' : ''} onClick={() => setTool('token')}>Place token</button>
        <button className={toolState.activeTool === 'pan' ? 'active' : ''} onClick={() => setTool('pan')}>Pan</button>
        <span className="network-players">At the table: {players.join(', ') || 'no one yet'}</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
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
            <div className="network-waiting"><p>Load a map to begin.</p></div>
          )}
        </div>
        <aside className="network-gm-panel">
          <TokenPanel
            tokens={state.tokens}
            onPlace={() => setTool('token')}
            onChange={(id, patch) => changeTokens(state.tokens.map((token) => token.id === id ? { ...token, ...patch } : token))}
            onRemove={(id) => changeTokens(state.tokens.filter((token) => token.id !== id))}
          />
          {error && <p className="network-error">{error}</p>}
        </aside>
      </div>
    </div>
  );
}
