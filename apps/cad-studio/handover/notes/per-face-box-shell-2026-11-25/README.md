# D1938 — Set the thickness of each wall of a box with its top open

P5 [row 7](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md), [#13](https://github.com/barocss/cad/issues/13). Base `6633fea42abcd4d7c3edb1ccbcb644fbcf09ecaf`. FULL native geometry change.

Shell offers Per face when the original top of one upright cardinal box extrusion is selected. The operation stores all five positive thicknesses by exact native face name, with the opening name and all six planar signatures. The native evaluator certifies the original box and subtracts one rectangular cavity with no roof. The original top remains a ring. Each of the five inner supports retains the corresponding source name under the new feature. The existing Uniform operation remains available.

- **PASS, desktop Studio.** A 40 × 30 × 20 mm box accepts side walls of 2 mm and a 4 mm floor. History rejects combined left and right thicknesses that leave zero cavity width, with the previous body, document and History retained. The accepted left, right and back edit creates an asymmetric cavity. Undo and Redo restore exact documents. Save and fresh Open retain the same native result, followed by a working 5 mm floor edit and Undo. Six current scenes passed review. The previous desktop build exposed one uniform Wall input for the same selection. The existing Uniform Closed, Top and Bottom History flow also passes.
- **PASS, independent geometry.** Outer volume is 24000 mm³. Inner ranges in the three accepted states are [2,38] × [2,28] × [4,20], [3,35] × [2,26] × [4,20] and [3,35] × [2,26] × [5,20] mm. Expected solid volumes are 9024, 11712 and 12480 mm³. Studio Worker and native results match volume and centroid against rectangular subtraction within 1e−7 mm³ and 1e−7 mm. Each result has 11 planar faces, 12 loops, 24 edges, 16 vertices and one strict genus-0 shell. The original top has two loops. The native test also confirms all 48 stored pcurves and a valid wall thicker than half the box width when the opposing wall leaves room.
- **PASS, saved operation and affected checks.** The new `shell-walls` recipe uses schema 3. A reader compiled from the pinned previous source reads the legacy Uniform Shell and explicitly refuses the actual new Studio-saved file. The current reader refuses missing original signatures. Native checks reject swapped cardinal signatures, unmatched wall names and non-box stock. 17 Kernel, five Model and 57 Studio tests, Kernel and Studio production builds, Model and Studio types, scoped ESLint and diff check pass.
- **FAIL, corrected intermediate checks.** The first compile exposed two source narrowings and an unregistered refusal code. Studio types then required narrowing an existing parameter-height update to Fillet and Chamfer before replacing signatures. The first Chrome run successfully applied the feature but the driver waited for the wrong error text. The final Studio editor shows the specific cavity error and the driver verifies it directly.
- **NOT_RUN.** General slab Shell, freeform geometry, multiple openings, per-face side openings, Agent authoring, actual Studio STEP of the new recipe, full local suites and mobile. #13 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1938_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/studio"
SHELL_OPENING_HISTORY_SOURCE_FROZEN=1 node apps/cad-studio/test/shell-opening-history-browser.mjs "$OUT/uniform-control"
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{part-shell-walls,prismatic-cap-identity,prismatic-solid}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs shell-walls shell-opening-history
node apps/cad-studio/scripts/test.mjs shell-opening-history parameter-height-finish
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The old source Studio run uses the new driver with `--baseline`. The previous reader check bundles `engine/migrate.ts` from the pinned source and opens the legacy Uniform document and actual new Studio file. Test scenes and receipts stay outside Git.
