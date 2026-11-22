# D1750 — Sweep a circular section from an arc into a straight span

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `01699a9602226fa7a294e1f7af0e8af817d4a649`.

Accept a circular disk or a disk with one concentric bore on one circular arc followed by a forward tangent straight segment. Read the rail in the opposite direction for the existing exact producer. Keep the authored direction in the copied path, both native cap names and composite rim names. Preserve the native outward normals, stable edge IDs, and reciprocal joint chart bindings.

- **FAIL, original capability.** Two baseline desktop flows select a valid circular section and a tangent arc-and-line rail. Exact Sweep refuses both requests and preserves the sketch and copied inputs.
- **PASS, actual desktop Studio WebGPU.** A 90° R20 arc travels from `[20, 20, 0]` into the straight exit at `[-10, 0, 0]`. The solid has two native tangent edges. The tube has four. The largest measured joint angle across the two reopened examples is 2.55e−14 degrees. Refuse a skewed joint, disk contact with the bend axis, and bore contact with the outer diameter. Edit the solid from Ø4 to Ø6 and the bore from Ø2 to Ø3. Undo, Redo, Save, fresh Open and a second edit pass. Verify both open mouths, the authored start and end order in History, and the cap tokens on each rim. Local Agent approval reproduces both manual bodies.
- **PASS, native geometry.** The strict solid has genus zero and six faces. The tube has genus one, ten faces and twelve loops. Independent circular area × path length gives 520.447882187166 and 390.33591164037455 mm³ before editing. Edited reopened values are 1,171.0077349211238 and 227.6959484568852 mm³, with matching independent centroid and native quadrature. Native tests cover 30°, 90° and 120° in a translated oblique frame, stable geometry identities through edit and Open, bore edits and invalid carriers or profiles.
- **PASS, controls and affected checks.** 157 kernel Sweep tests, including nine new tests, 30 Model tests and nine Studio tests. Scoped ESLint, kernel and Model types, full kernel library build, Studio production build, browser script syntax and Git diff check pass. Ten prior kernel B-rep and mass digests and nine prior desktop native body hashes match. Six Chrome flows record 57 checkpoints and zero page errors, console errors or source changes.
- **FAIL, recovered development checks.** The initial candidate retained the reverse producer's cap token inside composite rim names. The geometry now uses the authored cap token in each rim. Two refusal fixtures used invalid Sketch parameters or hole tags and now reach the intended kernel checks.
- **FAIL, inherited.** Aggregate kernel code-shape reports eight spread min/max counts in the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files. Scoped ESLint passes.
- **NOT_RUN.** Full local suites, other arc-and-line sections, general path or frame laws, new exchange, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

| Measurement | Value |
| --- | --- |
| Reopened solid SHA-256 | `4bbfe04f16f16dfb1fa7e67b3d3a061f790992d1821680d3ed19cddd85b28886` |
| Reopened tube SHA-256 | `6345dd15a11182af843ca344eedbe8deb13cced97b866bd7dbfc46624d2284f7` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. On the base with the candidate desktop driver, add `--expect-refused` to the two `--arc-line` commands.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
pnpm --dir packages/barocss-cad lint
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback command-build-failure
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts \
  packages/barocss-cad/src/brep/exact-sweep.ts \
  packages/barocss-cad/test/{exact-arc-line-sweep,exact-tangent-sweep,exact-annular-elbow-sweep}.test.mjs \
  apps/cad-studio/test/{exact-spaced-s-bend-browser.mjs,sweep-path-geometry.test.ts}
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1750_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/disk" --arc-line
D1750_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/annular" --arc-line --annular
D1744_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/control-annular" --annular-line-arc
D1670_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/control-disk"
git diff --check
```
