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
- The pointer rule is the same in the desktop DM, the browser GM and the browser
  player: pressing a token always selects it (and, where permitted, drags it);
  pressing empty map pans. The active tool only changes what an empty-map click
  does — the token tool places a token, and the painting tools draw. Selecting a
  token opens its editor: the settings sidebar on the DM, the Tokens panel on the
  browser GM, and the matching HP row in the player HUD. Double-click focuses the
  editor directly.

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

Each browser player can pan and zoom their own view: drag to pan, wheel or pinch
to zoom, double-tap or **Fit** for the whole map, and **GM view** for the GM's
calibration/framing. That viewport lives only in the player's React component; it
is not in `AppState`, not sent over the WebSocket, and not broadcast to other
players. One player moving their view cannot move anyone else's.

## Undo in the browser GM

The browser GM header has **Undo** and **Redo** buttons, plus `Ctrl/Cmd+Z`,
`Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y`. They use the same `HistoryManager` and
token operations as the desktop DM. A drag is one step; an HP or name edit is one
step on blur/Enter, not one per keystroke; token add, remove and tag edits are one
step each.

Undo is not a local rewind. It computes the previous shared `AppState` and sends
it through the same `gm-state` WebSocket message as every other GM edit; the
server validates and broadcasts the resulting state, so every player sees the
same table. The GM's stack is local to that browser tab and starts empty after a
reload or reconnect; it records the GM's own actions, not player moves. Undoing a
token restores that token's stored value and leaves other tokens alone.

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
- `screenshots/network-player-pan-zoom.png` — a phone-sized player browser panned
  and zoomed into the map, with the local **Fit** and **GM view** controls.
- `screenshots/token-drag-pan-mode.png` — a token mid-drag in the browser GM while
  the **Pan** tool is active; the selected row is highlighted in the Tokens panel.
- `screenshots/token-undo-redo.png` — the browser GM after undoing an HP edit, with
  both Undo and Redo live in the header.

The deployed GM key lives in `server.env` on pop (`chmod 600`), not in this
repository; use it in the GM join form. The LAN firewall on pop allows TCP 8092
from `192.168.1.0/24` only.
