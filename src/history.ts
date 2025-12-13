import { AppState, FogState, BlockState, Drawing } from './types';

// Base interface for undoable operations
export interface Operation {
  type: string;
  apply(state: AppState): AppState;
  unapply(state: AppState): AppState;
}

// Fog cells changed
export interface FogChangeOperation extends Operation {
  type: 'fogChange';
  changes: Array<{ row: number; col: number; wasRevealed: boolean }>;
}

export function createFogChangeOperation(
  changes: Array<{ row: number; col: number; wasRevealed: boolean }>
): FogChangeOperation {
  return {
    type: 'fogChange',
    changes,
    apply(state: AppState): AppState {
      const newCells = state.fog.cells.map(row => [...row]);
      for (const change of this.changes) {
        if (change.row >= 0 && change.row < state.fog.rows &&
            change.col >= 0 && change.col < state.fog.cols) {
          // wasRevealed=false means cell WAS fogged, so after operation it's revealed (false)
          // wasRevealed=true means cell WAS revealed, so after operation it's fogged (true)
          // In other words: after = wasRevealed (the new state is opposite of the old)
          newCells[change.row][change.col] = change.wasRevealed;
        }
      }
      return { ...state, fog: { ...state.fog, cells: newCells } };
    },
    unapply(state: AppState): AppState {
      const newCells = state.fog.cells.map(row => [...row]);
      for (const change of this.changes) {
        if (change.row >= 0 && change.row < state.fog.rows &&
            change.col >= 0 && change.col < state.fog.cols) {
          // wasRevealed=true means cell WAS revealed (not fogged), so restore to false
          // wasRevealed=false means cell WAS fogged, so restore to true
          newCells[change.row][change.col] = !change.wasRevealed;
        }
      }
      return { ...state, fog: { ...state.fog, cells: newCells } };
    },
  };
}

// Drawing added
export interface DrawingAddOperation extends Operation {
  type: 'drawingAdd';
  drawing: Drawing;
}

export function createDrawingAddOperation(drawing: Drawing): DrawingAddOperation {
  return {
    type: 'drawingAdd',
    drawing,
    apply(state: AppState): AppState {
      return { ...state, drawings: [...state.drawings, this.drawing] };
    },
    unapply(state: AppState): AppState {
      return { ...state, drawings: state.drawings.filter(d => d.id !== this.drawing.id) };
    },
  };
}

// All drawings cleared
export interface DrawingsClearOperation extends Operation {
  type: 'drawingsClear';
  clearedDrawings: Drawing[];
}

export function createDrawingsClearOperation(clearedDrawings: Drawing[]): DrawingsClearOperation {
  return {
    type: 'drawingsClear',
    clearedDrawings,
    apply(state: AppState): AppState {
      return { ...state, drawings: [] };
    },
    unapply(state: AppState): AppState {
      return { ...state, drawings: this.clearedDrawings };
    },
  };
}

// Block cells changed (similar to fog change)
export interface BlockChangeOperation extends Operation {
  type: 'blockChange';
  previousBlocks: BlockState;
}

export function createBlockChangeOperation(previousBlocks: BlockState, newBlocks: BlockState): BlockChangeOperation {
  return {
    type: 'blockChange',
    previousBlocks,
    apply(state: AppState): AppState {
      return { ...state, blocks: newBlocks };
    },
    unapply(state: AppState): AppState {
      return { ...state, blocks: this.previousBlocks };
    },
  };
}

// Fog reset (all cells fogged)
export interface FogResetOperation extends Operation {
  type: 'fogReset';
  previousFog: FogState;
}

export function createFogResetOperation(previousFog: FogState, newFog: FogState): FogResetOperation {
  return {
    type: 'fogReset',
    previousFog,
    apply(state: AppState): AppState {
      return { ...state, fog: newFog };
    },
    unapply(state: AppState): AppState {
      return { ...state, fog: this.previousFog };
    },
  };
}

// Fog cleared (all cells revealed)
export interface FogClearOperation extends Operation {
  type: 'fogClear';
  previousFog: FogState;
}

export function createFogClearOperation(previousFog: FogState): FogClearOperation {
  return {
    type: 'fogClear',
    previousFog,
    apply(state: AppState): AppState {
      return {
        ...state,
        fog: {
          ...state.fog,
          cells: state.fog.cells.map(row => row.map(() => false)),
        },
      };
    },
    unapply(state: AppState): AppState {
      return { ...state, fog: this.previousFog };
    },
  };
}

// History manager
export class HistoryManager {
  private undoStack: Operation[] = [];
  private redoStack: Operation[] = [];
  private maxSize = 100;

  push(operation: Operation): void {
    this.undoStack.push(operation);
    this.redoStack = []; // Clear redo stack on new operation

    // Limit size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(state: AppState): AppState | null {
    const operation = this.undoStack.pop();
    if (!operation) return null;

    this.redoStack.push(operation);
    return operation.unapply(state);
  }

  redo(state: AppState): AppState | null {
    const operation = this.redoStack.pop();
    if (!operation) return null;

    this.undoStack.push(operation);
    return operation.apply(state);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  getUndoCount(): number {
    return this.undoStack.length;
  }

  getRedoCount(): number {
    return this.redoStack.length;
  }
}
