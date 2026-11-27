# D2107 — Choose the inner corner of a closed L Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `117170ca9b9f69e298048b61444c258e36662745`.

Uniform Shell offers Default, Sharp and Round for a closed, original upright orthogonal L extrusion. The shared exact profile check admits six straight edges and one concave corner. The explicit modes select the existing native slab producer with either sharp or arc joins. Default omits the optional join and takes the original route. The mode is available in History and the shared Model command contract.

## Verification

- **PASS, desktop baseline.** Chrome WebGPU confirms the command has no corner choice. Applying a 2 mm wall to the original 40 × 30 × 20 mm L prism writes no join and produces the 6,610.265482457439 mm³ default. The retained file reopens in the candidate with the identical native B-rep SHA-256 `24096dc2d7d70b12de98b95847e79052dc930f5bcbff0c1e796fc2c8b522ba9c`.
- **PASS, actual desktop candidate.** Sharp previews and cancels with the source and Undo state preserved. Sharp applies at 2 mm. History refuses 5 mm and shows the strict upper bound. Reset and a Round edit succeed. Undo, Redo, native Save and fresh Open preserve the selected mode and exact rebuilt B-rep. The two recorded WebGPU sections at Z = 10 mm show the squared and rounded cavity corners. Baseline and candidate freeze 1,269 and 1,270 files respectively with zero changed sources, page errors or console errors in their passing runs.
- **PASS, independent native geometry.** For wall `t`, the reference subtracts the orthogonal inset area times `20 − 2t` from the original 12,000 mm³. The Round cavity adds `t²(1 − π/4)` to the inset area. At 2 mm, volumes are 6,624 and 6,610.2654824574365 mm³. The native values match within 4 × 10⁻¹² mm³. Sharp has 16 faces and Round has 17. Both are watertight single solids with one cavity. Round adds a rational cylindrical face of radius 2 mm. The independent ray parity witness at (8.4, 8.4, 10) mm is in material for Sharp and in the cavity for Round. Native controls verify reversed loops, authored tags, a shifted 3 mm wall case, and unchanged hashes for both original Default routes.
- **PASS, affected checks.** 47 Kernel, 34 Model and 54 Studio tests pass. Kernel emit, Kernel/Model/Studio types, scoped ESLint, syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected checks.** The first desktop baseline used the completion wait as if it returned a document. Reading the accepted document explicitly fixed the test. The first Model type check inferred an optional undefined key across the default value variants. The explicit `Values` return type fixes it. Desktop, affected types and build then pass with the final source.
- **NOT_RUN.** Open-face or per-face explicit corner joins, other stock families, older readers opening a new explicit join, a live Agent task, full local suites and mobile. [#13](https://github.com/barocss/cad/issues/13) stays open for wider Shell geometry. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for each desktop flow and the affected checks.
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/baseline-final" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
SHELL_CORNER_FROZEN=1 node apps/cad-studio/test/shell-corner-browser.mjs "$OUT/candidate-final" "$OUT/baseline-final/legacy-round-native-doc.bcad"
node --test --test-concurrency=1 packages/barocss-cad/test/{r11-1,r11-1b,r11-1c,box-shell,capsule-shell,part-shell-walls,part-adjacent-shell-walls,part-opening-pair-shell-walls,part-tube-shell-walls,part-closed-l-shell-join,api-part}.test.mjs
pnpm --dir packages/barocss-cad-model test shell migrate toolset tool-contract
pnpm --dir apps/cad-studio test shell toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
