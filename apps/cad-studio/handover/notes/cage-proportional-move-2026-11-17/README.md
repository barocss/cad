# #631 connected proportional numeric move

2026-11-17. Bounded numeric-preview acceptance, not complete proportional dragging or arbitrary B-rep deformation.

## Contract

Move selection has an opt-in **Connected proportional move** checkbox for vertex seeds only. Default Off preserves selected-only world/local transforms. On uses world-axis signed mm displacement and positive finite graph radius R mm; local frame, Extrude, rotation and scale are excluded. Affected vertex IDs/weights and count are visible in an expandable list, not a misleading screen-space circle.

Distance d is the minimum baseline cage-edge-length path from any selected seed, evaluated with a dependency-free binary-heap Dijkstra. Creases do not block; spatially close disconnected shells never move. At d≥R, weight is exactly zero. For u=d/R<1, w=(1-u)²(1+2u), algebraically 1−3u²+2u³. Seeds have weight one. Multiple seeds use minimum distance, not summed influence. Zero-length edges transmit zero distance; finite edge-length overflow refuses. Finite path-sum overflow lies outside every finite radius. No smooth-surface geodesic claim.

Each displacement/radius candidate is calculated from the same immutable original cage/selection. Only positive-weight coordinates change, topology/creases/selections unchanged. Existing half-cage mirror seam constraint may absorb movement. Weights represent influence before that constraint, not guaranteed movement. Invalid radius/selection/topology/coordinate overflow refuses and preserves the baseline. Zero/no-effective movement adds no history. Existing exact-receipt Apply, Cancel/Escape, source ownership and Done guards remain.

## Verification scope

- Model focused 44/44 and Studio focused20/20 PASS. Independent strip oracle d=0,R/2,R,beyond → 1,.5,0,0; multi-seed minimum; U-shaped graph vs spatial proximity; disconnected near patch; creases/zero-length edges; tiny/huge radius; mirror/no-op/history; invalid and overflow. Studio radius change/Off uses original graph coordinates. Independent model/UI review: no blocker.
- Actual desktop and final type/build results are recorded in the associated issue comment and receipt. No test count represents whole CAD completion.
- Numeric-only first slice. Proportional pointer dragging, pointercancel/lost capture, per-vertex colour overlay and broad real-cage/mirror browser fixtures remain open. No GPU/B-rep/HOLD/schema/dependency expansion.

## Actual run result

Model/Studio types, changed-source/test lint and production build **PASS**. Chrome/WebGPU 1440×1000 **first run PASS**: one top-centre vertex on an off-origin30×20×16 box, numeric Z−1/.5/2 and R5/7.5/10. Independent Manhattan distance on the top grid proves every cage coordinate; these radii cannot reach side vertices. At R10, five nonzero influences displayed; neighbouring weights .5 and .15625, seed1. Repeated radius/value previews retain one candidate undo step. Default Off and toggling Off restore selected-only behavior. Invalid empty/zero/negative R, input Escape, exact Apply, cage/document Undo/Redo, Done and actual native Save/fresh Open semantic equality passed. Zero watched source/page/console errors; owned contexts/browser/server closed.

Both actual screenshots inspected. Preview shows cage influence controls, not an accepted exact-body claim. Fresh Open is the saved accepted smooth result. Seed cage z28 differs from smooth bounds height≈17.1mm; no final-surface dimensional guarantee. Existing local-move browser not rerun; local model/Studio regressions included. Injected late-response and pointer cancellation tests remain NOT_RUN.
