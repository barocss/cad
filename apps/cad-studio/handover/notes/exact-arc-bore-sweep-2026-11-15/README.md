# D1300 — Carry a circular through-hole along an exact circular Sweep

2026-11-15 · FEATURE · P5, rows 07 and 30

Exact circular-arc Sweep now carries one strictly interior circular hole in the authored line-and-arc section. The same analytic clearance rule serves straight and circular-arc modes. Guarded hollow Revolve checks the entire outer outline and bore against the bend axis and shares the bore boundary with an inner loop on each cap. It preserves both inward toroidal faces and their authored bore tag. The outer area centroid stays at the path start, and editing the bore preserves the outer walls. This changes no file format or public signatures.

- **PASS — desktop Studio WebGPU and local MCP.** Studio refused a bore touching the wall with Apply disabled and the document preserved. It previewed and applied the valid Sweep, then edited the bore diameter from 2 to 3 mm through its named sketch parameter. Exact volume changed from 4281.572464307 to 4164.421540034 mm³. The analytic first and second area moments agreed with the native mass and centroid. The result kept one strict genus-1 shell, eight faces, ten loops, 18 edges, 12 vertices and 36 coedges. Both caps kept one inner loop. The outer wall poles and names stayed identical. Undo, Redo, native Save and fresh Open passed. The reopened Front view hit the start cap beside the hole at Y=-7 mm and reached the curved tunnel at Y=0.674 mm through the opening. Local MCP dry-run left the source bytes intact and reopened readback reported the same feature and edited volume.
- **PASS — regressions and build.** 24 focused Kernel tests and 32 Model tests passed, including native quadrature, bore rims, reversed sweep, disk seam preservation and typed clearance refusals. The updated no-hole circular and holed straight Studio controls passed. Kernel and Model type checks, the Kernel fast build and code shape, focused lint and Studio production build passed.
- **FAIL, corrected.** Model type check exposed a D1299 test using an ES2023 array method in the ES2022 types build. Copying and reversing the test input preserves the test and passed type check. Focused lint also caught an unused test binding, corrected before the rerun.
- **NOT_RUN.** Native Boolean and Fillet on the curved bore, a diameter callout for its toroidal wall, the six-face display refinement on this eight-face shell, WebGL2, mobile, hosted inference and full local suites. The full Sweep feature acceptance in [#10](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. All three Studio runs had zero page errors, console errors and observed source changes.

| Desktop run | Frozen files | Receipt SHA-256 |
| --- | ---: | --- |
| Curved bore | 909 | `142475f214893ee1199389acd48de434c9a95aa582c074b53dcd763faeb90c03` |
| Solid arc control | 908 | `3100094e748581d7722f882b014841b5d5818d22ede67f3d06ed955db52111f3` |
| Straight hole control | 909 | `0edd03caebe132b05d8b8a0dae78a4268aba3966d08ca17820939461952cdbc9` |

Native Save SHA-256 is `01ae351298dae66f993532dc973ae719881410dce2b463359f32a976c7a21bd6`.

```sh
pnpm --filter @barocss/cad type-check
pnpm --filter @barocss/cad-model type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-sweep,exact-straight-sweep,sweep-solid,frk-4-revolve,revolve-axis-admission}.test.mjs
D1300_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs <external-evidence>
D1298_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-profile-sweep-browser.mjs <external-arc-control>
D1297_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-straight-profile-sweep-browser.mjs <external-straight-control>
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test sweep-agent-remap tool-contract toolset proposals arc-sweep-display arc-sweep-mixed-display
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```
