# D1367 — Precise Draft angle recovery

Base `a54eec185b3b6034582d3ae681169d95a9a53cab`. Partial #22; umbrella remains open.

Model `errors.ts` maps DRAFT_ANGLE and only the exact native INPUT angle phrase to finite, nonzero, strictly between −45° and 45° recovery. Studio `commandBuildFailure.ts` routes only typed DRAFT_ANGLE from Draft/Edit Draft build failures to that mapping; other commands/errors retain their prior failure object. Preview lifetime/command/value ownership guards remain unchanged. No native admission, angle range, geometry or adjacent-face support changes. Numeric History retains its existing post-submit failure timing.

## Verification and corrected first attempt

- Initial Model mapping passed unit checks but actual Chrome exposed the separate HUD build-catch path still showing generic Invalid input. The first run is retained as FAIL; the narrow Studio bridge and two regressions were then added.
- Final focused 10 tests PASS (Model 8 including existing Draft controls, Studio 2), Model/Studio TypeScript, scoped lint, production build, driver syntax and diff check PASS.
- Final actual Chrome existing adjacent-planar Draft suite: creation, numeric History and Edit Draft reject 0/45/−45 with visible exact-range guidance and unchanged source; numeric History retains raw invalid text. Valid +10° and −12° two-adjacent-face Draft, separate collapse refusal, strict B-rep/independent analytic geometry checks, Undo/Redo and downloaded Save/fresh Open all PASS. Existing adjacent-face acceptance is retained, not reverted to refusal.
- Actual creation and numeric-History failure screenshots reviewed for readable basic guidance with Kernel detail collapsed. Frozen source through cleanup. Receipt `d1367-second/receipt.json` SHA256 `ae2d456c7eeed8046da986938f64ae63658bc488c2f1d738e76302841844cf55`, PASS; visual review completed afterward.

General adjacent surfaces, all Draft axes, full-suite, CI, assistive technology and umbrella completion are not claimed. The earlier API inventory drift remains; no new Model export is introduced here. Continue D1368 remaining #22 criteria and priority #44 items, preserving existing HOLDs.
