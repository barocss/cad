# D1682 — Sweep a concentric through-bore through the Exact S-bend

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `75cca7ac0b8c2bf9f069bc49d70a97878683b7b3`

The existing Exact S-bend accepts a circular outer section with one concentric circular hole. Build both native toroidal bends as annuli. Match the two outer half-arcs and the two inner half-arcs separately across the shared section. Require positive wall clearance at the original gluer tolerance, preserve both open end annuli and bind the four interior and exterior seam edges to their native charts. Keep a one-shell genus-one B-rep. The independent sector oracle subtracts the inner disk's area and radial second moment from the outer disk's values.

- **FAIL, base.** Studio joined the valid arcs and refused a concentric annular section. The base kernel returned its typed disk-only refusal. The separately supported standalone bends produced the expected independent volumes.
- **PASS, native geometry.** One closed shell has 10 faces, 12 loops, 20 edges and 40 reciprocal coedges. Both caps have an exterior and a bore loop. All four seam edges have canonical bindings and measured tangency. Both sides retain the original torus supports and measured signed curvature differences. The oblique untagged clockwise-bore case also passes. Eccentricity, axis contact, nonpositive or sub-tolerance wall stock, and unsupported extra holes refuse.
- **FAIL, first browser assertion.** Studio refused wall contact and retained the accepted parameter. The driver waited for the operation editor wording while the parameter panel put the original kernel reason inside Details. The final flow observes the parameter refusal and verifies that cause.
- **PASS, actual desktop Studio WebGPU.** Join the 12 and 18 mm arcs, apply diameter 4 mm with a diameter 2 mm bore, and measure all four joins. Refuse diameter 4 mm for the bore while retaining the accepted file. Edit the bore to diameter 3 mm, Undo, Redo, Save and fresh Open. Exact exterior chart hashes are unchanged across the edit. Viewport picks reach into both reopened bore mouths and the adjacent land rays hit the two original cap planes. Edit the bore back to diameter 2 mm after Open, verify the original native geometry, and Undo. Maximum sampled chart or geometric gap is 7.550e-15 mm, maximum curvature-difference error is 3.469e-16 mm⁻¹ and maximum volume deviation from the independent oracle is 5.684e-14 mm³.
- **PASS, local Agent.** The existing command advertises the supported concentric profile. Refuse the wrong path revision, dry-run on unchanged source bytes, and explicitly approve the proposal in Studio. Its accepted native result matches direct creation exactly.
- **PASS, affected checks.** Kernel 55, Model 9 and Studio 12 tests, kernel build and types, Model types, scoped lint, driver syntax, production Studio build with types, and Git diff check. The final annular and solid control runs have 15 and 12 captures. The existing solid S-bend retains all earlier volumes, native digests and topology. Both runs have zero source mutations, page errors or console errors. Temporary in-memory removal of the concentricity guard or the bore bindings fails the matching native regression.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same three kernel files as base.
- **NOT_RUN.** Full local suites, WebGL2, noncircular or offset bore construction, general rail/frame laws and live model provider. Keep #10 open.

| Studio stage | Bore diameter (mm) | Native volume (mm³) | Independent volume (mm³) | Maximum measured bore curvature jump (mm⁻¹) |
| --- | --- | --- | --- | --- |
| accepted | 2 | 444.132198049021 | 444.132198049021 | 0.141054362 |
| bore-three | 3 | 259.077115528596 | 259.077115528596 | 0.143916073 |
| reopened | 3 | 259.077115528596 | 259.077115528596 | 0.143916073 |
| bore-edited-after-open | 2 | 444.132198049021 | 444.132198049021 | 0.141054362 |
| local-approved | 2 | 444.132198049021 | 444.132198049021 | 0.141054362 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git. Use `--annular --expect-refused` on the base for the baseline.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-opposite-arc-sweep.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-offset-ring-intersect,edge-continuity,exact-arc-sweep,exact-rectangular-elbow-sweep,exact-tangent-sweep}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-s-bend-sweep-browser.mjs}
node --check apps/cad-studio/test/exact-s-bend-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1682_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/verified" --annular
D1681_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/solid-control"
git diff --check
```
