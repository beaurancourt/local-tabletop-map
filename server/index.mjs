// LAN server for the VTT: a browser player client, a browser GM control surface,
// and one authoritative copy of the shared AppState.
//
//   VTT_GM_KEY=... PORT=8092 node server/index.mjs
//
// State and uploaded map assets live in server/data so a restart keeps the table.
// This is deliberately plain HTTP: pop.local is a LAN name, not a secure context;
// the app works as a browser tab. HTTPS/PWA is an optional local-cert step (see
// docs/network.md).

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8092);
const GM_KEY = process.env.VTT_GM_KEY || 'vtt-gm';
const ROOT = resolve(process.cwd());
const DATA = join(ROOT, 'server', 'data');
const ASSETS = join(DATA, 'assets');
const STATE_FILE = join(DATA, 'state.json');
const STATIC = join(ROOT, 'dist');
const MAX_ASSET = 24 * 1024 * 1024;

const sessions = new Map(); // token -> { name, role, ws }
let state = null;
let version = 0;

await mkdir(ASSETS, { recursive: true });
try {
  state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  version = Number(state?.version) || 0;
} catch {
  state = null;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function tokenFor() {
  return randomBytes(24).toString('hex');
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 32);
}

function presence() {
  return [...sessions.values()]
    .filter((s) => s.role === 'player')
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b));
}

function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(message, except) {
  for (const session of sessions.values()) {
    if (session.ws && session.ws !== except) send(session.ws, message);
  }
}

function broadcastState() {
  version += 1;
  if (state) state.version = version;
  const message = { type: 'state', state, version };
  broadcast(message);
  broadcastPresence();
  persistState();
}

function broadcastPresence() {
  const message = { type: 'presence', players: presence() };
  broadcast(message);
}

let saveTimer = null;
function persistState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('state save failed:', error);
    }
  }, 150);
}

async function readBody(req, limit = MAX_ASSET) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function bearer(req, url) {
  const header = req.headers['x-vtt-token'];
  if (typeof header === 'string' && header) return header;
  return url.searchParams.get('token') || '';
}

function findSession(req, url) {
  return sessions.get(bearer(req, url)) || null;
}

function contentType(name) {
  const ext = extname(name).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
  }[ext] || 'application/octet-stream';
}

async function serveFile(res, file) {
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    res.writeHead(200, {
      'Content-Type': contentType(file),
      'Content-Length': info.size,
      'Cache-Control': file.startsWith(ASSETS) ? 'public, max-age=3600' : 'no-store',
    });
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/health') return json(res, 200, { status: 'ok', version, players: presence() });
  if (path === '/api/state') return json(res, 200, { state, version });

  if (path === '/api/join' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'));
    } catch {
      return json(res, 400, { error: 'invalid json' });
    }
    const name = cleanName(body.name);
    const wantsGm = body.role === 'gm' || Boolean(body.gmKey);
    if (wantsGm) {
      if (String(body.gmKey || '') !== GM_KEY) return json(res, 403, { error: 'bad GM key' });
      const token = tokenFor();
      sessions.set(token, { name: name || 'GM', role: 'gm', ws: null });
      return json(res, 200, { token, name: name || 'GM', role: 'gm', state, version, players: presence() });
    }
    if (!name) return json(res, 400, { error: 'name required' });
    for (const session of sessions.values()) {
      if (session.name.toLowerCase() === name.toLowerCase()) {
        return json(res, 409, { error: 'that name is already connected' });
      }
    }
    const token = tokenFor();
    sessions.set(token, { name, role: 'player', ws: null });
    return json(res, 200, { token, name, role: 'player', state, version, players: presence() });
  }

  if (path === '/api/assets' && req.method === 'POST') {
    const session = findSession(req, url);
    if (!session || session.role !== 'gm') return json(res, 403, { error: 'GM only' });
    const contentTypeHeader = String(req.headers['content-type'] || 'application/octet-stream');
    if (!contentTypeHeader.startsWith('image/')) return json(res, 415, { error: 'image required' });
    let bytes;
    try {
      bytes = await readBody(req);
    } catch {
      return json(res, 413, { error: 'asset too large' });
    }
    const id = randomBytes(16).toString('hex') + (contentTypeHeader.includes('svg') ? '.svg' : contentTypeHeader.includes('png') ? '.png' : contentTypeHeader.includes('webp') ? '.webp' : '.jpg');
    await writeFile(join(ASSETS, id), bytes);
    return json(res, 200, { url: `/media/${id}` });
  }

  if (path.startsWith('/media/')) {
    const name = path.slice('/media/'.length);
    if (!/^[a-f0-9]+\.(svg|png|jpg|jpeg|webp)$/.test(name)) return json(res, 404, { error: 'not found' });
    if (await serveFile(res, join(ASSETS, name))) return;
    return json(res, 404, { error: 'not found' });
  }

  // Static browser app. A client-side path falls back to index.html.
  if (req.method === 'GET' || req.method === 'HEAD') {
    const relative = normalize(path).replace(/^([/\\])+/, '');
    const candidate = join(STATIC, relative || 'index.html');
    if (!candidate.startsWith(STATIC + sep) && candidate !== STATIC) {
      return json(res, 403, { error: 'forbidden' });
    }
    if (await serveFile(res, candidate)) return;
    if (await serveFile(res, join(STATIC, 'index.html'))) return;
  }

  json(res, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws') return socket.destroy();
  const token = url.searchParams.get('token') || '';
  const session = sessions.get(token);
  if (!session) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    session.ws = ws;
    send(ws, { type: 'hello', name: session.name, role: session.role, version, players: presence() });
    if (state) send(ws, { type: 'state', state, version });
    broadcastPresence();
    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      handleMessage(session, message, ws);
    });
    ws.on('close', () => {
      if (session.ws === ws) session.ws = null;
      if (session.role === 'player') sessions.delete(token);
      broadcastPresence();
    });
  });
});

function isValidGrid(value) {
  return Number.isInteger(value) && value >= -1 && value <= 10000;
}

function handleMessage(session, message, ws) {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'gm-state' && session.role === 'gm') {
    if (!message.state || !Array.isArray(message.state.tokens)) return;
    state = message.state;
    broadcastState();
    return;
  }

  if (message.type === 'move-token' && state) {
    const token = state.tokens.find((candidate) => candidate.id === message.tokenId);
    if (!token) return;
    if (session.role !== 'gm' && token.owner !== session.name) return;
    if (!isValidGrid(message.gridX) || !isValidGrid(message.gridY)) return;
    token.gridX = message.gridX;
    token.gridY = message.gridY;
    broadcastState();
    return;
  }

  if (message.type === 'set-hp' && state) {
    const token = state.tokens.find((candidate) => candidate.id === message.tokenId);
    if (!token) return;
    if (session.role !== 'gm' && token.owner !== session.name) return;
    // Players may change current HP only; max HP is a GM edit.
    const maxHp = session.role === 'gm' && Number.isFinite(Number(message.maxHp))
      ? Number(message.maxHp)
      : token.maxHp;
    if (!Number.isFinite(Number(message.hp)) || maxHp < 0) return;
    token.maxHp = Math.max(0, Math.round(maxHp));
    token.hp = Math.max(0, Math.min(Math.round(Number(message.hp)), token.maxHp));
    broadcastState();
    return;
  }

  if (message.type === 'request-state' && state) {
    send(ws, { type: 'state', state, version });
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`VTT server listening on http://0.0.0.0:${PORT} (GM key ${GM_KEY === 'vtt-gm' ? 'DEFAULT vtt-gm' : 'set'})`);
});
