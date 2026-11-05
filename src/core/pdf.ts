import { boundsOf, countBlocks, outlineEdges, vertices, type Placement } from "./geometry.js";
import { BLOCK_TYPES, SHAPES, type Point } from "./shapes.js";

export type SheetStyle = "guided" | "outline" | "colour";
export type PaperSize = "a4" | "letter";

export interface SheetOptions {
  puzzles: readonly (readonly Placement[])[];
  style: SheetStyle;
  paper: PaperSize;
  title?: string;
  answers?: boolean;
}

const PAPER: Record<PaperSize, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/** Standard wooden pattern blocks have sides of one inch, which is 72 points. */
const ACTUAL_SIZE = 72;
const MARGIN = 40;
const f = (value: number): string => value.toFixed(2);

function text(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
}

function label(x: number, y: number, size: number, value: string, bold = false): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${f(x)} ${f(y)} Td (${text(value)}) Tj ET`;
}

function polygonPath(points: readonly Point[], map: (p: Point) => Point): string {
  return (
    points
      .map((point, i) => {
        const [x, y] = map(point);
        return `${f(x)} ${f(y)} ${i === 0 ? "m" : "l"}`;
      })
      .join(" ") + " h"
  );
}

function drawDesign(
  pieces: readonly Placement[],
  style: SheetStyle,
  map: (p: Point) => Point,
): string[] {
  const out = ["0.75 w 1 j 0 0 0 RG"];
  for (const piece of pieces) {
    const path = polygonPath(vertices(piece), map);
    if (style === "colour") {
      const [r, g, b] = SHAPES[piece.type].rgb;
      out.push(`${r} ${g} ${b} rg ${path} B`);
    } else if (style === "guided") {
      out.push(`${path} S`);
    }
  }
  if (style === "outline") {
    out.push("1.5 w");
    for (const [a, b] of outlineEdges(pieces)) {
      const [ax, ay] = map(a);
      const [bx, by] = map(b);
      out.push(`${f(ax)} ${f(ay)} m ${f(bx)} ${f(by)} l S`);
    }
  }
  return out;
}

function page(
  pieces: readonly Placement[],
  style: SheetStyle,
  width: number,
  height: number,
  heading: string,
  answer: boolean,
): string {
  const content: string[] = ["0 0 0 rg 0 0 0 RG"];
  content.push(label(MARGIN, height - MARGIN - 8, 18, heading, true));
  if (!answer) {
    content.push(
      label(MARGIN, height - MARGIN - 34, 11, "Name ______________________"),
      label(width - MARGIN - 150, height - MARGIN - 34, 11, "Date ______________"),
    );
  }

  const tallyHeight = 104;
  const areaTop = height - MARGIN - 52;
  const areaBottom = MARGIN + tallyHeight;
  const areaWidth = width - 2 * MARGIN;
  const areaHeight = areaTop - areaBottom;

  const { minX, minY, maxX, maxY } = boundsOf(pieces);
  const designW = maxX - minX;
  const designH = maxY - minY;
  const scale = Math.min(ACTUAL_SIZE, areaWidth / designW, areaHeight / designH);
  const left = MARGIN + (areaWidth - designW * scale) / 2;
  const top = areaTop - (areaHeight - designH * scale) / 2;
  content.push(
    ...drawDesign(pieces, style, ([x, y]) => [left + (x - minX) * scale, top - (y - minY) * scale]),
  );

  const counts = countBlocks(pieces);
  content.push("0 0 0 rg", label(MARGIN, MARGIN + 78, 11, answer ? "Blocks used" : "How many of each block did you use?", true));
  const columnWidth = (width - 2 * MARGIN) / BLOCK_TYPES.length;
  BLOCK_TYPES.forEach((type, column) => {
    const centreX = MARGIN + columnWidth * (column + 0.3);
    const centreY = MARGIN + 42;
    const shape = SHAPES[type];
    const [r, g, b] = shape.rgb;
    const icon = polygonPath(
      vertices({ type, x: 0, y: 0, angle: shape.restAngle }),
      ([x, y]) => [centreX + x * 15, centreY - y * 15],
    );
    content.push("0.5 w", `${r} ${g} ${b} rg ${icon} B`, "0 0 0 rg");
    content.push(
      label(centreX + 19, centreY - 5, 13, answer ? `${counts.get(type) ?? 0}` : "__"),
    );
  });

  const actual = scale === ACTUAL_SIZE;
  content.push(
    label(
      MARGIN,
      MARGIN - 4,
      8,
      actual
        ? "Print at 100% (actual size) so real one-inch pattern blocks fit."
        : "This design was scaled to fit the page. Use it as a picture guide.",
    ),
  );
  return content.join("\n");
}

/** Builds a printable PDF of class sheets, with an optional colour answer page for each sheet. */
export function sheetsPdf(options: SheetOptions): Uint8Array {
  const { puzzles, style, paper, title = "Pattern Block Mat", answers = false } = options;
  if (puzzles.length === 0 || puzzles.some((pieces) => pieces.length === 0)) {
    throw new RangeError("At least one design with blocks is required.");
  }
  const [width, height] = PAPER[paper];
  const streams: string[] = [];
  puzzles.forEach((pieces, i) => {
    streams.push(page(pieces, style, width, height, `${title} ${i + 1}`, false));
  });
  if (answers) {
    puzzles.forEach((pieces, i) => {
      streams.push(page(pieces, "colour", width, height, `Answer ${i + 1}`, true));
    });
  }

  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  add(`<< /Title (${text(title)}) /Producer (Open Pattern Blocks) >>`);
  const kids: string[] = [];
  for (const stream of streams) {
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contentId} 0 R ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    );
    kids.push(`${pageId} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
