# D2165 — Preserve sheet editing across all principal origin reflections

P1 [row 07](../../roadmap-rows/07.md), [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md) · [#198](https://github.com/barocss/cad/issues/198) · Base `4d20a79e3ec2c64c20bd39c2b129aa655a57bbfe`.

A reflected-only Mirror can now use XZ and XY through the origin as well as YZ. The exact affine transform already reverses B-rep orientation. The sheet report now follows that transform when the single solid retains its original named fixed skin and bend faces. The bend axis is transformed with the body. The flat developer measures bend direction from the transformed geometry. The Mirror HUD, existing History editor and local command contract use all three principal origin planes. Offset reflected-only Mirror still refuses. The existing combined Mirror, missing native `keep`, Scale and general Pattern retain their qualification boundaries.

## Verification

- **FAIL, base admission.** Actual desktop Studio refused XZ and XY at zero with the YZ-only message. Apply stayed disabled and the original document was retained.
- **PASS, native.** 34 tests across R12.1–R12.4 and R12.S0. A 30 mm wide asymmetric L-bracket with two 5.5 mm holes preserves its independent 2,967.768244760 mm³ volume and exterior area `4122 + 457π/8 mm²`. On the 30 × 67.392920 mm flat, XZ reflects hole positions across the width and XY across the length. The two holes remain clockwise, the first bend remains DOWN, and each axis and fixed skin follows its reflection. A double reflection restores the original vertices and hole positions. A named 20 mm Flange regenerates on every plane and consumes the expected exact bend-table rows during a 1.5 → 2.0 mm thickness edit. A missing row refuses.
- **PASS, desktop Studio WebGPU.** For XZ and XY, the HUD refuses offset 5 mm, previews the origin, cancels without a document edit and then applies. History changes the existing Mirror to the other plane and Undo/Redo restore both states. The actual viewport picks `n0.end|n0.leg1.a` for a subsequent 20 mm Flange. Undo/Redo, browser project Save and fresh Open retain the accepted geometry. Editing upstream thickness changes the two-bend flat from 30 × 84.785840 mm and 3,756.811373 mm³ to 30 × 83.476991 mm and 4,936.205720 mm³. The flat has two holes and the original DOWN plus new UP bend. Both changed-plane runs have zero errors and zero changes across 1,610 frozen files. The existing YZ, separate-copy and combined Mirror controls also pass.
- **Corrected first desktop driver.** The offset locator looked for a standalone string. Studio includes the typed error prefix in that line. The final driver checks the actual HUD error and disabled Apply.
- **PASS, affected tooling.** 27 focused Model and 72 Studio checks, Model and Studio types, scoped lint, production build and diff check.
- **FAIL, pre-existing drawing fixture.** A wider substring test selector also ran the held plain PDF byte golden and gave 79 pass / 1 fail. This is the known baseline mismatch recorded in [the prior DXF decision](../source-bound-note-dxf-2026-11-18/README.md). The scoped command below selects the affected Model files.
- **NOT_RUN.** General independent pattern occurrences, arbitrary or non-origin reflected-only planes, manufacturing, full local suites and mobile. #198 remains open for the broader copy and pattern acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/r12-{1,2,3,4,s0}.test.mjs
pnpm --dir packages/barocss-cad-model test sheet.test.ts sheet-acceptance sheet-transform-flange mirror-sheet-guidance mirror-fixed-plane mirror-history-edit tool-contract
pnpm --dir apps/cad-studio test sheet shared-sheet-rules
D2027_SOURCE_FROZEN=1 node apps/cad-studio/test/sheet-mirror-flange-browser.mjs "$OUT/final-xz" xz
D2027_SOURCE_FROZEN=1 node apps/cad-studio/test/sheet-mirror-flange-browser.mjs "$OUT/final-xy" xy
D2027_SOURCE_FROZEN=1 node apps/cad-studio/test/sheet-mirror-flange-browser.mjs "$OUT/final-yz" yz
D819_SOURCE_FROZEN=1 MIRROR_GUIDANCE_EXPECT=1 node apps/cad-studio/test/sheet-move-browser.mjs "$OUT/final-legacy" --mirror-twice
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
