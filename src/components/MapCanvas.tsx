import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Stage, Layer, Image, Line, Rect, Circle, Group, Label, Tag, Text } from 'react-konva';
import Konva from 'konva';
import { AppState, ToolState, Drawing, DrawingPoint, PlayerViewport, TextLabel, Token, ViewState } from '../types';
import { modifyFog, modifyBlocks } from '../store';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hexAtPoint, linkForHex } from '../hexmap';
import { healthColor, healthRatio, tokenCenter, cellForPoint } from '../tokens';
import { fitView, gmPlayerView, panView, pinchView, zoomView } from '../viewport';
import { emptyMapPans, mapPress } from '../tokenInteraction';

interface MapCanvasProps {
  state: AppState;
  toolState?: ToolState;
  isPlayerView?: boolean;
  onStateChange?: (state: AppState) => void;
  onFogOperationStart?: () => void; // Called when fog operation starts
  onFogOperationEnd?: () => void; // Called when fog operation ends
  onDrawingAdded?: (drawing: Drawing) => void; // Called when a drawing is completed
  onBlockOperationStart?: () => void; // Called when block operation starts
  onBlockOperationEnd?: () => void; // Called when block operation ends
  onTextLabelCommit?: (id: string, before: TextLabel | null, after: TextLabel | null) => void; // Text label add/edit/remove (for history)
  onTokenPlace?: (gridX: number, gridY: number) => void;
  onTokenMove?: (id: string, gridX: number, gridY: number) => void;
  canMoveToken?: (token: Token) => boolean;
  // Selection/inspection is owned by the view: the DM opens the settings
  // sidebar, the browser GM highlights its token panel, and the player focuses
  // the matching HP row in the HUD.
  selectedTokenId?: string | null;
  onTokenSelect?: (id: string) => void;
  onTokenOpen?: (id: string) => void; // double-click/tap: open the editor directly
  width: number;
  height: number;
  playerViewport?: PlayerViewport | null;
  onHexHover?: (hex: { col: number; row: number } | null) => void; // .hexm hover (DM)
  // Browser players own their view. The Tauri player window does not pass these,
  // so it keeps the DM-controlled calibration/playerViewOffset framing.
  localView?: ViewState | null;
  onLocalViewChange?: (view: ViewState) => void;
}

interface PlayerGesture {
  pointers: Map<number, { x: number; y: number }>;
  startView: ViewState;
  startPoint: { x: number; y: number };
  startDistance: number;
  startMid: { x: number; y: number };
  moved: boolean;
  pinched: boolean;
  startTime: number;
}

