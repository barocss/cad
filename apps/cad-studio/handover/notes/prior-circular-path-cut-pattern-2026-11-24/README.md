# D1911 — Repeat an original circular through-Subtract on a linked straight Path

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `96990ec6817c0ac4b8100a90888ecba70c69402f`.

Repeat an original circular through-Subtract across one later original rectangular through-Subtract on the same upright rectangular stock. Accept an open, level path of straight spans. The existing path planner owns the authored data once and supplies the placement offsets and the straight-span qualification. The circular certificate checks the actual placements. Each copy retains the source orientation and its ordinal face identity. Preserve the existing rectangular-source curved paths and the no-source behavior.

- **FAIL, previous Studio.** The linked path and earlier circle appear in the command, but the valid pattern is refused without changing the document or history.
- **PASS, desktop Studio.** Six actual final scenes and two baseline states. Author two spans (6, 5) → (6, 21) → (30, 21) mm with Sketch and Make curves. The one linked path has the expected five exact poles, all unit weights and a double interior knot. Count 3 at 16 mm gives circular centers (10, 10), (10, 26) and (26, 26) mm, with the final copy past the bend. Contact at 4 mm and insufficient path length at 21 mm both refuse and preserve the accepted document. A History edit to 14 mm updates the copies to (10, 24) and (22, 26) mm. Undo, Redo and fresh native Open preserve the same linked path and source IDs.
- **PASS, independent native inspection.** Both caps retain the original rectangular aperture and three exact R2 apertures. The 60 × 40 × 10 mm part has one strict genus-4 shell. Its volume is 23,920 − 120π = 23,543.008881569225 mm³. Exact copy wall labels retain `@1` and `@2`. The centroid changes from (30.248447558242955, 20.026703153826908, 5) to (30.269798050319096, 20.037378399864977, 5) mm.
- **PASS, affected checks.** 117 native, 46 Model and four Studio tests. Kernel and Model type checks, focused lint, Studio production build, browser driver syntax and Git diff check passed. Eight actual affected rectangular-source quarter-arc control states passed.
- **NOT_RUN.** Whole local suites, curved paths for the original circular cut, general dependent-reference remapping, mobile and a new PDF qualification. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured. [#25](https://github.com/barocss/cad/issues/25) stays open.

```sh
node --test --test-concurrency=1 packages/barocss-cad/test/*cut-pattern*.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern curve-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp
pnpm --dir apps/cad-studio build
D1911_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/base" --baseline
D1911_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/studio"
D1872_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/quarter-control" --quarter
git diff --check
```
