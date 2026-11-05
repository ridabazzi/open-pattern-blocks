import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES, SHAPES, blockArea, boundsOf, centre, containsPoint, countBlocks, decodePuzzle,
  encodePuzzle, generatePuzzle, isSolved, outlineEdges, overlapsAny, piecesOverlap, sheetsPdf,
  snap, totalArea, vertices, type Placement,
} from "../src/core/index.js";

const edgesOf = (p: Placement): number[] => {
  const v = vertices(p);
  return v.map(([x, y], i) => {
    const [nx, ny] = v[(i + 1) % v.length]!;
    return Math.hypot(nx - x, ny - y);
  });
};
const at = (type: Placement["type"], x = 0, y = 0, angle = SHAPES[type].restAngle): Placement => ({ type, x, y, angle });

describe("block shapes", () => {
  it("match the classic area relationships", () => {
    const triangle = blockArea("triangle");
    expect(blockArea("hexagon")).toBeCloseTo(6 * triangle, 9);
    expect(blockArea("trapezoid")).toBeCloseTo(3 * triangle, 9);
    expect(blockArea("rhombus")).toBeCloseTo(2 * triangle, 9);
    expect(blockArea("square")).toBeCloseTo(1, 9);
    expect(blockArea("thin-rhombus")).toBeCloseTo(0.5, 9);
  });

  it("have unit sides, except the trapezoid's long base", () => {
    for (const type of BLOCK_TYPES) {
      const sides = edgesOf(at(type)).sort((a, b) => a - b);
      expect(sides[0]).toBeCloseTo(1, 9);
      expect(sides[sides.length - 1]).toBeCloseTo(type === "trapezoid" ? 2 : 1, 9);
    }
  });

  it.each(BLOCK_TYPES)("%s mirrors onto itself across x = 0", (type) => {
    const points = SHAPES[type].vertices;
    for (const [x, y] of points) {
      expect(points.some(([ox, oy]) => Math.hypot(ox + x, oy - y) < 1e-9)).toBe(true);
    }
  });

  it.each(BLOCK_TYPES)("%s edges run at multiples of 30° when at rest", (type) => {
    const v = vertices(at(type));
    v.forEach(([x, y], i) => {
      const [nx, ny] = v[(i + 1) % v.length]!;
      const degrees = (Math.atan2(ny - y, nx - x) * 180) / Math.PI;
      const remainder = Math.abs(degrees / 30 - Math.round(degrees / 30));
      expect(remainder).toBeLessThan(1e-6);
    });
  });
});

describe("overlap", () => {
  it("treats touching blocks as separate", () => {
    expect(piecesOverlap(at("square"), at("square", 1))).toBe(false);
  });
  it("detects a real overlap", () => {
    expect(piecesOverlap(at("square"), at("square", 0.5))).toBe(true);
    expect(overlapsAny(at("hexagon"), [at("square", 5), at("triangle", 0.2)])).toBe(true);
  });
  it("finds points inside a block", () => {
    const hex = vertices(at("hexagon"));
    expect(containsPoint(hex, [0, 0])).toBe(true);
    expect(containsPoint(hex, [3, 0])).toBe(false);
  });
});