export function MapCanvas({
  state,
  toolState,
  isPlayerView = false,
  onStateChange,
  onFogOperationStart,
  onFogOperationEnd,
  onDrawingAdded,
  onBlockOperationStart,
  onBlockOperationEnd,
  onTextLabelCommit,
  onTokenPlace,
  onTokenMove,
  canMoveToken,
  selectedTokenId = null,
  onTokenSelect,
  onTokenOpen,
  width,
  height,
  playerViewport,
  onHexHover,
  localView,
  onLocalViewChange,
}: MapCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFogging, setIsFogging] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingPoint[]>([]);
  // Text label being edited (DM only). `before` is the pre-edit label, or null
  // for a brand-new label; `draft` holds the in-progress edits.
  const [editingLabel, setEditingLabel] = useState<{ before: TextLabel | null; draft: TextLabel } | null>(null);
  const editingRef = useRef(editingLabel);
  editingRef.current = editingLabel;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track latest state for operation completion (avoids stale closure issues)
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  // Browser players get their own view. A null/absent localView means the
  // player default (fit to their screen); the Tauri player window has no
  // callback and keeps the calibrated GM player framing.
  const localPlayer = isPlayerView && Boolean(onLocalViewChange);
  const safeGridSize = state.map.gridSize || 50;
  const playerScale = state.calibration.pixelsPerInch / safeGridSize;
  const fit = fitView(state.map.imageWidth, state.map.imageHeight, width, height);
  const gmView = gmPlayerView(
    state.calibration.pixelsPerInch,
    safeGridSize,
    state.playerViewOffset,
  );
  const playerView = localView ?? (localPlayer ? fit : gmView);
  const effectiveScale = isPlayerView ? playerView.scale : state.view.scale;
  const effectiveOffset = isPlayerView
    ? { x: playerView.offsetX, y: playerView.offsetY }
    : { x: state.view.offsetX, y: state.view.offsetY };
  const playerViewRef = useRef(playerView);
  playerViewRef.current = playerView;
  const pointerGestureRef = useRef<PlayerGesture | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  // A pan drag with the token tool must not also drop a token when it ends.
  const layerDragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Persistent fog canvas for incremental updates
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastFogStateRef = useRef<{ cells: boolean[][], gridSize: number, offsetX: number, offsetY: number } | null>(null);
  const fogImageRef = useRef<Konva.Image | null>(null);

  // Update fog canvas incrementally
  const fogCanvas = useMemo(() => {
    if (state.fog.rows === 0 || state.fog.cols === 0) return null;

    const gridSize = state.map.gridSize || 50;
    const needsFullRedraw = !fogCanvasRef.current ||
      fogCanvasRef.current.width !== state.map.imageWidth ||
      fogCanvasRef.current.height !== state.map.imageHeight ||
      !lastFogStateRef.current ||
      lastFogStateRef.current.gridSize !== gridSize ||
      lastFogStateRef.current.offsetX !== state.map.gridOffsetX ||
      lastFogStateRef.current.offsetY !== state.map.gridOffsetY ||
      lastFogStateRef.current.cells.length !== state.fog.rows ||
      (lastFogStateRef.current.cells[0]?.length || 0) !== state.fog.cols;

    if (needsFullRedraw) {
      // Full redraw needed
      const canvas = document.createElement('canvas');
      canvas.width = state.map.imageWidth;
      canvas.height = state.map.imageHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Disable image smoothing to prevent anti-aliasing artifacts
      ctx.imageSmoothingEnabled = false;

      // Fill entire canvas black first, then clear revealed areas
      // This prevents gaps between cells with decimal grid sizes
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear revealed areas (where fog is false)
      for (let row = 0; row < state.fog.rows; row++) {
        for (let col = 0; col < state.fog.cols; col++) {
          if (!state.fog.cells[row]?.[col]) {
            // Use Math.floor for position and Math.ceil for size to ensure full coverage
            const x = Math.floor(state.map.gridOffsetX + col * gridSize);
            const y = Math.floor(state.map.gridOffsetY + row * gridSize);
            const w = Math.ceil(gridSize) + 1;
            const h = Math.ceil(gridSize) + 1;
            ctx.clearRect(x, y, w, h);
          }
        }
      }

      fogCanvasRef.current = canvas;
      fogCtxRef.current = ctx;
      lastFogStateRef.current = {
        cells: state.fog.cells.map(row => [...row]),
        gridSize,
        offsetX: state.map.gridOffsetX,
        offsetY: state.map.gridOffsetY,
      };
      return canvas;
    }

    // Incremental update - only redraw changed cells
    const ctx = fogCtxRef.current;
    const lastCells = lastFogStateRef.current!.cells;
    if (ctx) {
      ctx.fillStyle = '#000000';
      for (let row = 0; row < state.fog.rows; row++) {
        for (let col = 0; col < state.fog.cols; col++) {
          const wasFogged = lastCells[row]?.[col] ?? false;
          const isFogged = state.fog.cells[row]?.[col] ?? false;
          if (wasFogged !== isFogged) {
            // Use Math.floor for position and Math.ceil for size to prevent gaps
            const x = Math.floor(state.map.gridOffsetX + col * gridSize);
            const y = Math.floor(state.map.gridOffsetY + row * gridSize);
            const w = Math.ceil(gridSize) + 1;
            const h = Math.ceil(gridSize) + 1;
            if (isFogged) {
              ctx.fillRect(x, y, w, h);
            } else {
              ctx.clearRect(x, y, w, h);
            }
            lastCells[row][col] = isFogged;
          }
        }
      }
    }

    return fogCanvasRef.current;
  }, [state.fog, state.map.gridSize, state.map.gridOffsetX, state.map.gridOffsetY, state.map.imageWidth, state.map.imageHeight]);

  // Incremental updates above mutate fogCanvasRef.current's pixels in place
  // and return the SAME canvas element reference, so react-konva's <Image>
  // sees an unchanged `image` prop and won't know to redraw. Force a redraw
  // whenever the fog data actually changes (this effect's deps are plain
  // values/new-each-time objects, unlike fogCanvas's stable ref, so it fires
  // every time). Without this, the player window's fog reveal only appears
  // to "catch up" whenever some other prop change happens to force a redraw
  // (e.g. panning the player viewport).
  useEffect(() => {
    fogImageRef.current?.getLayer()?.batchDraw();
  }, [state.fog]);

  // Load map image. In the player window, prefer the player-facing image
  // (a cartographer bundle supplies a separate one); otherwise fall back to
  // the shared/DM image.
  const activeImageUrl =
    isPlayerView && state.map.playerImageUrl
      ? state.map.playerImageUrl
      : state.map.imageUrl;
  useEffect(() => {
    if (activeImageUrl) {
      const img = new window.Image();
      img.src = activeImageUrl;
      img.onload = () => setImage(img);
    } else {
      setImage(null);
    }
  }, [activeImageUrl]);

  // Wheel zoom: the DM changes shared state, the browser player changes only
  // its local view. The Tauri player window has no local callback and ignores it.
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    if (isPlayerView) {
      if (!onLocalViewChange) return;
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = Math.exp(-e.evt.deltaY * 0.0015);
      onLocalViewChange(zoomView(playerViewRef.current, factor, pointer, fit.scale, playerScale));
      return;
    }
    if (!onStateChange) return;
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = state.view.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - state.view.offsetX) / oldScale,
      y: (pointer.y - state.view.offsetY) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    // Let the map zoom out enough to fit the whole image on screen (with room
    // to spare), rather than a flat 0.1 floor — a fixed floor works for
    // small maps but silently stops large ones (e.g. 8000+px wide) from ever
    // fitting in the viewport.
    const fitScale = Math.min(width / state.map.imageWidth, height / state.map.imageHeight) || 0.1;
    const minScale = Math.min(0.1, fitScale / 2);
    const newScale = Math.max(minScale, Math.min(5, oldScale * (1 + direction * 0.1)));

    onStateChange({
      ...state,
      view: {
        ...state.view,
        scale: newScale,
        offsetX: pointer.x - mousePointTo.x * newScale,
        offsetY: pointer.y - mousePointTo.y * newScale,
      },
    });
  }, [state, isPlayerView, onStateChange, onLocalViewChange, fit.scale, playerScale, width, height]);

  // Browser-player gestures: one pointer pans, two pinch, double-tap fits.
  // A press on a token belongs to the token: the player's own token drags, and
  // anyone else's token is still selected instead of starting a pan.
  const stagePointFromEvent = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.container().getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const tokenNodeAt = useCallback((point: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage) return null;
    let node: Konva.Node | null = stage.getIntersection(point);
    while (node && node !== stage) {
      if (node.name() === 'token') return node;
      node = node.getParent();
    }
    return null;
  }, []);

  const handlePlayerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!localPlayer || !onLocalViewChange) return;
    const point = stagePointFromEvent(event);
    if (!point) return;
    const tokenNode = tokenNodeAt(point);
    if (tokenNode) {
      const id = tokenNode.id();
      if (id) onTokenSelect?.(id);
      return;
    }

    let gesture = pointerGestureRef.current;
    if (!gesture) {
      gesture = {
        pointers: new Map(),
        startView: playerViewRef.current,
        startPoint: point,
        startDistance: 1,
        startMid: point,
        moved: false,
        pinched: false,
        startTime: performance.now(),
      };
    }
    gesture.pointers.set(event.pointerId, point);
    if (gesture.pointers.size === 1) {
      gesture.startView = playerViewRef.current;
      gesture.startPoint = point;
      gesture.startDistance = 1;
      gesture.startMid = point;
      gesture.moved = false;
      gesture.pinched = false;
      gesture.startTime = performance.now();
    } else if (gesture.pointers.size === 2) {
      const [a, b] = Array.from(gesture.pointers.values());
      gesture.startView = playerViewRef.current;
      gesture.startDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      gesture.startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture.moved = true;
      gesture.pinched = true;
    }
    pointerGestureRef.current = gesture;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the browser may have already released it */
    }
    event.preventDefault();
  }, [localPlayer, onLocalViewChange, onTokenSelect, stagePointFromEvent, tokenNodeAt]);

  const handlePlayerPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerGestureRef.current;
    if (!localPlayer || !onLocalViewChange || !gesture || !gesture.pointers.has(event.pointerId)) return;
    const point = stagePointFromEvent(event);
    if (!point) return;
    gesture.pointers.set(event.pointerId, point);

    if (gesture.pointers.size >= 2) {
      const [a, b] = Array.from(gesture.pointers.values());
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      onLocalViewChange(
        pinchView(gesture.startView, gesture.startDistance, gesture.startMid, distance, mid, fit.scale, playerScale),
      );
      gesture.moved = true;
      gesture.pinched = true;
    } else {
      const dx = point.x - gesture.startPoint.x;
      const dy = point.y - gesture.startPoint.y;
      if (Math.hypot(dx, dy) > 4) gesture.moved = true;
      if (gesture.moved) onLocalViewChange(panView(gesture.startView, dx, dy));
    }
    event.preventDefault();
  }, [fit.scale, localPlayer, onLocalViewChange, playerScale, stagePointFromEvent]);

  const handlePlayerPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerGestureRef.current;
    if (!localPlayer || !onLocalViewChange || !gesture) return;
    gesture.pointers.delete(event.pointerId);
    if (gesture.pointers.size === 0) {
      const point = stagePointFromEvent(event);
      const now = performance.now();
      if (point && !gesture.moved && !gesture.pinched && now - gesture.startTime < 350) {
        const last = lastTapRef.current;
        if (last && now - last.time < 320 && Math.hypot(point.x - last.x, point.y - last.y) < 30) {
          onLocalViewChange(fit);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { time: now, x: point.x, y: point.y };
        }
      } else {
        lastTapRef.current = null;
      }
      pointerGestureRef.current = null;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be gone */
    }
  }, [fit, localPlayer, onLocalViewChange, stagePointFromEvent]);

  const handlePlayerPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerGestureRef.current = null;
    lastTapRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be gone */
    }
  }, []);

  // Get grid position from pointer
  const getGridPosition = useCallback((stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;

    const x = (pointer.x - state.view.offsetX) / state.view.scale;
    const y = (pointer.y - state.view.offsetY) / state.view.scale;

    const gridSize = state.map.gridSize || 50;
    // Account for grid offset when calculating cell position
    return {
      gridX: Math.floor((x - state.map.gridOffsetX) / gridSize),
      gridY: Math.floor((y - state.map.gridOffsetY) / gridSize),
      x,
      y,
    };
  }, [state.view, state.map.gridSize, state.map.gridOffsetX, state.map.gridOffsetY]);

  // --- Text label editing (DM only) ---

  // Commit the label currently being edited: empty text removes the label
  // (or discards a brand-new one); non-empty text adds/updates it.
  const commitEdit = useCallback(() => {
    // Read from a ref (not the setState updater) so we can safely call the
    // parent's onStateChange here rather than as a side effect during render.
    const cur = editingRef.current;
    if (!cur) return; // already committed (guards Enter + blur firing together)
    editingRef.current = null;

    const text = cur.draft.text.trim();
    const before = cur.before;

    if (!text) {
      // Empty: delete an existing label, or discard a brand-new one.
      if (before && onStateChange) {
        onStateChange({
          ...latestStateRef.current,
          textLabels: latestStateRef.current.textLabels.filter(l => l.id !== before.id),
        });
        onTextLabelCommit?.(before.id, before, null);
      }
      setEditingLabel(null);
      return;
    }

    const after: TextLabel = { ...cur.draft, text };
    if (onStateChange) {
      const others = latestStateRef.current.textLabels.filter(l => l.id !== after.id);
      onStateChange({ ...latestStateRef.current, textLabels: [...others, after] });
    }

    // Only record history if something actually changed.
    const changed =
      !before ||
      before.text !== after.text ||
      before.color !== after.color ||
      before.bgColor !== after.bgColor;
    if (changed) onTextLabelCommit?.(after.id, before, after);
    setEditingLabel(null);
  }, [onStateChange, onTextLabelCommit]);

  const cancelEdit = useCallback(() => {
    editingRef.current = null;
    setEditingLabel(null);
  }, []);

  // Focus and select the textarea when an edit *begins* (keyed on the label id,
  // not on every keystroke — otherwise re-selecting all text each keystroke
  // makes the next character overwrite it). Deferred to the next tick so it
  // runs after the click's mouseup/click finish; otherwise the click on the
  // (non-focusable) canvas blurs the textarea and discards the empty label.
  const editingId = editingLabel?.draft.id ?? null;
  useEffect(() => {
    if (!editingId) return;
    const id = window.setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.select();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [editingId]);

  const isTokenTarget = useCallback((target: Konva.Node) => {
    let node: Konva.Node | null = target;
    while (node) {
      if (node.name() === 'token') return true;
      node = node.getParent();
    }
    return false;
  }, []);

  // Handle mouse down
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPlayerView || !onStateChange || !toolState) return;

    const stage = stageRef.current;
    if (!stage) return;

    // Clear the previous press's pan marker; a real drag re-creates it below.
    layerDragRef.current = null;

    // A token press belongs to the token, whatever the tool. The token group is
    // draggable, and painting must not start underneath the drag.
    const press = mapPress({
      onToken: isTokenTarget(e.target),
      activeTool: toolState.activeTool,
      dragged: false,
    });
    if (press !== 'tool') return;

    const pos = getGridPosition(stage);
    if (!pos) return;

    if (toolState.activeTool === 'text') {
      // Existing labels handle themselves: a click edits, a drag moves (see the
      // Label's onClick/onDragEnd). Only a click on empty space creates a new one.
      const target = e.target;
      const parent = target.getParent();
      const onLabel =
        target.name() === 'textLabel' ||
        !!(parent && parent.name?.() === 'textLabel');
      if (onLabel) return;

      const fontSize = Math.max(14, Math.round((state.map.gridSize || 50) * 0.5));
      const draft: TextLabel = {
        id: Date.now().toString(),
        x: pos.x,
        y: pos.y,
        text: '',
        color: toolState.textColor,
        bgColor: toolState.textBgColor,
        fontSize,
      };
      setEditingLabel({ before: null, draft });
      return;
    }

    if (toolState.activeTool === 'fogReveal' || toolState.activeTool === 'fogHide') {
      setIsFogging(true);
      onFogOperationStart?.();
      const reveal = toolState.activeTool === 'fogReveal';
      const newFog = modifyFog(state.fog, pos.gridX, pos.gridY, toolState.brushSize, reveal);
      onStateChange({ ...state, fog: newFog });
    } else if (toolState.activeTool === 'draw') {
      setIsDrawing(true);
      setCurrentDrawing([{ x: pos.x, y: pos.y }]);
    } else if (toolState.activeTool === 'laser') {
      setIsDrawing(true);
      // Update laserPoints and laserColor in state for sync to player view
      onStateChange({ ...state, laserPoints: [{ x: pos.x, y: pos.y }], laserColor: toolState.laserColor });
    } else if (toolState.activeTool === 'block') {
      setIsBlocking(true);
      onBlockOperationStart?.();
      const newBlocks = modifyBlocks(state.blocks, pos.gridX, pos.gridY, toolState.brushSize, toolState.blockColor);
      onStateChange({ ...state, blocks: newBlocks });
    }
  }, [isPlayerView, onStateChange, onFogOperationStart, onTokenPlace, toolState, state, getGridPosition, isTokenTarget]);

  // A genuine click (not the release of a pan drag) on empty map: the token
  // tool places a token, and the pan tool opens a `.hexm` hex link.
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPlayerView || !toolState) return;

    const drag = layerDragRef.current;
    layerDragRef.current = null;
    if (drag?.moved) return;
    if (isTokenTarget(e.target)) return;

    const stage = stageRef.current;
    if (!stage) return;
    const pos = getGridPosition(stage);
    if (!pos) return;

    if (toolState.activeTool === 'token') {
      onTokenPlace?.(pos.gridX, pos.gridY);
      return;
    }
    if (toolState.activeTool !== 'pan') return;

    const meta = state.map.hexmap;
    if (!meta) return;
    const hex = hexAtPoint(meta, pos.x, pos.y);
    if (!hex) return;
    const url = linkForHex(meta, hex.col, hex.row);
    if (url) openUrl(url).catch(err => console.error('Failed to open hex link:', err));
  }, [isPlayerView, toolState, state.map.hexmap, getGridPosition, isTokenTarget, onTokenPlace]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPlayerView || !onStateChange || !toolState) return;

    const stage = stageRef.current;
    if (!stage) return;

    // On a `.hexm` map: report the hovered hex (for the tooltip, any tool) and
    // show a pointer over linkable hexes (pan tool, which opens the link).
    const hexmap = state.map.hexmap;
    if (hexmap) {
      const hoverPos = getGridPosition(stage);
      const hoverHex = hoverPos ? hexAtPoint(hexmap, hoverPos.x, hoverPos.y) : null;
      onHexHover?.(hoverHex);
      const linked = hoverHex && toolState.activeTool === 'pan'
        ? !!linkForHex(hexmap, hoverHex.col, hoverHex.row)
        : false;
      stage.container().style.cursor = linked ? 'pointer' : 'default';
    }

    // Check if mouse button is held
    if (!(e.evt.buttons & 1)) return;

    const pos = getGridPosition(stage);
    if (!pos) return;

    if ((toolState.activeTool === 'fogReveal' || toolState.activeTool === 'fogHide') && isFogging) {
      const reveal = toolState.activeTool === 'fogReveal';
      const newFog = modifyFog(state.fog, pos.gridX, pos.gridY, toolState.brushSize, reveal);
      onStateChange({ ...state, fog: newFog });
    } else if (toolState.activeTool === 'draw' && isDrawing) {
      setCurrentDrawing(prev => [...prev, { x: pos.x, y: pos.y }]);
    } else if (toolState.activeTool === 'laser' && isDrawing) {
      // Update laserPoints in state for sync to player view
      onStateChange({
        ...latestStateRef.current,
        laserPoints: [...latestStateRef.current.laserPoints, { x: pos.x, y: pos.y }],
      });
    } else if (toolState.activeTool === 'block' && isBlocking) {
      const newBlocks = modifyBlocks(latestStateRef.current.blocks, pos.gridX, pos.gridY, toolState.brushSize, toolState.blockColor);
      onStateChange({ ...latestStateRef.current, blocks: newBlocks });
    }
  }, [isPlayerView, onStateChange, toolState, state, getGridPosition, isDrawing, isFogging, isBlocking, onHexHover]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isDrawing && toolState) {
      if (toolState.activeTool === 'draw' && currentDrawing.length > 1 && onStateChange) {
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          points: currentDrawing,
          color: toolState.drawColor,
          strokeWidth: toolState.drawStrokeWidth,
        };
        const newState = {
          ...latestStateRef.current,
          drawings: [...latestStateRef.current.drawings, newDrawing],
        };
        onStateChange(newState);
        onDrawingAdded?.(newDrawing);
      } else if (toolState.activeTool === 'laser' && onStateChange) {
        // Clear laser on release (it's temporary)
        onStateChange({ ...latestStateRef.current, laserPoints: [] });
      }
    }
    if (isFogging) {
      onFogOperationEnd?.();
    }
    if (isBlocking) {
      onBlockOperationEnd?.();
    }
    setIsDrawing(false);
    setIsFogging(false);
    setIsBlocking(false);
    setCurrentDrawing([]);
  }, [isDrawing, isFogging, isBlocking, currentDrawing, onStateChange, onFogOperationEnd, onBlockOperationEnd, onDrawingAdded, toolState]);

  // Handle drag for panning
  const handleLayerDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (isPlayerView) return;
    // Drag events bubble: only track the Layer's own pan drag, not a token.
    if (e.target !== e.currentTarget) return;
    layerDragRef.current = { x: e.target.x(), y: e.target.y(), moved: false };
  }, [isPlayerView]);

  const handleLayerDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.currentTarget) return;
    const drag = layerDragRef.current;
    if (!drag || drag.moved) return;
    if (Math.abs(e.target.x() - drag.x) > 2 || Math.abs(e.target.y() - drag.y) > 2) {
      drag.moved = true;
    }
  }, []);

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (isPlayerView || !onStateChange) return;
    // Drag events bubble: only handle the Layer's own pan drag, not a child
    // (e.g. a text label) being dragged, whose position ≠ the view offset.
    if (e.target !== e.currentTarget) return;

    onStateChange({
      ...state,
      view: {
        ...state.view,
        offsetX: e.target.x(),
        offsetY: e.target.y(),
      },
    });
  }, [isPlayerView, onStateChange, state]);

  // Screen-space geometry for the text-edit overlay (DM view only).
  const editScale = state.view.scale;
  const editScreen = editingLabel
    ? {
        left: editingLabel.draft.x * editScale + state.view.offsetX,
        top: editingLabel.draft.y * editScale + state.view.offsetY,
        fontSize: editingLabel.draft.fontSize * editScale,
      }
    : null;

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        touchAction: localPlayer ? 'none' : undefined,
        cursor: localPlayer ? 'grab' : undefined,
      }}
      data-player-view={localPlayer ? `${effectiveScale.toFixed(4)}:${effectiveOffset.x.toFixed(1)}:${effectiveOffset.y.toFixed(1)}` : undefined}
      onPointerDown={localPlayer ? handlePlayerPointerDown : undefined}
      onPointerMove={localPlayer ? handlePlayerPointerMove : undefined}
      onPointerUp={localPlayer ? handlePlayerPointerEnd : undefined}
      onPointerCancel={localPlayer ? handlePlayerPointerCancel : undefined}
    >
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleStageClick}
      onMouseLeave={() => onHexHover?.(null)}
    >
      <Layer
        x={effectiveOffset.x}
        y={effectiveOffset.y}
        scaleX={effectiveScale}
        scaleY={effectiveScale}
        draggable={!isPlayerView && Boolean(toolState && emptyMapPans(toolState.activeTool))}
        onDragStart={handleLayerDragStart}
        onDragMove={handleLayerDragMove}
        onDragEnd={handleDragEnd}
      >
        {/* Map Image */}
        {image && (
          <Image
            image={image}
            width={state.map.imageWidth}
            height={state.map.imageHeight}
          />
        )}

        {/* Grid Overlay */}
        {state.map.gridVisible && state.map.imageWidth > 0 && safeGridSize > 0 && (
          <Group opacity={state.map.gridOpacity}>
            {/* Vertical lines */}
            {Array.from({ length: Math.ceil(state.map.imageWidth / safeGridSize) + 2 }).map((_, i) => {
              const x = state.map.gridOffsetX + i * safeGridSize;
              return (
                <Line
                  key={`v-${i}`}
                  points={[x, 0, x, state.map.imageHeight]}
                  stroke={state.map.gridColor}
                  strokeWidth={1 / effectiveScale}
                />
              );
            })}
            {/* Horizontal lines */}
            {Array.from({ length: Math.ceil(state.map.imageHeight / safeGridSize) + 2 }).map((_, i) => {
              const y = state.map.gridOffsetY + i * safeGridSize;
              return (
                <Line
                  key={`h-${i}`}
                  points={[0, y, state.map.imageWidth, y]}
                  stroke={state.map.gridColor}
                  strokeWidth={1 / effectiveScale}
                />
              );
            })}
          </Group>
        )}

        {/* Blocks (colored grid cells) */}
        {Object.entries(state.blocks.cells).map(([key, color]) => {
          const [row, col] = key.split(',').map(Number);
          const gridSize = state.map.gridSize || 50;
          return (
            <Rect
              key={key}
              x={state.map.gridOffsetX + col * gridSize}
              y={state.map.gridOffsetY + row * gridSize}
              width={gridSize}
              height={gridSize}
              fill={color}
              opacity={isPlayerView ? 1 : 0.5}
            />
          );
        })}

        {/* Drawings */}
        {state.drawings.map((drawing) => (
          <Line
            key={drawing.id}
            points={drawing.points.flatMap(p => [p.x, p.y])}
            stroke={drawing.color}
            strokeWidth={drawing.strokeWidth / effectiveScale}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Current drawing in progress */}
        {isDrawing && currentDrawing.length > 1 && toolState && (
          <Line
            points={currentDrawing.flatMap(p => [p.x, p.y])}
            stroke={toolState.drawColor}
            strokeWidth={toolState.drawStrokeWidth / effectiveScale}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Laser pointer (temporary, synced from DM) */}
        {state.laserPoints.length > 1 && (
          <>
            <Line
              points={state.laserPoints.flatMap(p => [p.x, p.y])}
              stroke={state.laserColor}
              strokeWidth={9 / effectiveScale}
              lineCap="round"
              lineJoin="round"
            />
            {/* Large dot at current laser position */}
            <Rect
              x={state.laserPoints[state.laserPoints.length - 1].x - 15 / effectiveScale}
              y={state.laserPoints[state.laserPoints.length - 1].y - 15 / effectiveScale}
              width={30 / effectiveScale}
              height={30 / effectiveScale}
              fill={state.laserColor}
              cornerRadius={15 / effectiveScale}
            />
          </>
        )}

        {/* Tokens: a cell-anchored body with a name above and a WoW-style health
            bar below. Both windows see them; only the DM can drag/place. */}
        {state.tokens.map((token: Token) => {
          const gridSize = state.map.gridSize || 50;
          const center = tokenCenter(token, gridSize, state.map.gridOffsetX, state.map.gridOffsetY);
          const radius = gridSize * 0.38;
          const barWidth = gridSize * 1.7;
          const barHeight = Math.max(8, gridSize * 0.16);
          const nameSize = Math.max(18, gridSize * 0.36);
          const hpSize = Math.max(13, gridSize * 0.24);
          const ratio = healthRatio(token.hp, token.maxHp);
          // A token is always draggable by someone allowed to move it: the DM
          // and browser GM can move every token, a player only their own. The
          // active tool no longer gates this.
          const draggable = isPlayerView
            ? Boolean(canMoveToken?.(token))
            : Boolean(onTokenMove);
          const selected = selectedTokenId === token.id;
          // The fog image is non-listening (see below), so a token hidden by
          // opaque player fog must not be grabbable through it either.
          const fogged = state.fog.cells[token.gridY]?.[token.gridX] === true;
          const hiddenByPlayerFog = isPlayerView && fogged;
          const tags = token.tags ?? [];
          const tagFontSize = Math.max(12, gridSize * 0.2);
          const tagHeight = tagFontSize + 8 / effectiveScale;
          const shownTags = tags.slice(0, 2).map((tag) => tag.length > 12 ? `${tag.slice(0, 11)}…` : tag);
          if (tags.length > 2) shownTags.push(`+${tags.length - 2}`);
          const tagWidths = shownTags.map((tag) => Math.min(barWidth * 1.4, tag.length * tagFontSize * 0.58 + 12));
          const tagTotalWidth = tagWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, shownTags.length - 1) * 4;
          const tagY = token.maxHp > 0
            ? radius + barHeight + 6 / effectiveScale + hpSize + 8 / effectiveScale
            : radius + 8 / effectiveScale;
          let tagX = -tagTotalWidth / 2;
          const tagRects = shownTags.map((tag, index) => {
            const width = tagWidths[index];
            const x = tagX;
            tagX += width + 4;
            return (
              <Group key={`${token.id}-tag-${index}`} x={x} y={tagY}>
                <Rect
                  width={width}
                  height={tagHeight}
                  cornerRadius={tagHeight / 2}
                  fill={tag.startsWith('+') ? 'rgba(30, 30, 30, 0.75)' : 'rgba(15, 15, 15, 0.86)'}
                  stroke="rgba(255, 255, 255, 0.35)"
                  strokeWidth={1 / effectiveScale}
                  listening={false}
                />
                <Text
                  text={tag}
                  width={width}
                  height={tagHeight}
                  align="center"
                  verticalAlign="middle"
                  fontSize={tagFontSize}
                  fill="#f3f3f3"
                  listening={false}
                />
              </Group>
            );
          });
          return (
            <Group
              key={token.id}
              id={token.id}
              name="token"
              x={center.x}
              y={center.y}
              draggable={draggable && !hiddenByPlayerFog}
              listening={!hiddenByPlayerFog}
              onClick={(e) => {
                // Keep a token click from reaching the Stage (and placing a
                // token or opening a hex link underneath it).
                e.cancelBubble = true;
                onTokenSelect?.(token.id);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onTokenSelect?.(token.id);
              }}
              onDblClick={(e) => {
                e.cancelBubble = true;
                (onTokenOpen ?? onTokenSelect)?.(token.id);
              }}
              onDblTap={(e) => {
                e.cancelBubble = true;
                (onTokenOpen ?? onTokenSelect)?.(token.id);
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                const cell = cellForPoint(
                  e.target.x(),
                  e.target.y(),
                  gridSize,
                  latestStateRef.current.map.gridOffsetX,
                  latestStateRef.current.map.gridOffsetY
                );
                onTokenMove?.(token.id, cell.gridX, cell.gridY);
              }}
              onMouseEnter={(e) => {
                const cursor = draggable ? 'move' : onTokenSelect ? 'pointer' : 'default';
                e.target.getStage()!.container().style.cursor = cursor;
              }}
              onMouseLeave={(e) => {
                e.target.getStage()!.container().style.cursor = 'default';
              }}
            >
              {selected && (
                <Circle
                  radius={radius + Math.max(3, gridSize * 0.09) / effectiveScale}
                  stroke="#e8c06a"
                  strokeWidth={Math.max(3, gridSize * 0.06) / effectiveScale}
                  dash={[Math.max(6, gridSize * 0.16) / effectiveScale, Math.max(4, gridSize * 0.1) / effectiveScale]}
                  listening={false}
                />
              )}
              <Circle
                radius={radius}
                fill={token.color}
                stroke={token.hp === 0 && token.maxHp > 0 ? '#ef4444' : '#111111'}
                strokeWidth={Math.max(2, gridSize * 0.05) / effectiveScale}
                shadowColor="#000000"
                shadowBlur={gridSize * 0.08 / effectiveScale}
                shadowOpacity={0.55}
                // Konva's perfect-draw path allocates a buffer per shadowed,
                // stroked shape. With 30 tokens that made every drag frame take
                // ~100 ms; turning it off keeps the same shadow at ~17 ms.
                perfectDrawEnabled={false}
              />
              <Text
                text={token.name || 'Token'}
                x={-barWidth / 2}
                y={-radius - nameSize - 4 / effectiveScale}
                width={barWidth}
                align="center"
                fontSize={nameSize}
                fontStyle="bold"
                fill={token.hp === 0 && token.maxHp > 0 ? '#fecaca' : '#ffffff'}
                stroke="#000000"
                strokeWidth={Math.max(2, nameSize * 0.18) / effectiveScale}
                fillAfterStrokeEnabled
                listening={false}
              />
              {token.maxHp > 0 && (
                <>
                  <Rect
                    x={-barWidth / 2}
                    y={radius + 4 / effectiveScale}
                    width={barWidth}
                    height={barHeight}
                    cornerRadius={barHeight / 2}
                    fill="rgba(0, 0, 0, 0.72)"
                    stroke="#000000"
                    strokeWidth={1 / effectiveScale}
                    listening={false}
                  />
                  <Rect
                    x={-barWidth / 2 + 1 / effectiveScale}
                    y={radius + 5 / effectiveScale}
                    width={Math.max(0, (barWidth - 2 / effectiveScale) * ratio)}
                    height={Math.max(1, barHeight - 2 / effectiveScale)}
                    cornerRadius={barHeight / 2}
                    fill={healthColor(token.hp, token.maxHp)}
                    listening={false}
                  />
                  <Text
                    text={`${token.hp}/${token.maxHp}`}
                    x={-barWidth / 2}
                    y={radius + barHeight + 6 / effectiveScale}
                    width={barWidth}
                    align="center"
                    fontSize={hpSize}
                    fill="#ffffff"
                    stroke="#000000"
                    strokeWidth={Math.max(2, hpSize * 0.2) / effectiveScale}
                    fillAfterStrokeEnabled
                    listening={false}
                  />
                </>
              )}
              {tagRects}
            </Group>
          );
        })}

        {/* Fog of War (rendered as single canvas for performance). Konva hit-
            tests an Image as its full rectangle, so a listening fog image above
            the tokens swallowed every token press (the map then panned). It is
            purely visual: an empty/fogged press must reach the draggable layer
            below, and tokens stay reachable through fog. */}
        {fogCanvas && (
          <Image
            ref={fogImageRef}
            image={fogCanvas}
            opacity={isPlayerView ? 1 : 0.5}
            listening={false}
          />
        )}

        {/* Text labels (white text on colored, rounded background). GM-only —
            never rendered in the player view. With the text tool: click to edit,
            drag to move. */}
        {!isPlayerView && state.textLabels.map((label) => {
          // Hide the label currently being edited — the textarea overlay shows it instead.
          if (editingLabel && editingLabel.draft.id === label.id) return null;
          const textToolActive = !isPlayerView && toolState?.activeTool === 'text';
          return (
            <Label
              key={label.id}
              id={label.id}
              name="textLabel"
              x={label.x}
              y={label.y}
              draggable={textToolActive}
              onClick={() => {
                if (!textToolActive) return;
                setEditingLabel({ before: label, draft: { ...label } });
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true; // don't let this reach the Layer's pan handler
                const node = e.target;
                const before = latestStateRef.current.textLabels.find(l => l.id === label.id);
                if (!before || !onStateChange) return;
                const after: TextLabel = { ...before, x: node.x(), y: node.y() };
                onStateChange({
                  ...latestStateRef.current,
                  textLabels: latestStateRef.current.textLabels.map(l => l.id === label.id ? after : l),
                });
                onTextLabelCommit?.(label.id, before, after);
              }}
              onMouseEnter={(e) => {
                if (textToolActive) e.target.getStage()!.container().style.cursor = 'move';
              }}
              onMouseLeave={(e) => {
                if (textToolActive) e.target.getStage()!.container().style.cursor = 'default';
              }}
            >
              <Tag fill={label.bgColor} cornerRadius={label.fontSize * 0.3} />
              <Text
                text={label.text}
                fontSize={label.fontSize}
                fill={label.color}
                padding={label.fontSize * 0.35}
              />
            </Label>
          );
        })}

        {/* Player Viewport Indicator (DM view only). Purely visual — must not
            capture clicks (a transparent fill is still hit-testable in Konva),
            or it would block selecting text labels beneath it. */}
        {!isPlayerView && playerViewport && (
          <Rect
            x={playerViewport.x}
            y={playerViewport.y}
            width={playerViewport.width}
            height={playerViewport.height}
            stroke="#00ff00"
            strokeWidth={3 / effectiveScale}
            fill="transparent"
            dash={[10 / effectiveScale, 5 / effectiveScale]}
            listening={false}
          />
        )}
      </Layer>
    </Stage>

    {/* Text edit overlay (DM only). Positioned over the label anchor. */}
    {editingLabel && editScreen && (
      <textarea
        ref={textareaRef}
        value={editingLabel.draft.text}
        onChange={(e) =>
          setEditingLabel(prev =>
            prev ? { ...prev, draft: { ...prev.draft, text: e.target.value } } : prev
          )
        }
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
          }
        }}
        onBlur={commitEdit}
        placeholder="Type…"
        rows={1}
        style={{
          position: 'absolute',
          left: editScreen.left,
          top: editScreen.top,
          margin: 0,
          border: 'none',
          outline: 'none',
          resize: 'none',
          overflow: 'hidden',
          padding: `${editScreen.fontSize * 0.35}px`,
          fontSize: `${editScreen.fontSize}px`,
          lineHeight: 1.15,
          fontFamily: 'Arial, sans-serif',
          color: editingLabel.draft.color,
          background: editingLabel.draft.bgColor,
          borderRadius: `${editScreen.fontSize * 0.3}px`,
          minWidth: `${editScreen.fontSize * 3}px`,
          boxSizing: 'border-box',
          zIndex: 1000,
        }}
      />
    )}
    </div>
  );
}
