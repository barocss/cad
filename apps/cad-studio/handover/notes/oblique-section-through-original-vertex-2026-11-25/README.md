# D1974 — Move an oblique Section through an original vertex

P4 [row 5](../../roadmap-rows/05.md) and [row 20](../../roadmap-rows/20.md). [#272](https://github.com/barocss/cad/issues/272). Base `3a148b9f1aac1cfa9288fe2fca9d388df9612d74`.

The Section pointer can use a retained original native straight-edge endpoint on a single settled oblique section. The local edge map establishes the original native edge from both uncut endpoints, its exact straight-line evidence and the adjacent face names. The pointer receives the original endpoint IDs only within the Section request. A generated cap or short edge has no such authority. The original plane normal and direction source survive Apply.

- **FAIL, previous desktop capability.** An oblique section can be created from the original bevel, but the vertex move is disabled.
- **PASS, actual WebGPU and WebGL2.** Create the oblique plane by clicking the original bevel in Studio. The live plane has normal (0.6, 0.8, 0) and offset 33.6 mm. Its retained volume is 5846.25 mm³. A generated cap point is refused. The original corner (35, 30, 10) proposes offset 45 mm, with the previous plane preserved until Apply. Cancel, Escape and a plane flip retire their candidates. Apply preserves the normal, source face, document, history and selection. Both renderers read 2343.75 mm³. WebGPU native Save and fresh Open recover the full 10460 mm³ solid with no session section.
- **PASS, independent native checks.** The initial cut `3x + 4y ≥ 168` keeps the polygon (56,0), (60,0), (60,30), (35,30), (35,15.75). The final cut `3x + 4y ≥ 225` keeps the triangle (35,30), (60,11.25), (60,30). Multiply each area by the original 10 mm height. Both native B-reps pass strict topology and volume. The original endpoint `n1_v7` qualifies before Apply, then becomes a cap point and is excluded from further original vertex picks. Its replay location agrees within 1e-7 mm. Duplicate source-edges and a witness without the Section proof are refused. Section evidence cannot authorize Sketch picks.
- **PASS, retained flow and affected checks.** Actual desktop WebGPU axis moves and original-face picks pass. 22 Studio tests, Studio types and production build, scoped ESLint and diff check.
- **Corrected during verification.** The first replay tried to reframe the bevel through the open Section controls. It now restores the plane with a second Flip. The subsequent normal assertion compared negative zero from the first setup with canonical zero after two Flips. The final check compares the exact direction immediately before and after Apply.
- **NOT_RUN.** Additional visibility and ownership scenarios, composed-project roundtrip, occurrences, full local suites and mobile. #272 remains open. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
D1974_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/prior" --oblique --baseline
D1974_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/webgpu" --oblique
D1974_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/webgl" --oblique --webgl
D1973_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/axis"
D1012_SOURCE_FROZEN=1 node apps/cad-studio/test/section-face-position-browser.mjs "$OUT/face"
pnpm --dir apps/cad-studio test section-planes section-view section-vertex-evidence vertex-pick-filter mesh-circle-pick section-exclusion-session
pnpm --dir apps/cad-studio build
git diff --check
```
