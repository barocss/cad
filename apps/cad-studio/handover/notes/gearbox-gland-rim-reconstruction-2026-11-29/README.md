# D2277 — Restore the original no-pcurve gland outline

P2 [row 11](../../roadmap-rows/11.md) and [row 30](../../roadmap-rows/30.md) · [#780](https://github.com/barocss/cad/issues/780) · Base `f3da4f3ce`.

- **FAIL, base.** The complete unchanged 11-feature gearbox evaluates all eight strict native outputs on main. Its original 12-face gland `n9` has no pcurves on either lower outer rim. At the reported camera and quality 12, the front rim stops 0.8337156316 mm short of the generator and an extra rear interval remains visible. The original SVG gaps are 9.7663831133 and 3.4301443130 px.
- **Decision.** Keep the exact chart path first. The bounded reconstruction requires a complete four-boundary cylinder chart, reciprocal owning coedges without pcurves, original directed vertex incidence and a unique boundary assignment. Match the full clamped unit-domain knot basis and admit only binary64-scale differences in finite, positive weights and world poles. Bound the curve displacement by the maximum pole residual plus the hull diameter times the weight residual over the minimum weight. Carry that error into the front margin and the existing native rear-hit proof. Keep scene-cover tests, the epsilon and all work limits.
- **PASS, geometry and visibility.** The original stored gland B-rep is identical before and after. Front raw endpoint distance falls to 1.61e-11 mm from the existing generator. The rear visible start moves from −2.6179957203 to −2.5618916063 rad. All fixed robust rear witnesses remain hidden. A real foreground prism still hides the front witness. Mismatched poles, weights, pcurves, owner face and a third generator use receive no reconstruction certificate. The archived original bearing checks are rerun.
- **PASS, independent output.** Both actual SVG sizes join the original generator within 2e-10 px. A separate XML and PNG sample check confirms the front ink and the absent rear interval. The exact camera remains the issue's original camera.
- **PASS, actual desktop.** Headed Chrome opens the complete authored gearbox. Its native gland exactly matches the source B-rep. The standard isometric Drawing SVG places both original primitives at the joint within 0.001 mm, with the 0.000323 mm native arc endpoint distance inside the existing grazing allowance. Project Save, Close and fresh Open preserve eight strict outputs and byte-identical SVG. No errors or downloads in the final run.
- **FAIL, during development.** The first coefficient candidate closed the front gap while the rear remained visible. A traced weight difference between `0.7071067811865477` and `0.7071067811865476` identified the missing bound. One regression assertion compared a reconstructed cylinder radius to exactly 35 mm; the test now checks its existing roundoff allowance. Two earlier desktop drivers assumed the Drawing's private edge prefix and exact custom-camera endpoint tolerance. The final actual Studio and independent custom-camera checks use their respective original coordinate limits.
- **PASS, review and mutation.** Independent reviews confirmed the basis bound, the positive denominator and original occlusion path. The mutation removing the two-use test admits a third generator coedge. The final code refuses the same altered graph.
- **PASS, affected and full checks.** Node 22.19.0 passed 31 focused HLR checks and 42 Model Agent/Drawings checks. Full kernel passed 3,350 with zero failures and 2 existing skips. Kernel, Model and Studio type checks, changed-file lint and production build passed.
- **NOT_RUN.** General approximate surface matching, other Projection worktrees and their mixed-scene admission, mobile and PDF. #781 remains separate.

```sh
node "$OUT/repro.mjs" "$PWD" main-baseline
bash "$OUT/visual.sh"
bash "$OUT/desktop.sh" desktop-final-grazing
bash "$OUT/validate.sh"
node "$OUT/ownership-mutation.mjs" "$PWD"
git diff --check
```
