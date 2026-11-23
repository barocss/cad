# D1807 — Extract Studio named inspection ownership

P4 code structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `24b393aa317d47944d68a3079907d48b2ef9501f`.

Move session ownership, visible bodies, current-document guards and selected body keys to a private Studio hook. Keep camera and body visibility in the existing single transaction. The display controls take selected body keys from the inspection state. App has 2,925 lines, down from 2,930.

- **PASS — actual paired desktop WebGPU.** Both base and candidate pass Capture, Apply, Fit, Restore, rapid Apply and takeover of active ViewCube motion. A section blocks the inspection actions. A document visibility edit, Undo, same-name Open and fresh Open preserve the declared session boundaries. The second flow passes explicit Update without navigation, confirms the updated scope, restores the first camera and verifies fresh Open.
- **PASS — paired evidence.** Exact document, body, selection and history data match at 17 paired checkpoints. All 25 real pointer probe outcomes and the captured, updated and restored camera values match. Each browser Save is 895 bytes and matches SHA-256 `cb2f9b10cfe021e726c5e7ff00a991f61d0ca5293be77ee4fb2e04e6833187ea`. Fresh Open clears the session views and exposes both original bodies. All four passing runs report unchanged source capsules and zero page and console errors.
- **PASS — affected checks.** Nine named inspection tests, scoped ESLint, Studio type check, production build and Git diff check pass.
- **FAIL — recovered baseline checks.** The first capture/apply baseline used a cached click position after the control moved. The driver now reads each control's current position and verifies the real hit before clicking. The first Update baseline stalled before a result and was stopped by terminating the owned Chrome process. A fresh Update run with a 15-second interaction timeout and diagnostics passed. The final comparisons use passing baselines.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, persistent named inspection and external clients. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #44 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright and external output directories. For these measurements the local Playwright wrapper served an empty stylesheet for the remote font and blocked other non-loopback requests. Run each browser command once per frozen source. Compare the saved bytes and receipt camera, document, body, selection, history and pointer outcomes.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test named-inspection
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/useStudioInspectionViews.ts,ui/ViewDisplayControls.tsx} apps/cad-studio/test/named-inspection-browser.mjs
pnpm --dir apps/cad-studio build
NAMED_INSPECTION_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/named-inspection-browser.mjs "$OUT/views"
NAMED_INSPECTION_UPDATE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/named-inspection-update-browser.mjs "$OUT/update"
git diff --check
```
