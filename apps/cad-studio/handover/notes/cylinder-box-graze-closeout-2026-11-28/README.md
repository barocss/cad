# D2121 — Retire the reproduced cylinder-box graze refusal

P5 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `c6eae130a759d76b29030b9520448ba818e162dc`.

The original D25/D187 TODO expected the 10 nm notch to be elided at the stitch scale. The current kernel completes the Subtract and returns the original four cylinder faces. The adjacent 0.1 µm fixture retains two cut faces from the box. D273 (`b17725e3637cd2824c9e418132e8434acce01698`) records the cylinder backtrack cleanup for the adjacent 1 nm case. The exact 10 nm branch was not traced. Remove the obsolete refusal from the robustness ledger and keep the original oracle, its acceptance bounds, and the helical-gear TODO.

- **PASS, actual desktop.** Select the original cylinder and rotated box, then run Subtract for each unchanged input. Undo restores two inputs and Redo restores the result. Save and fresh Open preserve the strict native digests `b46b95518f9bfc385125f94c301e8602be6a999cb6e53c2c1355f9fc8d687437` and `b83e7484fd7a66e56dd8ebeeafd0f0050eb182d825a8046d49eab44ff06da6b0`, respectively. Both native results contain one solid and one shell. Native volumes are 253.1207040596867 and 253.1207040593838 mm³, within 4.6 × 10⁻¹³ mm³ of their independent references. The driver also asserts native centroids, Worker volumes, and the two exact retained tool face names. There are no source changes, browser errors, or console errors during the run.
- **PASS, small checks.** All 50 applicable robustness stages pass across nine cases. One empty intersection runs evaluate and expect only. The set includes eight unchanged X45 fixtures and one generated exact tangent control. The 1 nm, 10 nm, tangent and 0.001 mm gap examples have four faces. The 0.1 µm and 0.01 mm cases have six. The native boundary checks distinguish the elided 10 nm cut from the retained larger cuts because the 10 nm volume difference alone is about 9.6 × 10⁻¹³ mm³. The nine cases still pass after the ledger entry is removed. Browser driver syntax and diff check pass on Node 22.19.0.
- **FAIL, corrected probe.** The first generated tangent control omitted the oracle case wrapper. The corrected generator supplies the standard conformance wrapper and all six stages run.
- **NOT_RUN.** Full local suites, helical-gear intersection, broader contact cases, one-sided Union coverage, mobile, and live providers. The kernel and shared tolerances remain as in the base. [#7](https://github.com/barocss/cad/issues/7) stays open. First mechanical CAD remains at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
node --check apps/cad-studio/test/cylinder-box-graze-browser.mjs
CYLINDER_BOX_GRAZE_FROZEN=1 node apps/cad-studio/test/cylinder-box-graze-browser.mjs "$OUT/desktop"
# $OUT/corpus contains the eight unchanged X45 fixtures and the generated tangent case.
node packages/barocss-cad/scripts/rb/run.mjs "$OUT/corpus" --jobs 1 --timeout 35 --out "$OUT/rb-final.jsonl"
git diff --check
```