describe("generatePuzzle", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i * 37 + 1);

  it("repeats exactly for one seed and changes with another", () => {
    const options = { seed: 7, blocks: 10 };
    expect(generatePuzzle(options)).toEqual(generatePuzzle(options));
    expect(generatePuzzle(options)).not.toEqual(generatePuzzle({ ...options, seed: 8 }));
  });

  it.each([3, 6, 12, 24])("makes %i valid blocks across many seeds", (blocks) => {
    for (const seed of seeds) {
      const pieces = generatePuzzle({ seed, blocks });
      expect(pieces).toHaveLength(blocks);
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          expect(piecesOverlap(pieces[i]!, pieces[j]!)).toBe(false);
        }
      }
    }
  });

  it("keeps designs in one connected piece", () => {
    for (const seed of seeds) {
      const pieces = generatePuzzle({ seed, blocks: 14 }).map(vertices);
      const touching = (a: typeof pieces[number], b: typeof pieces[number]): boolean => {
        const shared = a.filter(([x, y]) => b.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 1e-6));
        return shared.length >= 1;
      };
      const reached = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const current = queue.pop()!;
        pieces.forEach((polygon, index) => {
          if (!reached.has(index) && touching(pieces[current]!, polygon)) {
            reached.add(index);
            queue.push(index);
          }
        });
      }
      expect(reached.size).toBe(pieces.length);
    }
  });

  it("makes true mirror designs", () => {
    for (const seed of seeds) {
      const pieces = generatePuzzle({ seed, blocks: 10, mirror: true });
      expect(pieces.length).toBeGreaterThanOrEqual(10);
      const points = pieces.flatMap(vertices);
      for (const [x, y] of points) {
        expect(points.some(([ox, oy]) => Math.hypot(ox + x, oy - y) < 1e-6)).toBe(true);
      }
    }
  });

  it("uses only allowed blocks", () => {
    const pieces = generatePuzzle({ seed: 3, blocks: 12, allowed: ["triangle", "rhombus"] });
    expect(new Set(pieces.map((p) => p.type))).toEqual(new Set(["triangle", "rhombus"]));
  });

  it.each([[1], [41], [2.5]])("rejects %s blocks", (blocks) => {
    expect(() => generatePuzzle({ seed: 1, blocks })).toThrow(RangeError);
  });

  it("rejects an empty block list", () => {
    expect(() => generatePuzzle({ seed: 1, blocks: 4, allowed: [] })).toThrow(RangeError);
  });

  it("centres designs on the origin", () => {
    const { minX, maxX, minY, maxY } = boundsOf(generatePuzzle({ seed: 5, blocks: 9 }));
    expect(minX + maxX).toBeCloseTo(0, 9);
    expect(minY + maxY).toBeCloseTo(0, 9);
  });
});

describe("isSolved", () => {
  it("accepts the original solution", () => {
    const target = generatePuzzle({ seed: 11, blocks: 8 });
    expect(isSolved(target, target)).toBe(true);
  });

  it("accepts a different correct solution: six triangles for a hexagon", () => {
    const radius = (2 / 3) * (Math.sqrt(3) / 2);
    const triangles = [30, 90, 150, 210, 270, 330].map((direction): Placement => {
      const radians = (direction * Math.PI) / 180;
      return {
        type: "triangle",
        x: radius * Math.cos(radians),
        y: radius * Math.sin(radians),
        angle: (direction - 90 + 360) % 360,
      };
    });
    expect(isSolved([at("hexagon")], triangles)).toBe(true);
  });

  it("rejects an unfinished board", () => {
    const target = generatePuzzle({ seed: 2, blocks: 6 });
    expect(isSolved(target, target.slice(1))).toBe(false);
    expect(isSolved(target, [])).toBe(false);
  });

  it("rejects the right area in the wrong place", () => {
    const target = [at("square")];
    expect(isSolved(target, [at("square", 5)])).toBe(false);
  });

  it("rejects stacked blocks", () => {
    const target = [at("square"), at("square", 1)];
    expect(isSolved(target, [at("square"), at("square")])).toBe(false);
  });
});

describe("snap", () => {
  it("pulls a nearby block onto a neighbour's corner", () => {
    const fixed = at("square");
    const moved = snap(at("square", 1.15, 0.1), { others: [fixed] });
    expect(moved.x).toBeCloseTo(1, 9);
    expect(moved.y).toBeCloseTo(0, 9);
  });

  it("leaves a far block alone", () => {
    const piece = at("square", 6, 6);
    expect(snap(piece, { others: [at("square")] })).toEqual(piece);
  });

  it("snaps to puzzle guides", () => {
    const guides = vertices(at("square", 3, 3));
    const moved = snap(at("square", 3.2, 2.9), { others: [], guides });
    expect(moved.x).toBeCloseTo(3, 9);
    expect(moved.y).toBeCloseTo(3, 9);
  });

  it("never snaps into an overlap", () => {
    const fixed = at("hexagon");
    const moved = snap(at("square", 1.55, 0), { others: [fixed], reach: 0.5 });
    expect(piecesOverlap(moved, fixed)).toBe(false);
  });
});

