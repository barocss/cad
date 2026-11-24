# D1896 — Extrude a downward XY rectangle to the original upper face

P1 [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#222](https://github.com/barocss/cad/issues/222). Base `08c144d4f53b900e3e5b597f924d14ddea3d8b61`.

The source is one literal rectangle on the exact negative-Z XY frame. The target is the original top face of one current, forward, zero-draft upright rectangular Extrude. The source frame maps local positive Y to world negative Y. Validate the reflected world footprint against the native target trim. Resolve a positive local extrusion depth and preserve the existing target body, feature and face references. If the target height reverses, the same native face name can refer to its other authored end. Reject that edit before lowering.

- **FAIL, unchanged Studio.** The negative-Z sketch presents an 8 mm distance preview and no To face option. The baseline expected-unavailable test passes.
- **PASS, actual desktop Studio.** Eight new states and four existing Front-axis control states. Pick `n1.top` and Apply. Source plane Z20 and target top Z5 produce depth 15 mm and volume 360 mm³. The world footprint is X2–8 and Y2–6 mm, with centroid `(5,4,12.5)` mm. Target top Z8 gives depth 12 mm, volume 288 mm³ and centroid `(5,4,14)` mm. Both current bodies have strict native topology and exact corner levels. Target height −5, 20 or 25 refuses with the document, bodies and Undo/Redo preserved. Undo, Redo, native project Save and fresh Open keep the original target. An additional Z6 edit gives 336 mm³.
- **PASS, affected checks.** 55 Model and 3 Studio tests, Model type checking, browser syntax, focused lint, Studio production build and Git diff check. Model also checks the reflected footprint against a target that contains only the unreflected local interval, exact raw axes, named cap and positive source lowering. Detach preserves the native negative-Z solid with positive local distance.
- **FAIL, initial checks.** One inherited source-axis test expected the old translated-XY error for the newly admitted frame. It now checks the old fixture's unsupported bottom target. The first actual changed run applied to the correct target and reached the signed-height refusal, but its harness read the collapsed error summary. The final driver exposes the detail before checking the exact diagnostic.
- **NOT_RUN.** Full local suites, other reversed source shapes, placed or arbitrary target frames, mobile and live providers. #222 retains its wider scope. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude toolset tool-contract
pnpm --dir apps/cad-studio test extrude-end-face-pick tool-contract-mcp
D1896_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/base" --baseline
D1896_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/final"
FRONT_END_FACE_SOURCE_FROZEN=1 node apps/cad-studio/test/translated-extrude-end-face-browser.mjs "$OUT/front-control" --front
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
