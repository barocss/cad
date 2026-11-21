# D1558 — Compare the Screw proposal and approved Model display at one camera

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 5910d909167c214e37b4d5fbe87f90b2c310fa99.

Use the D1557 local proposal at pitch 64 mm per revolution. In actual Studio, wait for the proposal delta to finish. Capture the uploaded base body, the delta method and the viewport. Accept the proposal and capture the approved body without moving the camera. Both views use the same perspective camera and 780 × 1000 CSS-pixel canvas. The preview still represents the D1557 candidate, with 80 mm advance in the proposed shape.

- **PASS, actual desktop WebGPU measurement.** The proposed base body uploads 338 vertices without the structured packet. At the same camera the accepted body uploads 1,302 vertices and the 1,712-triangle structured packet. Its canonical body has 326 triangles. The uploaded position digests differ. The same Studio flow verifies explicit user acceptance, Undo/Redo and an unchanged digest after fresh Open.
- **FAIL, display parity.** The preview shows segment changes along the edges and facets on the body walls. The settled preview also overlays two different Boolean solids: 4,632.984810318592 mm³ added and 3,672.928784289509 mm³ removed. Preserve those delta bodies and quantities when improving the displayed proposal body. The accepted body does not show those overlays. This comparison measures the base body separately from the overlays.
- **PASS, source trace and scoped checks.** The preview evaluates in the Agent part slot without the refined display pass. The ordinary refinement path also excludes views with a proposal overlay. Scoped ESLint, browser syntax and Git diff pass. No product source changed.
- **NOT_RUN.** A refined preview candidate, direct ray-depth comparison, the second desktop renderer, live providers, generic overlays and full local suites. #630 remains open.

Run with Node 22.19.0 and the installed desktop Chrome and Playwright. Use the gate and keep the two captures and the receipt outside Git.

```sh
pnpm exec eslint apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
node --check apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs
git diff --check
SMOOTH_TURN_PIN_FROZEN=1 node apps/cad-studio/test/smooth-turn-angle-agent-browser.mjs "$EVIDENCE/baseline" "$D1552/agent-approved-smooth-screw.bcad" "$D1556/smooth-screw-pitch-56.bcad" --screw --screw-display-baseline
```
