# D2110 — Draft the complete wall of an original cylinder

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `d7ebe03f44bc73c427717cf0755fe85dd937b7e9`.

One Studio pick of the complete wall on an original upright circular extrusion supplies both native half-face names. The native Draft checks that original body and scales its two axial stations about the original centre. The signed Z-pull supports a neutral plane at either cap or within the height. The cone, cap planes and straight seams retain the original incidence, native entity names, knots, weights and parameter curves.

## Verification

- **PASS, baseline reproduction.** Desktop Chrome WebGPU picks the original cylindrical wall. Draft reports that it needs flat side faces and preserves the stock. An independent read of the baseline raw Kernel path finds that a single half or the base alias could pass at +10° while retaining two cylindrical walls and removing a planar wedge. The wrong result is about 5,585.281098602 mm³. The negative angle could fail as non-manifold. The baseline refuses both named halves as adjacent faces. The candidate explicitly refuses an incomplete wall or its ambiguous alias.
- **PASS, actual desktop candidate.** A radius-10 mm circle centred at (12, −7) extrudes from Z = 3 to 23 mm. At fixed neutral Z = 11 mm, +10° previews, cancels and applies. History refuses +44° because the end radius crosses the axis. A −10° edit, Undo, Redo, Save and fresh Open pass. The reopened model retains the exact feature, native incidence and B-rep digest. Baseline and final candidate freeze 696 and 1,271 files with zero edited sources, page errors or console errors.
- **PASS, independent native geometry.** The reference uses `R(z) = 10 − tan(θ)(z − 11)` and the standard frustum volume. At +10°, the two cap radii are 11.41061584566772 and 7.884076231498421 mm. The volume is 5,912.958606927207 mm³. At −10°, the cap radii are 8.58938415433228 and 12.11592376850158 mm with volume 6,799.274682484619 mm³. The largest measured volume discrepancy is 4 × 10⁻¹² mm³. Native tests cover twelve sign, pull and neutral-station states, exact neutral-cap records, all twelve original parameter curves, signed section support, centroid, watertight tessellation, reverse pick order, tagged sides and native Save/Open. Two legacy planar Draft hashes match.
- **PASS, affected checks.** All 120 Kernel, 36 Model and 88 Studio tests pass. Kernel emit, all three type checks, scoped ESLint, browser driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected checks.** The first Studio baseline checked an HTML disabled state on a rail button that remains clickable for its refusal. The final baseline checks the real refusal and the preserved document. An early native control used an interior neutral on unsupported moved stock and expected its distinct shared-edge refusal. The corrected control uses the original body end. The first Kernel type check needed explicit return branches for its typed refusals. The corrected source passes all type checks and the final desktop run.
- **NOT_RUN.** Old Studio archive recovery for unsupported raw half-wall recipes, other source axes, placed cylinders, nonzero cone Offset, full local suites, mobile and live providers. First mechanical CAD is 8/10 accepted. Whole CAD completion remains unmeasured. [#14](https://github.com/barocss/cad/issues/14) stays open for wider Draft admission.

```sh
# Node 22.19.0. Use the heavy gate for each desktop flow and the affected checks.
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/baseline-final" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/candidate-final"
node --test --test-concurrency=1 packages/barocss-cad/test/{draft-circular-wall,drafted-extrusion,drafted-cap-offset,bored-cap-offset,circular-wall-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command draft-angle offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
