import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Image, Line, Rect, Group } from 'react-konva';
import Konva from 'konva';
import { AppState, ToolState, Drawing, DrawingPoint, PlayerViewport } from '../types';
import { modifyFog } from '../store';

interface MapCanvasProps {
  state: AppState;
  toolState?: ToolState;
  isPlayerView?: boolean;
  onStateChange?: (state: AppState) => void;
  onFogOperationStart?: () => void; // Called when fog operation starts
  onFogOperationEnd?: () => void; // Called when fog operation ends
  onDrawingAdded?: (drawing: Drawing) => void; // Called when a drawing is completed
  width: number;
  height: number;
  playerViewport?: PlayerViewport | null;
}

export function MapCanvas({
  state,
  toolState,
  isPlayerView = false,
  onStateChange,
  onFogOperationStart,
  onFogOperationEnd,
  onDrawingAdded,
  width,
  height,
  playerViewport,
}: MapCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFogging, setIsFogging] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingPoint[]>([]);

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

      ctx.fillStyle = '#000000';
      for (let row = 0; row < state.fog.rows; row++) {
        for (let col = 0; col < state.fog.cols; col++) {
          if (state.fog.cells[row]?.[col]) {
            ctx.fillRect(
              state.map.gridOffsetX + col * gridSize,
              state.map.gridOffsetY + row * gridSize,
              gridSize,
              gridSize
            );
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
            const x = state.map.gridOffsetX + col * gridSize;
            const y = state.map.gridOffsetY + row * gridSize;
            if (isFogged) {
              ctx.fillRect(x, y, gridSize, gridSize);
            } else {
              ctx.clearRect(x, y, gridSize, gridSize);
            }
            lastCells[row][col] = isFogged;
          }
        }
      }
    }

    return fogCanvasRef.current;
  }, [state.fog, state.map.gridSize, state.map.gridOffsetX, state.map.gridOffsetY, state.map.imageWidth, state.map.imageHeight]);

  // Load map image
  useEffect(() => {
    if (state.map.imageUrl) {
      const img = new window.Image();
      img.src = state.map.imageUrl;
      img.onload = () => setImage(img);
    } else {
      setImage(null);
    }
  }, [state.map.imageUrl]);

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

  // Handle mouse down
  const handleMouseDown = useCallback((_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPlayerView || !onStateChange || !toolState) return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = getGridPosition(stage);
    if (!pos) return;

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
      // Update laserPoints in state for sync to player view
      onStateChange({ ...state, laserPoints: [{ x: pos.x, y: pos.y }] });
    } else if (toolState.activeTool === 'pan') {
      // Pan is handled by drag
    }
  }, [isPlayerView, onStateChange, onFogOperationStart, toolState, state, getGridPosition]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPlayerView || !onStateChange || !toolState) return;

    const stage = stageRef.current;
    if (!stage) return;

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
    }
  }, [isPlayerView, onStateChange, toolState, state, getGridPosition, isDrawing]);

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
    setIsDrawing(false);
    setIsFogging(false);
    setCurrentDrawing([]);
  }, [isDrawing, isFogging, currentDrawing, onStateChange, onFogOperationEnd, onDrawingAdded, toolState]);

  // Handle drag for panning
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (isPlayerView || !onStateChange) return;

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

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
          <Line
            points={state.laserPoints.flatMap(p => [p.x, p.y])}
            stroke={toolState?.laserColor || '#00ff00'}
            strokeWidth={(toolState?.drawStrokeWidth || 3) / effectiveScale}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Fog of War (rendered as single canvas for performance) */}
        {fogCanvas && (
          <Image
            image={fogCanvas}
            opacity={isPlayerView ? 1 : 0.5}
          />
        )}

        {/* Player Viewport Indicator (DM view only) */}
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
          />
        )}
      </Layer>
    </Stage>
  );
}
