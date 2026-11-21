# D1629 — Exact planar Thicken for an affine sheet

P5, row 08, [#11](https://github.com/barocss/cad/issues/11). Base `e62bddd1010b0c6faed1e255a9340075a11c314c`.

Choose **Exact planar** in the Studio Thicken Geometry field. The Part facade and the Agent's `direct-thicken` proposal accept `mode: "exact-planar"`. The saved feature keeps the selected mode. Omitted mode uses the sampled recipe and retains its existing face names. The exact mode requires a whole clamped degree-1 × degree-1 support with equal positive weights and an exact affine control net. The kernel proves the stored parallelogram with dyadic arithmetic, constructs a native prism along the support normal and validates its B-rep. Invalid exact inputs receive a capability refusal.

- **PASS, desktop Studio WebGPU.** Opened a file with a sampled plate and a separate tilted affine sheet. Selected Exact planar, previewed, applied, edited thickness from 4 to 6 mm, saved and opened the saved file in a fresh context. The copied Direct source was equal throughout.
- **PASS, independent geometry and persistence.** The exact body has eight vertices, 12 edges and six native bilinear planar faces. All corners match the analytic offsets along the unit normal (−0.8, 0, 0.6) within 1e−10 mm. Volumes 4,800.0000000000055 and 7,199.9999999999945 mm³ match 4,800 and 7,200 mm³ within 1e−8 mm³. All six names remain stable across the thickness edit. The reopened exact B-rep matches the saved digest `e553979c70167fd03eff400f191cd63195069c12e3ee6e9cd0739a880bda22d8`. The sampled body retains all 73 native face records and its original B-rep digest. Studio froze 1,161 files with zero source changes, page errors and console errors.
- **PASS, affected checks.** Kernel 8, Model 18, both type checks, scoped ESLint, Agent docs check, Studio build, browser syntax and Git diff. Kernel tests verify all three side choices, a nonunit-domain tilted and skew sheet, unequal-weight refusal and refusal of a real one-ULP non-affine control point. Model tests verify exact Agent proposal replay and native file persistence.
- **FAIL.** None in the final checks.
- **NOT_RUN.** Curved or trimmed inputs in exact mode, downstream Booleans on this new recipe, WebGL2 product run, paid live model and full local suites. #11 remains open.

Use Node 22.19.0, installed Chrome and Playwright, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/api-thicken.test.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad-model test api-thicken agent-direct-thicken toolset
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/exact-planar-thicken-browser.mjs
pnpm --dir apps/cad-studio build
D1629_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-planar-thicken-browser.mjs "$OUT"
git diff --check
```
