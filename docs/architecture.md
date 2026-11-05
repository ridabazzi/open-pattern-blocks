# Architecture

The project has two layers. `src/core` is plain TypeScript with no browser code, so it can
be tested on its own and reused. `web/` holds the screens.

## Block geometry

One block unit is the length of a short side. Every shape is stored around its centroid
and mirrors across `x = 0`. A placed block is `{ type, x, y, angle }`, and `angle` is in
whole degrees. At rest, all edges run at multiples of 30°. The thin rhombus needs a 15°
rest angle to do this, so turning any block by 30° keeps it on the same set of directions.

## Generating puzzles

The generator starts with one block, then repeatedly lays a new block against a free edge.
It tries several positions and keeps the most compact one, so designs stay connected and
fit on a page. A seeded random generator makes every set repeatable. Mirror designs also
place each block's reflection across the centre line.

## Checking a solution

`isSolved()` compares areas, not exact blocks, because a shape can have many solutions:

1. The player's total block area must equal the target's area.
2. The player's blocks must not overlap.
3. Sample points across the target must all be covered.

Equal area with full coverage and no overlap means no block can be outside the shape.

## Snapping

When a block is dropped, `snap()` looks for nearby corners. It skips positions that overlap
another block, and picks the position that lines up the most corners.

## Class sheets

`sheetsPdf()` writes PDF files directly. Printed at 100%, one block unit is one inch.
If a design is too big for the page, it is scaled down and the sheet says so.

## Puzzle codes

A code is plain text with block types, positions and angles. `decodePuzzle()` treats every
code as untrusted. It checks the format, size and ranges, and the app never inserts code
text into the page as HTML.
