# D1544 — Create a continuous Smooth Turn from a triangular sketch

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) · Base a2f2f460e97b167f22dba1ae82e8ea62025630eb.

Smooth Turn accepts one standalone straight convex triangular sketch. Rotate each owned section about the normal through the triangle centroid. Use 7–16 evenly spaced stations and a signed angle between −450° and +450°. The compact fit uses one cubic rotation factor and linear axial height. Simple interior knots give C2 along each rail. Positive or negative angular derivative throughout the spans keeps nonzero winding and excludes point collapse at nonzero angles. The three side surfaces share those native rails and join the two caps as one closed solid. Its three side edges are physical creases.

The native document stores existing sketch copies and a smooth Loft. History exposes Total height for an intact generated triangle. The field scales the axial positions together to keep the construction uniform. The original sketch remains a source reference. Ruled Turn remains rectangular. The native triangle uses the existing refined Model packet.

- **PASS, actual desktop Chrome Studio with WebGPU.** Open the tilted scalene sketch, create +180° and −450° turns at 40 mm, Undo and Redo, change the −450° Total height to 50 mm, Undo and Redo the edit, Save and fresh Open. The native topology is one closed solid with 5 faces, 9 edges, 6 vertices and 3 full-height rails. The 7-station and 16-station results use common cubic knot vectors. The model uses 668 versus 218 display triangles at +180°, 748 versus 244 at −450°, and 690 versus 224 after stretching and reopening. Both command previews preserve the source until Apply.
- **PASS, independent geometry and file identity.** A rational collocation and polynomial section integral for triangle area 21 mm² gives 840.4060323005599 mm³ at +180° and 840.0490227248927 mm³ at −450° (40 mm). Native reads give 840.4060323005606 and 840.0490227248931 mm³. The stretched −450° solid preserves the topology IDs and has volume 1050.061278406116 mm³ and centroid [18, −6, 46] mm. The saved and reopened documents agree exactly. The native digest after stretching and reopening is f7ca47f91445638b850c7efa26fbfbb029fb7fb6b4fc65f51039e853b81a1d23. The browser reports zero runtime errors, console errors or frozen-source changes.
- **PASS, affected checks.** Six native, 14 Model and 29 Studio tests, kernel library build, Model types, Studio production build and types, scoped ESLint, browser syntax and Git diff. Model controls cover zero angle, both signs, reversed sketch winding, bad inputs, omitted section controls and complete native file identity.
- **FAIL, corrected during implementation.** The first rectangular refactor lost one local offset binding. A zero-angle test also expected planar side support types although the exact straight geometry retains cubic side supports. A source review found that legacy per-section fields allowed edits outside the compact fit's uniform station range. The final History exposes Total height for this profile and the actual height edit passes.
- **NOT_RUN.** WebGL2 for this triangle, STEP exchange, general polygon or framed turns, triangle Angle or Width History edits, mobile, and full local suites. Faint bands remain visible with AO off in the WebGPU Model screenshot of the long turn. D1545 will isolate their display source. #630 stays open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Serialize heavy operations through the gate. Keep browser artifacts outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{smooth-rectangular-turn,two-guide-loft-display}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle ruled-turn-command
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio test viewport display-mode
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-triangular-turn-browser.mjs
git diff --check
TRIANGULAR_TURN_FROZEN=1 node apps/cad-studio/test/smooth-triangular-turn-browser.mjs "$EVIDENCE"
```
