# D1723 — Carry a concentric bore through the spaced S-bend

P5 modeling and kernel, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `3a106eeb8051cbbf6401563927c5b982c3505140`.

Carry a circular outer profile and one concentric through-bore along the D1721 R12/R18 opposite quarter bends and 8 mm straight span. Bind the two half-circles of each wall on both sides of each join. Verify the straight section and both bends agree on wall ownership before accepting their shared boundaries. Keep both annular end caps.

## Verification

- **FAIL, base capability.** Studio opens the valid spaced rail and concentric annulus. Exact Sweep requires a disk, keeps Apply disabled, and preserves the loaded document.
- **PASS, desktop Studio WebGPU.** Apply a Ø4 mm outer profile with a Ø2 mm bore. Refuse wall contact. Increase the bore to Ø3 mm while preserving every outer native surface. Undo, Redo, Save and fresh Open pass. Study displays 0° at all eight native inner and outer joint edges. The center rays from Front and Back pass their respective cap planes and reach the curved interior at Y6.164918 and Y22.497254 mm. The adjacent rim rays land on the cap planes at Y0 and Y30 mm. Restoring the Ø2 bore after Open reproduces the original native hash. Fifteen checkpoints have zero source changes, page errors and console errors.
- **PASS, native geometry.** The strict solid is genus 1 with 14 faces, 16 loops, 28 edges and 16 vertices. Both openings have one outer and one inner loop. All eight half-circle seams have reciprocal pcurve uses on the correct native walls. Minimum wall is 1 mm at Ø2 and 0.5 mm at Ø3. Maximum sampled gap is `1.79e-15 mm` and maximum normal angle is `7.32e-14°`. Native volume and center of mass agree with the independent profile-area and composite-path calculations. Both bend axes keep positive clearance.
- **PASS, local MCP.** Discover the concentric input, reject an outdated curve revision, dry-run without a write and require explicit Studio approval. The approved Ø2 bore produces the same native body as direct creation.
- **PASS, affected checks.** Kernel build:fast, kernel and Model types, scoped lint, Studio production build and types, driver syntax and Git diff check. Twenty final kernel tests and 69 earlier unaffected tests pass. There are 19 Model and 13 Studio test passes. The D1721 disk control retains both previous native body hashes in desktop Studio.
- **FAIL, recovered dispatch regression.** The kernel regression suite found a three-arc capability diagnostic introduced by D1721. An external loader reproduced it on the base. The arc–line–arc recognizer now requires the middle straight-span weights before dispatch. The affected arc and arc–line–arc suites pass again.
- **FAIL, inherited code shape check.** The global check still reports the three prior files cylindrical-bore.ts, thicken-cylinder.ts and thicken-planar.ts. The changed Sweep file has no new excess.
- **NOT_RUN.** Separate Studio refusal flows for nonconcentric or multiple bores, arbitrary profiles or frames, downstream Boolean and Fillet, full kernel build and full local suite, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion is unmeasured. Issue #10 remains open.

| Studio stage | Bore diameter (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| Direct Apply, restored bore and explicit Agent approval | 2 | 519.5304217351761 | `5980d05cc24532c0877e618260e7b47166cf937d58b45da522f6ea82561050e1` |
| Edited and fresh Open | 3 | 303.0594126788527 | `43dd6aa69092db0e1ed2491764c76ee12531debe3390efb543280bd2c97db6c7` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-line-arc-sweep,exact-opposite-arc-sweep,exact-tangent-sweep,exact-elbow-sweep,exact-arc-sweep,exact-straight-sweep,exact-closed-circle-sweep,exact-rectangular-opposite-arc-sweep,exact-rectangular-opposite-arc-duct-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-arc-line-arc-sweep.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display sweep-agent-remap direct-sweep-source-ids sweep-path-history tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-spaced-s-bend-browser.mjs
D1723_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/base" --annular --expect-refused
D1723_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/verified" --annular
D1721_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/disk-control"
git diff --check
```
