import type { AppState } from './types';

export type Role = 'gm' | 'player';

export interface Identity {
  token: string;
  name: string;
  role: Role;
}

export interface Joined extends Identity {
  state: AppState | null;
  version: number;
  players: string[];
}

function httpBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function wsUrl(baseUrl: string, token: string): string {
  const url = new URL(httpBase(baseUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = `?token=${encodeURIComponent(token)}`;
  return url.toString();
}

export async function joinServer(
  baseUrl: string,
  name: string,
  role: Role,
  gmKey?: string
): Promise<Joined> {
  const response = await fetch(`${httpBase(baseUrl)}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, role, gmKey }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `join failed (${response.status})`);
  return body as Joined;
}

export async function uploadAsset(baseUrl: string, identity: Identity, file: File): Promise<string> {
  const response = await fetch(`${httpBase(baseUrl)}/api/assets`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-vtt-token': identity.token,
    },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `upload failed (${response.status})`);
  return new URL(body.url, `${httpBase(baseUrl)}/`).toString();
}

export interface NetworkHandlers {
  onState: (state: AppState) => void;
  onPresence: (players: string[]) => void;
  onClose?: () => void;
}

export function connectSocket(baseUrl: string, identity: Identity, handlers: NetworkHandlers): WebSocket {
  const ws = new WebSocket(wsUrl(baseUrl, identity.token));
  ws.addEventListener('message', (event) => {
    let message: any;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.type === 'state' && message.state) handlers.onState(message.state);
    if (message.type === 'presence') handlers.onPresence(message.players || []);
  });
  ws.addEventListener('close', () => handlers.onClose?.());
  return ws;
}

export function sendGmState(ws: WebSocket | null, state: AppState): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'gm-state', state }));
}

export function sendMove(ws: WebSocket | null, tokenId: string, gridX: number, gridY: number): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'move-token', tokenId, gridX, gridY }));
}

export function sendHp(ws: WebSocket | null, tokenId: string, hp: number, maxHp?: number): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set-hp', tokenId, hp, maxHp }));
  }
}
