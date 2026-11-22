# D1653 — Replace the Exact semicylinder upper cap with an inclined plane

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `b58cd1a89e4b54d14a6553dd68af4cd7ab15d883`.

Replace face now accepts the original physical upper cap of an upright, two-quarter Exact cylinder Thicken. It links to an earlier inclined native face. The kernel lifts the original rational rim onto that plane. It updates the side trims on the original two cylinders and two radial planes. The lower cap remains fixed. The half-annulus height range detects contact with the opposite cap before the operation. The existing linear tolerance and strict B-rep check apply.

- **FAIL, on base.** The Agent rejected the original upper cap as an unsupported Replace face source. The same command succeeds after the change.
- **PASS, affected checks.** 108 Kernel, 17 Model and 17 Studio tests, type checks, Studio production build, scoped ESLint, script syntax and Git diff check. After tightening the roundoff check on steep planes, all 12 tests in the Kernel cap file and the 17 Model tests passed on the final source. The Kernel cases cover two tilt directions, a positive Y gradient, reversed V, original face ownership and refusal for collapse, parallel or perpendicular planes and excessive extents.
- **PASS, actual desktop Studio WebGPU and local Agent.** Selected the original cap and refused a perpendicular target. Bound an inclined face and got the same saved document as the revision-pinned local MCP command. History refused a −11.5 mm reference move and kept the accepted document and Undo entry. The accepted −3 mm move updated the cap. Undo, Redo, Save, fresh Open and the restored reference in History passed. Six captures recorded 1,169 unchanged frozen files and zero page or console errors. The existing parallel-plane Offset control also passed.
- **PASS, exact shape and independent measurements.** The edited plane is `z = H + (x − 20) / 4`, with H=14 mm and then H=11 mm. The lower cap and two radial wall supports are fixed. Both cylinder axes and R8/R10 supports and all topology IDs are retained. Two exact trim curves sampled at 17 stations each lie on the intended cylinders and tilted plane. At both heights, the maximum edge-to-surface gap was 3.56e−15 mm and the maximum pcurve gap was 5.33e−15 mm. The native volumes 791.6813487038033 and 622.0353454320204 mm³ and all centroid coordinates match the independent half-annulus and Studio within 1e−7 in their respective units. Fresh Open reproduces digest `d7039d66c24fa89acc922f5398e58f417e9c188d14266977e18ab0e1fb22e33a`.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live models. This decision qualifies the original upper cap. Both issues stay open for broader face edits.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`) and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face offset-exact-cylinder-cap offset-to-plane offset-plane-retention agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
D1653_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-cap-replacement-browser.mjs "$OUT/replacement"
D1649_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs "$OUT/offset-control"
git diff --check
```
