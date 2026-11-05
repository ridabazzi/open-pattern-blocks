export type Point = readonly [x: number, y: number];

export type BlockType = "hexagon" | "trapezoid" | "rhombus" | "triangle" | "square" | "thin-rhombus";

export interface BlockShape {
  type: BlockType;
  name: string;
  /** One-letter id used in puzzle codes. */
  code: string;
  colour: string;
  /** PDF fill as 0–1 RGB. */
  rgb: readonly [number, number, number];
  /** Corners in block units, in one winding order, around the centroid. Each shape mirrors across x = 0. */
  vertices: readonly Point[];
  /** Tray and new-piece angle in degrees. All block edges then run at multiples of 30°. */
  restAngle: number;
}

function centred(points: readonly Point[]): Point[] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  });
  const ox = cx / (3 * area);
  const oy = cy / (3 * area);
  return points.map(([x, y]) => [x - ox, y - oy]);
}

const S3 = Math.sqrt(3) / 2;
const COS15 = Math.cos(Math.PI / 12);
const SIN15 = Math.sin(Math.PI / 12);

/** The six standard pattern blocks. One block unit is the length of a short side. */
export const SHAPES: Readonly<Record<BlockType, BlockShape>> = {
  hexagon: {
    type: "hexagon",
    name: "Hexagon",
    code: "h",
    colour: "#f6c324",
    rgb: [0.965, 0.765, 0.141],
    restAngle: 0,
    vertices: centred([[1, 0], [0.5, S3], [-0.5, S3], [-1, 0], [-0.5, -S3], [0.5, -S3]]),
  },
  trapezoid: {
    type: "trapezoid",
    name: "Trapezoid",
    code: "t",
    colour: "#e0392e",
    rgb: [0.878, 0.224, 0.18],
    restAngle: 0,
    vertices: centred([[0.5, 0], [-0.5, 0], [-1, S3], [1, S3]]),
  },
  rhombus: {
    type: "rhombus",
    name: "Blue rhombus",
    code: "r",
    colour: "#2f6fd0",
    rgb: [0.184, 0.435, 0.816],
    restAngle: 0,
    vertices: centred([[S3, 0], [0, 0.5], [-S3, 0], [0, -0.5]]),
  },
  triangle: {
    type: "triangle",
    name: "Triangle",
    code: "g",
    colour: "#38a84f",
    rgb: [0.22, 0.659, 0.31],
    restAngle: 0,
    vertices: centred([[0.5, S3], [-0.5, S3], [0, 0]]),
  },
  square: {
    type: "square",
    name: "Square",
    code: "s",
    colour: "#f08a24",
    rgb: [0.941, 0.541, 0.141],
    restAngle: 0,
    vertices: centred([[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]),
  },
  "thin-rhombus": {
    type: "thin-rhombus",
    name: "Thin rhombus",
    code: "n",
    colour: "#d9b382",
    rgb: [0.851, 0.702, 0.51],
    restAngle: 15,
    vertices: centred([[COS15, 0], [0, SIN15], [-COS15, 0], [0, -SIN15]]),
  },
};

export const BLOCK_TYPES = Object.keys(SHAPES) as BlockType[];

/** Area of one block in square block units. */
export function blockArea(type: BlockType): number {
  const points = SHAPES[type].vertices;
  let sum = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length]!;
    sum += x0 * y1 - x1 * y0;
  });
  return Math.abs(sum) / 2;
}
