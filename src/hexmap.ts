import { readFile } from '@tauri-apps/plugin-fs';

// A `.hexm` file: hex-map metadata used to render a color-coded-by-terrain
// hex map. Each hex may carry a link that opens its key in Obsidian (or any
// URL). Unlike image/cartographer maps, the visual is *generated* from this
// metadata (rendered to an SVG that the existing image pipeline displays),
// while the hex grid stays interactive (clicking a hex opens its link).

export type HexOrientation = 'flat' | 'pointy';

export interface HexCell {
  col: number; // 1-based column (matches "CC" in a CC.RR hex coordinate)
  row: number; // 1-based row ("RR")
  terrain?: string; // key into `terrains`; falls back to `defaultTerrain`
  territory?: string; // civilized | borderlands | outlands | unsettled (encounter frequency)
  label?: string; // short text drawn in the hex (e.g. a POI number "32")
  name?: string; // longer name (tooltip / future use)
  note?: string; // free GM note shown in the hover tooltip
  link?: string; // full URL (e.g. `obsidian://...`, `https://...`) OR a
  // vault-relative note path, optionally with `#heading`. A bare path is
  // turned into an `obsidian://open` link using `obsidian.vault`.
}

export interface HexMapFile {
  format: 'vtt-hexmap';
  version: number;
  title?: string;
  orientation?: HexOrientation; // default 'flat'
  hexRadius?: number; // px, center -> vertex; default 40
  cols: number;
  rows: number;
  background?: string; // SVG backdrop color; default '#14110d'
  defaultTerrain?: string; // terrain for hexes not listed / without `terrain`
  terrains: Record<string, string>; // terrain key -> fill color
  terrainLabels?: Record<string, string>; // terrain key -> display name (for the legend)
  // Default link target for hexes without their own `link` (e.g. the hex key
  // document). `file` is a vault-relative path (optionally `#heading`).
  obsidian?: { vault?: string; file?: string };
  hexes: HexCell[];
  // Roads & rivers, drawn as polylines through the listed hex centers (over
  // terrain, under hex labels). Roads grant ×3/2 travel and skip the get-lost
  // roll; navigable rivers likewise. `path` is a list of [col,row].
  roads?: Array<{ name?: string; type?: 'road' | 'river'; path: Array<[number, number]> }>;
}

// Compact, serializable metadata kept in app state. Holds the geometry needed
// to hit-test clicks and the resolved per-hex links. Synced to the player
// window and persisted alongside the map like any other MapState field.
export interface HexMapMeta {
  orientation: HexOrientation;
  hexRadius: number;
  cols: number;
  rows: number;
  pad: number; // px padding around the grid (origin offset for hex centers)
  width: number; // rendered SVG width (px) — also the map imageWidth
  height: number; // rendered SVG height (px) — also the map imageHeight
  title?: string;
  terrains: Record<string, string>; // terrain key -> color (for the legend)
  terrainLabels?: Record<string, string>; // terrain key -> display name
  // "col,row" -> resolved data for listed hexes
  links: Record<string, { url: string | null; name?: string; label?: string }>;
  // Fallback link (already resolved) for any hex not in `links`, e.g. the hex
  // key document. Null when no default is configured.
  defaultUrl: string | null;
}

const DEFAULT_RADIUS = 40;
const DEFAULT_PAD = 6;
const SQRT3 = Math.sqrt(3);

function isHexMapFile(v: unknown): v is HexMapFile {
  const f = v as Partial<HexMapFile> | null;
  return (
    !!f &&
    f.format === 'vtt-hexmap' &&
    typeof f.cols === 'number' &&
    typeof f.rows === 'number' &&
    !!f.terrains &&
    Array.isArray(f.hexes)
  );
}

// Read + validate a `.hexm` file. Throws on malformed input (matching
// `loadCartographerBundle`) so problems surface instead of failing silently.
export async function loadHexMapFile(path: string): Promise<HexMapFile> {
  const text = new TextDecoder().decode(await readFile(path));
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (!isHexMapFile(parsed)) {
    throw new Error('Not a vtt-hexmap file (need format/cols/rows/terrains/hexes)');
  }
  return parsed;
}

// --- Geometry ---------------------------------------------------------------

// Center (px) of the hex at 1-based (col, row). Flat-top uses odd-q offset
// (odd columns nudged down half a hex); pointy-top uses odd-r offset.
export function hexCenter(meta: Pick<HexMapMeta, 'orientation' | 'hexRadius' | 'pad'>, col: number, row: number): { cx: number; cy: number } {
  const R = meta.hexRadius;
  const c = col - 1;
  const r = row - 1;
  if (meta.orientation === 'pointy') {
    const w = SQRT3 * R;
    const cx = meta.pad + w / 2 + w * (c + 0.5 * (r & 1));
    const cy = meta.pad + R + 1.5 * R * r;
    return { cx, cy };
  }
  // flat-top (default)
  const h = SQRT3 * R;
  const cx = meta.pad + R + 1.5 * R * c;
  const cy = meta.pad + h / 2 + h * (r + 0.5 * (c & 1));
  return { cx, cy };
}

