import { useEffect, useRef, useState } from 'react';
import type { AppState, Token, ViewState } from '../types';
import type { Identity } from '../network';
import { MapCanvas } from '../components/MapCanvas';
import { InitiativeTracker } from '../components/InitiativeTracker';
import { clampHp } from '../tokens';
import { fitView, gmPlayerView, recenterView, zoomView } from '../viewport';

interface Props {
  identity: Identity;
  state: AppState;
  players: string[];
  onMove: (id: string, gridX: number, gridY: number) => void;
  onHp: (id: string, hp: number) => void;
}

type ViewMode = 'fit' | 'gm' | 'local';

export function NetworkPlayerView({ identity, state, players, onMove, onHp }: Props) {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  // The viewport is deliberately component-local: it is never put into
  // AppState, never sent to the server, and never broadcast to another player.
  const [viewMode, setViewMode] = useState<ViewMode>('fit');
  const [localView, setLocalView] = useState<ViewState | null>(null);
  const previousSize = useRef(size);
  // Selecting a token on the map highlights and focuses its HP row in the HUD.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [tokenFocus, setTokenFocus] = useState<{ id: string; nonce: number } | null>(null);
  const hpRefs = useRef<Map<string, HTMLLabelElement>>(new Map());

  useEffect(() => {
    if (!tokenFocus) return;
    hpRefs.current.get(tokenFocus.id)?.querySelector<HTMLInputElement>('input')?.focus();
  }, [tokenFocus]);

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // A new map starts fitted to this player's screen. A reconnect remounts this
  // component, so it also starts fitted; the view is not persisted.
  const mapKey = state.map.filePath || state.map.imageUrl ||
    `${state.map.imageWidth}x${state.map.imageHeight}:${state.map.gridSize}`;
  useEffect(() => {
    setViewMode('fit');
    setLocalView(null);
  }, [mapKey]);

  // Rotating a phone or resizing the window keeps the same map point under the
  // centre for a view the player has panned/zoomed; fit and GM views recompute
  // themselves from the new size / calibration.
  useEffect(() => {
    const previous = previousSize.current;
    if (previous.width !== size.width || previous.height !== size.height) {
      if (viewMode === 'local') {
        setLocalView((view) => view ? recenterView(view, previous, size) : view);
      }
      previousSize.current = size;
    }
  }, [size, viewMode]);

  const fit = fitView(state.map.imageWidth, state.map.imageHeight, size.width, size.height);
  const gm = gmPlayerView(
    state.calibration.pixelsPerInch,
    state.map.gridSize || 50,
    state.playerViewOffset,
  );
  const view = viewMode === 'gm' ? gm : viewMode === 'local' && localView ? localView : fit;
  const centre = { x: size.width / 2, y: size.height / 2 };

  const useView = (next: ViewState) => {
    setLocalView(next);
    setViewMode('local');
  };
  const zoomBy = (factor: number) => useView(zoomView(view, factor, centre, fit.scale, gm.scale));
  const fitToScreen = () => {
    setLocalView(null);
    setViewMode('fit');
  };
  const useGmFraming = () => {
    setLocalView(null);
    setViewMode('gm');
  };

  const mine = state.tokens.filter((token) => token.owner === identity.name);

  return (
    <div className="network-player">
      <div className="network-player-map">
        <MapCanvas
          state={state}
          isPlayerView={true}
          width={size.width}
          height={size.height}
          localView={view}
          onLocalViewChange={useView}
          canMoveToken={(token) => token.owner === identity.name}
          onTokenMove={onMove}
          selectedTokenId={selectedTokenId}
          onTokenSelect={setSelectedTokenId}
          onTokenOpen={(id) => {
            setSelectedTokenId(id);
            setTokenFocus(prev => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
          }}
        />
      </div>
      <div className="network-player-hud">
        <span className="network-brand"><span className="toolbar-pip" /> {identity.name}</span>
        <span className="network-players">{players.join(', ')}</span>
        {mine.length === 0 && <span className="network-hint">No tokens assigned to you yet.</span>}
        {mine.map((token: Token) => (
          <label
            key={token.id}
            className={`network-hp${selectedTokenId === token.id ? ' selected' : ''}`}
            data-token-id={token.id}
            data-selected={selectedTokenId === token.id ? 'true' : undefined}
            ref={(el) => {
              if (el) hpRefs.current.set(token.id, el);
              else hpRefs.current.delete(token.id);
            }}
            onClick={() => setSelectedTokenId(token.id)}
          >
            {token.name}
            <input
              type="number"
              min="0"
              max={token.maxHp > 0 ? token.maxHp : undefined}
              value={token.hp}
              disabled={token.maxHp <= 0}
              onChange={(e) => onHp(token.id, clampHp(Number(e.target.value), token.maxHp))}
            />
            <span>/ {token.maxHp || '—'}</span>
          </label>
        ))}
        <div className="network-view-controls" role="group" aria-label="Map view">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out">−</button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
          <button
            type="button"
            onClick={fitToScreen}
            aria-pressed={viewMode === 'fit'}
            aria-label="Fit the whole map"
            title="Fit the whole map"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={useGmFraming}
            aria-pressed={viewMode === 'gm'}
            aria-label="Use the GM's framing"
            title="Use the GM's framing"
          >
            GM view
          </button>
        </div>
      </div>
      <InitiativeTracker initiative={state.initiative} editable={false} />
    </div>
  );
}
