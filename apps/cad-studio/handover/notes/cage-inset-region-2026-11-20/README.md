# Connected planar SubD region inset

P5, row 08, issue #628. The starting commit was `7411d8f138896576b5fecdd0245d4cf2107dc43b`. In desktop Studio, one top face enabled Inset. Adding its coplanar neighbor disabled it. The same two faces now share one outer inset border. The cage editor owns selection, preview and commands. App.tsx stays at 3,988 lines.

## Geometry and editing

The input is one edge-connected set of consistently wound planar convex quads with a single convex outer loop. Each boundary corner moves to the intersection of its two inward-offset lines. A vertex on a straight side moves along the side's inward normal. Interior vertices retain their IDs and use mean value coordinates of the original boundary to follow the new boundary. The selected cap faces retain their IDs and adjacency. Each outer edge gets one ring quad. Unselected faces, original boundary positions and outer creases are preserved. New edges are smooth. Picking the same region in another order produces the same cage.

The plane and distance tolerance is the larger of 1e-9 mm and 1e-9 times the region extent. Rounding is checked in all three world coordinates. A skew two-face fixture gives 64.5 mm² of inner cage area at 1 mm. A separate large-coordinate fixture previously projected to the requested 1.4 mm yet missed the plane by 0.2 mm. Such results now refuse before entering history.

Disconnected patches, concavity, holes, reversed winding, collapsed or inverted quads, nonplanarity, internal creases and mirror-seam contact or crossing return an error. A rejected preview restores the input cage. Inset measures distance on the control cage. The subdivided surface has different dimensions.

The existing region Extrude copied a shared interior vertex even when no original face or wall still used it. A 2×2 top patch on a closed box left vertex 17 unused and failed cage validation. Extrude now reuses interior cap vertices and duplicates boundary vertices for the side walls. The four-quad regression builds one closed native solid and validates its B-rep.

## Verification

- Kernel library build and six SubD cage tests passed. Model passed 95 focused cage tests. Studio passed 24 cage tests. Changed TypeScript lint, the kernel code-shape check, Model and Studio type checks, and the Studio production build passed.
- Actual desktop Chrome with WebGPU started from a 30 × 20 × 16 mm box with 96 cage faces. Shift-click selected faces 90 and 86. Inset by 1 mm left a 13 × 3 mm inner region and six border quads; the shared edge acquired no wall. A 2.5 mm inset collapsed the 5 mm side and was refused. Both preview Cancel and cage Cancel after Apply preserved the accepted document. Cage and document Undo/Redo returned the expected coordinates and selections.
- Raising the two selected faces by 2 mm gave one smooth solid of 9101.496731213 mm³ before Save and after Open in a fresh browser context. Source box volume was 9044.223951788 mm³. The single-face flow also passed.
- The four central quads retained one shared interior vertex. They produced eight border quads and eight extrusion walls. Every final cage vertex was in use. Both a +2 mm raised pad and a −2 mm recess completed Done → Save → fresh Open. Their reopened volumes were 9216.404563459 and 8873.971533903 mm³, respectively. In both cases an instrumented browser held a real successful preview reply, cancelled the draft, then delivered the old reply. Apply remained unavailable while waiting, and delivery after Cancel preserved the accepted document and selection.
- All four browser runs recorded zero uncaught errors, console errors and watched file changes. The independently tilted fixture, internal crease and mirror refusals were tested at Model level. Mobile, nonplanar region inset and exact wall-thickness measurement were not run.

## Commands

Use Node 22.19.0 and the heavy gate for one run at a time. Run the kernel build from its package directory before its tests.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/subd-cage.test.mjs
node packages/barocss-cad-model/scripts/test.mjs cage
node apps/cad-studio/scripts/test.mjs cage
pnpm --filter @barocss/cad-model type-check
pnpm build
cd apps/cad-studio
CAGE_INSET_REGION_SOURCE_FROZEN=1 node test/cage-inset-region-browser.mjs "$OUTPUT/two"
CAGE_INSET_SOURCE_FROZEN=1 node test/cage-inset-browser.mjs "$OUTPUT/one"
```

The four-face checks used the same desktop fixture with the two additional top face centers at (−3.75, −2.5, 16) and (3.75, −2.5, 16) mm. The edited caps reached z = 18 mm for the pad and z = 14 mm for the recess.
