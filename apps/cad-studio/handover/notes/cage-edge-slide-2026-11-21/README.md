# Existing SubD edge-loop slide

P5, row 08, [#627](https://github.com/barocss/cad/issues/627). Part A remains the [loop insertion workflow](../cage-loop-ratio-2026-11-17/README.md). Part B moves one existing regular loop along the adjacent control-cage rails. Base commit `c88ca4eea95cc92fc7be46517dca591cb5f911cd`.

Select a full edge loop and choose **Slide loop**. The signed ratio is dimensionless. The panel shows the two target edges for the canonical anchor. Positive uses the face on the anchor's directed half-edge. Negative uses the twin. Each selected vertex moves by the absolute ratio of the distance from its baseline position to the corresponding rail endpoint. The input must lie strictly between −1 and +1. Zero and changes below representable precision keep cage history intact.

The geometry accepts closed regular loops and open regular chains that end at two boundary rails. Each face pair must form a convex planar quad with a straight rail at each side. Each original and displaced split must remain inside those rails and preserve both quad windings. The operation refuses duplicated or ambiguous selections, poles, non-quad faces, invalid creases, mirrored cages, warped or overlapping rail rows, endpoint contact and XYZ precision loss. Selection, edge and face IDs, connectivity and creases remain available after a successful move. Catmull–Clark subdivision can change the smooth result as the control cage changes.

Both insertion and sliding use the same preview lifecycle. Each ratio uses its captured baseline. Apply requires a matching successful evaluation for the active document and candidate. Reject and Cancel restore the session baseline. A late reply has no effect on a cancelled or replaced preview. App.tsx keeps its previous line count.

## Verification

- Model cage tests 105 PASS, including 10 Edge Slide cases. Studio cage tests 24 PASS. Scoped lint, Model and Studio type checks and production build PASS.
- In desktop Chrome/WebGPU, the existing 16-edge loop on the 30 × 20 × 16 mm box started at X = 0. Neighboring rows were at X = −7.5 and +7.5 mm. Ratio +0.25 put all 16 vertices at −1.875 mm. Ratio −0.5 put them at +3.75 mm. Each preview preserved the other coordinates, 98 vertices, 192 edges, 96 quads and the selected edge set. Blank, ±1 and outside-range inputs refused. Zero Apply preserved the available redo.
- PASS on exact-ready Apply, Cancel, input Escape, cage Undo/Redo, Done and document Undo/Redo. An instrumented browser delayed a successful real engine response across Cancel. A separate controlled injection delivered an evaluation refusal to exercise the failure route. Both checks preserved the original document. A native save reopened as one solid with volume 9044.223951690 mm³ and centroid X = −0.001780017 mm, equal to the accepted result. The original centroid X was within 1e-12 mm of zero.
- Existing Insert Loop and connected region Inset desktop flows also PASS. All three runs recorded zero page errors, console errors and watched file changes. The first browser driver incorrectly required a volume change of 1e-4 mm³. The corrected driver checks cage coordinates, the independent change in centroid and equality across native reopen.
- Open chains, tilted rails and refusals are Model tests. Interactive mobile is NOT_RUN.

Use Node 22.19.0. Run heavy tasks one at a time through the gate. Browser tests use the existing desktop Chrome and Playwright paths and fresh output directories outside the checkout.

```sh
node packages/barocss-cad-model/scripts/test.mjs cage
node apps/cad-studio/scripts/test.mjs cage
pnpm --filter @barocss/cad-model type-check
pnpm build
cd apps/cad-studio
CAGE_SLIDE_SOURCE_FROZEN=1 node test/cage-edge-slide-browser.mjs "$OUTPUT/slide"
CAGE_LOOP_SOURCE_FROZEN=1 node test/cage-loop-ratio-browser.mjs "$OUTPUT/insert"
CAGE_INSET_REGION_SOURCE_FROZEN=1 node test/cage-inset-region-browser.mjs "$OUTPUT/inset"
```