describe("outlineEdges", () => {
  it("removes a fully shared edge", () => {
    expect(outlineEdges([at("square"), at("square", 1)])).toHaveLength(6);
  });

  it("removes a partly shared edge, such as a square on the trapezoid's base", () => {
    const trapezoid = at("trapezoid");
    const v = vertices(trapezoid);
    const longest = v
      .map((p, i) => [p, v[(i + 1) % v.length]!] as const)
      .sort((a, b) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]))[0]!;
    const y = longest[0][1];
    const square = at("square", 0.5 + Math.min(longest[0][0], longest[1][0]), y + 0.5);
    const edges = outlineEdges([trapezoid, square]);
    // 4 trapezoid sides, with the base split so one half remains, plus 3 square sides.
    expect(edges).toHaveLength(3 + 1 + 3);
  });
});

describe("puzzle codes", () => {
  it("round-trips a design", () => {
    const pieces = generatePuzzle({ seed: 21, blocks: 9 });
    const decoded = decodePuzzle(encodePuzzle(pieces));
    expect(decoded).toHaveLength(pieces.length);
    expect(isSolved(pieces, decoded)).toBe(true);
    expect(countBlocks(decoded)).toEqual(countBlocks(pieces));
  });

  it.each([
    "", "hello", "PB1-", "PB1-x1,2,3", "PB1-h1,2", "PB1-h1,2,999", "PB1-h99999999999,2,3",
    "PB1-h<script>,2,3", "PB1-h2000000000,0,0", `PB1-${"h0,0,0_".repeat(200)}h0,0,0`,
  ])("rejects %j", (code) => {
    expect(() => decodePuzzle(code)).toThrow("not valid");
  });
});

describe("sheetsPdf", () => {
  const puzzles = [generatePuzzle({ seed: 1, blocks: 5 }), generatePuzzle({ seed: 2, blocks: 8 })];
  const read = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

  it("has one page per sheet, plus answers", () => {
    const pdf = read(sheetsPdf({ puzzles, style: "guided", paper: "a4", answers: true }));
    expect(pdf).toContain("/Count 4");
    expect(pdf).toContain("(Answer 2)");
  });

  it("writes a correct cross-reference table", () => {
    const pdf = read(sheetsPdf({ puzzles, style: "outline", paper: "letter" }));
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].forEach((match, i) => {
      expect(pdf.slice(Number(match[1])).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
  });

  it("prints a small design at real block size", () => {
    const pdf = read(sheetsPdf({ puzzles: [[at("square")]], style: "guided", paper: "a4" }));
    expect(pdf).toContain("actual size");
  });

  it("says so when a large design is scaled down", () => {
    const large = generatePuzzle({ seed: 3, blocks: 40 });
    const pdf = read(sheetsPdf({ puzzles: [large], style: "colour", paper: "a4" }));
    expect(pdf).toContain("scaled to fit");
  });

  it("escapes a teacher's title", () => {
    const pdf = read(sheetsPdf({ puzzles, style: "guided", paper: "a4", title: "Class (2)\\A" }));
    expect(pdf).toContain("Class \\(2\\)\\\\A");
  });

  it("rejects an empty sheet", () => {
    expect(() => sheetsPdf({ puzzles: [[]], style: "guided", paper: "a4" })).toThrow(RangeError);
  });
});

describe("centre", () => {
  it("handles an empty list", () => {
    expect(centre([])).toEqual([]);
  });
});
