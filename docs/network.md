# LAN play

The player client is a browser app served by a small Node server on `pop`,
reachable as `http://pop.local:8092` on the LAN. There are no accounts and no
internet exposure. The GM uses the browser control surface; the desktop Tauri DM
remains the full offline application.

## Run

Build the browser app and start the server from the repository root:

```bash
npm run build
cd server && npm install && cd ..
VTT_GM_KEY=choose-a-key PORT=8092 node server/index.mjs
```

Then open `http://pop.local:8092/` (or the machine's LAN address):

- **GM:** Role GM, the same `VTT_GM_KEY`, then **Load map** and **Place token**.
- **Player:** Role Player and a name. The name is the identity; the GM assigns a
  token's `owner` to that name in the Tokens panel.
- A player can drag only their own tokens and edit only their current HP. The GM
  can do both to every token. The server validates the owner and the HP bounds; a
  player cannot change someone else's token by sending an intent.

The browser GM surface handles the map, tokens, names, HP and tags. Fog, drawings,
text labels and the initiative tracker remain in the Tauri DM window; they are not
part of the browser control surface yet.

## Loading a map

**Load map** accepts map images (`image/*`), a saved map state (`.json`) and a
hex map (`.hexm`).

- **Image:** uploaded to the server; its natural size becomes the map size.
- **Saved map state:** applied immediately and broadcast. A saved state stores
  only the image's original local `filePath` and its dimensions, never the image
  bytes, and a browser cannot read the GM laptop's disk. So the state is accepted
  without its image: the grid, fog, drawings, blocks, labels, view and tokens
  arrive, and the GM loads the matching image next. That image fills in the
  visual without replacing the restored state. If the session already serves an
  image with exactly the saved dimensions, it is reused instead. Refusing the
  state would throw away work the browser can actually use; silently pairing it
  with an arbitrary image would misalign the grid.
- **Hex map:** the `.hexm` metadata is validated and rendered to two SVGs (GM
  with hex labels, players without), both uploaded to `/media`. The map keeps the
  hex geometry and per-hex links, and the square grid is hidden.

Only a genuine `SavedMapState` is accepted as `.json`; any other JSON is rejected
with a readable message and the current table is left untouched. A cartographer
"both views" bundle (also `.json`) is not supported in the browser yet.

## Authority and identity

The server owns the state (`server/data/state.json` and uploaded media in
`server/data/assets`). The GM client sends full state; players send only
`move-token` and `set-hp` intents. The server checks the token owner against the
session name, clamps HP to `0..maxHp`, and broadcasts the result to everyone. The
WebSocket is `/ws?token=<session token>`; the HTTP join gives a random session
token and the GM key is separate. Names are unique while connected.

Map images are uploaded by the GM to `/api/assets`; the server serves them from
`/media/<id>` so both the GM and players use the same URL. The image lives on the
server, not on the GM's laptop.

## Deploy on pop

```bash
# from the repo, after npm run build
rsync -a --delete dist server pop.local:~/vtt/
ssh pop.local 'cd ~/vtt/server && npm install --omit=dev'
```

Create `~/.config/systemd/user/vtt-net.service`:

```ini
[Unit]
Description=VTT LAN server
After=network-online.target

[Service]
WorkingDirectory=/home/beau/vtt
ExecStart=/usr/bin/node server/index.mjs
Environment=PORT=8092
Environment=VTT_GM_KEY=choose-a-key
Restart=always

[Install]
WantedBy=default.target
```

Then `systemctl --user daemon-reload && systemctl --user enable --now vtt-net`.
`loginctl show-user beau -p Linger` should already report `yes` on pop, so the
service survives logout. Check `curl http://pop.local:8092/health`.

No public gate is required for a trusted LAN. If the LAN is not trusted, put the
service behind Caddy or another password gate; the server itself has no account
system and should not be exposed to the internet.

## HTTPS and PWA

Plain HTTP works as a browser tab, and that is the tested path. Service workers and
home-screen installation require a secure context; `http://pop.local` is not one.
The optional HTTPS path is mkcert on pop plus installing the local CA on every
phone (or Tailscale Serve), then serving the same app over HTTPS. The app registers
a service worker only when `window.isSecureContext`; without it the app behaves the
same, just without installation/offline shell. A public tunnel is deliberately not
used: this is a LAN feature.

## Limits

- The GM web surface is the network control surface for map/tokens/HP/tags. The
  desktop application keeps the full DM toolset offline.
- There is one table per server process, no rooms and no persistent accounts.
- The server state and assets persist on pop; deleting `server/data` starts fresh.
- The PWA is an enhancement, not a requirement; no service worker is needed for
  play over the LAN.

## Proof screenshots

- `screenshots/network-gm.png` — the GM browser control surface at pop, with the
  uploaded map, Aria's token, HP and owner.
- `screenshots/network-player.png` — the player browser for Aria after moving the
  token to a new cell and setting HP to 12; the GM state reflects the same token.

The deployed GM key lives in `server.env` on pop (`chmod 600`), not in this
repository; use it in the GM join form. The LAN firewall on pop allows TCP 8092
from `192.168.1.0/24` only.
