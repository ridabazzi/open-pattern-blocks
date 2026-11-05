import { centre, piecesOverlap, vertices, type Placement } from "./geometry.js";
import { BLOCK_TYPES, SHAPES, type BlockType, type Point } from "./shapes.js";

export interface PuzzleOptions {
  /** The same seed and options always give the same puzzle. */
  seed: number;
  /** Target number of blocks, from 2 to 40. */
  blocks: number;
  /** Make the design mirror across a vertical line. */
  mirror?: boolean;
  /** Blocks that may be used. Defaults to all six. */
  allowed?: readonly BlockType[];
}

/** Small seeded random generator (mulberry32). */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function normalAngle(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

/** Every way to lay a block's edge against the given outside edge a→b. */
function attachments(type: BlockType, a: Point, b: Point): Placement[] {
  const shape = SHAPES[type].vertices;
  const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (a[0] - b[0]) / edgeLength;
  const uy = (a[1] - b[1]) / edgeLength;
  const direction = (Math.atan2(uy, ux) * 180) / Math.PI;
  const results: Placement[] = [];

  shape.forEach((start, i) => {
    const end = shape[(i + 1) % shape.length]!;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const local = (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
    const angle = normalAngle(direction - local);
    const radians = (angle * Math.PI) / 180;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const rx = c * start[0] - s * start[1];
    const ry = s * start[0] + c * start[1];
    for (let offset = 0; offset + length <= edgeLength + 1e-6; offset += 1) {
      results.push({
        type,
        angle,
        x: b[0] + ux * offset - rx,
        y: b[1] + uy * offset - ry,
      });
    }
  });
  return results;
}

function mirrored(piece: Placement): Placement {
  return { ...piece, x: -piece.x, angle: normalAngle(-piece.angle) };
}

function sameFootprint(a: Placement, b: Placement): boolean {
  if (a.type !== b.type) return false;
  const other = vertices(b);
  return vertices(a).every(([x, y]) =>
    other.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 1e-6),
  );
}

function reach(piece: Placement): number {
  return Math.max(...vertices(piece).map(([x, y]) => Math.hypot(x, y)));
}

/** Grows a connected design block by block, always keeping it compact. */
export function generatePuzzle(options: PuzzleOptions): Placement[] {
  const { seed, blocks, mirror = false, allowed = BLOCK_TYPES } = options;
  if (!Number.isInteger(blocks) || blocks < 2 || blocks > 40) {
    throw new RangeError("blocks must be a whole number from 2 to 40.");
  }
  if (allowed.length === 0) throw new RangeError("At least one block type is required.");

  const random = createRandom(seed);
  const pick = (): BlockType => allowed[Math.floor(random() * allowed.length)]!;
  // A mirrored design starts on the mirror line, so its first block must mirror onto itself.
  // The thin rhombus does not at its rest angle, so it is only used first when it is the only choice.
  const centrePiece = (): BlockType => {
    const options = allowed.filter((type) => SHAPES[type].restAngle === 0);
    return options[Math.floor(random() * options.length)] ?? allowed[0]!;
  };
  const first = mirror ? centrePiece() : pick();
  const angle = mirror && SHAPES[first].restAngle !== 0 ? 0 : SHAPES[first].restAngle;
  const pieces: Placement[] = [{ type: first, x: 0, y: 0, angle }];

  const fits = (candidate: Placement): boolean => !pieces.some((p) => piecesOverlap(p, candidate));

  let failures = 0;
  while (pieces.length < blocks && failures < 200) {
    const type = pick();
    const edges = pieces.flatMap((piece) => {
      const polygon = vertices(piece);
      return polygon.map((a, i): [Point, Point] => [a, polygon[(i + 1) % polygon.length]!]);
    });

    let best: Placement | null = null;
    let tried = 0;
    for (const [a, b] of shuffled(edges, random)) {
      for (const candidate of shuffled(attachments(type, a, b), random)) {
        if (!fits(candidate)) continue;
        if (mirror) {
          const twin = mirrored(candidate);
          if (!sameFootprint(candidate, twin) && (!fits(twin) || piecesOverlap(candidate, twin))) {
            continue;
          }
        }
        tried++;
        if (!best || reach(candidate) < reach(best)) best = candidate;
      }
      if (tried >= 8) break;
    }

    if (!best) {
      failures++;
      continue;
    }
    pieces.push(best);
    if (mirror) {
      const twin = mirrored(best);
      if (!sameFootprint(best, twin)) pieces.push(twin);
    }
  }
  return centre(pieces);
}
