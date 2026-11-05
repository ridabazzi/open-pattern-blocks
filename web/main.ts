import {
  BLOCK_TYPES, SHAPES, boundsOf, countBlocks, decodePuzzle, encodePuzzle, generatePuzzle, isSolved,
  outlineEdges, overlapsAny, sheetsPdf, snap, vertices,
  type BlockType, type Placement, type SheetStyle, type PaperSize,
} from "../src/core/index.js";

interface Downloads {
  save(request: { filename: string; data: Uint8Array }): Promise<{ status: string }>;
}
declare global {
  interface Window {
    claude?: { use(name: "downloads"): Promise<Downloads | null> };
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const board = document.getElementById("board") as unknown as SVGSVGElement;
const preview = document.getElementById("preview") as unknown as SVGSVGElement;
const statusLine = el("status");

type Mode = "puzzle" | "free";
let mode: Mode = "puzzle";
let level = 4;
let seed = 2;
let target: Placement[] = [];
let placed: Placement[] = [];
let freeDesign: Placement[] = [];
let selected = -1;
let solved = false;
let view = { x: -6, y: -4, w: 12, h: 8 };
let downloads: Downloads | null = null;

interface Drag {
  index: number;
  dx: number;
  dy: number;
  before: Placement | null;
  moved: boolean;
  startX: number;
  startY: number;
}
let drag: Drag | null = null;

function polygon(piece: Placement, className: string, fill?: string): SVGPolygonElement {
  const shape = document.createElementNS(SVG_NS, "polygon");
  shape.setAttribute("points", vertices(piece).map(([x, y]) => `${x},${y}`).join(" "));
  shape.setAttribute("class", className);
  if (fill) shape.setAttribute("fill", fill);
  return shape;
}

function fitView(): void {
  const rect = board.getBoundingClientRect();
  const aspect = rect.width / Math.max(rect.height, 1);
  let width = 12;
  let height = 8;
  if (target.length > 0) {
    const { minX, minY, maxX, maxY } = boundsOf(target);
    width = Math.max(maxX - minX + 5, 9);
    height = Math.max(maxY - minY + 3, 6);
  }
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  view = { x: -width / 2, y: -height / 2, w: width, h: height };
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}

function render(): void {
  // Hard puzzles hide the lines between blocks, so children work out the pieces themselves.
  const targetClass = level >= 12 ? "target solid" : "target";
  board.replaceChildren(...target.map((piece) => polygon(piece, targetClass)));
  placed.forEach((piece, index) => {
    const shape = polygon(piece, index === selected ? "piece selected" : "piece", SHAPES[piece.type].colour);
    shape.dataset.index = String(index);
    shape.setAttribute("tabindex", "0");
    shape.setAttribute("aria-label", `${SHAPES[piece.type].name} on the board`);
    board.append(shape);
  });
  el<HTMLButtonElement>("rotate").disabled = selected < 0;
  el<HTMLButtonElement>("remove").disabled = selected < 0;
}

function toBoard(event: PointerEvent): [number, number] {
  const matrix = board.getScreenCTM()!.inverse();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
  return [point.x, point.y];
}

function say(message: string): void {
  statusLine.textContent = message;
}

function checkSolved(): void {
  const banner = el("well-done");
  if (mode === "puzzle" && isSolved(target, placed)) {
    solved = true;
    const counts = [...countBlocks(placed)]
      .map(([type, count]) => `${count} ${SHAPES[type].name.toLowerCase()}${count > 1 ? "s" : ""}`)
      .join(", ");
    banner.textContent = `You did it! You used ${counts}.`;
    banner.hidden = false;
    selected = -1;
    say("Puzzle finished.");
  } else {
    solved = false;
    banner.hidden = true;
    if (mode === "puzzle") say("Fill the shape with blocks.");
  }
}

function settle(index: number): void {
  const piece = placed[index]!;
  const others = placed.filter((_, i) => i !== index);
  placed[index] = snap(piece, { others, guides: target.flatMap(vertices) });
}

function dropAllowed(index: number): boolean {
  return !overlapsAny(placed[index]!, placed.filter((_, i) => i !== index));
}

function saveFree(): void {
  if (mode === "free") freeDesign = [...placed];
  refreshTeacher();
}

function freeSpot(type: BlockType): Placement {
  const angle = SHAPES[type].restAngle;
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 12; column++) {
      const candidate: Placement = {
        type,
        angle,
        x: view.x + view.w - 1.3 - column * 1.1,
        y: view.y + view.h - 1.3 - row * 1.1,
      };
      if (!overlapsAny(candidate, [...placed, ...target])) return candidate;
    }
  }
  return { type, angle, x: 0, y: 0 };
}

function setSelected(index: number): void {
  selected = index;
  render();
}

function rotateSelected(): void {
  if (selected < 0) return;
  const piece = placed[selected]!;
  const before = { ...piece };
  placed[selected] = { ...piece, angle: (piece.angle + 30) % 360 };
  settle(selected);
  if (!dropAllowed(selected)) {
    placed[selected] = before;
    say("No room to turn here. Move the block first.");
  }
  render();
  checkSolved();
  render();
  saveFree();
}

