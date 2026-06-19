# VTT - Virtual Tabletop

A lightweight virtual tabletop application for running tabletop RPGs on a TV. Features a DM view for controlling the map and a separate player view designed for display on a TV or second monitor.

## Screenshots

### GM View
![GM View](screenshots/gm-view.jpg)

The GM view shows the full map with semi-transparent fog of war, grid overlay, and a green dashed rectangle indicating what players can see. The toolbar provides quick access to fog tools, drawing controls, and settings.

### Player View
![Player View](screenshots/player-view.jpg)

The player view is a clean, distraction-free window designed for display on a TV. It shows only the revealed portions of the map with solid fog of war hiding unexplored areas.

## Features

### DM View
- **Map Loading**: Load any image file as your battle map
- **Grid Overlay**: Configurable grid with adjustable size, color, opacity, and offset
- **Fog of War**: Reveal and hide areas of the map with adjustable brush sizes
- **Drawing Tools**: Annotate the map with freehand drawings
- **Laser Pointer**: Temporarily highlight areas (visible to players in real-time)
- **Pan & Zoom**: Navigate large maps easily
- **Player Viewport Indicator**: See exactly what players can see (green dashed rectangle)

### Player View
- **Clean Interface**: No UI elements - just the map, fog, and drawings
- **Real-time Sync**: Reflects DM's fog reveals, drawings, and laser pointer

### Persistence
- Map state (fog, drawings, grid settings, calibration) is automatically saved
- Reopen a map and pick up exactly where you left off

### Hex Maps (`.hexm`)
Load a `.hexm` file (via **Load Map**) to render a **hex map color-coded by terrain**. The map is generated from the file's metadata (not an image); with the **pan tool**, hovering a hex shows a pointer and **clicking it opens that hex's key** — typically an `obsidian://` link to the matching note (so a hex on the map jumps straight to its write-up in Obsidian).

`.hexm` is JSON:

```jsonc
{
  "format": "vtt-hexmap",
  "version": 1,
  "title": "The Verge",
  "orientation": "flat",        // or "pointy"
  "hexRadius": 34,               // px, center -> vertex
  "cols": 49, "rows": 31,
  "terrains": { "lawful": "#6f9350", "waste": "#6d6962", "water": "#37618f" },
  "defaultTerrain": "unsettled",
  "obsidian": { "vault": "my-vault", "file": "HEXKEY" }, // default click target
  "hexes": [
    { "col": 25, "row": 16, "terrain": "neutral", "label": "32",
      "name": "The Drowned Fort", "link": "13-dungeons/32-drowned-fort" }
    // ...plain terrain hexes need only col/row/terrain
  ]
}
```

- **Coordinates** are 1-based `col`/`row` (matching `CC.RR` hex notation).
- **`link`** may be a full URL (e.g. `obsidian://...`, `https://...`) or a vault-relative note path (optionally `path#heading` — the heading is honored by Obsidian's Advanced URI plugin). A bare path becomes `obsidian://open?vault=<obsidian.vault>&file=<path>`.
- Hexes **without** a `link` fall back to `obsidian.file` (the hex-key doc) on click; hexes with neither stay non-interactive.
- The square grid overlay is hidden automatically for hex maps.

(Implemented in `src/hexmap.ts`; rendered through the same image pipeline as other maps, with the interactive hex layer in `MapCanvas.tsx`.)

## Installation

### Download
Download the latest release for your platform from the [Releases](https://github.com/yourusername/vtt/releases) page:
- **macOS**: `.dmg` installer (available for both Apple Silicon and Intel)
- **Windows**: `.msi` or `.exe` installer

### Build from Source

Prerequisites:
- Node.js 20+
- Rust (stable)

```bash
# Clone the repository
git clone https://github.com/yourusername/vtt.git
cd vtt

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Usage

### Getting Started

1. **Open DM View**: Launch the application
2. **Load a Map**: Click "Load Map" and select an image file
3. **Configure Grid**: Adjust grid size to match your map's grid
4. **Open Player View**: Click "Open Player View" to launch the player window
5. **Position Player View**: Drag the player window to your TV/second monitor

### Keyboard Shortcuts

#### Tools
| Key | Action |
|-----|--------|
| `C` | Fog reveal (clear) |
| `F` | Fog hide |
| `E` | Draw tool (pen) |
| `R` | Laser pointer |
| `B` | Block tool |
| `P` | Pan / select (also opens hex links on `.hexm` maps) |

#### Navigation
| Key | Action |
|-----|--------|
| `WASD` | Pan DM view |
| `Shift+WASD` | Move player viewport |
| `Scroll wheel` | Zoom DM view |

#### Calibration
| Key | Action |
|-----|--------|
| `-` / `=` | Adjust player view scale (PPI) |
| `Shift+R` | Reset calibration to saved value |

#### Grid
| Key | Action |
|-----|--------|
| `Shift+G` | Start grid calibration mode |
| `Shift+IJKL` | Nudge grid offset (1px) |

*In grid calibration mode:*
| Key | Action |
|-----|--------|
| `[` | Grid too big (shrink) |
| `]` | Grid too small (grow) |
| `Enter` | Confirm grid size |
| `Escape` | Cancel |

#### History
| Key | Action |
|-----|--------|
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` | Redo |
| `Ctrl/Cmd+Y` | Redo |

### Tools

- **Fog Reveal**: Click/drag to reveal hidden areas to players
- **Fog Hide**: Click/drag to hide areas from players
- **Draw**: Freehand drawing that persists on the map
- **Laser**: Temporary pointer that disappears when you release

## Development

```bash
# Start development server
npm run tauri dev

# Type check
npx tsc --noEmit

# Build production app
npm run tauri build
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Canvas**: Konva / react-konva
- **Desktop**: Tauri 2.0
- **Persistence**: Tauri FS plugin (saves to app data directory)

## License

MIT
