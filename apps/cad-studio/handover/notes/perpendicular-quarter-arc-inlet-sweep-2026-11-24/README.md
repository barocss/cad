# D1914 — Add a straight tangent inlet to a perpendicular Exact Sweep

P5 [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#10](https://github.com/barocss/cad/issues/10). Base `1d5d2c907c4a2b93b52a980710be03dc37cf5ae8`.

Admit one forward straight quadratic inlet before two perpendicular tangent quarter arcs for a circular disk or concentric annulus. The first bend retains its existing native section frame. The straight cylinder and first bend share their circular rim and the correct outward cap orientation. The second bend stays clear of the inlet. Keep the earlier no-tail and outlet contracts.

- **FAIL, previous Studio.** Two actual Join operations produce the intended seven-pole input. Exact preview reports that it is outside the line–arc–line range and refuses without changing the document.
- **PASS, native geometry.** The 10 mm inlet lies on X from −10 to 0. R12 and R18 quarter arcs meet at (12, 12, 0) and end at (12, 30, 18) mm. Outer R2 and inner R1 give exact volume 45π² + 30π = 538.3799776567149 mm³. The measured volume is 538.3799776567151 mm³ and centroid is (7.60701009822399, 13.050348640578028, 3.215607524492787) mm. One strict genus-1 shell has 14 faces, 16 loops, 56 coedges, 28 edges and 16 vertices. The eight seam edges have reciprocal coedges and both pcurves. Maximum measured edge-to-surface gap is 1.832e−15 mm and tangent angle is below 2.39e−14 degrees. The focused tests also cover a disk, a phased bore, shorter inlet replay and supported refusal boundaries.
- **PASS, desktop Studio.** Nine actual new states and nine actual outlet control states. The wall contact at bore R2 refuses and retains the accepted model. At bore R1.5 the native volume is 314.054986966417 mm³ and the six exterior surfaces keep their exact digests. Undo/Redo and fresh native Open retain the edited result. A local Agent dry run leaves the working bytes unchanged, the proposal awaits explicit approval, and acceptance gives the same native result digest as the regular tool.
- **PASS, affected checks.** 314 native, 35 Model and 10 Studio tests. Kernel and Model type checks, focused lint, Studio production build, driver syntax and Git diff check passed. The old generic Sweep checking for axis contact is restored by matching its actual PARAMETER message. The first current suite passed 313 of 314. Its paired-end refusal assertion initially expected CAPABILITY. It now pins the unchanged GEOMETRY refusal and verifies that the document remains intact.
- **NOT_RUN.** Whole local suites, paired ends on the perpendicular route, non-forward or general curves outside the documented profiles, Offset/Replace on this inlet, mobile and paid providers. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured. [#10](https://github.com/barocss/cad/issues/10) stays open.

```sh
node --test --test-concurrency=1 packages/barocss-cad/test/exact-*-sweep.test.mjs packages/barocss-cad/test/part-model.test.mjs
pnpm --dir packages/barocss-cad-model test sweep-path-history sweep-agent-remap sweep-history-edit arc-sweep-display arc-sweep-mixed-display toolset tool-contract
pnpm --dir apps/cad-studio test sweep-path-feedback sweep-path-geometry tool-contract-mcp
pnpm --dir apps/cad-studio build
D1914_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-inlet-sweep-browser.mjs "$OUT/base" --expect-refused
D1914_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-inlet-sweep-browser.mjs "$OUT/studio"
D1906_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-outlet-sweep-browser.mjs "$OUT/outlet-control"
git diff --check
```
