# D1822 — Offset the original outlet of a paired Exact S-bend

P5 direct face editing and native reference accuracy, rows 07, 16 and 31. [Issue #17](https://github.com/barocss/cad/issues/17). Base `a82dde7190ca8aee000be93de00104d198aac1ab`.

Extend signed Offset Face to the original `n1.end` plane on the [D1819](../exact-five-span-paired-s-bend-2026-11-24/README.md) opposite-turn five-span rectangular Sweep. Replay the original native source, move the two outlet poles in the existing straight direction, and keep the original Sweep, retained Direct rail and all fixed boundaries. Require both terminal chart pairs and all 48 internal pairs before supplying the face frame. The supported length remains at least 0.0001 mm after offset.

- **PASS — reproducible base refusal.** Actual Chrome picks the native two-opening outlet and reports that Offset Face cannot handle its multiple loops. Apply is disabled and the original document is unchanged.
- **PASS — native preservation and independent volume.** The outlet normal stays +X in the fixture. The inlet, both bends, spacer, passage names and ownership, all 48 internal tangent joins and their charts reproduce exactly. The offset keeps 62 faces, 66 loops, 264 coedges, 132 edges and 72 vertices in one genus-two shell. The 32 mm² net section adds or removes a straight slice. Independent signed material moments match the native centroid. Oblique signs and angular order, wrong face, stale source, missing charts and the existing minimum length are covered by kernel checks.
- **PASS — actual Studio and local Agent.** Apply +4 mm, refuse −6 mm before the straight outlet disappears, apply −4 mm and save and reopen. Drag the restored handle from −4 to −5 mm, cancel once, then commit. Undo, Redo and fresh Open reproduce the accepted geometry. The handle travels 13.24958486482501 CSS px. Its initial gap to the projected cap is 0.000018852655050194844 px. The local Agent dry run, proposal preview and explicit Studio Accept reproduce the −4 mm body. The existing arc–line outlet control reproduces its D1805 outward and re-opened drag hashes. New and control runs have 26 checkpoints and zero source changes or browser errors.
- **PASS — affected checks.** 62 Kernel, 106 Model and 7 Studio tests. Kernel library build, types, scoped ESLint, Studio production build, driver syntax and Git diff check pass.
- **FAIL — corrected affected test.** The first Model run exposes a stale zero-distance message expectation in a box Offset test. The current typed refusal was introduced in `21e694539` and remains authoritative. The revised test checks its value code and signed-distance message. All 106 tests then pass.
- **FAIL — inherited code-shape gate.** The three unchanged spread-minmax overages remain in cylindrical-bore, thicken-cylinder and thicken-planar.
- **NOT_RUN.** Pending Agent images for the new outlet Offset, the five-span inlet and general face editing, full local suites, alternate backends, STEP, mobile and live providers. #17 remains open for its broader direct-editing contract. First mechanical CAD remains 8/10 accepted and overall CAD completion remains unmeasured.

| Signed outlet offset | Outlet X (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | --- | --- | --- |
| +4 mm | 40 | 2403.9644737231006 | `f5b0a1c7abdcd7c7b23f5fb7899da8e0a9d205b7263bd6f1c69123d1038ca52f` |
| −4 mm | 32 | 2147.9644737231 | `d8b4a0e6fb4911b69e69f43a2fa2d90a901daff51567465d1e904d3b754e50b3` |
| −5 mm | 31 | 2115.9644737231 | `8353d5f41718142f20db2248921dfae295ba69edcefb475fce47df98d4505214` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output. Set `RAIL_FILE` to the native applied document from the D1819 Studio driver to retain the original Direct source in the new test.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle paired-elbow-outlet-offset-evidence offset-face-native native-offset-face feature-handles toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1822_SOURCE_FROZEN=1 D1790_RETAINED_RAIL="$RAIL_FILE" node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/studio" --s-bend
D1805_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control" --arc-first
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
