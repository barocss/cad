# D1651 — Extract native edge inspection from Studio App

P4, row 22. Base `c9273fe31345e9e490bec4b11c9b5e4625866581`.

`useNativeEdgeInspection` owns the native edge and body selection, current-document checks, continuity panel, location overlay and curvature comb. App supplies the workspace admission conditions and connects the returned overlays to the viewport. One condition controls admission for both inspection overlays. The current document and worker still govern when results can appear. App.tsx decreases from 3,482 to 3,459 lines. The extracted module has 64 lines.

- **PASS, focused checks.** 21 Studio tests, scoped ESLint, Studio type check and production build, and Git diff check.
- **PASS, actual desktop Studio WebGPU.** The three flows verified candidate location, empty and ambiguous selection, and straight and curved combs. Late location replies were ignored after candidate replacement and New part. Replacing a model that reused native edge IDs showed the comb on the new model. The local MCP read and independent geometry checks passed.
- **PASS, before and after.** Six location and three comb checkpoints match for the document, bodies, selection and History. Three native reads are byte-identical. The location check verifies SVG markers within 0.01 CSS px of their projected native samples. All three final flows report zero source changes, page errors or console errors.
- **FAIL.** Zero failures in the executed checks.
- **NOT_RUN.** Full local suites, WebGL2, mobile, and unrelated Studio flows.

Use Node 22.19.0 and the heavy gate. Use installed Chrome and Playwright with `CHROME` and `PW_DIR`. Run Studio against loopback only. The run used `LOOPBACK_ONLY_IMPORT` to block non-loopback browser requests and return empty CSS for the font request. Keep output outside Git.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test edge-continuity-scope continuity-location curvature-readout curvature-comb-segments curvature-scale-state
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/useNativeEdgeInspection.tsx}
pnpm --dir apps/cad-studio build
CONTINUITY_LOCATION_FROZEN=1 node --import "$LOOPBACK_ONLY_IMPORT" apps/cad-studio/test/continuity-location-browser.mjs "$OUT/location"
D1267_SOURCE_FROZEN=1 node --import "$LOOPBACK_ONLY_IMPORT" apps/cad-studio/test/edge-curvature-comb-browser.mjs "$OUT/comb"
CONTINUITY_SCOPE_FROZEN=1 node --import "$LOOPBACK_ONLY_IMPORT" apps/cad-studio/test/edge-continuity-scope-browser.mjs "$OUT/scope"
git diff --check
```