// The 6 vertices of a hex centered at (cx, cy).
export function hexVertices(orientation: HexOrientation, R: number, cx: number, cy: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  // flat-top: angles 0,60,...; pointy-top: 30,90,...
  const start = orientation === 'pointy' ? 30 : 0;
  for (let i = 0; i < 6; i++) {
    const a = ((start + 60 * i) * Math.PI) / 180;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return pts;
}

function hexExtent(orientation: HexOrientation, R: number, cols: number, rows: number, pad: number): { width: number; height: number } {
  // Compute from the actual corner positions of the extreme hexes so the SVG
  // bounds always contain every hex (including offset rows/columns).
  let maxX = 0;
  let maxY = 0;
  const meta = { orientation, hexRadius: R, pad };
  for (const [col, row] of [
    [cols, rows],
    [cols, 1],
    [1, rows],
    [cols - 1 < 1 ? 1 : cols, rows], // guard
  ] as Array<[number, number]>) {
    const { cx, cy } = hexCenter(meta, col, row);
    for (const [vx, vy] of hexVertices(orientation, R, cx, cy)) {
      if (vx > maxX) maxX = vx;
      if (vy > maxY) maxY = vy;
    }
  }
  return { width: Math.ceil(maxX + pad), height: Math.ceil(maxY + pad) };
}

// --- Link resolution --------------------------------------------------------

function obsidianUrl(vault: string | undefined, fileRef: string): string | null {
  if (!fileRef) return null;
  const hash = fileRef.indexOf('#');
  const path = hash >= 0 ? fileRef.slice(0, hash) : fileRef;
  const heading = hash >= 0 ? fileRef.slice(hash + 1) : '';
  let url = 'obsidian://open?';
  if (vault) url += `vault=${encodeURIComponent(vault)}&`;
  url += `file=${encodeURIComponent(path)}`;
  if (heading) url += `&heading=${encodeURIComponent(heading)}`; // honored by the Advanced URI plugin
  return url;
}

// Resolve a hex's link (or the map default) to a final clickable URL.
export function resolveLink(file: HexMapFile, cell: Pick<HexCell, 'link'> | undefined): string | null {
  const link = cell?.link;
  if (link) {
    return link.includes('://') ? link : obsidianUrl(file.obsidian?.vault, link);
  }
  if (file.obsidian?.file) return obsidianUrl(file.obsidian.vault, file.obsidian.file);
  return null;
}

// --- Build state metadata + SVG --------------------------------------------

export function buildHexMapMeta(file: HexMapFile): HexMapMeta {
  const orientation: HexOrientation = file.orientation === 'pointy' ? 'pointy' : 'flat';
  const hexRadius = file.hexRadius && file.hexRadius > 0 ? file.hexRadius : DEFAULT_RADIUS;
  const pad = DEFAULT_PAD;
  const { width, height } = hexExtent(orientation, hexRadius, file.cols, file.rows, pad);

  // Only record interactive entries (hexes with their own link/name/label).
  // Plain terrain-only hexes fall back to `defaultUrl` on click, keeping this
  // map small even for big regions (it's synced to the player window).
  const links: HexMapMeta['links'] = {};
  for (const cell of file.hexes) {
    if (!cell.link && !cell.name && !cell.label) continue;
    links[`${cell.col},${cell.row}`] = {
      url: resolveLink(file, cell),
      name: cell.name,
      label: cell.label,
    };
  }

  return {
    orientation,
    hexRadius,
    cols: file.cols,
    rows: file.rows,
    pad,
    width,
    height,
    title: file.title,
    terrains: file.terrains,
    terrainLabels: file.terrainLabels,
    links,
    defaultUrl: file.obsidian?.file ? obsidianUrl(file.obsidian.vault, file.obsidian.file) : null,
  };
}

// Which hex (if any) contains map-space point (x, y). Brute-force point-in-
// polygon over all cells — trivially cheap on a click, and exact for offset
// layouts. Returns 1-based {col,row} or null.
export function hexAtPoint(meta: HexMapMeta, x: number, y: number): { col: number; row: number } | null {
  const R = meta.hexRadius;
  for (let col = 1; col <= meta.cols; col++) {
    for (let row = 1; row <= meta.rows; row++) {
      const { cx, cy } = hexCenter(meta, col, row);
      // cheap bounding-circle reject before the polygon test
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > R * R) continue;
      if (pointInPolygon(x, y, hexVertices(meta.orientation, R, cx, cy))) {
        return { col, row };
      }
    }
  }
  return null;
}

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// The resolved URL for a clicked hex (its own link, else the map default).
export function linkForHex(meta: HexMapMeta, col: number, row: number): string | null {
  const entry = meta.links[`${col},${row}`];
  return (entry && entry.url) || meta.defaultUrl;
}

