# D1308 — Keep both bore-mouth fillets editable after a radial cut

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

The clipped Sweep now has a desktop regression for two separate Fillet features. The first rounds the original start rim. The second rounds the 45° cut rim of the first feature's result. Each feature stores both native half-rim names. The test preserves the one-mouth D1307 flow as a control.

- **PASS — desktop Studio WebGPU.** Picked the two mouths from their cap-facing views. Applied 0.20 mm at the start and 0.25 mm at the cut. A deliberate 10 mm second fillet kept the first result and left Apply disabled. In History, editing the first radius to 0.25 mm left the downstream feature record and both edge references intact. Undo, Redo, native Save and fresh Open passed. Local MCP read back both stored fillets and the edited volume of 2140.608 mm³.
- **PASS — native geometry.** Each result is one strict genus-1 solid. The initial and edited volumes were 2140.640808128 and 2140.608137889 mm³. The independent sum of the two local rolling-ball removals agreed within 8.18e-8 mm³. The largest sampled cap-contact residual was 4.86e-8 mm and the strict edge-to-surface gap was below 3.89e-8 mm. Before the second operation the cut rim was identical to the unfilleted input. The second operation retains the first cap's outer edge names and trim curves at both radii. The edited native report, cap owners and sampled coordinates matched after reopen.
- **FAIL — fitted patch ordinal comparison.** The initial kernel probe matched the eight inner curves by fitted patch suffix. Completing the second Boolean after the edit permutes those suffixes. The curve coefficients and sampled coordinates match exactly when paired by geometry. Both original input half-rim references replay. The evidence does not establish stable per-patch ordinals for downstream selections.
- **PASS — regression and lint.** The D1307 one-mouth desktop control, focused lint and whitespace passed.
- **NOT_RUN.** Local production rebuild for this test-only change, single-feature two-mouth fillets, opposite operation order, other angles and profiles, WebGL2, mobile and full local suites. Wider [Sweep acceptance](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. Both serialized runs matched 908 frozen sources and recorded zero page errors, console errors or observed file changes.

| Desktop run | Receipt SHA-256 |
| --- | --- |
| Both mouths | `e012cc57efd8ba10e1d3d2cadaf5dc16fe1a4d061d49eae2a2b52611da703d45` |
| Single-mouth control | `c08aa84460e09b4d287bcb954cddb62ddce019ec100fba7ed439c6823913250b` |

Native Save SHA-256 `438ae534e4ee187fc7dbeeec385a1222124618873ebd2fb7de33c21035f0ab3d`.

```sh
D1308_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-radial-mouth-fillet-browser.mjs <external-evidence> --both
D1307_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-radial-mouth-fillet-browser.mjs <external-control>
pnpm exec eslint apps/cad-studio/test/arc-bore-radial-mouth-fillet-browser.mjs
git diff --check
```
