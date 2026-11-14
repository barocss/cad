# D1305 — Fillet the original bore mouth after radial Intersect

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

The existing Fillet from D1302 works on the original start rim of the D1301 exact circular Sweep after the 45° radial Intersect. The accepted file keeps the exact Sweep, Intersect and Fillet as separate editable features. This check adds a repeatable product regression through the existing command.

- **PASS — desktop Studio WebGPU.** Clicked the original mouth on the canvas and verified both native half-rim names in the Fillet HUD. Radius 10 mm was refused with Apply disabled and the original model preserved. Applied 0.20 mm and changed it to 0.25 mm in History. Undo, Redo, native Save and fresh Open passed. Local MCP returned the saved feature and volume of 2140.697 mm³.
- **PASS — native cap trims and volume.** Both results are strict genus-1 solids. The original cap keeps four outer edges and gains ten or eight cubic inner contacts, depending on radius. Every contact is paired with a blend face. The cut cap keeps five outer edges and two quadratic bore edges. All seven cut-cap names and 17 XYZ samples per edge match the unfilleted cut exactly. Maximum cap residual was 4.86e-8 mm at the original cap and 1.24e-12 mm at the cut cap. The largest strict edge-to-surface gap was 3.89e-8 mm. Native volumes of 2140.729855268 and 2140.697185028 mm³ match Pappus volume minus the independent local rolling-ball removal to within 4.75e-8 mm³.
- **PASS — scoped lint and whitespace.** The Studio driver covers the unchanged product through its native file, canvas, History and local MCP entry points.
- **NOT_RUN.** Production rebuild for this test-only change, Fillet on the new cut rim, a wider bend or different bore, WebGL2, mobile, hosted inference and full local suites. The full Sweep criteria in [#10](https://github.com/barocss/cad/issues/10) remain open.

## Commands and evidence

Node 22.19.0. The serialized Studio run matched 908 frozen sources and recorded zero page errors, console errors or observed file changes.

Receipt SHA-256 `2fbd2516e9cf83c759924a471390bab140ce0bcf8bcbfdb9749c8f6646120e93`. Native Save SHA-256 `0c6d098c3eb0ce1c4ba6f9f1b87d357a35250d2cc120743d23d8f85abac2faba`.

```sh
D1305_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-cut-fillet-browser.mjs <external-evidence>
pnpm exec eslint apps/cad-studio/test/arc-bore-cut-fillet-browser.mjs
git diff --check
```
