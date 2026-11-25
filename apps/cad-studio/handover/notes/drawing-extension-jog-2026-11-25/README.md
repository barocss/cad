# D2004 — Jogged extension line on manual linear drawing dimensions (#241)

Date: 2026-11-25 · Track: P2 Drawings · Issue: [#241](https://github.com/barocss/cad/issues/241)

## Decision

Add optional `extensionJog?: LinearExtensionJog` (`{ side: 'a' | 'b', offset: number, at?: number }`) on manual orthographic (`front`/`top`/`right`) base-part `linear` drawing dimensions.

- **Reference/display separation:** `side` binds strictly to authored endpoint role `'a'` or `'b'` (never screen side or mark index, preserved even if the sibling extension is omitted under `GAP`), `offset` is a signed sheet-mm lateral shift (`1 <= |offset| <= 40`) along the canonical `A2 -> B2` dimension axis (so view reorientation and scale/unit changes preserve paper offset cleanly), and `at` is an optional normalized run position in `[0.2, 0.8]` (default `0.5`). True reference endpoints, arrowhead tips (`A2`/`B2`), and measured values stay untouched.
- **5-segment `role: 'extension'` `line` geometry (`extensionJog.ts`, `sheet.ts`):** Emits 5 connected straight `line` marks (`P0 -> P1 -> P2 -> P3 -> P4 -> P5`, starting at `GAP = 1 mm` from model point `P` and passing through exact arrowhead tip `Q` to `OVER = 2 mm`), so every bent segment participates directly in `TEXT_OVER_LINES`, `OFF_SHEET`, D416 label clearance, hit-testing, SVG, DXF display block, and 3D PMI without polyline blind spots or over-conservative bounding-box clashes.
- **Safety & interaction boundaries (`issues.ts`, `reorient.ts`, `ExportActions.tsx`):**
  - Shortened extensions (`usableRun < 6 mm`), hidden sides (`hideExtension === side`), broken views, and assembly scope retain the saved jog without emitting degenerate geometry and report `EXTENSION_JOG_INVALID`.
  - Studio provides accessible `Extension jog` side/offset/Clear controls plus a draggable SVG grip handle (`[data-jog-handle]`) that previews without mutating Doc/history, cancels cleanly on `Escape`/`pointercancel`/blur/doc change, commits in ONE atomic Undo/Redo step, and never triggers whole-dimension `place`/`orient` drag.
  - **SVG:** Emits all 5 bent segments + sibling straight extension inside `data-dim`.
  - **DXF:** Preserves native linear `DIMENSION` geometry and `measurement`, stores the 5 bent `LINE` entities in the display block, and shows an explicit Studio compatibility note (`DXF extension jog compatibility`).
  - **3D PMI (`annotations3d.ts`):** Preserves the exact 2 model targets `[a, b]` while lifting the jogged extension lines onto the annotation plane.

## Changes

- `packages/barocss-cad-model/src/drawing/extensionJog.ts` (new): `extensionJogGeometry()`, `extensionJogFromSheetPoint()`, named interfaces.
- `packages/barocss-cad-model/src/drawing/types.ts`: `LinearExtensionJog`, `readLinearExtensionJog()`, `readDrawing()` validation.
- `packages/barocss-cad-model/src/drawing/sheet.ts`: 5-segment `line` emission in `dimensionMarks()`.
- `packages/barocss-cad-model/src/drawing/issues.ts`: `EXTENSION_JOG_INVALID` diagnostics.
- `apps/cad-studio/src/ui/drawing/DimensionsList.tsx`, `apps/cad-studio/src/ui/DrawingWorkspace.tsx`, `apps/cad-studio/src/ui/drawing/ExportActions.tsx`: jog side/offset/Clear controls, endpoint preview, draggable SVG jog handle with preview/Escape cancel/owner isolation, and DXF compatibility note.
- `packages/barocss-cad-model/test/drawing-extension-jog.test.ts` (new) & `apps/cad-studio/test/drawing-extension-jog-browser.mjs` (new).

## Verification

- `@barocss/cad-model` tests (`drawing-extension-jog`, `drawing-crossing-break`, `drawing-linear-arrows`, `drawing-breaks`, `drawing-foreshortened-radius`, `drawing-fractional-inch`, `annotations3d`): **33/33 PASS**.
- `@barocss/cad-model` & `@barocss/cad-studio-app` `type-check`, scoped ESLint across all 8 touched files, `pnpm build`: **PASS**.
- Actual Chrome Studio E2E (`D2004_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-extension-jog-browser.mjs`): **PASS** (straight baseline → side A `-4 mm` jog → interactive SVG grip drag + `Escape` cancel leaving Doc/history unchanged → interactive grip drag commit `-12.99 mm` with `place`/`orient` unchanged → FIRST Undo/Redo + Clear/Undo → independent SVG & DXF downloads → native `.bcad` Save + fresh Open → post-Open Model width edit `40 -> 50 mm` updating dimension to `50` while retaining jog).
- D2003 Chrome regression (`D2003_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-crossing-break-browser.mjs`): **PASS**.

## Captured Studio scenes

- [00-straight.png](00-straight.png) — Baseline straight extension lines on `40` (`d1`) and `24` (`d2`).
- [01-jog-a-4mm.png](01-jog-a-4mm.png) — Side A extension jogged `-4 mm` with interactive blue grip handle.
- [02-jog-dragged.png](02-jog-dragged.png) — Grip dragged to `-12.99 mm` without moving `place`, `orient`, arrowheads, or sibling dimension `24`.
- [03-fresh-open.png](03-fresh-open.png) — Native `.bcad` Save and fresh Studio Open restores identical `-12.99 mm` jog on side A.
- [04-post-open-source-edit-50.png](04-post-open-source-edit-50.png) — Post-Open width edit `40 -> 50 mm` updates dimension text to `50` while preserving side A jog.
