import { readFile } from '@tauri-apps/plugin-fs';

// A cartographer "both views" bundle: a thin JSON wrapper holding the GM and
// player SVG renders of one map, plus the grid metadata. Produced by
// `cartographer render <map> -o out.json` (or the editor's "Both views" export).
export interface CartographerBundle {
  format: 'cartographer-views';
  version: number;
  grid: { cell_size: number; units?: string; ft_per_cell?: number };
  gm: string; // GM-facing SVG document
  player: string; // player-facing SVG document
}

function isBundle(value: unknown): value is CartographerBundle {
  const b = value as Partial<CartographerBundle> | null;
  return (
    !!b &&
    b.format === 'cartographer-views' &&
    typeof b.gm === 'string' &&
    typeof b.player === 'string'
  );
}

// Read and validate a cartographer bundle from disk. Throws (rather than
// returning null) so a malformed file surfaces an error instead of silently
// being mishandled. Reads via `readFile` — the same API the plain-image
// loader uses — to avoid any divergence in fs permissions/behavior.
export async function loadCartographerBundle(
  path: string,
): Promise<CartographerBundle> {
  const text = new TextDecoder().decode(await readFile(path));
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (!isBundle(parsed)) {
    throw new Error('Not a cartographer-views bundle (missing format/gm/player)');
  }
  return parsed;
}

// Turn a bundle view into an object URL backed by a Blob. A view is either
// raw SVG markup (cartographer's own renders) or a `data:` URL (e.g. an
// embedded PNG from a converted image pair).
//
// We return a blob URL rather than keeping the data URL in app state: blob
// URLs are short strings, so they stay cheap to broadcast to the player
// window on every state sync, and they resolve there the same way the plain
// image loader's blob URLs already do.
export function bundleSrcToObjectUrl(src: string): string {
  const blob = src.startsWith('data:')
    ? dataUrlToBlob(src)
    : new Blob([src], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
}

// --- Bundle authoring (used by the in-app "Make Bundle" tool) ---

// Guess an image MIME type from a file path's extension. Falls back to a
// generic binary type so an unknown extension still produces a usable data URL.
export function mimeForImagePath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

// Base64-encode raw image bytes into a `data:` URL. Encodes in chunks so a
// large image doesn't blow the call stack when spreading into String.fromCharCode.
export function imageBytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunkSize = 0x8000; // 32k chars per chunk
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

// Assemble a cartographer bundle from two already-encoded views (data URLs or
// raw SVG) and a grid cell size. The loader treats grid.cell_size as the
// authoritative VTT grid size.
export function buildCartographerBundle(
  gm: string,
  player: string,
  cellSize: number,
): CartographerBundle {
  return {
    format: 'cartographer-views',
    version: 1,
    grid: { cell_size: cellSize },
    gm,
    player,
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice('data:'.length, comma);
  const mime = header.split(';')[0] || 'application/octet-stream';
  const payload = dataUrl.slice(comma + 1);
  if (header.includes(';base64')) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}
