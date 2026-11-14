import { useEffect, useState } from 'react';
import type { AppState, Token } from '../types';
import type { Identity } from '../network';
import { MapCanvas } from '../components/MapCanvas';
import { InitiativeTracker } from '../components/InitiativeTracker';
import { clampHp } from '../tokens';

interface Props {
  identity: Identity;
  state: AppState;
  players: string[];
  onMove: (id: string, gridX: number, gridY: number) => void;
  onHp: (id: string, hp: number) => void;
}

export function NetworkPlayerView({ identity, state, players, onMove, onHp }: Props) {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const mine = state.tokens.filter((token) => token.owner === identity.name);

  return (
    <div className="network-player">
      <div className="network-player-map">
        <MapCanvas
          state={state}
          isPlayerView={true}
          width={size.width}
          height={size.height}
          canMoveToken={(token) => token.owner === identity.name}
          onTokenMove={onMove}
        />
      </div>
      <div className="network-player-hud">
        <span className="network-brand"><span className="toolbar-pip" /> {identity.name}</span>
        <span className="network-players">{players.join(', ')}</span>
        {mine.length === 0 && <span className="network-hint">No tokens assigned to you yet.</span>}
        {mine.map((token: Token) => (
          <label key={token.id} className="network-hp">
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
      </div>
      <InitiativeTracker initiative={state.initiative} editable={false} />
    </div>
  );
}
