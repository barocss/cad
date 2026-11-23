# D1824 — Offset the original inlet of the paired Exact S-bend

P5, rows 07, 16 and 31. [Issue #17](https://github.com/barocss/cad/issues/17). Base `b45a65d181223e566f591a882282efc381e9c50a`.

Extend signed Offset Face to the original `n1.start` on the [D1819](../exact-five-span-paired-s-bend-2026-11-24/README.md) paired five-span Sweep. Move only the first two authored poles of the evaluated path. Keep the source Sweep and its retained Direct rail. Require the original native body to reproduce before moving the inlet. Keep the outlet, both bends, spacer, 49 fixed faces, both separate passages and all 48 charted tangent joins. Require at least 0.0001 mm of straight inlet after the edit.

- **FAIL — reproduced on the base.** Desktop Studio picks the original two-opening inlet and reports that Offset Face does not support multiple loops. Apply is disabled. The source document stays intact.
- **PASS — native geometry.** +4 mm extends the inlet along its outward normal (−X in the fixture). −4 mm shortens it. The 32 mm² net section predicts changes of +128 and −128 mm³. The original volume is 2275.9644737230983 mm³. The signed closed-form centroid agrees with the native measure. Both mouths retain their owners and charts. Counts stay at 62 faces, 66 loops, 264 coedges, 132 edges and 72 vertices in one genus-two shell. The focused cases cover an oblique frame, both turn orderings and physical signs, stale geometry and charts, and the minimum straight length.
- **PASS — desktop Studio and local Agent.** Apply +4 mm, refuse −10 mm without an edit, apply −4 mm in History and reload the saved document. The restored handle moves the inlet to −5 mm. Cancel leaves the saved geometry and History intact. Apply, Undo, Redo, typed parity and a second fresh Open match the native result. Local MCP dry run, proposal preview and explicit Studio Accept match the −4 mm edit while preserving the original rail. The handle travels 13.24958486482501 CSS px. Its original gap to the cap projection is 0.000059282362182145304 px. The old three-span inlet control matches its earlier native hashes. The two candidate runs have 26 checkpoints and zero browser errors or source changes.
- **PASS — affected checks.** 64 Kernel, 111 Model and 7 Studio tests. Kernel library build, three package type checks, scoped ESLint, Studio production build, browser driver syntax and Git diff check pass.
- **FAIL — corrected test boundary.** The initial Model assertion expected a build-time throw for a collapsed inlet. Model builds the edit and the native evaluator refuses it. The revised test checks the evaluated refusal; the affected suite then passes.
- **FAIL — inherited code-shape gate.** The spread-minmax overages remain in unchanged cylindrical-bore, thicken-cylinder and thicken-planar files.
- **NOT_RUN.** Two pending Agent review images for the five-span inlet, full local suites, other rendering backends, STEP, mobile and live providers. #17 stays open for the wider direct-editing contract. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

| Signed inlet offset | Inlet X (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | --- | --- | --- |
| +4 mm | -14 | 2403.9644737230947 | `8d2f775666c811070318a090fc10f7cf7e62cb0f7a00b9739576aa75ac60d4da` |
| −4 mm | -6 | 2147.964473723098 | `ed5dfd1fcd403e87e6c45edfef6990267aa0d45081bebe426977be36aa56b539` |
| −5 mm | -5 | 2115.9644737230974 | `0b9370a0acd13b69e1fcad327784e1a3e001f16418cab1e9294e5df608b990b8` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output. Set `RAIL_FILE` to the applied native D1819 Studio result. The base reproduction uses `--s-bend --inlet --expect-refused` with the same rail. Put the browser driver's five-span inlet option on the base without applying the Kernel or Model change.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle paired-elbow-outlet-offset-evidence offset-face-native native-offset-face feature-handles toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1824_SOURCE_FROZEN=1 D1790_RETAINED_RAIL="$RAIL_FILE" node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/studio" --s-bend --inlet
D1808_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control" --inlet
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
