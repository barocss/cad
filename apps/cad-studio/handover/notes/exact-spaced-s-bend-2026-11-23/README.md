# D1721 — Sweep a circular disk through two bends separated by a straight span

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `567e75bd1ef963c40bce2edfed1840103ad96ec4`.

Exact Sweep accepts a circular disk on one coplanar arc–line–arc path with opposite turns. Both 30°–120° circular spans must meet the intervening straight span with a common forward tangent. Each bend radius must clear the disk. Join the two toroidal sections to a native straight cylinder and rebind the four shared half-circle edges on both incident charts.

## Verification

- **FAIL, base capability.** Studio opens the valid composite Direct rail and refuses Exact Sweep. Apply stays disabled and the accepted document stays intact.
- **PASS, desktop Studio WebGPU.** Select the Direct R12/R18 quarter bends and 8 mm straight span. Refuse a kinked rail and axis contact. Apply the Ø4 Sweep, measure all four native joint edges, edit Ø4 to Ø6 in History, use Undo and Redo, Save and open again in a fresh context. Study measures 0° at all four joints before and after fresh Open. Eleven checkpoints have zero source changes, page errors or console errors. The separate colored curve in the images is the visible Direct kink fixture.
- **PASS, native geometry.** One strict genus-zero solid has 8 faces, 8 loops, 14 edges and 8 vertices. Both planar caps have two native half-circle edges. Each interior seam binds two half-circle edges on both charts. The range of sampled normal angles stays below `7.32e-14°`. Maximum measured pcurve gap is `3.56e-15 mm`. Cross-edge curvature changes at the transitions from curved to straight faces. Native and independent mass agree with `πr² (15π + 8) mm³`, and the center-of-mass components agree with the independent bend and straight-span calculation.
- **PASS, local MCP.** Reject a mismatched Direct revision, dry-run without a write, preview a revision-pinned proposal and explicitly approve it in Studio. The approved Ø4 result equals direct creation.
- **PASS, affected checks.** 58 kernel tests, 19 Model tests and 13 Studio tests. Kernel build:fast, Kernel and Model types, scoped ESLint, Studio production build and types, browser driver syntax and Git diff check passed. The prior opposite two-arc desktop control retains its original workflow.
- **FAIL, inherited code shape check.** Existing spread/minmax counts exceed the global check in cylindrical-bore.ts, thicken-cylinder.ts and thicken-planar.ts. These are the same separate failures recorded at D1671. The changed Exact Sweep file has no new excess.
- **FAIL, initial verification.** Corrected the kernel test fixture and two readonly types. The first candidate browser driver stopped before launch because its inspector import misspelled the Model package. The final product and affected checks passed.
- **NOT_RUN.** Same-turn spaced bends, holes, rectangular sections, noncoplanar paths, downstream Boolean or Fillet, a full local suite, WebGL2, mobile and live providers. The first mechanical CAD milestone remains 8/10. Overall completion remains unmeasured. Issue #10 remains open.

| Studio stage | Diameter (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct Apply and explicit local Agent approval | 4 | 692.7072289802347 | `3d5214550aed60349b2efe1c0cd36c73c684e7d906904e940abf2fbf0a91451b` |
| History edit and fresh Open | 6 | 1558.591265205528 | `24694ac298f37987f5f2040427d52ad61eb69cfaaa309714fa35051244fcdb5d` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-line-arc-sweep,exact-tangent-sweep,exact-elbow-sweep,exact-opposite-arc-sweep,exact-rectangular-opposite-arc-sweep,exact-rectangular-opposite-arc-duct-sweep}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-arc-line-arc-sweep.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display sweep-agent-remap direct-sweep-source-ids sweep-path-history tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-spaced-s-bend-browser.mjs}
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
D1721_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/base" --expect-refused
D1721_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/verified"
D1681_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/two-arc-control"
git diff --check
```
