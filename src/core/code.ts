import type { Placement } from "./geometry.js";
import { BLOCK_TYPES, SHAPES, type BlockType } from "./shapes.js";

const PREFIX = "PB1";
const MAX_PIECES = 120;
const MAX_COORDINATE = 100;
/** Keeps positions accurate enough that blocks still fit exactly after a round trip. */
const SCALE = 1e7;
const typeByCode = new Map(BLOCK_TYPES.map((type) => [SHAPES[type].code, type]));

/** A short code a teacher can copy to share one design. It holds shapes only, never personal data. */
export function encodePuzzle(pieces: readonly Placement[]): string {
  const body = pieces
    .map((p) => `${SHAPES[p.type].code}${Math.round(p.x * SCALE)},${Math.round(p.y * SCALE)},${p.angle}`)
    .join("_");
  return `${PREFIX}-${body}`;
}

/** Reads a puzzle code. Codes come from outside the app, so every value is checked. */
export function decodePuzzle(code: string): Placement[] {
  const invalid = new Error("That puzzle code is not valid. Check it and try again.");
  const text = code.trim();
  if (!text.startsWith(`${PREFIX}-`) || text.length > 4000) throw invalid;
  const parts = text.slice(PREFIX.length + 1).split("_");
  if (parts.length === 0 || parts.length > MAX_PIECES) throw invalid;

  return parts.map((part) => {
    const match = /^([a-z])(-?\d{1,10}),(-?\d{1,10}),(\d{1,3})$/.exec(part);
    const type: BlockType | undefined = match ? typeByCode.get(match[1]!) : undefined;
    if (!match || !type) throw invalid;
    const x = Number(match[2]) / SCALE;
    const y = Number(match[3]) / SCALE;
    const angle = Number(match[4]);
    if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE || angle >= 360) throw invalid;
    return { type, x, y, angle };
  });
}
