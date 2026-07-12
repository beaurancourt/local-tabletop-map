# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development (requires Node.js 20+ and Rust)
npm install              # Install dependencies
npm run tauri dev        # Run in development mode

# Type checking
npx tsc --noEmit

# Production build
npm run tauri build
```

## Architecture Overview

VTT is a Tauri 2.0 desktop app with a React/TypeScript frontend for running tabletop RPGs. It has two windows that communicate via Tauri events:

### Window Architecture

- **DMView** (`src/views/DMView.tsx`): Control panel with full map, tools, and settings. Manages all state.
- **PlayerView** (`src/views/PlayerView.tsx`): Display-only window for TV/second monitor. Receives state via events.

Window detection: `App.tsx` checks `getCurrentWindow().label` - "player" renders PlayerView, otherwise DMView.

### State Management

No Redux/Context - uses React useState with event-based sync between windows:

- `store.ts`: `syncState()` broadcasts state from DM → Player via Tauri `emit()`
- `store.ts`: `onStateSync()` listens for state updates in Player window
- State is synced on every change in DMView via useEffect

**AppState** (defined in `types.ts`):
- `map`: Image, grid settings, dimensions
- `fog`: 2D boolean grid (true=fogged)
- `drawings`: Persistent freehand annotations
- `blocks`: Painted grid cells (Record<"row,col", color>)
- `laserPoints`: Temporary pointer (cleared on release)
- `view`: DM pan/zoom
- `playerViewOffset`: Player camera position
- `calibration`: Pixels per inch for player scaling

### Key Patterns

**Undo/Redo (Command Pattern)** - `history.ts`:
- Operations implement `apply(state)` and `unapply(state)`
- HistoryManager maintains undo/redo stacks (max 100)
- Used for: FogChange, DrawingAdd, DrawingsClear, FogReset, FogClear, BlockChange

**Ref-Based State Tracking**:
Event handlers need latest state but closures capture stale values. Pattern used:
```typescript
const latestFogRef = useRef(state.fog);
latestFogRef.current = state.fog;  // Update every render
// In handlers, use latestFogRef.current
```

**Operation Start/End Callbacks**:
For incremental operations (fog, blocks): capture state before, compute diff after, create single history entry.

**Incremental Fog Rendering**:
`MapCanvas.tsx` uses persistent `fogCanvasRef` - only redraws changed cells for performance.

### Canvas Rendering

Uses Konva/react-konva. Layer order in `MapCanvas.tsx`:
Image → Grid → Fog → Drawings → Laser → Blocks

### Persistence

- `persistence.ts`: Auto-saves to `~/.config/vtt/maps/{hash}.json` (debounced 1s)
- Saves fog, drawings, blocks, grid settings, calibration per map

### Map Formats & Loading

`handleLoadMap` in `DMView.tsx` dispatches on file extension:
- **Image** (`.jpg/.png/.gif/.webp`): loaded directly as the map.
- **`.json` cartographer bundle** (`src/cartographer.ts`): a `{ format: 'cartographer-views', gm, player, grid }` wrapper holding two views. The DM sees `gm`, the player window sees `playerImageUrl` (`player`); `grid.cell_size` overrides the grid size. Views are data URLs or raw SVG, turned into blob URLs via `bundleSrcToObjectUrl` (blob URLs stay cheap to broadcast on every state sync).
- **`.hexm` hex map** (`src/hexmap.ts`): rendered to SVG, with an interactive hex layer.

**Make Bundle tool** (`src/components/BundleCreator.tsx`): a modal (opened from the toolbar) that authors a cartographer bundle from two picked images. Uses `imageBytesToDataUrl` / `buildCartographerBundle` in `cartographer.ts`, and Tauri's `save` dialog + `writeTextFile` (needs `dialog:allow-save` in `src-tauri/capabilities/default.json`).

### Player View Loading

`PlayerView` calls `requestState()` on mount; the DM answers via `onStateRequest` (in `DMView.tsx`) by rebroadcasting current state, so a freshly opened player renders immediately. Fresh maps center the player view: `handleLoadMap` sets `pendingCenterRef`, and the next player-viewport sync computes the centered `playerViewOffset` once the viewport size is known.

### Rust Backend

Minimal - only `open_player_window` command in `src-tauri/src/lib.rs`. All logic is in TypeScript.

## Adding New Features

**New tool**: Add to `Tool` type in `types.ts`, add UI in `Toolbar.tsx`, add handlers in `MapCanvas.tsx`

**New persisted data**: Add to `AppState` and `SavedMapState` in `types.ts`, update `toSavedState()`/`applySavedState()` in `persistence.ts`

**New keyboard shortcut**: Add to keydown listener in `DMView.tsx`
