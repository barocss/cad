# D1908 — Repeat an original circular through-Subtract on an XY Rectangular grid

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `cd23998f28de6b3bea7ae36ea597c75abc3190ab`.

Allow a Rectangular cut pattern to use one original circular through-Subtract followed by one original rectangular through-Subtract on the same upright rectangular stock. The signed XY Linear and Rectangular paths share the native cavity and placement checks. Every grid cell must clear the stock boundary, the later cut and every other circle. The original cavities and the row-major grid identities remain intact. The native API retains signed spacing. Studio and Model retain their positive Rectangular spacing rules.

- **FAIL, previous Studio.** The original circular source appears in the Rectangular panel. The preview refuses the exact 2 × 2 grid and preserves both original cavities.
- **PASS, desktop Studio.** Eight actual final scenes. X8/Y8 makes four circular apertures. Editing Y8 to Y14 moves only the second row from Y18 to Y24. Undo, Redo and fresh native Open preserve the expected placements and ownership. A touching circle, touching rectangle and overlapping rectangle refuse without changing the document. In a separate fixture the X-only and Y-only placements fit, and the diagonal cell contacts the later cavity and refuses the whole grid. Seven actual signed Linear control states also pass.
- **PASS, independent native inspection.** A 60 × 40 × 10 mm stock has four R2 openings and the unchanged 4 × 2 mm rectangular opening in both caps. The strict shell has genus 5, 18 faces, 28 loops, 96 coedges, 48 edges and 32 vertices. Its volume is 23,920 − 160π = 23,417.345175425635 mm³. Centroid is (30.357106116451043, 20.16636936929702, 5) mm at Y8 and (30.357106116451043, 20.10197417580149, 5) mm at Y14. A scratch-only mutation that bypasses clearance fails the diagonal collision assertion.
- **PASS, affected checks.** 104 native tests, 36 Model tests and four Studio tests. Kernel and Model type checks, focused lint, Studio production build and Git diff checks pass.
- **NOT_RUN.** Whole local suites, Fill or Path for this circular source, mobile and a new PDF qualification. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured. [#25](https://github.com/barocss/cad/issues/25) stays open.

```sh
node --test --test-concurrency=1 packages/barocss-cad/test/*cut-pattern*.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
D1908_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-rectangular-cut-pattern-browser.mjs "$OUT/base" --baseline
D1908_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-rectangular-cut-pattern-browser.mjs "$OUT/studio"
D1901_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-linear-cut-pattern-browser.mjs "$OUT/linear-control"
pnpm --dir apps/cad-studio build
git diff --check
```
