# D1889 — Cut a measured gap in an ordinary straight sketch polyline

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md), [#226](https://github.com/barocss/cad/issues/226). Base `a0577cb3f61c0db0c121c51460639b1911d997a4`.

Cut polyline gap now accepts one unconstrained ordinary straight open polyline in a new independent sketch. The existing planner cuts one span. Both fragments retain material role and vertex order. Original IDs are carried into the fragments after the usual fresh-draft ID allocation. The planner refuses a corner crossing, a cut endpoint that hits an adjacent or intersecting span, and constrained or curved ordinary polylines.

- **FAIL, original Studio.** An actual four-point ordinary Line draft had no Cut polyline gap action. The expected unavailable-state reproduction passed.
- **PASS, desktop and native curves.** Eight ordinary-polyline states, four ordinary-line controls and seven construction-polyline controls pass. The original path is (16,20) → (20,20) → (44,38) → (44,42) mm. At a 4 mm gap, the cut ends are (30.399997,27.799998) and (33.599997,30.199998) mm. The removed length is exactly 4 mm within 1e-5 mm. Corner rejection and Cancel retain the original draft. A single Undo restores the whole path and Redo restores both ordinary fragments. Finish refuses the two open paths. Make curves produces two local degree-two native curves with two straight spans and unit weights each. Their pole sums give approximately 17 mm per path and preserve the unchanged end spans. Project Save and fresh Open reproduce the same document and native curve data. The display length uses sampled curve length and is not the geometric oracle.
- **PASS, affected checks.** 26 scoped Studio tests, including ordinary and construction dispatch, corner and touching-boundary refusal, and existing line/arc/circle controls. Focused lint and Studio production build pass.
- **FAIL, earlier tests.** An old unit asserted that an ordinary straight polyline was outside the scope. The first desktop assertions assumed Undo was already enabled before cut and that Undo restored the Trim tool. The final checks verify the current draft history and the restored geometry. An initial 3e-6 mm UI pick tolerance rejected a rounded cut endpoint off by 3.6e-6 mm. The final browser proof uses the existing stored-path tolerance of 1e-5 mm. The 4 mm separation and native two-span geometry are independently checked.
- **NOT_RUN.** Whole local suites, curved ordinary polylines, reopened material profile editing, cross-span gaps, alternate plane profiles and mobile for this extension. The original #226 single-line, arc and circle closeout has its own remaining actual evidence. The first mechanical CAD baseline remains 8/10.

## Reproduce

Use Node 22.19.0 and existing desktop Chrome and Playwright. Run heavy jobs serially and freeze the checkout during Studio.

```sh
pnpm --dir apps/cad-studio test linePathGap arcPathGap circlePathGap path-gap-preview
pnpm --dir apps/cad-studio build
D1889_SOURCE_FROZEN=1 node apps/cad-studio/test/ordinary-path-gap-browser.mjs "$OUT/polyline" --polyline
D805_SOURCE_FROZEN=1 node apps/cad-studio/test/ordinary-path-gap-browser.mjs "$OUT/line"
D1602_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$OUT/construction" --polyline
```
