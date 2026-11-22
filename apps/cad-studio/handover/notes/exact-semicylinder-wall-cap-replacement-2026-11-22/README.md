# D1661 — Offset one wall and replace the original upper cap with an inclined plane

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `95b74c5d0112eccead86bd24e06f79cda9b8487c`.

An upright two-quarter Exact cylinder Thicken accepts one signed radial Offset and one inclined Replace face of the original upper cap in either History order. The kernel certifies the first edit by replay and produces the final solid in radial-then-inclined order. The inclined rim follows the edited radius. The operation preserves the bottom and the qualifying unselected analytic supports, 3D boundaries and topology IDs. The cap stays linked to a checked face on a separate solid. Replacement clearance uses the edited radius.

- **FAIL, base.** Each single operation built successfully. Native evaluation refused both sequences, and Model refused to start replacement after a radial edit. The paired cases pass after the change.
- **PASS, affected checks.** 162 Kernel, 61 Model and 17 Studio tests, Kernel and Model type checks, Studio type check and production build, scoped ESLint, driver syntax and Git diff check. Kernel covers both physical skins, both V orientations, signed and non-dyadic distances, both orders, stale recipes and contact that occurs only after the combined radius grows. One reverse-V numerical centroid comparison converged from 1.48e−8 to 1.06e−9 mm at 16 quadrature segments. The test uses that density with the original tolerances.
- **PASS, actual desktop Studio WebGPU and local Agent.** Studio applies +2 mm to the original outer wall and links the upper cap to the inclined donor in both orders. Each document matches its revision-pinned local MCP result. Both have R12/R8 mm, a 7–13 mm upper rim, volume 1,228.2948465545637 mm³ and digest `0451d60ff06f4d96f142049cb600017117c978ab9306dbfda9a1b150cf3dd042`. Studio and native volume and centroid agree with independent half-annulus moments.
- **PASS, refusal, History and native Open.** A +16 mm radial edit or a −7 mm change to donor Z would touch the bottom. Both inputs were refused, keeping the accepted document and Undo entry in both orders. A −2 mm donor move retains both authored features and makes the upper rim 5–11 mm. Undo, Redo, Save and fresh Open reproduce the expected geometry and saved reference. The reopened volume is 976.967434253626 mm³ and its digest is `042a8a3dcb343913ccfcfe5599a691383adad526403abb19dd47e2cc55667316`. Studio and local MCP pass the current 4 mm radial wall check. The proof read preserves saved bytes. Two runs record 14 captures, 1,175 frozen files each and zero source changes and zero page or console errors. The maximum sampled pcurve gap is below 8.15e−15 mm.
- **NOT_RUN.** Full local suites, the inner-skin pair in desktop Studio, WebGL2, mobile, exchange and paid live models. The supported profile includes one signed wall edit and one linked inclined upper cap. Third edits remain outside the profile. Both issues stay open.

## MCP revision proof

The first parity runs used `query.summary`, which has no part revision. Those runs established native and document equality. The requests from those runs carried no revision pin. The shared test helper now requires a 16-digit revision from `query.rebuild`. The follow-up reran both D1661 orders and six earlier desktop controls from D1654, D1656–D1658 and D1660. All eight runs passed. The emitted MCP frames verify 13 authoring requests, each carrying exactly the revision from the immediately preceding rebuild read. The corrected D1661 runs reproduce the same accepted and reopened native digests. This follow-up supplies the revision evidence for the related earlier Studio and Agent parity claims.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face offset-exact-cylinder-wall offset-exact-cylinder-cap offset-face-native offset-to-plane agent-offset-wall agent-axial-wall
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
D1661_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-cap-replacement-browser.mjs "$OUT/wall-first"
D1661_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-cap-replacement-browser.mjs "$OUT/replace-first" --replace-first
git diff --check
```
