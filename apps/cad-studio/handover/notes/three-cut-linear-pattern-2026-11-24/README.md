# D1850 — Repeat the first rectangular cut across two newer cuts

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `57273900968178a8f4b8673d67cfcdc05d73877a`.

Linear cut pattern accepts the first of three original rectangular through-Subtracts on the same rectangular stock. Picks in the Browser or History leave the third Difference as the current target. The original tool defines each signed X or Y copy. The Kernel certifies one, two and three full-height cavity snapshots in order, with the same stock boundary. It checks every copy against both later tools, the original cut, the stock boundary and every other copy. A held, suppressed, moved, unrelated or more distant source cannot qualify.

The saved feature uses the existing source and target fields. Model and local Agent commands use the same chain admission. The other pattern kinds still allow only the direct earlier source.

- **PASS, Kernel and Model.** The 60 × 40 × 10 mm stock has four exact openings after application. The strict result is one genus-four shell with 22 faces, 60 edges and 40 vertices. Independent arithmetic gives 23,640 mm³ and centroid `(712280/23640, 474600/23640, 5)` with +16 mm pitch. Retained walls keep their native identities. Separate source-tool edits, signed pitches, exact replay and both downstream collision controls pass. The local command binds the original source to the current revision and keeps the document when it rejects a collision.
- **PASS, desktop Studio.** Browser and History produce identical native features. Count 3 at X16 intersects the third cut. Count 2 at Y18 intersects the second cut. Both refuse with the accepted document and Undo label intact. Count 2 at X16 adds only the hole from x=24 to x=28 mm. Editing the pitch to X−6, Undo, Redo, native Save and fresh Open retain the first source, the third target and all four apertures. The direct-source Linear control and farther Path refusal pass. The three runs capture 22 states with no source changes, page errors or console errors.
- **PASS, affected checks.** 57 Kernel, 49 Model and 9 Studio tests. Kernel library, Kernel/Model/Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check pass.
- **FAIL.** None in the affected product checks.
- **NOT_RUN.** Whole local suites, previous reader execution, mobile, other renderers and a live provider. This does not add arbitrary ancestry support. #25 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-linear-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1850_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/studio" --linear-three
D1830_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/direct-linear" --linear
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/farther-path-refusal"
git diff --check
```
