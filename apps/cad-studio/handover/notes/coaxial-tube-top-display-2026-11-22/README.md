# D1600 — Refine the circular rims of a coaxial tube in Top Ortho

P4, row 06, [#629](https://github.com/barocss/cad/issues/629). Base `d2a51457f9454f50a5b8f322c4fca7ec698fbbd6`.

Studio now selects the existing cylinder display tiers for one upright coaxial tube made by a circular Extrude and one through Hole, and after one supported signed Offset of its inner wall. The Model checks the native tube and all four full circular rims. The cap fill, wall fill, edge lines and edge picking use the same display tier. Each tier preserves the canonical owner table. The display uses finer samples as the projected chord error exceeds 0.25 CSS px. The native part and file recipe keep their original geometry.

- **FAIL, base display quality.** Both desktop Top Ortho fixtures kept 32 chords per rim as the outside screen radius increased from 36.68 to 196.82 CSS px. The worst projected chord differences were 0.947278451 CSS px for the outside, 0.421012645 for the original bore and 0.631518967 for the offset bore.
- **PASS, matched desktop WebGPU geometry.** At the same two scales, low zoom kept 32 chords and high zoom used 64. The three errors fell to 0.236962399, 0.105316622 and 0.157974933 CSS px. The actual pointer kept the outside display edge index 1 and inside index 3. The candidate measured the top rim at Z16 and verified the contrasting fill on the correct side of each boundary. Native Save and fresh Open reproduce the same offset B-rep and selected inner rim. A further zoom after fresh Open used 128 chords at inside screen radius 166.81 CSS px and measured 0.050213941 CSS px.
- **PASS, native and packet checks.** Baseline and candidate native digests match for each document. The volumes stay 3267.256359733384 mm³ and 2261.9467105846597 mm³, in agreement with π × (81 − r²) × 16. The two packets total 123520 bytes per fixture, within 192 KiB. Model tests cover source, +1 and −2 mm Offset, the exact shared cap/wall samples, the four rim owners and cache reuse. Eccentric bores, extra bores, translated recipes and altered display support metadata receive the canonical path.
- **PASS, affected checks.** 45 Model and 29 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Both desktop runs covered 1159 frozen source files with zero file changes, runtime errors and console errors.
- **FAIL, corrected test setup.** The first admission test attempted to build an unsupported second Offset recipe without an individual stored signature. The final test uses valid unsupported shapes to verify fallback. The first type check caught an assertion on nullable volume. The final test guards the value and all checks pass.
- **NOT_RUN.** Perspective and Iso refinement, WebGL2, exchange, mobile and full local suites. Picking remains at the merged displayed rim granularity. #629 remains open.

Use Node 22.19.0 and the D1597 original and saved offset files. Keep captures outside Git and gate each Studio run. Run the baseline at the base commit with the same harness and fixtures.

```sh
pnpm --dir packages/barocss-cad-model test cylinder-display meshWire offset-face-native
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/{cylinderDisplay,evaluate}.ts packages/barocss-cad-model/test/cylinder-display.test.ts apps/cad-studio/test/tube-rim-zoom-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode cylinder
pnpm --dir apps/cad-studio build
TUBE_RIM_FROZEN=1 node apps/cad-studio/test/tube-rim-zoom-browser.mjs "$EVIDENCE/baseline" "$ORIGINAL" "$OFFSET" --baseline
TUBE_RIM_FROZEN=1 node apps/cad-studio/test/tube-rim-zoom-browser.mjs "$EVIDENCE/refined" "$ORIGINAL" "$OFFSET"
node --check apps/cad-studio/test/tube-rim-zoom-browser.mjs
git diff --check
```
