# D1654 — Verify the radial wall after inclined cap replacement

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `6084da8d0f7ed12ad8ea48822ade5cba6d9c54cd`.

The radial-wall check now admits the original Exact semicylinder upper-cap replacement. It resolves the saved plane at the edit's position in the current native prefix, confirms the compiled plane and replays the replacement. The two skin names qualify only if the complete result matches the current B-rep. This uses the same proof entry point as signed and linked Offset.

- **FAIL, on base.** The Model returned `unknown` for the 2 mm wall after a valid inclined replacement. The new regression passes with the native wall value. An initial type check also caught a widened Boolean in the suppressed-reference fixture. The corrected fixture keeps the literal document flag.
- **PASS, focused checks.** 17 Model and 17 Studio tests, Model and Studio type checks, Studio production build, scoped ESLint, script syntax and Git diff check. The proof refuses a prior B-rep with the same names, a stale compiled plane and a suppressed reference. It can still read a reference consumed by a later feature. A 3 mm requirement fails with the actual 2 mm value.
- **PASS, actual desktop Studio WebGPU.** Requirements passed on the applied inclined cap, after the −3 mm reference move and after Save and fresh Open. The capture immediately after the move shows the earlier result marked stale. The original replacement recipe and current native shape survived Undo, Redo and Open. Seven captures, 1,171 unchanged frozen files and zero page errors, console errors or file changes. The existing parallel-plane Offset flow also passed.
- **PASS, actual local Agent.** Both current results identify `n0.normal` and `n0.reverse` and measure 2 mm. The evidence revision after the move and Open is `e80e7333cc996095665bbaebd12f75d4690687af31a60fad1add26a2412d7f7b`. Requesting the previous revision `e535601f18f84ccde8329defe175b862f2c3972d201f927818b5b1b66a4bfaaa` returned `OUTPUT_STALE` with no artifact. The current evidence read leaves the saved file byte-identical.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live models. Both issues stay open for broader face edits.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`) and output directories outside Git.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face agent-offset-wall agent-axial-wall offset-exact-cylinder-cap offset-to-plane offset-plane-retention
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/{chat/thickenWall,engine/offsetPlane,engine/exactThickenCapEdit}.ts packages/barocss-cad-model/test/{replace-face,agent-offset-wall}.test.ts apps/cad-studio/test/{exact-semicylinder-cap-replacement-browser,exact-cylinder-cap-plane-browser,exact-cap-offset-wall-approval-browser}.mjs
D1654_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-cap-replacement-browser.mjs "$OUT/replacement-evidence"
D1649_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs "$OUT/offset-control"
git diff --check
```
