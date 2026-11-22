# D1634 — Exact cylinder Thicken from a Studio sketch

P5, row 08, [#11](https://github.com/barocss/cad/issues/11) and [#368](https://github.com/barocss/cad/issues/368). Base `97a9803b083ba6a4172dd83de94c2c9c10b0a57b`.

Retain the signed quarter-turn bulge when Centre arc records a 90° sweep. Make curves derives the tangent pole algebraically for a representable open two-point XY quarter arc, verifies exact equal perpendicular radial vectors, and writes its coefficients at round-trip precision. Duplicate, Move, native Ruled and Exact Thicken use their existing commands.

- **PASS, baseline reproduction.** At the base commit the rounded quarter bulge produced tangent pole (29.999999994, 29.999999994) and weight 0.707106782. The existing Move and Ruled actions built the source, then Exact cylinder returned `CAPABILITY` for the noncanonical weight.
- **PASS, focused Model 5/5.** Source compilation preserves the exact three poles and middle weight 0.7071067811865476. Signed cardinal and noncardinal dyadic quarter cases, the legacy source writer, and native reopen of the rounded document are covered. Both signed arc directions build strict six-face B-reps after Duplicate, vertical Move and Ruled.
- **PASS, desktop Studio WebGPU.** Use New part and draw Centre arc through centre (20, 20), start (30, 20), and end (20, 30). Use Make curves, Duplicate, Move ΔZ 12 mm and Ruled surface. The native inspector verifies both rails and the original retained source, plus the rational degree 2 × 1 surface. The 10 mm inward offset is refused without editing the document. Apply at 2 mm, edit to 3 mm in history, save and open in a fresh context. Review the sketch, Ruled surface and reopened result.
- **PASS, native boundaries and volume.** One strict closed solid with eight vertices, twelve edges and six named faces. Outer radius 10 mm, inner radius 8 then 7 mm. Studio and native volumes match 108π and 153π mm³ within 1e−7 mm³. Native values are 339.29200658769787 and 480.6636759992388 mm³. Fresh Open reproduces the native digest `b33eafafaac4210e92cc0e02ea6fe560a02f8d1b35a11b5f22364891312b4cbb`. Studio checked 1,162 source files with zero changes, page errors or console errors.
- **PASS, affected checks.** Model type check, scoped ESLint, Studio build, browser-driver syntax and Git diff check.
- **FAIL, initial Studio driver setup.** The first driver assumed the startup document was blank. The corrected driver used New part and completed the authored workflow.
- **NOT_RUN.** Full local suites, WebGL2, arbitrary sketch angles, tilted and multi-span cylinder patches, and paid live models. Existing saved rounded curves retain their original coefficients. The linked issues remain open.

Use Node 22.19.0, installed desktop Playwright and Chrome, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model test sketch-arc-canonical-source
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-cylinder-thicken-browser.mjs
D1634_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-thicken-browser.mjs "$OUT" --authored
git diff --check
```
