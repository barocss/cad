# D1751 — Sweep rectangular sections from an arc into a straight span

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `ecec57ab065b14005815b76658e07574ff32e7d2`.

Carry one bend-aligned rectangle or a centered rectangular opening through an arc followed by a forward tangent straight span. Read the rectangle's roll at the authored start, transport its axes by the exact circular rotation, and match the reverse producer's winding to the authored sides. Keep the start and end cap names, each rim's cap name, the side names and both chart bindings at the curved cap.

- **FAIL, original capability.** The two frozen desktop baselines refuse a solid rectangle and a rectangular duct on the same arc-and-line rail. Apply stays disabled and the source remains unchanged.
- **PASS, actual desktop Studio WebGPU.** A 4 × 6 mm section follows the 90° R20 bend into a 10 mm straight exit. Widen the solid to 6 × 6 mm and refuse axis contact. Change the duct opening from 2 × 4 to 2 × 2 mm and refuse an off-center opening. Undo, Redo, Save, fresh Open and a second edit reproduce the original or edited native results as requested. Both open ends, the signed radial and binormal sides, and their native edge names match the authored rectangle at both ends. All four outer and four inner duct joins read 0° in Studio. Exact local Agent approval matches manual creation.
- **PASS, native geometry.** The strict solid has genus zero, ten faces and four joints. The duct has genus one, 18 faces, 20 loops, 40 edges, 24 vertices and eight joints. Independent volume and centroid match. Kernel oracles also check inertia and non-axis-aligned profiles with either sketch axis radial, 30°/90°/120° bends, both hole windings, shifted loop starts, axis signs, named and positional sides, reversed native edge charts and exact edit/reopen identities. At the 120° R4 fixture, the maximum observed angle is 1.3871011214595926e−13 degrees, and native versus closed-form volume differs by at most 2.7284841053187847e−12 mm³.
- **PASS, controls and affected checks.** 182 kernel Sweep tests, including 25 new tests, 35 Model tests and 21 Studio tests. Scoped ESLint, kernel and Model types, full kernel library build, Studio production build, browser driver syntax and Git diff check pass. Twelve earlier kernel digests and ten earlier desktop native SHA-256 values match. Six desktop runs record 52 checkpoints with no page errors, console errors or source changes. The final source clarifies the name and comment of the private rim-name helper following the frozen browser runs.
- **FAIL, recovered harness.** The first reversed-edge test measured a copied output that had no closed-form mass cache. The final test compares the original output's closed form with native quadrature from the reversed-edge solid.
- **FAIL, inherited.** Aggregate kernel code-shape reports eight spread min/max counts in the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files. Scoped ESLint passes.
- **NOT_RUN.** Full local suites, general section roll or frame laws, additional paths, new exchange, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

| Reopened result | Volume | Native SHA-256 |
| --- | --- | --- |
| Solid, 6 × 6 mm | 1,490.9733552923253 mm³ | `5392f5d84feb68c99364c17fba8dcb232146eaaa453409ecb09db6bc40ce9f78` |
| Duct, 2 × 2 mm opening | 828.3185307179585 mm³ | `c9413ac9fed20d93a27db95f29dbcb23a8b31c3c685944f5738708fb972e5942` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. On the base with the candidate desktop drivers, append `--expect-refused` to the two `--arc-and-line` commands.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad lint
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback command-build-failure proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts \
  packages/barocss-cad/src/brep/exact-sweep.ts packages/barocss-cad/test/{exact-rectangular-arc-line-sweep,exact-arc-line-sweep}.test.mjs \
  apps/cad-studio/test/{exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep}-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1751_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/solid" --arc-and-line
D1751_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/duct" --arc-and-line
D1746_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/control-solid" --line-and-arc
D1746_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-duct" --line-and-arc
git diff --check
```
