# D1321 — Overlapping cage depth selection (#550)

## Bounded implementation

`pickCage` defaults to front and accepts an optional back candidate. Vertex/edge candidates within 0.5 CSS px of the minimum pointer distance form a fixed overlap set before depth ordering; edges use interpolated depth at the pointer. Faces preserve centre-depth selection. This is cage picking, not rendered-surface occlusion. Nonfinite projections are ignored.

Studio keeps Front/Back as transient next-pick state, resets it on begin, and forwards it to single/double clicks. Changing it leaves the current selection, geometry and Undo unchanged. The panel explicitly says this and shows the actual selected cage centre in mm. New depth buttons use the existing accent theme for visible active state. Existing Pick/Show styling issue #556 remains separate.

Sources: Model `subd/cageEdit.ts`; Studio `subd/useCageEditor.ts`, `ui/CagePanel.tsx`, `viewport/Viewport.tsx`, `viewport/viewportPointerInput.ts`. Tests: Model `cage-pick-depth.test.ts`, Studio `cage-depth-picking-browser.mjs`.

## Independent Mac verification

- Node 22.19.0: new five plus existing seven Model tests, 12/12 PASS. Perturbed overlap, fixed-band ordering, edge interpolation, malformed projection and history checks included.
- Actual public SubD box 30×20×16 mm, four subdivisions per side. Top/Bottom × Box/Smooth × Front/Back × Vertex/Edge/Face × 1024/1440 desktop widths: 48 picks checked against exact selected vertex Z.
- Each edge pick: Crease affects that exact edge, cage Undo restores it. Depth changes and all selection operations preserve document and history. Cancel preserves the document.
- Done commits one selected top edge crease; document Undo/Redo and native Save/fresh Open preserve the exact cage.
- Actual viewport sizes 1024×900 and 1440×900. Screenshots reviewed, including visible Back active control and selected centre. Final frozen receipt SHA256 `e6a265e34658c71b34621a5215f808ed41792d22eb8ea026facafe328293905c`.
- Model/Studio type-check, focused lint, Studio production build, diff check and independent review PASS. Final active-control styling reran Studio type-check/lint/build/browser.
- First driver attempt failed because Space activated the focused New part button rather than the palette. Driver now clicks the neutral app title before the public command shortcut. No product workaround was added.

## Limits / next

General cage families, mirror, loop/ring actual UI, mobile/AT and full suites NOT_RUN. Existing App `_k` lint and generated-doc drift remain separate. CI is not awaited per user direction. All HOLDs persist. Next D1322/#552: align the Loop button with double-click selection of an open boundary, retaining interior loops and Undo/Redo.
