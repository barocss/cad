# D1746 — Sweep rectangular sections from a straight span into an arc

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `0d179179d0d464c29b360f98e89cee74d8b4b0de`.

Support one bend-aligned solid rectangle or a centered rectangular opening on a straight span followed by a tangent circular arc. The prism and revolved bend share the native section. Bind the terminal rectangle and its optional opening to the bend walls and the affine end-cap chart. Studio and local Agent guidance list the supported sections.

- **PASS, original Studio refusal.** Exact preview refuses both rectangles on a 10 mm straight span followed by an R20 quarter arc. Apply stays disabled and the original sketch and Direct path remain intact.
- **PASS, production desktop Studio WebGPU.** Increase the solid width from 4 to 6 mm and refuse axis contact. Narrow the duct opening from 2 × 4 to 2 × 2 mm and refuse an off-center opening. Confirm native terminal chart bindings and both mouth sight lines. Undo, Redo, Save and fresh Open pass. A second sketch edit after Open restores each original native digest. Local Agent dry runs and explicit Studio approval match manual geometry. The reopened solid has 1,490.9733552923253 mm³ and native SHA-256 `89cd28e0f7b3033e611423a01a5323945aed3025db30cbd7fdc226ed361f36de`. The reopened duct has 828.3185307179585 mm³ and native SHA-256 `fe3bb1385bf46d2f01662d3539b50ed6540ac0fa41d5b138bff0d44c65705c44`. Six Chrome runs, including the two earlier rectangular elbow controls, record 48 checkpoints and zero source changes or browser errors.
- **PASS, native geometry.** The 4 × 6 mm solid has one genus-zero shell, ten faces and four 0° native joins. The 4 × 6 mm duct with a 2 × 4 mm opening has one genus-one shell, 18 faces, 20 loops, 40 edges, 24 vertices and eight 0° joins. Independent section area × path length gives 993.9822368615503 and 662.6548245743669 mm³. Native quadrature differs by 3.41e−13 and 1.59e−12 mm³. Both terminal chart directions agree with the canonical edges, including the opening loops. Maximum standard-fixture chart gap is 1.066e−14 mm. The kernel checks also cover 30° and 120° oblique fixtures, both hole windings, reversal of native chart directions, exact edit and reopen identity, and invalid wall, axis, roll and path inputs.
- **PASS, affected checks.** 148 kernel Sweep tests, including seven new tests. Source ESLint, full kernel type check, full kernel library build, 28 Model and 21 Studio tests, Model type check, Studio production build, and Git diff check. Four prior native SHA-256 values match for circular and annular line-and-arc and solid and hollow rectangular line–arc–line profiles.
- **FAIL, recovered development checks.** The admission-only version lacked terminal cap chart bindings. The first broad kernel run also used an old assertion that expected a supported rectangle to fail. The terminal binder and the unsupported triangle control resolve these failures.
- **FAIL, inherited.** Aggregate kernel code-shape reports eight spread min/max counts in the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files. Scoped ESLint passes.
- **NOT_RUN.** Full local test suites, general Sweep frame laws, additional section families, new exchange, WebGL2, mobile and paid providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external evidence directories. The original two Studio runs use the base kernel with the candidate test drivers and append `--expect-refused`.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad lint
D1746_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/solid" --line-and-arc
D1746_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/duct" --line-and-arc
D1674_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/control-solid"
D1675_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-duct"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback command-build-failure proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts \
  packages/barocss-cad/src/brep/exact-sweep.ts \
  packages/barocss-cad/test/{exact-rectangular-line-arc-sweep,exact-tangent-sweep}.test.mjs \
  apps/cad-studio/test/{exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep}-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
