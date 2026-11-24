# D1909 — Repeat an original circular through-Subtract under a Fill mask

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `a2292b6b7d849fec54d089992531b680b57d9a20`.

Use the same two original cuts as D1908 with the existing Fill pattern. First select grid reference points against the captured mask. Check the resulting offsets with the existing native circular cavity and clearance proof. The original stays in the result even when its reference lies outside the mask. Selected copies keep their full cutter profile and row-major cell identity. The mask is captured by value.

- **FAIL, previous Studio.** The Fill panel shows the earlier circle and the captured mask. It refuses the valid pattern and preserves the original document and history.
- **PASS, desktop Studio.** Four actual final scenes. The mask from (17, 5) to (29, 23) mm admits grid references (18, 10) and (18, 18) mm and excludes (10, 18) mm. The original (10, 10) mm remains. The X16 trial admits a copy at (26, 10) mm and refuses the contact with the later rectangular cavity without changing the document or history. The Y8 to Y11 History edit moves only the second copy to (18, 21) mm. Undo, Redo and fresh native Open preserve the expected cells and both original features. Eight actual rectangular-source Fill control states also passed, including History source choice and fresh Open.
- **PASS, native inspection.** The 60 × 40 × 10 mm part has one strict genus-4 shell, with three R2 apertures and one original rectangular aperture in both caps. Volume is 23,920 − 120π = 23,543.008881569225 mm³. The accepted shell has 16 faces, 24 loops, 84 coedges, 42 edges and 28 vertices. Its centroid changes from (30.24844755824295, 20.154806106283733, 5) to (30.24844755824295, 20.13879323722663, 5) mm. The two copies retain cell suffixes `@1,0` and `@1,1`.
- **PASS, affected checks.** 110 native, 51 Model and nine Studio tests. Kernel and Model type checks, focused lint, Studio production build, driver syntax and Git diff checks passed. The native tests cover an omitted colliding candidate, explicit negative spacing and an empty selection of new cells.
- **NOT_RUN.** Whole local suites, circular source Path, mobile and a new PDF qualification. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured. [#25](https://github.com/barocss/cad/issues/25) stays open.

```sh
node --test --test-concurrency=1 packages/barocss-cad/test/*cut-pattern*.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern fill-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test fill-pattern-candidate command-build-failure tool-contract-mcp
pnpm --dir apps/cad-studio build
D1909_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-fill-cut-pattern-browser.mjs "$OUT/base" --baseline
D1909_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-fill-cut-pattern-browser.mjs "$OUT/studio"
D1852_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-rectangular-cut-pattern-browser.mjs "$OUT/fill-control" --fill-three
git diff --check
```
