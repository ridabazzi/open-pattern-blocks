import { containsPoint, piecesOverlap, polygonsOverlap, totalArea, vertices, type Placement } from "./geometry.js";
import type { Point } from "./shapes.js";

const AREA_TOLERANCE = 1e-4;

function samples(polygon: readonly Point[]): Point[] {
  const n = polygon.length;
  const cx = polygon.reduce((sum, p) => sum + p[0], 0) / n;
  const cy = polygon.reduce((sum, p) => sum + p[1], 0) / n;
  const inset = (x: number, y: number): Point => [cx + (x - cx) * 0.9, cy + (y - cy) * 0.9];
  const points: Point[] = [[cx, cy]];
  polygon.forEach(([x, y], i) => {
    const [nx, ny] = polygon[(i + 1) % n]!;
    points.push(inset(x, y), inset((x + nx) / 2, (y + ny) / 2));
  });
  return points;
}

/**
 * True when the player's blocks exactly fill the target. Different blocks can solve the same
 * shape, such as six triangles in place of a hexagon, so this compares covered area and never
 * the exact blocks used.
 */
export function isSolved(target: readonly Placement[], placed: readonly Placement[]): boolean {
  if (target.length === 0 || placed.length === 0) return false;
  if (Math.abs(totalArea(target) - totalArea(placed)) > AREA_TOLERANCE) return false;

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (piecesOverlap(placed[i]!, placed[j]!)) return false;
    }
  }

  const polygons = placed.map(vertices);
  return target
    .flatMap((piece) => samples(vertices(piece)))
    .every((point) => polygons.some((polygon) => containsPoint(polygon, point)));
}

export interface SnapOptions {
  /** Blocks the moved block must not overlap. */
  others: readonly Placement[];
  /** Extra corners to snap to, such as those of the puzzle shape. */
  guides?: readonly Point[];
  /** Largest snapping distance in block units. */
  reach?: number;
}

/** Moves a dropped block onto the best nearby corner, if one exists. */
export function snap(piece: Placement, { others, guides = [], reach = 0.45 }: SnapOptions): Placement {
  const moving = vertices(piece);
  const fixed = [...others.flatMap(vertices), ...guides];
  const obstacles = others.map(vertices);

  const pairs: { dx: number; dy: number; distance: number }[] = [];
  for (const [mx, my] of moving) {
    for (const [fx, fy] of fixed) {
      const distance = Math.hypot(fx - mx, fy - my);
      if (distance <= reach) pairs.push({ dx: fx - mx, dy: fy - my, distance });
    }
  }
  pairs.sort((p, q) => p.distance - q.distance);

  let best: Placement = piece;
  let bestMatches = 0;
  for (const { dx, dy } of pairs.slice(0, 40)) {
    const moved: Point[] = moving.map(([x, y]) => [x + dx, y + dy]);
    if (obstacles.some((polygon) => polygonsOverlap(moved, polygon))) continue;
    const matches = moved.filter(([x, y]) =>
      fixed.some(([fx, fy]) => Math.hypot(fx - x, fy - y) < 1e-6),
    ).length;
    if (matches > bestMatches) {
      bestMatches = matches;
      best = { ...piece, x: piece.x + dx, y: piece.y + dy };
    }
  }
  return best;
}

export function overlapsAny(piece: Placement, others: readonly Placement[]): boolean {
  return others.some((other) => piecesOverlap(piece, other));
}