// Render the hex map to an SVG document string (used as the map image).
// `showLabels` draws hex labels (DM view); the player view can hide them.
export function renderHexMapSvg(file: HexMapFile, opts: { showLabels?: boolean } = {}): string {
  const meta = buildHexMapMeta(file);
  const { width, height, hexRadius: R, orientation } = meta;
  const bg = file.background || '#14110d';
  const defaultTerrain = file.defaultTerrain;
  const showLabels = opts.showLabels !== false;

  const byCoord = new Map<string, HexCell>();
  for (const cell of file.hexes) byCoord.set(`${cell.col},${cell.row}`, cell);

  const fillFor = (cell: HexCell | undefined): string => {
    const key = cell?.terrain ?? defaultTerrain;
    return (key && file.terrains[key]) || '#3a352c';
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);

  const labelSize = Math.max(8, Math.round(R * 0.42));
  const labels: string[] = []; // drawn last so roads don't cover them
  for (let col = 1; col <= file.cols; col++) {
    for (let row = 1; row <= file.rows; row++) {
      const cell = byCoord.get(`${col},${row}`);
      const { cx, cy } = hexCenter(meta, col, row);
      const pts = hexVertices(orientation, R, cx, cy)
        .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
        .join(' ');
      const fill = fillFor(cell);
      parts.push(
        `<polygon points="${pts}" fill="${fill}" stroke="#0008" stroke-width="1"/>`,
      );
      if (showLabels && cell?.label) {
        labels.push(
          `<text x="${cx.toFixed(1)}" y="${(cy + labelSize * 0.35).toFixed(1)}" font-family="sans-serif" font-size="${labelSize}" font-weight="bold" fill="#fff" text-anchor="middle" paint-order="stroke" stroke="#0009" stroke-width="2">${escapeXml(cell.label)}</text>`,
        );
      }
    }
  }

  // Roads & rivers — polylines through hex centers, over terrain / under labels.
  for (const route of file.roads ?? []) {
    if (!route.path || route.path.length < 2) continue;
    const poly = route.path
      .map(([c, r]) => { const p = hexCenter(meta, c, r); return `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`; })
      .join(' ');
    if (route.type === 'river') {
      parts.push(`<polyline points="${poly}" fill="none" stroke="#2f5a86" stroke-width="${(R * 0.22).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`);
    } else {
      // dark casing + dashed tan road for a legible "road" look
      parts.push(`<polyline points="${poly}" fill="none" stroke="#2c2415" stroke-width="${(R * 0.30).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      parts.push(`<polyline points="${poly}" fill="none" stroke="#decfa0" stroke-width="${(R * 0.15).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${(R * 0.5).toFixed(1)} ${(R * 0.3).toFixed(1)}"/>`);
    }
  }

  parts.push(...labels);

  if (file.title) {
    parts.push(
      `<text x="${meta.pad + 4}" y="${meta.pad + 18}" font-family="serif" font-size="18" fill="#eee">${escapeXml(file.title)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Hover tooltip data (wilderness-travel rules) ---------------------------

// Per-hex data not kept in the (synced, lean) HexMapMeta. Built once from the
// `.hexm` on load and held in the DM view for the hover tooltip.
export interface HexCellData {
  terrain?: string;
  territory?: string;
  name?: string;
  note?: string;
}

// Build a "col,row" -> HexCellData lookup from a loaded file. Hexes not listed
// fall back to the file's defaultTerrain.
export function buildHexLookup(file: HexMapFile): Record<string, HexCellData> {
  const out: Record<string, HexCellData> = {};
  for (const c of file.hexes) {
    out[`${c.col},${c.row}`] = {
      terrain: c.terrain ?? file.defaultTerrain,
      territory: c.territory,
      name: c.name,
      note: c.note,
    };
  }
  return out;
}

// ACKS terrain rules (RR Ch 6): expedition-speed multiplier, encounter
// distance, and the small-party (≤6) Evasion target. Encoded for display.
// `nav` = the per-day Navigation throw to AVOID getting lost (RR p.275). Higher
// target = easier to get lost. +4 with Pathfinding OR Navigation (+8 with both);
// following a road or navigable river needs no throw.
const TERRAIN_RULES: Record<string, { label: string; speed: string; enc: string; evasion: string; nav: string }> = {
  grassland: { label: 'Grassland', speed: '×1', enc: '4d6×30′ (~420′)', evasion: '9+ (steppe 16+)', nav: '6+' },
  scrubland: { label: 'Scrubland', speed: '×1', enc: 'sparse 4d6×30′ / dense 3d6×15′', evasion: 'sparse 12+ / dense 9+', nav: 'sparse 6+ / dense 8+' },
  hills: { label: 'Hills', speed: '×2/3', enc: 'rocky 4d6×30′ / forested 5d8×3′', evasion: 'rocky 12+ / forested 5+', nav: '8+' },
  mountains: { label: 'Mountains', speed: '×1/2', enc: 'rocky 4d6×30′ / forested 5d8×3′', evasion: 'rocky 12+ / forested 5+', nav: '6+' },
  forest: { label: 'Forest', speed: '×2/3', enc: 'deciduous 5d8×3′ / taiga 3d6×15′', evasion: 'deciduous 2+ / taiga 5+', nav: '8+' },
  swamp: { label: 'Swamp', speed: '×1/2', enc: 'marshy 3d6×15′ / scrubby 5d8×3′', evasion: 'marshy 9+ / forested 2+', nav: 'marshy 10+ / forested 14+' },
  barrens: { label: 'Barrens', speed: '×2/3', enc: '4d6×30′ (~420′)', evasion: '12+', nav: '6+' },
  desert: { label: 'Desert', speed: '×2/3', enc: 'rocky 6d20×30′ / sandy 4d6×30′', evasion: 'rocky 16+ / sandy 12+', nav: '6+' },
  jungle: { label: 'Jungle', speed: '×1/2', enc: '5d4×3′ (~38′)', evasion: '2+', nav: '14+' },
  water: { label: 'Water', speed: 'boat (Voyages)', enc: '—', evasion: '—', nav: '— (sea)' },
};

// Territory classification -> resting encounter frequency (JJ Ch 5).
const TERRITORY_FREQ: Record<string, string> = {
  civilized: 'rest: 1 enc / 7 nights',
  borderlands: 'rest: 1 enc / 3 nights',
  outlands: 'rest: 1 enc / 12 hrs',
  unsettled: 'rest: 1 enc / 12 hrs (day & night)',
};

export interface HexInfo {
  coord: string;
  terrain: string;
  terrainLabel: string;
  speed: string;
  encounterDistance: string;
  evasion: string;
  navigation: string;
  forageFood: string;
  forageWater: string;
  territory: string;
  encounterFreq: string;
  name?: string;
  note?: string;
  isPoi: boolean;
}

// Everything worth showing on hover for a hex, derived from its terrain +
// territory + the ACKS rules tables. `cell` comes from `buildHexLookup`.
export function describeHex(col: number, row: number, cell: HexCellData | undefined): HexInfo {
  const terrain = cell?.terrain ?? 'unknown';
  const r = TERRAIN_RULES[terrain] ?? { label: terrain, speed: '?', enc: '?', evasion: '?', nav: '?' };
  const territory = cell?.territory ?? '—';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const isWater = terrain === 'water';
  const dry = terrain === 'barrens' || terrain === 'desert';

  // Forage for food (RR p.276): base 18+, −4 in barrens/desert, and −4 in
  // civilized / −2 in borderlands (crops one shouldn't steal). Penalties raise
  // the effective target. Compute the real number for THIS hex.
  let ff = 18;
  const ffMods: string[] = [];
  if (dry) { ff += 4; ffMods.push('terrain −4'); }
  if (territory === 'civilized') { ff += 4; ffMods.push('civ −4'); }
  else if (territory === 'borderlands') { ff += 2; ffMods.push('bord −2'); }
  const forageFood = isWater ? '— (sea)' : `${ff}+${ffMods.length ? ` (${ffMods.join(', ')})` : ''}`;
  const forageWater = isWater ? '— (at sea)' : `${dry ? 18 : 14}+ · auto at river/lake`;

  return {
    coord: `${String(col).padStart(2, '0')}.${String(row).padStart(2, '0')}`,
    terrain,
    terrainLabel: r.label,
    speed: r.speed,
    encounterDistance: r.enc,
    evasion: r.evasion,
    navigation: r.nav,
    forageFood,
    forageWater,
    territory: territory === '—' ? '—' : cap(territory),
    encounterFreq: TERRITORY_FREQ[territory] ?? 'travel: 1 enc / hex',
    name: cell?.name,
    note: cell?.note,
    isPoi: !!cell?.name,
  };
}
