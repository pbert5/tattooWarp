import type { TilingOptions } from "../types/project";

export interface ArcObstacle {
  /** arc-length start/end (physical units), start < end, both within [0, circumference). */
  start: number;
  end: number;
}

export interface TilePlacement {
  /** arc-length position (0..circumference) of the tile's leading edge. */
  position: number;
  /** which staggered row (0 = base, 1 = offset row half a unit up); always 0 if not staggered. */
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
  const pitch = options.unitSize * (1 + options.horizontalDelta);
  if (pitch <= 0 || circumference <= 0) return [];

  const effectiveObstacles: ArcObstacle[] = options.nonTileMode === "avoid" ? obstacles : [];
  const segments =
    effectiveObstacles.length > 0
      ? freeSegments(circumference, effectiveObstacles)
      : [{ start: 0, end: circumference }];

  const placements: TilePlacement[] = [];
  for (const seg of segments) {
    for (const pos of placeInSegment(seg, pitch)) {
      placements.push({ position: normalize(pos, circumference), row: 0 });
    }
  }

  if (options.staggered) {
    const rowOffsetSegments =
      effectiveObstacles.length > 0
        ? freeSegments(circumference, effectiveObstacles)
        : [{ start: 0, end: circumference }];
    for (const seg of rowOffsetSegments) {
      const offsetSeg = { start: seg.start + pitch / 2, end: seg.end };
      if (offsetSeg.end - offsetSeg.start <= 0) continue;
      for (const pos of placeInSegment(offsetSeg, pitch)) {
        placements.push({ position: normalize(pos, circumference), row: 1 });
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
