# D2093 — Read the native topology evolution of a coordinate-plane Split

P5 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#3](https://github.com/barocss/cad/issues/3) · Base `9f533d1c17abd041f0a86a08d4e094c50e65b4c3`.

The public kernel exposes `splitTopologyEvolutionOf(snapshot, featureId)` and `resolveSplitTopologySource(receipt, source, side?)`. The getter reads the evaluated prefixes of a coordinate-plane Split and its direct original zero-draft rectangular extrusion. It qualifies the source and both actual native boxes with the same exact cardinal-box proof used for Shell, then identifies each native image by its exact support or line. The ordinary Split producer, geometry and saved format keep their existing paths.

Each side reports retained, modified and deleted original faces and edges. It lists the generated cap and its four boundary edges with native output body and entity IDs. A one-to-many source returns `ambiguous` without a side. Choosing a resolved side returns one exact image or `deleted`. An unknown source returns `unmatched`. A validated receipt belongs to its evaluated snapshot and current geometry. Rebuild the receipt from the reopened document. The public resolver requires the original immutable receipt.

## Verification

- **PASS, baseline.** Desktop Chrome WebGPU authors the X=9 mm Split of a 24×16×10 mm extrusion. The two strict native outputs pass the independent corner and volume checks. The topology evolution API is absent at the base commit.
- **PASS, desktop and native candidate.** The same Split previews and applies, and History changes the plane from X=9 to X=12 mm. Undo and Redo restore the two authored states. X=24 mm is refused and leaves the accepted file intact. Actual Save and fresh Open retain X=12 and reproduce the same native IDs and receipt. The candidate freezes 1,265 files and records zero source changes, page errors or console errors.
- **PASS, independent source and results.** The X=9 outputs have 1,440 and 2,400 mm³. The X=12 outputs each have 1,920 mm³. Volume sums to 3,840 mm³. Each result has six faces, twelve edges and eight exact corners. The two generated caps have opposite normals at the selected station. All 18 source face and edge IDs, all per-side images and both generated groups match the actual native outputs. The original top is ambiguous across sides and unique on the requested negative side. The original X-min face is deleted on the positive side. A foreign ID is unmatched.
- **PASS, native controls.** The affected suite also checks the other coordinate axes, shifted stock, parameter edits, downstream feature consumption, saved-data replay, unsupported source and plane, changed native names or topology and fabricated receipts. Native geometry remains unchanged by a receipt read.
- **PASS, affected checks.** Kernel emit, 42 Kernel tests, 66 Model tests, five Studio tests, scoped ESLint, Kernel/Model/Studio type checks, driver syntax, diff checks and Studio production build on Node 22.19.0.
- **FAIL, corrected oracle.** The first kernel harness run distinguished −0 and +0 in a cap normal. The corrected geometric comparison passes all seven focused native tests and the affected suite.
- **NOT_RUN.** General topology naming, oblique and curved receipt families, full local suites, mobile and live providers. Existing Split geometry for other supported inputs remains available. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run desktop and affected build commands under the heavy gate.
SPLIT_TOPOLOGY_EVOLUTION_FROZEN=1 node apps/cad-studio/test/split-topology-evolution-browser.mjs "$OUT/baseline" --baseline
SPLIT_TOPOLOGY_EVOLUTION_FROZEN=1 node apps/cad-studio/test/split-topology-evolution-browser.mjs "$OUT/candidate"
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{split-topology-evolution,facet-split,api-part,api-verbs,boolean-face-sources}.test.mjs
pnpm --dir packages/barocss-cad-model test split-history-plane split-output-side split-normal-components references
pnpm --dir apps/cad-studio test split-source-receipt split-dependent-hole-feedback
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
