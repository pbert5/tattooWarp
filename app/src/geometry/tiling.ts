import type { TilingOptions } from "../types/project";

export interface ArcObstacle {
  /** arc-length start/end (physical units), start < end, both within [0, circumference). */
  start: number;
  end: number;
}

export interface TilePlacement {
  /** arc-length position (0..circumference) of the tile's leading edge. */
  position: number;
  /** which staggered row: 0 = on the ring, each further row sits half a tile higher. */
  row: number;
}

/**
 * Splits a circular arc of length `circumference` into the free segments left
 * over after removing `obstacles`. Obstacles may wrap; overlapping/adjacent
 * obstacles are merged first. This is the "treat the gap between colliding
 * elements as its own line segment" step of the fill algorithm.
 */
export function freeSegments(circumference: number, obstacles: ArcObstacle[]): ArcObstacle[] {
  if (obstacles.length === 0) return [{ start: 0, end: circumference }];

  const sorted = [...obstacles].sort((a, b) => a.start - b.start);
  const merged: ArcObstacle[] = [];
  for (const o of sorted) {
    const last = merged[merged.length - 1];
    if (last && o.start <= last.end) {
      last.end = Math.max(last.end, o.end);
    } else {
      merged.push({ ...o });
    }
  }

  // Merge wraparound: if the first obstacle starts at/after 0 and the last ends at/after circumference.
  if (merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (last.end >= circumference && first.start <= 0) {
      first.start = last.start - circumference;
      merged.pop();
    }
  }

  const free: ArcObstacle[] = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const next = merged[(i + 1) % merged.length];
    const gapStart = cur.end;
    const gapEnd = i === merged.length - 1 ? next.start + circumference : next.start;
    if (gapEnd - gapStart > 1e-9) {
      free.push({ start: gapStart, end: gapEnd });
    }
  }
  return free;
}

/**
 * Fills a single free segment with tiles spaced `pitch` apart, flush against
 * the segment's start (i.e. against the boundary of whatever obstacle it's
 * escaping from), stopping once the next tile would no longer fit.
 */
function placeInSegment(segment: ArcObstacle, pitch: number): number[] {
  const length = segment.end - segment.start;
  const count = Math.floor(length / pitch + 1e-9) + 1;
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const pos = segment.start + i * pitch;
    if (pos <= segment.end + 1e-9) positions.push(pos);
  }
  return positions;
}

export interface TileMetrics {
  /** tiles around the full ring */
  count: number;
  /** arc length from one tile's leading edge to the next */
  pitch: number;
  /** the tile's drawn width, in model units */
  width: number;
  /** gap between tiles as a fraction of tile size; 0 = touching */
  spacing: number;
}

/**
 * A tile's size comes from the ring itself: the user says how many they want
 * around it, and the perimeter divides down to a width. Deriving it this way
 * (rather than typing an absolute size) is what makes the repeat close cleanly
 * on any limb, and it keeps the layout and the renderer from drifting apart —
 * both size off this one function.
 */
export function tileMetrics(circumference: number, options: TilingOptions): TileMetrics {
  // Older projects stored an absolute unit size; recover the equivalent count.
  const stored =
    options.tileCount ?? (options.unitSize ? circumference / options.unitSize : 8);
  const count = Math.max(1, Math.round(stored));
  const pitch = circumference / count;
  // horizontalDelta is the gap as a fraction of tile width: 0 = touching.
  const spacing = Math.max(0, options.horizontalDelta ?? 0);
  const width = pitch / (1 + spacing);
  return { count, pitch, width, spacing };
}

export interface LayoutParams {
  circumference: number;
  options: TilingOptions;
  obstacles: ArcObstacle[];
}

/**
 * Lays out tile positions around one ring's circumference. `avoid` mode
 * solves each gap between obstacles independently (general "fill whatever
 * region remains" logic); `behind`/`overlap` ignore obstacles entirely and
 * tile the full circumference, since those static elements don't affect the
 * repeat pattern, only draw order.
 */
export function layoutTiling(params: LayoutParams): TilePlacement[] {
  const { circumference, options, obstacles } = params;
  if (circumference <= 0) return [];
  const { count, pitch, width } = tileMetrics(circumference, options);
  if (pitch <= 0) return [];

  // Spins the whole repeat around the ring, measured in element radii: 1 slides
  // the pattern by half a tile, 2 by a full tile (back onto itself at delta 0).
  // Obstacles stay put, so this is also how you slide tiles out from under a
  // static element in `avoid` mode. Degrees would be the wrong unit here — a
  // degree is ~2% of a tile on a typical limb, so the arrows read as dead.
  const rotationArc = (options.rotationOffset ?? 0) * (width / 2);

  const effectiveObstacles: ArcObstacle[] = options.nonTileMode === "avoid" ? obstacles : [];
  const segments =
    effectiveObstacles.length > 0 ? freeSegments(circumference, effectiveObstacles) : null;

  // `staggered` was a bool meaning "one extra interleaved row"; older saved
  // projects still carry it, and it maps exactly onto 2 layers.
  const layers = Math.max(1, Math.round(options.staggerLayers ?? (options.staggered ? 2 : 1)));

  const placements: TilePlacement[] = [];
  for (let row = 0; row < layers; row++) {
    // Odd rows start half a pitch along, so consecutive rows interlock rather
    // than stacking in columns.
    const rowShift = (row % 2) * (pitch / 2);

    if (!segments) {
      // Unobstructed ring: place exactly `count` tiles. Walking the arc with
      // `placeInSegment` would emit one at 0 and another at the circumference,
      // which is the same spot — a doubled tile at the seam.
      for (let i = 0; i < count; i++) {
        placements.push({
          position: normalize(rowShift + i * pitch + rotationArc, circumference),
          row,
        });
      }
      continue;
    }

    for (const seg of segments) {
      const rowSeg = { start: seg.start + rowShift, end: seg.end };
      if (rowSeg.end - rowSeg.start <= 0) continue;
      for (const pos of placeInSegment(rowSeg, pitch)) {
        placements.push({ position: normalize(pos + rotationArc, circumference), row });
      }
    }
  }

  return placements;
}

function normalize(x: number, circumference: number): number {
  let v = x % circumference;
  if (v < 0) v += circumference;
  return v;
}
