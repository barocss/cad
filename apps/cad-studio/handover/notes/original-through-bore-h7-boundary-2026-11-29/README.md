# D2245 — Use the original through-bore diameter in its H7 callout

P2 [row 11](../../roadmap-rows/11.md) and [row 25](../../roadmap-rows/25.md) · [#35](https://github.com/barocss/cad/issues/35) · Base `9e6cc5303`.

A 40 × 30 × 10 mm plate has a normal through-bore at (18, 14). Two synthetic H7 tables overlap. The first has `10 < d ≤ 18` with +0.018/0 mm and `18 < d ≤ 30` with +0.028/0 mm. The second has `10 < d ≤ 30` with +0.041/0 mm. The first table owns both tested sizes.

- **FAIL, reproduced in desktop Studio.** At Ø18, the reconstructed diameter was 17.999999999999996 mm and the callout printed +0.017/0. At an authored Ø18.001, the callout printed Ø18.002, even though the fit selected the right row. The first repair bound the original circle, but the callout still recomputed the diameter from its ink radius.
- **Decision.** Qualify one unmodified through-bore in a single upright rectangular prism when the complete cavity retains its exact authored circular support. Bind the original rim to its authored nominal. The resolved diameter drives the drawing callout, its fit diagnostic and the fit list. Round the authored hole diameter once, after conversion from radius. Use the existing inward limit policy.
- **PASS, headed desktop Chrome.** The Top drawing and its fit list show Ø18 THRU H7 (+0.018/0) with row 1, and Ø18.001 THRU H7 (+0.028/0) with row 2. Editing the Hole through History, Undo/Redo, and browser Project Save, Close, reload and Open preserve the correct attribution and text. Both native bodies pass strict checks. Their volumes are 9,455.309950592284 and 9,455.027199399465 mm³ and agree with `10 × (40 × 30 − πr²)` within 1e-6 mm³. All 1,425 frozen sources match after the run. No console or application errors.
- **PASS, focused checks.** Kernel 20, Model 25 and Studio 17 tests. Kernel, Model and Studio TypeScript, affected ESLint and production Studio build pass.
- **PASS, full kernel.** 3,312 passed, zero failed, two existing skips.
- **FAIL, broad Drawing/Model.** 658 passed and six failed. A separate archive of the exact base reproduced all six test names. Three expectations for the now-exact Ø24 fixture were updated and passed, including a point-limit case in each unit. Independent comparison of 24 DXF files found identical drawing marks and geometry. The only DXF differences were the authored radius and diameter in group 42, from 4.000000000000001 and 8.000000000000002 to 4 and 8 mm in the 12 AC1015 files. The 12 AC1009 files were byte-identical.
- **NOT_RUN.** External PDF comparison, which remains on HOLD, and broader bore families. The first mechanical CAD baseline is 8/10.

```sh
pnpm --dir packages/barocss-cad test
TEST_CONCURRENCY=4 pnpm --dir packages/barocss-cad-model test drawing hole-types
pnpm --dir apps/cad-studio test drawing-dimension-group drawing-dimension-changes
bash "$OUT/desktop.sh" desktop-fixed-02
git diff --check
```
