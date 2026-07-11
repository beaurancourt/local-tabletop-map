import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Image, Line, Rect, Group, Label, Tag, Text } from 'react-konva';
import Konva from 'konva';
import { AppState, ToolState, Drawing, DrawingPoint, PlayerViewport, TextLabel } from '../types';
import { modifyFog, modifyBlocks } from '../store';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hexAtPoint, linkForHex } from '../hexmap';

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
  width: number;
  height: number;
  playerViewport?: PlayerViewport | null;
  onHexHover?: (hex: { col: number; row: number } | null) => void; // .hexm hover (DM)
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
  width,
  height,
  playerViewport,
  onHexHover,
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

  // Persistent fog canvas for incremental updates
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastFogStateRef = useRef<{ cells: boolean[][], gridSize: number, offsetX: number, offsetY: number } | null>(null);

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

  // Handle wheel zoom (DM only)
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    if (isPlayerView || !onStateChange) return;
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
    const newScale = Math.max(0.1, Math.min(5, oldScale * (1 + direction * 0.1)));

    onStateChange({
      ...state,
      view: {
        ...state.view,
        scale: newScale,
        offsetX: pointer.x - mousePointTo.x * newScale,
        offsetY: pointer.y - mousePointTo.y * newScale,
      },
    });
  }, [state, isPlayerView, onStateChange]);

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

  // Handle mouse down
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPlayerView || !onStateChange || !toolState) return;

    const stage = stageRef.current;
    if (!stage) return;

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
    } else if (toolState.activeTool === 'pan') {
      // Pan is handled by drag
    }
  }, [isPlayerView, onStateChange, onFogOperationStart, toolState, state, getGridPosition]);

  // Click a hex on a `.hexm` map (DM view, pan tool) to open its key — e.g.
  // an `obsidian://` link to the hex-key note. A pan drag does not fire click,
  // so this only triggers on a genuine tap.
  const handleStageClick = useCallback(() => {
    if (isPlayerView || !toolState) return;
    const meta = state.map.hexmap;
    if (!meta || toolState.activeTool !== 'pan') return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = getGridPosition(stage);
    if (!pos) return;
    const hex = hexAtPoint(meta, pos.x, pos.y);
    if (!hex) return;
    const url = linkForHex(meta, hex.col, hex.row);
    if (url) openUrl(url).catch(err => console.error('Failed to open hex link:', err));
  }, [isPlayerView, toolState, state.map.hexmap, getGridPosition]);

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

    if (toolState.activeTool === 'fogReveal' || toolState.activeTool === 'fogHide') {
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
  }, [isPlayerView, onStateChange, toolState, state, getGridPosition, isDrawing, isBlocking, onHexHover]);

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

  // Calculate scale for player view calibration (guard against division by zero)
  const safeGridSize = state.map.gridSize || 50;
  const playerScale = isPlayerView
    ? (state.calibration.pixelsPerInch / safeGridSize)
    : 1;

  const effectiveScale = isPlayerView ? playerScale : state.view.scale;
  // Player view uses playerViewOffset (in map coords), DM view uses view offset (in screen coords)
  const effectiveOffset = isPlayerView
    ? { x: -state.playerViewOffset.x * playerScale, y: -state.playerViewOffset.y * playerScale }
    : { x: state.view.offsetX, y: state.view.offsetY };

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
    <div style={{ position: 'relative', width, height }}>
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
        draggable={!isPlayerView && toolState?.activeTool === 'pan'}
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

        {/* Fog of War (rendered as single canvas for performance) */}
        {fogCanvas && (
          <Image
            image={fogCanvas}
            opacity={isPlayerView ? 1 : 0.5}
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
