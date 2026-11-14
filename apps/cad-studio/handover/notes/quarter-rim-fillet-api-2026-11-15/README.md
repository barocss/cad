# D1274 — Author a quarter-rim fillet from TypeScript

2026-11-15 · FULL · P5, row 07 · [Fillet family #12](https://github.com/barocss/cad/issues/12)

Both `@barocss/cad/api` and `@barocss/cad-model/api` now accept two endpoint radii on the qualified convex 90° circular rim. The facade checks the selected body's native edge, cap, coaxial cylinder, outward radial end planes, and absence of tangent continuation. It keeps the native endpoint order. The Model backend resolves matching names on the selected body.

- **PASS — desktop Studio.** Opened a `.bcad` file authored through the Model TypeScript API. History changed the far radius from 1.2 mm to 1.5 mm while retaining 0.6 mm at the near end. Undo and Redo restored the matching documents. Native Save and fresh Open restored identical edited geometry. Reviewed the opened, edited, and reopened WebGPU frames.
- **PASS — independent geometry.** Both TypeScript backends and Studio agree with expected volumes of 500.4505310301965 and 499.60278298167606 mm³ on the radius-8 mm, height-10 mm sector. Maximum volume error was 2.613e-7 mm³. Maximum interior section residual was 4.686e-8 mm. Maximum end-trim residual was 1.184e-11 mm. Strict B-rep validation reported one closed solid.
- **PASS — regression checks.** Kernel and Model type checks, the Kernel fast build, the Studio production build, code shape, and focused lint passed. 33 Kernel tests and 16 Model tests covered straight and curved admission, parameter binding, codec reopen, and refusal of a closed rim. The Kernel also refused a 60° rim and a reversed selector record. See the commands below.
- **FAIL, corrected.** Both public facades initially refused the quarter rim. An intermediate test attempted to reopen the consumed source body key. The final test selects the body produced by the fillet.
- **NOT_RUN.** Full suites, mobile, paid AI, broader circular profiles, multi-edge chains, nonradial ends, and noncircular sections. The wider fillet issue remains open.

## Commands and evidence

Node 22.19.0. The gate serialized the heavy commands. The Studio run recorded no page or console errors and no source changes. Receipt SHA-256 `570cf0304f1eec521c75d367e49510ae0f56e5c9e2b3194163dc1d6e9f422f6a`.

```sh
D1274_SOURCE_FROZEN=1 node apps/cad-studio/test/api-quarter-rim-fillet-browser.mjs <external-evidence>
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast)
(cd packages/barocss-cad && node --test --test-concurrency=1 test/api-variable-fillet.test.mjs test/open-circular-variable-fillet.test.mjs test/r10-5.test.mjs test/r10-5b.test.mjs test/r11-1c.test.mjs test/edge-finish.test.mjs)
pnpm --filter @barocss/cad-model test api-variable-fillet fillet-interior-station filletNames
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build --outDir <external-evidence>
node packages/barocss-cad/scripts/code-shape.mjs --check
pnpm exec eslint packages/barocss-cad/src/blend/edge-finish.ts packages/barocss-cad/src/api/{part,spec,kernel}.ts packages/barocss-cad-model/src/api/studio.ts packages/barocss-cad-model/test/api-variable-fillet.test.ts
git diff --check
```

D1275 proceeds to two independently editable Loft guide curves.
