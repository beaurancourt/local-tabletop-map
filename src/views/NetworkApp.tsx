import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { connectSocket, joinServer, sendGmState, sendHp, sendMove, type Identity, type Role } from '../network';
import { NetworkGMView } from './NetworkGMView';
import { NetworkPlayerView } from './NetworkPlayerView';
import { createDefaultState } from '../store';

const DEFAULT_SERVER = import.meta.env.VITE_VTT_SERVER || window.location.origin;
const STORAGE_NAME = 'vtt-player-name';

export function NetworkApp() {
  const [server, setServer] = useState(() => localStorage.getItem('vtt-server') || DEFAULT_SERVER);
  const [name, setName] = useState(() => localStorage.getItem(STORAGE_NAME) || '');
  const [role, setRole] = useState<Role>('player');
  const [gmKey, setGmKey] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => socketRef.current?.close();
  }, []);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setJoining(true);
    try {
      localStorage.setItem('vtt-server', server);
      localStorage.setItem(STORAGE_NAME, name);
      const joined = await joinServer(server, name, role, role === 'gm' ? gmKey : undefined);
      setIdentity(joined);
      setState(joined.state ?? (role === 'gm' ? createDefaultState() : null));
      setPlayers(joined.players || []);
      const ws = connectSocket(server, joined, {
        onState: setState,
        onPresence: setPlayers,
        onClose: () => setError('Disconnected from the server. Refresh to rejoin.'),
      });
      socketRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  };

  if (!identity) {
    return (
      <div className="network-join">
        <div className="network-card">
          <div className="network-pip" />
          <h1>VTT</h1>
          <p className="network-lede">Join the table on the local network.</p>
          <form onSubmit={join}>
            <label>
              Server
              <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://pop.local:8092" />
            </label>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aria" required />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="player">Player</option>
                <option value="gm">GM</option>
              </select>
            </label>
            {role === 'gm' && (
              <label>
                GM key
                <input type="password" value={gmKey} onChange={(e) => setGmKey(e.target.value)} required />
              </label>
            )}
            <button type="submit" disabled={joining}>{joining ? 'Joining…' : 'Join the table'}</button>
          </form>
          {error && <p className="network-error">{error}</p>}
          <p className="network-note">
            Plain HTTP works for a browser tab. HTTPS is only required for home-screen installation;
            see docs/network.md.
          </p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="network-waiting">
        <div className="network-pip" />
        <h1>VTT</h1>
        <p>Connected as {identity.name}. Waiting for the GM to open the map…</p>
        <div className="network-players">At the table: {players.join(', ') || 'no one yet'}</div>
      </div>
    );
  }

  if (identity.role === 'gm') {
    return (
      <NetworkGMView
        identity={identity}
        server={server}
        state={state}
        players={players}
        onChange={(next) => {
          setState(next);
          sendGmState(socketRef.current, next);
        }}
      />
    );
  }

  return (
    <NetworkPlayerView
      identity={identity}
      state={state}
      players={players}
      onMove={(id, x, y) => sendMove(socketRef.current, id, x, y)}
      onHp={(id, hp) => sendHp(socketRef.current, id, hp)}
    />
  );
}
