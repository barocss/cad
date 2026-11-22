# D1633 — Exact Thicken for upright circular sectors

P5, row 08, [#11](https://github.com/barocss/cad/issues/11) and [#368](https://github.com/barocss/cad/issues/368). Base `8a79fc265370047650bfdad9d9624c53d1c884f0`.

Exact cylinder Thicken accepts an additional class of open upright patches formed by one rational quadratic circular arc and one linear axial span. The stored tangent legs must have exactly equal squared lengths and the stored middle weight must round from the resulting angle ratio. The squared weight range is [1/16, 15/16], approximately 28.96° through 151.04°. The kernel checks the reconstructed controls in a binary64 arithmetic envelope before building the analytic six-face solid. The previous quarter-cylinder construction remains in use for the original admitted inputs.

- **PASS, kernel and Model.** Kernel 14/14 and Model 20/20. The 73.74° and 126.87° cases each give a strict closed solid with two coaxial skins, two radial walls and two caps. Checks cover sides, U and V reversal, source-relative face names, a one-ULP wrong weight, a shifted tangent pole and inward axis crossing. The local agent previews the 126.87° model and appends its feature after user approval. The baseline rejects the new geometry with `CAPABILITY`.
- **PASS, quarter compatibility.** SHA-256 of the serialized kernel B-rep matched the previous build in 12 cases. The comparison used the D1632 input, four U/V orientations and all three sides at 2 mm. The SHA-256 of the ordered comparison list is `47b68416f335d387747a769fd0561259d47b923c5bf46177508c3539a6d0a0bc` for both builds.
- **PASS, desktop Studio WebGPU.** Open the native 126.87° Direct patch at R10 and height 12 mm. An 11 mm inward offset is refused with Apply disabled and the document unchanged. Apply 2 mm, edit to 3 mm in history, save and open in a fresh context. Outer radius stays 10 mm, inner radius is 8 then 7 mm. Independent volume θ × 12 × (10² − inner radius²) ÷ 2 agrees within 1e−7 mm³. Native volumes are 478.28824608704895 and 677.5750152899823 mm³. Fresh Open reproduces digest `c44d4ee4616a9b03d224a31adddadc8ff4419abaa1358e199779127be18bf53e`. Review the refusal, preview and reopened screenshots. The flow checked 1,162 source files with zero changes, page errors or console errors.
- **PASS, affected gates.** Kernel build, both package type checks, scoped ESLint, generated agent tools check, browser syntax, Studio production build and Git diff check.
- **FAIL.** Zero failures in the final checks.
- **NOT_RUN.** Full local suites, WebGL2, paid live models, tilted axes, multi-span and trimmed patches. Studio-authored sketch arcs can be rounded by the Direct source writer and may fail the algebraic certificate. The workflow starts from an admitted native source. The linked issues remain open.

Use Node 22.19.0, installed desktop Playwright and Chrome, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/api-thicken.test.mjs
pnpm --dir packages/barocss-cad-model test api-thicken agent-direct-thicken toolset
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/exact-cylinder-thicken-browser.mjs
pnpm --dir apps/cad-studio build
D1633_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-thicken-browser.mjs "$OUT" --sector
git diff --check
```
