# D1531 — Compare Smooth Turn ambient occlusion on both Studio renderers

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `36d1b072f1029c2dd07535f7aeff2c3c2160ca75`.

- **PASS, actual WebGPU and WebGL2.** Reopen the same D1520 two-body file in desktop Studio. Both actual backends use the exact same perspective camera and project three axis points to the same pixel coordinates. On the right-hand Smooth Turn, faint surface shading bands appear with AO on and disappear with AO off in both backends. The WebGL2 bands are more pronounced in these captures. Wireframe shows the four continuous rails and the two end rings.
- **PASS, independent pixels and native shape.** In the 255 × 635-pixel right-hand region, switching AO off changes 69,465 pixels on WebGPU and 78,567 on WebGL2. Maximum channel changes are 24 and 69 out of 255. Returning to shaded-with-edges and the original AO setting changes zero pixels from the initial image in either run. Camera, document and native mesh receipts agree exactly. The Smooth Turn digest remains `5c9f9909e18cf166d3c45171c2e53a756a1cb1be3cf1dc628688ba69e3c3c7a9` with six faces and 12 edges.
- **PASS, affected checks.** Browser syntax and Git diff pass. Both actual runs observe zero runtime errors, console errors and frozen-source changes.
- **FAIL, corrected setup.** The first launch used a stale evidence directory name for the saved fixture and stopped before starting Chrome. The final launches use the existing D1520 save.
- **NOT_RUN.** Shader correction, wider scenes or devices, mobile and local full suites. These screenshots establish the AO dependency for this fixture. The implementation cause within the AO passes is unresolved. The separate rendering HOLD and #630 remain open.

Run with Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and write screenshots outside Git.

```sh
node --check apps/cad-studio/test/smooth-turn-display-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_TURN_DISPLAY_FROZEN=1 node test/smooth-turn-display-browser.mjs "$EVIDENCE/webgpu" "$D1520/ruled-and-smooth-turn.bcad"
SMOOTH_TURN_DISPLAY_FROZEN=1 node test/smooth-turn-display-browser.mjs "$EVIDENCE/webgl2" "$D1520/ruled-and-smooth-turn.bcad" --webgl2
diff -u <(jq -S '.observations[0]' "$EVIDENCE/webgpu/receipt.json") <(jq -S '.observations[0]' "$EVIDENCE/webgl2/receipt.json")
diff -u <(jq -S '.observations[-1].position' "$EVIDENCE/webgpu/receipt.json") <(jq -S '.observations[-1].position' "$EVIDENCE/webgl2/receipt.json")
```
