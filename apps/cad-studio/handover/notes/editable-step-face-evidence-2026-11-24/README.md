# D1848 — Explain original STEP faces in the new native copy

P5 [row 31](../../roadmap-rows/31.md) and P2 [row 13](../../roadmap-rows/13.md), [#320](https://github.com/barocss/cad/issues/320). Base `36e1762030992ca605f7232db96cddf7dfbfbd3b`.

After certification, the review associates each actual original face with the corresponding region and the final faces of the new native solid. The CLI reports both body keys and both sets of face IDs. Studio shows the feature and its complete coverage in the existing editable copy dock. The proof uses geometric roles. Source record order, entity labels and inferred persistent names do not decide membership.

The plate has seven regions across eight faces. Its four walls come from Extrude. The two caps report Extrude and the Hole trim, with final cap IDs. The two inward cylinder halves belong to Hole. The shaft has five regions across ten faces: the ends, both seats and the sharp shoulder. Both shaft radius orders retain their actual shoulder orientation. The association describes the exact initial copy. Subsequent edits use ordinary native history.

| Original acceptance | Evidence |
| --- | --- |
| Fixed source and complete geometry | [D1841](../editable-step-plate-copy-2026-11-24/README.md) and [D1843](../editable-step-shaft-copy-2026-11-24/README.md) qualify strict complete geometry and independent bounds, volume, centroid, bore and shaft values. D1848 covers every actual source and final candidate face exactly once. |
| New editable history and ambiguity | The bounded plate and shaft builds reuse native features. An independently authored Circle, Extrude and Difference sequence has the same exact anonymous plate STEP geometry key as a Hole history. The review declares original history unknown. It does not infer material, manufacturing intent, tolerances or an original feature sequence. |
| Explicit review, source invalidation and native edits | [D1842](../review-named-step-plate-copy-2026-11-24/README.md) verifies Cancel, named plate values and source invalidation. [D1845](../editable-step-cli-review-2026-11-24/README.md) pins actual CLI review to both exact files and refuses stale review or overwrite. D1848 opens the actual CLI-matched files in fresh Studio contexts. Both prior numeric paths and the named plate flow pass again. |
| Equivalent units and failures | [D1846](../centimetre-step-plate-copy-2026-11-24/README.md) and [D1847](../inch-step-plate-copy-2026-11-24/README.md) qualify centimetre and inch equivalence and refusal of wrong unit or geometry. D1848 refuses an actual two-solid STEP before offering a copy. Wider or damaged shapes do not produce partial candidates. |

- **PASS, actual Studio and CLI.** Inch plate and anonymous shaft reviews report eight and ten source faces. The supplied native and reopened candidate IDs match all associations, including the real Scale output key on the inch original. The actual CLI candidate bytes match both Studio downloads, and the input files remain unchanged. The separate shaft and plate edit, Undo/Redo, Save and fresh Open regressions pass.
- **PASS, affected checks.** 23 Model tests and 23 Studio tests, Model types, Studio production build, scoped ESLint and Git diff check. Three desktop Chrome WebGPU runs give 31 states. Each freezes 1,208 product source files with zero page, console and source-change errors.
- **FAIL, initial browser harness.** The shaft locator found the feature label and the five new association labels. The final selector reads the single new feature row and verifies the individual association rows separately.
- **NOT_RUN.** External reader, arbitrary representation profiles, multi-solid reconstruction, other backends, mobile and live providers. These are bounded research acceptance results. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy shaft-display step-units
pnpm --dir apps/cad-studio test editable-step-cli editable-step-preparation step-export
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$IN_STEP" --named
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$SHAFT_STEP"
D1848_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-evidence-browser.mjs "$OUT/studio" "$FIXTURES"
EDITABLE_STEP_COPY_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-copy-browser.mjs "$OUT/shaft" --shaft
EDITABLE_STEP_COPY_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-copy-browser.mjs "$OUT/plate"
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
