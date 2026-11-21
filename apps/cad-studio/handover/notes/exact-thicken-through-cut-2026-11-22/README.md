# D1631 — Through Cut on an exact planar Thicken solid

P5, row 08, [#175](https://github.com/barocss/cad/issues/175) and [#11](https://github.com/barocss/cad/issues/11). Base `69557172ab92518d2319e24810ee8e58de8e2491`.

Use the existing Studio **Subtract** command with the Exact planar Thicken plate selected first and the vertical rectangular box second. The current native analytic Boolean handles this pair. The saved Cut retains the Thicken and Extrude operands. No production change was needed for this workflow.

- **PASS, desktop Studio WebGPU.** Open the two operands, select them in order and use Combine → Subtract. In feature history edit the original Thicken thickness from 4 to 6 mm. Save and fresh Open reproduce the native body and Cut operand references. Studio froze 1,161 files with zero source changes, page errors and console errors.
- **PASS, native boundaries.** The result is one closed solid of genus 1 with 10 faces and 16 vertices. Its six original Thicken face names and four original cutter side names persist across the edit. Each cap has one four-vertex inner loop. Its vertices match the independent intersections of the cutter's four vertical edges with the two offset cap planes within 1e−8 mm.
- **PASS, independent volume.** The 1,050 mm² plate has unit normal (−0.8, 0, 0.6). The world-XY cutter area is 42 mm² and its crossing distance is thickness ÷ 0.6. Remaining volume is (1,050 − 42 ÷ 0.6) × thickness. Both Studio and native reads match 3,920 and 5,880 mm³ within 1e−8 mm³. The reopened native B-rep digest is `29ddcde43da108c6028d85fd66f06660fdab2a527a875344ac9560d5d6943be8`.
- **PASS, affected checks.** Independent Kernel API probe at both thicknesses, browser syntax, scoped ESLint and Git diff. An initial browser preparation error used the wrong package name in the inspector. The corrected driver completed the browser flow.
- **FAIL.** None in the final checks.
- **NOT_RUN.** Additional Boolean operand families, curved Thicken, WebGL2, paid live model and full local suites. The linked issues remain open.

Use Node 22.19.0, installed Chrome and Playwright, the heavy gate and an output directory outside the worktree.

```sh
node --check apps/cad-studio/test/exact-thicken-through-cut-browser.mjs
pnpm exec eslint apps/cad-studio/test/exact-thicken-through-cut-browser.mjs
D1631_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-thicken-through-cut-browser.mjs "$OUT"
git diff --check
```
