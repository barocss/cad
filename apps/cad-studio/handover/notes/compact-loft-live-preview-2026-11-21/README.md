# D1567 — Match compact Turn and Screw preview to the applied display

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `a8f4179eb126746122a8a67953e50bdbf132c14f`.

## Decision

Use the existing compact wall sampling on the output owned by a terminal smooth Loft in the normal command preview. The same native chart tests select the display detail in Preview and Model. This gives the terminal candidate the same wall positions, index order, face normals and edge lines in both views. The preview still uses its lightweight body data and does not compute mass.

## Evidence

- **FAIL, previous actual Studio display.** At one camera with AO off, WebGPU and WebGL2 upload 138 triangles and 148 vertices for the live triangular −360° Smooth Screw, then 1,164 triangles and 887 vertices on Apply. The old preview has angular bands and a coarser outline. The baseline driver SHA-256 is `7da4c21bf1698b1412ede1c3920606a2e881933133fa226a1f70826b20555d75`.
- **PASS, fixed-camera desktop Studio.** The same triangular Screw and camera produce 1,164 triangles and 887 vertices from Preview through Apply on both renderers. Positions, normals, indices, edge lines and owner indices yield the same SHA-256 `959e909e61770fdda7e7c2ec75c8eb29035df1c9f64fbf007159c816a80bfbf1`. The previous applied packet has this same digest. The input document stays at one sketch during Preview and the applied document matches the D1566 saved file.
- **PASS, refusal and recovery.** Set an interior axis in the live command. Apply is disabled, the candidate display clears and the input document stays at one sketch. Restore the exterior axis and recover the identical rendered packet in both backends.
- **PASS, centered desktop control.** The +360° rectangular Smooth Turn on WebGPU uses the same 1,552 triangles and 1,182 vertices for Preview and Apply. Its preview tint identifies the candidate independently of the geometry.
- **PASS, focused Model controls.** The new output uses the same detail as Model in a two-body document. Canonical mesh data represents both outputs. The earlier body uses the regular preview packet. Ruled Loft, Section and a different preview quality keep their existing paths. The existing guided Loft preview test also passes.
- **PASS, affected gates.** 37 Model and 42 Studio tests, Model types, scoped ESLint, Studio production build, browser syntax and Git diff.
- **FAIL, corrected test type.** The isolated type check required an explicit mesh type for the destructured regression assertion.
- **NOT_RUN.** Local Agent review and approval for the triangle, AO artifacts, interactive preview throughput, arbitrary profiles, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate each heavy operation. The Studio probe reads the uploaded geometry and restores the same camera through the development surface. Keep the D1566 saved triangular Screw, D1564 saved centered Turn and captures outside Git.

```sh
SCREW_LIVE_PREVIEW_FROZEN=1 node "$BASELINE_DRIVER" "$BASELINE" "$TRIANGULAR_SCREW"
SCREW_LIVE_PREVIEW_FROZEN=1 node apps/cad-studio/test/smooth-screw-live-preview-browser.mjs "$EVIDENCE" "$TRIANGULAR_SCREW" "--before=$BASELINE/receipt.json"
SCREW_LIVE_PREVIEW_FROZEN=1 node apps/cad-studio/test/smooth-screw-live-preview-browser.mjs "$EVIDENCE_CENTER" "$CENTERED_TURN" --turn
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-triangular-turn smooth-turn-angle api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/evaluate.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/smooth-screw-live-preview-browser.mjs
pnpm --dir apps/cad-studio test preview-status made-bodies-previews history-feature-apply viewport display-mode
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-screw-live-preview-browser.mjs
git diff --check
```

Use `--webgl2` in the baseline and candidate runs for WebGL2.
