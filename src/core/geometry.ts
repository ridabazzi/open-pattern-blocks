import { SHAPES, blockArea, type BlockType, type Point } from "./shapes.js";

/** A block on the board: where its centre is and how far it is turned, in whole degrees. */
export interface Placement {
  type: BlockType;
  x: number;
  y: number;
  angle: number;
}

const EPSILON = 1e-6;

export function vertices(piece: Placement): Point[] {
  const radians = (piece.angle * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return SHAPES[piece.type].vertices.map(([x, y]) => [
    piece.x + c * x - s * y,
    piece.y + s * x + c * y,
  ]);
}

function project(points: readonly Point[], nx: number, ny: number): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const [x, y] of points) {
    const value = x * nx + y * ny;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return [low, high];
}

/** Separating-axis test for convex polygons. Blocks that only touch do not overlap. */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i]!;
      const [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const length = Math.hypot(x1 - x0, y1 - y0);
      const nx = (y0 - y1) / length;
      const ny = (x1 - x0) / length;
      const [lowA, highA] = project(a, nx, ny);
      const [lowB, highB] = project(b, nx, ny);
      if (highA <= lowB + EPSILON || highB <= lowA + EPSILON) return false;
    }
  }
  return true;
}

export function piecesOverlap(a: Placement, b: Placement): boolean {
  return polygonsOverlap(vertices(a), vertices(b));
}

export function containsPoint(polygon: readonly Point[], [px, py]: Point): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i]!;
    const [x1, y1] = polygon[(i + 1) % polygon.length]!;
    const cross = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
    if (Math.abs(cross) < EPSILON) continue;
    if (sign !== 0 && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

export function totalArea(pieces: readonly Placement[]): number {
  return pieces.reduce((sum, piece) => sum + blockArea(piece.type), 0);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(pieces: readonly Placement[]): Bounds {
  const points = pieces.flatMap(vertices);
  return {
    minX: Math.min(...points.map((p) => p[0])),
    minY: Math.min(...points.map((p) => p[1])),
    maxX: Math.max(...points.map((p) => p[0])),
    maxY: Math.max(...points.map((p) => p[1])),
  };
}

export function centre(pieces: readonly Placement[]): Placement[] {
  if (pieces.length === 0) return [];
  const { minX, minY, maxX, maxY } = boundsOf(pieces);
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  return pieces.map((piece) => ({ ...piece, x: piece.x - ox, y: piece.y - oy }));
}

function canonicalPoints(points: readonly Point[]): Point[] {
  const seen: Point[] = [];
  for (const point of points) {
    if (!seen.some((other) => Math.hypot(other[0] - point[0], other[1] - point[1]) < EPSILON)) {
      seen.push(point);
    }
  }
  return seen;
}

/** The outer edges of a design. Edges shared by two blocks are removed, including partly shared ones. */
export function outlineEdges(pieces: readonly Placement[]): [Point, Point][] {
  const polygons = pieces.map(vertices);
  const corners = canonicalPoints(polygons.flat());
  const snap = (point: Point): number =>
    corners.findIndex((c) => Math.hypot(c[0] - point[0], c[1] - point[1]) < EPSILON);

  const counts = new Map<string, { a: Point; b: Point; count: number }>();
  for (const polygon of polygons) {
    polygon.forEach((start, i) => {
      const end = polygon[(i + 1) % polygon.length]!;
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const lengthSquared = dx * dx + dy * dy;
      const stops = corners
        .map((corner) => {
          const t = ((corner[0] - start[0]) * dx + (corner[1] - start[1]) * dy) / lengthSquared;
          const off = Math.hypot(start[0] + t * dx - corner[0], start[1] + t * dy - corner[1]);
          return { corner, t, off };
        })
        .filter((stop) => stop.off < EPSILON && stop.t > -EPSILON && stop.t < 1 + EPSILON)
        .sort((p, q) => p.t - q.t);
      for (let s = 0; s + 1 < stops.length; s++) {
        const a = stops[s]!.corner;
        const b = stops[s + 1]!.corner;
        const ia = snap(a);
        const ib = snap(b);
        const key = ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
        const edge = counts.get(key);
        if (edge) edge.count++;
        else counts.set(key, { a, b, count: 1 });
      }
    });
  }
  return [...counts.values()].filter((edge) => edge.count === 1).map(({ a, b }) => [a, b]);
}

export function countBlocks(pieces: readonly Placement[]): Map<BlockType, number> {
  const counts = new Map<BlockType, number>();
  for (const piece of pieces) counts.set(piece.type, (counts.get(piece.type) ?? 0) + 1);
  return counts;
}
