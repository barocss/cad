# D1539 — Isolate the raster shadow marks on the widened Smooth Turn

P4, row 06, [#630](https://github.com/barocss/cad/issues/630). Base `d25abb58dc5b24aa2f4bfa57740bc6c6ed0d501c`. Use the saved +360°, 40 mm, 16 mm-wide Smooth Turn from D1538 and the neighboring Ruled Turn control.

- **PASS, actual desktop WebGPU Studio.** Reopen the comparison and capture Model with AO off. In Raster Render, keep the same camera within the Render comparison and turn Occlusion off. Triangular dark marks on the Smooth side faces remain after Edges is turned off. With Edges still off, turn off only the first sun's Shadow checkbox. The prominent triangular marks disappear. Restoring each property restores its prior image. These are independent switches in Render.
- **PASS, independent pixels and native geometry.** In the 390 × 675 right-hand crop, the Edges switch changes 4,730 pixels and the first sun's Shadow switch changes 45,873 pixels. The respective maximum channel changes are 203 and 106 out of 255. Both restored crops are byte-identical to their controls. The accepted shape and the named faces and edges at all four native mesh tiers agree exactly before and after. The Smooth native digest remains `e8159b3b0fdf07bb2e8f537fd64b59d86cd5a9fcc20398623dd532f6b45076de` with six faces and 12 edges. No runtime errors, console errors or frozen-source changes occur.
- **PASS, affected checks.** Scoped lint, browser syntax, Git diff and the original WebGPU AO and wireframe control using the D1520 file.
- **FAIL, corrected probe.** The first diagnostic used an unavailable PNG instance copy operation. The final driver reads each crop row directly. The existing Model display menu has no shaded-only choice, so the isolated edge and sun settings use the actual Render controls.
- **NOT_RUN.** The equivalent isolated Render switch on WebGL2, local build and types for this test-only change, full local suites and mobile. The result establishes the dependency in WebGPU Render. The smaller marks in Model require separate verification. Shared renderer changes remain under the existing HOLD. #630 stays open.

Run with Node 22.19.0, installed desktop Chrome and Playwright. Gate heavy work and keep screenshots and raw receipts outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/smooth-turn-display-browser.mjs
node --check apps/cad-studio/test/smooth-turn-display-browser.mjs
git diff --check
SMOOTH_TURN_DISPLAY_FROZEN=1 node apps/cad-studio/test/smooth-turn-display-browser.mjs "$EVIDENCE/render" "$D1538/smooth-turn-width-16.bcad" --outlines
SMOOTH_TURN_DISPLAY_FROZEN=1 node apps/cad-studio/test/smooth-turn-display-browser.mjs "$EVIDENCE/control" "$D1520/ruled-and-smooth-turn.bcad"
```