function removeSelected(): void {
  if (selected < 0) return;
  placed.splice(selected, 1);
  selected = -1;
  render();
  checkSolved();
  saveFree();
}

board.addEventListener("pointerdown", (event) => {
  const index = Number((event.target as SVGElement).dataset?.index ?? -1);
  if (!(index >= 0)) {
    setSelected(-1);
    return;
  }
  const piece = placed[index]!;
  const [x, y] = toBoard(event);
  drag = { index, dx: piece.x - x, dy: piece.y - y, before: { ...piece }, moved: false, startX: x, startY: y };
  selected = index;
  board.setPointerCapture(event.pointerId);
  render();
});

function moveDrag(event: PointerEvent): void {
  if (!drag) return;
  const [x, y] = toBoard(event);
  if (Math.hypot(x - drag.startX, y - drag.startY) > 0.08) drag.moved = true;
  const piece = placed[drag.index]!;
  placed[drag.index] = { ...piece, x: x + drag.dx, y: y + drag.dy };
  render();
}

function endDrag(event: PointerEvent): void {
  if (!drag) return;
  const current = drag;
  drag = null;
  if (!current.moved) {
    if (current.before) placed[current.index] = current.before;
    else {
      placed[current.index] = freeSpot(placed[current.index]!.type);
      selected = current.index;
    }
    render();
    saveFree();
    return;
  }
  const [x, y] = toBoard(event);
  const outside = x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h;
  if (outside) {
    placed.splice(current.index, 1);
    selected = -1;
  } else {
    settle(current.index);
    if (!dropAllowed(current.index)) {
      if (current.before) placed[current.index] = current.before;
      else {
        placed.splice(current.index, 1);
        selected = -1;
      }
      say("That spot is taken. Try another one.");
    }
  }
  render();
  checkSolved();
  render();
  saveFree();
}

window.addEventListener("pointermove", moveDrag);
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

board.addEventListener("keydown", (event) => {
  const index = Number((event.target as SVGElement).dataset?.index ?? -1);
  if (!(index >= 0)) return;
  selected = index;
  const steps: Record<string, [number, number]> = {
    ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.25], ArrowDown: [0, 0.25],
  };
  const step = steps[event.key];
  if (step) {
    event.preventDefault();
    const piece = placed[index]!;
    placed[index] = { ...piece, x: piece.x + step[0], y: piece.y + step[1] };
    settle(index);
    render();
    checkSolved();
    saveFree();
  } else if (event.key.toLowerCase() === "r") {
    rotateSelected();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    removeSelected();
  } else {
    return;
  }
  (board.querySelector(`[data-index="${selected}"]`) as SVGElement | null)?.focus();
});

