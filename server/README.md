# VTT LAN server

Plain Node HTTP + WebSocket server for the browser client. See `docs/network.md`
for identity, authority, deployment and the LAN/HTTPS decisions.

```bash
cd server && npm install
VTT_GM_KEY=change-me PORT=8092 node index.mjs
```

The server serves `../dist` (run `npm run build` in the repository root) and
keeps state plus uploaded map assets under `server/data/`.
