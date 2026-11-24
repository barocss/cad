# D1934 — Draft three selected sides of a cardinal box

P5 [row 7](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md), [#14](https://github.com/barocss/cad/issues/14). Base `7e7066ac015804e62a98c82ae6b2ee5288cec42d`. FULL native geometry change.

The existing native box construction now accepts exactly three distinct transverse sides at the pull-start neutral plane, alongside its existing two adjacent sides. The six-support box qualification, signed pull transform, edge ownership, top-width checks and original tolerances remain. Two opposite sides keep the existing wedge path. The existing whole-extrusion Draft route still applies when its complete profile is selected in Studio.

- **FAIL, previous Studio.** Picked the X-high and both Y sides of the 40 × 30 × 40 mm body using the real Front, Right and Back views. The previous kernel refused the shared edge.
- **PASS, desktop Studio.** The three selected sides preview and apply at +10°. History rejects a collapse at +40° while retaining the accepted body and state. It edits to −12°, then Undo, Redo and fresh Open preserve the original faces and angle. Sixteen current checkpoints cover eight three-side and eight prior two-side states.
- **PASS, independent native geometry.** With slope (s = tan(angle)), the cross section at height (z) is ((40 − sz)(30 − 2sz)). Independent volume and first moments agree with the native and Studio measurements. Volumes are 33809.78374035432 and 68632.66988174517 mm³ at +10° and −12°. Centroids are (18.471885399,15,17.332737107) and (22.348514892,15,22.097787749) mm. The exact body has six faces, twelve edges, eight vertices and genus 0. The two shared edges, their native names, support normals and unchanged neutral corners are retained. Maximum measured edge-surface gap is 3.56e−15 mm.
- **PASS, affected checks.** All 33 focused Kernel and 19 focused Model tests, Kernel and Studio production builds, Model and Studio types, scoped ESLint and diff check. Focused native checks also cover signed negative pull, reverse pick order, cold-versus-recompute equality, exact collapse, near-collapse admission and refusals of duplicates, caps, four selected kernel faces and an off-start plane. The tests detect both the former two-face gate and a mutant that leaves the third face unturned.
- **FAIL, earlier harness attempts.** The older driver expected an obsolete zero-angle HUD string. The first adjustment matched both title and explanatory text. The final driver checks the current HUD and the exact numeric editor title.
- **NOT_RUN.** Arbitrary adjacent faces, non-box stock, curved or perforated Draft, general neutral planes, STEP for this slice, full local suites and mobile. #14 remains open. First mechanical CAD is 8/10 accepted. Whole-product completion is unmeasured.

```sh
D1934_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/baseline" --three --baseline
D1934_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/studio" --three
D1252_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/two"
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{draft-neutral-plane,drafted-extrusion,drafted-cap-offset,offset-drafted-wall}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs draft-command-pull draft-angle-binding draft-angle-feedback api-draft-pull extrude-draft-binding
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```