function buildTray(): void {
  const tray = el("tray");
  for (const type of BLOCK_TYPES) {
    const shape = SHAPES[type];
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Add ${shape.name}`);
    const icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("viewBox", "-1.2 -1.1 2.4 2.2");
    icon.append(polygon({ type, x: 0, y: 0, angle: shape.restAngle }, "", shape.colour));
    const name = document.createElement("span");
    name.textContent = shape.name;
    button.append(icon, name);

    button.addEventListener("pointerdown", (event) => {
      if (solved) return;
      event.preventDefault();
      const [x, y] = toBoard(event);
      placed.push({ type, x, y, angle: shape.restAngle });
      selected = placed.length - 1;
      drag = { index: selected, dx: 0, dy: 0, before: null, moved: false, startX: x, startY: y };
      render();
    });
    // Keyboard users add a block with Enter or Space. Pointer clicks are handled above.
    button.addEventListener("click", (event) => {
      if (event.detail !== 0 || solved) return;
      placed.push(freeSpot(type));
      selected = placed.length - 1;
      render();
      saveFree();
    });
    tray.append(button);
  }
}

function startPuzzle(pieces?: Placement[]): void {
  mode = "puzzle";
  target = pieces ?? generatePuzzle({ seed: seed++, blocks: level });
  placed = [];
  selected = -1;
  solved = false;
  el("well-done").hidden = true;
  syncMode();
  fitView();
  render();
  say("Fill the shape with blocks.");
}

function startFree(): void {
  mode = "free";
  target = [];
  placed = [...freeDesign];
  selected = -1;
  solved = false;
  el("well-done").hidden = true;
  syncMode();
  fitView();
  render();
  say("Build anything you like.");
}

function syncMode(): void {
  el("modePuzzle").setAttribute("aria-pressed", String(mode === "puzzle"));
  el("modeFree").setAttribute("aria-pressed", String(mode === "free"));
  el("levels").hidden = mode !== "puzzle";
  el("next").hidden = mode !== "puzzle";
  document.querySelectorAll<HTMLElement>("[data-level]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.level) === level));
  });
}

el("modePuzzle").addEventListener("click", () => startPuzzle());
el("modeFree").addEventListener("click", startFree);
el("next").addEventListener("click", () => startPuzzle());
el("rotate").addEventListener("click", rotateSelected);
el("remove").addEventListener("click", removeSelected);
el("clear").addEventListener("click", () => {
  placed = [];
  selected = -1;
  render();
  checkSolved();
  saveFree();
});
document.querySelectorAll<HTMLElement>("[data-level]").forEach((button) => {
  button.addEventListener("click", () => {
    level = Number(button.dataset.level);
    startPuzzle();
  });
});

el("codeOpen").addEventListener("click", () => {
  const error = el("codeError");
  try {
    startPuzzle(decodePuzzle(el<HTMLInputElement>("codeInput").value));
    error.hidden = true;
  } catch (caught) {
    error.textContent = (caught as Error).message;
    error.hidden = false;
  }
});

function setTab(tab: "play" | "teacher"): void {
  el("play").hidden = tab !== "play";
  el("teacher").hidden = tab !== "teacher";
  el("tabPlay").setAttribute("aria-selected", String(tab === "play"));
  el("tabTeacher").setAttribute("aria-selected", String(tab === "teacher"));
  if (tab === "teacher") refreshTeacher();
  else {
    fitView();
    render();
  }
}
el("tabPlay").addEventListener("click", () => setTab("play"));
el("tabTeacher").addEventListener("click", () => setTab("teacher"));

function clampField(id: string, low: number, high: number, fallback: number): number {
  const value = el<HTMLInputElement>(id).valueAsNumber;
  return Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : fallback;
}

function sheetDesigns(): Placement[][] {
  const count = clampField("sheets", 1, 30, 6);
  const blocks = clampField("blocks", 2, 24, 8);
  const set = clampField("seed", 1, 999999, 1);
  const mirror = el<HTMLInputElement>("mirror").checked;
  const designs = Array.from({ length: count }, (_, i) =>
    generatePuzzle({ seed: set * 1000 + i, blocks, mirror }),
  );
  if (el<HTMLInputElement>("useDesign").checked && freeDesign.length > 0) {
    designs[0] = [...freeDesign];
  }
  return designs;
}

function refreshTeacher(): void {
  if (el("teacher").hidden) return;
  const design = sheetDesigns()[0]!;
  const { minX, minY, maxX, maxY } = boundsOf(design);
  const pad = 0.3;
  preview.setAttribute(
    "viewBox",
    `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
  );
  const style = el<HTMLSelectElement>("style").value as SheetStyle;
  if (style === "outline") {
    preview.replaceChildren(
      ...outlineEdges(design).map(([a, b]) => {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(a[0]));
        line.setAttribute("y1", String(a[1]));
        line.setAttribute("x2", String(b[0]));
        line.setAttribute("y2", String(b[1]));
        return line;
      }),
    );
  } else {
    preview.replaceChildren(
      ...design.map((piece) =>
        polygon(piece, "", style === "colour" ? SHAPES[piece.type].colour : "#ffffff"),
      ),
    );
  }
  el("tally").replaceChildren(
    ...[...countBlocks(design)].map(([type, count]) => {
      const item = document.createElement("li");
      item.textContent = `${SHAPES[type].name}: ${count}`;
      return item;
    }),
  );
  el<HTMLInputElement>("code").value = encodePuzzle(design);
}

el("sheetForm").addEventListener("input", refreshTeacher);
el("shuffle").addEventListener("click", () => {
  el<HTMLInputElement>("seed").value = String(clampField("seed", 1, 999999, 1) % 999999 + 1);
  refreshTeacher();
});

el("sheetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = el("error");
  const note = el("note");
  try {
    const bytes = sheetsPdf({
      puzzles: sheetDesigns(),
      style: el<HTMLSelectElement>("style").value as SheetStyle,
      paper: el<HTMLSelectElement>("paper").value as PaperSize,
      title: el<HTMLInputElement>("title").value.trim() || "Pattern Block Mat",
      answers: el<HTMLInputElement>("answers").checked,
    });
    error.hidden = true;
    const filename = "pattern-block-sheets.pdf";
    if (downloads) {
      await downloads.save({ filename, data: bytes });
    } else {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
    note.textContent = "Your PDF is ready. Print it at 100% so real blocks fit.";
  } catch (caught) {
    if ((caught as { code?: string }).code === "declined") return;
    error.textContent = "The PDF could not be made. Check the numbers and try again.";
    error.hidden = false;
  }
});

el("copy").addEventListener("click", async () => {
  const field = el<HTMLInputElement>("code");
  try {
    await navigator.clipboard.writeText(field.value);
    el("copy").textContent = "Copied";
  } catch {
    field.select();
    el("copy").textContent = "Press Ctrl+C to copy";
  }
  setTimeout(() => (el("copy").textContent = "Copy code"), 2000);
});

new ResizeObserver(() => {
  if (!el("play").hidden) {
    fitView();
  }
}).observe(board);

buildTray();
startPuzzle();

window.claude?.use("downloads").then((namespace) => {
  downloads = namespace;
});
