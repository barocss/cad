# D1559 — Show the structured Screw shape during proposal review

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 5bf75a8e676789fe0da13eae08eb57f4238a648d.

Use a dedicated part evaluation slot to supply the existing structured grid for a proposal with one supported Screw body. The proposal initially shows its shape. Use Before and After to switch between the two shapes, and Changes to inspect the existing Boolean delta. Shape returns to the smooth view. The delta mode retains its original base body and overlay path. The proposal operation, native geometry and acceptance continue through the existing paths.

- **PASS, actual desktop WebGPU and WebGL2.** At the same perspective camera, the pitch 64 preview and the approved view upload the same 1,302 vertices and 1,712 triangles, with matching position digest `4ae0fd1353f4032f162d6067ec59bb2b5435557f771f96f3dd9031a5f7bf7aa9`. Before shows the structured pitch 56 body. Changes reproduces the D1558 338-vertex base and Boolean delta, with 4,632.984810318592 mm³ added and 3,672.928784289509 mm³ removed. Both modes keep Accept and Reject on the same row at 1440 × 1000. Preview toggles keep the accepted document exact. Explicit approval, Undo/Redo, Save and fresh Open pass with the D1557 native digest `30c38cc09eff4f36c2f64c45af4b1d37bb44b409380e8e9a2188a0032cdb7641`. Both frozen runs report zero runtime errors, console errors and source changes.
- **PASS, affected checks.** 18 Model and 41 Studio tests, Model type check, Studio build and type check, scoped ESLint, browser syntax and Git diff. The existing centered Turn width proposal passes in Studio during the implementation. Model tests compare the display slot with the approved packet and the existing Agent evaluation.
- **FAIL, corrected during development.** Drawing the structured body underneath the unchanged Boolean overlay produced visible patches where the two resolutions disagreed. The two views remove that mixed display. The compact Before/After labels initially added an accessible-name override to the ordinary proposal button. The final branch restores the ordinary button's text-derived name and retains the compact Screw control.
- **NOT_RUN.** Finer Boolean overlay surfaces, full-view numerical depth certification, arbitrary profiles, mobile, external CAD and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate each heavy run and keep all evidence outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/{engine/engine.worker.ts,state/useProposalPreview.ts,ui/ProposalBrowser.tsx} packages/barocss-cad-model/src/engine/{evaluate,mesh,screwDisplay}.ts apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs packages/barocss-cad-model/test/smooth-screw-command.test.ts
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn mesh-wire
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test viewport display-mode proposal-review-availability
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/webgpu" "$D1552/agent-approved-smooth-screw.bcad" "$D1556/smooth-screw-pitch-56.bcad" --screw --screw-display-refined
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/webgl2" "$D1552/agent-approved-smooth-screw.bcad" "$D1556/smooth-screw-pitch-56.bcad" --screw --screw-display-refined --webgl2
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/width-control" "$D1538/original-smooth-turn-width-12.bcad" "$D1538/smooth-turn-width-16.bcad" --width
```
